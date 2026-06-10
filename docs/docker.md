# Docker Setup

This document explains every Docker file in this project: what each line does, why it exists, and how the pieces connect.

---

## Files Overview

| File                 | Purpose                                                    |
| -------------------- | ---------------------------------------------------------- |
| `Dockerfile`         | Defines how to build the app image (multiple stages)       |
| `docker-compose.yml` | Orchestrates the container for local development           |
| `.dockerignore`      | Tells Docker which files to exclude from the build context |

---

## Dockerfile

A **multi-stage Dockerfile** lets you define several intermediate images inside one file. Each stage starts with `FROM` and gets a name via `AS`. Stages can copy artifacts from each other, which keeps the final image lean.

This file has 4 stages: `base`, `dev`, `build`, and `prod`.

```dockerfile
FROM node:22-alpine AS base
RUN npm install -g pnpm@9
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
```

**`base` stage** — the shared foundation that all other stages build on top of.

- `FROM node:22-alpine` — starts from an official Node.js 22 image built on Alpine Linux. Alpine is a minimal ~5 MB Linux distro; regular Debian-based images are ~100–200 MB. Alpine is preferred for Docker because smaller images pull faster and have a smaller attack surface.
- `RUN npm install -g pnpm@9` — installs pnpm globally inside the image. pnpm@9 matches the lockfile version (`lockfileVersion: '9.0'`) so installs are reproducible.
- `WORKDIR /app` — sets `/app` as the working directory for all subsequent commands. If the directory doesn't exist, Docker creates it. All `COPY`, `RUN`, and `CMD` instructions below this line operate relative to `/app`.
- `COPY package.json pnpm-lock.yaml ./` — copies only the dependency manifests first (not the whole source). This is a deliberate caching strategy: Docker caches each layer. If you copy source code and deps together, any source change invalidates the deps layer and forces a full `pnpm install`. By copying manifests first, the install layer is only re-run when `package.json` or `pnpm-lock.yaml` actually change.

---

```dockerfile
FROM base AS dev
RUN pnpm install --frozen-lockfile
COPY . .
ENV NODE_ENV=development
EXPOSE 3000
CMD ["pnpm", "run", "start:dev"]
```

**`dev` stage** — the image used for local development.

- `FROM base AS dev` — inherits everything from the `base` stage (Node, pnpm, `/app`, and the copied manifests).
- `RUN pnpm install --frozen-lockfile` — installs all dependencies (including `devDependencies`) exactly as specified in `pnpm-lock.yaml`. `--frozen-lockfile` makes the install fail if the lockfile is out of sync with `package.json`, preventing silent version drift.
- `COPY . .` — copies the entire project source into `/app`. In practice, when running with `docker-compose.yml`, a volume mount overlays this — the `COPY` here is a fallback for when someone builds this stage directly with `docker build --target dev`.
- `ENV NODE_ENV=development` — sets the `NODE_ENV` environment variable inside the container. NestJS and many libraries check this variable to enable/disable behaviours (e.g. detailed error messages, dev-only middleware).
- `EXPOSE 3000` — documents that the container listens on port 3000. This is metadata only; it does not actually publish the port. The actual port binding is done in `docker-compose.yml`.
- `CMD ["pnpm", "run", "start:dev"]` — the default command to run when the container starts. `start:dev` maps to `nest start --watch` in `package.json`, which compiles TypeScript on the fly and restarts the server whenever a source file changes (hot-reload).

---

```dockerfile
FROM base AS build
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm run build
```

**`build` stage** — compiles the TypeScript source into JavaScript.

- `FROM base AS build` — again inherits from `base`.
- `RUN pnpm install --frozen-lockfile` — same as dev: installs all deps including `devDependencies`, which includes the TypeScript compiler and NestJS CLI needed to run `nest build`.
- `COPY . .` — copies the full source.
- `RUN pnpm run build` — runs `nest build`, which compiles `src/` to `dist/`. The output directory is configured in `tsconfig.json` (`"outDir": "./dist"`). NestJS CLI also deletes the previous `dist/` before building (`"deleteOutDir": true` in `nest-cli.json`).

> This stage is not run directly — it exists to produce the `dist/` folder that the `prod` stage copies from.

---

```dockerfile
FROM node:22-alpine AS prod
RUN npm install -g pnpm@9
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod
COPY --from=build /app/dist ./dist
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "dist/main"]
```

**`prod` stage** — a minimal, hardened image for actual deployments.

