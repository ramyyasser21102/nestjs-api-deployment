# LIVE_MAP.md

Single source of truth for project topology. Read before every feature implementation. Updated after every file creation or modification.

Bootstrapped 2026-08-01 from read-only repo inspection (RES-13ea0ea7). Entries reflect state as discovered, not yet exercised through the mentor-mode deployment path.

### src/app.module.ts

- **Status:** stable
- **Feature:** Root module — wires ConfigModule, nestjs-pino LoggerModule, TypeOrmModule (better-sqlite3, runtime datasource config), UserModule, HealthModule
- **Imports from:** @nestjs/config, @nestjs/typeorm, nestjs-pino, ./health/health.module, ./user/user.entity, ./user/user.module
- **Imported by:** src/main.ts
- **Last modified:** unknown (pre-session)

### src/main.ts

- **Status:** stable
- **Feature:** Application bootstrap entrypoint
- **Imports from:** ./app.module
- **Imported by:** none (entrypoint)
- **Last modified:** unknown (pre-session)

### src/db/data-source.ts

- **Status:** stable
- **Feature:** TypeORM CLI datasource — used exclusively by migration commands, separate from runtime config in app.module.ts
- **Imports from:** typeorm
- **Imported by:** package.json migration:\* scripts (typeorm-ts-node-commonjs)
- **Last modified:** unknown (pre-session)

### src/db/db.module.ts

- **Status:** stable
- **Feature:** Placeholder DB module (9 lines, 0% test coverage — likely unused/unreferenced by app.module.ts, verify before extending)
- **Imports from:** typeorm (assumed)
- **Imported by:** unconfirmed — not seen imported in app.module.ts
- **Last modified:** unknown (pre-session)

### src/health/health.controller.ts, health.service.ts, health.module.ts

- **Status:** stable
- **Feature:** Health check endpoint — controller+service fully tested (100% line coverage on service), module wiring untested (0%, expected for pure DI wiring)
- **Imports from:** @nestjs/common
- **Imported by:** src/app.module.ts
- **Last modified:** unknown (pre-session)

### src/user/user.controller.ts, user.service.ts, user.dto.ts, user.entity.ts, user.module.ts

- **Status:** stable, but two spec files breach the file-length halt condition (see below)
- **Feature:** User CRUD vertical slice — controller thin, service holds logic, DTO validated via class-validator, entity has password with `select: false`
- **Imports from:** @nestjs/common, @nestjs/typeorm, class-validator, class-transformer, bcrypt
- **Imported by:** src/app.module.ts
- **Last modified:** unknown (pre-session)

### src/user/user.service.spec.ts

- **Status:** in-progress — 234 lines, breaches the 200-line hard ceiling
- **Feature:** Unit tests for UserService
- **Imports from:** @nestjs/testing, ./user.service
- **Imported by:** none (test file)
- **Last modified:** unknown (pre-session) — flagged for modularization, first task this session

### src/user/user.controller.spec.ts

- **Status:** in-progress — 187 lines, past the 180-line "approaching ceiling" halt trigger
- **Feature:** Unit tests for UserController
- **Imports from:** @nestjs/testing, ./user.controller
- **Imported by:** none (test file)
- **Last modified:** unknown (pre-session) — flagged, second candidate for modularization

### src/seed/user.seed.ts

- **Status:** stable, 0% coverage (script, not unit-tested by design)
- **Feature:** Manual DB seed script, run via `pnpm run seed`
- **Imports from:** ts-node runtime, typeorm datasource (assumed)
- **Imported by:** package.json seed script
- **Last modified:** unknown (pre-session)

### src/common/decorators/, src/common/pipes/

- **Status:** deprecated status N/A — decorators/ has real content (ApiResponseAuth, ApiResponseCommon); pipes/index.ts is an intentional empty stub per project CLAUDE.md
- **Feature:** Swagger response decorator helpers; pipes stub reserved for future custom pipe
- **Imports from:** @nestjs/swagger (assumed)
- **Imported by:** unconfirmed
- **Last modified:** unknown (pre-session)

### Dockerfile, docker-compose.yml

- **Status:** stable
- **Feature:** Multi-stage Dockerfile (dev/build/prod targets), Compose wires backend service + sqlite-data volume for local dev
- **Imports from:** none
- **Imported by:** pnpm run docker:dev / docker:down scripts
- **Last modified:** unknown (pre-session)

### RESPONSE_LOG.md, LIVE_MAP.md

- **Status:** stable (bootstrap)
- **Feature:** Global-protocol governance files, created this session per user's explicit choice to run full protocol on top of mentor-mode teaching
- **Imports from:** none
- **Imported by:** none
- **Last modified:** 2026-08-01
