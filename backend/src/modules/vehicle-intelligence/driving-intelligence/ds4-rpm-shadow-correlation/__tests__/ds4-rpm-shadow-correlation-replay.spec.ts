import {
  DS4_RPM_SHADOW_CORRELATION_SCENARIO_IDS,
  replayDs4RpmShadowCorrelationScenario,
} from './ds4-rpm-shadow-correlation-scenarios.harness';
import { buildDs4RpmShadowCorrelationCohortReport } from '../ds4-rpm-shadow-correlation-report.v1';
import { DS4_RPM_SHADOW_CORRELATION_DATASET_GAPS } from '../ds4-rpm-shadow-correlation-harness.v1';

describe('ds4-rpm-shadow-correlation replay cohort', () => {
  const codeSha = 'test-sha-ds4-rpm-shadow-correlation';

  it('replays deterministically for all fixture scenarios', () => {
    const reportsA = DS4_RPM_SHADOW_CORRELATION_SCENARIO_IDS.map((id) =>
      replayDs4RpmShadowCorrelationScenario(id, { codeSha }),
    );
    const reportsB = DS4_RPM_SHADOW_CORRELATION_SCENARIO_IDS.map((id) =>
      replayDs4RpmShadowCorrelationScenario(id, { codeSha }),
    );
    expect(reportsA).toEqual(reportsB);
  });

  it('RPM_1S_ALIGNED yields defensible context on at least one manoeuvre event', () => {
    const report = replayDs4RpmShadowCorrelationScenario('RPM_1S_ALIGNED', { codeSha });
    expect(report.summary.totalEvents).toBeGreaterThan(0);
    expect(report.summary.eventsWithDefensibleContext).toBeGreaterThan(0);
    expect(report.ds4OnlyBaseline.intensityEligibleNote).toBe('UNCHANGED_BY_HARNESS');
  });

  it('negative controls fail closed without PARTIAL from trip aggregates', () => {
    const tenant = replayDs4RpmShadowCorrelationScenario('TENANT_MISMATCH_NEGATIVE', { codeSha });
    expect(tenant.summary.byContextClassification.UNAVAILABLE).toBe(tenant.summary.totalEvents);

    const shift = replayDs4RpmShadowCorrelationScenario('RPM_TIMESTAMP_SHIFT_NEGATIVE', { codeSha });
    expect(shift.summary.byContextClassification.UNAVAILABLE).toBe(shift.summary.totalEvents);
    expect(shift.summary.byContextClassification.PARTIAL).toBe(0);
  });

  it('builds cohort summary with dataset gaps declared', () => {
    const tripReports = DS4_RPM_SHADOW_CORRELATION_SCENARIO_IDS.map((id) =>
      replayDs4RpmShadowCorrelationScenario(id, { codeSha }),
    );
    expect(tripReports.every((r) => r.referenceAttachmentStatus === 'UNAVAILABLE')).toBe(true);
    expect(tripReports.every((r) => r.evidenceKind === 'SYNTHETIC_FIXTURE')).toBe(true);
    const cohort = buildDs4RpmShadowCorrelationCohortReport({
      cohortId: 'fixture-cohort',
      tripReports,
      datasetGaps: [...DS4_RPM_SHADOW_CORRELATION_DATASET_GAPS],
      codeSha,
      generatedAt: new Date('2026-11-03T12:00:00.000Z'),
      evidenceKind: 'SYNTHETIC_FIXTURE',
    });
    expect(cohort.aggregate.tripCount).toBe(DS4_RPM_SHADOW_CORRELATION_SCENARIO_IDS.length);
    expect(cohort.aggregate.datasetGaps.length).toBeGreaterThan(0);
  });
});
