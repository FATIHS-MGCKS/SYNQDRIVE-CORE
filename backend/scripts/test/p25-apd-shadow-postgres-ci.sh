#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

log() { printf '[p25-apd-shadow-postgres-ci] %s\n' "$*"; }

if [[ -z "${DATABASE_URL:-}" ]]; then
  export DATABASE_URL="postgresql://synqdrive:synqdrive@127.0.0.1:5432/synqdrive?schema=public"
fi

log "prisma migrate deploy"
DATABASE_URL="${DATABASE_URL}" PRISMA_MIGRATE_EPHEMERAL_RECOVERY=1 \
  bash scripts/test/prisma-migrate-deploy-resilient.sh

log "prisma generate"
DATABASE_URL="${DATABASE_URL}" npx prisma generate --no-hints

log "APD shadow postgres integration"
DATABASE_URL="${DATABASE_URL}" npx jest \
  --runInBand --forceExit \
  adaptive-polling-shadow.postgres.integration.spec.ts \
  apd-shadow-activation-epoch.postgres.integration.spec.ts \
  apd-shadow-decision-epoch.immutability.postgres.integration.spec.ts \
  apd-shadow-activation-epoch.lifecycle.postgres.integration.spec.ts \
  apd-shadow-activation-epoch.t0-timezone.postgres.integration.spec.ts \
  apd-shadow-activation-epoch.write-race.postgres.integration.spec.ts \
  apd-shadow-epoch-lifecycle-concurrency.postgres.integration.spec.ts \
  apd-shadow-baseline-poll-evidence.postgres.integration.spec.ts \
  apds-scientific-savings.postgres.integration.spec.ts

log "migration ephemeral gate"
bash scripts/test/p25-apd-shadow-migration-ephemeral.sh

log "POSTGRES_INTEGRATION=PASS"
