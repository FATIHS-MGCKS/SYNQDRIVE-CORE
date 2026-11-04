#!/usr/bin/env bash
# P4B16 — attestation-only reconcile when production runtime matches a deploy SHA but
# release-attestation.state + SYNQDRIVE_DEPLOYED_GIT_SHA mirror remain on the prior release.
#
# Does NOT redeploy, restart PM2, reload nginx, run migrations, or change One Auto provider flags.
set -euo pipefail

if [[ "${SYNQDRIVE_P4B16_RECONCILE_AUTHORIZED:-}" != "1" ]]; then
  echo "!! ABORT: SYNQDRIVE_P4B16_RECONCILE_AUTHORIZED=1 required for attestation reconcile" >&2
  exit 41
fi

EXPECTED_SHA=""
EXPECTED_STALE_SHA=""

usage() {
  cat <<EOF >&2
Usage: $(basename "$0") --expected-sha <40-char-hex> [--expected-stale-sha <40-char-hex>]

Attestation-only recovery for stale COMMITTED state + stale backend.env mirror.
Requires original deploy CI gate PASS for --expected-sha (unless VPS_P4B16_RECONCILE_SKIP_CI_GATE=1).
EOF
  exit 1
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --expected-sha)
      EXPECTED_SHA="${2:-}"
      shift 2
      ;;
    --expected-stale-sha)
      EXPECTED_STALE_SHA="${2:-}"
      shift 2
      ;;
    -h | --help)
      usage
      ;;
    *)
      echo "!! ABORT: unknown argument: $1" >&2
      usage
      ;;
  esac
done

if [[ -z "$EXPECTED_SHA" ]]; then
  echo "!! ABORT: --expected-sha is required" >&2
  exit 1
fi

SYNQDRIVE_CURRENT_LINK="${SYNQDRIVE_CURRENT_LINK:-/opt/synqdrive/current}"
SYNQDRIVE_DEPLOY_STATE_DIR="${SYNQDRIVE_DEPLOY_STATE_DIR:-/opt/synqdrive/shared/deploy-state}"
SYNQDRIVE_BACKEND_ENV="${SYNQDRIVE_BACKEND_ENV:-/opt/synqdrive/shared/backend.env}"
VPS_ATTESTATION_STATE_DIR="${VPS_ATTESTATION_STATE_DIR:-${SYNQDRIVE_DEPLOY_STATE_DIR}}"

if [[ ! -L "$SYNQDRIVE_CURRENT_LINK" && ! -d "$SYNQDRIVE_CURRENT_LINK" ]]; then
  echo "!! ABORT: current release link missing: ${SYNQDRIVE_CURRENT_LINK}" >&2
  exit 1
fi

RELEASE_DIR="$(readlink -f "$SYNQDRIVE_CURRENT_LINK" || true)"
if [[ -z "$RELEASE_DIR" || ! -d "$RELEASE_DIR" ]]; then
  echo "!! ABORT: cannot resolve current release dir" >&2
  exit 1
fi

RELEASE_OPS_DIR="${RELEASE_DIR}/backend/scripts/ops"
ATTEST_LIB="${RELEASE_OPS_DIR}/lib/vps-release-attestation.lib.sh"
REPLICA_LIB="${RELEASE_OPS_DIR}/lib/vps-production-replica.lib.sh"

if [[ ! -f "$ATTEST_LIB" ]]; then
  echo "!! ABORT: attestation library missing in release ops tree" >&2
  exit 1
fi
if [[ ! -f "$REPLICA_LIB" ]]; then
  echo "!! ABORT: replica library missing in release ops tree" >&2
  exit 1
fi

# shellcheck source=lib/vps-production-replica.lib.sh
source "$REPLICA_LIB"
# shellcheck source=lib/vps-release-attestation.lib.sh
source "$ATTEST_LIB"

export VPS_ATTESTATION_BACKEND_ENV="$SYNQDRIVE_BACKEND_ENV"
export VPS_ATTESTATION_STATE_DIR

if ! vps_attest_validate_sha "$EXPECTED_SHA" 2>/dev/null; then
  echo "!! ABORT: invalid --expected-sha" >&2
  exit 1
fi
EXPECTED_SHA="$(vps_attest_normalize_sha "$EXPECTED_SHA")"

if [[ -n "$EXPECTED_STALE_SHA" ]]; then
  if ! vps_attest_validate_sha "$EXPECTED_STALE_SHA" 2>/dev/null; then
    echo "!! ABORT: invalid --expected-stale-sha" >&2
    exit 1
  fi
  EXPECTED_STALE_SHA="$(vps_attest_normalize_sha "$EXPECTED_STALE_SHA")"
fi

REL_SHA="$(vps_replica_release_sha "$RELEASE_DIR")"
if [[ "$(vps_attest_normalize_sha "$REL_SHA")" != "$EXPECTED_SHA" ]]; then
  echo "!! ABORT: current release SHA ${REL_SHA:0:12} != expected ${EXPECTED_SHA:0:12}" >&2
  exit 1
fi

REPO_ROOT="$(cd "${RELEASE_DIR}/.." && pwd)"
if [[ -d "${RELEASE_DIR}/.git" ]]; then
  REPO_ROOT="$RELEASE_DIR"
elif [[ -f "${RELEASE_DIR}/backend/package.json" ]]; then
  REPO_ROOT="$RELEASE_DIR"
fi

if [[ "${VPS_P4B16_RECONCILE_SKIP_CI_GATE:-}" != "1" ]]; then
  GATE_SCRIPT="${RELEASE_OPS_DIR}/deploy-ci-gate.mjs"
  if [[ ! -f "$GATE_SCRIPT" ]]; then
    echo "!! ABORT: deploy-ci-gate.mjs missing in release ops tree" >&2
    exit 1
  fi
  echo "==> CI gate (original deploy evidence) for ${EXPECTED_SHA:0:12}"
  if ! node "$GATE_SCRIPT" "$EXPECTED_SHA"; then
    echo "!! ABORT: CI gate not PASS for expected SHA" >&2
    exit 1
  fi
else
  echo "WARN: VPS_P4B16_RECONCILE_SKIP_CI_GATE=1 — CI gate skipped (non-production only)" >&2
fi

echo "==> P4B16 stale COMMITTED reconcile target=${EXPECTED_SHA:0:12}"
echo "    Attestation state dir: ${VPS_ATTESTATION_STATE_DIR}"
echo "    Backend env mirror: ${VPS_ATTESTATION_BACKEND_ENV}"
echo "    One Auto activation policy unchanged (mirror updates ${VPS_ATTESTATION_MIRROR_KEY:-SYNQDRIVE_DEPLOYED_GIT_SHA} only)"

if ! vps_attest_lock_acquire; then
  echo "!! ABORT: attestation lock busy" >&2
  exit 1
fi

RC=0
set +e
if [[ -n "$EXPECTED_STALE_SHA" ]]; then
  vps_attest_reconcile_stale_committed_deploy "$RELEASE_DIR" "$EXPECTED_SHA" "$EXPECTED_STALE_SHA"
else
  vps_attest_reconcile_stale_committed_deploy "$RELEASE_DIR" "$EXPECTED_SHA"
fi
RC=$?
set -e
vps_attest_lock_release

if [[ "$RC" -ne 0 ]]; then
  echo "!! ABORT: attestation reconcile failed (exit ${RC})" >&2
  exit "$RC"
fi

echo "==> P4B16 attestation reconcile complete DEPLOYED_SHA=${EXPECTED_SHA:0:12}"
vps_attest_state_verify_checksum && echo "    checksum=VALID"
exit 0
