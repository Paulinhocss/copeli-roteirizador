const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const sleep = ms => new Promise(r => setTimeout(r, ms));

app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'Copeli Roteirizador API v2 - ViaCEP' });
});

function removeAcentos(str) {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

// Busca endereço completo pelo CEP no ViaCEP
async function buscarViaCEP(cep) {
  try {
    const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`, {
      headers: { 'Accept': 'application/json' }
    });
    const d = await r.json();
    if (d && !d.erro) {
      return {
        logradouro: d.logradouro || '',
        bairro: d.bairro || '',
        cidade: d.localidade || '',
        uf: d.uf || 'SP'
      };
    }
  } catch(e) {}
  return null;
}

// Busca coordenadas no Nominatim
async function buscarNominatim(query, tentativa=1) {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1&countrycodes=br&accept-language=pt-BR`;
  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': 'CopelliRoteirizador/2.0 (contato@copeli.com.br)' }
    });
    if (r.status === 429) {
      if (tentativa <= 3) { await sleep(4000 * tentativa); return buscarNominatim(query, tentativa+1); }
      return null;
    }
    const d = await r.json();
    if (d && d.length > 0) return { lat: parseFloat(d[0].lat), lng: parseFloat(d[0].lon) };
  } catch(e) {
    if (tentativa <= 2) { await sleep(2000); return buscarNominatim(query, tentativa+1); }
  }
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

  const tentativas = [];

  // ETAPA 1: ViaCEP → monta endereço preciso → Nominatim
  if (cepFmt.length === 8) {
    const via = await buscarViaCEP(cepFmt);
    if (via && via.logradouro) {
      const endCompleto = `${via.logradouro}${numero ? ' '+numero : ''}, ${via.bairro}, ${via.cidade}, ${via.uf}, Brasil`;
      tentativas.push(endCompleto);
      tentativas.push(`${via.logradouro}, ${via.cidade}, ${via.uf}, Brasil`);
    }
    // CEP direto no Nominatim como fallback
    tentativas.push(cepFmt);
    tentativas.push(`${cepFmt}, Brasil`);
  }

  // ETAPA 2: Endereço original + cidade
  const qSA = removeAcentos(q);
  const cidadeSA = cidade ? removeAcentos(cidade) : '';
  const bairroSA = bairro ? removeAcentos(bairro) : '';
  const ufStr = uf || 'SP';

  if (qSA && cidadeSA) {
    if (numero) tentativas.push(`${qSA} ${numero}, ${cidadeSA}, ${ufStr}, Brasil`);
    tentativas.push(`${qSA}, ${cidadeSA}, ${ufStr}, Brasil`);
  }

  // ETAPA 3: Bairro + cidade
  if (bairroSA && cidadeSA) {
    tentativas.push(`${bairroSA}, ${cidadeSA}, ${ufStr}, Brasil`);
  }

  // ETAPA 4: Só cidade
  if (cidadeSA) tentativas.push(`${cidadeSA}, ${ufStr}, Brasil`);

  for (const query of tentativas) {
    if (!query || query.length < 5) continue;
    const coords = await buscarNominatim(query);
    if (coords && dentroDeSP(coords.lat, coords.lng)) {
      return res.json({ found: true, lat: coords.lat, lng: coords.lng, query_used: query });
    }
    await sleep(1200);
  }

  res.json({ found: false, query: q });
});

app.listen(PORT, () => {
  console.log(`Copeli Roteirizador API v2 rodando na porta ${PORT}`);
});
