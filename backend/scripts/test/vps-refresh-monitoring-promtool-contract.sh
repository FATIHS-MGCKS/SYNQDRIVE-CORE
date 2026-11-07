#!/usr/bin/env bash
# Contract: vps-refresh-monitoring fail-closed validation (real validate_prometheus_bundle + refresh_prometheus).
set -euo pipefail

BACKEND_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
REPO_ROOT="$(cd "${BACKEND_ROOT}/.." && pwd)"
OPS_SCRIPT="${BACKEND_ROOT}/scripts/ops/vps-refresh-monitoring.sh"
CANONICAL_PROM="${REPO_ROOT}/backend/monitoring/prometheus"

REPORT_INVALID_FIRST_FILE=SKIP
REPORT_INVALID_SECOND_FILE=SKIP
REPORT_INVALID_THIRD_FILE=SKIP
REPORT_MISSING_SOURCE_FILE=SKIP
REPORT_COPY_FAILURE=SKIP
REPORT_DOCKER_FAILURE_PROPAGATION=SKIP
REPORT_DESTINATION_UNCHANGED=SKIP
REPORT_NO_RELOAD=SKIP
REPORT_VALID_REFRESH=SKIP
REPORT_DOCKER_RUNTIME=SKIP

cleanup() {
  [[ -n "${TMP_PROM:-}" && -d "$TMP_PROM" ]] && rm -rf "$TMP_PROM"
  [[ -n "${FAKE_BIN_DIR:-}" && -d "$FAKE_BIN_DIR" ]] && rm -rf "$FAKE_BIN_DIR"
  [[ -n "${FAKE_ROOT:-}" && -d "$FAKE_ROOT" ]] && rm -rf "$FAKE_ROOT"
}
trap cleanup EXIT

docker_daemon_ready() {
  command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1
}

resolve_host_promtool() {
  local PROM_VERSION="${PROMTOOL_VERSION:-2.54.1}"
  if [[ -n "${PROMTOOL_BIN:-}" && -x "${PROMTOOL_BIN}" ]]; then
    echo "${PROMTOOL_BIN}"
    return 0
  fi
  if command -v promtool >/dev/null 2>&1; then
    local candidate
    candidate="$(command -v promtool)"
    if "$candidate" --version >/dev/null 2>&1; then
      echo "$candidate"
      return 0
    fi
  fi
  local cache="/tmp/prometheus-${PROM_VERSION}.linux-amd64/promtool"
  if [[ -x "$cache" ]]; then
    echo "$cache"
    return 0
  fi
  local archive="/tmp/prometheus-${PROM_VERSION}.linux-amd64.tar.gz"
  if [[ ! -f "$archive" ]]; then
    curl -fsSL -o "$archive" \
      "https://github.com/prometheus/prometheus/releases/download/v${PROM_VERSION}/prometheus-${PROM_VERSION}.linux-amd64.tar.gz"
  fi
  tar -xzf "$archive" -C /tmp
  echo "$cache"
}

HOST_PROMTOOL="$(resolve_host_promtool)"

prom_dir_fingerprint() {
  local dir="$1"
  if [[ ! -d "$dir" ]]; then
    echo "MISSING"
    return 0
  fi
  (
    cd "$dir"
    find . -type f | sort | while read -r f; do
      printf '%s:%s\n' "$f" "$(cksum <"$f" | awk '{print $1}')"
    done
  )
}

prepare_fake_root() {
  [[ -n "${FAKE_ROOT:-}" && -d "$FAKE_ROOT" ]] && rm -rf "$FAKE_ROOT"
  FAKE_ROOT="$(mktemp -d)"
  mkdir -p "$FAKE_ROOT/backend/monitoring"
  cp -a "$CANONICAL_PROM" "$FAKE_ROOT/backend/monitoring/prometheus"
}

invoke_validate() {
  local fake_root="$1"
  local rc
  set +e
  SYNQDRIVE_ROOT="$fake_root" PROMTOOL_BIN="$HOST_PROMTOOL" bash -c '
    # shellcheck disable=SC1090
    source "$1"
    validate_prometheus_bundle
    exit $?
  ' _ "$OPS_SCRIPT" >/dev/null
  rc=$?
  set -e
  echo "$rc"
}

