#!/usr/bin/env bash
# P4B16 — offline tests for stale COMMITTED attestation reconcile (mock replica verify).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/vps-release-attestation.lib.sh
source "${SCRIPT_DIR}/lib/vps-release-attestation.lib.sh"
# shellcheck source=lib/vps-release-attestation-env-mirror.lib.sh
source "${SCRIPT_DIR}/lib/vps-release-attestation-env-mirror.lib.sh"

fail() { echo "FAIL: $*" >&2; exit 1; }
pass() { echo "PASS: $*"; }

SHA_STALE='31d16bf5a66a31fbdf3c1cfeb7adf121d420b2c8'
SHA_TARGET='ff7efdc8da2034c2f2c08732e749324f6825f62c'
SHA_OTHER='cccccccccccccccccccccccccccccccccccccccc'
REL_DIR="/tmp/p4b16-reconcile-fixture"

CURRENT_RUNTIME_SHA="$SHA_TARGET"
RELEASE_DIR_SHA="$SHA_TARGET"
RECONCILE_EXPECT="$SHA_TARGET"
RECONCILE_VERIFY_FAIL=0
RECONCILE_VERIFY_CALLS=0

vps_replica_verify_attestation_reconcile() {
  RECONCILE_VERIFY_CALLS=$((RECONCILE_VERIFY_CALLS + 1))
  local _rel=$1
  local sha=$2
  [[ "${RECONCILE_VERIFY_FAIL:-0}" == "1" ]] && return 1
  [[ "$(vps_attest_normalize_sha "$sha")" == "$(vps_attest_normalize_sha "$RECONCILE_EXPECT")" ]]
}

vps_replica_verify_post_deploy() {
  local _rel=$1
  local sha=$2
  [[ "${POST_DEPLOY_VERIFY_FAIL:-0}" == "1" ]] && return 1
  [[ "$(vps_attest_normalize_sha "$sha")" == "$(vps_attest_normalize_sha "$RECONCILE_EXPECT")" ]]
}

vps_replica_current_sha() {
  echo "$CURRENT_RUNTIME_SHA"
}

vps_replica_release_sha() {
  local dir=$1
  case "$dir" in
    *previous-release*) echo "$SHA_STALE" ;;
    *) echo "$RELEASE_DIR_SHA" ;;
  esac
}

write_committed_state() {
  local gen=$1 deployed=$2 prev=$3
  local body
  body="$(vps_attest_build_state_body COMMITTED "$gen" "$deployed" "$prev")"
  vps_attest_state_write_atomic "$body"
}

setup_fixture() {
  local root=$1
  export VPS_ATTESTATION_STATE_DIR="${root}/deploy-state"
  export SYNQDRIVE_DEPLOY_STATE_DIR="${root}/deploy-state"
  export VPS_ATTESTATION_BACKEND_ENV="${root}/backend.env"
  export SYNQDRIVE_BACKUP_DIR="${root}/backups"
  mkdir -p "${VPS_ATTESTATION_STATE_DIR}/evidence" "${SYNQDRIVE_BACKUP_DIR}"
  mkdir -p "${root}/previous-release"
  touch "${VPS_ATTESTATION_BACKEND_ENV}"
  mkdir -p "${SYNQDRIVE_DEPLOY_STATE_DIR}"
  printf 'stub\n' | gzip >"${SYNQDRIVE_BACKUP_DIR}/db-pre-deploy-fixture.sql.gz"
  printf '{"dbname":"synqdrive"}\n' >"${SYNQDRIVE_BACKUP_DIR}/db-pre-deploy-fixture.sql.gz.capture.json"
  cat >"${SYNQDRIVE_DEPLOY_STATE_DIR}/last-deploy-state.env" <<EOF
PREVIOUS_SHA=${SHA_STALE}
PREVIOUS_CURRENT_RELEASE=${root}/previous-release
CAPTURED_AT=2026-11-04T07:20:00Z
PRE_DEPLOY_BACKUP=${SYNQDRIVE_BACKUP_DIR}/db-pre-deploy-fixture.sql.gz
EOF
}

seed_stale() {
  local gen=${1:-88}
  printf 'SYNQDRIVE_DEPLOYED_GIT_SHA=%s\nONEAUTO_ENABLED=true\nONEAUTO_CALLBACK_ENABLED=false\n' "$SHA_STALE" \
    >"${VPS_ATTESTATION_BACKEND_ENV}"
  vps_attest_lock_acquire
  write_committed_state "$gen" "$SHA_STALE" "$SHA_STALE"
  vps_attest_lock_release
}

reconcile_locked() {
  vps_attest_lock_acquire
  vps_attest_reconcile_stale_committed_deploy "$REL_DIR" "$SHA_TARGET" "$SHA_STALE"
  vps_attest_lock_release
}

