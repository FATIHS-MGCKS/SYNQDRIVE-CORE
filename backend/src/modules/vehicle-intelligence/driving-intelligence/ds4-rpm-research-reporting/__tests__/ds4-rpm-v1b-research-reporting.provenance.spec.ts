import { processDs4RpmHfV1bShadowTrip } from '../../rpm-hf-v1b/ds4-rpm-hf-v1b-processor';
import { processDs4RpmHfV1bShadowTripTierAware } from '../../rpm-hf-v1b/ds4-rpm-hf-v1b-tier-processor';
import type { Ds4RpmHfV1bShadowResultV1 } from '../../rpm-hf-v1b/ds4-rpm-hf-v1b.contract';
import {
  buildRpmPointsEverySeconds,
  buildTierTripClassification,
  buildTierTripInput,
  TIER_TEST_LINK,
} from '../../rpm-hf-v1b/__tests__/ds4-rpm-hf-v1b-tier-fixtures';
import {
  buildDs4RpmV1bResearchRpmReportV1,
  verifyDs4RpmV1bResearchSummaryBindingsV1,
} from '../ds4-rpm-v1b-research-reporting.v1';

describe('ds4-rpm-v1b-research-reporting provenance and binding', () => {
  const computedAt = new Date('2026-01-01T11:00:00.000Z');

  function pair(tripInput: ReturnType<typeof buildTierTripInput>) {
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
    if (legacyOut.kind !== 'SUCCEEDED' || tierOut.kind !== 'SUCCEEDED') {
      throw new Error('fixture');
    }
    return { legacy: legacyOut.result, tierAware: tierOut.result };
  }

  it('rejects missing provider source link on either row', () => {
    const points = buildRpmPointsEverySeconds('2026-01-01T10:00:01.000Z', 8, 1);
    const { legacy, tierAware } = pair(
      buildTierTripInput({
        rpmPoints: points,
        tierRow: buildTierTripClassification({ tier: 'RPM_1S' }),
        providerSourceLinkId: TIER_TEST_LINK,
      }),
    );
    const noLink: Ds4RpmHfV1bShadowResultV1 = { ...tierAware, providerSourceLinkId: null };
    const bind = verifyDs4RpmV1bResearchSummaryBindingsV1(legacy, noLink);
    expect(bind.ok).toBe(false);
    if (bind.ok) return;
    expect(bind.reasons).toContain('PROVIDER_SOURCE_LINK_MISSING');
    const report = buildDs4RpmV1bResearchRpmReportV1({ legacy, tierAware: noLink });
    expect(report.tierReporting.tierEvidenceVerification).toBe('UNVERIFIED');
  });

  it('rejects mismatched provider source link', () => {
    const points = buildRpmPointsEverySeconds('2026-01-01T10:00:01.000Z', 8, 1);
    const { legacy, tierAware } = pair(
      buildTierTripInput({
        rpmPoints: points,
        tierRow: buildTierTripClassification({ tier: 'RPM_1S' }),
      }),
    );
    const wrongLink: Ds4RpmHfV1bShadowResultV1 = {
      ...tierAware,
      providerSourceLinkId: 'other-link',
    };
    const bind = verifyDs4RpmV1bResearchSummaryBindingsV1(legacy, wrongLink);
    expect(bind.ok).toBe(false);
    if (bind.ok) return;
    expect(bind.reasons).toContain('PROVIDER_SOURCE_LINK_MISMATCH');
  });

  it('rejects tierEvidence.tripId mismatch', () => {
    const points = buildRpmPointsEverySeconds('2026-01-01T10:00:01.000Z', 8, 1);
    const { legacy, tierAware } = pair(
      buildTierTripInput({
        rpmPoints: points,
        tierRow: buildTierTripClassification({ tier: 'RPM_1S' }),
      }),
    );
    const badTe: Ds4RpmHfV1bShadowResultV1 = {
      ...tierAware,
      tierEvidence: tierAware.tierEvidence
        ? { ...tierAware.tierEvidence, tripId: 'wrong-trip' }
        : undefined,
    };
    const bind = verifyDs4RpmV1bResearchSummaryBindingsV1(legacy, badTe);
    expect(bind.ok).toBe(false);
    if (bind.ok) return;
    expect(bind.reasons).toContain('TIER_EVIDENCE_TRIP_ID_MISMATCH');
  });

  it('RECONSTRUCTED_OFFLINE never marks tier evidence VERIFIED', () => {
    const points = buildRpmPointsEverySeconds('2026-01-01T10:00:01.000Z', 8, 1);
    const { legacy, tierAware } = pair(
      buildTierTripInput({
        rpmPoints: points,
        tierRow: buildTierTripClassification({
          tier: 'RPM_1S',
          analysisReadiness: 'TIER_ANALYTICS_OK',
        }),
      }),
    );
    const report = buildDs4RpmV1bResearchRpmReportV1({
      legacy,
      tierAware,
      tierEvidenceProvenance: 'RECONSTRUCTED_OFFLINE',
    });
    expect(report.tierEvidenceProvenance).toBe('RECONSTRUCTED_OFFLINE');
    expect(report.tierReporting.tierEvidenceVerification).toBe('UNVERIFIED');
    expect(report.tierReporting.cadenceTier).toBe('UNVERIFIED');
  });

  it('rejects missing tier-aware run', () => {
    const points = buildRpmPointsEverySeconds('2026-01-01T10:00:01.000Z', 5, 1);
    const { legacy } = pair(
      buildTierTripInput({
        rpmPoints: points,
        tierRow: buildTierTripClassification({ tier: 'RPM_1S' }),
      }),
    );
    const report = buildDs4RpmV1bResearchRpmReportV1({ legacy, tierAware: null });
    expect(report.tierEvidenceProvenance).toBe('NOT_PROVIDED');
    expect(report.tierReporting.tierEvidenceVerification).toBe('UNVERIFIED');
  });
});
