#!/usr/bin/env bash
# Fail-closed guard for FSD-2 disposable PostgreSQL certification.
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  echo "This file must be sourced, not executed." >&2
  exit 1
fi

fsd2_persistence_guard_abort() {
  printf '[fsd2-persistence-postgres-guard] ABORT: %s\n' "$*" >&2
  exit 1
}

fsd2_persistence_assert_safe_database_name() {
  local db_name=$1
  if [[ -z "${db_name}" ]]; then
    fsd2_persistence_guard_abort "database name is required"
  fi
  if [[ ! "${db_name}" =~ ^fsd2_test_[a-zA-Z0-9_]+$ ]]; then
    fsd2_persistence_guard_abort "database name must match fsd2_test_* (got ${db_name})"
  fi
}

fsd2_persistence_assert_safe_host() {
  local host=$1
  local host_lower="${host,,}"
  case "${host_lower}" in
    *synqdrive* | *hstgr* | *srv1374778* | *production* | app.synqdrive.eu)
      fsd2_persistence_guard_abort "refusing production-like database host (${host})"
      ;;
  esac
  if [[ "${host_lower}" != "127.0.0.1" && "${host_lower}" != "localhost" && "${host_lower}" != "postgres" ]]; then
    fsd2_persistence_guard_abort "refusing non-local database host (${host})"
  fi
}

fsd2_persistence_assert_disposable_target() {
  local host=$1
  local db_name=$2
  local database_url=$3
  fsd2_persistence_assert_safe_host "${host}"
  fsd2_persistence_assert_safe_database_name "${db_name}"
  if [[ "${database_url}" == *"app.synqdrive"* || "${database_url}" == *"srv1374778"* ]]; then
    fsd2_persistence_guard_abort "DATABASE_URL appears production-like"
  fi
}

fsd2_persistence_assert_pg_flag() {
  if [[ "${FSD_DISCOVERY_PERSISTENCE_PG:-}" != "1" ]]; then
    fsd2_persistence_guard_abort "FSD_DISCOVERY_PERSISTENCE_PG must be 1"
  fi
}
