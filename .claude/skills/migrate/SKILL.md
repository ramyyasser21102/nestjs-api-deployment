---
name: migrate
description: Generate, run, revert, or inspect TypeORM migrations for this NestJS project. Use when working with entity schema changes or production database evolution.
---

This project has **two separate TypeORM datasource configurations** — a common NestJS pattern:

- `src/db/data-source.ts` — loaded only by the TypeORM CLI via `ts-node` (migration commands)
- `app.module.ts` TypeOrmModule.forRootAsync — loaded at runtime by NestJS

Migration commands target `src/db/data-source.ts` only. Changes to `app.module.ts` don't affect the CLI datasource and vice versa — keep entity lists in sync between both.

## Workflow

1. Make entity changes in `src/**/*.entity.ts`
2. Create the migrations directory if it doesn't exist yet: `src/db/migrations/`
3. Generate a migration from the entity diff (replace `MigrationName` with a descriptive PascalCase name):
   ```bash
   pnpm run migration:generate -- src/db/migrations/MigrationName
   ```
4. **Review the generated migration file** before running — auto-generation can produce unsafe operations (column drops, type changes)
5. Run pending migrations:
   ```bash
   pnpm run migration:run
   ```
6. Check which migrations have been applied:
   ```bash
   pnpm run migration:show
   ```
7. Revert the last applied migration if needed:
   ```bash
   pnpm run migration:revert
   ```

## Important Caveats

- `synchronize: true` is active in dev — auto-sync masks migration issues locally. Test migrations against a clean database or temporarily set `NODE_ENV=production` to disable auto-sync.
- The CLI datasource uses `DATABASE_URL` from `.env` via dotenv. Ensure the variable is set before running migration commands outside Docker.
- Production deployments must run `migration:run` explicitly — `synchronize` is `false` in prod.
