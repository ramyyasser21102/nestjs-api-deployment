import 'dotenv/config';
import { DataSource } from 'typeorm';
import {
  DB_ENTITIES,
  DB_TYPE,
  DEFAULT_DATABASE_URL,
  getDatabaseSsl,
} from './db.config';

// Used by the TypeORM CLI (migrations). Not used at runtime — app uses TypeOrmModule.forRootAsync.
export const dataSource = new DataSource({
  type: DB_TYPE,
  url: process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL,
  ssl: getDatabaseSsl(process.env.NODE_ENV),
  entities: DB_ENTITIES,
  migrations: ['src/db/migrations/*.ts'],
  synchronize: false,
  logging: true,
});
