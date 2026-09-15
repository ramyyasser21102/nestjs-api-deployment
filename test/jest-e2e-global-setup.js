// Ensures the `app_test` database exists on the target Postgres instance
// before the e2e suite runs. Plain JS (not TS) — Jest's globalSetup runs
// outside the ts-jest transform pipeline.
const { Client } = require('pg');

const TEST_DB_NAME = 'app_test';

function adminConnectionString() {
  const url = new URL(
    process.env.DATABASE_URL ??
      'postgresql://postgres:postgres@localhost:5433/app_dev',
  );
  // Connect to the server's default `postgres` maintenance database — you
  // can't CREATE DATABASE while connected to the database being created.
  url.pathname = '/postgres';
  return url.toString();
}

module.exports = async function globalSetup() {
  const client = new Client({ connectionString: adminConnectionString() });
  await client.connect();
  try {
    const { rowCount } = await client.query(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      [TEST_DB_NAME],
    );
    if (rowCount === 0) {
      await client.query(`CREATE DATABASE ${TEST_DB_NAME}`);
    }
  } finally {
    await client.end();
  }
};
