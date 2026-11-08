#!/usr/bin/env bash
# Refresh SynqDrive Prometheus + Grafana + Alertmanager configs on the production VPS.
#
# - Copies prometheus.yml + alerts.yml + alerts-infra.yml from the current release tree
# - POST /-/reload when Prometheus is already running (--web.enable-lifecycle)
# - Copies Grafana provisioning + dashboards
# - Syncs Alertmanager template + re-renders config when alertmanager.env exists
# - Restarts Grafana / Alertmanager when containers exist
#
# Bootstrap (first install) when containers are missing:
#   MONITORING_AUTO_BOOTSTRAP=1 bash vps-refresh-monitoring.sh
#
# Run on VPS (typical after deploy):
#   bash /opt/synqdrive/current/backend/scripts/ops/vps-refresh-monitoring.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SYNQDRIVE_ROOT="${SYNQDRIVE_ROOT:-/opt/synqdrive/current}"
BACKEND_ENV="${BACKEND_ENV:-/opt/synqdrive/shared/backend.env}"
PROM_DIR="${PROM_DIR:-/opt/synqdrive/shared/prometheus}"
GRAFANA_DIR="${GRAFANA_DIR:-/opt/synqdrive/shared/grafana}"
AM_DIR="${AM_DIR:-/opt/synqdrive/shared/alertmanager}"
PROM_CONTAINER="${PROM_CONTAINER:-synqdrive-prometheus}"
GRAFANA_CONTAINER="${GRAFANA_CONTAINER:-synqdrive-grafana}"
AM_CONTAINER="${AM_CONTAINER:-synqdrive-alertmanager}"
BACKEND_PORT="${BACKEND_PORT:-3001}"
AUTO_BOOTSTRAP="${MONITORING_AUTO_BOOTSTRAP:-0}"

SRC_PROM="${SYNQDRIVE_ROOT}/backend/monitoring/prometheus"
SRC_GRAFANA="${SYNQDRIVE_ROOT}/backend/monitoring/grafana"
SRC_AM="${SYNQDRIVE_ROOT}/backend/monitoring/alertmanager"
SRC_BB="${SYNQDRIVE_ROOT}/backend/monitoring/blackbox"

docker_container_running() {
  local name="$1"
  docker ps --format '{{.Names}}' 2>/dev/null | grep -qx "$name"
}

# prom/prometheus runs promtool as a non-root user; mktemp -d (0700) bind-mounts deny read.
promtool_make_docker_mount_readable() {
  local rules_file="$1"
  local dir base
  dir="$(cd "$(dirname "$rules_file")" && pwd)"
  base="$(basename "$rules_file")"
  if [[ ! -f "${dir}/${base}" ]]; then
    return 1
  fi
  chmod a+rx "$dir"
  chmod a+r "${dir}/${base}"
}

promtool_check_rules_file() {
  local rules_file="$1"
  local dir base promtool_bin
  dir="$(cd "$(dirname "$rules_file")" && pwd)"
  base="$(basename "$rules_file")"
  promtool_bin="${PROMTOOL_BIN:-}"
  if [[ -z "$promtool_bin" ]] && command -v promtool >/dev/null 2>&1; then
    promtool_bin="$(command -v promtool)"
    if ! "$promtool_bin" --version >/dev/null 2>&1; then
      promtool_bin=""
    fi
  fi
  if [[ -n "$promtool_bin" ]]; then
    "$promtool_bin" check rules "$rules_file"
    return $?
  fi
  if command -v docker >/dev/null 2>&1; then
    promtool_make_docker_mount_readable "$rules_file" || return 1
    # prom/prometheus image ENTRYPOINT is the prometheus binary — promtool must be the entrypoint.
    docker run --rm --entrypoint promtool \
      -v "${dir}:/rules:ro" prom/prometheus:v2.54.1 \
      check rules "/rules/${base}"
    return $?
  fi
  echo "ERROR: promtool unavailable — cannot validate candidate Prometheus rules ($(basename "$rules_file"))" >&2
  return 1
}

