import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { UserController } from './user.controller';
import { UserService } from './user.service';

const mockUserService = {
  findAll: jest.fn(),
  findOne: jest.fn(),
  findOneByEmail: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
};

describe('UserController', () => {
  let controller: UserController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UserController],
      providers: [{ provide: UserService, useValue: mockUserService }],
    }).compile();

    controller = module.get<UserController>(UserController);
  });

  afterEach(() => jest.clearAllMocks());

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('findAll', () => {
    it('returns the full user list from the service', async () => {
      const users = [
        { id: 1, name: 'Alice', email: 'alice@example.com' },
        { id: 2, name: 'Bob', email: 'bob@example.com' },
      ];
      mockUserService.findAll.mockResolvedValue(users);

      const result = await controller.findAll();

      expect(mockUserService.findAll).toHaveBeenCalledTimes(1);
      expect(result).toEqual(users);
    });

    it('returns an empty array when no users exist', async () => {
      mockUserService.findAll.mockResolvedValue([]);

      const result = await controller.findAll();

      expect(mockUserService.findAll).toHaveBeenCalledTimes(1);
      expect(result).toEqual([]);
    });
  });

  describe('findOne', () => {
    it('calls the service with the correct id and returns the result', async () => {
      const user = { id: 1, name: 'Alice', email: 'alice@example.com' };
      mockUserService.findOne.mockResolvedValue(user);

      const result = await controller.findOne(1);

      expect(mockUserService.findOne).toHaveBeenCalledWith(1);
      expect(mockUserService.findOne).toHaveBeenCalledTimes(1);
      expect(result).toEqual(user);
    });

    it('propagates NotFoundException when the service throws', async () => {
      mockUserService.findOne.mockRejectedValue(
        new NotFoundException('User with id 999 not found'),
      );

      await expect(controller.findOne(999)).rejects.toThrow(NotFoundException);
      expect(mockUserService.findOne).toHaveBeenCalledWith(999);
    });
  });

  describe('findOneByEmail', () => {
    it('calls the service with the correct email and returns the result', async () => {
      const user = { id: 1, name: 'Alice', email: 'alice@example.com' };
      mockUserService.findOneByEmail.mockResolvedValue(user);

      const result = await controller.findOneByEmail('alice@example.com');

      expect(mockUserService.findOneByEmail).toHaveBeenCalledWith(
        'alice@example.com',
      );
      expect(mockUserService.findOneByEmail).toHaveBeenCalledTimes(1);
      expect(result).toEqual(user);
    });

    it('propagates NotFoundException when the service throws', async () => {
      mockUserService.findOneByEmail.mockRejectedValue(
        new NotFoundException('User with email notfound@example.com not found'),
      );

      await expect(
        controller.findOneByEmail('notfound@example.com'),
      ).rejects.toThrow(NotFoundException);
      expect(mockUserService.findOneByEmail).toHaveBeenCalledWith(
        'notfound@example.com',
      );
    });
  });

  describe('create', () => {
    it('calls the service with the correct dto and returns the created user', async () => {
      const dto = {
        name: 'Alice',
        email: 'alice@example.com',
        password: 'Password123!',
      };
      const created = { id: 1, name: dto.name, email: dto.email };
      mockUserService.create.mockResolvedValue(created);

      const result = await controller.create(dto);

      expect(mockUserService.create).toHaveBeenCalledWith(dto);
      expect(result).toEqual(created);
    });

    it('propagates BadRequestException when email already exists', async () => {
      const dto = {
        name: 'Alice',
        email: 'alice@example.com',
        password: 'Password123!',
      };
      mockUserService.create.mockRejectedValue(
        new BadRequestException(
          'User with email alice@example.com already exists',
        ),
      );

      await expect(controller.create(dto)).rejects.toThrow(BadRequestException);
      expect(mockUserService.create).toHaveBeenCalledWith(dto);
    });
  });

  describe('update', () => {
    it('calls the service with the correct id and dto', async () => {
      const dto = { name: 'Alice Updated', email: 'alice.new@example.com' };
      const updateResult = { affected: 1, raw: [], generatedMaps: [] };
      mockUserService.update.mockResolvedValue(updateResult);

      const result = await controller.update(1, dto);

      expect(mockUserService.update).toHaveBeenCalledWith(1, dto);
      expect(mockUserService.update).toHaveBeenCalledTimes(1);
      expect(result).toEqual(updateResult);
    });

    it('propagates NotFoundException when user does not exist', async () => {
      const dto = { name: 'Ghost', email: 'ghost@example.com' };
      mockUserService.update.mockRejectedValue(
        new NotFoundException('User with id 999 not found'),
      );

      await expect(controller.update(999, dto)).rejects.toThrow(
        NotFoundException,
      );
      expect(mockUserService.update).toHaveBeenCalledWith(999, dto);
    });
  });

  describe('delete', () => {
    it('calls the service with the correct id and returns the result', async () => {
      const deleteResult = { affected: 1, raw: [] };
      mockUserService.delete.mockResolvedValue(deleteResult);

      const result = await controller.delete(1);

      expect(mockUserService.delete).toHaveBeenCalledWith(1);
      expect(mockUserService.delete).toHaveBeenCalledTimes(1);
      expect(result).toEqual(deleteResult);
    });

    it('propagates NotFoundException when user does not exist', async () => {
      mockUserService.delete.mockRejectedValue(
        new NotFoundException('User with id 999 not found'),
      );

      await expect(controller.delete(999)).rejects.toThrow(NotFoundException);
      expect(mockUserService.delete).toHaveBeenCalledWith(999);
    });
  });
});
