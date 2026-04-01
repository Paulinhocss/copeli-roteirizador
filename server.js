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
    .replace(/^R\s+/i, 'Rua ')
    .replace(/^RUA\s+/i, 'Rua ')
    .replace(/^AV\s+/i, 'Avenida ')
    .replace(/^AV\.\s+/i, 'Avenida ')
    .replace(/^AL\s+/i, 'Alameda ')
    .replace(/^AL\.\s+/i, 'Alameda ')
    .replace(/^EST\s+/i, 'Estrada ')
    .replace(/^TV\s+/i, 'Travessa ')
    .replace(/^PC\s+/i, 'Praca ')
    .replace(/^PCA\s+/i, 'Praca ')
    .replace(/^ROD\s+/i, 'Rodovia ');
}

async function buscarNominatim(query) {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1&countrycodes=br&accept-language=pt-BR`;
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'CopelliRoteirizador/1.0 (contato@copeli.com.br)',
      'Accept-Language': 'pt-BR,pt'
    }
  });
  const data = await response.json();
  if (data && data.length > 0) {
    return { found: true, lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon), display: data[0].display_name };
  }
  return null;
}

app.get('/geocode', async (req, res) => {
  const { q, numero, bairro, cidade, uf, cep } = req.query;
  if (!q) return res.status(400).json({ error: 'Parametro q obrigatorio' });

  // Se vier dados estruturados, monta tentativas otimizadas
  const tentativas = [];

  if (numero && cidade) {
    const rua = expandirAbrev(q);
    const ruaSemAcento = removeAcentos(rua);
    const cidadeSemAcento = removeAcentos(cidade);
    const bairroSemAcento = bairro ? removeAcentos(bairro) : '';

    // 1. Rua + número + bairro + cidade (mais completo)
    if (bairro) tentativas.push(`${ruaSemAcento} ${numero}, ${bairroSemAcento}, ${cidadeSemAcento}, ${uf || 'SP'}`);
    // 2. Rua + número + cidade
    tentativas.push(`${ruaSemAcento} ${numero}, ${cidadeSemAcento}, ${uf || 'SP'}`);
    // 3. CEP com zero à esquerda
    if (cep) {
      let cepLimpo = cep.replace(/\D/g, '');
      while (cepLimpo.length < 8) cepLimpo = '0' + cepLimpo;
      tentativas.push(`${cepLimpo}, Brasil`);
      tentativas.push(`CEP ${cepLimpo}, ${cidadeSemAcento}`);
    }
    // 4. Só bairro + cidade (fallback)
    if (bairro) tentativas.push(`${bairroSemAcento}, ${cidadeSemAcento}, ${uf || 'SP'}, Brasil`);
    // 5. Só cidade
    tentativas.push(`${cidadeSemAcento}, ${uf || 'SP'}, Brasil`);
  } else {
    // Busca genérica
    const semAcento = removeAcentos(q);
    tentativas.push(q, semAcento, semAcento + ', Brasil');
  }

  for (const query of tentativas) {
    try {
      const result = await buscarNominatim(query);
      if (result) {
        result.query_used = query;
        return res.json(result);
      }
    } catch (err) {
      console.error('Erro geocode:', err.message);
    }
    await new Promise(r => setTimeout(r, 1100));
  }

  res.json({ found: false, query: q });
});

app.post('/geocode/batch', async (req, res) => {
  const { enderecos } = req.body;
  if (!Array.isArray(enderecos)) return res.status(400).json({ error: 'enderecos deve ser array' });

  const resultados = [];
  for (const end of enderecos) {
    const semAcento = removeAcentos(end);
    let encontrado = null;
    for (const query of [end, semAcento, semAcento + ', Brasil']) {
      try {
        const result = await buscarNominatim(query);
        if (result) { encontrado = { endereco: end, ...result }; break; }
      } catch (err) { console.error('Erro batch:', err.message); }
      await new Promise(r => setTimeout(r, 1100));
    }
    resultados.push(encontrado || { endereco: end, found: false });
    await new Promise(r => setTimeout(r, 1100));
  }
  res.json({ resultados });
});

app.listen(PORT, () => {
  console.log(`Copeli Roteirizador API rodando na porta ${PORT}`);
});
