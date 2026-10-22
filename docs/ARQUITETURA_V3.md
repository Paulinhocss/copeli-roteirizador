# Copeli Control Tower V3

## Stack oficial

- Web: React + TypeScript + Vite
- API: Node.js + Express + TypeScript
- Banco operacional: PostgreSQL
- ERP/fonte: Deak SQL Server em somente leitura
- Roteirização: HERE Geocoding, Routing v8 e Tour Planning
- Telemetria: Contele Fleet
- Mapa: Leaflet / OpenStreetMap

## Estrutura

```text
apps/
  web/
    src/
      components/
      lib/
      pages/
      App.tsx
      main.tsx
      types.ts
  api/
    src/
      server.ts

src/
  config/
  infrastructure/
  entregas/
  roteirizacao/
  control-tower/
  integracoes/

sql/
tests/
scripts/
```

A pasta raiz `src/` contém os módulos de domínio herdados da V2/Control Tower. Eles permanecem em CommonJS durante a migração para evitar regressão funcional. O entrypoint da API e toda nova interface já utilizam TypeScript.

## Portas locais

- API: 3001
- Web/Vite: 5173

## Segurança

Credenciais nunca ficam no código ou no frontend.

Obrigatórias via ambiente:

```text
HERE_API_KEY
DATABASE_URL
DEAK_DB_SERVER
DEAK_DB_USER
DEAK_DB_PASSWORD
```

Opcional para telemetria:

```text
CONTELE_API_KEY
```

O comando `npm run verify:secrets` falha se detectar padrões conhecidos de HERE, Contele ou senha Deak hardcoded no código executável.

## Execução

```bash
npm install
npm run dev
```

Validação completa:

```bash
npm run check
```

Build:

```bash
npm run build
npm start
```

## Regra de migração

O frontend legado em HTML/JavaScript não deve receber novas funcionalidades. Todo novo desenvolvimento visual deve entrar em `apps/web`.

As regras de domínio existentes permanecem atrás da API e são migradas para TypeScript por módulo, com testes, sem alterar regras logísticas já homologadas.