validate_prometheus_bundle() {
  local tmp="" rc=0
  local required=(
    "$SRC_PROM/alerts.yml"
    "$SRC_PROM/alerts-infra.yml"
    "$SRC_PROM/alerts-di-s4.yml"
    "$SRC_PROM/prometheus.vps.yml"
  )
  local src

  for src in "${required[@]}"; do
    if [[ ! -f "$src" ]]; then
      echo "ERROR: Prometheus candidate source missing: $src" >&2
      return 1
    fi
  done

  tmp="$(mktemp -d)" || return 1

  if ! cp "$SRC_PROM/alerts.yml" "$tmp/alerts.yml"; then
    rm -rf "$tmp"
    return 1
  fi
  if ! cp "$SRC_PROM/alerts-infra.yml" "$tmp/alerts-infra.yml"; then
    rm -rf "$tmp"
    return 1
  fi
  if ! cp "$SRC_PROM/alerts-di-s4.yml" "$tmp/alerts-di-s4.yml"; then
    rm -rf "$tmp"
    return 1
  fi
  if ! cp "$SRC_PROM/prometheus.vps.yml" "$tmp/prometheus.yml"; then
    rm -rf "$tmp"
    return 1
  fi

  if ! promtool_check_rules_file "$tmp/alerts.yml"; then
    rc=1
  fi
  if ! promtool_check_rules_file "$tmp/alerts-infra.yml"; then
    rc=1
  fi
  if ! promtool_check_rules_file "$tmp/alerts-di-s4.yml"; then
    rc=1
  fi

  rm -rf "$tmp"
  return "$rc"
}

snapshot_prometheus_dir() {
  local snap="${PROM_DIR}.pre_refresh.$(date -u +%Y%m%dT%H%M%SZ)"
  mkdir -p "$snap"
  if [[ -d "$PROM_DIR" ]]; then
    cp -a "$PROM_DIR/." "$snap/" 2>/dev/null || true
  fi
  echo "$snap"
}

restore_prometheus_dir_snapshot() {
  local snap="$1"
  if [[ ! -d "$snap" ]]; then
    echo "ERROR: missing Prometheus rollback snapshot $snap" >&2
    return 1
  fi
  mkdir -p "$PROM_DIR"
  cp -a "$snap/." "$PROM_DIR/"
}

install_prometheus_rules_atomic() {
  local dest="$1"
  local src="$2"
  local backup="${dest}.bak.$(date -u +%Y%m%dT%H%M%SZ)"
  if [[ -f "$dest" ]]; then
    cp -a "$dest" "$backup"
  fi
  cp "$src" "$dest"
}

refresh_prometheus() {
  if [[ ! -f "$SRC_PROM/prometheus.vps.yml" ]]; then
    echo "WARN: $SRC_PROM/prometheus.vps.yml missing — skip Prometheus refresh" >&2
    return 0
  fi

  if [[ ! -f "$BACKEND_ENV" ]]; then
    echo "WARN: $BACKEND_ENV missing — skip Prometheus refresh" >&2
    return 0
  fi

  local token
  token="$(grep '^METRICS_BEARER_TOKEN=' "$BACKEND_ENV" | cut -d= -f2- | tr -d '"' | tr -d "'" || true)"
  if [[ -z "$token" ]]; then
    echo "WARN: METRICS_BEARER_TOKEN missing — skip Prometheus refresh" >&2
    return 0
  fi

  if ! validate_prometheus_bundle; then
    echo "ERROR: Prometheus candidate validation failed — leaving $PROM_DIR unchanged" >&2
    return 1
  fi

  mkdir -p "$PROM_DIR/secrets"
  printf '%s' "$token" > "$PROM_DIR/secrets/metrics_bearer_token"
  # NOTE: world-readable (644) so host-side tooling can read the file; verify this matches
  # synqdrive-prometheus container UID/GID and scrape-auth expectations before tightening.
  chmod 644 "$PROM_DIR/secrets/metrics_bearer_token"

  local pre_snapshot
  pre_snapshot="$(snapshot_prometheus_dir)"

  install_prometheus_rules_atomic "$PROM_DIR/alerts.yml" "$SRC_PROM/alerts.yml"
  install_prometheus_rules_atomic "$PROM_DIR/alerts-infra.yml" "$SRC_PROM/alerts-infra.yml"
  install_prometheus_rules_atomic "$PROM_DIR/alerts-di-s4.yml" "$SRC_PROM/alerts-di-s4.yml"
  cp "$SRC_PROM/prometheus.vps.yml" "$PROM_DIR/prometheus.yml"
  if [[ "$BACKEND_PORT" != "3001" ]]; then
    sed -i "s/127.0.0.1:3001/127.0.0.1:${BACKEND_PORT}/" "$PROM_DIR/prometheus.yml"
  fi

  if docker_container_running "$PROM_CONTAINER"; then
    echo "==> Prometheus: config synced, reloading $PROM_CONTAINER"
    if curl -sf -X POST "http://127.0.0.1:9090/-/reload" >/dev/null; then
      echo "Prometheus reload: OK"
      return 0
    fi
    echo "ERROR: Prometheus reload failed — rolling back to pre-refresh snapshot" >&2
    restore_prometheus_dir_snapshot "$pre_snapshot" || return 1
    if curl -sf -X POST "http://127.0.0.1:9090/-/reload" >/dev/null; then
      echo "Prometheus rollback reload: OK"
    else
      echo "ERROR: Prometheus rollback reload failed — manual intervention required" >&2
    fi
    return 1
  fi

  if [[ "$AUTO_BOOTSTRAP" == "1" ]]; then
    echo "==> Prometheus: container missing — bootstrap via vps-setup-prometheus.sh"
    bash "$SCRIPT_DIR/vps-setup-prometheus.sh"
    return 0
  fi

  echo "Prometheus: config synced to $PROM_DIR (container not running; set MONITORING_AUTO_BOOTSTRAP=1 to install)"
}

