// Prepares the `app_test` database before the e2e suite runs: creates it
// if missing, then applies real migrations against it — the same
// schema-management path production uses — instead of relying on
// TypeORM's `synchronize`, so the e2e suite actually exercises the
// migrations. Plain JS (not TS) — Jest's globalSetup runs outside the
// ts-jest transform pipeline.
const { Client } = require('pg');
const { execFileSync } = require('child_process');
const path = require('path');

const TEST_DB_NAME = 'app_test';
const DEFAULT_LOCAL_URL =
  'postgresql://postgres:postgres@localhost:5432/app_dev';

function withDatabase(name) {
  const url = new URL(process.env.DATABASE_URL ?? DEFAULT_LOCAL_URL);
  url.pathname = `/${name}`;
  return url.toString();
}

module.exports = async function globalSetup() {
  // Connect to the server's default `postgres` maintenance database —
  // you can't CREATE DATABASE while connected to the database being
  // created.
  const client = new Client({ connectionString: withDatabase('postgres') });
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

  execFileSync(
    'pnpm',
    [
      'exec',
      'typeorm-ts-node-commonjs',
      'migration:run',
      '-d',
      'src/db/data-source.ts',
    ],
    {
      cwd: path.resolve(__dirname, '..'),
      env: { ...process.env, DATABASE_URL: withDatabase(TEST_DB_NAME) },
      stdio: 'inherit',
    },
  );
};
