import { User } from '../user/user.entity';

// Shared between the TypeORM CLI datasource (data-source.ts) and the
// runtime datasource config (app.module.ts) — keep this the single
// source of truth for both rather than declaring it twice.

export const DB_ENTITIES = [User];

export const DEFAULT_DATABASE_URL = './db.sqlite';

export const DB_TYPE = 'better-sqlite3' as const;