ROOT="$(mktemp -d)"
trap 'rm -rf "${ROOT}"' EXIT
export VPS_P4B16_RECONCILE_SELFTEST_ACTIVE=1
export VPS_P4B16_RECONCILE_SKIP_MIGRATION_CHECK=1
setup_fixture "$ROOT"
seed_stale 88
RECONCILE_EXPECT="$SHA_TARGET"
CURRENT_RUNTIME_SHA="$SHA_TARGET"
RELEASE_DIR_SHA="$SHA_TARGET"

reconcile_locked
[[ "$(vps_attest_state_read_kv GENERATION)" == "89" ]] || fail "generation_88_to_89"
[[ "$(vps_attest_reader_committed_sha)" == "$SHA_TARGET" ]] || fail "committed_target_sha"
[[ "$(vps_attest_mirror_read_sha_from_file "${VPS_ATTESTATION_BACKEND_ENV}")" == "$SHA_TARGET" ]] || fail "mirror_target"
grep -q '^ONEAUTO_ENABLED=true$' "${VPS_ATTESTATION_BACKEND_ENV}" || fail "oneauto_enabled_preserved"
pass "stale_committed_recovery_gen_89"

# Already reconciled no-op
GEN_BEFORE="$(vps_attest_state_read_kv GENERATION)"
vps_attest_lock_acquire
vps_attest_reconcile_stale_committed_deploy "$REL_DIR" "$SHA_TARGET"
vps_attest_lock_release
[[ "$(vps_attest_state_read_kv GENERATION)" == "$GEN_BEFORE" ]] || fail "noop_double_gen"
pass "already_reconciled_noop"

# Wrong runtime SHA
ROOT2="$(mktemp -d)"
setup_fixture "$ROOT2"
seed_stale 88
CURRENT_RUNTIME_SHA="$SHA_STALE"
RELEASE_DIR_SHA="$SHA_TARGET"
if vps_attest_lock_acquire && vps_attest_reconcile_stale_committed_deploy "$REL_DIR" "$SHA_TARGET" "$SHA_STALE" 2>/dev/null; then
  vps_attest_lock_release
  fail "wrong_runtime_should_fail"
fi
vps_attest_lock_release 2>/dev/null || true
pass "wrong_runtime_sha_rejected"

# Lock contention
ROOT3="$(mktemp -d)"
setup_fixture "$ROOT3"
seed_stale 88
CURRENT_RUNTIME_SHA="$SHA_TARGET"
(
  vps_attest_lock_acquire
  sleep 2
  vps_attest_lock_release
) &
sleep 0.2
if vps_attest_lock_acquire 2>/dev/null; then
  vps_attest_lock_release
  fail "lock_contention_expected"
fi
pass "lock_contention"
wait || true

# Corrupt checksum
ROOT4="$(mktemp -d)"
setup_fixture "$ROOT4"
seed_stale 88
echo broken >"$(vps_attest_checksum_path)"
if vps_attest_lock_acquire && vps_attest_reconcile_stale_committed_deploy "$REL_DIR" "$SHA_TARGET" "$SHA_STALE" 2>/dev/null; then
  vps_attest_lock_release
  fail "corrupt_checksum"
fi
vps_attest_lock_release 2>/dev/null || true
pass "corrupt_checksum_rejected"

# Duplicate mirror key
ROOT5="$(mktemp -d)"
setup_fixture "$ROOT5"
seed_stale 88
printf 'SYNQDRIVE_DEPLOYED_GIT_SHA=%s\nSYNQDRIVE_DEPLOYED_GIT_SHA=%s\n' "$SHA_STALE" "$SHA_STALE" \
  >>"${VPS_ATTESTATION_BACKEND_ENV}"
CURRENT_RUNTIME_SHA="$SHA_TARGET"
if vps_attest_lock_acquire && vps_attest_reconcile_stale_committed_deploy "$REL_DIR" "$SHA_TARGET" "$SHA_STALE" 2>/dev/null; then
  vps_attest_lock_release
  fail "duplicate_mirror_key"
fi
vps_attest_lock_release 2>/dev/null || true
pass "duplicate_env_mirror_key_rejected"

# Uptime would block post_deploy but reconcile verify succeeds
ROOT6="$(mktemp -d)"
setup_fixture "$ROOT6"
seed_stale 88
CURRENT_RUNTIME_SHA="$SHA_TARGET"
POST_DEPLOY_VERIFY_FAIL=1
RECONCILE_VERIFY_FAIL=0
if vps_attest_lock_acquire && vps_attest_reconcile_stale_committed_deploy "$REL_DIR" "$SHA_TARGET" "$SHA_STALE" 2>/dev/null; then
  vps_attest_lock_release
  pass "reconcile_without_uptime_gate"
else
  vps_attest_lock_release 2>/dev/null || true
  fail "reconcile_should_ignore_uptime"
fi
POST_DEPLOY_VERIFY_FAIL=0

