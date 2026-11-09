#!/usr/bin/env bash
# Multi-replica production deploy helpers — sourced by vps-deploy-release.sh / rollback.
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  echo "This file must be sourced, not executed." >&2
  exit 1
fi

_VO5C_LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -n "${SYNQDRIVE_VO5C_ROLLBACK_AUTHORITY_OPS_DIR:-}" ]]; then
  _VO5C_AUTHORITY_LIB="${SYNQDRIVE_VO5C_ROLLBACK_AUTHORITY_OPS_DIR}/lib/vps-vo5c-security-floor.lib.sh"
else
  _VO5C_AUTHORITY_LIB="${_VO5C_LIB_DIR}/vps-vo5c-security-floor.lib.sh"
fi
if [[ ! -f "${_VO5C_AUTHORITY_LIB}" ]]; then
  echo "ABORT: VO5C rollback authority library missing (${_VO5C_AUTHORITY_LIB})" >&2
  return 1
fi
# shellcheck source=lib/vps-vo5c-security-floor.lib.sh
if ! source "${_VO5C_AUTHORITY_LIB}"; then
  echo "ABORT: VO5C rollback authority library load failed" >&2
  return 1
fi
if ! vps_vo5c_require_rollback_guard_ready; then
  echo "ABORT: VO5C rollback guard not ready" >&2
  return 1
fi

vps_replica_log() {
  printf '[%s] [multi-replica] %s\n' "$(date -u +%H:%M:%S)" "$*"
}

vps_replica_pm2_exists() {
  local name=$1
  pm2 describe "$name" >/dev/null 2>&1
}

vps_replica_port_listening() {
  local port=$1
  local listening_lines
  local ss_rc=0
  # Capture ss output once — avoids `ss | grep -q` SIGPIPE + `set -o pipefail` false negatives.
  # Fail closed on non-zero ss exit even when partial stdout contained a matching line.
  listening_lines="$(ss -tlnp 2>/dev/null)" || ss_rc=$?
  if [[ "$ss_rc" -ne 0 ]]; then
    return 1
  fi
  if [[ -z "${listening_lines//[[:space:]]/}" ]]; then
    return 1
  fi
  grep -qE ":${port}([^0-9]|$)" <<<"$listening_lines"
}

vps_replica_release_sha() {
  local release_dir=$1
  git -C "$release_dir" rev-parse HEAD 2>/dev/null || echo ""
}

vps_replica_current_release_dir() {
  readlink -f "${SYNQDRIVE_CURRENT_LINK}" 2>/dev/null || echo ""
}

vps_replica_current_sha() {
  local dir
  dir="$(vps_replica_current_release_dir)"
  if [[ -z "$dir" ]]; then
    echo ""
    return 0
  fi
  vps_replica_release_sha "$dir"
}

vps_replica_curl_health_ok() {
  local port=$1
  local body
  body=$(curl -sf "http://127.0.0.1:${port}/api/v1/health" 2>/dev/null || true)
  [[ -n "$body" ]] && grep -q '"status":"ok"' <<<"$body"
}

vps_replica_curl_readiness_ok() {
  local port=$1
  local body
  body=$(curl -sf "http://127.0.0.1:${port}/api/v1/health/readiness" 2>/dev/null || true)
  [[ -n "$body" ]] && grep -q '"status":"ok"' <<<"$body"
}

vps_replica_readiness_role() {
  local port=$1
  local body
  body=$(curl -sf "http://127.0.0.1:${port}/api/v1/health/readiness" 2>/dev/null || true)
  if [[ -z "$body" ]]; then
    echo "UNREACHABLE"
    return 0
  fi
  printf '%s' "$body" | node -e '
    let d="";process.stdin.on("data",c=>d+=c);process.stdin.on("end",()=>{
      try{const j=JSON.parse(d); console.log(j.checks?.schedulerLeader?.details?.role||"UNKNOWN")}catch{console.log("UNREACHABLE")}
    })'
}

