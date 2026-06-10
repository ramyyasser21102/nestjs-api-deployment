# Dockerfile

This document explains the multi-stage `Dockerfile` used to build and run this NestJS backend.

## Overview

The file defines four build stages:

| Stage   | Purpose                                              |
| ------- | ---------------------------------------------------- |
| `base`  | Shared foundation (Node, pnpm, dependency manifests) |
| `dev`   | Local development with hot-reload                    |
| `build` | Compiles TypeScript to JavaScript                    |
| `prod`  | Minimal production image with compiled output only   |

Stages share layers where possible so dependency installs are cached until `package.json` or `pnpm-lock.yaml` change.

---

## Stage 1: `base`

```dockerfile
FROM node:22-alpine AS base
RUN npm install -g pnpm@9
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
```

- **`FROM node:22-alpine AS base`** — Starts from the official Node.js 22 image on Alpine Linux. Alpine keeps images small (~5 MB base vs. much larger Debian variants).
- **`RUN npm install -g pnpm@9`** — Installs pnpm globally. Version 9 matches the lockfile format used in this project.
- **`WORKDIR /app`** — Sets `/app` as the working directory for all following instructions.
- **`COPY package.json pnpm-lock.yaml ./`** — Copies only dependency manifests first. Docker caches this layer separately from source code, so a code change does not force a full reinstall of `node_modules`.

---

## Stage 2: `dev`

```dockerfile
FROM base AS dev
RUN pnpm install --frozen-lockfile
COPY . .
ENV NODE_ENV=development
EXPOSE 3000
CMD ["pnpm", "run", "start:dev"]
```

Used for local development (see `docker-compose.yml`, which builds with `target: dev`).

- **`FROM base AS dev`** — Inherits Node, pnpm, and the copied manifests from `base`.
- **`RUN pnpm install --frozen-lockfile`** — Installs all dependencies, including `devDependencies` (TypeScript, NestJS CLI, etc.). `--frozen-lockfile` fails if the lockfile is out of sync with `package.json`.
- **`COPY . .`** — Copies the full project into `/app`. When run via Compose, a bind mount overlays this directory for live editing.
- **`ENV NODE_ENV=development`** — Signals development mode to NestJS and other libraries.
- **`EXPOSE 3000`** — Documents that the app listens on port 3000. Does not publish the port; that is done in `docker-compose.yml` or `docker run -p`.
- **`CMD ["pnpm", "run", "start:dev"]`** — Runs `nest start --watch`, which recompiles and restarts the server when source files change.

---

## Stage 3: `build`

```dockerfile
FROM base AS build
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm run build
```

This stage is not run on its own. It exists to produce compiled output for the `prod` stage.

- **`FROM base AS build`** — Same foundation as `dev`.
- **`RUN pnpm install --frozen-lockfile`** — Full install including build tools (`@nestjs/cli`, TypeScript, etc.).
- **`COPY . .`** — Copies source code.
- **`RUN pnpm run build`** — Runs `nest build`, compiling `src/` into `dist/`.

---

## Stage 4: `prod`

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

A lean image intended for deployment.

- **`FROM node:22-alpine`** — Starts fresh instead of inheriting from `base`, so no dev tooling or intermediate files leak in.
- **`RUN pnpm install --frozen-lockfile --prod`** — Installs **production dependencies only**. Dev tools (compiler, test runners, CLI) are excluded.
- **`COPY --from=build /app/dist ./dist`** — Copies compiled JavaScript from the `build` stage. The final image contains the build output without the compiler that produced it.
- **`ENV NODE_ENV=production`** — Enables production optimizations in Node.js and dependent libraries.
- **`CMD ["node", "dist/main"]`** — Runs the compiled entry point directly. No TypeScript compilation at startup.

---

## `dev` vs `prod`

|               | `dev`                           | `prod`                             |
| ------------- | ------------------------------- | ---------------------------------- |
| Image size    | Larger (all devDependencies)    | Smaller (runtime deps only)        |
| Start command | `nest start --watch`            | `node dist/main`                   |
| Source        | TypeScript, compiled on the fly | Pre-compiled JavaScript in `dist/` |
| Use case      | Local development               | Deployment                         |

---

## Building each stage

```bash
# Development image (used by docker compose)
docker build --target dev -t app:dev .

# Production image
docker build --target prod -t app:prod .

# Run production container
docker run -p 3000:3000 app:prod
```

For day-to-day local work, use `docker compose up --build`, which targets the `dev` stage automatically.
