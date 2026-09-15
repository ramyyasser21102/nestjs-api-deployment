import { User } from '../user/user.entity';
import {
  DB_ENTITIES,
  DB_TYPE,
  DEFAULT_DATABASE_URL,
  getDatabaseSsl,
} from './db.config';

describe('db.config', () => {
  it('lists the User entity', () => {
    expect(DB_ENTITIES).toContain(User);
  });

  it('defaults to the local docker-compose Postgres connection string', () => {
    expect(DEFAULT_DATABASE_URL).toBe(
      'postgresql://postgres:postgres@localhost:5433/app_dev',
    );
  });

  it('uses the postgres driver', () => {
    expect(DB_TYPE).toBe('postgres');
  });

  describe('getDatabaseSsl', () => {
    it('requires SSL in production, without validating the RDS certificate chain', () => {
      expect(getDatabaseSsl('production')).toEqual({
        rejectUnauthorized: false,
      });
    });

    it('skips SSL outside production', () => {
      expect(getDatabaseSsl('development')).toBe(false);
      expect(getDatabaseSsl('test')).toBe(false);
      expect(getDatabaseSsl(undefined)).toBe(false);
    });
  });
});
