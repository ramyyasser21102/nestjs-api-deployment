# Keep TypeORM, don't switch to Drizzle/Prisma/Kysely

**Status**: accepted

While rebuilding PostgreSQL support we evaluated switching ORMs — Drizzle in particular, for its closer-to-SQL style and better fit for a learning project (see [ADR 0001](./0001-postgres-everywhere.md) for the project's learning-parity motivation). We decided to stay on TypeORM for this effort.

An ORM swap would touch the same files this Postgres migration already touches (`data-source.ts`, `app.module.ts`, migration tooling, `package.json`), which made it tempting to bundle in. We're deferring it anyway: swapping ORM and swapping database engine at the same time makes it hard to tell which change caused a given bug, and an ORM switch is substantial enough to deserve its own dedicated learning effort rather than riding along as a side effect of this one.

## Consequences

- Candidate #3's fix (extracting the shared datasource config between `data-source.ts` and `app.module.ts`) stays in scope as originally planned — a Drizzle switch would have made that duplication disappear entirely instead of needing a refactor.
- An ORM swap (most likely to Drizzle) remains a live candidate for a future, separately-scoped learning effort.
