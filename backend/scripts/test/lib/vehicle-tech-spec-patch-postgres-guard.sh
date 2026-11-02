#!/usr/bin/env bash
# Fail-closed guards for vehicle technical spec PATCH PostgreSQL CI (disposable targets only).

vehicle_tech_spec_patch_assert_ci_local_database_url() {
  local url="${1:-${DATABASE_URL:-}}"
  if [[ -z "$url" ]]; then
    echo "vehicle-tech-spec-patch-postgres-guard: DATABASE_URL is required" >&2
    return 1
  fi
  case "$url" in
    *127.0.0.1*|*localhost*) ;;
    *)
      echo "vehicle-tech-spec-patch-postgres-guard: DATABASE_URL must target CI-local PostgreSQL (127.0.0.1 or localhost)" >&2
      return 1
      ;;
  esac
  local db_name
  db_name="$(node --input-type=module -e "
const u = new URL(process.argv[1]);
const name = u.pathname.replace(/^\\//, '').split('?')[0] ?? '';
process.stdout.write(name);
" "$url")"
  if [[ ! "$db_name" =~ ^synqdrive_(ci_ephemeral|tech_spec_patch_ci_) ]]; then
    echo "vehicle-tech-spec-patch-postgres-guard: refusing database name '${db_name}' (expected synqdrive_ci_ephemeral or synqdrive_tech_spec_patch_ci_*)" >&2
    return 1
  fi
  return 0
}

vehicle_tech_spec_patch_assert_pg_flag() {
  if [[ "${VEHICLE_TECH_SPEC_PATCH_PG:-}" != "1" ]]; then
    echo "vehicle-tech-spec-patch-postgres-guard: VEHICLE_TECH_SPEC_PATCH_PG must be 1" >&2
    return 1
  fi
  return 0
}
