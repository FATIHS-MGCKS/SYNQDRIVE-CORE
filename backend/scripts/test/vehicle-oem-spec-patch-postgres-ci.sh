#!/usr/bin/env bash
# Mandatory CI: vehicle-oem-specification-patch.postgres.integration.spec.ts (7 tests, no describe.skip).
set -euo pipefail

log() { printf '[vehicle-oem-spec-patch-postgres-ci] %s\n' "$*"; }

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/vehicle-oem-spec-patch-postgres-guard.sh
source "${SCRIPT_DIR}/lib/vehicle-oem-spec-patch-postgres-guard.sh"

cd "$ROOT"

export VEHICLE_OEM_SPEC_PATCH_PG=1
vehicle_oem_spec_patch_assert_pg_flag
vehicle_oem_spec_patch_assert_ci_local_database_url

log "DATABASE_URL target verified (CI-local disposable)"
log "Applying Prisma schema (db push for ephemeral CI database)"
npx prisma db push --accept-data-loss --skip-generate

log "Running vehicle-oem-specification-patch.postgres.integration (expect 7 executed tests)"
JEST_OUT="$(mktemp)"
set +e
npm test -- --testPathPatterns='vehicle-oem-specification-patch.postgres.integration' --runInBand --verbose 2>&1 | tee "$JEST_OUT"
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

if ! grep -Eq 'Tests:[[:space:]]+7 passed' "$JEST_OUT"; then
  log "FAIL: expected exactly 7 passing tests in vehicle-oem-specification-patch.postgres.integration"
  grep 'Tests:' "$JEST_OUT" || true
  exit 1
fi

log "vehicle-oem-spec-patch-postgres-ci completed successfully (7/7)"
