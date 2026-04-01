const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'Copeli Roteirizador API' });
});

// Geocodificacao via Nominatim
app.get('/geocode', async (req, res) => {
  const { q } = req.query;
  if (!q) return res.status(400).json({ error: 'Parametro q obrigatorio' });

  // Remove acentos para melhorar resultado
  const semAcento = q.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  const tentativas = [
    q,
    semAcento,
    semAcento + ', Brasil',
  ];

  for (const query of tentativas) {
    try {
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1&countrycodes=br&accept-language=pt-BR`;
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'CopelliRoteirizador/1.0 (contato@copeli.com.br)',
          'Accept-Language': 'pt-BR,pt'
        }
      });
      const data = await response.json();
      if (data && data.length > 0) {
        return res.json({
          found: true,
          lat: parseFloat(data[0].lat),
          lng: parseFloat(data[0].lon),
          display: data[0].display_name,
          query_used: query
        });
      }
    } catch (err) {
      console.error('Erro geocode:', err.message);
    }
    // Respeita rate limit do Nominatim: 1 req/s
    await new Promise(r => setTimeout(r, 1100));
  }

  res.json({ found: false, query: q });
});

// Geocodifica lista de enderecos em batch
app.post('/geocode/batch', async (req, res) => {
  const { enderecos } = req.body;
  if (!Array.isArray(enderecos)) return res.status(400).json({ error: 'enderecos deve ser array' });

  const resultados = [];
  for (const end of enderecos) {
    const semAcento = end.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const tentativas = [end, semAcento, semAcento + ', Brasil'];
    let encontrado = null;

    for (const query of tentativas) {
      try {
        const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1&countrycodes=br`;
        const response = await fetch(url, {
          headers: { 'User-Agent': 'CopelliRoteirizador/1.0' }
        });
        const data = await response.json();
        if (data && data.length > 0) {
          encontrado = {
            endereco: end,
            found: true,
            lat: parseFloat(data[0].lat),
            lng: parseFloat(data[0].lon),
            display: data[0].display_name
          };
          break;
        }
      } catch (err) {
        console.error('Erro batch:', err.message);
      }
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
