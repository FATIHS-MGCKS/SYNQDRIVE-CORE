#!/usr/bin/env bash
# Contract: vps-refresh-monitoring validates candidate rule files fail-closed (promtool / docker entrypoint).
set -euo pipefail

BACKEND_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
REPO_ROOT="$(cd "${BACKEND_ROOT}/.." && pwd)"
OPS_SCRIPT="${BACKEND_ROOT}/scripts/ops/vps-refresh-monitoring.sh"
TMP_PROM="$(mktemp -d)"
export SYNQDRIVE_ROOT="$REPO_ROOT"
export PROM_DIR="$TMP_PROM"
export BACKEND_ENV="$TMP_PROM/backend.env"
export AUTO_BOOTSTRAP=0
export PROMTOOL_BIN=""

PROM_VERSION="${PROMTOOL_VERSION:-2.54.1}"
SRC_PROM="${REPO_ROOT}/backend/monitoring/prometheus"

cleanup() {
  rm -rf "$TMP_PROM"
  [[ -n "${FAKE_BIN_DIR:-}" && -d "$FAKE_BIN_DIR" ]] && rm -rf "$FAKE_BIN_DIR"
}
trap cleanup EXIT

docker_daemon_ready() {
  command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1
}

printf 'METRICS_BEARER_TOKEN=test-token\n' > "$BACKEND_ENV"

# shellcheck disable=SC1090
source "$OPS_SCRIPT"

