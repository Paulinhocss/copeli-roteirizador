const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const HERE_KEY = '4YEO9FLs9MHJE9eDar3MofG9qyF1pCaAWZTSAA6KCfM';

const sleep = ms => new Promise(r => setTimeout(r, ms));

app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'Copeli Roteirizador API v3 - HERE Maps' });
});

// Geocodificação via HERE — precisa por número
async function buscarHERE(query) {
  try {
    const url = `https://geocode.search.hereapi.com/v1/geocode?q=${encodeURIComponent(query)}&lang=pt-BR&in=countryCode:BRA&apiKey=${HERE_KEY}`;
    const r = await fetch(url);
    const d = await r.json();
    if (d.items && d.items.length > 0) {
      const item = d.items[0];
      return {
        lat: item.position.lat,
        lng: item.position.lng,
        display: item.address.label
      };
    }
  } catch(e) {}
  return null;
}

// ViaCEP para enriquecer o endereço com logradouro oficial
async function buscarViaCEP(cep) {
  try {
    const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
    const d = await r.json();
    if (d && !d.erro) return { logradouro: d.logradouro||'', bairro: d.bairro||'', cidade: d.localidade||'', uf: d.uf||'SP' };
  } catch(e) {}
  return null;
}

function dentroDeSP(lat, lng) {
  return lat >= -25.3 && lat <= -19.7 && lng >= -53.2 && lng <= -44.2;
}

app.get('/geocode', async (req, res) => {
  const { q, numero, bairro, cidade, uf, cep } = req.query;
  if (!q) return res.status(400).json({ error: 'Parametro q obrigatorio' });

  let cepFmt = (cep||'').replace(/\D/g,'');
  while (cepFmt.length < 8) cepFmt = '0' + cepFmt;

  const cidadeStr = cidade || 'Sao Paulo';
  const ufStr = uf || 'SP';
  const tentativas = [];

  // 1. ViaCEP → endereço completo com número → HERE (mais preciso)
  if (cepFmt.length === 8) {
    const via = await buscarViaCEP(cepFmt);
    if (via && via.logradouro) {
      const endCompleto = `${via.logradouro}${numero ? ' '+numero : ''}, ${via.bairro}, ${via.cidade}, ${via.uf}, Brasil`;
      tentativas.push(endCompleto);
      tentativas.push(`${via.logradouro}, ${via.cidade}, ${via.uf}, Brasil`);
    }
    tentativas.push(`${cepFmt}, Brasil`);
  }

  // 2. Endereço original + número + cidade
  const qLimpo = q.trim();
  if (qLimpo && cidadeStr) {
    if (numero) tentativas.push(`${qLimpo} ${numero}, ${cidadeStr}, ${ufStr}, Brasil`);
    tentativas.push(`${qLimpo}, ${cidadeStr}, ${ufStr}, Brasil`);
  }

  // 3. Bairro + cidade
  if (bairro && cidadeStr) tentativas.push(`${bairro}, ${cidadeStr}, ${ufStr}, Brasil`);

  // 4. Só cidade
  if (cidadeStr) tentativas.push(`${cidadeStr}, ${ufStr}, Brasil`);

  for (const query of tentativas) {
    if (!query || query.length < 5) continue;
    const result = await buscarHERE(query);
    if (result && dentroDeSP(result.lat, result.lng)) {
      return res.json({ found: true, lat: result.lat, lng: result.lng, display: result.display, query_used: query });
    }
  }

  res.json({ found: false, query: q });
});

app.listen(PORT, () => {
  console.log(`Copeli Roteirizador API v3 - HERE Maps rodando na porta ${PORT}`);
});
