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

log "vehicle-technical-spec-patch.postgres.integration OK (10/10)"

# shellcheck source=lib/oneauto-oem-suggestion-postgres-guard.sh
source "${SCRIPT_DIR}/lib/oneauto-oem-suggestion-postgres-guard.sh"
export ONEAUTO_OEM_SUGGESTIONS_PG=1
vehicle_oem_suggestion_assert_pg_flag
vehicle_oem_suggestion_assert_ci_local_database_url

log "Running oneauto-oem-vin-lookup-eu-suggestion.postgres.integration (expect 22 executed tests)"
ONEAUTO_JEST_OUT="$(mktemp)"
set +e
npm test -- --testPathPatterns='oneauto-oem-vin-lookup-eu-suggestion.postgres.integration' --runInBand --verbose 2>&1 | tee "$ONEAUTO_JEST_OUT"
ONEAUTO_JEST_RC=${PIPESTATUS[0]}
set -e

if [[ "$ONEAUTO_JEST_RC" -ne 0 ]]; then
  log "OneAuto OEM suggestion Jest failed with exit code ${ONEAUTO_JEST_RC}"
  exit "$ONEAUTO_JEST_RC"
fi

if grep -Eq 'Tests:[[:space:]]+0 passed' "$ONEAUTO_JEST_OUT" || grep -Eq 'Test Suites:[[:space:]]+1 skipped' "$ONEAUTO_JEST_OUT"; then
  log "FAIL: OneAuto OEM suggestion integration suite skipped or zero tests executed"
  exit 1
fi

if ! grep -Eq 'Tests:[[:space:]]+22 passed' "$ONEAUTO_JEST_OUT"; then
  log "FAIL: expected exactly 22 passing tests in oneauto-oem-vin-lookup-eu-suggestion.postgres.integration"
  grep 'Tests:' "$ONEAUTO_JEST_OUT" || true
  exit 1
fi

log "oneauto-oem-vin-lookup-eu-suggestion.postgres.integration OK (22/22)"

# shellcheck source=lib/vehicle-oem-spec-patch-postgres-guard.sh
source "${SCRIPT_DIR}/lib/vehicle-oem-spec-patch-postgres-guard.sh"
export VEHICLE_OEM_SPEC_PATCH_PG=1
vehicle_oem_spec_patch_assert_pg_flag
vehicle_oem_spec_patch_assert_ci_local_database_url

log "Running vehicle-oem-specification-patch.postgres.integration (expect 6 executed tests)"
OEM_JEST_OUT="$(mktemp)"
set +e
npm test -- --testPathPatterns='vehicle-oem-specification-patch.postgres.integration' --runInBand --verbose 2>&1 | tee "$OEM_JEST_OUT"
OEM_JEST_RC=${PIPESTATUS[0]}
set -e

if [[ "$OEM_JEST_RC" -ne 0 ]]; then
  log "OEM Jest failed with exit code ${OEM_JEST_RC}"
  exit "$OEM_JEST_RC"
fi

if grep -Eq 'Tests:[[:space:]]+0 passed' "$OEM_JEST_OUT" || grep -Eq 'Test Suites:[[:space:]]+1 skipped' "$OEM_JEST_OUT"; then
  log "FAIL: OEM integration suite skipped or zero tests executed"
  exit 1
fi

if ! grep -Eq 'Tests:[[:space:]]+6 passed' "$OEM_JEST_OUT"; then
  log "FAIL: expected exactly 6 passing tests in vehicle-oem-specification-patch.postgres.integration"
  grep 'Tests:' "$OEM_JEST_OUT" || true
  exit 1
fi

log "vehicle-tech-spec-patch-postgres-ci completed (technical 10/10 + OneAuto OEM 22/22 + OEM patch 6/6)"
