import { applyDecorators } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import {
  ForbiddenResponseDto,
  UnauthorizedResponseDto,
} from '../dto/auth-error-response.dto';

export const ApiResponseAuth = () =>
  applyDecorators(
    ApiResponse({
      status: 401,
      description: 'Unauthorized',
      type: UnauthorizedResponseDto,
    }),
    ApiResponse({
      status: 403,
      description: 'Forbidden',
      type: ForbiddenResponseDto,
    }),
  );
