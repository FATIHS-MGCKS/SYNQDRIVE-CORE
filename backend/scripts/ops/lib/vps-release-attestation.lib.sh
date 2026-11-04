#!/usr/bin/env bash
# P4B16 — Minimal durable deployed-release SHA record (library only; not wired in deploy scripts yet).
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  echo "This file must be sourced, not executed." >&2
  exit 1
fi

VPS_ATTESTATION_STATE_DIR="${VPS_ATTESTATION_STATE_DIR:-${SYNQDRIVE_DEPLOY_STATE_DIR:-/opt/synqdrive/shared/deploy-state}}"
VPS_ATTESTATION_STATE_FILE="${VPS_ATTESTATION_STATE_FILE:-release-attestation.state}"
VPS_ATTESTATION_LOCK_FILE="${VPS_ATTESTATION_LOCK_FILE:-.attestation.lock}"
VPS_ATTESTATION_CHECKSUM_FILE="${VPS_ATTESTATION_CHECKSUM_FILE:-release-attestation.state.sha256}"
# Selftests: mock vps_replica_verify_post_deploy in the shell (no production skip flags).
# Selftests: VPS_ATTESTATION_CRASH_HOOK=before_state_write|after_mirror
VPS_ATTESTATION_CRASH_HOOK="${VPS_ATTESTATION_CRASH_HOOK:-}"

VPS_ATTEST_LOCK_FD=9
_VPS_ATTEST_LOCK_HELD=0

vps_attest_log() {
  printf '[release-attestation] %s\n' "$*" >&2
}

vps_attest_fail() {
  vps_attest_log "ABORT: $*"
  return 1
}

vps_attest_validate_sha() {
  local sha=$1
  [[ "$sha" =~ ^[0-9a-fA-F]{40}$ ]]
}

vps_attest_normalize_sha() {
  printf '%s' "$1" | tr '[:upper:]' '[:lower:]'
}

vps_attest_state_path() {
  echo "${VPS_ATTESTATION_STATE_DIR}/${VPS_ATTESTATION_STATE_FILE}"
}

vps_attest_lock_path() {
  echo "${VPS_ATTESTATION_STATE_DIR}/${VPS_ATTESTATION_LOCK_FILE}"
}

vps_attest_checksum_path() {
  echo "${VPS_ATTESTATION_STATE_DIR}/${VPS_ATTESTATION_CHECKSUM_FILE}"
}

vps_attest_ensure_state_dir() {
  local dir="${VPS_ATTESTATION_STATE_DIR}"
  if [[ -L "$dir" ]]; then
    vps_attest_fail "state dir must not be a symlink: ${dir}"
    return 1
  fi
  if ! mkdir -p "$dir"; then
    vps_attest_fail "cannot create state dir: ${dir}"
    return 1
  fi
  chmod 750 "$dir" 2>/dev/null || true
}

vps_attest_safe_regular_file() {
  local path=$1
  local label=${2:-path}
  [[ -n "$path" ]] || { vps_attest_fail "${label} empty"; return 1; }
  [[ -L "$path" ]] && { vps_attest_fail "${label} must not be a symlink: ${path}"; return 1; }
  [[ -e "$path" && ! -f "$path" ]] && { vps_attest_fail "${label} must be a regular file: ${path}"; return 1; }
  return 0
}

vps_attest_fsync_file() {
  local f=$1
  [[ -f "$f" ]] || return 0
  if ! sync -f "$f" 2>/dev/null; then
    vps_attest_fail "fsync failed: ${f}"
    return 1
  fi
  return 0
}

vps_attest_fsync_dir() {
  local d=$1
  [[ -d "$d" ]] || return 0
  if ! sync -f "$d" 2>/dev/null; then
    vps_attest_fail "fsync dir failed: ${d}"
    return 1
  fi
  return 0
}

vps_attest_crash_hook() {
  local point=$1
  if [[ "${VPS_ATTESTATION_CRASH_HOOK:-}" == "$point" ]]; then
    vps_attest_log "CRASH_HOOK=${point}"
    exit 99
  fi
}

