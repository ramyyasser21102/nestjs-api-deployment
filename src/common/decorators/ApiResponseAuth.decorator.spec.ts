import { Controller, Get } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ApiResponseAuth } from './ApiResponseAuth.decorator';

@Controller('dummy')
class DummyController {
  @Get()
  @ApiResponseAuth()
  get() {
    return null;
  }
}

describe('ApiResponseAuth', () => {
  it('documents distinct 401 and 403 response body schemas', async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [DummyController],
    }).compile();
    const app = moduleRef.createNestApplication();
    await app.init();

    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().build(),
    );
    await app.close();

    // Stringify rather than walking the deeply-optional OpenAPIObject types
    // directly — the document's own shape is what's under test here, and
    // this asserts on the actual generated schema instead of a typed lie.
    const serialized = JSON.stringify(document);

    expect(serialized).toContain(
      '"$ref":"#/components/schemas/UnauthorizedResponseDto"',
    );
    expect(serialized).toContain(
      '"$ref":"#/components/schemas/ForbiddenResponseDto"',
    );

    expect(document.components?.schemas?.['UnauthorizedResponseDto']).toEqual({
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 401 },
        message: { type: 'string', example: 'Unauthorized' },
      },
      required: ['statusCode', 'message'],
    });
    expect(document.components?.schemas?.['ForbiddenResponseDto']).toEqual({
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 403 },
        message: { type: 'string', example: 'Forbidden' },
      },
      required: ['statusCode', 'message'],
    });
  });
});
