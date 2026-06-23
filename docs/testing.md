# Testing

This document explains every test file in this project in full detail — the setup, every `describe` block, every individual test, and the reasoning behind each decision.

---

## Testing Stack

| Package           | Role                                                                   |
| ----------------- | ---------------------------------------------------------------------- |
| `jest`            | Test runner — discovers, executes, and reports test results            |
| `ts-jest`         | Transforms TypeScript to JavaScript before Jest runs it                |
| `@nestjs/testing` | Provides `Test.createTestingModule()` to build isolated NestJS modules |
| `supertest`       | Makes real HTTP requests against a running NestJS app in E2E tests     |
| `nestjs-pino`     | The logger used in `UserService` — requires a special mock token       |

---

## Two Kinds of Tests

### Unit Tests (`*.spec.ts` inside `src/`)

Unit tests test **one class in isolation**. They never touch a real database, real network, or real logger. Every external dependency is replaced with a `jest.fn()` mock. The test only verifies the logic of the class under test.

Jest configuration (from `package.json`):

```json
{
  "rootDir": "src",
  "testRegex": ".*\\.spec\\.ts$"
}
```

Jest looks inside `src/` for any file matching `*.spec.ts`.

Run with:

```bash
pnpm run test
pnpm run test:watch     # re-runs on file changes
pnpm run test:cov       # generates a coverage report
```

### E2E Tests (`*.e2e-spec.ts` inside `test/`)

E2E tests boot the **entire NestJS application** and fire real HTTP requests at it. Nothing is mocked — the real database, real pipes, real middleware, and real exception handlers all run. They test the full request lifecycle.

Jest configuration (`test/jest-e2e.json`):

```json
{
  "rootDir": ".",
  "testRegex": ".e2e-spec.ts$"
}
```

Run with:

```bash
pnpm run test:e2e
```

---

## Core Concept: `Test.createTestingModule()`

Every unit test file uses this NestJS testing utility. It creates a lightweight fake version of a NestJS module where you control exactly what gets injected.

```typescript
const module: TestingModule = await Test.createTestingModule({
  controllers: [UserController],
  providers: [{ provide: UserService, useValue: mockUserService }],
}).compile();
```

`provide` is the **injection token** — the same token NestJS's DI container looks up when wiring dependencies. `useValue` is the object to inject in its place. After `.compile()`, you retrieve the class under test with `module.get(ClassName)`.

---

## Core Concept: `jest.fn()` and Mock Control

```typescript
const mockUserService = {
  findAll: jest.fn(),
  findOne: jest.fn(),
};
```

`jest.fn()` creates a function that:

- Records every call made to it (arguments, how many times)
- Returns `undefined` by default
- Can be instructed to return a specific value or throw

Controlling return values:

```typescript
mockUserService.findOne.mockResolvedValue(user); // resolves with user
mockUserService.findOne.mockRejectedValue(error); // rejects with error
```

Asserting calls:

```typescript
expect(mock.findOne).toHaveBeenCalledWith(1); // called with this argument
expect(mock.findOne).toHaveBeenCalledTimes(1); // called exactly once
expect(mock.save).not.toHaveBeenCalled(); // never called
```

---

## Core Concept: `clearAllMocks` vs `resetAllMocks`

This project uses `jest.resetAllMocks()` in `afterEach`. The difference matters:

| Method                 | Clears call history | Resets implementations |
| ---------------------- | ------------------- | ---------------------- |
| `jest.clearAllMocks()` | ✓                   | ✗                      |
| `jest.resetAllMocks()` | ✓                   | ✓                      |

`clearAllMocks` only wipes `mock.calls` and `mock.results`. If a test sets `mockRepository.save.mockImplementation(...)`, that implementation persists to the next test. `resetAllMocks` resets implementations back to bare `jest.fn()` returning `undefined`, so every test starts with a completely clean slate.

---

