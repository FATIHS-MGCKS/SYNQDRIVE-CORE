import { TripMetricsService } from '../../observability/trip-metrics.service';

describe('trip-end-validation observability metrics registry', () => {
  let metrics: TripMetricsService;

  beforeEach(() => {
    metrics = new TripMetricsService();
  });

  it('registers TDL PR0 metrics with low-cardinality labels', async () => {
    metrics.tripEndValidationDecisionTotal.inc({
      outcome: 'CUSUM_VALIDATED',
      end_mode: 'CUSUM_VALIDATED',
      confirmation_source: 'CUSUM_CHANGE_POINT',
    });
    metrics.tripEndValidationObservabilityWriteFailures.inc({
      phase: 'END_VALIDATION',
    });

    const serialized = await metrics.registry.metrics();
    const names = [
      'synqdrive_trip_end_validation_decision_total',
      'synqdrive_trip_end_validation_cusum_outcome_total',
      'synqdrive_trip_end_validation_retry_exhaustion_total',
      'synqdrive_trip_end_validation_clickhouse_assist_total',
      'synqdrive_trip_end_validation_observability_write_failures_total',
      'synqdrive_trip_end_validation_decision_latency_seconds',
    ];
    for (const name of names) {
      expect(serialized).toContain(`# HELP ${name}`);
      expect(serialized).toContain(`# TYPE ${name}`);
    }
    expect(serialized).not.toContain('vehicle_id');
    expect(serialized).not.toContain('trip_id');
  });
});
