import { TripMetricsService } from '@modules/observability/trip-metrics.service';
import {
  getTripDiBoundaryAdmissionRecoveryMetrics,
  registerTripDiBoundaryAdmissionRecoveryMetrics,
} from '../trip-di-boundary-admission-recovery.metrics';
import { Registry } from 'prom-client';

const RECOVERY_METRIC_NAMES = [
  'synqdrive_trip_di_boundary_admission_recovery_pass_total',
  'synqdrive_trip_di_boundary_admission_recovery_candidates_scanned_total',
  'synqdrive_trip_di_boundary_admission_recovery_attempt_total',
  'synqdrive_trip_di_boundary_admission_recovery_success_total',
  'synqdrive_trip_di_boundary_admission_recovery_guard_rejected_total',
  'synqdrive_trip_di_boundary_admission_recovery_transient_error_total',
  'synqdrive_trip_di_boundary_admission_recovery_oldest_unadmitted_eligible_age_seconds',
  'synqdrive_trip_di_boundary_admission_recovery_scan_cap_truncated_total',
  'synqdrive_trip_di_boundary_admission_recovery_pass_duration_ms',
] as const;

describe('Trip DI boundary admission recovery metrics registry integration', () => {
  it('registers recovery counters on TripMetricsService.registry and exports via getMetrics()', async () => {
    const tripMetrics = new TripMetricsService();
    const handles = getTripDiBoundaryAdmissionRecoveryMetrics(tripMetrics.registry);

    handles.passTotal.inc({ mode: 'WRITER' });
    handles.candidatesScannedTotal.inc();
    handles.admissionAttemptsTotal.inc({ mode: 'WRITER' });
    handles.admissionsSucceededTotal.inc({ mode: 'WRITER' });
    handles.guardRejectedTotal.inc({ code: 'FSM_STILL_ACTIVE_ON_TRIP' });
    handles.transientErrorsTotal.inc();
    handles.oldestUnadmittedEligibleAgeSeconds.set(
      { outcome: 'none_in_window', vehicle_id: 'veh-1', coverage: 'batch' },
      0,
    );
    handles.scanCapTruncatedTotal.inc();
    handles.passDurationMs.observe({ mode: 'WRITER' }, 12);

    const body = await tripMetrics.getMetrics();
    for (const name of RECOVERY_METRIC_NAMES) {
      expect(body).toContain(name);
    }
    expect(body).toContain('synqdrive_trip_di_boundary_admission_recovery_pass_total{mode="WRITER"} 1');
    expect(body).toContain('synqdrive_trip_di_boundary_admission_recovery_candidates_scanned_total 1');
  });

  it('does not duplicate-register metrics on repeated getTripDiBoundaryAdmissionRecoveryMetrics for same registry', () => {
    const tripMetrics = new TripMetricsService();
    const first = getTripDiBoundaryAdmissionRecoveryMetrics(tripMetrics.registry);
    const second = getTripDiBoundaryAdmissionRecoveryMetrics(tripMetrics.registry);
    expect(first.passTotal).toBe(second.passTotal);
    expect(() => registerTripDiBoundaryAdmissionRecoveryMetrics(tripMetrics.registry)).toThrow();
  });

  it('allows separate registries without cross-contamination', async () => {
    const a = new TripMetricsService();
    const b = new TripMetricsService();
    getTripDiBoundaryAdmissionRecoveryMetrics(a.registry).passTotal.inc({ mode: 'WRITER' });
    const bodyA = await a.getMetrics();
    const bodyB = await b.getMetrics();
    expect(bodyA).toContain('synqdrive_trip_di_boundary_admission_recovery_pass_total{mode="WRITER"} 1');
    expect(bodyB).not.toContain('synqdrive_trip_di_boundary_admission_recovery_pass_total{mode="WRITER"} 1');
  });

  it('preserves existing Trip FSM metrics on the same registry', async () => {
    const tripMetrics = new TripMetricsService();
    getTripDiBoundaryAdmissionRecoveryMetrics(tripMetrics.registry);
    const body = await tripMetrics.getMetrics();
    expect(body).toContain('synqdrive_trip_finalized_total');
  });

  it('does not register recovery metrics on prom-client default register', async () => {
    const { register: defaultRegister } = await import('prom-client');
    const isolated = new Registry();
    getTripDiBoundaryAdmissionRecoveryMetrics(isolated);
    isolated.metrics().then((text) => {
      expect(text).toContain('synqdrive_trip_di_boundary_admission_recovery_pass_total');
    });
    const defaultText = await defaultRegister.metrics();
    expect(defaultText).not.toContain('synqdrive_trip_di_boundary_admission_recovery_pass_total');
  });
});
