import 'dotenv/config';
import { DataSource } from 'typeorm';
import { User } from '../user/user.entity';

// Used by the TypeORM CLI (migrations). Not used at runtime — app uses TypeOrmModule.forRootAsync.
export const dataSource = new DataSource({
  type: 'better-sqlite3',
  database: process.env.DATABASE_URL ?? './db.sqlite',
  entities: [User],
  migrations: ['src/db/migrations/*.ts'],
  synchronize: false,
  logging: true,
});
