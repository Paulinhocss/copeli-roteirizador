const sql = require('mssql');
const { ambiente } = require('../config/ambiente');

let poolPromise;

function configurado() {
  const cfg = ambiente.deak;
  return Boolean(cfg.server && cfg.database && cfg.user && cfg.password);
}

function criarConfiguracao() {
  const cfg = ambiente.deak;
  return {
    server: cfg.server,
    port: cfg.port,
    database: cfg.database,
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
    const erro = new Error('Conexao somente leitura com o Deak nao configurada.');
    erro.code = 'DEAK_NAO_CONFIGURADO';
    throw erro;
  }

  if (!poolPromise) {
    const pool = new sql.ConnectionPool(criarConfiguracao());
    pool.on('error', (erro) => {
      console.error('[DEAK] Falha no pool SQL Server:', erro.message);
      poolPromise = null;
    });
    poolPromise = pool.connect().catch((erro) => {
      poolPromise = null;
      throw erro;
    });
  }

  return poolPromise;
}

module.exports = { sql, configurado, obterPool };