refresh_alertmanager() {
  local am_config_changed=0
  if [[ ! -f "$SRC_AM/alertmanager.yml.example" ]]; then
    echo "WARN: Alertmanager template missing — skip" >&2
    return 0
  fi

  mkdir -p "$AM_DIR/templates" "$AM_DIR/data"
  cp "$SRC_AM/templates/"*.tmpl "$AM_DIR/templates/" 2>/dev/null || true

  if [[ -f "$AM_DIR/alertmanager.env" ]]; then
    set -a
    # shellcheck disable=SC1091
    source "$AM_DIR/alertmanager.env"
    set +a
    export ALERTMANAGER_SLACK_WEBHOOK_URL="${ALERTMANAGER_SLACK_WEBHOOK_URL:-}"
    export ALERTMANAGER_SLACK_CHANNEL_WARNING="${ALERTMANAGER_SLACK_CHANNEL_WARNING:-#synqdrive-alerts}"
    export ALERTMANAGER_SLACK_CHANNEL_CRITICAL="${ALERTMANAGER_SLACK_CHANNEL_CRITICAL:-#synqdrive-critical}"
    export ALERTMANAGER_SMTP_HOST="${ALERTMANAGER_SMTP_HOST:-smtp.resend.com}"
    export ALERTMANAGER_SMTP_PORT="${ALERTMANAGER_SMTP_PORT:-587}"
    export ALERTMANAGER_SMTP_FROM="${ALERTMANAGER_SMTP_FROM:-alerts@synqdrive.eu}"
    export ALERTMANAGER_SMTP_USER="${ALERTMANAGER_SMTP_USER:-resend}"
    export ALERTMANAGER_SMTP_PASSWORD="${ALERTMANAGER_SMTP_PASSWORD:-}"
    export ALERTMANAGER_EMAIL_WARNING="${ALERTMANAGER_EMAIL_WARNING:-}"
    export ALERTMANAGER_EMAIL_CRITICAL="${ALERTMANAGER_EMAIL_CRITICAL:-}"
    export ALERTMANAGER_EMAIL_ESCALATION="${ALERTMANAGER_EMAIL_ESCALATION:-}"

    if [[ -n "${ALERTMANAGER_SLACK_WEBHOOK_URL}" ]]; then
      cp "$SRC_AM/alertmanager.yml.example" "$AM_DIR/alertmanager.yml.template"
    else
      cp "$SRC_AM/alertmanager.email.yml.example" "$AM_DIR/alertmanager.yml.template"
    fi

    local rendered="$AM_DIR/alertmanager.yml"
    envsubst < "$AM_DIR/alertmanager.yml.template" > "${rendered}.new"
    chmod 600 "${rendered}.new"
    chown 65534:65534 "${rendered}.new" 2>/dev/null || chmod 640 "${rendered}.new"
    if [[ -f "$rendered" ]] && cmp -s "${rendered}.new" "$rendered"; then
      rm -f "${rendered}.new"
    else
      mv "${rendered}.new" "$rendered"
      am_config_changed=1
    fi
  else
    cp "$SRC_AM/alertmanager.yml.example" "$AM_DIR/alertmanager.yml.template"
  fi

  if docker_container_running "$AM_CONTAINER"; then
    if [[ "$am_config_changed" != "1" ]]; then
      echo "==> Alertmanager: config unchanged — skip restart"
      return 0
    fi
    echo "==> Alertmanager: config changed, restarting $AM_CONTAINER"
    docker restart "$AM_CONTAINER" >/dev/null
    sleep 3
    if curl -sf "http://127.0.0.1:9093/-/healthy" >/dev/null; then
      echo "Alertmanager health: OK"
    else
      echo "WARN: Alertmanager health check failed after restart" >&2
    fi
    return 0
  fi

  if [[ "$AUTO_BOOTSTRAP" == "1" && -f "$AM_DIR/alertmanager.env" ]]; then
    echo "==> Alertmanager: container missing — bootstrap via vps-setup-alertmanager.sh"
    bash "$SCRIPT_DIR/vps-setup-alertmanager.sh"
    return 0
  fi

  echo "Alertmanager: templates synced to $AM_DIR (container not running or alertmanager.env missing)"
}

