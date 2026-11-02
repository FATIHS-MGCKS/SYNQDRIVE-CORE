#!/usr/bin/env bash
# Contract tests for vehicle-tech-spec-patch-postgres-guard (no database mutations).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/vehicle-tech-spec-patch-postgres-guard.sh
source "${SCRIPT_DIR}/lib/vehicle-tech-spec-patch-postgres-guard.sh"

failures=0

assert_rejects() {
  local name=$1
  shift
  if ( "$@" ); then
    echo "FAIL: expected rejection for ${name}"
    failures=$((failures + 1))
  else
    echo "OK: rejected ${name}"
  fi
}

assert_accepts() {
  local name=$1
  shift
  if ( "$@" ); then
    echo "OK: accepted ${name}"
  else
    echo "FAIL: expected acceptance for ${name}"
    failures=$((failures + 1))
  fi
}

assert_rejects "remote host" bash -c 'source "'"${SCRIPT_DIR}"'/lib/vehicle-tech-spec-patch-postgres-guard.sh"; DATABASE_URL="postgresql://u:p@db.example.com/synqdrive_ci_ephemeral" vehicle_tech_spec_patch_assert_ci_local_database_url'
assert_rejects "production-like name" bash -c 'source "'"${SCRIPT_DIR}"'/lib/vehicle-tech-spec-patch-postgres-guard.sh"; DATABASE_URL="postgresql://synqdrive:synqdrive@127.0.0.1:5432/synqdrive" vehicle_tech_spec_patch_assert_ci_local_database_url'
assert_accepts "ci ephemeral" bash -c 'source "'"${SCRIPT_DIR}"'/lib/vehicle-tech-spec-patch-postgres-guard.sh"; DATABASE_URL="postgresql://synqdrive:synqdrive@127.0.0.1:5432/synqdrive_ci_ephemeral?schema=public" vehicle_tech_spec_patch_assert_ci_local_database_url'
assert_accepts "disposable tech_spec name" bash -c 'source "'"${SCRIPT_DIR}"'/lib/vehicle-tech-spec-patch-postgres-guard.sh"; DATABASE_URL="postgresql://synqdrive:synqdrive@127.0.0.1:5432/synqdrive_tech_spec_patch_ci_123?schema=public" vehicle_tech_spec_patch_assert_ci_local_database_url'

assert_rejects "missing flag" bash -c 'source "'"${SCRIPT_DIR}"'/lib/vehicle-tech-spec-patch-postgres-guard.sh"; VEHICLE_TECH_SPEC_PATCH_PG=0 vehicle_tech_spec_patch_assert_pg_flag'
assert_accepts "pg flag" bash -c 'source "'"${SCRIPT_DIR}"'/lib/vehicle-tech-spec-patch-postgres-guard.sh"; VEHICLE_TECH_SPEC_PATCH_PG=1 vehicle_tech_spec_patch_assert_pg_flag'

if [[ "$failures" -gt 0 ]]; then
  echo "vehicle-tech-spec-patch-postgres-guard contract: ${failures} failure(s)" >&2
  exit 1
fi

echo "vehicle-tech-spec-patch-postgres-guard contract: OK"