vps_replica_pm2_uptime_sec() {
  local name=$1
  pm2 jlist 2>/dev/null | node -e "
    let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{
      try{
        const apps=JSON.parse(d);
        const app=apps.find(x=>x.name==='${name}');
        const ms=app?.pm2_env?.pm_uptime;
        if(!ms){console.log(-1);return}
        console.log(Math.floor((Date.now()-ms)/1000));
      }catch{console.log(-1)}
    })"
}

vps_replica_pm2_pid() {
  local name=$1
  pm2 jlist 2>/dev/null | node -e "
    let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{
      try{
        const apps=JSON.parse(d);
        const app=apps.find(x=>x.name==='${name}');
        console.log(app?.pid||0);
      }catch{console.log(0)}
    })"
}

vps_replica_ecosystem_path() {
  echo "${SYNQDRIVE_CURRENT_LINK}/backend/scripts/ops/pm2.production-ecosystem.config.cjs"
}

vps_replica_ensure_registered() {
  local ecosystem
  ecosystem="$(vps_replica_ecosystem_path)"
  if [[ ! -f "$ecosystem" ]]; then
    vps_replica_log "ABORT: missing PM2 ecosystem ${ecosystem}"
    return 1
  fi

  if ! vps_replica_pm2_exists "${SYNQDRIVE_REPLICA_A_PM2_NAME}"; then
    vps_replica_log "Starting primary ${SYNQDRIVE_REPLICA_A_PM2_NAME}"
    pm2 start "$ecosystem" --only "${SYNQDRIVE_REPLICA_A_PM2_NAME}" --update-env
  fi

  if [[ "${SYNQDRIVE_PRODUCTION_REPLICA_COUNT}" -ge 2 ]]; then
    if ! vps_replica_pm2_exists "${SYNQDRIVE_REPLICA_B_PM2_NAME}"; then
      vps_replica_log "Starting secondary ${SYNQDRIVE_REPLICA_B_PM2_NAME}"
      pm2 start "$ecosystem" --only "${SYNQDRIVE_REPLICA_B_PM2_NAME}" --update-env
    fi
  fi
  return 0
}

vps_replica_restart_one() {
  local name=$1
  local ecosystem
  ecosystem="$(vps_replica_ecosystem_path)"
  vps_replica_log "Restarting ${name}"
  if vps_replica_pm2_exists "$name"; then
    pm2 restart "$ecosystem" --only "$name" --update-env
  else
    pm2 start "$ecosystem" --only "$name" --update-env
  fi
}

# F10.4.0.3 — bounded verified stop (PM2 offline + port not listening).
vps_replica_verify_stopped() {
  local name=$1 port=$2
  local attempt=0
  local max_attempts="${SYNQDRIVE_REPLICA_STOP_VERIFY_RETRIES:-10}"
  local delay="${SYNQDRIVE_REPLICA_STOP_VERIFY_DELAY_SEC:-0.3}"
  local pid

  while [[ "$attempt" -lt "$max_attempts" ]]; do
    attempt=$((attempt + 1))
    pid="$(vps_replica_pm2_pid "$name")"
    if [[ -z "$pid" || "$pid" == "0" ]]; then
      if ! vps_replica_port_listening "$port"; then
        echo "REPLICA_STOP_VERIFIED=${name}"
        return 0
      fi
    fi
    sleep "$delay"
  done
  echo "REPLICA_STOP_VERIFY_FAILED=${name}"
  return 1
}

vps_replica_stop_verified() {
  local name=$1 port=$2
  vps_replica_log "Verified stop ${name} (port ${port})"
  if vps_replica_pm2_exists "$name"; then
    if ! pm2 stop "$name" --update-env 2>/dev/null; then
      pm2 stop "$name" || return 1
    fi
  fi
  vps_replica_verify_stopped "$name" "$port"
}

