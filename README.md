# Copeli Roteirizador — Backend

Servidor proxy para geocodificação via Nominatim (OpenStreetMap).

## Deploy no Railway

1. Acesse https://railway.app
2. Clique em "New Project" → "Deploy from GitHub repo"
   - OU use "Deploy from template" → Empty
3. Faça upload desta pasta ou conecte via GitHub
4. Railway detecta automaticamente o Node.js e faz o deploy
5. Copie a URL gerada (ex: https://copeli-roteirizador.up.railway.app)

## Endpoints

- `GET /` — health check
- `GET /geocode?q=Avenida Paulista 1000 Sao Paulo` — geocodifica um endereço
- `POST /geocode/batch` — geocodifica lista: `{ "enderecos": ["end1", "end2"] }`

## Teste local

```bash
npm install
npm start
```
