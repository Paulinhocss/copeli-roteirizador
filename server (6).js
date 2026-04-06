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

  // 1. CEP direto no HERE — mais preciso, evita ambiguidade de nome de rua
  if (cepFmt.length === 8) {
    tentativas.push(`${cepFmt}, Brasil`);
  }

  // 2. ViaCEP → endereço completo com número → HERE
  if (cepFmt.length === 8) {
    const via = await buscarViaCEP(cepFmt);
    if (via && via.logradouro) {
      const endCompleto = `${via.logradouro}${numero ? ' '+numero : ''}, ${via.bairro}, ${via.cidade}, ${via.uf}, Brasil`;
      tentativas.push(endCompleto);
      tentativas.push(`${via.logradouro}, ${via.bairro}, ${via.cidade}, ${via.uf}, Brasil`);
    }
  }

  // 3. Endereço + bairro + cidade (mais específico que só cidade)
  const qLimpo = q.trim();
  if (qLimpo && bairro && cidadeStr) {
    if (numero) tentativas.push(`${qLimpo} ${numero}, ${bairro}, ${cidadeStr}, ${ufStr}, Brasil`);
    tentativas.push(`${qLimpo}, ${bairro}, ${cidadeStr}, ${ufStr}, Brasil`);
  }

  // 4. Endereço + cidade
  if (qLimpo && cidadeStr) {
    if (numero) tentativas.push(`${qLimpo} ${numero}, ${cidadeStr}, ${ufStr}, Brasil`);
    tentativas.push(`${qLimpo}, ${cidadeStr}, ${ufStr}, Brasil`);
  }

  // 5. Bairro + cidade
  if (bairro && cidadeStr) tentativas.push(`${bairro}, ${cidadeStr}, ${ufStr}, Brasil`);

  // 6. Só cidade
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

// Rota proxy para HERE Routing API
// Recebe: ?waypoints=lat,lng|lat,lng|lat,lng...
app.get('/route', async (req, res) => {
  const { waypoints } = req.query;
  if (!waypoints) return res.status(400).json({ error: 'waypoints obrigatorio' });

  try {
    const pts = waypoints.split('|').map(w => {
      const [lat, lng] = w.split(',');
      return { lat: parseFloat(lat), lng: parseFloat(lng) };
    });

    if (pts.length < 2) return res.status(400).json({ error: 'Minimo 2 waypoints' });

    // Monta URL HERE: origin, vias intermediárias, destination
    let params = `origin=${pts[0].lat},${pts[0].lng}`;
    for (let i = 1; i < pts.length - 1; i++) {
      params += `&via=${pts[i].lat},${pts[i].lng}`;
    }
    params += `&destination=${pts[pts.length-1].lat},${pts[pts.length-1].lng}`;
    params += `&transportMode=car&return=polyline&apikey=${HERE_KEY}`;

    const hereUrl = `https://router.hereapi.com/v8/routes?${params}`;
    const r = await fetch(hereUrl);
    const d = await r.json();

    if (d.routes && d.routes[0]) {
      // Decodifica HERE Flexible Polyline no servidor e retorna array de coords
      const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
      function decodeChar(c) { return CHARS.indexOf(c); }
      function decodePolyline(encoded) {
        const header2 = decodeChar(encoded[1]);
        const precision = header2 & 0xF;
        const has3d = (header2 >> 4) & 1;
        const factor = Math.pow(10, precision);
        let i = 2, lat = 0, lng = 0;
        const coords = [];
        while (i < encoded.length) {
          let rv = 0, s = 0, b;
          do { b = decodeChar(encoded[i++]); rv |= (b & 0x1F) << s; s += 5; } while (b >= 0x20);
          lat += ((rv & 1) ? ~(rv >> 1) : (rv >> 1));
          rv = 0; s = 0;
          do { b = decodeChar(encoded[i++]); rv |= (b & 0x1F) << s; s += 5; } while (b >= 0x20);
          lng += ((rv & 1) ? ~(rv >> 1) : (rv >> 1));
          if (has3d) { rv = 0; s = 0; do { b = decodeChar(encoded[i++]); rv |= (b & 0x1F) << s; s += 5; } while (b >= 0x20); }
          coords.push([lat / factor, lng / factor]);
        }
        return coords;
      }

      const allCoords = [];
      d.routes[0].sections.forEach(s => {
        allCoords.push(...decodePolyline(s.polyline));
      });

      res.json({ ok: true, coords: allCoords });
    } else {
      res.json({ ok: false, error: 'HERE sem rota', detail: d });
    }
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.listen(PORT, () => {
  console.log(`Copeli Roteirizador API v3 - HERE Maps rodando na porta ${PORT}`);
});