vps_attest_lock_acquire() {
  vps_attest_ensure_state_dir || return 1
  local lock
  lock="$(vps_attest_lock_path)"
  eval "exec ${VPS_ATTEST_LOCK_FD}>\"${lock}\""
  if ! flock -n "${VPS_ATTEST_LOCK_FD}"; then
    vps_attest_fail "attestation lock busy: ${lock}"
    return 1
  fi
  _VPS_ATTEST_LOCK_HELD=1
  return 0
}

vps_attest_lock_release() {
  if [[ "${_VPS_ATTEST_LOCK_HELD}" == "1" ]]; then
    flock -u "${VPS_ATTEST_LOCK_FD}" 2>/dev/null || true
    _VPS_ATTEST_LOCK_HELD=0
  fi
}

vps_attest_require_lock_held() {
  if [[ "${_VPS_ATTEST_LOCK_HELD}" != "1" ]]; then
    vps_attest_fail "attestation lock required for write"
    return 1
  fi
  return 0
}

vps_attest_last_recorded_deployed_sha() {
  if ! vps_attest_state_verify_checksum 2>/dev/null; then
    echo ""
    return 0
  fi
  local s
  s="$(vps_attest_state_read_kv DEPLOYED_SHA)"
  if vps_attest_validate_sha "$s" 2>/dev/null; then
    vps_attest_normalize_sha "$s"
  else
    echo ""
  fi
}

vps_attest_state_read_kv() {
  local key=$1
  local spath
  spath="$(vps_attest_state_path)"
  [[ -f "$spath" ]] || return 0
  grep -m1 "^${key}=" "$spath" 2>/dev/null | cut -d= -f2- || true
  return 0
}

vps_attest_state_body_checksum() {
  local body=$1
  printf '%s' "$body" | sha256sum | awk '{print $1}'
}

vps_attest_state_write_checksum_sidecar() {
  local body=$1
  local cpath sum
  cpath="$(vps_attest_checksum_path)"
  sum="$(vps_attest_state_body_checksum "$body")"
  printf '%s\n' "$sum" >"${cpath}.tmp" || return 1
  vps_attest_fsync_file "${cpath}.tmp" || return 1
  mv -f "${cpath}.tmp" "$cpath" || return 1
  chmod 640 "$cpath" 2>/dev/null || true
  vps_attest_fsync_dir "$(dirname "$cpath")" || return 1
}

vps_attest_state_verify_checksum() {
  local spath
  spath="$(vps_attest_state_path)"
  [[ -f "$spath" ]] || return 1
  local cpath expected actual body
  cpath="$(vps_attest_checksum_path)"
  [[ -f "$cpath" ]] || return 1
  expected="$(tr -d '\n' <"$cpath")"
  body="$(cat "$spath")"
  actual="$(vps_attest_state_body_checksum "$body")"
  [[ "$expected" == "$actual" ]]
}

vps_attest_state_write_atomic() {
  local body=$1
  vps_attest_ensure_state_dir || return 1
  local spath tmp parent
  spath="$(vps_attest_state_path)"
  parent="$(dirname "$spath")"
  tmp="${spath}.tmp.$$"
  printf '%s' "$body" >"$tmp" || return 1
  chmod 640 "$tmp" 2>/dev/null || true
  vps_attest_fsync_file "$tmp" || { rm -f "$tmp"; return 1; }
  mv -f "$tmp" "$spath" || { rm -f "$tmp"; return 1; }
  vps_attest_fsync_dir "$parent" || return 1
  vps_attest_state_write_checksum_sidecar "$body" || return 1
}

vps_attest_next_generation() {
  local cur
  cur="$(vps_attest_state_read_kv GENERATION)"
  if [[ -z "$cur" ]]; then
    echo 1
  else
    echo $((cur + 1))
  fi
}

vps_attest_build_state_body() {
  # STATUS GENERATION DEPLOYED_SHA PREVIOUS_SHA UPDATED_AT
  local status=$1 gen=$2 deployed=$3 prev=$4
  local ts
  ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  cat <<EOF
STATUS=${status}
GENERATION=${gen}
DEPLOYED_SHA=${deployed}
PREVIOUS_SHA=${prev}
UPDATED_AT=${ts}
EOF
}

