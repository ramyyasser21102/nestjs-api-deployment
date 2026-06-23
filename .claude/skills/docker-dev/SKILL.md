---
name: docker-dev
description: Start, stop, rebuild, or inspect the Docker dev environment. Use when spinning up the full dev stack, checking logs, or resetting the database volume.
---

This project uses a multi-stage Dockerfile. The `dev` stage mounts source files and runs `pnpm run start:dev` (SWC watch mode) for hot reload inside the container.

## Commands

```bash
pnpm run docker:dev            # Build images and start containers
pnpm run docker:down           # Stop and remove containers
pnpm run docker:down:volumes   # Stop, remove containers, AND wipe volumes — destroys SQLite data
```

## Key Details

- App is exposed on port **3000**
- SQLite database persists in the `sqlite-data` Docker volume at `/data/app.db`
- Node modules live in a separate Docker volume — never mount them from the host
- `CHOKIDAR_USEPOLLING=true` is set in compose — required for file-change detection on mounted volumes
- After running `pnpm add <package>`, re-run `docker:dev` to rebuild the image with updated deps

## Useful Operational Commands

```bash
# Tail live logs
docker compose logs -f backend

# Open a shell inside the running container
docker compose exec backend sh

# Run a one-off command inside the container (e.g. migrations)
docker compose exec backend pnpm run migration:run
```

## Caution

`docker:down:volumes` is destructive — it removes the `sqlite-data` volume and all database contents. Use `docker:down` unless a full reset is intended.