## `src/app.controller.spec.ts`

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      expect(appController.getHello()).toBe('Hello World!');
    });
  });
});
```

### Why `AppService` is used directly (not mocked)

`AppService` has **no constructor dependencies** — it has no `@InjectRepository`, no logger, no `ConfigService`. There is nothing for the DI container to fail to resolve. Using the real `AppService` is appropriate here because the test is genuinely testing the real behaviour of the app's root endpoint. Mocking `AppService` here would be unnecessary overhead.

This is the one case in this project where the real provider is used in a unit test. The rule: if a provider has no external dependencies, use the real one.

### `describe('root')`

Groups the tests for the root `GET /` endpoint. The `describe` name is `'root'` because this is NestJS CLI's scaffolding convention — it refers to the root route.

### `it('should return "Hello World!"')`

`AppController.getHello()` calls `AppService.getHello()` which returns the string `'Hello World!'`. The test calls the controller method directly (no HTTP) and asserts the exact return value with `toBe`. `toBe` checks reference equality for primitives — for a string it is equivalent to `===`.

---

## `src/health/health.service.spec.ts`

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { HealthService } from './health.service';

describe('HealthService', () => {
  let service: HealthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [HealthService],
    }).compile();

    service = module.get<HealthService>(HealthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('isHealthy', () => {
    it('returns a Promise', () => {
      expect(service.isHealthy()).toBeInstanceOf(Promise);
    });

    it('resolves to true', async () => {
      const result = await service.isHealthy();
      expect(result).toBe(true);
    });
  });
});
```

### Setup

`HealthService` has no external dependencies — no repository, no logger, no config. The module is created with `providers: [HealthService]` only, and the real class is used directly. No mocking is necessary.

### `it('should be defined')`

A basic sanity check confirming the DI container successfully instantiated the service. If any dependency injection fails at the module compile step, this test is the one that catches it first with a clear error.

### `describe('isHealthy')`

Groups both tests for the single public method on `HealthService`.

### `it('returns a Promise')`

`HealthService.isHealthy()` is declared as returning `Promise<boolean>`. This test verifies the return value is actually a `Promise` instance rather than a plain `boolean`. This matters because the `HealthController` `await`s the result — if the service ever changes to a synchronous return, the controller's conditional logic would still work but the async contract would be broken.

### `it('resolves to true')`

`await`s the promise and asserts the resolved value is `true`. `toBe(true)` uses strict equality — `toBeTruthy()` would pass for any truthy value (strings, objects, etc.), which would be a weaker assertion. The service currently hard-codes `Promise.resolve(true)`. When real health checks are added (database ping, external service check), this test will need to be updated with appropriate mocking.

---

## `src/health/health.controller.spec.ts`

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

const mockHealthService = {
  isHealthy: jest.fn(),
};

describe('HealthController', () => {
  let controller: HealthController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: HealthService, useValue: mockHealthService }],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  afterEach(() => jest.clearAllMocks());

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('healthCheck', () => {
    it('returns { status: "healthy" } when the service reports healthy', async () => {
      mockHealthService.isHealthy.mockResolvedValue(true);

      const result = await controller.healthCheck();

      expect(mockHealthService.isHealthy).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ status: 'healthy' });
    });

    it('returns { status: "unhealthy" } when the service reports unhealthy', async () => {
      mockHealthService.isHealthy.mockResolvedValue(false);

      const result = await controller.healthCheck();

      expect(mockHealthService.isHealthy).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ status: 'unhealthy' });
    });
  });
});
```

### `mockHealthService`

Defined at module scope (outside `describe`) so all tests share the same mock object. `jest.clearAllMocks()` in `afterEach` resets the call history between tests. `HealthService` is mocked here (unlike in `health.service.spec.ts`) because the controller test is testing the controller's behaviour, not the service's.

### Why `HealthService` must be mocked here

The `HealthController` constructor receives `HealthService` via dependency injection. If you tried to create the module without providing `HealthService`, NestJS would throw a DI resolution error at compile time. The mock object is provided under the `HealthService` token so the container has something to inject.

### `it('should be defined')`

Confirms the module compiled and the controller was successfully retrieved from the DI container.

### `it('returns { status: "healthy" } when the service reports healthy')`

Sets `mockHealthService.isHealthy` to resolve with `true`. Calls `controller.healthCheck()` directly. The `HealthController` implementation is:

```typescript
return (await this.healthService.isHealthy())
  ? { status: 'healthy' }
  : { status: 'unhealthy' };
