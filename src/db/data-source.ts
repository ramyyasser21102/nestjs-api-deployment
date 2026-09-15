import 'dotenv/config';
import { DataSource } from 'typeorm';
import { DB_ENTITIES, DB_TYPE, DEFAULT_DATABASE_URL } from './db.config';

// Used by the TypeORM CLI (migrations). Not used at runtime — app uses TypeOrmModule.forRootAsync.
export const dataSource = new DataSource({
  type: DB_TYPE,
  database: process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL,
  entities: DB_ENTITIES,
  migrations: ['src/db/migrations/*.ts'],
  synchronize: false,
  logging: true,
});
