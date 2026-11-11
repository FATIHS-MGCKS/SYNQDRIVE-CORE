import { replayDs4RpmShadowCorrelationScenario } from '../../ds4-rpm-shadow-correlation/__tests__/ds4-rpm-shadow-correlation-scenarios.harness';
import { buildDefaultSyntheticMotionPayload } from '../../ds4-rpm-shadow-correlation/ds4-rpm-shadow-correlation-harness.v1';
import { DS4_RPM_SHADOW_CORRELATION_CONTRACT_VERSION } from '../../ds4-rpm-shadow-correlation/ds4-rpm-shadow-correlation-v1.contract';
import { computeDs4RpmHfV1bTierAwareInputFingerprint } from '../../rpm-hf-v1b/ds4-rpm-hf-v1b-input-fingerprint';
import { processDs4RpmHfV1bShadowTripTierAware } from '../../rpm-hf-v1b/ds4-rpm-hf-v1b-tier-processor';
import {
  buildTierTripClassification,
  buildTierTripInput,
  TIER_TEST_LINK,
  TIER_TEST_ORG,
  TIER_TEST_TRIP,
  TIER_TEST_VEHICLE,
} from '../../rpm-hf-v1b/__tests__/ds4-rpm-hf-v1b-tier-fixtures';
import type { Ds4RpmDynamicsResearchAdjacentDeltaV1 } from '../../ds4-rpm-dynamics-research/ds4-rpm-dynamics-research.contract.v1';
import {
  API_SYNTHETIC_DIMO,
  R1_DIMO,
  buildRpmPointsEverySeconds,
  runFusionFixture,
  syntheticDriveLabel,
} from './ds4-rpm-dynamics-fusion-research.test-helpers';
import { countEventLocalDirectionReversals } from '../ds4-rpm-dynamics-fusion-event-local.v1';
import { DS4_RPM_DYNAMICS_FUSION_RESEARCH_CONTRACT_VERSION } from '../ds4-rpm-dynamics-fusion-research.contract.v1';
import { computeDs4RpmDynamicsFusionResearchV1 } from '../ds4-rpm-dynamics-fusion-research.kernel.v1';
import { DS4_RPM_DYNAMICS_RESEARCH_CONTRACT_VERSION } from '../../ds4-rpm-dynamics-research/ds4-rpm-dynamics-research.contract.v1';
import { buildDs4RpmReferenceIntelligenceV1ReferenceBlock } from '../../rpm-reference-intelligence-v1/ds4-rpm-reference-intelligence-v1-reference-input';
import { executeDs4RpmDynamicsFusionHarness } from '../ds4-rpm-dynamics-fusion-research.harness.v1';

function buildAdmissibleHarnessInput(tripId = TIER_TEST_TRIP) {
  const { payload, runId } = buildDefaultSyntheticMotionPayload('RPM_1S_ALIGNED');
  const motionStart = payload.speeds[0]!.bucketLabelUtc;
  const tripInput = buildTierTripInput({
    rpmPoints: buildRpmPointsEverySeconds(motionStart, 30, 1),
    tierRow: buildTierTripClassification({ tier: 'RPM_1S', tripId }),
    tripId,
  });
  tripInput.tripStartIso = motionStart;
  tripInput.tripEndIso = syntheticDriveLabel(34);
  const v1bOutcome = processDs4RpmHfV1bShadowTripTierAware({
    tripInput,
    attemptCount: 1,
    computedAt: new Date('2026-11-03T12:00:00.000Z'),
    existingSucceededFingerprint: null,
  });
  const fingerprint = computeDs4RpmHfV1bTierAwareInputFingerprint(tripInput);
  return {
    payload,
    runId,
    tripInput,
    fingerprint,
    v1bResult: v1bOutcome.kind === 'SUCCEEDED' ? v1bOutcome.result : null,
    tripId,
  };
}