resolve_host_promtool() {
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
export PROMTOOL_BIN="$HOST_PROMTOOL"

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

assert_valid_bundle_passes() {
  validate_prometheus_bundle
}

assert_invalid_yaml_fails() {
  local tmp rules
  tmp="$(mktemp -d)"
  rules="$tmp/bad.yml"
  cp "$SRC_PROM/alerts-di-s4.yml" "$rules"
  echo "bad: [{]" >> "$rules"
  if promtool_check_rules_file "$rules"; then
    echo "expected invalid YAML to fail promtool_check_rules_file" >&2
    return 1
  fi
  rm -rf "$tmp"
}

assert_invalid_rule_fails() {
  local tmp rules
  tmp="$(mktemp -d)"
  rules="$tmp/semantic.yml"
  cat >"$rules" <<'YAML'
groups:
  - name: contract-bad-rule
    rules:
      - alert: BadPromQL
        expr: sum({{invalid
        for: 1m
YAML
  if promtool_check_rules_file "$rules"; then
    echo "expected semantically invalid rule to fail" >&2
    return 1
  fi
  rm -rf "$tmp"
}

assert_missing_file_fails() {
  if promtool_check_rules_file "/tmp/does-not-exist-$(date +%s)-alerts.yml"; then
    echo "expected missing rules file to fail" >&2
    return 1
  fi
}

assert_old_docker_entrypoint_false_green() {
  if ! docker_daemon_ready; then
    echo "FALSE_GREEN_REGRESSION_TEST=SKIP (docker daemon unavailable)"
    return 0
  fi
  local dir base tmp rules legacy_out legacy_rc
  tmp="$(mktemp -d)"
  rules="$tmp/alerts.yml"
  cp "$SRC_PROM/alerts.yml" "$rules"
  dir="$(cd "$(dirname "$rules")" && pwd)"
  base="$(basename "$rules")"
  set +e
  legacy_out="$(docker run --rm -v "${dir}:/rules:ro" prom/prometheus:v2.54.1 \
    promtool check rules "/rules/${base}" 2>&1)"
  legacy_rc=$?
  set -e
  if ! echo "$legacy_out" | grep -q 'unexpected promtool'; then
    echo "legacy docker invocation did not reproduce prometheus entrypoint bug" >&2
    return 1
  fi
  echo "FALSE_GREEN_LEGACY_STDERR=confirmed (exit_code=${legacy_rc})"
}

assert_docker_entrypoint_validation_passes() {
  if ! docker_daemon_ready; then
    echo "DOCKER_VALID_RULES_TEST=SKIP (docker daemon unavailable)"
    return 0
  fi
  FAKE_BIN_DIR="$(mktemp -d)"
  cat >"$FAKE_BIN_DIR/promtool" <<'SH'
#!/usr/bin/env bash
echo "decoy promtool must not be used when docker is available" >&2
exit 1
SH
  chmod +x "$FAKE_BIN_DIR/promtool"
  local tmp rules
  tmp="$(mktemp -d)"
  rules="$tmp/alerts.yml"
  cp "$SRC_PROM/alerts.yml" "$rules"
  (
    export PATH="$FAKE_BIN_DIR:$PATH"
    unset PROMTOOL_BIN
    promtool_check_rules_file "$rules"
  )
  rm -rf "$tmp"
}

assert_docker_entrypoint_invalid_fails() {
  if ! docker_daemon_ready; then
    echo "DOCKER_INVALID_RULE_TEST=SKIP (docker daemon unavailable)"
    return 0
  fi
  FAKE_BIN_DIR="$(mktemp -d)"
  cat >"$FAKE_BIN_DIR/promtool" <<'SH'
#!/usr/bin/env bash
exit 1
SH
  chmod +x "$FAKE_BIN_DIR/promtool"
  local tmp rules
  tmp="$(mktemp -d)"
  rules="$tmp/semantic.yml"
  cat >"$rules" <<'YAML'
groups:
  - name: contract-bad-rule
    rules:
      - alert: BadPromQL
        expr: sum({{invalid
        for: 1m
YAML
  set +e
  (
    export PATH="$FAKE_BIN_DIR:$PATH"
    unset PROMTOOL_BIN
    promtool_check_rules_file "$rules"
  )
  local rc=$?
  set -e
  if [[ "$rc" -eq 0 ]]; then
    echo "expected docker promtool validation to fail on invalid rules" >&2
    return 1
  fi
  rm -rf "$tmp"
}

assert_docker_failure_propagates() {
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
  local tmp rules
  tmp="$(mktemp -d)"
  rules="$tmp/alerts.yml"
  cp "$SRC_PROM/alerts.yml" "$rules"
  set +e
  (
    export PATH="$FAKE_BIN_DIR:$PATH"
    unset PROMTOOL_BIN
    promtool_check_rules_file "$rules"
  )
  local rc=$?
  set -e
  if [[ "$rc" -ne 42 ]]; then
    echo "expected docker failure exit 42, got $rc" >&2
    return 1
  fi
  rm -rf "$tmp"
}

assert_validate_blocks_refresh() {
  local prom_dir before after rc
  prom_dir="$(mktemp -d)"
  export PROM_DIR="$prom_dir"
  printf 'sentinel-before-refresh\n' > "$PROM_DIR/alerts.yml"
  before="$(cat "$PROM_DIR/alerts.yml")"
  validate_prometheus_bundle() { return 1; }
  set +e
  refresh_prometheus >/dev/null 2>&1
  rc=$?
  set -e
  if [[ "$rc" -eq 0 ]]; then
    echo "expected refresh_prometheus to fail when validate_prometheus_bundle fails" >&2
    return 1
  fi
  after="$(cat "$PROM_DIR/alerts.yml")"
  if [[ "$before" != "$after" ]]; then
    echo "pre-reload gate failed: PROM_DIR mutated after validation failure" >&2
    return 1
  fi
  # Restore real validator for any follow-up in same shell (none today).
  unset -f validate_prometheus_bundle
  # shellcheck disable=SC1090
  source "$OPS_SCRIPT"
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
    echo "rollback snapshot contract: rules file not restored to pre-change content" >&2
    return 1
  fi
}

assert_script_requires_docker_entrypoint
assert_valid_bundle_passes
assert_invalid_yaml_fails
assert_invalid_rule_fails
assert_missing_file_fails
assert_old_docker_entrypoint_false_green
assert_docker_entrypoint_validation_passes
assert_docker_entrypoint_invalid_fails
assert_docker_failure_propagates
rollback_snapshot_contract
assert_validate_blocks_refresh

echo "VPS_REFRESH_PROMTOOL_CONTRACT=PASS"
