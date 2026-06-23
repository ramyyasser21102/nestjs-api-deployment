# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Package Manager

Use `pnpm` exclusively. Do not use npm or yarn.

## Key Commands

```bash
pnpm run build          # TypeScript build (nest build)
pnpm run build:swc      # SWC-based build (faster)
pnpm run start:dev      # Dev server with hot reload (SWC)
pnpm run start:debug    # Debug mode — uses TypeScript compiler, not SWC
pnpm run lint           # ESLint with auto-fix
pnpm run lint:check     # ESLint check only (no fix)
pnpm run format         # Prettier write
pnpm run format:check   # Prettier check only
pnpm run test           # Unit tests
pnpm run test:e2e       # E2E tests (separate jest-e2e.json config)
```

## SWC vs TypeScript Compiler

Default dev/build commands use SWC (`-b swc`) for faster compilation. `start:debug` uses the standard TypeScript compiler — switch to it only when SWC output lacks readable source maps.

## TypeORM — Two Datasource Configs

There are **two separate datasource configurations**:

- `src/db/data-source.ts` — used exclusively by the TypeORM CLI (migrations)
- `app.module.ts` TypeOrmModule.forRootAsync — used at runtime

Migration commands load `src/db/data-source.ts` via `ts-node`:

```bash
pnpm run migration:generate -- src/db/migrations/MigrationName
pnpm run migration:run
pnpm run migration:revert
pnpm run migration:show
```

`synchronize: true` in development (auto-syncs schema). Production requires explicit migrations (`synchronize: false`). No `src/db/migrations/` directory exists yet — create it before generating the first migration.

## Docker Dev Environment

```bash
pnpm run docker:dev            # Build + start (docker compose up --build)
pnpm run docker:down           # Stop
pnpm run docker:down:volumes   # Stop and wipe volumes (destroys SQLite data)
```

SQLite persists at `/data/app.db` in the `sqlite-data` Docker volume. `CHOKIDAR_USEPOLLING=true` is required in Docker for hot reload on mounted volumes. After adding new dependencies, re-run `docker:dev` to rebuild the image.

## Environment Variables

| Variable       | Default       | Notes                                 |
| -------------- | ------------- | ------------------------------------- |
| `DATABASE_URL` | `./db.sqlite` | Path to SQLite file                   |
| `NODE_ENV`     | —             | Controls `synchronize` flag           |
| `PORT`         | `3000`        | HTTP listen port                      |
| `JWT_SECRET`   | —             | Planned — required when auth is added |

## Code Style

Prettier enforces: single quotes, trailing commas (`"all"`), LF line endings, 80-char print width. ESLint uses flat config (`eslint.config.mjs`) — do not create `.eslintrc.*` files. `noImplicitAny` is off; `strictNullChecks` is on.

## Entity and DTO Patterns

- User `password` field has `select: false` — must use `.addSelect('user.password')` to load it explicitly.
- Global `ValidationPipe` is configured with `whitelist: true, forbidNonWhitelisted: true, transform: true` — DTOs must declare all accepted fields.

## Placeholders

`src/common/decorators/`, `src/common/pipes/`, and `src/seed/user.seed.ts` are intentional empty stubs. Implement them proactively when a task naturally calls for a custom decorator, pipe, or seed.

## Branch Naming

Use `feature/`, `fix/`, or `chore/` prefixes (e.g. `feature/add-auth`, `fix/user-query-select`).
