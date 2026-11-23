const path = require('node:path');
const dotenv = require('dotenv');

const raiz = path.resolve(__dirname, '../..');
dotenv.config({ path: path.join(raiz, '.env') });

const deak = require('../../src/infrastructure/deak');
const store = require('../../src/infrastructure/control-tower-store');
const ctSql = require('../../src/infrastructure/control-tower-sqlserver');
const demandas = require('../../src/control-tower/demandas.repository');

const objetosObrigatorios = [
  ['U', 'Orcamento'],
  ['U', 'Clientes'],
  ['U', 'OrcamentoItem'],
  ['U', 'NFiscalOrcamento'],
  ['U', 'StatusPedido'],
  ['U', 'statuspedidoprocesso'],
];

const objetosReferencia = [
  ['V', 'vw_copeli_Entrega'],
];

async function verificarDeak() {
  const pool = await deak.obterPool();
  const nomes = [...objetosObrigatorios, ...objetosReferencia].map(([, nome]) => nome);
  const request = pool.request();

  nomes.forEach((nome, i) => {
    request.input('nome' + i, deak.sql.NVarChar(128), nome);
  });

  const placeholders = nomes.map((_, i) => '@nome' + i).join(',');
  const resultado = await request.query(
    `SELECT o.name, o.type
     FROM sys.objects o
     WHERE o.name IN (${placeholders})`
  );

  const encontrados = new Map(
    resultado.recordset.map((item) => [String(item.name).toLowerCase(), item.type])
  );

  const faltantes = objetosObrigatorios
    .filter(([, nome]) => !encontrados.has(nome.toLowerCase()))
    .map(([, nome]) => nome);

  if (faltantes.length) {
    throw new Error('Objetos Deak obrigatorios ausentes: ' + faltantes.join(', '));
  }

  console.log('[OK] Deak local: tabelas obrigatorias encontradas.');
  for (const [, nome] of objetosReferencia) {
    if (encontrados.has(nome.toLowerCase())) {
      console.log('[OK] Referencia encontrada:', nome);
    } else {
      console.log('[INFO] Referencia opcional ausente:', nome);
    }
  }
}

async function verificarPersistencia() {
  const driver = store.driver();
  console.log('[INFO] Persistencia Control Tower:', driver);

  if (driver !== 'mssql') {
    throw new Error(
      'Para o desenvolvimento local, configure CT_STORE_DRIVER=mssql no .env.'
    );
  }

  await ctSql.garantirBanco();
  await demandas.garantirEstrutura();

  const pool = await ctSql.obterPool();
  const resultado = await pool.request().query(
    "SELECT DB_NAME() AS banco, OBJECT_ID('dbo.ct_demanda','U') AS tabela"
  );

  const item = resultado.recordset[0];
  if (!item || !item.tabela) {
    throw new Error('Tabela dbo.ct_demanda nao foi criada no ControlTowerDev.');
  }

  console.log('[OK] Persistencia local:', item.banco, '/ dbo.ct_demanda');
}

(async () => {
  try {
    console.log('[LOCAL-SQL] Validando Deak local e ControlTowerDev...');
    await verificarDeak();
    await verificarPersistencia();
    console.log('[LOCAL-SQL] OK.');
  } catch (erro) {
    console.error('[LOCAL-SQL] ERRO:', erro.message);
    process.exitCode = 1;
  }
})();