- `FROM node:22-alpine` — starts fresh from the base Node image, not from `base`. This ensures no dev tooling or intermediate files leak into the production image.
- `RUN npm install -g pnpm@9` / `WORKDIR /app` / `COPY package.json pnpm-lock.yaml ./` — same setup as the `base` stage, duplicated here because this stage intentionally does not inherit from `base`.
- `RUN pnpm install --frozen-lockfile --prod` — installs **only production dependencies** (ignores `devDependencies`). This is the key difference: the dev/build stages include the TypeScript compiler, NestJS CLI, testing tools, etc. — none of that belongs in a production image.
- `COPY --from=build /app/dist ./dist` — copies the compiled JavaScript from the `build` stage into this image. This is the multi-stage trick: the final image gets the compiled output without carrying the compiler.
- `ENV NODE_ENV=production` — enables production optimisations in Node.js and libraries.
- `CMD ["node", "dist/main"]` — runs the compiled entry point directly with Node. No TypeScript compiler, no NestJS CLI, no overhead.

### Why keep `dev` and `prod` separate?

| Concern          | `dev`                             | `prod`                         |
| ---------------- | --------------------------------- | ------------------------------ |
| Image size       | Large (all devDeps)               | Small (only runtime deps)      |
| Start command    | `nest start --watch` (TypeScript) | `node dist/main` (compiled JS) |
| Security surface | High (compiler, CLI tools)        | Low (minimal tooling)          |
| Startup speed    | Slower (compilation on start)     | Fast (pre-compiled)            |

---

## docker-compose.yml

Docker Compose is a tool for defining and running multi-container applications. For this project it currently runs a single container, but it manages the networking, volumes, and environment config that would be tedious to pass as flags to `docker run`.

```yaml
services:
  backend:
    build:
      context: .
      dockerfile: Dockerfile
      target: dev
```

- `services` — the top-level key; each entry under it is a container.
- `backend` — the name of this service (used by Compose for networking and CLI targeting).
- `build.context: .` — the **build context** is the directory Docker sends to the daemon when building. `.` means the project root. Only files not excluded by `.dockerignore` are sent.
- `build.dockerfile: Dockerfile` — explicitly names the Dockerfile to use (optional when it's named `Dockerfile` in the context root, but good for clarity).
- `build.target: dev` — tells Docker to stop building at the `dev` stage. The `build` and `prod` stages are not run locally. This keeps the local image smaller and faster to rebuild.

```yaml
container_name: app-backend
```

- Gives the running container a fixed name. Without this, Compose generates a name like `nestjs-api-deployment`. A fixed name makes it easier to reference in logs, `docker exec`, etc.

```yaml
ports:
  - '3000:3000'
```

- Maps port 3000 on your host machine to port 3000 inside the container. Format is `"host:container"`. Without this, the container's port is completely isolated and unreachable from your browser or API client.

```yaml
environment:
  NODE_ENV: development
  DATABASE_URL: 'file:/data/app.db'
  CHOKIDAR_USEPOLLING: 'true'
```

- `NODE_ENV: development` — overrides the `ENV` set in the Dockerfile (same value here, but environment variables in `docker-compose.yml` always take precedence over `ENV` in the Dockerfile).
- `DATABASE_URL: "file:/data/app.db"` — the connection string for SQLite. The `file:` prefix is the Prisma/ORM convention for a file-based database. `/data/app.db` is a path inside the container, backed by the `sqlite-data` volume below. When you add Prisma or another ORM, this variable is already wired up.
- `CHOKIDAR_USEPOLLING: "true"` — `nest start --watch` uses Chokidar under the hood to watch for file changes. Docker Desktop on macOS does not always forward filesystem events (inotify) from the host into the container. Without this flag, file changes on your Mac might not trigger a server restart. Polling solves this at the cost of slightly higher CPU usage (Chokidar checks the filesystem on an interval instead of waiting for OS events).

```yaml
volumes:
  - .:/app
  - /app/node_modules
  - sqlite-data:/data
```

Volumes are one of the most important concepts in Docker development.

- `.:/app` — **bind mount**: mounts your local project directory (`.`) into `/app` inside the container. Every file you save on your host is immediately visible inside the container. This is what makes hot-reload possible — `nest start --watch` sees your file changes and recompiles.
- `/app/node_modules` — **anonymous volume**: mounts an anonymous Docker-managed volume over the `node_modules` directory inside the container. Without this, the bind mount above would overlay the container's `node_modules` with whatever is (or isn't) in your host's `node_modules`. The container's `node_modules` (built for Linux/Alpine inside Docker) would be hidden. By declaring this anonymous volume, Docker preserves the container's own `node_modules` and the bind mount does not overwrite it.
- `sqlite-data:/data` — **named volume**: mounts the `sqlite-data` volume at `/data` inside the container. The SQLite database file (`app.db`) lives here. Named volumes are managed by Docker and persist across `docker compose down` / `docker compose up` cycles. Your data survives container restarts and rebuilds.