vps_replica_wait_healthy() {
  local name=$1
  local port=$2
  local target_sha=$3
  local attempt=0
  local max_attempts="${SYNQDRIVE_REPLICA_HEALTH_RETRIES}"
  local delay="${SYNQDRIVE_REPLICA_HEALTH_DELAY_SEC}"

  while [[ "$attempt" -lt "$max_attempts" ]]; do
    attempt=$((attempt + 1))
    local pid uptime current_sha health_ok readiness_ok listening
    pid="$(vps_replica_pm2_pid "$name")"
    uptime="$(vps_replica_pm2_uptime_sec "$name")"
    current_sha="$(vps_replica_current_sha)"
    listening=false
    health_ok=false
    readiness_ok=false

    if vps_replica_port_listening "$port"; then listening=true; fi
    if vps_replica_curl_health_ok "$port"; then health_ok=true; fi
    if vps_replica_curl_readiness_ok "$port"; then readiness_ok=true; fi

    local sha_ok=false
    if [[ -n "$target_sha" && "$current_sha" == "$target_sha" ]]; then
      sha_ok=true
    fi

    vps_replica_log "verify ${name} attempt=${attempt} pid=${pid} port=${port} listen=${listening} health=${health_ok} ready=${readiness_ok} sha=${sha_ok} uptime=${uptime}s"

    if [[ "$pid" != "0" ]] && [[ "$listening" == true ]] && [[ "$health_ok" == true ]] && [[ "$readiness_ok" == true ]] && [[ "$sha_ok" == true ]]; then
      return 0
    fi

    sleep "$delay"
  done

  vps_replica_log "ABORT: ${name} failed health verification on port ${port}"
  return 1
}

vps_replica_collect_scheduler_roles() {
  local role_a role_b
  role_a="$(vps_replica_readiness_role "${SYNQDRIVE_REPLICA_A_PORT}")"
  if [[ "${SYNQDRIVE_PRODUCTION_REPLICA_COUNT}" -ge 2 ]]; then
    role_b="$(vps_replica_readiness_role "${SYNQDRIVE_REPLICA_B_PORT}")"
  else
    role_b="N/A"
  fi
  printf '%s %s' "$role_a" "$role_b"
}

vps_replica_count_scheduler_leaders() {
  local role_a role_b leader_count=0
  role_a="$(vps_replica_readiness_role "${SYNQDRIVE_REPLICA_A_PORT}")"
  if [[ "${SYNQDRIVE_PRODUCTION_REPLICA_COUNT}" -ge 2 ]]; then
    role_b="$(vps_replica_readiness_role "${SYNQDRIVE_REPLICA_B_PORT}")"
  else
    role_b="N/A"
  fi

  [[ "$role_a" == "LEADER" ]] && leader_count=$((leader_count + 1))
  [[ "$role_b" == "LEADER" ]] && leader_count=$((leader_count + 1))
  echo "$leader_count"
}

vps_replica_wait_scheduler_leader_convergence() {
  local wait_script="${SYNQDRIVE_CURRENT_LINK}/backend/scripts/ops/vps-scheduler-leader-convergence-wait.mjs"
  if [[ ! -f "$wait_script" ]]; then
    vps_replica_log "ABORT: missing scheduler convergence script ${wait_script}"
    return 1
  fi

  vps_replica_log "scheduler convergence gate: timeoutMs=${SYNQDRIVE_SCHEDULER_LEADER_CONVERGENCE_TIMEOUT_MS} pollMs=${SYNQDRIVE_SCHEDULER_LEADER_POLL_INTERVAL_MS} stable=${SYNQDRIVE_SCHEDULER_LEADER_STABLE_OBSERVATIONS}"

  local output
  if ! output="$(node "$wait_script" \
    --port-a "${SYNQDRIVE_REPLICA_A_PORT}" \
    --port-b "${SYNQDRIVE_REPLICA_B_PORT}" \
    --replica-count "${SYNQDRIVE_PRODUCTION_REPLICA_COUNT}" \
    --poll-interval-ms "${SYNQDRIVE_SCHEDULER_LEADER_POLL_INTERVAL_MS}" \
    --timeout-ms "${SYNQDRIVE_SCHEDULER_LEADER_CONVERGENCE_TIMEOUT_MS}" \
    --stable-observations "${SYNQDRIVE_SCHEDULER_LEADER_STABLE_OBSERVATIONS}" 2>&1)"; then
    vps_replica_log "ABORT: scheduler convergence failed"
    vps_replica_log "$output"
    return 1
  fi

  vps_replica_log "scheduler convergence PASS: ${output}"
  return 0
}

