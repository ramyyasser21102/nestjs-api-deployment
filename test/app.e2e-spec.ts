import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

describe('E2E', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    // Use an isolated in-memory database so E2E tests never touch the real DB
    process.env.DATABASE_URL = ':memory:';
    process.env.NODE_ENV = 'test';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();

    // Mirror the setup in main.ts — pipes not active otherwise
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    app.useLogger(false); // suppress pino output during tests

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  // ─── Health ──────────────────────────────────────────────────────────────────

  describe('GET /health', () => {
    it('returns 200 with status healthy', () => {
      return request(app.getHttpServer())
        .get('/health')
        .expect(200)
        .expect({ status: 'healthy' });
    });
  });

  // ─── Root ────────────────────────────────────────────────────────────────────

  describe('GET /', () => {
    it('returns 200 Hello World', () => {
      return request(app.getHttpServer())
        .get('/')
        .expect(200)
        .expect('Hello World!');
    });
  });

  // ─── User CRUD ───────────────────────────────────────────────────────────────

  describe('User endpoints', () => {
    let createdUserId: number;

    // ── POST /user/create ────────────────────────────────────────────────────

    describe('POST /user/create', () => {
      it('creates a user and returns 201 without a password field', async () => {
        const res = await request(app.getHttpServer())
          .post('/user/create')
          .send({
            name: 'Alice',
            email: 'alice@example.com',
            password: 'Secret123!',
          })
          .expect(201);

        expect((res.body as { id: number }).id).toBeDefined();
        expect((res.body as { name: string }).name).toBe('Alice');
        expect((res.body as { email: string }).email).toBe('alice@example.com');
        // password has select: false — must never appear in API responses
        expect((res.body as { password: string }).password).toBeUndefined();

        createdUserId = (res.body as { id: number }).id;
      });

      it('returns 400 when email already exists', () => {
        return request(app.getHttpServer())
          .post('/user/create')
          .send({
            name: 'Alice Again',
            email: 'alice@example.com',
            password: 'Secret123!',
          })
          .expect(400);
      });

      it('returns 400 when email format is invalid', () => {
        return request(app.getHttpServer())
          .post('/user/create')
          .send({ name: 'Bob', email: 'not-an-email', password: 'Secret123!' })
          .expect(400);
      });

      it('returns 400 when password is shorter than 8 characters', () => {
        return request(app.getHttpServer())
          .post('/user/create')
          .send({ name: 'Bob', email: 'bob@example.com', password: 'short' })
          .expect(400);
      });

      it('returns 400 when required fields are missing', () => {
        return request(app.getHttpServer())
          .post('/user/create')
          .send({ email: 'incomplete@example.com' })
          .expect(400);
      });

      it('returns 400 when unknown fields are sent (forbidNonWhitelisted)', () => {
        return request(app.getHttpServer())
          .post('/user/create')
          .send({
            name: 'Bob',
            email: 'bob@example.com',
            password: 'Secret123!',
            role: 'admin', // not in DTO
          })
          .expect(400);
      });
    });

    // ── GET /user/all ────────────────────────────────────────────────────────

    describe('GET /user/all', () => {
      it('returns 200 with an array containing the created user', async () => {
        const res = await request(app.getHttpServer())
          .get('/user/all')
          .expect(200);

        expect(Array.isArray(res.body)).toBe(true);
        expect((res.body as unknown[]).length).toBeGreaterThan(0);
        expect(
          (res.body as { password: string }[]).every(
            (u: { password: string }) => u.password === undefined,
          ),
        ).toBe(true);
      });
    });

    // ── GET /user/:id ────────────────────────────────────────────────────────

    describe('GET /user/:id', () => {
      it('returns 200 with the user when found', async () => {
        const res = await request(app.getHttpServer())
          .get(`/user/${createdUserId}`)
          .expect(200);

        expect((res.body as { id: number }).id).toBe(createdUserId);
        expect((res.body as { password: string }).password).toBeUndefined();
      });

      it('returns 404 when user does not exist', () => {
        return request(app.getHttpServer()).get('/user/99999').expect(404);
      });

      it('returns 400 when id is not a number (ParseIntPipe)', () => {
        return request(app.getHttpServer())
          .get('/user/not-a-number')
          .expect(400);
      });
    });

    // ── PUT /user/:id ────────────────────────────────────────────────────────

    describe('PUT /user/:id', () => {
      it('returns 200 and updates the user', () => {
        return request(app.getHttpServer())
          .put(`/user/${createdUserId}`)
          .send({ name: 'Alice Updated', email: 'alice.updated@example.com' })
          .expect(200);
      });

      it('returns 404 when user does not exist', () => {
        return request(app.getHttpServer())
          .put('/user/99999')
          .send({ name: 'Ghost', email: 'ghost@example.com' })
          .expect(404);
      });
    });

    // ── DELETE /user/:id ─────────────────────────────────────────────────────

    describe('DELETE /user/:id', () => {
      it('returns 200 and deletes the user', () => {
        return request(app.getHttpServer())
          .delete(`/user/${createdUserId}`)
          .expect(200);
      });

      it('returns 404 on subsequent GET after deletion', () => {
        return request(app.getHttpServer())
          .get(`/user/${createdUserId}`)
          .expect(404);
      });

      it('returns 404 when deleting a non-existent user', () => {
        return request(app.getHttpServer()).delete('/user/99999').expect(404);
      });
    });
  });
});