```

This test exercises the `true` branch. `toEqual` is used (not `toBe`) because objects are compared by value, not reference — `{ status: 'healthy' }` in the assertion and `{ status: 'healthy' }` returned by the controller are two different object instances.

`toHaveBeenCalledTimes(1)` verifies the controller called the service exactly once — not zero times (would indicate the result was hardcoded) and not more than once (would indicate redundant service calls).

### `it('returns { status: "unhealthy" } when the service reports unhealthy')`

Exercises the `false` branch of the ternary. This test is as important as the happy-path test — the `unhealthy` path is the one that matters in production when something actually breaks. Testing only `true → 'healthy'` would leave the branch that alerts operators completely uncovered.

---

## `src/user/user.service.spec.ts`

This is the most logic-dense test file. `UserService` has six public methods, each with business logic, and it depends on two injected providers: a TypeORM repository and a Pino logger.

### Mock Setup

```typescript
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
```

Both are defined at module scope and reused across all tests. `jest.resetAllMocks()` in `afterEach` resets all implementations and call history between tests.

### Module Setup

```typescript
const module: TestingModule = await Test.createTestingModule({
  providers: [
    UserService,
    { provide: getRepositoryToken(User), useValue: mockRepository },
    { provide: getLoggerToken(UserService.name), useValue: mockLogger },
  ],
}).compile();
```

**`getRepositoryToken(User)`** — TypeORM generates a unique injection token for each entity's repository. The token for `User` is `Repository<User>`. `getRepositoryToken(User)` from `@nestjs/typeorm` computes that token so you can provide a mock under the exact same token the service expects via `@InjectRepository(User)`.

**`getLoggerToken(UserService.name)`** — `nestjs-pino` generates a unique token for each context string passed to `@InjectPinoLogger(UserService.name)`. `getLoggerToken` from `nestjs-pino` computes that token so you can provide the mock logger under the exact same key. Without this, the module compile step would throw: "Cannot find provider for PinoLogger".

### `afterEach(() => jest.resetAllMocks())`

`resetAllMocks` (not `clearAllMocks`) is used here because the `create` describe block sets `mockRepository.create.mockImplementation(...)` and `mockRepository.save.mockImplementation(...)`. Without resetting implementations, those would persist into subsequent describe blocks (even though those blocks don't use `save` or `create`). It is a safety net that makes each test fully self-contained.

---

### `describe('findAll')`

#### `it('returns all users from the repository')`

```typescript
const users = [{ id: 1, name: 'Alice', email: 'alice@example.com' }];
mockRepository.find.mockResolvedValue(users);

const result = await service.findAll();

expect(mockRepository.find).toHaveBeenCalledTimes(1);
expect(result).toEqual(users);
```

Sets `mockRepository.find` to resolve with the array. Calls `service.findAll()`. Asserts the repository was called once and the service returned exactly what the repository gave it. The test verifies the service correctly delegates to the repository without transforming the result.

#### `it('returns an empty array when no users exist')`

```typescript
mockRepository.find.mockResolvedValue([]);
const result = await service.findAll();
expect(result).toEqual([]);
```

Tests the edge case of an empty database. Without this test, a bug that returned `null` instead of `[]` would be undetected. The Swagger response type is `[UserDto]` — an array — so returning null would be a contract violation.

---

### `describe('findOne')`

#### `it('returns the user when found')`

```typescript
const user = { id: 1, name: 'Alice', email: 'alice@example.com' };
mockRepository.findOneBy.mockResolvedValue(user);

const result = await service.findOne(1);

