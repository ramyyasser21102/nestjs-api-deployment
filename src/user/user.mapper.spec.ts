import { IUser } from './user.entity';
import { toUserDto } from './user.mapper';

describe('toUserDto', () => {
  it('maps an entity to the public DTO shape', () => {
    const entity: IUser = {
      id: 1,
      name: 'Alice',
      email: 'alice@example.com',
      password: 'a-bcrypt-hash',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    };

    const dto = toUserDto(entity);

    expect(dto.id).toBe(1);
    expect(dto.name).toBe('Alice');
    expect(dto.email).toBe('alice@example.com');
    expect(dto.createdAt).toEqual(new Date('2026-01-01T00:00:00.000Z'));
    expect(dto.updatedAt).toEqual(new Date('2026-01-02T00:00:00.000Z'));
  });

  it('never carries a password field, even though the entity has one', () => {
    const entity: IUser = {
      id: 1,
      name: 'Alice',
      email: 'alice@example.com',
      password: 'a-bcrypt-hash',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const dto = toUserDto(entity);

    expect(dto).not.toHaveProperty('password');
    expect(Object.keys(dto)).not.toContain('password');
  });
});
