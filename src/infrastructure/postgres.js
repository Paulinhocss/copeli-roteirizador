const { Pool } = require('pg');
const { ambiente } = require('../config/ambiente');

let pool;

function configurado() {
  return Boolean(ambiente.postgres.url);
}

function obterPool() {
  if (!configurado()) {
    const erro = new Error('Banco PostgreSQL do roteirizador nao configurado.');
    erro.code = 'POSTGRES_NAO_CONFIGURADO';
    throw erro;
  }

  if (!pool) {
    pool = new Pool({
      connectionString: ambiente.postgres.url,
      ssl: ambiente.postgres.ssl ? { rejectUnauthorized: false } : undefined,
      max: 8,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });
  }

  return pool;
}

async function query(texto, parametros = []) {
  return obterPool().query(texto, parametros);
}

async function transacao(executar) {
  const cliente = await obterPool().connect();
  try {
    await cliente.query('BEGIN');
    const resultado = await executar(cliente);
    await cliente.query('COMMIT');
    return resultado;
  } catch (erro) {
    await cliente.query('ROLLBACK');
    throw erro;
  } finally {
    cliente.release();
  }
}

module.exports = { configurado, obterPool, query, transacao };
