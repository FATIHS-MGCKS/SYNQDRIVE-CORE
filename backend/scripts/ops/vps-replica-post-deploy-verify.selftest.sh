#!/usr/bin/env bash
# Post-deploy runtime verification contract tests (offline mocks; no production mutation).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

export SYNQDRIVE_PRODUCTION_REPLICA_COUNT=2
export SYNQDRIVE_DEPLOY_STATE_DIR="$(mktemp -d)"
export SYNQDRIVE_POST_DEPLOY_RUNTIME_VERIFY_RETRIES=5
export SYNQDRIVE_POST_DEPLOY_RUNTIME_VERIFY_DELAY_SEC=0.05

trap 'rm -rf "${SYNQDRIVE_DEPLOY_STATE_DIR}"' EXIT

# shellcheck source=vps-production-replica-topology.config.sh
source "${SCRIPT_DIR}/vps-production-replica-topology.config.sh"
# shellcheck source=lib/vps-production-replica.lib.sh
source "${SCRIPT_DIR}/lib/vps-production-replica.lib.sh"

fail() { echo "FAIL: $*" >&2; exit 1; }
pass() { echo "PASS: $*"; }

TARGET_SHA='1111111111111111111111111111111111111111'
BAD_SHA='2222222222222222222222222222222222222222'

MOCK_SS_DIR="$(mktemp -d)"
trap 'rm -rf "${SYNQDRIVE_DEPLOY_STATE_DIR}" "${MOCK_SS_DIR}"' EXIT
_SAVED_PATH="$PATH"

with_mock_ss_path() {
  PATH="${MOCK_SS_DIR}:${_SAVED_PATH}"
}

restore_path() {
  PATH="$_SAVED_PATH"
}

write_mock_ss() {
  local body=$1
  printf '%s\n' "$body" >"${MOCK_SS_DIR}/ss"
  chmod +x "${MOCK_SS_DIR}/ss"
}

# --- Production vps_replica_port_listening() regressions (mock ss only) ---
write_mock_ss '#!/usr/bin/env bash
echo "LISTEN 0 128 *:3002 *:* users:((\"node\",pid=1,fd=1))"
for _ in $(seq 1 400); do
  echo "LISTEN 0 128 *:19999 *:*"
done
exit 0'
with_mock_ss_path
if ! vps_replica_port_listening 3002; then
  fail "SIGPIPE adversarial: production port probe must PASS on 3002"
fi
if ( set -o pipefail; ss -tlnp 2>/dev/null | grep -q ':3002 ' ); then
  fail "SIGPIPE adversarial: legacy ss|grep pipeline should FAIL under pipefail"
fi
pass "sigpipe_adversarial_production_port_probe"

write_mock_ss '#!/usr/bin/env bash
exit 1'
with_mock_ss_path
if vps_replica_port_listening 3002; then
  fail "ss error with empty output must FAIL"
fi
pass "ss_error_empty_fail_closed"

write_mock_ss '#!/usr/bin/env bash
echo "LISTEN 0 128 *:3002 *:*"
exit 1'
with_mock_ss_path
if vps_replica_port_listening 3002; then
  fail "ss error with partial matching output must FAIL"
fi
pass "ss_error_partial_output_fail_closed"

write_mock_ss '#!/usr/bin/env bash
echo "LISTEN 0 128 *:3002 *:*"
exit 0'
with_mock_ss_path
vps_replica_port_listening 3002 || fail "successful ss with port 3002 must PASS"
pass "ss_success_port_3002"

write_mock_ss '#!/usr/bin/env bash
echo "LISTEN 0 128 *:30021 *:*"
exit 0'
with_mock_ss_path
if vps_replica_port_listening 3002; then
  fail "port 30021 must not satisfy probe for 3002"
fi
vps_replica_port_listening 30021 || fail "port 30021 must PASS when requested"
pass "port_boundary_3002_vs_30021"

restore_path

vps_replica_current_release_dir() { echo "${SYNQDRIVE_DEPLOY_STATE_DIR}/current-release"; }
vps_replica_release_sha() { echo "$TARGET_SHA"; }