# Mandatory: both-replica deploy verification via existing ops library.
vps_attest_require_replica_verify() {
  local release_dir=$1
  local target_sha=$2
  vps_attest_validate_sha "$target_sha" || return 1
  target_sha="$(vps_attest_normalize_sha "$target_sha")"
  if ! declare -f vps_replica_verify_post_deploy >/dev/null 2>&1; then
    vps_attest_fail "vps_replica_verify_post_deploy unavailable — cannot record deploy"
    return 1
  fi
  vps_replica_verify_post_deploy "$release_dir" "$target_sha"
}

vps_attest_mirror_sha_matches() {
  local target_sha=$1
  # shellcheck source=lib/vps-release-attestation-env-mirror.lib.sh
  source "$(dirname "${BASH_SOURCE[0]}")/vps-release-attestation-env-mirror.lib.sh"
  local mirrored
  mirrored="$(vps_attest_mirror_read_sha_from_file "${VPS_ATTESTATION_BACKEND_ENV:-}" 2>/dev/null || true)"
  [[ -n "$mirrored" ]] || return 1
  [[ "$(vps_attest_normalize_sha "$mirrored")" == "$(vps_attest_normalize_sha "$target_sha")" ]]
}

vps_attest_ensure_mirror_matches() {
  local target_sha=$1
  if vps_attest_mirror_sha_matches "$target_sha"; then
    return 0
  fi
  # shellcheck source=lib/vps-release-attestation-env-mirror.lib.sh
  source "$(dirname "${BASH_SOURCE[0]}")/vps-release-attestation-env-mirror.lib.sh"
  vps_attest_mirror_deployed_git_sha "${VPS_ATTESTATION_BACKEND_ENV:-}" "$target_sha"
}

vps_attest_reader_is_committed() {
  vps_attest_state_verify_checksum || return 1
  local st
  st="$(vps_attest_state_read_kv STATUS)"
  [[ "$st" == "COMMITTED" || "$st" == "ROLLED_BACK" ]] || return 1
  vps_attest_validate_sha "$(vps_attest_state_read_kv DEPLOYED_SHA)"
}

vps_attest_reader_committed_sha() {
  vps_attest_reader_is_committed || return 1
  vps_attest_state_read_kv DEPLOYED_SHA
}

# After successful vps_replica_verify_post_deploy: mirror legacy env, then one COMMITTED state write.
vps_attest_record_deploy_success() {
  local release_dir=$1
  local target_sha=$2

  vps_attest_require_lock_held || return 1
  vps_attest_validate_sha "$target_sha" || return 1
  target_sha="$(vps_attest_normalize_sha "$target_sha")"

  vps_attest_require_replica_verify "$release_dir" "$target_sha" || return 1

  local cur last
  last="$(vps_attest_last_recorded_deployed_sha)"
  if vps_attest_reader_is_committed 2>/dev/null; then
    cur="$(vps_attest_normalize_sha "$(vps_attest_state_read_kv DEPLOYED_SHA)")"
    if [[ "$cur" == "$target_sha" ]]; then
      vps_attest_ensure_mirror_matches "$target_sha" || return 1
      return 0
    fi
  fi

  local gen prev body
  gen="$(vps_attest_next_generation)"
  prev="${last}"

  # shellcheck source=lib/vps-release-attestation-env-mirror.lib.sh
  source "$(dirname "${BASH_SOURCE[0]}")/vps-release-attestation-env-mirror.lib.sh"
  vps_attest_crash_hook before_mirror
  if ! vps_attest_mirror_deployed_git_sha "${VPS_ATTESTATION_BACKEND_ENV:-}" "$target_sha"; then
    body="$(vps_attest_build_state_body FAILED "$gen" "$last" "$prev")"
    vps_attest_state_write_atomic "$body" || true
    return 1
  fi
  vps_attest_crash_hook after_mirror

  body="$(vps_attest_build_state_body COMMITTED "$gen" "$target_sha" "$prev")"
  vps_attest_crash_hook before_state_write
  vps_attest_state_write_atomic "$body"
}

