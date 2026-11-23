const { ambiente } = require('../config/ambiente');
const postgres = require('./postgres');
const sqlServerLocal = require('./control-tower-sqlserver');

function driver() {
  const solicitado = ambiente.controlTowerStore.driver;
  if (solicitado === 'postgres') return 'postgres';
  if (solicitado === 'mssql') return 'mssql';
  if (solicitado !== 'auto') {
    const erro = new Error('CT_STORE_DRIVER invalido. Use auto, postgres ou mssql.');
    erro.code = 'CT_STORE_DRIVER_INVALIDO';
    throw erro;
  }

  if (postgres.configurado()) return 'postgres';
  if (sqlServerLocal.configurado()) return 'mssql';
  return 'none';
}

function configurado() {
  return driver() !== 'none';
}

function descricao() {
  const atual = driver();
  if (atual === 'postgres') return 'PostgreSQL';
  if (atual === 'mssql') return 'SQL Server local';
  return 'nao configurada';
}

module.exports = { driver, configurado, descricao };
