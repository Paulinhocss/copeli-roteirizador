# Copeli Roteirizador

Aplicacao independente para gestao de entregas, geocodificacao e planejamento de rotas da Copeli.

## Arquitetura v2

O projeto continua separado do Vanguard One.

- **Deak / SQL Server**: fonte somente leitura das entregas por meio de `dbo.vw_copeli_Entrega`.
- **PostgreSQL do roteirizador**: configuracoes, motoristas, veiculos e faixas de CEP.
- **HERE Geocoding & Routing**: geocodificacao e desenho/calculo das rotas.
- **HERE Tour Planning v3**: distribuicao e sequenciamento profissional das entregas.

## Modos de roteirizacao

O painel administrativo possui um unico modo ativo por vez.

### Faixas de CEP

O administrador cadastra intervalos de CEP e o motorista responsavel.

Fluxo:

```
Entrega -> CEP -> faixa cadastrada -> motorista -> HERE Tour Planning -> sequencia otimizada
```

A faixa define **quem atende**. A HERE define **em qual ordem atender**.

### Otimizacao por frota

O sistema recebe as entregas e os veiculos ativos e envia o problema para o HERE Tour Planning.

Fluxo:

```
X entregas + Y veiculos -> HERE Tour Planning -> distribuicao + sequencia das rotas
```

Neste modo nao existe amarracao previa de motorista por CEP.

## Variaveis de ambiente

### HERE

```
HERE_API_KEY=
ROTEIRIZADOR_TIMEZONE_OFFSET=-03:00
```

A chave HERE deve existir somente no ambiente do Railway. Nao grave chaves no repositorio.

### PostgreSQL

```
DATABASE_URL=
PG_SSL=false
```

O backend cria/valida a estrutura inicial automaticamente. O mesmo schema esta documentado em:

```
sql/001_roteirizador_v2.sql
```

### Deak - somente leitura

```
DEAK_DB_SERVER=
DEAK_DB_PORT=1433
DEAK_DB_DATABASE=Deak
DEAK_DB_USER=
DEAK_DB_PASSWORD=
DEAK_DB_ENCRYPT=false
DEAK_DB_TRUST_CERT=true
DEAK_DB_REQUEST_TIMEOUT=30000
```

Use exclusivamente uma credencial SQL com permissao de leitura.

### HTTP

```
PORT=3000
CORS_ORIGIN=*
```

## Endpoints principais

```
GET  /                         health check
GET  /geocode                  compatibilidade de geocodificacao
GET  /route                    compatibilidade do roteamento antigo
GET  /fila                     compatibilidade; agora le a view do Deak

GET  /api/entregas
POST /api/mapas/rota

GET  /api/roteirizacao/configuracoes
PUT  /api/roteirizacao/configuracoes

GET  /api/roteirizacao/motoristas
POST /api/roteirizacao/motoristas
PATCH /api/roteirizacao/motoristas/:id

GET  /api/roteirizacao/veiculos
POST /api/roteirizacao/veiculos
PATCH /api/roteirizacao/veiculos/:id

GET  /api/roteirizacao/faixas-cep
POST /api/roteirizacao/faixas-cep
PATCH /api/roteirizacao/faixas-cep/:id

POST /api/roteirizacao/planejar
```

## Desenvolvimento local

```bash
npm install
npm test
npm start
```

O `package-lock.json` deve ser regenerado com `npm install` nesta versao por causa das novas dependencias `mssql` e `pg`.

## Seguranca

A versao antiga armazenava a chave HERE no codigo-fonte. A v2 usa somente `HERE_API_KEY`.

Antes de colocar a v2 em producao:

1. rotacione a chave HERE que ja esteve exposta no historico do repositorio;
2. configure a nova chave no Railway;
3. use login SQL exclusivo e somente leitura para o Deak;
4. configure um PostgreSQL proprio para o roteirizador;
5. substitua o login legado do frontend por autenticacao no backend antes da homologacao final.

## Status desta branch

A branch `v2-roteirizacao-profissional-r1` implementa a fundacao da nova arquitetura sem alterar a `main`.

A primeira homologacao deve validar:

- leitura direta da `vw_copeli_Entrega`;
- geocodificacao existente;
- cadastro administrativo;
- alternancia CEP x Otimizada;
- acesso da chave HERE ao Tour Planning API;
- resultado de rotas contra uma amostra real da operacao.
