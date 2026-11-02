#!/usr/bin/env bash
# Mandatory CI: vehicle-technical-spec-patch.postgres.integration.spec.ts (10 tests, no describe.skip).
set -euo pipefail

log() { printf '[vehicle-tech-spec-patch-postgres-ci] %s\n' "$*"; }

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/vehicle-tech-spec-patch-postgres-guard.sh
source "${SCRIPT_DIR}/lib/vehicle-tech-spec-patch-postgres-guard.sh"

cd "$ROOT"

export VEHICLE_TECH_SPEC_PATCH_PG=1
vehicle_tech_spec_patch_assert_pg_flag
vehicle_tech_spec_patch_assert_ci_local_database_url

log "DATABASE_URL target verified (CI-local disposable)"
log "Applying Prisma schema (db push for ephemeral CI database)"
npx prisma db push --accept-data-loss --skip-generate

log "Running vehicle-technical-spec-patch.postgres.integration (expect 10 executed tests)"
JEST_OUT="$(mktemp)"
set +e
npm test -- --testPathPatterns='vehicle-technical-spec-patch.postgres.integration' --runInBand --verbose 2>&1 | tee "$JEST_OUT"
JEST_RC=${PIPESTATUS[0]}
set -e

if [[ "$JEST_RC" -ne 0 ]]; then
  log "Jest failed with exit code ${JEST_RC}"
  exit "$JEST_RC"
fi

if grep -Eq 'Tests:[[:space:]]+0 passed' "$JEST_OUT" || grep -Eq 'Test Suites:[[:space:]]+0 passed' "$JEST_OUT" || grep -Eq 'Test Suites:[[:space:]]+1 skipped' "$JEST_OUT"; then
  log "FAIL: integration suite skipped or zero tests executed (skipped tests must not count as PASS)"
  exit 1
fi

if ! grep -Eq 'Tests:[[:space:]]+10 passed' "$JEST_OUT"; then
  log "FAIL: expected exactly 10 passing tests in vehicle-technical-spec-patch.postgres.integration"
  grep 'Tests:' "$JEST_OUT" || true
  exit 1
fi

log "vehicle-tech-spec-patch-postgres-ci completed successfully (10/10)"