refresh_exporters() {
  if [[ "$AUTO_BOOTSTRAP" != "1" ]]; then
    return 0
  fi
  if [[ -f "$SCRIPT_DIR/vps-setup-node-exporter.sh" ]]; then
    bash "$SCRIPT_DIR/vps-setup-node-exporter.sh" || true
  fi
  if [[ -f "$SCRIPT_DIR/vps-setup-blackbox-exporter.sh" && -f "$SRC_BB/blackbox.yml" ]]; then
    bash "$SCRIPT_DIR/vps-setup-blackbox-exporter.sh" || true
  fi
}

copy_grafana_dashboards() {
  cp "$SRC_GRAFANA/dashboards/synqdrive-ops.json" "$GRAFANA_DIR/dashboards/"
  cp "$SRC_GRAFANA/dashboards/synqdrive-battery-v2.json" "$GRAFANA_DIR/dashboards/"
  cp "$SRC_GRAFANA/dashboards/synqdrive-driving-intelligence-v2.json" "$GRAFANA_DIR/dashboards/"
  cp "$SRC_GRAFANA/dashboards/synqdrive-document-intake-v2.json" "$GRAFANA_DIR/dashboards/"
  cp "$SRC_GRAFANA/dashboards/synqdrive-fleet-health-service.json" "$GRAFANA_DIR/dashboards/"
  cp "$SRC_GRAFANA/dashboards/synqdrive-evaluations.json" "$GRAFANA_DIR/dashboards/"
  cp "$SRC_GRAFANA/dashboards/notification-engine-ops.json" "$GRAFANA_DIR/dashboards/"
}

refresh_grafana() {
  if [[ ! -d "$SRC_GRAFANA/provisioning" ]]; then
    echo "WARN: $SRC_GRAFANA/provisioning missing — skip Grafana refresh" >&2
    return 0
  fi

  mkdir -p "$GRAFANA_DIR/provisioning/datasources" "$GRAFANA_DIR/provisioning/dashboards" "$GRAFANA_DIR/dashboards"
  cp -r "$SRC_GRAFANA/provisioning/"* "$GRAFANA_DIR/provisioning/"
  copy_grafana_dashboards

  if docker_container_running "$GRAFANA_CONTAINER"; then
    echo "==> Grafana: provisioning synced, restarting $GRAFANA_CONTAINER"
    docker restart "$GRAFANA_CONTAINER" >/dev/null
    sleep 5
    if curl -sf "http://127.0.0.1:3000/api/health" >/dev/null; then
      echo "Grafana health: OK"
    else
      echo "WARN: Grafana health check failed after restart" >&2
      return 1
    fi
    return 0
  fi

  if [[ "$AUTO_BOOTSTRAP" == "1" ]]; then
    echo "==> Grafana: container missing — bootstrap via vps-setup-grafana.sh"
    bash "$SCRIPT_DIR/vps-setup-grafana.sh"
    return 0
  fi

  echo "Grafana: configs synced to $GRAFANA_DIR (container not running; set MONITORING_AUTO_BOOTSTRAP=1 to install)"
}

vps_refresh_monitoring_main() {
  echo "==> SynqDrive monitoring refresh (release: $SYNQDRIVE_ROOT)"
  refresh_prometheus
  refresh_alertmanager
  refresh_exporters
  refresh_grafana
  echo "==> Monitoring refresh complete"
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  vps_refresh_monitoring_main "$@"
fi
