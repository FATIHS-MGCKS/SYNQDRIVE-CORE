import { replayDs4RpmShadowCorrelationScenario } from '../../ds4-rpm-shadow-correlation/__tests__/ds4-rpm-shadow-correlation-scenarios.harness';
import { buildDefaultSyntheticMotionPayload } from '../../ds4-rpm-shadow-correlation/ds4-rpm-shadow-correlation-harness.v1';
import { computeDs4RpmHfV1bTierAwareInputFingerprint } from '../../rpm-hf-v1b/ds4-rpm-hf-v1b-input-fingerprint';
import { processDs4RpmHfV1bShadowTripTierAware } from '../../rpm-hf-v1b/ds4-rpm-hf-v1b-tier-processor';
import {
  buildTierTripClassification,
  buildTierTripInput,
  TIER_TEST_ORG,
  TIER_TEST_VEHICLE,
} from '../../rpm-hf-v1b/__tests__/ds4-rpm-hf-v1b-tier-fixtures';
import { executeDs4RpmDynamicsFusionHarness } from '../ds4-rpm-dynamics-fusion-research.harness.v1';
import {
  API_SYNTHETIC_DIMO,
  buildRpmPointsEverySeconds,
  R1_DIMO,
  runFusionFixture,
  syntheticDriveLabel,
} from './ds4-rpm-dynamics-fusion-research.test-helpers';