vps_attest_record_deploy_failure() {
  local target_sha=${1:-}
  vps_attest_require_lock_held || return 1
  local gen prev deployed body
  gen="$(vps_attest_next_generation)"
  deployed="$(vps_attest_last_recorded_deployed_sha)"
  deployed="${deployed:-}"
  prev="$(vps_attest_state_read_kv PREVIOUS_SHA)"
  prev="${prev:-}"
  if [[ -n "$target_sha" ]]; then
    vps_attest_validate_sha "$target_sha" || return 1
    target_sha="$(vps_attest_normalize_sha "$target_sha")"
  else
    target_sha=""
  fi
  body="$(vps_attest_build_state_body FAILED "$gen" "$deployed" "$prev")"
  vps_attest_state_write_atomic "$body"
}

# Idempotent completion when mirror succeeded but state write crashed (STATUS != COMMITTED).
vps_attest_resume_incomplete_deploy() {
  local release_dir=$1
  local target_sha=$2
  vps_attest_require_lock_held || return 1
  vps_attest_validate_sha "$target_sha" || return 1
  target_sha="$(vps_attest_normalize_sha "$target_sha")"
  vps_attest_require_replica_verify "$release_dir" "$target_sha" || return 1
  if vps_attest_reader_is_committed 2>/dev/null; then
    local cur
    cur="$(vps_attest_normalize_sha "$(vps_attest_state_read_kv DEPLOYED_SHA)")"
    [[ "$cur" == "$target_sha" ]] || return 1
    vps_attest_ensure_mirror_matches "$target_sha" || return 1
    return 0
  fi
  # shellcheck source=lib/vps-release-attestation-env-mirror.lib.sh
  source "$(dirname "${BASH_SOURCE[0]}")/vps-release-attestation-env-mirror.lib.sh"
  local mirrored
  mirrored="$(vps_attest_mirror_read_sha_from_file "${VPS_ATTESTATION_BACKEND_ENV:-}" 2>/dev/null || true)"
  mirrored="$(vps_attest_normalize_sha "${mirrored:-}")"
  if [[ "$mirrored" != "$target_sha" ]]; then
    vps_attest_fail "resume rejected: mirror SHA mismatch"
    return 1
  fi
  local gen prev body last
  gen="$(vps_attest_state_read_kv GENERATION)"
  [[ -n "$gen" ]] || gen="$(vps_attest_next_generation)"
  last="$(vps_attest_last_recorded_deployed_sha)"
  prev="${last}"
  body="$(vps_attest_build_state_body COMMITTED "$gen" "$target_sha" "$prev")"
  vps_attest_state_write_atomic "$body"
}

# --- P4B16 stale COMMITTED + stale mirror recovery (attestation-only; no PM2/nginx/migrations) ---

# Set only by vps-reconcile-release-attestation.selftest.sh (never on production).
vps_attest_reconcile_selftest_active() {
  [[ "${VPS_P4B16_RECONCILE_SELFTEST_ACTIVE:-}" == "1" ]]
}

vps_attest_reconcile_forbid_offline_bypass() {
  local label=$1
  if vps_attest_reconcile_selftest_active; then
    return 0
  fi
  vps_attest_fail "${label} forbidden outside isolated offline selftest harness"
  return 1
}

vps_attest_reconcile_default_required_migrations() {
  printf '%s' '20261103213000_oneauto_provider_result_expires_at,20261103220000_oneauto_provider_callback_pr3'
}

vps_attest_reconcile_assert_no_conflicting_deploy_authority() {
  if [[ "${SYNQDRIVE_ISOLATED_RECOVERY_AUTHORIZED:-}" == "1" ]]; then
    vps_attest_fail "isolated recovery authorization active — reconcile blocked"
    return 1
  fi
  if [[ "${SYNQDRIVE_PRODUCTION_DB_CUTOVER_AUTHORIZED:-}" == "1" ]]; then
    vps_attest_fail "production DB cutover authorization active — reconcile blocked"
    return 1
  fi
  if [[ "${SYNQDRIVE_MIGRATION_RECOVERY_RESOLVE_AUTHORIZED:-}" == "1" ]]; then
    vps_attest_fail "migration recovery resolve authorization active — reconcile blocked"
    return 1
  fi
  return 0
}

