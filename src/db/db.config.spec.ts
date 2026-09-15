import { User } from '../user/user.entity';
import { DB_ENTITIES, DB_TYPE, DEFAULT_DATABASE_URL } from './db.config';

describe('db.config', () => {
  it('lists the User entity', () => {
    expect(DB_ENTITIES).toContain(User);
  });

  it('defaults to a local sqlite file path', () => {
    expect(DEFAULT_DATABASE_URL).toBe('./db.sqlite');
  });

  it('uses the better-sqlite3 driver', () => {
    expect(DB_TYPE).toBe('better-sqlite3');
  });
});
