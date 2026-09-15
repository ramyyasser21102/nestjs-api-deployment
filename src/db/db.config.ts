import { User } from '../user/user.entity';

// Shared between the TypeORM CLI datasource (data-source.ts) and the
// runtime datasource config (app.module.ts) — keep this the single
// source of truth for both rather than declaring it twice.

export const DB_ENTITIES = [User];

// Matches the docker-compose `postgres` service exposed on localhost:5433
// (5433, not the Postgres default 5432, to avoid clashing with any other
// local Postgres already bound to 5432 on the host).
export const DEFAULT_DATABASE_URL =
  'postgresql://postgres:postgres@localhost:5433/app_dev';

export const DB_TYPE = 'postgres' as const;

// RDS (and most managed Postgres) requires an encrypted connection in
// production; the local/CI Postgres container has no certificate to
// validate against, so SSL only turns on for NODE_ENV=production.
export function getDatabaseSsl(
  nodeEnv: string | undefined,
): false | { rejectUnauthorized: boolean } {
  return nodeEnv === 'production' ? { rejectUnauthorized: false } : false;
}
