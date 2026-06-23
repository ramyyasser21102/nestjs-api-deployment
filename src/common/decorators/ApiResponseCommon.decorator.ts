import { applyDecorators } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';

export const ApiResponseCommon = () =>
  applyDecorators(
    ApiResponse({ status: 400, description: 'Validation error' }),
  );
