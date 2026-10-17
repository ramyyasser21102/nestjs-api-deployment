#!/usr/bin/env bash

set -euo pipefail

APP_NAME="nestjs-api"
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Deploy-time settings (LOG_DRIVER, AWS_REGION, LOG_GROUP, ...) live in a
# gitignored .env.deploy on this box. Separate from $ENV_FILE below, which is
# the app's runtime .env passed wholesale to the container.
DEPLOY_ENV_FILE="${DEPLOY_ENV_FILE:-$APP_DIR/.env.deploy}"
if [ -f "$DEPLOY_ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  source "$DEPLOY_ENV_FILE"
  set +a
fi

ENV_FILE="${ENV_FILE:-$APP_DIR/.env}"
PORT="${PORT:-3000}"
LOG_DRIVER="${LOG_DRIVER:-json-file}"

"$APP_DIR/scripts/check-deps.sh"

if [ ! -f "$ENV_FILE" ]; then
  echo "ERROR: $ENV_FILE not found." >&2
  echo "Create it with DATABASE_URL (pointed at the RDS endpoint), NODE_ENV=production, and PORT=$PORT before deploying." >&2
  exit 1
fi

IMAGE_TAG="$(git -C "$APP_DIR" rev-parse --short HEAD)"
IMAGE="$APP_NAME:$IMAGE_TAG"

echo "==> Building $IMAGE"
docker build --target prod -t "$IMAGE" -t "$APP_NAME:latest" "$APP_DIR"

echo "==> Running migrations against \$DATABASE_URL in $ENV_FILE"
docker run --rm --env-file "$ENV_FILE" "$IMAGE" pnpm run migration:run

echo "==> Stopping previous container (if any)"
docker stop "$APP_NAME" >/dev/null 2>&1 || true
docker rm "$APP_NAME" >/dev/null 2>&1 || true

echo "==> Starting $IMAGE (log driver: $LOG_DRIVER)"
LOG_ARGS=()
if [ "$LOG_DRIVER" = "awslogs" ]; then
  AWS_REGION="${AWS_REGION:?Set AWS_REGION in $DEPLOY_ENV_FILE when LOG_DRIVER=awslogs}"
  LOG_GROUP="${LOG_GROUP:?Set LOG_GROUP in $DEPLOY_ENV_FILE when LOG_DRIVER=awslogs}"
  LOG_ARGS=(
    --log-driver awslogs
    --log-opt awslogs-region="$AWS_REGION"
    --log-opt awslogs-group="$LOG_GROUP"
    --log-opt awslogs-create-group=true
  )
fi

docker run -d \
  --name "$APP_NAME" \
  --restart unless-stopped \
  -p "$PORT:$PORT" \
  --env-file "$ENV_FILE" \
  "${LOG_ARGS[@]}" \
  "$IMAGE"

echo "==> Waiting for /health"
for _ in $(seq 1 15); do
  if curl -sf "http://localhost:$PORT/health" >/dev/null; then
    echo "==> Deploy succeeded: $IMAGE is healthy"
    exit 0
  fi
  sleep 2
done

echo "ERROR: /health did not become healthy after deploy." >&2
echo "Check: docker logs $APP_NAME" >&2
exit 1