vps_replica_verify_scheduler_leaders() {
  local expected=${1:-1}
  local role_a role_b leader_count=0
  role_a="$(vps_replica_readiness_role "${SYNQDRIVE_REPLICA_A_PORT}")"
  if [[ "${SYNQDRIVE_PRODUCTION_REPLICA_COUNT}" -ge 2 ]]; then
    role_b="$(vps_replica_readiness_role "${SYNQDRIVE_REPLICA_B_PORT}")"
  else
    role_b="N/A"
  fi

  [[ "$role_a" == "LEADER" ]] && leader_count=$((leader_count + 1))
  [[ "$role_b" == "LEADER" ]] && leader_count=$((leader_count + 1))

  vps_replica_log "scheduler roles A=${role_a} B=${role_b} leaders=${leader_count}"

  if [[ "$leader_count" -ne "$expected" ]]; then
    vps_replica_log "ABORT: expected ${expected} scheduler leader(s), got ${leader_count}"
    return 1
  fi
  return 0
}

vps_replica_nginx_dual_upstream_ok() {
  if [[ "${SYNQDRIVE_PRODUCTION_REPLICA_COUNT}" -lt 2 ]]; then
    return 0
  fi
  if [[ ! -f "${SYNQDRIVE_NGINX_SITE}" ]]; then
    vps_replica_log "WARN: nginx site missing ${SYNQDRIVE_NGINX_SITE}"
    return 1
  fi
  local text
  text="$(cat "${SYNQDRIVE_NGINX_SITE}")"
  if echo "$text" | grep -q 'upstream synqdrive_backend' \
    && echo "$text" | grep -q '127.0.0.1:3001' \
    && echo "$text" | grep -q '127.0.0.1:3002'; then
    return 0
  fi
  vps_replica_log "ABORT: nginx missing dual upstream synqdrive_backend (3001+3002)"
  return 1
}

# Bounded post-deploy probes for port / health / readiness (does not relax SHA, PM2, or uptime gates).
vps_replica_verify_runtime_probes_bounded() {
  local name=$1
  local port=$2
  local attempt=0
  local max_attempts="${SYNQDRIVE_POST_DEPLOY_RUNTIME_VERIFY_RETRIES}"
  local delay="${SYNQDRIVE_POST_DEPLOY_RUNTIME_VERIFY_DELAY_SEC}"

  while [[ "$attempt" -lt "$max_attempts" ]]; do
    attempt=$((attempt + 1))
    if vps_replica_port_listening "$port" \
      && vps_replica_curl_health_ok "$port" \
      && vps_replica_curl_readiness_ok "$port"; then
      return 0
    fi
    if [[ "$attempt" -lt "$max_attempts" ]]; then
      sleep "$delay"
    fi
  done

  if ! vps_replica_port_listening "$port"; then
    vps_replica_log "ABORT: ${name} port ${port} not listening"
    return 1
  fi
  if ! vps_replica_curl_health_ok "$port"; then
    vps_replica_log "ABORT: ${name} health failed on port ${port}"
    return 1
  fi
  vps_replica_log "ABORT: ${name} readiness failed on port ${port}"
  return 1
}