expect(mockRepository.findOneBy).toHaveBeenCalledWith({ id: 1 });
expect(result).toEqual(user);
```

`toHaveBeenCalledWith({ id: 1 })` is the critical assertion here. It verifies the service passes the id inside an object `{ id: 1 }` to `findOneBy` — not the raw value `1`. TypeORM's `findOneBy` requires an object whose keys match entity column names. Passing `1` directly would silently fail to find any record.

#### `it('throws NotFoundException when user does not exist')`

```typescript
mockRepository.findOneBy.mockResolvedValue(null);

await expect(service.findOne(999)).rejects.toThrow(NotFoundException);
expect(mockRepository.findOneBy).toHaveBeenCalledWith({ id: 999 });
```

`mockResolvedValue(null)` simulates a database miss. The service's guard:

```typescript
if (!user) throw new NotFoundException(`User with id ${id} not found`);
```

`rejects.toThrow(NotFoundException)` asserts the promise rejects **and** the rejection is specifically a `NotFoundException`. Passing just `Error` would be too loose.

---

### `describe('findOneByEmail')`

#### `it('returns the user when found')`

```typescript
expect(mockRepository.findOneBy).toHaveBeenCalledWith({
  email: 'alice@example.com',
});
```

Asserts the repository was called with the `email` key — not `id`, not a raw string. Catches any bug where the service queries by the wrong column.

#### `it('throws NotFoundException when user does not exist')`

Standard not-found path — `null` from the repository triggers the `NotFoundException` guard.

#### `it('decodes a URL-encoded email before querying the repository')`

```typescript
await service.findOneByEmail('alice%40example.com');

expect(mockRepository.findOneBy).toHaveBeenCalledWith({
  email: 'alice@example.com',
});
```

This test is the most important one in `findOneByEmail`. The service calls `decodeURIComponent(email)` before passing the value to the repository. Email addresses contain `@` which becomes `%40` when URL-encoded in a route parameter. Without `decodeURIComponent`, `findOneBy({ email: 'alice%40example.com' })` would find no record because the stored email is `alice@example.com`.

This test passes `'alice%40example.com'` (URL-encoded) and asserts the repository receives `'alice@example.com'` (decoded). If someone removed the `decodeURIComponent` call, all other tests would still pass — this is the only test that would catch that regression.

---

### `describe('create')`

#### `it('stores a bcrypt hash, not the plaintext password')`

```typescript
mockRepository.findOneBy.mockResolvedValue(null);
mockRepository.create.mockImplementation((dto: CreateUserDto) => ({ ...dto }));
mockRepository.save.mockImplementation((user) =>
  Promise.resolve({ id: 1, ...user }),
);

await service.create({
  name: 'Alice',
  email: 'alice@example.com',
  password: 'plaintext123',
});

const savedArg = mockRepository.save.mock.calls[0][0];
expect(savedArg.password).not.toBe('plaintext123');
expect(await bcrypt.compare('plaintext123', savedArg.password)).toBe(true);
```

**Why `mockRepository.create.mockImplementation`?** The service calls `this.userRepository.create(dto)` which in TypeORM creates an entity instance from a plain object. The mock needs to return something (the created entity object) that then gets passed to `save`. Using `mockImplementation((dto) => ({ ...dto }))` makes the mock return a spread of the input — the same fields including the hashed password — so `save` receives a realistic argument.

**`mockRepository.save.mock.calls[0][0]`** — accesses the first argument of the first call to `mockRepository.save`. This is the entity object the service tried to persist.

**Two assertions, not one:**

- `expect(savedArg.password).not.toBe('plaintext123')` — proves the password was not stored in plaintext.
- `expect(await bcrypt.compare('plaintext123', savedArg.password)).toBe(true)` — proves the stored string is a valid bcrypt hash of the original password, not just some random modified string. Both are needed: the first alone would pass if the service stored `undefined`; the second alone would be redundant if the first failed.

**bcrypt's salt** — bcrypt generates a new random salt on every `hash()` call. The hash of `'plaintext123'` is different every time. You cannot assert `expect(savedArg.password).toBe('<some fixed hash>')`. You must use `bcrypt.compare` to verify the relationship between plaintext and hash.

#### `it('throws BadRequestException and does not save when email already exists')`

```typescript
mockRepository.findOneBy.mockResolvedValue({ id: 1, email: 'alice@example.com' });

