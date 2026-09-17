import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { DeleteResult, Repository } from 'typeorm';
import { CreateUserDto, UpdateUserDto } from './user.dto';
import { IUser, User } from './user.entity';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<IUser>,
    @InjectPinoLogger(UserService.name)
    private readonly logger: PinoLogger,
  ) {}

  async findAll(): Promise<IUser[]> {
    const users = await this.userRepository.find();
    this.logger.info({ count: users.length }, 'Retrieved all users');
    return users;
  }

  async findOne(id: number): Promise<IUser> {
    const user = await this.userRepository.findOneBy({ id });
    if (!user) {
      this.logger.warn({ id }, 'User not found');
      throw new NotFoundException(`User with id ${id} not found`);
    }
    this.logger.debug({ id }, 'User retrieved');
    return user;
  }

  async findOneByEmail(email: string): Promise<IUser> {
    const user = await this.userRepository.findOneBy({
      email: decodeURIComponent(email),
    });
    if (!user) {
      this.logger.warn({ email }, 'User not found by email');
      throw new NotFoundException(`User with email ${email} not found`);
    }
    this.logger.debug({ email }, 'User retrieved by email');
    return user;
  }

  async create(createUserDto: CreateUserDto): Promise<IUser> {
    const existing = await this.userRepository.findOneBy({
      email: decodeURIComponent(createUserDto.email),
    });
    if (existing) {
      this.logger.warn(
        { email: createUserDto.email },
        'Duplicate email on create',
      );
      throw new BadRequestException(
        `User with email ${createUserDto.email} already exists`,
      );
    }
    const hashedPassword = await bcrypt.hash(createUserDto.password, 10);
    const newUser = this.userRepository.create({
      name: createUserDto.name,
      email: createUserDto.email,
      password: hashedPassword,
    });
    const saved = await this.userRepository.save(newUser);
    this.logger.info({ id: saved.id, email: saved.email }, 'User created');
    return saved;
  }

  async update(id: number, updateUserDto: UpdateUserDto): Promise<IUser> {
    const user = await this.userRepository.findOneBy({ id });
    if (!user) {
      this.logger.warn({ id }, 'User not found on update');
      throw new NotFoundException(`User with id ${id} not found`);
    }
    user.name = updateUserDto.name;
    user.email = updateUserDto.email;
    const updated = await this.userRepository.save(user);
    this.logger.info({ id }, 'User updated');
    return updated;
  }

  async delete(id: number): Promise<DeleteResult> {
    const user = await this.userRepository.findOneBy({ id });
    if (!user) {
      this.logger.warn({ id }, 'User not found on delete');
      throw new NotFoundException(`User with id ${id} not found`);
    }
    const result = await this.userRepository.delete({ id });
    this.logger.info({ id }, 'User deleted');
    return result;
  }
}
