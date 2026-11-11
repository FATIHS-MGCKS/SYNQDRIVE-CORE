import { processDs4RpmHfV1bShadowTrip } from '../../rpm-hf-v1b/ds4-rpm-hf-v1b-processor';
import { processDs4RpmHfV1bShadowTripTierAware } from '../../rpm-hf-v1b/ds4-rpm-hf-v1b-tier-processor';
import type { Ds4RpmHfV1bShadowResultV1 } from '../../rpm-hf-v1b/ds4-rpm-hf-v1b.contract';
import {
  buildRpmPointsEverySeconds,
  buildTierTripClassification,
  buildTierTripInput,
  TIER_TEST_ORG,
  TIER_TEST_TRIP,
  TIER_TEST_VEHICLE,
} from '../../rpm-hf-v1b/__tests__/ds4-rpm-hf-v1b-tier-fixtures';
import {
  buildDs4RpmV1bResearchRpmReportV1,
  verifyDs4RpmV1bResearchSummaryBindingsV1,
  extractTripTimeObservationDensityV1,
} from '../ds4-rpm-v1b-research-reporting.v1';
import {
  DS4_RPM_POLL_SUCCESS_NOT_DERIVED_FROM_TRIP_TIME_DENSITY,
  DS4_RPM_TRIP_TIME_OBSERVATION_DENSITY_SEMANTICS,
} from '../ds4-rpm-v1b-research-reporting.contract.v1';

