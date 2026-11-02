#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
AUDIT_SCRIPT="$ROOT/scripts/audits/audit-dependencies.sh"

git -C "$ROOT" fetch origin main --depth=5000 >/dev/null 2>&1 || git -C "$ROOT" fetch origin main >/dev/null 2>&1 || true

HEAD_SHA="$(git -C "$ROOT" rev-parse HEAD)"
MAIN_SHA="$(git -C "$ROOT" rev-parse --verify origin/main^{commit})"
MERGE_BASE_SHA="$(git -C "$ROOT" merge-base "$MAIN_SHA" "$HEAD_SHA")"
KNOWN_BEFORE_SHA="$(git -C "$ROOT" rev-parse --verify bd732a8f7a6467565a8668ea136e81b79a04666a^{commit} 2>/dev/null || true)"

run_resolution() {
  local expect_exit="$1"
  local expect_substr="${2:-}"
  shift 2
  set +e
  local out
  out="$(
    env "$@" bash -c '
      source "$1"
      resolve_audit_baseline_sha
    ' _ "$AUDIT_SCRIPT" 2>&1
  )"
  local code=$?
  set -e
  if [[ "$code" -ne "$expect_exit" ]]; then
    echo "FAIL expected exit ${expect_exit}, got ${code}: $out"
    exit 1
  fi
  if [[ -n "$expect_substr" && "$out" != *"$expect_substr"* ]]; then
    echo "FAIL expected output to contain '${expect_substr}': $out"
    exit 1
  fi
  echo "PASS exit=${expect_exit} env=$*"
}

if [[ -z "$KNOWN_BEFORE_SHA" ]]; then
  echo "SKIP known before SHA bd732a8... (not in shallow clone)"
else
  # Normal push with valid github.event.before
  run_resolution 0 "${KNOWN_BEFORE_SHA:0:7}" \
    GITHUB_EVENT_NAME=push \
    PUSH_BEFORE_SHA="$KNOWN_BEFORE_SHA" \
    PR_HEAD_SHA="$HEAD_SHA"
fi

# New branch / first push: all-zero before resolves merge-base with origin/main
run_resolution 0 "${MERGE_BASE_SHA:0:7}" \
  GITHUB_EVENT_NAME=push \
  PUSH_BEFORE_SHA=0000000000000000000000000000000000000000 \
  PR_HEAD_SHA="$HEAD_SHA" \
  AUDIT_PROTECTED_BASELINE_REF=origin/main

# pull_request uses PR base SHA (same semantics as merge-base target branch tip ancestor chain)
run_resolution 0 "${MAIN_SHA:0:7}" \
  GITHUB_EVENT_NAME=pull_request \
  PR_BASE_SHA="$MAIN_SHA" \
  PR_HEAD_SHA="$HEAD_SHA"

# push with empty before => protected merge-base fallback (same as zero sentinel)
run_resolution 0 "${MERGE_BASE_SHA:0:7}" \
  GITHUB_EVENT_NAME=push \
  PUSH_BEFORE_SHA= \
  PR_HEAD_SHA="$HEAD_SHA"

# pull_request with empty base => fail closed
run_resolution 2 "FAIL_CLOSED" \
  GITHUB_EVENT_NAME=pull_request \
  PR_BASE_SHA=

# malformed push before => fail closed
run_resolution 2 "FAIL_CLOSED" \
  GITHUB_EVENT_NAME=push \
  PUSH_BEFORE_SHA=not-a-valid-sha \
  PR_HEAD_SHA="$HEAD_SHA"

# untrusted protected ref => fail closed
run_resolution 2 "untrusted protected baseline ref" \
  GITHUB_EVENT_NAME=push \
  PUSH_BEFORE_SHA=0000000000000000000000000000000000000000 \
  PR_HEAD_SHA="$HEAD_SHA" \
  AUDIT_PROTECTED_BASELINE_REF=origin/not-approved

# missing head for zero-before push => fail closed
run_resolution 2 "requires audit head SHA" \
  GITHUB_EVENT_NAME=push \
  PUSH_BEFORE_SHA=0000000000000000000000000000000000000000 \
  PR_HEAD_SHA=

# unsupported event with no override => fail closed
run_resolution 2 "FAIL_CLOSED" \
  GITHUB_EVENT_NAME=workflow_dispatch

# legacy direct PR_BASE_SHA override when event unset (local harness / workflow_dispatch wiring)
run_resolution 0 "${MAIN_SHA:0:7}" \
  PR_BASE_SHA="$MAIN_SHA"

echo "BASELINE_RESOLUTION_TESTS=PASS"
echo "INVALID_BASELINE_ACCEPTED=0"
echo "ZERO_BEFORE_MERGE_BASE_SHA=${MERGE_BASE_SHA}"