describe('P2-D1 fusion binding closeout (F1–F3)', () => {
  it('1: DIMO R1 + sample API_SYNTHETIC → UNAVAILABLE with R1 reason', () => {
    const base = buildAdmissibleHarnessInput('fusion-f1-r1-dimo');
    const fusion = executeDs4RpmDynamicsFusionHarness({
      organizationId: TIER_TEST_ORG,
      vehicleId: TIER_TEST_VEHICLE,
      tripId: base.tripId,
      motionRunId: base.runId,
      motionPayload: base.payload,
      tripInput: base.tripInput,
      v1bResult: base.v1bResult,
      v1bRunId: 'closeout-v1b',
      evidenceKind: 'SYNTHETIC_FIXTURE',
      dimoVehicleRawJson: R1_DIMO,
      rpmSamples: {
        source: 'PINNED_FIXTURE',
        inputFingerprint: base.fingerprint,
        providerSourceLinkId: base.tripInput.providerSourceLinkId,
        telemetrySourceFamily: 'API_SYNTHETIC',
        sourceFamilyAttestation: 'PROVEN_FROM_DIMO_IDENTITY',
        points: base.tripInput.rpmPoints,
        invalidValueCount: 0,
        duplicateTimestampCount: 0,
      },
    });
    expect(fusion.status).toBe('UNAVAILABLE');
    expect(fusion.tripReasonCodes).toContain('R1_HISTORICAL_OBD_POINT_TIME_CORRELATION_PROHIBITED');
    expect(fusion.tripReasonCodes).toContain('TELEMETRY_SOURCE_FAMILY_CONTRADICTS_DIMO_IDENTITY');
  });

  it('2: DIMO API_SYNTHETIC + sample RUPTELA_R1 → UNAVAILABLE', () => {
    const base = buildAdmissibleHarnessInput('fusion-f1-r1-sample');
    const fusion = executeDs4RpmDynamicsFusionHarness({
      organizationId: TIER_TEST_ORG,
      vehicleId: TIER_TEST_VEHICLE,
      tripId: base.tripId,
      motionRunId: base.runId,
      motionPayload: base.payload,
      tripInput: base.tripInput,
      v1bResult: base.v1bResult,
      v1bRunId: 'closeout-v1b',
      evidenceKind: 'SYNTHETIC_FIXTURE',
      dimoVehicleRawJson: API_SYNTHETIC_DIMO,
      rpmSamples: {
        source: 'PINNED_FIXTURE',
        inputFingerprint: base.fingerprint,
        providerSourceLinkId: base.tripInput.providerSourceLinkId,
        telemetrySourceFamily: 'RUPTELA_R1',
        sourceFamilyAttestation: 'PROVEN_FROM_DIMO_IDENTITY',
        points: base.tripInput.rpmPoints,
        invalidValueCount: 0,
        duplicateTimestampCount: 0,
      },
    });
    expect(fusion.status).toBe('UNAVAILABLE');
    expect(fusion.tripReasonCodes).toContain('TELEMETRY_SOURCE_FAMILY_CONTRADICTS_DIMO_IDENTITY');
    expect(fusion.tripReasonCodes).toContain('R1_HISTORICAL_OBD_POINT_TIME_CORRELATION_PROHIBITED');
  });

  it('3: A2 trip A + shadow-correlation trip B → UNAVAILABLE', () => {
    const base = buildAdmissibleHarnessInput('fusion-trip-a');
    const fingerprint = base.fingerprint;
    const fusion = computeDs4RpmDynamicsFusionResearchV1({
      contractVersion: DS4_RPM_DYNAMICS_FUSION_RESEARCH_CONTRACT_VERSION,
      evidenceKind: 'SYNTHETIC_FIXTURE',
      correlation: {
        contractVersion: DS4_RPM_SHADOW_CORRELATION_CONTRACT_VERSION,
        organizationId: TIER_TEST_ORG,
        vehicleId: TIER_TEST_VEHICLE,
        tripId: 'shadow-trip-b',
        motion: { runId: base.runId, pinnedSnapshotHash: null, inputFingerprint: null },
        events: base.payload.events,
        v1b: base.v1bResult
          ? {
              runId: 'closeout-v1b',
              engineVersion: base.v1bResult.engineVersion,
              inputFingerprint: fingerprint,
              summary: base.v1bResult,
            }
          : null,
        rpmSamples: {
          source: 'PINNED_FIXTURE',
          inputFingerprint: fingerprint,
          providerSourceLinkId: base.tripInput.providerSourceLinkId,
          telemetrySourceFamily: 'API_SYNTHETIC',
          sourceFamilyAttestation: 'PROVEN_FROM_DIMO_IDENTITY',
          points: base.tripInput.rpmPoints,
          invalidValueCount: 0,
          duplicateTimestampCount: 0,
        },
      },
      dynamicsInput: {
        contractVersion: DS4_RPM_DYNAMICS_RESEARCH_CONTRACT_VERSION,
        evidenceOrigin: 'SYNTHETIC_FIXTURE',
        sourceBundleId: null,
        organizationId: TIER_TEST_ORG,
        vehicleId: TIER_TEST_VEHICLE,
        tripId: base.tripId,
        providerSourceLinkId: base.tripInput.providerSourceLinkId ?? '',
        dimoVehicleRawJson: API_SYNTHETIC_DIMO,
        tripInput: base.tripInput,
        v1bResult: base.v1bResult,
        reference: buildDs4RpmReferenceIntelligenceV1ReferenceBlock({
          idleRpm: 800,
          maxRpm: 6800,
          idleRpmProvenance: { category: 'USER_CONFIRMED' },
          maxRpmProvenance: { category: 'USER_CONFIRMED' },
          iceRpmApplicability: 'APPLICABLE',
        }),
      },
      motionPayload: base.payload,
      provenanceGate: {
        recomputedV1bInputFingerprint: fingerprint,
        evidenceKind: 'SYNTHETIC_FIXTURE',
        canonicalTripRpmPoints: base.tripInput.rpmPoints.map((p) => ({ ...p })),
      },
    });
    expect(fusion.status).toBe('UNAVAILABLE');
    expect(fusion.tripReasonCodes).toContain('TRIP_ID_MISMATCH');
  });

  it('4: same trip id but mismatched organization → UNAVAILABLE', () => {
    const fusion = runFusionFixture({
      rpmPoints: buildRpmPointsEverySeconds(syntheticDriveLabel(0), 15, 1),
      tripId: TIER_TEST_TRIP,
      organizationId: 'org-not-tier',
    });
    expect(fusion.status).toBe('UNAVAILABLE');
    expect(
      fusion.tripReasonCodes.some((c) =>
        ['TENANCY_MISMATCH', 'A2_DYNAMICS_ABSTAINED'].includes(c),
      ),
    ).toBe(true);
  });

  it('5a: mismatched rpm sample fingerprint → UNAVAILABLE', () => {
    const base = buildAdmissibleHarnessInput('fusion-f5-fp');
    const fusion = executeDs4RpmDynamicsFusionHarness({
      organizationId: TIER_TEST_ORG,
      vehicleId: TIER_TEST_VEHICLE,
      tripId: base.tripId,
      motionRunId: base.runId,
      motionPayload: base.payload,
      tripInput: base.tripInput,
      v1bResult: base.v1bResult,
      v1bRunId: 'closeout-v1b',
      evidenceKind: 'SYNTHETIC_FIXTURE',
      dimoVehicleRawJson: API_SYNTHETIC_DIMO,
      rpmSamples: {
        source: 'PINNED_FIXTURE',
        inputFingerprint: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
        providerSourceLinkId: base.tripInput.providerSourceLinkId,
        telemetrySourceFamily: 'API_SYNTHETIC',
        sourceFamilyAttestation: 'PROVEN_FROM_DIMO_IDENTITY',
        points: base.tripInput.rpmPoints,
        invalidValueCount: 0,
        duplicateTimestampCount: 0,
      },
    });
    expect(fusion.status).toBe('UNAVAILABLE');
    expect(fusion.tripReasonCodes).toContain('RPM_SAMPLE_FINGERPRINT_MISMATCH');
  });

  it('5b: mismatched rpm sample point content vs bound trip input → UNAVAILABLE', () => {
    const base = buildAdmissibleHarnessInput('fusion-f5-points');
    const poisonedPoints = base.tripInput.rpmPoints.map((p, i) =>
      i === 2 ? { ...p, valueRpm: p.valueRpm + 500 } : p,
    );
    const fusion = executeDs4RpmDynamicsFusionHarness({
      organizationId: TIER_TEST_ORG,
      vehicleId: TIER_TEST_VEHICLE,
      tripId: base.tripId,
      motionRunId: base.runId,
      motionPayload: base.payload,
      tripInput: base.tripInput,
      v1bResult: base.v1bResult,
      v1bRunId: 'closeout-v1b',
      evidenceKind: 'SYNTHETIC_FIXTURE',
      dimoVehicleRawJson: API_SYNTHETIC_DIMO,
      rpmSamples: {
        source: 'PINNED_FIXTURE',
        inputFingerprint: base.fingerprint,
        providerSourceLinkId: base.tripInput.providerSourceLinkId,
        telemetrySourceFamily: 'API_SYNTHETIC',
        sourceFamilyAttestation: 'PROVEN_FROM_DIMO_IDENTITY',
        points: poisonedPoints,
        invalidValueCount: 0,
        duplicateTimestampCount: 0,
      },
    });
    expect(fusion.status).toBe('UNAVAILABLE');
    expect(fusion.tripReasonCodes).toContain('RPM_SAMPLE_POINTS_DIGEST_MISMATCH');
  });

  it('6: REAL_OBSERVATION with synthetic provenanceGate evidence kind → UNAVAILABLE', () => {
    const base = buildAdmissibleHarnessInput('fusion-f6-real');
    const fusion = computeDs4RpmDynamicsFusionResearchV1({
      contractVersion: DS4_RPM_DYNAMICS_FUSION_RESEARCH_CONTRACT_VERSION,
      evidenceKind: 'REAL_OBSERVATION',
      correlation: {
        contractVersion: DS4_RPM_SHADOW_CORRELATION_CONTRACT_VERSION,
        organizationId: TIER_TEST_ORG,
        vehicleId: TIER_TEST_VEHICLE,
        tripId: base.tripId,
        motion: { runId: base.runId, pinnedSnapshotHash: null, inputFingerprint: null },
        events: base.payload.events,
        v1b: base.v1bResult
          ? {
              runId: 'closeout-v1b',
              engineVersion: base.v1bResult.engineVersion,
              inputFingerprint: base.fingerprint,
              summary: base.v1bResult,
            }
          : null,
        rpmSamples: {
          source: 'PINNED_FIXTURE',
          inputFingerprint: base.fingerprint,
          providerSourceLinkId: base.tripInput.providerSourceLinkId,
          telemetrySourceFamily: 'API_SYNTHETIC',
          sourceFamilyAttestation: 'PROVEN_FROM_DIMO_IDENTITY',
          points: base.tripInput.rpmPoints,
          invalidValueCount: 0,
          duplicateTimestampCount: 0,
        },
      },
      dynamicsInput: {
        contractVersion: DS4_RPM_DYNAMICS_RESEARCH_CONTRACT_VERSION,
        evidenceOrigin: 'OFFLINE_SEALED_BUNDLE',
        sourceBundleId: null,
        organizationId: TIER_TEST_ORG,
        vehicleId: TIER_TEST_VEHICLE,
        tripId: base.tripId,
        providerSourceLinkId: base.tripInput.providerSourceLinkId ?? '',
        dimoVehicleRawJson: API_SYNTHETIC_DIMO,
        tripInput: base.tripInput,
        v1bResult: base.v1bResult,
        reference: buildDs4RpmReferenceIntelligenceV1ReferenceBlock({
          idleRpm: 800,
          maxRpm: 6800,
          idleRpmProvenance: { category: 'USER_CONFIRMED' },
          maxRpmProvenance: { category: 'USER_CONFIRMED' },
          iceRpmApplicability: 'APPLICABLE',
        }),
      },
      motionPayload: base.payload,
      provenanceGate: {
        recomputedV1bInputFingerprint: base.fingerprint,
        evidenceKind: 'SYNTHETIC_FIXTURE',
        canonicalTripRpmPoints: base.tripInput.rpmPoints.map((p) => ({ ...p })),
      },
    });
    expect(fusion.status).toBe('UNAVAILABLE');
    expect(fusion.tripReasonCodes).toContain('FUSION_PROVENANCE_EVIDENCE_KIND_MISMATCH');
    expect(fusion.tripReasonCodes).toContain('FUSION_SYNTHETIC_GATE_REJECTS_REAL_OBSERVATION');
    expect(fusion.tripReasonCodes).toContain('UNVERIFIED_EVIDENCE_SOURCE_CLAIM');
  });

  it('7: correlation events mismatched with motion payload → reject', () => {
    const base = buildAdmissibleHarnessInput('fusion-f7-motion');
    const corruptEvents = base.payload.events.map((e, i) =>
      i === 0 ? { ...e, kind: 'CORRUPT_KIND' } : e,
    );
    const fusion = computeDs4RpmDynamicsFusionResearchV1({
      contractVersion: DS4_RPM_DYNAMICS_FUSION_RESEARCH_CONTRACT_VERSION,
      evidenceKind: 'SYNTHETIC_FIXTURE',
      correlation: {
        contractVersion: DS4_RPM_SHADOW_CORRELATION_CONTRACT_VERSION,
        organizationId: TIER_TEST_ORG,
        vehicleId: TIER_TEST_VEHICLE,
        tripId: base.tripId,
        motion: { runId: base.runId, pinnedSnapshotHash: null, inputFingerprint: null },
        events: corruptEvents,
        v1b: base.v1bResult
          ? {
              runId: 'closeout-v1b',
              engineVersion: base.v1bResult.engineVersion,
              inputFingerprint: base.fingerprint,
              summary: base.v1bResult,
            }
          : null,
        rpmSamples: {
          source: 'PINNED_FIXTURE',
          inputFingerprint: base.fingerprint,
          providerSourceLinkId: base.tripInput.providerSourceLinkId,
          telemetrySourceFamily: 'API_SYNTHETIC',
          sourceFamilyAttestation: 'PROVEN_FROM_DIMO_IDENTITY',
          points: base.tripInput.rpmPoints,
          invalidValueCount: 0,
          duplicateTimestampCount: 0,
        },
      },
      dynamicsInput: {
        contractVersion: DS4_RPM_DYNAMICS_RESEARCH_CONTRACT_VERSION,
        evidenceOrigin: 'SYNTHETIC_FIXTURE',
        sourceBundleId: null,
        organizationId: TIER_TEST_ORG,
        vehicleId: TIER_TEST_VEHICLE,
        tripId: base.tripId,
        providerSourceLinkId: base.tripInput.providerSourceLinkId ?? '',
        dimoVehicleRawJson: API_SYNTHETIC_DIMO,
        tripInput: base.tripInput,
        v1bResult: base.v1bResult,
        reference: buildDs4RpmReferenceIntelligenceV1ReferenceBlock({
          idleRpm: 800,
          maxRpm: 6800,
          idleRpmProvenance: { category: 'USER_CONFIRMED' },
          maxRpmProvenance: { category: 'USER_CONFIRMED' },
          iceRpmApplicability: 'APPLICABLE',
        }),
      },
      motionPayload: base.payload,
      provenanceGate: {
        recomputedV1bInputFingerprint: base.fingerprint,
        evidenceKind: 'SYNTHETIC_FIXTURE',
        canonicalTripRpmPoints: base.tripInput.rpmPoints.map((p) => ({ ...p })),
      },
    });
    expect(fusion.status).toBe('UNAVAILABLE');
    expect(fusion.tripReasonCodes).toContain('FUSION_MOTION_EVENT_PAYLOAD_MISMATCH');
  });

  it('10: fully matching synthetic case admits fusion with shadow parity unchanged', () => {
    const shadow = replayDs4RpmShadowCorrelationScenario('RPM_1S_ALIGNED', {
      codeSha: 'closeout-parity',
    });
    const { payload } = buildDefaultSyntheticMotionPayload('RPM_1S_ALIGNED');
    const motionStart = payload.speeds[0]!.bucketLabelUtc;
    const fusion = runFusionFixture({
      motionScenarioKey: 'RPM_1S_ALIGNED',
      rpmPoints: buildRpmPointsEverySeconds(motionStart, 30, 1),
    });
    expect(fusion.status).toBe('COMPUTED');
    expect(fusion.events.length).toBe(shadow.events.length);
    for (let i = 0; i < shadow.events.length; i += 1) {
      expect(fusion.events[i]!.shadowCorrelation.contextClassification).toBe(
        shadow.events[i]!.contextClassification,
      );
      expect(fusion.events[i]!.shadowCorrelation.descriptiveRpmStats).toEqual(
        shadow.events[i]!.descriptiveRpmStats,
      );
    }
  });
});

