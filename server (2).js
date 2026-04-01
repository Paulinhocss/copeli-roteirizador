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

function expandirAbrev(rua) {
  return rua
    .replace(/^R\s+/i, 'Rua ').replace(/^RUA\s+/i, 'Rua ')
    .replace(/^AV\s+/i, 'Avenida ').replace(/^AV\.\s+/i, 'Avenida ')
    .replace(/^AL\s+/i, 'Alameda ').replace(/^AL\.\s+/i, 'Alameda ')
    .replace(/^EST\s+/i, 'Estrada ').replace(/^TV\s+/i, 'Travessa ')
    .replace(/^PC\s+/i, 'Praca ').replace(/^PCA\s+/i, 'Praca ')
    .replace(/^ROD\s+/i, 'Rodovia ');
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
    // Se rate limited, espera mais e tenta de novo
    if (response.status === 429) {
      if (tentativa <= 3) {
        await sleep(3000 * tentativa);
        return buscarNominatim(query, tentativa + 1);
      }
      return null;
    }
    const data = await response.json();
    if (data && data.length > 0) {
      return { found: true, lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon), display: data[0].display_name };
    }
  } catch (err) {
    console.error('Erro Nominatim:', err.message);
    if (tentativa <= 2) {
      await sleep(2000);
      return buscarNominatim(query, tentativa + 1);
    }
  }
  return null;
}

app.get('/geocode', async (req, res) => {
  const { q, numero, bairro, cidade, uf, cep } = req.query;
  if (!q) return res.status(400).json({ error: 'Parametro q obrigatorio' });

  const tentativas = [];

  if (numero && cidade) {
    const rua = expandirAbrev(q);
    const ruaSA = removeAcentos(rua);
    const cidadeSA = removeAcentos(cidade);
    const bairroSA = bairro ? removeAcentos(bairro) : '';

    if (bairro) tentativas.push(`${ruaSA} ${numero}, ${bairroSA}, ${cidadeSA}, ${uf||'SP'}`);
    tentativas.push(`${ruaSA} ${numero}, ${cidadeSA}, ${uf||'SP'}`);
    if (cep) {
      let cepLimpo = cep.replace(/\D/g, '');
      while (cepLimpo.length < 8) cepLimpo = '0' + cepLimpo;
      tentativas.push(`${cepLimpo}, Brasil`);
    }
    if (bairro) tentativas.push(`${bairroSA}, ${cidadeSA}, ${uf||'SP'}, Brasil`);
    tentativas.push(`${cidadeSA}, ${uf||'SP'}, Brasil`);
  } else {
    const semAcento = removeAcentos(q);
    tentativas.push(q, semAcento, semAcento + ', Brasil');
  }

  for (const query of tentativas) {
    const result = await buscarNominatim(query);
    if (result) {
      result.query_used = query;
      return res.json(result);
    }
    await sleep(1500); // 1.5s entre tentativas
  }

  res.json({ found: false, query: q });
});

app.listen(PORT, () => {
  console.log(`Copeli Roteirizador API rodando na porta ${PORT}`);
});
