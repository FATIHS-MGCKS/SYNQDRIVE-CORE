#!/usr/bin/env bash
# P6B trusted launcher — pre-Node attestation, then pinned local tsx bootstrap only.
set -euo pipefail

REJECT_ENV() {
  echo "FSD3_TRUSTED_LAUNCHER_ENV_REJECTED: $1" >&2
  exit 42
}

for key in NODE_OPTIONS NODE_PATH TS_NODE_PROJECT TS_NODE_TRANSPILE_ONLY; do
  if [[ -n "${!key-}" ]]; then
    REJECT_ENV "$key"
  fi
done

while IFS= read -r -d '' key; do
  case "$key" in
    GIT_* ) REJECT_ENV "$key" ;;
    TS_NODE_* ) REJECT_ENV "$key" ;;
    FSD3_ONE_SHOT_EXECUTABLE_ATTESTATION_RELAXED ) REJECT_ENV "$key" ;;
    FSD3_ONE_SHOT_SKIP_TRUSTED_LAUNCHER ) REJECT_ENV "$key" ;;
  esac
done < <(env -0)

SCRIPT_PATH="$(readlink -f "${BASH_SOURCE[0]}")"
SCRIPT_DIR="$(cd "$(dirname "$SCRIPT_PATH")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
GIT_BIN="/usr/bin/git"
NODE_BIN="/usr/bin/node"
if [[ ! -x "$GIT_BIN" ]]; then
  GIT_BIN="/bin/git"
fi
if [[ ! -x "$NODE_BIN" ]]; then
  NODE_BIN="$(command -v node 2>/dev/null || true)"
fi
if [[ ! -x "$GIT_BIN" ]]; then
  echo "FSD3_TRUSTED_GIT_MISSING" >&2
  exit 43
fi
if [[ -z "$NODE_BIN" ]] || [[ ! -x "$NODE_BIN" ]]; then
  echo "FSD3_NODE_MISSING" >&2
  exit 44
fi

export FSD3_LAUNCHER_SCRIPT_PATH="$SCRIPT_PATH"
export PATH="/usr/bin:/bin"
unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE GIT_OBJECT_DIRECTORY GIT_ALTERNATE_OBJECT_DIRECTORIES
unset GIT_CONFIG GIT_CONFIG_GLOBAL GIT_CONFIG_SYSTEM
unset NODE_OPTIONS NODE_PATH
unset FSD3_ONE_SHOT_EXECUTABLE_ATTESTATION_RELAXED
unset FSD3_ONE_SHOT_SKIP_TRUSTED_LAUNCHER

cd "$REPO_ROOT"
export SYNQDRIVE_REPO_ROOT="$REPO_ROOT"

PRE_ATTEST="$REPO_ROOT/backend/scripts/ops/fsd3-one-shot-pre-node-attest.mjs"
TSX_BIN="$REPO_ROOT/backend/node_modules/.bin/tsx"
BOOTSTRAP="$REPO_ROOT/backend/scripts/ops/fsd3-live-discovery-one-shot.bootstrap.ts"

if [[ ! -f "$PRE_ATTEST" ]]; then
  echo "FSD3_PRE_NODE_ATTEST_MISSING" >&2
  exit 45
fi
if [[ ! -x "$TSX_BIN" ]]; then
  echo "FSD3_TSX_NOT_INSTALLED: run npm ci in backend/" >&2
  exit 46
fi
if [[ ! -f "$BOOTSTRAP" ]]; then
  echo "FSD3_BOOTSTRAP_MISSING" >&2
  exit 47
fi

ATTEST_LINE="$("$NODE_BIN" "$PRE_ATTEST" "$REPO_ROOT" 2>&1 | tail -n 1)"
case "$ATTEST_LINE" in
  FSD3_PRE_NODE_ATTEST_SHA=*)
    export FSD3_PRE_NODE_ATTEST_SHA="${ATTEST_LINE#FSD3_PRE_NODE_ATTEST_SHA=}"
    ;;
  *)
    echo "$ATTEST_LINE" >&2
    exit 48
    ;;
esac

export FSD3_ONE_SHOT_TRUSTED_LAUNCHER=1
exec "$TSX_BIN" "$BOOTSTRAP" "$@"
