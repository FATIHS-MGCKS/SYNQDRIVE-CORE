#!/usr/bin/env bash
# P6B trusted launcher — scrubs process environment before Node/tsx starts.
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
  esac
done < <(env -0)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
GIT_BIN="/usr/bin/git"
if [[ ! -x "$GIT_BIN" ]]; then
  GIT_BIN="/bin/git"
fi
if [[ ! -x "$GIT_BIN" ]]; then
  echo "FSD3_TRUSTED_GIT_MISSING" >&2
  exit 43
fi

if [[ -n "${PATH:-}" ]] && [[ "$PATH" != "/usr/bin:/bin" ]]; then
  if command -v git >/dev/null 2>&1; then
    GIT_WHICH="$(command -v git)"
    if [[ "$GIT_WHICH" != "$GIT_BIN" ]] && [[ "$GIT_WHICH" != "/bin/git" ]]; then
      REJECT_ENV "PATH_git_shim"
    fi
  fi
fi

export PATH="/usr/bin:/bin"
export FSD3_ONE_SHOT_TRUSTED_LAUNCHER=1
unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE GIT_OBJECT_DIRECTORY GIT_ALTERNATE_OBJECT_DIRECTORIES
unset GIT_CONFIG GIT_CONFIG_GLOBAL GIT_CONFIG_SYSTEM
unset NODE_OPTIONS NODE_PATH

cd "$REPO_ROOT"

export SYNQDRIVE_REPO_ROOT="$REPO_ROOT"

if [[ -x "$REPO_ROOT/backend/node_modules/.bin/tsx" ]]; then
  exec "$REPO_ROOT/backend/node_modules/.bin/tsx" "$SCRIPT_DIR/fsd3-live-discovery-one-shot.ts" "$@"
fi

exec npx --yes tsx "$SCRIPT_DIR/fsd3-live-discovery-one-shot.ts" "$@"