await expect(
  service.create({ ... }),
).rejects.toThrow(
  new BadRequestException('User with email alice@example.com already exists'),
);

expect(mockRepository.save).not.toHaveBeenCalled();
```

**Passing an instance to `rejects.toThrow`** — when you pass a class (`NotFoundException`), Jest checks the error type. When you pass an instance (`new BadRequestException('...')`), Jest checks both the type and the `message` property. This locks down the exact error contract the service exposes to callers.

**`expect(mockRepository.save).not.toHaveBeenCalled()`** — confirms the guard worked. If the service threw but somehow still called `save` (a bug from a missing `return` or misplaced await), this assertion would catch it. The service must not attempt to persist anything after detecting a duplicate.

---

### `describe('update')`

#### `it('calls repository.update with correct args when user exists')`

```typescript
expect(mockRepository.findOneBy).toHaveBeenCalledWith({ id: 1 });
expect(mockRepository.update).toHaveBeenCalledWith(
  { id: 1 },
  { name: 'Alice Updated', email: 'alice@example.com' },
);
```

The update method calls `findOneBy` first (existence check), then `update`. Both calls are asserted separately. The `update` assertion verifies both arguments: the filter object `{ id: 1 }` and the update payload `{ name, email }`. This catches a bug where the service updates by the wrong identifier or passes incorrect fields.

#### `it('throws NotFoundException and does not call update when user does not exist')`

```typescript
expect(mockRepository.update).not.toHaveBeenCalled();
```

If the user doesn't exist, the service should throw before ever touching `update`. The `not.toHaveBeenCalled()` assertion confirms the guard short-circuits correctly. Without this, a broken guard that throws but also calls `update` would slip through.

---

### `describe('delete')`

Same structure as `update`. The service calls `findOneBy` first, then `delete`. Both paths are tested: success (both calls made, result returned) and not-found (exception thrown, `delete` never called).

The `not.toHaveBeenCalled()` assertion on `mockRepository.delete` is especially important here because TypeORM's `delete` does not error on a missing record — it silently returns `{ affected: 0 }`. Without the existence check in the service, deleting a non-existent user would silently succeed. The test confirms the guard is in place.

---

## `src/user/user.controller.spec.ts`

The controller test verifies that the controller correctly delegates to the service and does not swallow exceptions.

### Mock Setup

```typescript
const mockUserService = {
  findAll: jest.fn(),
  findOne: jest.fn(),
  findOneByEmail: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
};
```

All six service methods are mocked. The controller has no business logic of its own — it receives a request, calls the service, and returns the result. Tests verify those three things precisely.

### Module Setup

```typescript
const module: TestingModule = await Test.createTestingModule({
  controllers: [UserController],
  providers: [{ provide: UserService, useValue: mockUserService }],
}).compile();
```

`UserController` is the class under test. `UserService` is replaced with the mock. Note that `@nestjs/swagger` decorators (`@ApiTags`, `@ApiResponse`, etc.) on the controller are metadata-only and have no effect in unit tests — they do not cause errors.

### `afterEach(() => jest.clearAllMocks())`

`clearAllMocks` (not `resetAllMocks`) is used here. The controller tests only set `mockResolvedValue` or `mockRejectedValue` per test — they do not set persistent `mockImplementation`. `clearAllMocks` is sufficient to reset call history between tests without resetting implementations.

---

### `describe('findAll')`

#### `it('returns the full user list from the service')`

```typescript
mockUserService.findAll.mockResolvedValue(users);
const result = await controller.findAll();
expect(mockUserService.findAll).toHaveBeenCalledTimes(1);
expect(result).toEqual(users);
```

Verifies the controller calls `findAll` exactly once and returns exactly what the service provides. If the controller added any transformation to the return value, this test would catch it.

#### `it('returns an empty array when no users exist')`

```typescript
mockUserService.findAll.mockResolvedValue([]);
const result = await controller.findAll();
expect(result).toEqual([]);
```

The controller must not replace `[]` with `null` or omit the response body. This test ensures pass-through behaviour on the empty case.

---

### `describe('findOne')`

#### `it('calls the service with the correct id and returns the result')`

```typescript
expect(mockUserService.findOne).toHaveBeenCalledWith(1);
expect(mockUserService.findOne).toHaveBeenCalledTimes(1);
expect(result).toEqual(user);
```

The `ParseIntPipe` on the route parameter (`@Param('id', ParseIntPipe)`) converts the string `"1"` to the number `1` before the controller method runs. In the unit test, you call `controller.findOne(1)` directly (bypassing the pipe), so the argument `1` is already the correct type. The `toHaveBeenCalledWith(1)` assertion verifies the number is passed through unchanged.

#### `it('propagates NotFoundException when the service throws')`

```typescript
mockUserService.findOne.mockRejectedValue(
  new NotFoundException('User with id 999 not found'),
);

