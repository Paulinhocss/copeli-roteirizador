const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'Copeli Roteirizador API' });
});

function removeAcentos(str) {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function buscarNominatim(query, tentativa=1) {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1&countrycodes=br&accept-language=pt-BR`;
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'CopelliRoteirizador/1.0 (contato@copeli.com.br)',
        'Accept-Language': 'pt-BR,pt'
      }
    });
    if (response.status === 429) {
      if (tentativa <= 3) { await sleep(3000 * tentativa); return buscarNominatim(query, tentativa + 1); }
      return null;
    }
    const data = await response.json();
    if (data && data.length > 0) {
      return { found: true, lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon), display: data[0].display_name };
    }
  } catch (err) {
    if (tentativa <= 2) { await sleep(2000); return buscarNominatim(query, tentativa + 1); }
  }
  return null;
}

app.get('/geocode', async (req, res) => {
  const { q, bairro, cidade, uf, cep } = req.query;
  if (!q) return res.status(400).json({ error: 'Parametro q obrigatorio' });

  const tentativas = [];
  const cidadeSA = cidade ? removeAcentos(cidade) : '';
  const bairroSA = bairro ? removeAcentos(bairro) : '';
  const ufStr = uf || 'SP';

  // CEP com zero à esquerda
  if (cep) {
    let cepLimpo = cep.replace(/\D/g, '');
    while (cepLimpo.length < 8) cepLimpo = '0' + cepLimpo;
    if (cepLimpo.length === 8) {
      tentativas.push(`${cepLimpo}`);
      tentativas.push(`CEP ${cepLimpo}, ${cidadeSA}, Brasil`);
    }
  }

  // Bairro + cidade
  if (bairro && cidade) {
    tentativas.push(`${bairroSA}, ${cidadeSA}, ${ufStr}, Brasil`);
    tentativas.push(`${bairroSA}, ${cidadeSA}, Brasil`);
  }

  // Cidade
  if (cidade) tentativas.push(`${cidadeSA}, ${ufStr}, Brasil`);

  // Query original como fallback
  const qSA = removeAcentos(q);
  if (!tentativas.includes(qSA)) tentativas.push(qSA);

  for (const query of tentativas) {
    if (!query || query.length < 4) continue;
    const result = await buscarNominatim(query);
    if (result) { result.query_used = query; return res.json(result); }
    await sleep(1500);
  }

  res.json({ found: false, query: q });
});

app.listen(PORT, () => {
  console.log(`Copeli Roteirizador API rodando na porta ${PORT}`);
});
