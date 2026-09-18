import { IUser } from './user.entity';
import { UserDto } from './user.dto';

// The only place a User entity is allowed to become an API response. The
// entity never leaves this function un-mapped — UserDto's constructor has
// no password parameter, so there is no field to accidentally forget to
// strip.
export function toUserDto(user: IUser): UserDto {
  return new UserDto(
    user.id,
    user.name,
    user.email,
    user.createdAt,
    user.updatedAt,
  );
}