```yaml
restart: unless-stopped
```

- Tells Docker to automatically restart the container if it crashes, unless you explicitly stop it with `docker compose stop` or `docker compose down`. Useful during development so a crash doesn't leave you with a dead container you have to manually restart.

```yaml
volumes:
  sqlite-data:
```

- Declares `sqlite-data` as a named volume at the top level. Without this declaration, Compose would reject the reference to `sqlite-data` in the service definition. An empty declaration like this tells Docker to create the volume with default settings if it doesn't already exist.

### Why no separate database container?

The original `docker.compose.yml` had an `alpine:3` container running `sqlite3`. SQLite is not a server — it is an **embedded database** that lives entirely in a single file. There is no SQLite daemon to connect to, no network socket, no port. The application reads and writes the file directly. A separate container for it adds:

- An extra service to manage
- An extra volume mount
- Startup ordering complexity (`depends_on`)
- Zero benefit (the file is already shared via the named volume)

---

## .dockerignore

The `.dockerignore` file works like `.gitignore` but for the Docker build context. When Docker builds an image, it first packages up the build context (the `context: .` directory) and sends it to the Docker daemon. Excluding unnecessary files makes this transfer faster and prevents secrets or large files from ending up in the image.

### What is excluded and why

| Pattern                                                                   | Reason                                                                                                                                                                 |
| ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `node_modules`, `.pnpm-store`, `.npm`, `.yarn`                            | Dependencies are installed inside the image via `pnpm install`; including the host's `node_modules` would be wrong (different OS/arch) and slow                        |
| `dist`, `build`, `coverage`                                               | Build artifacts — the image builds fresh from source                                                                                                                   |
| `logs`, `*.log`                                                           | Log files have no place in an image                                                                                                                                    |
| `.env`, `.env.*` (except `.env.example`)                                  | **Security**: environment files often contain secrets. They must never be baked into an image. The exception for `.env.example` allows a template file to be included. |
| `.git`, `.gitignore`, `.gitattributes`                                    | Git history is irrelevant to the running application                                                                                                                   |
| `docker-compose.override.yml`                                             | Compose override files are not needed inside the image                                                                                                                 |
| `*.db`, `*.sqlite`, `*.sqlite3` (and journal/WAL variants)                | Database files belong in a volume, not in the image                                                                                                                    |
| `.DS_Store`, `Thumbs.db`                                                  | macOS and Windows filesystem metadata                                                                                                                                  |
| `.vscode`, `.idea`                                                        | Editor config — not relevant to the application                                                                                                                        |
| `.tmp`, `tmp`, `.cache`, `.parcel-cache`, `.eslintcache`, `*.tsbuildinfo` | Temporary and incremental-build caches                                                                                                                                 |

---

## How It All Connects

```
Your Machine
└── Project Directory (.)
    ├── Dockerfile          ← defines how to build the image
    ├── docker-compose.yml  ← defines how to run it locally
    └── .dockerignore       ← what NOT to send to Docker

docker compose up --build
    │
    ├── Docker reads docker-compose.yml
    ├── Builds image using Dockerfile (stops at `dev` stage)
    │   ├── base:  installs pnpm, copies package.json + lockfile
    │   └── dev:   runs pnpm install, copies source, sets CMD
    │
    └── Starts container `app-backend`
        ├── Port 3000 on host → port 3000 in container
        ├── Your source code (./) → /app  (hot-reload)
        ├── Container's node_modules protected from host overlay
        ├── sqlite-data volume → /data   (database file persists here)
        └── Runs: pnpm run start:dev     (nest start --watch)
```

---

## Common Commands

```bash
# Start the dev environment (build image if not cached)
docker compose up --build

# Start in background
docker compose up --build -d

# Stop and remove containers (volumes are preserved)
docker compose down

# Stop and remove containers AND volumes (wipes the database)
docker compose down -v

# Tail logs
docker compose logs -f backend

# Open a shell inside the running container
docker exec -it app-backend sh

# Rebuild the image from scratch (no layer cache)
docker compose build --no-cache
```
