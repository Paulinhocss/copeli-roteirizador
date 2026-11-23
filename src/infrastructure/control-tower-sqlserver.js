const sql = require('mssql');
const { ambiente } = require('../config/ambiente');

let poolPromise;

function driverAtivo() {
  const driver = ambiente.controlTowerStore.driver;
  if (driver === 'mssql') return true;
  if (driver === 'postgres') return false;
  return !ambiente.postgres.url && Boolean(ambiente.controlTowerSql.server);
}

function configurado() {
  if (!driverAtivo()) return false;
  const cfg = ambiente.controlTowerSql;
  return Boolean(cfg.server && cfg.database && cfg.user && cfg.password);
}

function criarConfiguracao(database = ambiente.controlTowerSql.database) {
  const cfg = ambiente.controlTowerSql;
  return {
    server: cfg.server,
    port: cfg.port,
    database,
    user: cfg.user,
    password: cfg.password,
    connectionTimeout: 10000,
    requestTimeout: cfg.requestTimeout,
    pool: {
      max: 5,
      min: 0,
      idleTimeoutMillis: 30000,
    },
    options: {
      encrypt: cfg.encrypt,
      trustServerCertificate: cfg.trustServerCertificate,
      enableArithAbort: true,
    },
  };
}

async function obterPool() {
  if (!configurado()) {
    const erro = new Error('SQL Server local do Control Tower nao configurado.');
    erro.code = 'CT_SQL_NAO_CONFIGURADO';
    throw erro;
  }

  if (!poolPromise) {
    const pool = new sql.ConnectionPool(criarConfiguracao());
    pool.on('error', (erro) => {
      console.error('[CT-SQL] Falha no pool SQL Server:', erro.message);
      poolPromise = null;
    });
    poolPromise = pool.connect().catch((erro) => {
      poolPromise = null;
      throw erro;
    });
  }

  return poolPromise;
}

async function garantirBanco() {
  if (!driverAtivo()) return false;
  const cfg = ambiente.controlTowerSql;
  if (!/^[A-Za-z0-9_]+$/.test(cfg.database)) {
    const erro = new Error('Nome de banco CT_SQL_DB_DATABASE invalido.');
    erro.code = 'CT_SQL_CONFIG_INVALIDA';
    throw erro;
  }

  const master = await new sql.ConnectionPool(criarConfiguracao('master')).connect();
  try {
    const request = master.request();
    request.input('database', sql.NVarChar(128), cfg.database);
    const existe = await request.query('SELECT DB_ID(@database) AS id');
    if (!existe.recordset[0] || !existe.recordset[0].id) {
      await master.request().query('CREATE DATABASE [' + cfg.database + ']');
    }
  } finally {
    await master.close();
  }
  return true;
}

async function transacao(executar) {
  const pool = await obterPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const resultado = await executar(transaction);
    await transaction.commit();
    return resultado;
  } catch (erro) {
    try { await transaction.rollback(); } catch (_) {}
    throw erro;
  }
}

module.exports = {
  sql,
  driverAtivo,
  configurado,
  criarConfiguracao,
  obterPool,
  garantirBanco,
  transacao,
};
