import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { getLoggerToken } from 'nestjs-pino';
import { UserService } from './user.service';
import { User } from './user.entity';
import { CreateUserDto } from './user.dto';

const mockRepository = {
  find: jest.fn(),
  findOneBy: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
};

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
  error: jest.fn(),
};

describe('UserService', () => {
  let service: UserService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserService,
        { provide: getRepositoryToken(User), useValue: mockRepository },
        { provide: getLoggerToken(UserService.name), useValue: mockLogger },
      ],
    }).compile();

    service = module.get<UserService>(UserService);
  });

  afterEach(() => jest.resetAllMocks());

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ─── findAll ─────────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('returns all users from the repository', async () => {
      const users = [{ id: 1, name: 'Alice', email: 'alice@example.com' }];
      mockRepository.find.mockResolvedValue(users);

      const result = await service.findAll();

      expect(mockRepository.find).toHaveBeenCalledTimes(1);
      expect(result).toEqual(users);
    });

    it('returns an empty array when no users exist', async () => {
      mockRepository.find.mockResolvedValue([]);

      const result = await service.findAll();

      expect(result).toEqual([]);
    });
  });

  // ─── findOne ─────────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('returns the user when found', async () => {
      const user = { id: 1, name: 'Alice', email: 'alice@example.com' };
      mockRepository.findOneBy.mockResolvedValue(user);

      const result = await service.findOne(1);

      expect(mockRepository.findOneBy).toHaveBeenCalledWith({ id: 1 });
      expect(result).toEqual(user);
    });

    it('throws NotFoundException when user does not exist', async () => {
      mockRepository.findOneBy.mockResolvedValue(null);

      await expect(service.findOne(999)).rejects.toThrow(NotFoundException);
      expect(mockRepository.findOneBy).toHaveBeenCalledWith({ id: 999 });
    });
  });

  // ─── findOneByEmail ───────────────────────────────────────────────────────────

  describe('findOneByEmail', () => {
    it('returns the user when found', async () => {
      const user = { id: 1, name: 'Alice', email: 'alice@example.com' };
      mockRepository.findOneBy.mockResolvedValue(user);

      const result = await service.findOneByEmail('alice@example.com');

      expect(mockRepository.findOneBy).toHaveBeenCalledWith({
        email: 'alice@example.com',
      });
      expect(result).toEqual(user);
    });

    it('throws NotFoundException when user does not exist', async () => {
      mockRepository.findOneBy.mockResolvedValue(null);

      await expect(
        service.findOneByEmail('notfound@example.com'),
      ).rejects.toThrow(NotFoundException);
    });

    it('decodes a URL-encoded email before querying the repository', async () => {
      const user = { id: 1, name: 'Alice', email: 'alice@example.com' };
      mockRepository.findOneBy.mockResolvedValue(user);

      await service.findOneByEmail('alice%40example.com');

      // The repository must receive the decoded value, not the raw URL-encoded string
      expect(mockRepository.findOneBy).toHaveBeenCalledWith({
        email: 'alice@example.com',
      });
    });
  });

  // ─── create ──────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('stores a bcrypt hash, not the plaintext password', async () => {
      mockRepository.findOneBy.mockResolvedValue(null);
      mockRepository.create.mockImplementation((dto: CreateUserDto) => ({
        ...dto,
      }));
      mockRepository.save.mockImplementation((user) =>
        Promise.resolve({ id: 1, ...user }),
      );

      await service.create({
        name: 'Alice',
        email: 'alice@example.com',
        password: 'plaintext123',
      });

      const savedArg = (
        mockRepository.save.mock.calls[0] as [any]
      )[0] as unknown as {
        password: string;
      };
      expect(savedArg.password).not.toBe('plaintext123');
      expect(await bcrypt.compare('plaintext123', savedArg.password)).toBe(
        true,
      );
    });

    it('throws BadRequestException and does not save when email already exists', async () => {
      mockRepository.findOneBy.mockResolvedValue({
        id: 1,
        email: 'alice@example.com',
      });

      await expect(
        service.create({
          name: 'Alice',
          email: 'alice@example.com',
          password: 'Password123!',
        }),
      ).rejects.toThrow(
        new BadRequestException(
          'User with email alice@example.com already exists',
        ),
      );

      expect(mockRepository.save).not.toHaveBeenCalled();
    });
  });

  // ─── update ──────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('calls repository.update with correct args when user exists', async () => {
      const user = { id: 1, name: 'Alice', email: 'alice@example.com' };
      const updateResult = { affected: 1, raw: [], generatedMaps: [] };
      mockRepository.findOneBy.mockResolvedValue(user);
      mockRepository.update.mockResolvedValue(updateResult);

      const result = await service.update(1, {
        name: 'Alice Updated',
        email: 'alice@example.com',
      });

      expect(mockRepository.findOneBy).toHaveBeenCalledWith({ id: 1 });
      expect(mockRepository.update).toHaveBeenCalledWith(
        { id: 1 },
        { name: 'Alice Updated', email: 'alice@example.com' },
      );
      expect(result).toEqual(updateResult);
    });

    it('throws NotFoundException and does not call update when user does not exist', async () => {
      mockRepository.findOneBy.mockResolvedValue(null);

      await expect(
        service.update(999, { name: 'Ghost', email: 'ghost@example.com' }),
      ).rejects.toThrow(NotFoundException);

      expect(mockRepository.update).not.toHaveBeenCalled();
    });
  });

  // ─── delete ──────────────────────────────────────────────────────────────────

  describe('delete', () => {
    it('calls repository.delete with correct id when user exists', async () => {
      const user = { id: 1, name: 'Alice', email: 'alice@example.com' };
      const deleteResult = { affected: 1, raw: [] };
      mockRepository.findOneBy.mockResolvedValue(user);
      mockRepository.delete.mockResolvedValue(deleteResult);

      const result = await service.delete(1);

      expect(mockRepository.findOneBy).toHaveBeenCalledWith({ id: 1 });
      expect(mockRepository.delete).toHaveBeenCalledWith({ id: 1 });
      expect(result).toEqual(deleteResult);
    });

    it('throws NotFoundException and does not call delete when user does not exist', async () => {
      mockRepository.findOneBy.mockResolvedValue(null);

      await expect(service.delete(999)).rejects.toThrow(NotFoundException);

      expect(mockRepository.delete).not.toHaveBeenCalled();
    });
  });
});