vps_attest_reconcile_validate_backup_evidence() {
  if [[ "${VPS_P4B16_RECONCILE_SKIP_BACKUP_EVIDENCE:-}" == "1" ]]; then
    vps_attest_reconcile_forbid_offline_bypass "VPS_P4B16_RECONCILE_SKIP_BACKUP_EVIDENCE" || return 1
    return 0
  fi
  local deploy_state_dir="${SYNQDRIVE_DEPLOY_STATE_DIR:-}"
  local backup_dir="${SYNQDRIVE_BACKUP_DIR:-/opt/synqdrive/shared/backups}"
  local state_file="${deploy_state_dir}/last-deploy-state.env"
  local captured_at backup_file explicit_backup
  captured_at="$(grep -E '^CAPTURED_AT=' "$state_file" 2>/dev/null | cut -d= -f2- | tail -n 1 || true)"
  explicit_backup="$(grep -E '^PRE_DEPLOY_BACKUP=' "$state_file" 2>/dev/null | cut -d= -f2- | tail -n 1 || true)"
  if [[ -z "$captured_at" ]]; then
    vps_attest_fail "last-deploy CAPTURED_AT missing — backup evidence required"
    return 1
  fi
  if [[ -n "$explicit_backup" && -f "$explicit_backup" ]]; then
    backup_file="$explicit_backup"
  else
    if [[ ! -d "$backup_dir" ]]; then
      vps_attest_fail "backup directory missing: ${backup_dir}"
      return 1
    fi
    local candidate best_ts best_file ts f base
    best_ts=0
    best_file=""
    shopt -s nullglob
    for f in "${backup_dir}"/db-pre-deploy-*.sql.gz; do
      [[ -f "$f" ]] || continue
      ts="$(stat -c '%Y' "$f" 2>/dev/null || echo 0)"
      [[ "$ts" -ge "$best_ts" ]] || continue
      best_ts="$ts"
      best_file="$f"
    done
    shopt -u nullglob
    backup_file="$best_file"
  fi
  if [[ -z "$backup_file" || ! -f "$backup_file" ]]; then
    vps_attest_fail "no pre-deploy backup artifact found for reconcile evidence"
    return 1
  fi
  if [[ ! -s "$backup_file" ]]; then
    vps_attest_fail "pre-deploy backup empty: ${backup_file}"
    return 1
  fi
  if ! gzip -t "$backup_file" 2>/dev/null; then
    vps_attest_fail "pre-deploy backup gzip integrity failed"
    return 1
  fi
  if [[ ! -f "${backup_file}.capture.json" ]]; then
    vps_attest_fail "pre-deploy backup capture sidecar missing"
    return 1
  fi
  vps_attest_log "backup evidence OK: ${backup_file}"
  return 0
}

vps_attest_require_reconcile_replica_verify() {
  local release_dir=$1
  local target_sha=$2
  vps_attest_validate_sha "$target_sha" || return 1
  target_sha="$(vps_attest_normalize_sha "$target_sha")"
  if ! declare -f vps_replica_verify_attestation_reconcile >/dev/null 2>&1; then
    vps_attest_fail "vps_replica_verify_attestation_reconcile unavailable — cannot reconcile"
    return 1
  fi
  vps_replica_verify_attestation_reconcile "$release_dir" "$target_sha"
}

