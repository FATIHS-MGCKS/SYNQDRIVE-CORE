import type { Registry } from 'prom-client';
import { Counter, Gauge, Histogram } from 'prom-client';

export interface TripDiBoundaryAdmissionRecoveryMetricsHandles {
  passTotal: Counter<string>;
  candidatesScannedTotal: Counter<string>;
  admissionAttemptsTotal: Counter<string>;
  admissionsSucceededTotal: Counter<string>;
  guardRejectedTotal: Counter<string>;
  transientErrorsTotal: Counter<string>;
  revisionMismatchObservedTotal: Counter<string>;
  oldestUnadmittedEligibleAgeSeconds: Gauge<string>;
  scanCapTruncatedTotal: Counter<string>;
  passDurationMs: Histogram<string>;
}

const handlesByRegistry = new WeakMap<Registry, TripDiBoundaryAdmissionRecoveryMetricsHandles>();

export function registerTripDiBoundaryAdmissionRecoveryMetrics(
  registry: Registry,
): TripDiBoundaryAdmissionRecoveryMetricsHandles {
  const passTotal = new Counter({
    name: 'synqdrive_trip_di_boundary_admission_recovery_pass_total',
    help: 'Durable DI boundary admission recovery passes',
    labelNames: ['mode'],
    registers: [registry],
  });

  const candidatesScannedTotal = new Counter({
    name: 'synqdrive_trip_di_boundary_admission_recovery_candidates_scanned_total',
    help: 'Recovery candidate trips examined',
    registers: [registry],
  });

  const admissionAttemptsTotal = new Counter({
    name: 'synqdrive_trip_di_boundary_admission_recovery_attempt_total',
    help: 'Recovery admission release attempts',
    labelNames: ['mode'],
    registers: [registry],
  });

  const admissionsSucceededTotal = new Counter({
    name: 'synqdrive_trip_di_boundary_admission_recovery_success_total',
    help: 'Recovery admission releases that committed',
    labelNames: ['mode'],
    registers: [registry],
  });

  const guardRejectedTotal = new Counter({
    name: 'synqdrive_trip_di_boundary_admission_recovery_guard_rejected_total',
    help: 'Recovery candidates blocked by admission guards',
    labelNames: ['code'],
    registers: [registry],
  });

  const transientErrorsTotal = new Counter({
    name: 'synqdrive_trip_di_boundary_admission_recovery_transient_error_total',
    help: 'Recovery pass transient errors',
    registers: [registry],
  });

  const revisionMismatchObservedTotal = new Counter({
    name: 'synqdrive_trip_di_boundary_admission_recovery_revision_mismatch_total',
    help: 'Recovery candidates needing release due to stale admission revision',
    registers: [registry],
  });

  const oldestUnadmittedEligibleAgeSeconds = new Gauge({
    name: 'synqdrive_trip_di_boundary_admission_recovery_oldest_unadmitted_eligible_age_seconds',
    help: 'Age in seconds of oldest unadmitted trip in this capped per-vehicle batch (coverage=batch; not full fleet cohort)',
    labelNames: ['outcome', 'vehicle_id', 'coverage'],
    registers: [registry],
  });

  const scanCapTruncatedTotal = new Counter({
    name: 'synqdrive_trip_di_boundary_admission_recovery_scan_cap_truncated_total',
    help: 'Recovery scans that hit per-vehicle or fleet caps before exhausting eligible window',
    registers: [registry],
  });

  const passDurationMs = new Histogram({
    name: 'synqdrive_trip_di_boundary_admission_recovery_pass_duration_ms',
    help: 'Recovery pass wall duration',
    labelNames: ['mode'],
    buckets: [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 15_000],
    registers: [registry],
  });

  return {
    passTotal,
    candidatesScannedTotal,
    admissionAttemptsTotal,
    admissionsSucceededTotal,
    guardRejectedTotal,
    transientErrorsTotal,
    revisionMismatchObservedTotal,
    oldestUnadmittedEligibleAgeSeconds,
    scanCapTruncatedTotal,
    passDurationMs,
  };
}

export function getTripDiBoundaryAdmissionRecoveryMetrics(
  registry: Registry,
): TripDiBoundaryAdmissionRecoveryMetricsHandles {
  let cached = handlesByRegistry.get(registry);
  if (cached == null) {
    cached = registerTripDiBoundaryAdmissionRecoveryMetrics(registry);
    handlesByRegistry.set(registry, cached);
  }
  return cached;
}