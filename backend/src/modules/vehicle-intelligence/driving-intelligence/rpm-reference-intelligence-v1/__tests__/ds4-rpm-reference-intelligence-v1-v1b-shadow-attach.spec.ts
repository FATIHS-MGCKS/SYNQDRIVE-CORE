import {
  applyRpmReferenceIntelligenceV1V1bShadowAttachment,
  buildRpmReferenceIntelligenceV1V1bShadowAttachment,
  DS4_RPM_REF_INTEL_REASON,
  DS4_RPM_REF_INTEL_V1_V1B_ATTACHMENT_REVISION_POLICY,
  DS4_RPM_REF_INTEL_V1_V1B_SHADOW_ATTACH_CONTRACT_VERSION,
  parseDs4RpmRefIntelV1V1bAttachEnabled,
  shouldAttachRpmReferenceIntelligenceV1ToV1bSummary,
} from '../index';
import * as refIntelEngine from '../ds4-rpm-reference-intelligence-v1.engine';
import { processDs4RpmHfV1bShadowTrip } from '../../rpm-hf-v1b/ds4-rpm-hf-v1b-processor';
import { processDs4RpmHfV1bShadowTripTierAware } from '../../rpm-hf-v1b/ds4-rpm-hf-v1b-tier-processor';
import { computeDs4RpmHfV1bInputFingerprint } from '../../rpm-hf-v1b/ds4-rpm-hf-v1b-input-fingerprint';
import {
  buildRpmPointsEverySeconds,
  buildTierTripClassification,
  buildTierTripInput,
  TIER_TEST_ORG,
  TIER_TEST_VEHICLE,
} from '../../rpm-hf-v1b/__tests__/ds4-rpm-hf-v1b-tier-fixtures';

const computedAt = new Date('2026-01-01T11:00:00.000Z');

const vehicleRow = {
  organizationId: TIER_TEST_ORG,
  idleRpm: 800,
  maxRpm: 6500,
  registrationIdentityProvenance: {
    version: 1,
    updatedAt: '2026-01-01T00:00:00.000Z',
    fields: {
      idleRpm: {
        value: 800,
        provenance: 'USER_CONFIRMED',
        confirmationStatus: 'USER_CONFIRMED',
        confirmedAt: '2026-01-01T00:00:00.000Z',
      },
      maxRpm: {
        value: 6500,
        provenance: 'USER_CONFIRMED',
        confirmationStatus: 'USER_CONFIRMED',
        confirmedAt: '2026-01-01T00:00:00.000Z',
      },
    },
  },
};

