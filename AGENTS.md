# Repository Guidelines

## Project Structure & Module Organization

Application code lives in `src/`. NestJS features are grouped by domain, such as
`src/user/` and `src/health/`, with each domain containing its module,
controller, service, DTOs/entities, and unit tests. Shared decorators and pipes
belong in `src/common/`. Database configuration is under `src/db/`, while seed
scripts live in `src/seed/`. End-to-end tests and their Jest configuration are
kept in `test/`. Deployment and testing notes are in `docs/`; compiled output is
written to `dist/`.

## Build, Test, and Development Commands

Use `pnpm` exclusively.

- `pnpm install` installs dependencies.
- `pnpm run start:dev` starts the SWC-powered development server with watch mode.
- `pnpm run build` cleans and compiles the application into `dist/`.
- `pnpm run typecheck` checks TypeScript without emitting files.
- `pnpm run lint:check` and `pnpm run format:check` perform non-mutating checks.
- `pnpm run test`, `pnpm run test:cov`, and `pnpm run test:e2e` run unit,
  coverage, and end-to-end suites.
- `pnpm run docker:dev` builds and starts the local Docker environment.

## Coding Style & Naming Conventions

Write TypeScript formatted by Prettier and validated by the flat ESLint config in
`eslint.config.mjs`. Existing files use two-space indentation, single quotes,
trailing commas, and semicolons. Follow NestJS naming conventions:
`user.service.ts`, `user.controller.ts`, and `user.module.ts`; use PascalCase for
classes and camelCase for methods and variables. Keep feature-specific code in
its domain directory and export shared utilities through nearby `index.ts`
files. Do not add legacy `.eslintrc` files.

## Testing Guidelines

Jest is the unit-test framework; Supertest supports E2E coverage. Name unit tests
`*.spec.ts` beside the implementation. Name E2E tests `*.e2e-spec.ts` in
`test/`. Add or update tests for behavioral changes, including success and
failure paths. Run `pnpm run test` and `pnpm run test:e2e` before requesting
review; use `test:cov` to inspect coverage, although no numeric threshold is
currently enforced.

## Commit & Pull Request Guidelines

Recent history mixes descriptive sentences with Conventional Commit subjects.
Prefer concise scoped messages such as `feat(user): add password validation` or
`fix(health): report database failures`. Branches should use `feature/`, `fix/`,
or `chore/` prefixes. Pull requests should explain the change and verification
steps, link relevant issues, identify configuration or migration impacts, and
include screenshots only for visible API documentation or UI changes.

## Security & Configuration

Never commit secrets. Configure `DATABASE_URL`, `NODE_ENV`, `PORT`, and future
credentials through environment variables. Treat `docker:down:volumes` as
destructive because it removes persisted SQLite data. Runtime and migration
datasources are separate; keep `src/db/data-source.ts` aligned with runtime
TypeORM configuration.
