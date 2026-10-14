function lerBooleano(valor, padrao = false) {
  if (valor === undefined || valor === null || valor === '') return padrao;
  return ['1', 'true', 'sim', 'yes', 'on'].includes(String(valor).toLowerCase());
}

function lerInteiro(valor, padrao) {
  const numero = Number.parseInt(valor, 10);
  return Number.isFinite(numero) ? numero : padrao;
}

const ambiente = {
  port: lerInteiro(process.env.PORT, 3000),
  hereApiKey: process.env.HERE_API_KEY || '',
  corsOrigin: process.env.CORS_ORIGIN || '*',
  timezoneOffset: process.env.ROTEIRIZADOR_TIMEZONE_OFFSET || '-03:00',
  postgres: {
    url: process.env.DATABASE_URL || process.env.ROTEIRIZADOR_DATABASE_URL || '',
    ssl: lerBooleano(process.env.PG_SSL, false),
  },
  deak: {
    server: process.env.DEAK_DB_SERVER || process.env.DB_SERVER || '',
    port: lerInteiro(process.env.DEAK_DB_PORT || process.env.DB_PORT, 1433),
    database: process.env.DEAK_DB_DATABASE || process.env.DB_NAME || 'Deak',
    user: process.env.DEAK_DB_USER || process.env.DB_USER || '',
    password: process.env.DEAK_DB_PASSWORD || process.env.DB_PASSWORD || '',
    encrypt: lerBooleano(process.env.DEAK_DB_ENCRYPT, false),
    trustServerCertificate: lerBooleano(process.env.DEAK_DB_TRUST_CERT, true),
    requestTimeout: lerInteiro(process.env.DEAK_DB_REQUEST_TIMEOUT, 30000),
  },
};

module.exports = { ambiente, lerBooleano, lerInteiro };
