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
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=3&countrycodes=br&accept-language=pt-BR`;
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

// Filtra resultado para garantir que está dentro do estado de SP
function dentroDeSP(lat, lng) {
  // Bounding box aproximado do estado de SP
  return lat >= -25.3 && lat <= -19.7 && lng >= -53.2 && lng <= -44.2;
}

app.get('/geocode', async (req, res) => {
  const { q, numero, bairro, cidade, uf, cep } = req.query;
  if (!q) return res.status(400).json({ error: 'Parametro q obrigatorio' });

  const cidadeSA = cidade ? removeAcentos(cidade) : '';
  const bairroSA = bairro ? removeAcentos(bairro) : '';
  const ufStr = uf || 'SP';

  // CEP com zero à esquerda
  let cepFmt = '';
  if (cep) {
    cepFmt = cep.replace(/\D/g, '');
    while (cepFmt.length < 8) cepFmt = '0' + cepFmt;
  }

  // Monta tentativas em ordem de precisão
  const tentativas = [];

  // 1. Endereço completo com cidade (evita pegar cidade errada)
  if (q && cidadeSA) {
    tentativas.push(`${removeAcentos(q)}${numero ? ' ' + numero : ''}, ${cidadeSA}, ${ufStr}, Brasil`);
    tentativas.push(`${removeAcentos(q)}, ${cidadeSA}, ${ufStr}, Brasil`);
  }

  // 2. CEP direto
  if (cepFmt.length === 8) {
    tentativas.push(`${cepFmt}, Brasil`);
  }

  // 3. Bairro + cidade
  if (bairroSA && cidadeSA) {
    tentativas.push(`${bairroSA}, ${cidadeSA}, ${ufStr}, Brasil`);
  }

  // 4. Só cidade como fallback
  if (cidadeSA) {
    tentativas.push(`${cidadeSA}, ${ufStr}, Brasil`);
  }

  for (const query of tentativas) {
    if (!query || query.length < 5) continue;
    const result = await buscarNominatim(query);
    if (result && dentroDeSP(result.lat, result.lng)) {
      result.query_used = query;
      return res.json(result);
    }
    await sleep(1200);
  }

  res.json({ found: false, query: q });
});

app.listen(PORT, () => {
  console.log(`Copeli Roteirizador API rodando na porta ${PORT}`);
});