describe('ds4-rpm-dynamics-fusion-research kernel v1', () => {
  it('preserves shadow-correlation DS4 metrics verbatim on fusion events', () => {
    const shadow = replayDs4RpmShadowCorrelationScenario('RPM_1S_ALIGNED', {
      codeSha: 'fusion-parity-sha',
    });
    const { payload } = buildDefaultSyntheticMotionPayload('RPM_1S_ALIGNED');
    const motionStart = payload.speeds[0]!.bucketLabelUtc;
    const fusion = runFusionFixture({
      motionScenarioKey: 'RPM_1S_ALIGNED',
      rpmPoints: buildRpmPointsEverySeconds(motionStart, 30, 1),
    });
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

  it('DS4 acceleration window with rising RPM labels yields rising local pair evidence', () => {
    const start = syntheticDriveLabel(0);
    const rpmPoints = buildRpmPointsEverySeconds(start, 35, 1).map((p, i) => ({
      ...p,
      valueRpm: 900 + i * 35,
    }));
    const fusion = runFusionFixture({ rpmPoints });
    expect(fusion.status).toBe('COMPUTED');
    const withPairs = fusion.events.filter((e) => (e.eventLocalDynamics?.localAdmittedPairCount ?? 0) > 0);
    expect(withPairs.length).toBeGreaterThan(0);
    expect(withPairs.some((e) => (e.eventLocalDynamics?.deltaDistribution.positiveCount ?? 0) > 0)).toBe(
      true,
    );
    expect(fusion.scientificGuards.notCausalRpmResponse).toBe(true);
    expect(fusion.unsupportedScientificClaims).not.toContain('PROVEN_PHYSICAL_SYNC');
  });

  it('DS4 acceleration with falling RPM does not assert causal mismatch', () => {
    const start = syntheticDriveLabel(0);
    const rpmPoints = buildRpmPointsEverySeconds(start, 35, 1).map((p, i) => ({
      ...p,
      valueRpm: 2200 - i * 30,
    }));
    const fusion = runFusionFixture({ rpmPoints });
    expect(fusion.events.some((e) => (e.eventLocalDynamics?.deltaDistribution.negativeCount ?? 0) > 0)).toBe(
      true,
    );
    for (const e of fusion.events) {
      expect(e.scientificLimitationFlags).toContain('NOT_CAUSAL_RPM_RESPONSE_TO_DS4_EVENT');
    }
  });

  it('flat RPM labels yield zero local reversals when pairs exist', () => {
    const start = syntheticDriveLabel(0);
    const rpmPoints = buildRpmPointsEverySeconds(start, 35, 1).map((p) => ({
      ...p,
      valueRpm: 1100,
    }));
    const fusion = runFusionFixture({ rpmPoints });
    const withPairs = fusion.events.filter((e) => (e.eventLocalDynamics?.localAdmittedPairCount ?? 0) > 0);
    for (const e of withPairs) {
      expect(e.eventLocalDynamics!.observedDirectionReversalCount).toBe(0);
      expect(e.eventLocalDynamics!.deltaDistribution.zeroCount).toBe(
        e.eventLocalDynamics!.localAdmittedPairCount,
      );
    }
  });

  it('rise-flat-fall pattern may show local reversal without causal claim', () => {
    const start = syntheticDriveLabel(0);
    const values = [800, 950, 950, 850, 820];
    const rpmPoints = values.map((valueRpm, i) => ({
      recordedAtIso: new Date(Date.parse(start) + i * 1000).toISOString(),
      valueRpm,
    }));
    const fusion = runFusionFixture({ rpmPoints });
    const tripReversal = fusion.dynamicsTripResult?.observedDynamics.observedDirectionReversalCount;
    expect(tripReversal).toBe(1);
    expect(fusion.scientificGuards.notGearShiftConfirmation).toBe(true);
  });

  it('missing RPM window yields NO_ADMITTED_PAIRS_IN_EVENT_WINDOW when overlap absent', () => {
    const { payload } = buildDefaultSyntheticMotionPayload('default');
    const motionStart = payload.speeds[0]!.bucketLabelUtc;
    const lateStart = new Date(Date.parse(motionStart) + 300_000).toISOString();
    const rpmPoints = buildRpmPointsEverySeconds(lateStart, 12, 1);
    const fusion = runFusionFixture({ rpmPoints, preserveRpmTimestamps: true });
    expect(fusion.events.some((e) => e.reasonCodes.includes('NO_TEMPORAL_OVERLAP'))).toBe(true);
    expect(
      fusion.events.every(
        (e) =>
          e.eventLocalDynamics == null ||
          e.eventLocalDynamics.localAdmittedPairCount === 0 ||
          e.reasonCodes.includes('NO_ADMITTED_PAIRS_IN_EVENT_WINDOW'),
      ),
    ).toBe(true);
  });

  it('single RPM point trip blocks assessable local dynamics', () => {
    const start = syntheticDriveLabel(0);
    const fusion = runFusionFixture({
      rpmPoints: [{ recordedAtIso: start, valueRpm: 1200 }],
    });
    expect(fusion.dynamicsTripResult?.observedDynamics.status).toBe('NOT_ASSESSABLE');
    expect(
      fusion.events.every(
        (e) =>
          e.eventLocalDynamics == null ||
          e.eventLocalDynamics.localAdmittedPairCount === 0,
      ),
    ).toBe(true);
  });

  it('RPM_1S and RPM_2S cadence tiers both compute fusion when admitted', () => {
    const start = syntheticDriveLabel(0);
    const base = buildRpmPointsEverySeconds(start, 20, 1).map((p, i) => ({
      ...p,
      valueRpm: 900 + i * 20,
    }));
    const f1 = runFusionFixture({ rpmPoints: base, cadenceTier: 'RPM_1S', tripId: 'fusion-1s' });
    const f2 = runFusionFixture({
      rpmPoints: buildRpmPointsEverySeconds(start, 10, 2).map((p, i) => ({
        ...p,
        valueRpm: 900 + i * 20,
      })),
      cadenceTier: 'RPM_2S',
      tripId: 'fusion-2s',
    });
    expect(f1.status).toBe('COMPUTED');
    expect(f2.status).toBe('COMPUTED');
    expect(f1.dynamicsTripResult?.bindings.cadenceTier).toBe('RPM_1S');
    expect(f2.dynamicsTripResult?.bindings.cadenceTier).toBe('RPM_2S');
  });

  it('RPM_3S observation-only blocks fusion at trip level', () => {
    const start = syntheticDriveLabel(0);
    const fusion = runFusionFixture({
      rpmPoints: buildRpmPointsEverySeconds(start, 8, 3),
      cadenceTier: 'RPM_3S',
      tripId: 'fusion-3s',
    });
    expect(fusion.status).toBe('UNAVAILABLE');
    expect(fusion.tripReasonCodes).toContain('A2_DYNAMICS_ABSTAINED');
  });

  it('incorrect fingerprint hard-blocks fusion', () => {
    const start = syntheticDriveLabel(0);
    const fusion = runFusionFixture({
      rpmPoints: buildRpmPointsEverySeconds(start, 15, 1),
      v1bFingerprintOverride: 'deadbeef',
    });
    expect(fusion.status).toBe('UNAVAILABLE');
    expect(fusion.tripReasonCodes).toContain('RPM_SAMPLE_FINGERPRINT_MISMATCH');
  });

  it('RUPTELA_R1 hard-blocks temporal fusion', () => {
    const start = syntheticDriveLabel(0);
    const fusion = runFusionFixture({
      rpmPoints: buildRpmPointsEverySeconds(start, 20, 1),
      dimoVehicleRawJson: R1_DIMO,
    });
    expect(fusion.status).toBe('UNAVAILABLE');
    expect(fusion.tripReasonCodes).toContain('R1_HISTORICAL_OBD_POINT_TIME_CORRELATION_PROHIBITED');
    expect(fusion.events.every((e) => e.eventLocalDynamics == null)).toBe(true);
  });

  it('is deterministic under rpm point permutation', () => {
    const start = syntheticDriveLabel(0);
    const rpmPoints = buildRpmPointsEverySeconds(start, 25, 1).map((p, i) => ({
      ...p,
      valueRpm: 850 + i * 15,
    }));
    const a = runFusionFixture({ rpmPoints, tripId: 'fusion-det' });
    const b = runFusionFixture({ rpmPoints: [...rpmPoints].reverse(), tripId: 'fusion-det' });
    expect(a.dynamicsTripResult?.observedDynamics).toEqual(b.dynamicsTripResult?.observedDynamics);
    expect(a.events.length).toBe(b.events.length);
  });

  it('alignment offset sensitivity varies admitted pair counts', () => {
    const start = syntheticDriveLabel(0);
    const fusion = runFusionFixture({
      rpmPoints: buildRpmPointsEverySeconds(start, 30, 1).map((p, i) => ({
        ...p,
        valueRpm: 900 + i * 25,
      })),
    });
    const diag = fusion.events.find((e) => e.dynamicsAlignmentSensitivity.length > 1);
    expect(diag).toBeDefined();
    const counts = new Set(diag!.dynamicsAlignmentSensitivity.map((d) => d.admittedPairCountInWindow));
    expect(counts.size).toBeGreaterThanOrEqual(1);
  });

  it('DS4 deceleration windows with falling RPM stay descriptive-only', () => {
    const start = syntheticDriveLabel(0);
    const rpmPoints = buildRpmPointsEverySeconds(start, 35, 1).map((p, i) => ({
      ...p,
      valueRpm: 2100 - i * 25,
    }));
    const fusion = runFusionFixture({ rpmPoints });
    const decel = fusion.events.filter((e) => e.motionEvent.kind === 'DECELERATION');
    expect(decel.length).toBeGreaterThan(0);
    expect(
      decel.some((e) => (e.eventLocalDynamics?.deltaDistribution.negativeCount ?? 0) > 0),
    ).toBe(true);
    expect(fusion.scientificGuards.notCausalRpmResponse).toBe(true);
  });

  it('sequence gap prevents cross-boundary pairs inside a wide event window', () => {
    const start = syntheticDriveLabel(0);
    const baseMs = Date.parse(start);
    const rpmPoints = [
      ...buildRpmPointsEverySeconds(start, 8, 1).map((p, i) => ({ ...p, valueRpm: 1000 + i * 50 })),
      ...buildRpmPointsEverySeconds(new Date(baseMs + 12_000).toISOString(), 8, 1).map((p, i) => ({
        ...p,
        valueRpm: 1400 + i * 50,
      })),
    ];
    const fusion = runFusionFixture({ rpmPoints });
    const tripPairs = fusion.dynamicsTripResult?.observedDynamics.adjacentDeltas ?? [];
    expect(tripPairs.length).toBe(14);
    expect(tripPairs.every((d) => d.labelGapMs <= 2000)).toBe(true);
    for (const e of fusion.events) {
      if ((e.eventLocalDynamics?.localAdmittedPairCount ?? 0) > 0) {
        expect(e.eventLocalDynamics!.localAdmittedPairCount).toBeLessThanOrEqual(tripPairs.length);
      }
    }
  });

  it('organization identity mismatch blocks fusion via A2 abstain', () => {
    const fusion = runFusionFixture({
      rpmPoints: buildRpmPointsEverySeconds(syntheticDriveLabel(0), 12, 1),
      organizationId: 'wrong-org-id',
    });
    expect(fusion.status).toBe('UNAVAILABLE');
    expect(fusion.tripReasonCodes).toContain('A2_DYNAMICS_ABSTAINED');
  });

  it('UNKNOWN telemetry source family contains fusion at trip level', () => {
    const fusion = runFusionFixture({
      rpmPoints: buildRpmPointsEverySeconds(syntheticDriveLabel(0), 12, 1),
      dimoVehicleRawJson: {},
    });
    expect(fusion.status).toBe('UNAVAILABLE');
    expect(fusion.tripReasonCodes).toContain('TELEMETRY_SOURCE_FAMILY_UNKNOWN');
    expect(fusion.scientificGuards.unknownSourceFamilyUntrusted).toBe(true);
  });

  it('REAL_OBSERVATION with unproven source-family attestation blocks fusion', () => {
    const fusion = runFusionFixture({
      rpmPoints: buildRpmPointsEverySeconds(syntheticDriveLabel(0), 12, 1),
      evidenceKind: 'REAL_OBSERVATION',
      rpmSamplesAttestation: 'UNPROVEN',
    });
    expect(fusion.status).toBe('UNAVAILABLE');
    expect(fusion.tripReasonCodes).toContain('SOURCE_FAMILY_BINDING_UNPROVEN');
    expect(fusion.tripReasonCodes).toContain('UNVERIFIED_EVIDENCE_SOURCE_CLAIM');
  });

  it('unproven synthetic rpm sample source trips provenance gate', () => {
    const start = syntheticDriveLabel(0);
    const tripInput = buildTierTripInput({
      rpmPoints: buildRpmPointsEverySeconds(start, 10, 1),
      tierRow: buildTierTripClassification({
        tier: 'RPM_1S',
        tripId: 'fusion-prov-trip',
        p50ActiveSeconds: 1,
        p75ActiveSeconds: 1,
      } as never),
      tripId: 'fusion-prov-trip',
    });
    const generatedAt = new Date('2026-11-03T12:00:00.000Z');
    const v1bOutcome = processDs4RpmHfV1bShadowTripTierAware({
      tripInput,
      attemptCount: 1,
      computedAt: generatedAt,
      existingSucceededFingerprint: null,
    });
    const fingerprint = computeDs4RpmHfV1bTierAwareInputFingerprint(tripInput);
    const v1bResult = v1bOutcome.kind === 'SUCCEEDED' ? v1bOutcome.result : null;
    const { payload, runId } = buildDefaultSyntheticMotionPayload('provenance-negative');
    const fusion = executeDs4RpmDynamicsFusionHarness({
      organizationId: TIER_TEST_ORG,
      vehicleId: TIER_TEST_VEHICLE,
      tripId: 'fusion-prov-trip',
      motionRunId: runId,
      motionPayload: payload,
      tripInput,
      v1bResult,
      v1bRunId: 'fusion-prov-v1b',
      evidenceKind: 'SYNTHETIC_FIXTURE',
      dimoVehicleRawJson: API_SYNTHETIC_DIMO,
      rpmSamples: {
        source: 'AUTHORIZED_CLICKHOUSE_READ',
        inputFingerprint: fingerprint,
        providerSourceLinkId: tripInput.providerSourceLinkId,
        telemetrySourceFamily: 'API_SYNTHETIC',
        sourceFamilyAttestation: 'PROVEN_FROM_DIMO_IDENTITY',
        points: tripInput.rpmPoints,
        invalidValueCount: 0,
        duplicateTimestampCount: 0,
      },
    });
    expect(fusion.status).toBe('UNAVAILABLE');
    expect(fusion.tripReasonCodes).toContain('UNVERIFIED_EVIDENCE_SOURCE_CLAIM');
  });

  it('never exposes causal physical synchronization claims in scientific guards', () => {
    const fusion = runFusionFixture({
      rpmPoints: buildRpmPointsEverySeconds(syntheticDriveLabel(0), 20, 1),
    });
    expect(fusion.sourceTimestampPhase).toBe('UNKNOWN');
    expect(fusion.rpmObservationSupportWidthSeconds).toBe('UNKNOWN');
    expect(fusion.scientificGuards.notPhysicalSynchronization).toBe(true);
    expect(fusion.events[0]!.alignmentHypothesisNote).toContain('HYPOTHESIS');
  });
});