# Runtime identity + replica health without post-deploy uptime freshness (P4B16 reconcile path).
vps_replica_verify_runtime_identity_no_uptime() {
  local target_sha=$1
  local current_sha
  current_sha="$(vps_replica_current_sha)"
  if [[ "$current_sha" != "$target_sha" ]]; then
    vps_replica_log "ABORT: current symlink SHA ${current_sha} != target ${target_sha}"
    return 1
  fi

  local names=("${SYNQDRIVE_REPLICA_A_PM2_NAME}")
  local ports=("${SYNQDRIVE_REPLICA_A_PORT}")
  if [[ "${SYNQDRIVE_PRODUCTION_REPLICA_COUNT}" -ge 2 ]]; then
    names+=("${SYNQDRIVE_REPLICA_B_PM2_NAME}")
    ports+=("${SYNQDRIVE_REPLICA_B_PORT}")
  fi

  local i
  for i in "${!names[@]}"; do
    local name=${names[$i]}
    local port=${ports[$i]}
    if ! vps_replica_pm2_exists "$name"; then
      vps_replica_log "ABORT: required replica ${name} not registered in PM2"
      return 1
    fi
    vps_replica_verify_runtime_probes_bounded "$name" "$port" || return 1
  done

  vps_replica_log "SHA invariant OK: all replicas on ${target_sha} (no uptime gate)"
  return 0
}

vps_replica_verify_no_mixed_sha() {
  local target_sha=$1
  vps_replica_verify_runtime_identity_no_uptime "$target_sha" || return 1

  local names=("${SYNQDRIVE_REPLICA_A_PM2_NAME}")
  if [[ "${SYNQDRIVE_PRODUCTION_REPLICA_COUNT}" -ge 2 ]]; then
    names+=("${SYNQDRIVE_REPLICA_B_PM2_NAME}")
  fi

  local name uptime
  for name in "${names[@]}"; do
    uptime="$(vps_replica_pm2_uptime_sec "$name")"
    if [[ "$uptime" -lt 0 ]] || [[ "$uptime" -gt "${SYNQDRIVE_MAX_UPTIME_AFTER_DEPLOY_SEC}" ]]; then
      vps_replica_log "ABORT: ${name} uptime ${uptime}s suggests process was not restarted for this deploy"
      return 1
    fi
  done

  return 0
}

vps_replica_capture_deploy_state() {
  local state_file=$1
  mkdir -p "$(dirname "$state_file")"
  local previous_current previous_sha
  previous_current="$(vps_replica_current_release_dir)"
  previous_sha="$(vps_replica_current_sha)"
  local pm2_dump="${SYNQDRIVE_DEPLOY_STATE_DIR}/pm2-pre-deploy-$(date -u +%Y%m%d%H%M%S).dump"
  pm2 save
  cp /root/.pm2/dump.pm2 "$pm2_dump" 2>/dev/null || true

  cat >"$state_file" <<EOF
PREVIOUS_CURRENT_RELEASE=${previous_current}
PREVIOUS_SHA=${previous_sha}
CAPTURED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)
PM2_DUMP=${pm2_dump}
NGINX_SITE=${SYNQDRIVE_NGINX_SITE}
REPLICA_COUNT=${SYNQDRIVE_PRODUCTION_REPLICA_COUNT}
EOF
  vps_replica_log "Captured deploy state → ${state_file} (previous=${previous_sha:0:12})"
}

vps_replica_rolling_deploy() {
  local release_dir=$1
  local target_sha=$2

  cd "${SYNQDRIVE_CURRENT_LINK}/backend"

  vps_replica_ensure_registered || return 1

  if [[ "${SYNQDRIVE_DI_S4F7Q_EXACT_RC_ATTESTATION_GATE:-0}" == "1" ]]; then
    if [[ -z "${SYNQDRIVE_DEPLOY_CONTROLLER_ROOT:-}" ]]; then
      vps_replica_log "ABORT: guarded deploy requires SYNQDRIVE_DEPLOY_CONTROLLER_ROOT (S4F-7R)"
      return 1
    fi
    # shellcheck source=lib/di-v0-s4f7q-exact-rc-attestation-deploy.lib.sh
    source "${SYNQDRIVE_DEPLOY_CONTROLLER_ROOT}/backend/scripts/ops/lib/di-v0-s4f7q-exact-rc-attestation-deploy.lib.sh"
    export SYNQDRIVE_DI_S4F7Q_FORWARD_EXACT_RC_GATE="${SYNQDRIVE_DI_S4F7Q_FORWARD_EXACT_RC_GATE:-1}"
    vps_replica_rolling_deploy_s4f7q_gated "$release_dir" "$target_sha" || return 1
    pm2 save
    return 0
  fi

  vps_replica_restart_one "${SYNQDRIVE_REPLICA_A_PM2_NAME}" || return 1
  vps_replica_wait_healthy "${SYNQDRIVE_REPLICA_A_PM2_NAME}" "${SYNQDRIVE_REPLICA_A_PORT}" "$target_sha" || return 1

  if [[ "${SYNQDRIVE_PRODUCTION_REPLICA_COUNT}" -ge 2 ]]; then
    vps_replica_restart_one "${SYNQDRIVE_REPLICA_B_PM2_NAME}" || return 1
    vps_replica_wait_healthy "${SYNQDRIVE_REPLICA_B_PM2_NAME}" "${SYNQDRIVE_REPLICA_B_PORT}" "$target_sha" || return 1
  fi

  pm2 save
  return 0
}

