# Postgres everywhere, not just production

**Status**: accepted

We migrated off SQLite entirely — both local development and production run PostgreSQL, rather than keeping SQLite for the fast local dev loop and only using Postgres in production. This project exists partly to get hands-on practice with Postgres and AWS deployment, so dev/prod parity is the point rather than an inconvenience: a split setup would let SQLite-vs-Postgres dialect differences hide until deploy time instead of surfacing during normal development.

## Considered Options

- **SQLite for dev, Postgres for prod** — the conventional lower-friction default, and what was initially recommended. Rejected: it would remove the exact hands-on Postgres practice this project is for, and risks dialect-specific bugs (SQL syntax, type coercion) only showing up at deploy time.

## Consequences

- Local development now requires a running Postgres instance (the `docker-compose.yml` Postgres service) instead of a zero-dependency SQLite file.
- The `better-sqlite3` dependency and its TypeORM config are removed entirely from `app.module.ts` and `src/db/data-source.ts`.