await expect(controller.findOne(999)).rejects.toThrow(NotFoundException);
```

The controller must not catch or transform the exception from the service. NestJS's built-in exception filter handles `HttpException` subclasses (including `NotFoundException`) and converts them to appropriate HTTP responses. If the controller caught and swallowed this exception, the client would receive a 200 instead of a 404. This test confirms the exception propagates unchanged.

---

### `describe('findOneByEmail')`

Same structure as `findOne`. The key distinction: `toHaveBeenCalledWith('alice@example.com')` verifies the email string is passed through unchanged. The controller has no URL-decoding logic — that lives in the service. If the service stopped decoding, the controller test would not catch it, but `user.service.spec.ts` would.

---

### `describe('create')`

#### `it('calls the service with the correct dto and returns the created user')`

```typescript
expect(mockUserService.create).toHaveBeenCalledWith(dto);
expect(result).toEqual(created);
```

Verifies the controller passes the entire DTO object to the service without modifying any field. Note that in the unit test, the DTO is passed as a plain object — `ValidationPipe` does not run in unit tests. The E2E tests cover validation.

#### `it('propagates BadRequestException when email already exists')`

```typescript
expect(mockUserService.create).toHaveBeenCalledWith(dto);
```

Even when the service throws, the controller must have called the service with the correct DTO first. This assertion confirms the error does not originate from the controller itself (which would mean the controller called the service wrong before the exception).

---

### `describe('update')`

#### `it('calls the service with the correct id and dto')`

```typescript
expect(mockUserService.update).toHaveBeenCalledWith(1, dto);
```

Two arguments: the numeric id and the update DTO. The controller passes both and the test verifies both are correct.

#### `it('propagates NotFoundException when user does not exist')`

```typescript
await expect(controller.update(999, dto)).rejects.toThrow(NotFoundException);
expect(mockUserService.update).toHaveBeenCalledWith(999, dto);
```

The exception propagation test also asserts that the service was called — confirming the error came from the service, not from something the controller did before calling the service.

---

### `describe('delete')`

Same pattern as `update`. `toHaveBeenCalledWith(1)` verifies the numeric id is passed correctly. The not-found path confirms the `NotFoundException` from the service propagates to the caller (ultimately returning a 404 HTTP response when run in a real app).

---

## `test/app.e2e-spec.ts`

The E2E test file boots the complete NestJS application once and runs all HTTP tests against it. Unlike unit tests, nothing is mocked — the real database, real validation pipeline, real exception filters, and real route matching all participate.

### `beforeAll` — Application Lifecycle

```typescript
beforeAll(async () => {
  process.env.DATABASE_URL = ':memory:';
  process.env.NODE_ENV = 'test';

  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  app = moduleFixture.createNestApplication();

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.useLogger(false);
  await app.init();
});
```

**`process.env.DATABASE_URL = ':memory:'`** — Set before the module is created. `ConfigModule` reads from `process.env` at startup. TypeORM receives `:memory:` as the database path, which instructs `better-sqlite3` to create an in-memory database that exists only for the duration of the test process. Every E2E test run starts with a completely empty database. This ensures tests are isolated from real data and from each other across runs.

**`process.env.NODE_ENV = 'test'`** — Ensures `synchronize: true` is active (the condition in `app.module.ts` is `NODE_ENV !== 'production'`). TypeORM automatically creates the database schema from entity definitions at startup. No migrations need to run.

**`beforeAll` not `beforeEach`** — The application boots once and all tests share the same instance. `beforeEach` would boot a fresh application for every test — with 17 tests, that is 17 full NestJS application startups plus 17 database initializations. `beforeAll` boots once in approximately 500ms and all tests run against the same instance. Database state accumulates between tests by design — delete tests verify that subsequent reads return 404.

**`app.useGlobalPipes(new ValidationPipe(...))`** — The `ValidationPipe` is configured in `main.ts` which is not called during testing. Without explicitly wiring the pipe here, the `forbidNonWhitelisted` and `whitelist` options would be inactive and the validation tests would all fail (unknown fields would be accepted, invalid emails would pass through).

**`app.useLogger(false)`** — Disables all logging during the test run. Without this, Pino outputs a JSON line for every request in the test suite, which pollutes the Jest output and makes it difficult to read test results.

### `afterAll`

```typescript
afterAll(async () => {
  await app.close();
});
```

Gracefully shuts down the NestJS application after all tests complete. This closes the HTTP server, the TypeORM connection, and any other open handles. Without this, Jest may hang waiting for open handles to close.

### `createdUserId`

```typescript
let createdUserId: number;
```

Declared at the `User endpoints` describe scope. The `POST /user/create` test sets this variable from the response body. Subsequent tests (`GET /user/:id`, `PUT /user/:id`, `DELETE /user/:id`) use this id to reference the same user. This creates intentional order-dependence within the User endpoints suite — the tests are sequential by design, each building on the state left by the previous one.

---

### `describe('GET /health')`

```typescript
it('returns 200 with status healthy', () => {
  return request(app.getHttpServer())
    .get('/health')
    .expect(200)
    .expect({ status: 'healthy' });
});
```

`app.getHttpServer()` retrieves the underlying Node.js HTTP server from NestJS. `request(server)` from `supertest` wraps it and allows chained HTTP assertions. `.expect(200)` asserts the status code. `.expect({ status: 'healthy' })` asserts the response body matches the object exactly (supertest compares JSON).

---

### `describe('GET /')`

```typescript
it('returns 200 Hello World', () => {
  return request(app.getHttpServer())
    .get('/')
    .expect(200)
    .expect('Hello World!');
});
```

`.expect('Hello World!')` asserts the response body is the exact string — not a JSON object.

---

### `describe('POST /user/create')`

#### `it('creates a user and returns 201 without a password field')`

```typescript
const res = await request(app.getHttpServer())
  .post('/user/create')
  .send({ name: 'Alice', email: 'alice@example.com', password: 'Secret123!' })
  .expect(201);

