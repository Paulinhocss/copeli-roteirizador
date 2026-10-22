# Copeli Control Tower

Plataforma de planejamento, execução e melhoria contínua da logística Copeli.

## Stack

- React + TypeScript + Vite
- Node.js + Express + TypeScript
- PostgreSQL
- SQL Server Deak (somente leitura)
- HERE Geocoding / Routing / Tour Planning
- Contele Fleet
- Leaflet

## Estrutura

```text
apps/
  web/   # React + TypeScript + Vite
  api/   # API Node + Express + TypeScript

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
docs/
```

Os módulos de domínio em `src/` foram preservados durante a primeira etapa da migração para evitar regressões nas regras logísticas. Toda nova interface vive em `apps/web`; o entrypoint oficial da API vive em `apps/api`.

## Desenvolvimento local

Node 24.19+ e npm 11+.

```bash
npm install
npm run dev
```

- API: http://localhost:3001
- Web: http://localhost:5173

## Validação

```bash
npm run check:v3
```

Executa:

1. verificação de segredos hardcoded;
2. TypeScript do Web;
3. TypeScript da API;
4. testes de domínio.

Build:

```bash
npm run build
```

## Segurança de credenciais

Nenhuma chave deve existir no código.

A HERE é lida exclusivamente de:

```text
HERE_API_KEY
```

As demais credenciais também ficam somente no ambiente:

```text
DATABASE_URL
DEAK_DB_SERVER
DEAK_DB_USER
DEAK_DB_PASSWORD
CONTELE_API_KEY
```

O arquivo `.env.example` contém apenas nomes e valores não sensíveis.

## Fluxo logístico

```text
Deak
  -> demanda logística
  -> planejamento
  -> HERE
  -> liberação oficial
  -> Control Tower PostgreSQL
  -> execução / Contele
  -> alertas / ocorrências
  -> melhoria contínua
```

Modalidades:

- Entrega própria: Copeli -> cliente.
- Transportadora: Copeli -> transportadora -> cliente.
- SEDEX: Copeli -> Correios -> cliente.

Transportadora e SEDEX entram na rota da frota própria até o ponto de despacho. Vários pedidos para o mesmo ponto externo podem formar uma única parada física, mantendo cada pedido separado para SLA e rastreamento.

Mais detalhes: [Arquitetura V3](docs/ARQUITETURA_V3.md) e [Control Tower](docs/CONTROL_TOWER.md).
