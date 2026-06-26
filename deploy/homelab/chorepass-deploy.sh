#!/usr/bin/env bash
# ChorePass homelab auto-deploy.
#
# Runs on Docker LXC 101 (192.168.1.172), driven by chorepass-deploy.timer every
# ~3 min. Polls the CI-validated `live` branch and rebuilds the stack only when
# it advances. The repo's GitHub Actions guarantees `live` only ever points at a
# commit whose production image built and passed /api/health, so this end never
# builds an unvalidated commit.
#
# flock serializes this against a manual `git pull` / `docker compose` so the two
# never race on .git/index.lock and leave the container on a stale build.
set -euo pipefail

STACK_DIR="${CHOREPASS_STACK_DIR:-/opt/stacks/chorepass}"
BRANCH="${CHOREPASS_DEPLOY_BRANCH:-live}"

# Single-flight lock. -n => if another deploy (manual or timer) holds it, skip
# this tick rather than queue up behind it.
exec 9>/run/chorepass-deploy.lock
flock -n 9 || { echo "chorepass-deploy: another run holds the lock; skipping"; exit 0; }

cd "$STACK_DIR"

git fetch --quiet origin "$BRANCH"
local_sha="$(git rev-parse HEAD)"
remote_sha="$(git rev-parse "origin/${BRANCH}")"

if [ "$local_sha" = "$remote_sha" ]; then
  exit 0   # already current — nothing to build
fi

echo "chorepass-deploy: ${local_sha:0:8} -> ${remote_sha:0:8}, rebuilding"
git reset --hard "origin/${BRANCH}"

# Rebuild + recreate. The bind-mounted ./data dir (SQLite DB) and the gitignored
# .env (real secrets) are preserved across this. Brief in-place downtime during
# recreate is expected and fine — ChorePass is single-instance by design.
docker compose up -d --build chore-app
docker compose ps
echo "chorepass-deploy: done"
