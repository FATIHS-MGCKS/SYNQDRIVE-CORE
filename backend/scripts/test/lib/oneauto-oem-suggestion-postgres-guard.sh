#!/usr/bin/env bash
# Guard: ONEAUTO OEM suggestion snapshot PostgreSQL integration must only run with explicit flag + disposable DB.
vehicle_oem_suggestion_assert_pg_flag() {
  if [[ "${ONEAUTO_OEM_SUGGESTIONS_PG:-}" != "1" ]]; then
    echo "oneauto-oem-suggestion-postgres-guard: ONEAUTO_OEM_SUGGESTIONS_PG must be 1" >&2
    exit 1
  fi
}

vehicle_oem_suggestion_assert_ci_local_database_url() {
  local url="${DATABASE_URL:-}"
  if [[ -z "$url" ]]; then
    echo "oneauto-oem-suggestion-postgres-guard: DATABASE_URL required" >&2
    exit 1
  fi
  local db_name
  db_name="$(python3 - <<'PY'
import os, urllib.parse
u = urllib.parse.urlparse(os.environ.get("DATABASE_URL", ""))
print((u.path or "").lstrip("/").split("?")[0])
PY
)"
  if [[ ! "$db_name" =~ synqdrive|test|ci|oem|oneauto ]]; then
    echo "oneauto-oem-suggestion-postgres-guard: refusing non-disposable database: ${db_name}" >&2
    exit 1
  fi
}