invoke_refresh() {
  local fake_root="$1"
  local prom_dir="$2"
  local backend_env="$3"
  local rc
  set +e
  SYNQDRIVE_ROOT="$fake_root" PROM_DIR="$prom_dir" BACKEND_ENV="$backend_env" PROMTOOL_BIN="$HOST_PROMTOOL" \
    AUTO_BOOTSTRAP=0 PATH="${TEST_PATH:-$PATH}" bash -c '
    # shellcheck disable=SC1090
    source "$1"
    refresh_prometheus
    exit $?
  ' _ "$OPS_SCRIPT" >/dev/null
  rc=$?
  set -e
  echo "$rc"
}

assert_script_requires_docker_entrypoint() {
  if grep -qE 'docker run --rm -v.*prom/prometheus:.*promtool check rules' "$OPS_SCRIPT"; then
    echo "script still contains broken docker promtool invocation" >&2
    return 1
  fi
  if ! grep -qF 'entrypoint promtool' "$OPS_SCRIPT"; then
    echo "script missing --entrypoint promtool docker validation" >&2
    return 1
  fi
}

assert_valid_three_file_bundle() {
  prepare_fake_root
  local rc
  rc="$(invoke_validate "$FAKE_ROOT")"
  if [[ "$rc" -ne 0 ]]; then
    echo "valid bundle should pass validate_prometheus_bundle (rc=$rc)" >&2
    return 1
  fi
}

assert_invalid_first_file() {
  prepare_fake_root
  echo "bad: [{]" >> "$FAKE_ROOT/backend/monitoring/prometheus/alerts.yml"
  local rc
  rc="$(invoke_validate "$FAKE_ROOT")"
  if [[ "$rc" -eq 0 ]]; then
    echo "invalid alerts.yml should fail" >&2
    return 1
  fi
  REPORT_INVALID_FIRST_FILE=PASS
}

assert_invalid_second_file() {
  prepare_fake_root
  echo "bad: [{]" >> "$FAKE_ROOT/backend/monitoring/prometheus/alerts-infra.yml"
  local rc
  rc="$(invoke_validate "$FAKE_ROOT")"
  if [[ "$rc" -eq 0 ]]; then
    echo "invalid alerts-infra.yml should fail" >&2
    return 1
  fi
  REPORT_INVALID_SECOND_FILE=PASS
}

assert_invalid_third_file() {
  prepare_fake_root
  echo "bad: [{]" >> "$FAKE_ROOT/backend/monitoring/prometheus/alerts-di-s4.yml"
  local rc
  rc="$(invoke_validate "$FAKE_ROOT")"
  if [[ "$rc" -eq 0 ]]; then
    echo "invalid alerts-di-s4.yml should fail" >&2
    return 1
  fi
  REPORT_INVALID_THIRD_FILE=PASS
}

assert_missing_source_file() {
  prepare_fake_root
  rm -f "$FAKE_ROOT/backend/monitoring/prometheus/alerts.yml"
  local rc
  rc="$(invoke_validate "$FAKE_ROOT")"
  if [[ "$rc" -eq 0 ]]; then
    echo "missing source alerts.yml should fail" >&2
    return 1
  fi
  REPORT_MISSING_SOURCE_FILE=PASS
}

assert_copy_failure() {
  FAKE_BIN_DIR="$(mktemp -d)"
  cat >"$FAKE_BIN_DIR/cp" <<'SH'
#!/usr/bin/env bash
if [[ "${1:-}" == *"/alerts.yml" ]]; then
  exit 1
fi
exec /bin/cp "$@"
SH
  chmod +x "$FAKE_BIN_DIR/cp"
  prepare_fake_root
  local rc
  set +e
  env PATH="$FAKE_BIN_DIR:$PATH" SYNQDRIVE_ROOT="$FAKE_ROOT" PROMTOOL_BIN="$HOST_PROMTOOL" bash -c '
    # shellcheck disable=SC1090
    source "$1"
    validate_prometheus_bundle
    exit $?
  ' _ "$OPS_SCRIPT" >/dev/null
  rc=$?
  set -e
  if [[ "$rc" -eq 0 ]]; then
    echo "copy failure should fail validation" >&2
    return 1
  fi
  REPORT_COPY_FAILURE=PASS
}