expect(res.body.password).toBeUndefined();
createdUserId = res.body.id;
```

This test does more than verify a 201. `expect(res.body.password).toBeUndefined()` verifies that the `password` field — marked `select: false` on the `User` entity — is excluded from the API response. This is a **security contract test**. If someone removed `select: false` from the entity, this test would fail immediately, preventing a password hash leak.

`createdUserId = res.body.id` captures the auto-generated id for all subsequent tests in the User endpoints suite.

#### `it('returns 400 when email already exists')`

Sends the same email as the previous test. The `UserService.create` guard detects the duplicate and throws `BadRequestException`. The test verifies the 400 status. This test relies on the state left by the previous test (Alice was already created).

#### `it('returns 400 when email format is invalid')`

`ValidationPipe` with `class-validator`'s `@IsEmail()` on `CreateUserDto.email` rejects `'not-an-email'` before the request reaches the service. Returns 400. This test proves the `ValidationPipe` is actually active in the E2E setup — without the `app.useGlobalPipes(...)` call in `beforeAll`, this test would pass the email through and the service would try to create a user with an invalid email.

#### `it('returns 400 when password is shorter than 8 characters')`

`@MinLength(8)` on `CreateUserDto.password` rejects `'short'`. Tests the MinLength constraint specifically.

#### `it('returns 400 when required fields are missing')`

Sends only `{ email: 'incomplete@example.com' }`. `@IsNotEmpty()` and the missing `name` and `password` fields trigger 400. Tests that the DTO correctly marks all fields as required.

#### `it('returns 400 when unknown fields are sent (forbidNonWhitelisted)')`

```typescript
.send({ name: 'Bob', email: 'bob@example.com', password: 'Secret123!', role: 'admin' })
.expect(400);
```

`forbidNonWhitelisted: true` in the `ValidationPipe` config rejects any field not declared in the DTO. `role` is not in `CreateUserDto` so the request is rejected. This is the most important `ValidationPipe` test — it verifies that attackers cannot sneak extra fields into the request body. Without `forbidNonWhitelisted`, a `role: 'admin'` field would silently pass through to the service.

---

### `describe('GET /user/all')`

```typescript
expect(res.body.every((u: any) => u.password === undefined)).toBe(true);
```

Verifies that `select: false` on the password field works across the entire list — not just on a single user fetch. Every user in the array must have `password: undefined`. `.every()` ensures no user slips through with a password exposed.

---

### `describe('GET /user/:id')`

#### `it('returns 200 with the user when found')`

Uses `createdUserId` set in the create test. Asserts `res.body.id` matches and password is absent.

#### `it('returns 404 when user does not exist')`

`GET /user/99999` — a user id that was never created. The service throws `NotFoundException`, NestJS's exception filter converts it to a 404 response. This is the test that validated the bug fix from earlier in the project (the endpoint was returning 200 with `null` body before `NotFoundException` was added to `findOne`).

#### `it('returns 400 when id is not a number (ParseIntPipe)')`

`GET /user/not-a-number` — `ParseIntPipe` on the `@Param('id')` parameter attempts `parseInt('not-a-number')`, fails, and throws a `BadRequestException` before the controller method is even invoked. Returns 400.

---

### `describe('PUT /user/:id')`

#### `it('returns 200 and updates the user')`

Uses the `createdUserId`. After this test, Alice's email has changed to `alice.updated@example.com`. Subsequent tests that reference Alice by id still work because the id has not changed.

#### `it('returns 404 when user does not exist')`

`PUT /user/99999` — the service's existence check (`findOneBy` before `update`) throws `NotFoundException`. Returns 404.

---

### `describe('DELETE /user/:id')`

#### `it('returns 200 and deletes the user')`

Deletes the user created at the start of the suite. After this test, the database is empty again.

#### `it('returns 404 on subsequent GET after deletion')`

`GET /user/${createdUserId}` — the same id that was just deleted. Returns 404. This test explicitly verifies the delete actually removed the record rather than just returning 200 without doing anything. This is the "verify the side effect" pattern: don't trust the operation's return value alone; verify the state has changed.

#### `it('returns 404 when deleting a non-existent user')`

`DELETE /user/99999` — the service's guard throws `NotFoundException` before reaching `repository.delete`. Returns 404. This test validates the bug fix where `delete` previously returned 200 for non-existent ids.

---

## Running Tests

```bash
# Run all unit tests
pnpm run test

# Run unit tests in watch mode (re-runs on file changes)
pnpm run test:watch

# Run unit tests with coverage report
pnpm run test:cov

# Run tests for a specific file
pnpm run test -- --testPathPattern=user.service

# Run all E2E tests
pnpm run test:e2e

# Run both unit and E2E
pnpm run test && pnpm run test:e2e
```

The `--forceExit` flag can be passed to Jest if tests hang after completion due to the SQLite file handle not releasing:

```bash
pnpm run test:e2e -- --forceExit
```