# P4B16 attestation-only reconcile: same routing/health gates as post-deploy, without uptime freshness.
vps_replica_verify_attestation_reconcile() {
  local release_dir=$1
  local target_sha=$2

  local release_sha
  release_sha="$(vps_replica_release_sha "$release_dir")"
  if [[ "$release_sha" != "$target_sha" ]]; then
    vps_replica_log "ABORT: release dir SHA ${release_sha} != target ${target_sha}"
    return 1
  fi

  vps_replica_verify_runtime_identity_no_uptime "$target_sha" || return 1
  vps_replica_wait_scheduler_leader_convergence || return 1
  vps_replica_verify_scheduler_leaders 1 || return 1
  vps_replica_nginx_dual_upstream_ok || return 1

  if [[ -n "${SYNQDRIVE_EXTERNAL_HEALTH_URL:-}" ]]; then
    if curl -sf "${SYNQDRIVE_EXTERNAL_HEALTH_URL}" >/dev/null 2>&1; then
      vps_replica_log "External health PASS ${SYNQDRIVE_EXTERNAL_HEALTH_URL}"
    else
      vps_replica_log "ABORT: external health failed ${SYNQDRIVE_EXTERNAL_HEALTH_URL}"
      return 1
    fi
  fi

  return 0
}

vps_replica_verify_post_deploy() {
  local release_dir=$1
  local target_sha=$2

  vps_replica_verify_no_mixed_sha "$target_sha" || return 1
  vps_replica_wait_scheduler_leader_convergence || return 1
  vps_replica_verify_scheduler_leaders 1 || return 1
  vps_replica_nginx_dual_upstream_ok || return 1

  if [[ -n "${SYNQDRIVE_EXTERNAL_HEALTH_URL:-}" ]]; then
    if curl -sf "${SYNQDRIVE_EXTERNAL_HEALTH_URL}" >/dev/null 2>&1; then
      vps_replica_log "External health PASS ${SYNQDRIVE_EXTERNAL_HEALTH_URL}"
    else
      vps_replica_log "ABORT: external health failed ${SYNQDRIVE_EXTERNAL_HEALTH_URL}"
      return 1
    fi
  fi

  pm2 list
  return 0
}