describe('ds4-rpm-v1b-research-reporting.v1', () => {
  const computedAt = new Date('2026-01-01T11:00:00.000Z');

  function succeedLegacyAndTierAware(tripInput: ReturnType<typeof buildTierTripInput>): {
    legacy: Ds4RpmHfV1bShadowResultV1;
    tierAware: Ds4RpmHfV1bShadowResultV1;
  } {
    const legacyOut = processDs4RpmHfV1bShadowTrip({
      tripInput,
      attemptCount: 1,
      computedAt,
      existingSucceededFingerprint: null,
    });
    const tierOut = processDs4RpmHfV1bShadowTripTierAware({
      tripInput,
      attemptCount: 1,
      computedAt,
      existingSucceededFingerprint: null,
    });
    expect(legacyOut.kind).toBe('SUCCEEDED');
    expect(tierOut.kind).toBe('SUCCEEDED');
    if (legacyOut.kind !== 'SUCCEEDED' || tierOut.kind !== 'SUCCEEDED') {
      throw new Error('fixture');
    }
    return { legacy: legacyOut.result, tierAware: tierOut.result };
  }

  it('preserves Tiguan-like TIER_ANALYTICS_OK and never derives poll success from density', () => {
    const points = buildRpmPointsEverySeconds('2026-01-01T10:00:01.000Z', 80, 1);
    const tripInput = buildTierTripInput({
      rpmPoints: points,
      tierRow: buildTierTripClassification({
        tier: 'RPM_1S',
        analysisReadiness: 'TIER_ANALYTICS_OK',
        tripCoverageBand: 'FULL_SPAN',
      }),
    });
    tripInput.admission.vehicleActiveRpmProfile = 'RPM_1HZ';

    const { legacy, tierAware } = succeedLegacyAndTierAware(tripInput);
    const report = buildDs4RpmV1bResearchRpmReportV1({
      legacy,
      tierAware,
      telemetrySourceFamily: 'RUPTELA_R1',
    });

    expect(report.vsiTripProfile).toBe('RPM_1HZ');
    expect(report.vsiVehicleProfile).toBe('RPM_1HZ');
    expect(report.tierReporting.tierEvidenceVerification).toBe('VERIFIED');
    expect(report.tierReporting.analysisReadiness).toBe('TIER_ANALYTICS_OK');
    expect(report.tierReporting.tripCoverageBand).toBe('FULL_SPAN');
    expect(report.tierReporting.cadenceTier).toBe('RPM_1S');
    expect(report.tierReporting.legacyShadowVariant).toBe('legacy');
    expect(report.tierReporting.tierAwareShadowVariant).toBe('tier-aware');
    expect(report.tripTimeObservationDensitySemantics).toBe(
      DS4_RPM_TRIP_TIME_OBSERVATION_DENSITY_SEMANTICS,
    );
    expect(report.pollSuccessVerdict).toBe(DS4_RPM_POLL_SUCCESS_NOT_DERIVED_FROM_TRIP_TIME_DENSITY);
    expect(report.crossDomainTimestampFusion).toBe('FORBIDDEN');
    expect(report.r1TemporalVeto).toBe('ACTIVE');
    expect(legacy.admission.qualityExposure.cadenceTier).toBeNull();
    expect(report.tierReporting.cadenceTier).not.toBeNull();
  });

  it('preserves Audi-like LIMITED_TRIP and PARTIAL_SPAN without promoting legacy cadenceTier', () => {
    const sparse = buildRpmPointsEverySeconds('2026-01-01T10:00:30.000Z', 12, 3);
    const tripInput = buildTierTripInput({
      rpmPoints: sparse,
      tierRow: buildTierTripClassification({
        tier: 'RPM_1S',
        analysisReadiness: 'LIMITED_TRIP',
        tripCoverageBand: 'PARTIAL_SPAN',
      }),
    });
    tripInput.admission.vehicleActiveRpmProfile = 'UNKNOWN';

    const { legacy, tierAware } = succeedLegacyAndTierAware(tripInput);
    const report = buildDs4RpmV1bResearchRpmReportV1({ legacy, tierAware });

    expect(report.vsiTripProfile).toBe('RPM_1HZ');
    expect(report.vsiVehicleProfile).toBe('UNKNOWN');
    expect(report.tierReporting.analysisReadiness).toBe('LIMITED_TRIP');
    expect(report.tierReporting.tripCoverageBand).toBe('PARTIAL_SPAN');
    expect(legacy.admission.qualityExposure.tierAnalyticsReady).toBe(false);
    expect(report.tripTimeObservationDensity).not.toBe(1);
  });

  it('fails closed when tier-aware missing or tier null', () => {
    const points = buildRpmPointsEverySeconds('2026-01-01T10:00:01.000Z', 5, 1);
    const tripInput = buildTierTripInput({
      rpmPoints: points,
      tierRow: buildTierTripClassification({ tier: 'RPM_1S' }),
    });
    const { legacy } = succeedLegacyAndTierAware(tripInput);

    const noTier = buildDs4RpmV1bResearchRpmReportV1({ legacy, tierAware: null });
    expect(noTier.tierReporting.tierEvidenceVerification).toBe('UNVERIFIED');
    expect(noTier.tierReporting.cadenceTier).toBe('UNVERIFIED');

    const mismatched: Ds4RpmHfV1bShadowResultV1 = {
      ...legacy,
      tripId: 'other-trip',
      shadowVariant: 'tier-aware',
    };
    const bad = verifyDs4RpmV1bResearchSummaryBindingsV1(legacy, mismatched);
    expect(bad.ok).toBe(false);
    if (bad.ok) return;
    expect(bad.reasons).toContain('TRIP_MISMATCH');
  });

  it('rejects cross-trip binding mismatch', () => {
    const points = buildRpmPointsEverySeconds('2026-01-01T10:00:01.000Z', 5, 1);
    const a = succeedLegacyAndTierAware(
      buildTierTripInput({ rpmPoints: points, tierRow: buildTierTripClassification({ tier: 'RPM_1S' }) }),
    );
    const b = succeedLegacyAndTierAware(
      buildTierTripInput({
        rpmPoints: points,
        tierRow: buildTierTripClassification({ tier: 'RPM_1S' }),
        tripId: 'trip-other',
      }),
    );
    const bind = verifyDs4RpmV1bResearchSummaryBindingsV1(a.legacy, b.tierAware);
    expect(bind.ok).toBe(false);
  });

  it('maps observedBucketCoverageRatio to tripTimeObservationDensity only on legacy temporal coverage', () => {
    const points = buildRpmPointsEverySeconds('2026-01-01T10:00:01.000Z', 10, 1);
    const { legacy } = succeedLegacyAndTierAware(
      buildTierTripInput({ rpmPoints: points, tierRow: buildTierTripClassification({ tier: 'RPM_1S' }) }),
    );
    const density = extractTripTimeObservationDensityV1(legacy);
    expect(density).toBe(legacy.temporalCoverage.observedBucketCoverageRatio);
    expect(density).not.toBe(reportPollSuccessProxy(density));
  });
});

function reportPollSuccessProxy(density: number | null): number | null {
  return density == null ? null : density >= 0.9 ? 1 : 0;
}