describe('ds4-rpm-reference-intelligence-v1 v1b shadow attach', () => {
  it('parseDs4RpmRefIntelV1V1bAttachEnabled defaults false', () => {
    expect(parseDs4RpmRefIntelV1V1bAttachEnabled({})).toBe(false);
    expect(parseDs4RpmRefIntelV1V1bAttachEnabled({ DS4_RPM_REF_INTEL_V1_V1B_ATTACH_ENABLED: 'true' })).toBe(
      true,
    );
  });

  it('attach flag OFF leaves summary unchanged on successful tier-aware run', () => {
    const points = buildRpmPointsEverySeconds('2026-01-01T10:00:01.000Z', 20, 1);
    const tripInput = buildTierTripInput({
      rpmPoints: points,
      tierRow: buildTierTripClassification({ tier: 'RPM_1S' }),
    });
    const processed = processDs4RpmHfV1bShadowTripTierAware({
      tripInput,
      attemptCount: 1,
      computedAt,
      existingSucceededFingerprint: null,
    });
    expect(processed.kind).toBe('SUCCEEDED');
    if (processed.kind !== 'SUCCEEDED') return;
    const fingerprintBefore = processed.fingerprint;
    const out = applyRpmReferenceIntelligenceV1V1bShadowAttachment({
      summary: processed.result,
      tripInput,
      vehicle: vehicleRow,
      runId: 'run-1',
      inputFingerprint: processed.fingerprint,
      computedAt,
      attachEnabled: false,
    });
    expect(out).toEqual(processed.result);
    expect(out.rpmReferenceIntelligenceV1).toBeUndefined();
    expect(processed.fingerprint).toBe(fingerprintBefore);
  });

  it('attach flag ON adds tier-aware attachment with KNOWN metrics', () => {
    const points = buildRpmPointsEverySeconds('2026-01-01T10:00:01.000Z', 25, 1);
    const tripInput = buildTierTripInput({
      rpmPoints: points,
      tierRow: buildTierTripClassification({ tier: 'RPM_1S' }),
    });
    const processed = processDs4RpmHfV1bShadowTripTierAware({
      tripInput,
      attemptCount: 1,
      computedAt,
      existingSucceededFingerprint: null,
    });
    expect(processed.kind).toBe('SUCCEEDED');
    if (processed.kind !== 'SUCCEEDED') return;
    const out = applyRpmReferenceIntelligenceV1V1bShadowAttachment({
      summary: processed.result,
      tripInput,
      vehicle: vehicleRow,
      runId: 'run-tier-1',
      inputFingerprint: processed.fingerprint,
      computedAt,
      attachEnabled: true,
    });
    expect(out.contractVersion).toBe(processed.result.contractVersion);
    expect(out.rpmReferenceIntelligenceV1?.contractVersion).toBe(
      DS4_RPM_REF_INTEL_V1_V1B_SHADOW_ATTACH_CONTRACT_VERSION,
    );
    expect(out.rpmReferenceIntelligenceV1?.revisionPolicy).toBe(
      DS4_RPM_REF_INTEL_V1_V1B_ATTACHMENT_REVISION_POLICY,
    );
    expect(out.rpmReferenceIntelligenceV1?.payload.availability).toBe('KNOWN');
    expect(out.rpmReferenceIntelligenceV1?.referenceSnapshotUsed.idleRpm).toBe(800);
    const roundtrip = JSON.parse(JSON.stringify(out)) as typeof out;
    expect(roundtrip.rpmReferenceIntelligenceV1?.runId).toBe('run-tier-1');
  });

  it('legacy successful V1B without tier temporal evidence fails closed in attachment payload', () => {
    const points = buildRpmPointsEverySeconds('2026-01-01T10:00:01.000Z', 20, 1);
    const tripInput = buildTierTripInput({
      rpmPoints: points,
      tierRow: buildTierTripClassification({ tier: 'RPM_1S' }),
    });
    const processed = processDs4RpmHfV1bShadowTrip({
      tripInput,
      attemptCount: 1,
      computedAt,
      existingSucceededFingerprint: null,
    });
    expect(processed.kind).toBe('SUCCEEDED');
    if (processed.kind !== 'SUCCEEDED') return;
    const attachment = buildRpmReferenceIntelligenceV1V1bShadowAttachment({
      runId: 'run-legacy',
      inputFingerprint: processed.fingerprint,
      computedAt,
      tripInput,
      v1bResult: processed.result,
      vehicle: vehicleRow,
    });
    expect(attachment.payload.availability).toBe('UNKNOWN');
    expect(attachment.payload.reasonCodes).toContain(
      DS4_RPM_REF_INTEL_REASON.V1B_TEMPORAL_PROFILE_UNAVAILABLE,
    );
  });

  it('missing vehicle spec yields PARTIAL/UNKNOWN payload without throwing', () => {
    const points = buildRpmPointsEverySeconds('2026-01-01T10:00:01.000Z', 20, 1);
    const tripInput = buildTierTripInput({
      rpmPoints: points,
      tierRow: buildTierTripClassification({ tier: 'RPM_1S' }),
    });
    const processed = processDs4RpmHfV1bShadowTripTierAware({
      tripInput,
      attemptCount: 1,
      computedAt,
      existingSucceededFingerprint: null,
    });
    expect(processed.kind).toBe('SUCCEEDED');
    if (processed.kind !== 'SUCCEEDED') return;
    const attachment = buildRpmReferenceIntelligenceV1V1bShadowAttachment({
      runId: 'run-missing-spec',
      inputFingerprint: processed.fingerprint,
      computedAt,
      tripInput,
      v1bResult: processed.result,
      vehicle: {
        organizationId: TIER_TEST_ORG,
        idleRpm: null,
        maxRpm: null,
        registrationIdentityProvenance: null,
      },
    });
    expect(attachment.payload.availability).not.toBe('KNOWN');
    expect(attachment.payload.reasonCodes).toContain(
      DS4_RPM_REF_INTEL_REASON.REFERENCE_SPEC_UNAVAILABLE,
    );
  });

  it('tenancy mismatch is isolated and preserves base summary', () => {
    const points = buildRpmPointsEverySeconds('2026-01-01T10:00:01.000Z', 10, 1);
    const tripInput = buildTierTripInput({
      rpmPoints: points,
      tierRow: buildTierTripClassification({ tier: 'RPM_1S' }),
    });
    const processed = processDs4RpmHfV1bShadowTripTierAware({
      tripInput,
      attemptCount: 1,
      computedAt,
      existingSucceededFingerprint: null,
    });
    expect(processed.kind).toBe('SUCCEEDED');
    if (processed.kind !== 'SUCCEEDED') return;
    const warn = jest.fn();
    const out = applyRpmReferenceIntelligenceV1V1bShadowAttachment({
      summary: processed.result,
      tripInput,
      vehicle: { ...vehicleRow, organizationId: 'other-org' },
      runId: 'run-tenancy',
      inputFingerprint: processed.fingerprint,
      computedAt,
      attachEnabled: true,
      logger: { warn },
    });
    expect(out.rpmReferenceIntelligenceV1).toBeUndefined();
    expect(warn).toHaveBeenCalled();
  });

  it('unexpected compute errors are isolated', () => {
    const points = buildRpmPointsEverySeconds('2026-01-01T10:00:01.000Z', 10, 1);
    const tripInput = buildTierTripInput({
      rpmPoints: points,
      tierRow: buildTierTripClassification({ tier: 'RPM_1S' }),
    });
    const processed = processDs4RpmHfV1bShadowTripTierAware({
      tripInput,
      attemptCount: 1,
      computedAt,
      existingSucceededFingerprint: null,
    });
    expect(processed.kind).toBe('SUCCEEDED');
    if (processed.kind !== 'SUCCEEDED') return;
    const spy = jest
      .spyOn(refIntelEngine, 'computeDs4RpmReferenceIntelligenceV1')
      .mockImplementation(() => {
        throw new Error('unexpected');
      });
    const warn = jest.fn();
    const out = applyRpmReferenceIntelligenceV1V1bShadowAttachment({
      summary: processed.result,
      tripInput,
      vehicle: vehicleRow,
      runId: 'run-error',
      inputFingerprint: processed.fingerprint,
      computedAt,
      attachEnabled: true,
      logger: { warn },
    });
    expect(out.rpmReferenceIntelligenceV1).toBeUndefined();
    expect(out.processingOutcome).toBe('SUCCEEDED');
    expect(warn).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('shouldAttach requires SUCCEEDED + processingAllowed', () => {
    const points = buildRpmPointsEverySeconds('2026-01-01T10:00:01.000Z', 5, 1);
    const tripInput = buildTierTripInput({
      rpmPoints: points,
      tierRow: buildTierTripClassification({ tier: 'RPM_1S' }),
    });
    const processed = processDs4RpmHfV1bShadowTripTierAware({
      tripInput,
      attemptCount: 1,
      computedAt,
      existingSucceededFingerprint: null,
    });
    expect(processed.kind).toBe('SUCCEEDED');
    if (processed.kind !== 'SUCCEEDED') return;
    expect(
      shouldAttachRpmReferenceIntelligenceV1ToV1bSummary({
        attachEnabled: true,
        v1bResult: processed.result,
      }),
    ).toBe(true);
    expect(
      shouldAttachRpmReferenceIntelligenceV1ToV1bSummary({
        attachEnabled: true,
        v1bResult: { ...processed.result, processingOutcome: 'TERMINAL_INELIGIBLE' },
      }),
    ).toBe(false);
  });

  it('V1B input fingerprint unchanged by attachment helper', () => {
    const tripInput = buildTierTripInput({
      rpmPoints: buildRpmPointsEverySeconds('2026-01-01T10:00:01.000Z', 15, 1),
      tierRow: buildTierTripClassification({ tier: 'RPM_1S' }),
    });
    const fp = computeDs4RpmHfV1bInputFingerprint(tripInput);
    const processed = processDs4RpmHfV1bShadowTrip({
      tripInput,
      attemptCount: 1,
      computedAt,
      existingSucceededFingerprint: null,
    });
    expect(processed.fingerprint).toBe(fp);
    if (processed.kind !== 'SUCCEEDED') return;
    applyRpmReferenceIntelligenceV1V1bShadowAttachment({
      summary: processed.result,
      tripInput,
      vehicle: vehicleRow,
      runId: 'run-fp',
      inputFingerprint: processed.fingerprint,
      computedAt,
      attachEnabled: true,
    });
    expect(processed.fingerprint).toBe(fp);
  });
});

describe('vehicle scope isolation', () => {
  it('attachment org/vehicle/trip ids match admitting run', () => {
    const tripInput = buildTierTripInput({
      rpmPoints: buildRpmPointsEverySeconds('2026-01-01T10:00:01.000Z', 12, 1),
      tierRow: buildTierTripClassification({ tier: 'RPM_1S' }),
    });
    const processed = processDs4RpmHfV1bShadowTripTierAware({
      tripInput,
      attemptCount: 1,
      computedAt,
      existingSucceededFingerprint: null,
    });
    if (processed.kind !== 'SUCCEEDED') throw new Error('expected success');
    const attachment = buildRpmReferenceIntelligenceV1V1bShadowAttachment({
      runId: 'run-scope',
      inputFingerprint: processed.fingerprint,
      computedAt,
      tripInput,
      v1bResult: processed.result,
      vehicle: vehicleRow,
    });
    expect(attachment.organizationId).toBe(TIER_TEST_ORG);
    expect(attachment.vehicleId).toBe(TIER_TEST_VEHICLE);
    expect(attachment.tripId).toBe(tripInput.tripId);
  });
});