vps_replica_rollback() {
  local state_file=$1
  if [[ ! -f "$state_file" ]]; then
    vps_replica_log "ABORT: rollback state file missing: ${state_file}"
    return 1
  fi

  # shellcheck disable=SC1090
  source "$state_file"

  if [[ -z "${PREVIOUS_CURRENT_RELEASE:-}" ]] || [[ ! -d "${PREVIOUS_CURRENT_RELEASE}" ]]; then
    vps_replica_log "ABORT: previous release dir invalid: ${PREVIOUS_CURRENT_RELEASE:-}"
    return 1
  fi

  local previous_sha
  previous_sha="$(vps_replica_release_sha "${PREVIOUS_CURRENT_RELEASE}")"

  local _replica_ops_dir
  _replica_ops_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

  if ! vps_vo5c_require_rollback_guard_ready; then
    vps_replica_log "ABORT: ${VO5C_UNSAFE_ROLLBACK_DENIED_CODE}"
    vps_vo5c_log_unsafe_rollback_containment "rollback_guard_missing"
    if [[ -f "${_replica_ops_dir}/lib/vps-release-attestation-integration.lib.sh" ]]; then
      # shellcheck source=lib/vps-release-attestation-integration.lib.sh
      source "${_replica_ops_dir}/lib/vps-release-attestation-integration.lib.sh"
      vps_p4b16_on_rollback_denied "$_replica_ops_dir" "$(vps_replica_current_release_dir)" || true
    fi
    return 1
  fi
  if ! vps_vo5c_assert_release_rollback_eligible "${PREVIOUS_CURRENT_RELEASE}" "$previous_sha"; then
    vps_replica_log "ABORT: ${VO5C_UNSAFE_ROLLBACK_DENIED_CODE}"
    vps_vo5c_log_unsafe_rollback_containment "rollback_denied_before_symlink"
    if [[ -f "${_replica_ops_dir}/lib/vps-release-attestation-integration.lib.sh" ]]; then
      # shellcheck source=lib/vps-release-attestation-integration.lib.sh
      source "${_replica_ops_dir}/lib/vps-release-attestation-integration.lib.sh"
      vps_p4b16_on_rollback_denied "$_replica_ops_dir" "$(vps_replica_current_release_dir)" || true
    fi
    return 1
  fi

  vps_replica_log "ROLLBACK: restoring ${PREVIOUS_CURRENT_RELEASE}"
  ln -sfn "${PREVIOUS_CURRENT_RELEASE}" "${SYNQDRIVE_CURRENT_LINK}"

  # S4F-7R: rollback must not re-apply forward exact-RC attestation / SHA pins.
  export SYNQDRIVE_DI_S4F7Q_EXACT_RC_ATTESTATION_GATE=0
  export SYNQDRIVE_DI_S4F7Q_FORWARD_EXACT_RC_GATE=0
  vps_replica_log "ROLLBACK_FORWARD_GATE_DISABLED=YES"

  vps_replica_rolling_deploy "${PREVIOUS_CURRENT_RELEASE}" "$previous_sha" || {
    vps_replica_log "ROLLBACK WARN: rolling restart failed — PM2 dump resurrect disabled (VO5C forward recovery)"
    if [[ -n "${PM2_DUMP:-}" && -f "${PM2_DUMP}" ]]; then
      vps_vo5c_assert_pm2_dump_restore_allowed "${PREVIOUS_CURRENT_RELEASE}" "$previous_sha" "${PM2_DUMP}" || true
      vps_vo5c_log_unsafe_rollback_containment "pm2_dump_resurrect_disabled"
    fi
    return 1
  }

  vps_replica_verify_post_deploy "${PREVIOUS_CURRENT_RELEASE}" "$previous_sha" || return 1

  if [[ -f "${_replica_ops_dir}/lib/vps-release-attestation-integration.lib.sh" ]]; then
    # shellcheck source=lib/vps-release-attestation-integration.lib.sh
    source "${_replica_ops_dir}/lib/vps-release-attestation-integration.lib.sh"
    local _attest_rc=0
    set +e
    vps_p4b16_publish_after_rollback_verify "$_replica_ops_dir" "${PREVIOUS_CURRENT_RELEASE}" "$previous_sha"
    _attest_rc=$?
    set -e
    if vps_p4b16_is_partial_success_rc "$_attest_rc"; then
      vps_replica_log "ROLLBACK PARTIAL_SUCCESS: replicas restored; attestation reconciliation required"
      return "$_attest_rc"
    fi
    if [[ "$_attest_rc" -ne 0 ]]; then
      vps_replica_log "ABORT: P4B16 rollback attestation hook failed (exit ${_attest_rc})"
      return "$_attest_rc"
    fi
  fi

  vps_replica_log "ROLLBACK complete → ${previous_sha:0:12}"
  return 0
}