# Missing deployment evidence
ROOT7="$(mktemp -d)"
setup_fixture "$ROOT7"
seed_stale 88
rm -f "${SYNQDRIVE_DEPLOY_STATE_DIR}/last-deploy-state.env"
if vps_attest_lock_acquire && vps_attest_reconcile_stale_committed_deploy "$REL_DIR" "$SHA_TARGET" "$SHA_STALE" 2>/dev/null; then
  vps_attest_lock_release
  fail "missing_deploy_evidence"
fi
vps_attest_lock_release 2>/dev/null || true
pass "missing_deployment_evidence_rejected"

# Interrupted mirror then resume without double generation increment
ROOT8="$(mktemp -d)"
setup_fixture "$ROOT8"
seed_stale 88
CURRENT_RUNTIME_SHA="$SHA_TARGET"
export VPS_ATTESTATION_CRASH_HOOK=after_MIRROR_RENAME
set +e
(
  vps_attest_lock_acquire
  vps_attest_reconcile_stale_committed_deploy "$REL_DIR" "$SHA_TARGET" "$SHA_STALE" >/dev/null 2>&1
  vps_attest_lock_release
) || true
set -e
export VPS_ATTESTATION_CRASH_HOOK=
[[ "$(vps_attest_mirror_read_sha_from_file "${VPS_ATTESTATION_BACKEND_ENV}")" == "$SHA_TARGET" ]] || fail "mirror_after_crash"
[[ "$(vps_attest_state_read_kv GENERATION)" == "88" ]] || fail "gen_still_88_after_mirror_crash"
vps_attest_lock_acquire
vps_attest_reconcile_stale_committed_deploy "$REL_DIR" "$SHA_TARGET" "$SHA_STALE"
vps_attest_lock_release
[[ "$(vps_attest_state_read_kv GENERATION)" == "89" ]] || fail "resume_single_gen_increment"
pass "interrupted_mirror_resume_no_double_commit"

# Entrypoint authorization gate (dry)
if bash "${SCRIPT_DIR}/vps-reconcile-release-attestation.sh" --expected-sha "$SHA_TARGET" 2>/dev/null; then
  fail "entrypoint_without_auth"
fi
pass "entrypoint_requires_SYNQDRIVE_P4B16_RECONCILE_AUTHORIZED"

# Production entrypoint rejects offline bypass flags
export SYNQDRIVE_P4B16_RECONCILE_AUTHORIZED=1
export VPS_P4B16_RECONCILE_SKIP_CI_GATE=1
if bash "${SCRIPT_DIR}/vps-reconcile-release-attestation.sh" --expected-sha "$SHA_TARGET" 2>/dev/null; then
  unset SYNQDRIVE_P4B16_RECONCILE_AUTHORIZED VPS_P4B16_RECONCILE_SKIP_CI_GATE
  fail "entrypoint_ci_bypass_on_production_path"
fi
unset SYNQDRIVE_P4B16_RECONCILE_AUTHORIZED VPS_P4B16_RECONCILE_SKIP_CI_GATE
pass "production_entrypoint_rejects_ci_bypass"

# CI bypass forbidden in lib outside selftest harness
unset VPS_P4B16_RECONCILE_SELFTEST_ACTIVE
export VPS_P4B16_RECONCILE_SKIP_CI_GATE=1
if vps_attest_reconcile_run_ci_gate "$SHA_TARGET" "${SCRIPT_DIR}/deploy-ci-gate.mjs" 2>/dev/null; then
  export VPS_P4B16_RECONCILE_SELFTEST_ACTIVE=1
  unset VPS_P4B16_RECONCILE_SKIP_CI_GATE
  fail "lib_ci_bypass_without_selftest"
fi
unset VPS_P4B16_RECONCILE_SKIP_CI_GATE
export VPS_P4B16_RECONCILE_SELFTEST_ACTIVE=1
pass "lib_ci_bypass_forbidden_outside_selftest"

# Empty migration list cannot silently pass when check enabled
ROOT10="$(mktemp -d)"
setup_fixture "$ROOT10"
export VPS_ATTESTATION_STATE_DIR="${ROOT10}/deploy-state"
export SYNQDRIVE_DEPLOY_STATE_DIR="${ROOT10}/deploy-state"
export VPS_ATTESTATION_BACKEND_ENV="${ROOT10}/backend.env"
unset VPS_P4B16_RECONCILE_SKIP_MIGRATION_CHECK
unset VPS_P4B16_RECONCILE_REQUIRED_MIGRATIONS
unset DATABASE_URL
seed_stale 88
CURRENT_RUNTIME_SHA="$SHA_TARGET"
if vps_attest_reconcile_verify_migrations 2>/dev/null; then
  export VPS_P4B16_RECONCILE_SKIP_MIGRATION_CHECK=1
  fail "migration_check_without_database_url"
fi
export VPS_P4B16_RECONCILE_SKIP_MIGRATION_CHECK=1
pass "migration_evidence_fail_closed_without_database_url"

echo "ALL_RECONCILE_TESTS_PASS"