# --- defaults (override per scenario) ---
_MOCK_PM2_EXISTS=1
_MOCK_PORT_LISTEN=1
_MOCK_HEALTH_OK=1
_MOCK_READINESS_OK=1
_MOCK_PORT_ATTEMPT_FAILS=0
_MOCK_CURRENT_SHA="$TARGET_SHA"

vps_replica_pm2_exists() {
  [[ "${_MOCK_PM2_EXISTS}" == "1" ]]
}

vps_replica_curl_health_ok() {
  local _port=$1
  [[ "${_MOCK_HEALTH_OK}" == "1" ]]
}

vps_replica_curl_readiness_ok() {
  local _port=$1
  [[ "${_MOCK_READINESS_OK}" == "1" ]]
}

vps_replica_current_sha() {
  echo "$_MOCK_CURRENT_SHA"
}

install_probe_mocks() {
  vps_replica_port_listening() {
    local port=$1
    local _ignored=$port
    if [[ "${_MOCK_PORT_ATTEMPT_FAILS}" -gt 0 ]]; then
      _MOCK_PORT_ATTEMPT_FAILS=$((_MOCK_PORT_ATTEMPT_FAILS - 1))
      return 1
    fi
    [[ "${_MOCK_PORT_LISTEN}" == "1" ]]
  }
}
install_probe_mocks

run_verify() {
  vps_replica_verify_runtime_identity_no_uptime "$TARGET_SHA"
}

reset_mocks() {
  _MOCK_PM2_EXISTS=1
  _MOCK_PORT_LISTEN=1
  _MOCK_HEALTH_OK=1
  _MOCK_READINESS_OK=1
  _MOCK_PORT_ATTEMPT_FAILS=0
  _MOCK_CURRENT_SHA="$TARGET_SHA"
}

# 1) transient port failure, then healthy
reset_mocks
_MOCK_PORT_ATTEMPT_FAILS=1
run_verify && pass "transient_port_then_healthy"

# 2) permanently closed port
reset_mocks
_MOCK_PORT_LISTEN=0
if run_verify 2>/dev/null; then
  fail "permanent_port_closed should FAIL"
fi
pass "permanent_port_closed"

# 3) permanent health/readiness failure
reset_mocks
_MOCK_HEALTH_OK=0
if run_verify 2>/dev/null; then
  fail "permanent_health_fail should FAIL"
fi
reset_mocks
_MOCK_READINESS_OK=0
if run_verify 2>/dev/null; then
  fail "permanent_readiness_fail should FAIL"
fi
pass "permanent_health_readiness_fail"

# 4) SHA mismatch
reset_mocks
_MOCK_CURRENT_SHA="$BAD_SHA"
if run_verify 2>/dev/null; then
  fail "sha_mismatch should FAIL"
fi
pass "sha_mismatch"

# 5) missing PM2 process (no retry)
reset_mocks
_MOCK_PM2_EXISTS=0
if run_verify 2>/dev/null; then
  fail "missing_pm2 should FAIL"
fi
pass "missing_pm2"

reset_mocks

# 6) dual-replica + uptime gate unchanged (mixed-SHA / rollback path still requires fresh PM2 uptime)
_UPTIME_LOG="${SYNQDRIVE_DEPLOY_STATE_DIR}/uptime-calls.log"
: >"$_UPTIME_LOG"
vps_replica_pm2_uptime_sec() {
  printf '1\n' >>"$_UPTIME_LOG"
  echo 30
}
if ! vps_replica_verify_no_mixed_sha "$TARGET_SHA"; then
  fail "verify_no_mixed_sha should PASS when probes and uptime OK"
fi
_uptime_calls="$(wc -l <"$_UPTIME_LOG" | tr -d ' ')"
[[ "$_uptime_calls" -ge 2 ]] || fail "verify_no_mixed_sha must check uptime for both replicas (got ${_uptime_calls})"
pass "dual_replica_uptime_gate_unchanged"

echo "vps-replica-post-deploy-verify selftest: OK"