vps_attest_reconcile_validate_deploy_evidence() {
  local release_dir=$1
  local expected_sha=$2
  local stale_sha=$3
  local deploy_state_dir="${SYNQDRIVE_DEPLOY_STATE_DIR:-}"
  if [[ -z "$deploy_state_dir" ]]; then
    vps_attest_fail "SYNQDRIVE_DEPLOY_STATE_DIR required for deploy evidence"
    return 1
  fi
  local state_file="${deploy_state_dir}/last-deploy-state.env"
  if [[ ! -f "$state_file" ]]; then
    vps_attest_fail "missing deployment evidence: ${state_file}"
    return 1
  fi
  local prev prev_rel prev_rel_sha captured_at
  prev="$(grep -E '^PREVIOUS_SHA=' "$state_file" 2>/dev/null | cut -d= -f2- | tail -n 1 || true)"
  if [[ -z "$prev" ]] || [[ "$(vps_attest_normalize_sha "$prev")" != "$(vps_attest_normalize_sha "$stale_sha")" ]]; then
    vps_attest_fail "last-deploy PREVIOUS_SHA does not match stale attestation SHA"
    return 1
  fi
  prev_rel="$(grep -E '^PREVIOUS_CURRENT_RELEASE=' "$state_file" 2>/dev/null | cut -d= -f2- | tail -n 1 || true)"
  if [[ -z "$prev_rel" || ! -d "$prev_rel" ]]; then
    vps_attest_fail "last-deploy PREVIOUS_CURRENT_RELEASE missing or not a directory"
    return 1
  fi
  if [[ "$(readlink -f "$prev_rel")" == "$(readlink -f "$release_dir")" ]]; then
    vps_attest_fail "current release equals rollback target — no successful promotion evidence"
    return 1
  fi
  if declare -f vps_replica_release_sha >/dev/null 2>&1; then
    prev_rel_sha="$(vps_replica_release_sha "$prev_rel")"
    if [[ "$(vps_attest_normalize_sha "$prev_rel_sha")" != "$(vps_attest_normalize_sha "$stale_sha")" ]]; then
      vps_attest_fail "previous release dir SHA does not match stale attestation SHA"
      return 1
    fi
  fi
  captured_at="$(grep -E '^CAPTURED_AT=' "$state_file" 2>/dev/null | cut -d= -f2- | tail -n 1 || true)"
  if [[ -z "$captured_at" ]]; then
    vps_attest_fail "last-deploy CAPTURED_AT missing"
    return 1
  fi
  if declare -f vps_replica_current_sha >/dev/null 2>&1; then
    local cur
    cur="$(vps_replica_current_sha)"
    if [[ "$(vps_attest_normalize_sha "$cur")" != "$(vps_attest_normalize_sha "$expected_sha")" ]]; then
      vps_attest_fail "runtime current SHA ${cur:0:12} != expected ${expected_sha:0:12}"
      return 1
    fi
  fi
  if declare -f vps_replica_release_sha >/dev/null 2>&1 && [[ -n "$release_dir" && -d "$release_dir" ]]; then
    local rel_sha
    rel_sha="$(vps_replica_release_sha "$release_dir")"
    if [[ "$(vps_attest_normalize_sha "$rel_sha")" != "$(vps_attest_normalize_sha "$expected_sha")" ]]; then
      vps_attest_fail "release dir SHA mismatch"
      return 1
    fi
  fi
  vps_attest_reconcile_validate_backup_evidence || return 1
  return 0
}

vps_attest_reconcile_verify_migrations() {
  if [[ "${VPS_P4B16_RECONCILE_SKIP_MIGRATION_CHECK:-}" == "1" ]]; then
    vps_attest_reconcile_forbid_offline_bypass "VPS_P4B16_RECONCILE_SKIP_MIGRATION_CHECK" || return 1
    return 0
  fi
  local raw="${VPS_P4B16_RECONCILE_REQUIRED_MIGRATIONS:-}"
  if [[ -z "$raw" ]]; then
    raw="$(vps_attest_reconcile_default_required_migrations)"
  fi
  if [[ -z "$raw" ]]; then
    vps_attest_fail "required migration list empty — reconcile refused"
    return 1
  fi
  if [[ -z "${DATABASE_URL:-}" ]]; then
    vps_attest_fail "DATABASE_URL required for migration verification"
    return 1
  fi
  local name
  IFS=',' read -ra _migs <<<"$raw"
  for name in "${_migs[@]}"; do
    name="${name// /}"
    [[ -n "$name" ]] || continue
    if ! psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -tAc \
      "SELECT 1 FROM _prisma_migrations WHERE migration_name='${name}' AND finished_at IS NOT NULL LIMIT 1;" \
      2>/dev/null | grep -q 1; then
      vps_attest_fail "required migration not applied: ${name}"
      return 1
    fi
  done
  return 0
}

