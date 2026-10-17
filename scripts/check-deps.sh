#!/usr/bin/env bash
# Idempotent dependency check for the EC2 host. Safe to re-run — only
# installs what's missing. Run on the instance itself (deploy.sh calls
# this automatically; you shouldn't need to call it directly).
set -euo pipefail

echo "==> Checking dependencies on $(hostname)"

if ! command -v docker >/dev/null 2>&1; then
  echo "==> Docker not found — installing via get.docker.com"
  curl -fsSL https://get.docker.com | sudo sh
  sudo usermod -aG docker "$USER"
  echo "==> Docker installed. If this is the first install, log out/in (or start a new SSH session) for docker-group membership to take effect."
else
  echo "==> Docker present: $(docker --version)"
fi

if ! sudo systemctl is-active --quiet docker; then
  echo "==> Starting Docker daemon"
  sudo systemctl enable --now docker
fi

if ! docker info >/dev/null 2>&1; then
  echo "ERROR: current user can't talk to the Docker daemon (likely a fresh install — docker-group membership only applies to new sessions)." >&2
  echo "Reconnect (new SSH session) and re-run the deploy." >&2
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "ERROR: Docker Compose plugin missing even after install." >&2
  exit 1
fi

if ! command -v git >/dev/null 2>&1; then
  echo "==> git not found — installing"
  sudo apt-get update -y
  sudo apt-get install -y git
else
  echo "==> git present: $(git --version)"
fi

if ! command -v curl >/dev/null 2>&1; then
  echo "==> curl not found — installing"
  sudo apt-get update -y
  sudo apt-get install -y curl
fi

echo "==> All dependencies present."
