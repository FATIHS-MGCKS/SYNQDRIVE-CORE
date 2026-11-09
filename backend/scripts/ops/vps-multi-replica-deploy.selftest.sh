#!/usr/bin/env bash
# Shell-level smoke for multi-replica deploy library (no production mutation).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

export SYNQDRIVE_PRODUCTION_REPLICA_COUNT=2
export SYNQDRIVE_DEPLOY_STATE_DIR="$(mktemp -d)"
trap 'rm -rf "${SYNQDRIVE_DEPLOY_STATE_DIR}"' EXIT

# shellcheck source=vps-production-replica-topology.config.sh
source "${SCRIPT_DIR}/vps-production-replica-topology.config.sh"
# shellcheck source=lib/vps-production-replica.lib.sh
source "${SCRIPT_DIR}/lib/vps-production-replica.lib.sh"

TMP_NGINX="${SYNQDRIVE_DEPLOY_STATE_DIR}/nginx-test"
cat >"$TMP_NGINX" <<'EOF'
upstream synqdrive_backend {
    server 127.0.0.1:3001;
    server 127.0.0.1:3002;
}
EOF
export SYNQDRIVE_NGINX_SITE="$TMP_NGINX"

if ! vps_replica_nginx_dual_upstream_ok; then
  echo "FAIL: nginx dual upstream check" >&2
  exit 1
fi

STATE="${SYNQDRIVE_DEPLOY_STATE_DIR}/state.env"
mkdir -p /tmp/synqdrive-selftest-release
echo "test" > /tmp/synqdrive-selftest-release/marker 2>/dev/null || true

# capture_deploy_state requires pm2/git — only verify function exists and nginx check passed
if ! declare -F vps_replica_rolling_deploy >/dev/null; then
  echo "FAIL: vps_replica_rolling_deploy not defined" >&2
  exit 1
fi

if ! declare -F vps_replica_rollback >/dev/null; then
  echo "FAIL: vps_replica_rollback not defined" >&2
  exit 1
fi

bash "${SCRIPT_DIR}/vps-replica-post-deploy-verify.selftest.sh"

echo "vps-multi-replica-deploy selftest: OK"
