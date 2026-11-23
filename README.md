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


## Desenvolvimento local com SQL Server

O ambiente local pode usar o mesmo SQL Server que hospeda a copia local do Deak, mantendo a persistencia do Control Tower em uma base separada.

Arquitetura recomendada:

- `Deak`: copia local das tabelas/views do ERP, lida pelo usuario `DEAK_DB_*`.
- `ControlTowerDev`: base local exclusiva para dados do Control Tower.
- Railway/HML/producao: PostgreSQL privado via `DATABASE_URL`, sem proxy TCP publico.

No `.env`, habilite explicitamente:

```env
CT_STORE_DRIVER=mssql
CT_SQL_DB_DATABASE=ControlTowerDev
```

Se `CT_SQL_DB_SERVER`, `CT_SQL_DB_USER` e `CT_SQL_DB_PASSWORD` ficarem vazios, o modo `mssql` reutiliza as credenciais `DEAK_DB_*` apenas para o servidor local configurado pelo desenvolvedor.

Para validar a copia local do Deak e preparar `ControlTowerDev`:

```powershell
npm.cmd run check:local-sql
```

O comando verifica os objetos Deak usados pelo extrator e cria/valida somente a estrutura do Control Tower em `ControlTowerDev`. Ele nao cria tabelas na base Deak.