assert_docker_failure_propagates_bundle() {
  FAKE_BIN_DIR="$(mktemp -d)"
  cat >"$FAKE_BIN_DIR/docker" <<'SH'
#!/usr/bin/env bash
if [[ "${1:-}" == "run" ]]; then
  echo "simulated docker failure" >&2
  exit 42
fi
exit 0
SH
  chmod +x "$FAKE_BIN_DIR/docker"
  prepare_fake_root
  local rc
  set +e
  env PATH="$FAKE_BIN_DIR:/usr/bin:/bin" PROMTOOL_BIN="" SYNQDRIVE_ROOT="$FAKE_ROOT" bash -c '
    # shellcheck disable=SC1090
    source "$1"
    validate_prometheus_bundle
    exit $?
  ' _ "$OPS_SCRIPT" >/dev/null
  rc=$?
  set -e
  if [[ "$rc" -ne 1 ]]; then
    echo "expected validate_prometheus_bundle fail-closed rc=1 on docker failure, got $rc" >&2
    return 1
  fi
  REPORT_DOCKER_FAILURE_PROPAGATION=PASS
}

assert_conditional_validate_fail_closed() {
  prepare_fake_root
  echo "bad: [{]" >> "$FAKE_ROOT/backend/monitoring/prometheus/alerts.yml"
  local rc=0
  set +e
  SYNQDRIVE_ROOT="$FAKE_ROOT" PROMTOOL_BIN="$HOST_PROMTOOL" bash -c '
    # shellcheck disable=SC1090
    source "$1"
    if ! validate_prometheus_bundle; then
      exit 17
    fi
    exit 0
  ' _ "$OPS_SCRIPT" >/dev/null
  rc=$?
  set -e
  if [[ "$rc" -ne 17 ]]; then
    echo "if ! validate_prometheus_bundle should fail closed (rc=$rc)" >&2
    return 1
  fi
}

assert_destination_unchanged_and_no_reload_on_failure() {
  FAKE_BIN_DIR="$(mktemp -d)"
  cat >"$FAKE_BIN_DIR/curl" <<'SH'
#!/usr/bin/env bash
if [[ "$*" == *"/-/reload"* ]]; then
  echo 1 > "${RELOAD_MARKER:?}"
fi
command -v curl-real >/dev/null 2>&1 && exec curl-real "$@"
exec /usr/bin/curl "$@"
SH
  chmod +x "$FAKE_BIN_DIR/curl"
  if command -v curl >/dev/null 2>&1; then
    ln -sf "$(command -v curl)" "$FAKE_BIN_DIR/curl-real"
  fi

  prepare_fake_root
  echo "bad: [{]" >> "$FAKE_ROOT/backend/monitoring/prometheus/alerts.yml"

  TMP_PROM="$(mktemp -d)"
  local backend_env="$TMP_PROM/backend.env"
  local reload_marker="$TMP_PROM/reload.marker"
  printf 'METRICS_BEARER_TOKEN=test-token\n' > "$backend_env"
  printf 'sentinel-alpha\n' > "$TMP_PROM/alerts.yml"
  printf 'sentinel-beta\n' > "$TMP_PROM/prometheus.yml"
  mkdir -p "$TMP_PROM/secrets"
  printf 'old-token\n' > "$TMP_PROM/secrets/metrics_bearer_token"

  local before after rc
  before="$(prom_dir_fingerprint "$TMP_PROM")"
  export RELOAD_MARKER="$reload_marker"
  TEST_PATH="$FAKE_BIN_DIR:$PATH"
  rc="$(invoke_refresh "$FAKE_ROOT" "$TMP_PROM" "$backend_env")"
  unset TEST_PATH RELOAD_MARKER
  after="$(prom_dir_fingerprint "$TMP_PROM")"

  if [[ "$rc" -eq 0 ]]; then
    echo "refresh_prometheus should fail on invalid bundle" >&2
    return 1
  fi
  if [[ "$before" != "$after" ]]; then
    echo "PROM_DIR fingerprint changed after validation failure" >&2
    return 1
  fi
  if [[ -f "$reload_marker" ]]; then
    echo "prometheus reload attempted after validation failure" >&2
    return 1
  fi
  REPORT_DESTINATION_UNCHANGED=PASS
  REPORT_NO_RELOAD=PASS
}