# Mandatory CI gate for exact expected SHA (never skippable on production).
vps_attest_reconcile_run_ci_gate() {
  local expected_sha=$1
  local gate_script=$2
  if [[ "${VPS_P4B16_RECONCILE_SKIP_CI_GATE:-}" == "1" ]]; then
    vps_attest_reconcile_forbid_offline_bypass "VPS_P4B16_RECONCILE_SKIP_CI_GATE" || return 1
    vps_attest_log "CI gate skipped (offline selftest harness only)"
    return 0
  fi
  [[ -f "$gate_script" ]] || {
    vps_attest_fail "deploy-ci-gate.mjs missing: ${gate_script}"
    return 1
  }
  node "$gate_script" "$expected_sha"
}

vps_attest_emit_reconcile_evidence() {
  local expected_sha=$1
  local stale_sha=$2
  local gen_before=$3
  local gen_after=$4
  local evidence_dir="${SYNQDRIVE_P4B16_RECONCILE_EVIDENCE_DIR:-}"
  if [[ -z "$evidence_dir" ]]; then
    evidence_dir="$(dirname "$(vps_attest_state_path)")/evidence"
  fi
  mkdir -p "$evidence_dir" 2>/dev/null || true
  local ts file
  ts="$(date -u +%Y%m%d%H%M%S)"
  file="${evidence_dir}/p4b16-stale-committed-reconcile-${ts}.env"
  cat >"$file" <<EOF
OPERATION=P4B16_STALE_COMMITTED_RECOVERY
EXPECTED_SHA=${expected_sha}
STALE_ATTESTED_SHA=${stale_sha}
GENERATION_BEFORE=${gen_before}
GENERATION_AFTER=${gen_after}
MIRROR_KEY=${VPS_ATTESTATION_MIRROR_KEY:-SYNQDRIVE_DEPLOYED_GIT_SHA}
ONEAUTO_ACTIVATION_POLICY=UNCHANGED_BY_RECONCILE
RECORDED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)
EOF
  chmod 640 "$file" 2>/dev/null || true
  vps_attest_log "reconcile evidence → ${file}"
}

