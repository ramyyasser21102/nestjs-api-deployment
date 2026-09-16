import { User } from '../user/user.entity';

// Shared between the TypeORM CLI datasource (data-source.ts) and the
// runtime datasource config (app.module.ts) — keep this the single
// source of truth for both rather than declaring it twice.

export const DB_ENTITIES = [User];

// Matches the docker-compose `postgres` service on the default Postgres
// port. If your machine already has something bound to 5432, remap it
// locally in a (gitignored) docker-compose.override.yml rather than
// changing this shared default.
export const DEFAULT_DATABASE_URL =
  'postgresql://postgres:postgres@localhost:5432/app_dev';

export const DB_TYPE = 'postgres' as const;

// RDS (and most managed Postgres) requires an encrypted connection in
// production; the local/CI Postgres container has no certificate to
// validate against, so SSL only turns on for NODE_ENV=production.
export function getDatabaseSsl(
  nodeEnv: string | undefined,
): false | { rejectUnauthorized: false } {
  return nodeEnv === 'production' ? { rejectUnauthorized: false } : false;
}

// Only auto-sync the schema for local, unconfigured development — test
// and production both rely on real migrations, so the e2e suite actually
// exercises the same migration path production does.
export function shouldSynchronize(nodeEnv: string | undefined): boolean {
  return nodeEnv === undefined || nodeEnv === 'development';
}