assert_valid_refresh_promotes_rules() {
  prepare_fake_root
  TMP_PROM="$(mktemp -d)"
  local backend_env="$TMP_PROM/backend.env"
  printf 'METRICS_BEARER_TOKEN=test-token\n' > "$backend_env"

  local rc
  rc="$(invoke_refresh "$FAKE_ROOT" "$TMP_PROM" "$backend_env")"
  if [[ "$rc" -ne 0 ]]; then
    echo "valid refresh_prometheus should succeed (rc=$rc)" >&2
    return 1
  fi
  if ! cmp -s "$FAKE_ROOT/backend/monitoring/prometheus/alerts.yml" "$TMP_PROM/alerts.yml"; then
    echo "alerts.yml not promoted after successful validation" >&2
    return 1
  fi
  if [[ ! -f "$TMP_PROM/secrets/metrics_bearer_token" ]]; then
    echo "metrics bearer token not written after successful validation" >&2
    return 1
  fi
  REPORT_VALID_REFRESH=PASS
}

assert_legacy_docker_false_green_baseline() {
  if ! docker_daemon_ready; then
    REPORT_DOCKER_RUNTIME=SKIP
    return 0
  fi
  local tmp rules dir base legacy_out
  tmp="$(mktemp -d)"
  rules="$tmp/alerts.yml"
  cp "$CANONICAL_PROM/alerts.yml" "$rules"
  chmod a+rx "$tmp"
  chmod a+r "$rules"
  dir="$(cd "$(dirname "$rules")" && pwd)"
  base="$(basename "$rules")"
  legacy_out="$(docker run --rm -v "${dir}:/rules:ro" prom/prometheus:v2.54.1 \
    promtool check rules "/rules/${base}" 2>&1)" || true
  if ! echo "$legacy_out" | grep -q 'unexpected promtool'; then
    echo "legacy docker false-green baseline not reproduced" >&2
    return 1
  fi
  if docker_daemon_ready; then
    rules="$tmp/alerts.yml"
    local rc
    set +e
    # No host promtool on PATH — exercise docker --entrypoint promtool fallback (GHA has Docker).
    PATH="/usr/bin:/bin" PROMTOOL_BIN="" bash -c '
      set +e
      # shellcheck disable=SC1090
      source "$1"
      promtool_check_rules_file "$2"
      exit $?
    ' _ "$OPS_SCRIPT" "$rules"
    rc=$?
    set -e
    if [[ "$rc" -ne 0 ]]; then
      echo "docker entrypoint path should validate valid rules (rc=$rc)" >&2
      return 1
    fi
  fi
  REPORT_DOCKER_RUNTIME=PASS
}

rollback_snapshot_contract() {
  local prom_dir snap rules
  prom_dir="$(mktemp -d)"
  snap="$(mktemp -d)"
  rules="$prom_dir/alerts-di-s4.yml"
  printf 'before\n' > "$rules"
  cp -a "$prom_dir/." "$snap/"
  printf 'after\n' > "$rules"
  cp -a "$snap/." "$prom_dir/"
  if ! grep -q '^before$' "$rules"; then
    echo "rollback snapshot contract: rules file not restored" >&2
    return 1
  fi
}

assert_script_requires_docker_entrypoint
assert_valid_three_file_bundle
assert_invalid_first_file
assert_invalid_second_file
assert_invalid_third_file
assert_missing_source_file
assert_copy_failure
assert_docker_failure_propagates_bundle
assert_conditional_validate_fail_closed
assert_destination_unchanged_and_no_reload_on_failure
assert_valid_refresh_promotes_rules
assert_legacy_docker_false_green_baseline
rollback_snapshot_contract

echo "VPS_REFRESH_PROMTOOL_CONTRACT=PASS"
echo "INVALID_FIRST_FILE=$REPORT_INVALID_FIRST_FILE"
echo "INVALID_SECOND_FILE=$REPORT_INVALID_SECOND_FILE"
echo "INVALID_THIRD_FILE=$REPORT_INVALID_THIRD_FILE"
echo "MISSING_SOURCE_FILE=$REPORT_MISSING_SOURCE_FILE"
echo "COPY_FAILURE=$REPORT_COPY_FAILURE"
echo "DOCKER_FAILURE_PROPAGATION=$REPORT_DOCKER_FAILURE_PROPAGATION"
echo "DESTINATION_UNCHANGED_ON_FAILURE=$REPORT_DESTINATION_UNCHANGED"
echo "NO_RELOAD_ON_FAILURE=$REPORT_NO_RELOAD"
echo "VALID_REFRESH_REGRESSION=$REPORT_VALID_REFRESH"
echo "DOCKER_RUNTIME_TESTS=$REPORT_DOCKER_RUNTIME"