# Reconcile stale COMMITTED attestation when runtime already matches expected_sha (no redeploy).
vps_attest_reconcile_stale_committed_deploy() {
  local release_dir=$1
  local expected_sha=$2
  local expected_stale_sha=${3:-}

  vps_attest_require_lock_held || return 1
  vps_attest_validate_sha "$expected_sha" || return 1
  expected_sha="$(vps_attest_normalize_sha "$expected_sha")"
  if [[ -n "$expected_stale_sha" ]]; then
    vps_attest_validate_sha "$expected_stale_sha" || return 1
    expected_stale_sha="$(vps_attest_normalize_sha "$expected_stale_sha")"
  fi

  if ! vps_attest_state_verify_checksum; then
    vps_attest_fail "attestation checksum invalid — reconcile refused"
    return 1
  fi
  if ! vps_attest_reader_is_committed 2>/dev/null; then
    vps_attest_fail "attestation not COMMITTED — reconcile refused"
    return 1
  fi

  local stale_deployed stale_gen mirrored gen_before
  stale_deployed="$(vps_attest_normalize_sha "$(vps_attest_state_read_kv DEPLOYED_SHA)")"
  stale_gen="$(vps_attest_state_read_kv GENERATION)"
  gen_before="${stale_gen}"

  if [[ -n "$expected_stale_sha" && "$stale_deployed" != "$expected_stale_sha" ]]; then
    vps_attest_fail "attestation DEPLOYED_SHA != expected stale SHA"
    return 1
  fi
  if [[ -n "${VPS_P4B16_RECONCILE_EXPECTED_GENERATION:-}" && "$stale_gen" != "${VPS_P4B16_RECONCILE_EXPECTED_GENERATION}" ]]; then
    vps_attest_fail "attestation GENERATION != expected (${VPS_P4B16_RECONCILE_EXPECTED_GENERATION})"
    return 1
  fi

  # shellcheck source=lib/vps-release-attestation-env-mirror.lib.sh
  source "$(dirname "${BASH_SOURCE[0]}")/vps-release-attestation-env-mirror.lib.sh"

  mirrored="$(vps_attest_mirror_read_sha_from_file "${VPS_ATTESTATION_BACKEND_ENV:-}" 2>/dev/null || true)"
  mirrored="$(vps_attest_normalize_sha "${mirrored:-}")"

  if [[ "$stale_deployed" == "$expected_sha" ]] && vps_attest_mirror_sha_matches "$expected_sha"; then
    vps_attest_log "reconcile no-op: attestation and mirror already at ${expected_sha:0:12}"
    return 0
  fi

  local prev_for_state="$stale_deployed"
  local mirror_resume=0
  if vps_attest_mirror_sha_matches "$expected_sha" && [[ "$stale_deployed" != "$expected_sha" ]]; then
    mirror_resume=1
    vps_attest_log "detected mirror/state split — resume after mirror update"
  elif [[ -z "$mirrored" || "$mirrored" != "$stale_deployed" ]]; then
    vps_attest_fail "stale mirror must match stale attestation DEPLOYED_SHA"
    return 1
  fi

  vps_attest_require_reconcile_replica_verify "$release_dir" "$expected_sha" || return 1
  vps_attest_reconcile_validate_deploy_evidence "$release_dir" "$expected_sha" "$stale_deployed" || return 1
  vps_attest_reconcile_verify_migrations || return 1

  local planned_gen body
  planned_gen="$(vps_attest_next_generation)"

  if [[ "$mirror_resume" == "1" ]]; then
    body="$(vps_attest_build_state_body COMMITTED "$planned_gen" "$expected_sha" "$prev_for_state")"
    vps_attest_crash_hook before_state_write
    vps_attest_state_write_atomic "$body" || return 1
    vps_attest_emit_reconcile_evidence "$expected_sha" "$stale_deployed" "$gen_before" "$planned_gen"
    return 0
  fi

  vps_attest_crash_hook before_mirror
  if ! vps_attest_mirror_deployed_git_sha "${VPS_ATTESTATION_BACKEND_ENV:-}" "$expected_sha"; then
    body="$(vps_attest_build_state_body FAILED "$planned_gen" "$stale_deployed" "$(vps_attest_state_read_kv PREVIOUS_SHA)")"
    vps_attest_state_write_atomic "$body" || true
    return 1
  fi
  vps_attest_crash_hook after_mirror

  body="$(vps_attest_build_state_body COMMITTED "$planned_gen" "$expected_sha" "$prev_for_state")"
  vps_attest_crash_hook before_state_write
  vps_attest_state_write_atomic "$body" || return 1
  vps_attest_emit_reconcile_evidence "$expected_sha" "$stale_deployed" "$gen_before" "$planned_gen"
  return 0
}

vps_attest_record_rollback_success() {
  local release_dir=$1
  local previous_sha=$2
  vps_attest_require_lock_held || return 1
  vps_attest_validate_sha "$previous_sha" || return 1
  previous_sha="$(vps_attest_normalize_sha "$previous_sha")"
  vps_attest_require_replica_verify "$release_dir" "$previous_sha" || return 1

  local gen cur body last
  last="$(vps_attest_last_recorded_deployed_sha)"
  cur="${last}"
  gen="$(vps_attest_next_generation)"

  # shellcheck source=lib/vps-release-attestation-env-mirror.lib.sh
  source "$(dirname "${BASH_SOURCE[0]}")/vps-release-attestation-env-mirror.lib.sh"
  if ! vps_attest_mirror_deployed_git_sha "${VPS_ATTESTATION_BACKEND_ENV:-}" "$previous_sha"; then
    return 1
  fi
  body="$(vps_attest_build_state_body COMMITTED "$gen" "$previous_sha" "$cur")"
  vps_attest_state_write_atomic "$body"
}

vps_attest_record_rollback_denied() {
  local release_dir=$1
  vps_attest_require_lock_held || return 1
  local cur
  cur="$(vps_attest_last_recorded_deployed_sha)"
  if [[ -z "$cur" ]]; then
    return 0
  fi
  vps_attest_require_replica_verify "$release_dir" "$cur" || return 1
  vps_attest_ensure_mirror_matches "$cur" || return 1
  return 0
}

vps_attest_reader_is_rolled_back() {
  vps_attest_state_verify_checksum || return 1
  [[ "$(vps_attest_state_read_kv STATUS)" == "ROLLED_BACK" ]]
}
