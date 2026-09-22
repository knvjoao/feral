const sql = require('mssql');
require('dotenv').config();

const serverRaw = process.env.DB_SERVER || 'localhost';
let server = serverRaw;
let instanceName = undefined;

if (serverRaw.includes('\\')) {
  const parts = serverRaw.split('\\');
  server = parts[0];
  instanceName = parts[1];
}

const config = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  server: server,
  database: process.env.DB_DATABASE || 'FerAL',
  options: {
    encrypt: process.env.DB_ENCRYPT === 'true',
    trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE !== 'false',
    enableArithAbort: true,
    ...(instanceName ? { instanceName } : {})
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000
  }
};

if (!instanceName && process.env.DB_PORT) {
  config.port = parseInt(process.env.DB_PORT, 10);
}

let poolPromise = null;

const getPool = async () => {
  if (!poolPromise) {
    poolPromise = sql.connect(config)
      .then(pool => {
        console.log('✅ Conectado com sucesso ao SQL Server (Banco: ' + (process.env.DB_DATABASE || 'FerAL') + ')');
        return pool;
      })
      .catch(err => {
        console.error('❌ Falha na conexão com o SQL Server:', err.message);
        poolPromise = null;
        throw err;
      });
  }
  return poolPromise;
};

module.exports = {
  sql, getPool
};