describe('P2-D1 fusion event-local reversals (F4)', () => {
  const mk = (
    partial: Partial<Ds4RpmDynamicsResearchAdjacentDeltaV1>,
  ): Ds4RpmDynamicsResearchAdjacentDeltaV1 => ({
    sequenceIndex: 0,
    fromGlobalIdx: 0,
    toGlobalIdx: 1,
    fromRpm: 1000,
    toRpm: 1100,
    deltaRpm: 100,
    labelGapMs: 1000,
    direction: 'RISE',
    ...partial,
  });

  it('8: RISE / gap (sequence break) / FALL within one event window → zero reversals', () => {
    const deltas = [
      mk({ sequenceIndex: 0, direction: 'RISE', fromGlobalIdx: 0, toGlobalIdx: 1 }),
      mk({ sequenceIndex: 1, direction: 'FALL', fromGlobalIdx: 5, toGlobalIdx: 6, deltaRpm: -50 }),
    ];
    expect(countEventLocalDirectionReversals(deltas)).toBe(0);
  });

  it('9: RISE / FLAT / FALL within one sequence → one reversal', () => {
    const deltas = [
      mk({ sequenceIndex: 0, direction: 'RISE' }),
      mk({ sequenceIndex: 0, direction: 'FLAT', deltaRpm: 0 }),
      mk({ sequenceIndex: 0, direction: 'FALL', deltaRpm: -80 }),
    ];
    expect(countEventLocalDirectionReversals(deltas)).toBe(1);
  });
});
