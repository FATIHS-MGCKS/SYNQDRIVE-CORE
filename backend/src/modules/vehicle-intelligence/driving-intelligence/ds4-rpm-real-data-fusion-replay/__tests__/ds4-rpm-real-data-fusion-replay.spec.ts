import { processDs4RpmHfV1bShadowTripTierAware } from '../../rpm-hf-v1b/ds4-rpm-hf-v1b-tier-processor';
import {
  buildRpmPointsEverySeconds,
  buildTierTripClassification,
  buildTierTripInput,
  TIER_TEST_LINK,
  TIER_TEST_ORG,
  TIER_TEST_TRIP,
  TIER_TEST_VEHICLE,
} from '../../rpm-hf-v1b/__tests__/ds4-rpm-hf-v1b-tier-fixtures';
import { syntheticDriveLabel } from '../../motion-core-shadow-worker/di-v0-motion-core-shadow-synthetic-drive.harness-fixture';
import { buildDefaultSyntheticMotionPayload } from '../../ds4-rpm-shadow-correlation/ds4-rpm-shadow-correlation-harness.v1';
import { executeDs4RpmRealDataOfflineReplayTripV1 } from '../../ds4-rpm-real-data-replay/ds4-rpm-real-data-replay-executor.v1';
import type { Ds4RpmRealDataOfflineInputBundleV1 } from '../../ds4-rpm-real-data-replay/ds4-rpm-real-data-replay.contract.v1';
import { DS4_RPM_REAL_DATA_REPLAY_EXECUTOR_CONTRACT_VERSION } from '../../ds4-rpm-real-data-replay/ds4-rpm-real-data-replay.contract.v1';
import { SYNTHETIC_DIMO_RAW_JSON } from '../../ds4-rpm-real-data-replay/__tests__/ds4-rpm-real-data-replay-fixtures.harness';
import {
  buildCadenceMismatchBundle,
  buildCrossTenantBundle,
  buildMissingRpmWindowBundle,
  buildR1BlockedBundle,
  buildSyntheticApiBundleValid,
  buildUnknownSourceBundle,
  buildWrongSourceLinkBundle,
} from '../../ds4-rpm-real-data-replay/__tests__/ds4-rpm-real-data-replay-fixtures.harness';
import { executeDs4RpmRealDataFusionOfflineReplayV1 } from '../ds4-rpm-real-data-fusion-replay-orchestrator.v1';

const CODE_SHA = 'test-sha-ds4-rpm-real-data-fusion-replay-p2d2a';
const GENERATED_AT = new Date('2026-11-04T08:00:00.000Z');

function buildTierOfflineBundle(tier: 'RPM_1S' | 'RPM_2S' | 'RPM_3S', stepSeconds: number): Ds4RpmRealDataOfflineInputBundleV1 {
  const scenario = `p2d2a-tier-${tier}`;
  const { payload, runId } = buildDefaultSyntheticMotionPayload(scenario);
  const motionStart = payload.speeds[0]?.bucketLabelUtc ?? syntheticDriveLabel(0);
  const tripStartIso = motionStart;
  const tripEndIso = syntheticDriveLabel(34);
  const tripInput = {
    ...buildTierTripInput({
      rpmPoints: buildRpmPointsEverySeconds(tripStartIso, 30, stepSeconds),
      tierRow: buildTierTripClassification({ tier }),
      providerSourceLinkId: TIER_TEST_LINK,
      tripId: `${TIER_TEST_TRIP}-${tier}`,
    }),
    tripStartIso,
    tripEndIso,
    organizationId: TIER_TEST_ORG,
    vehicleId: TIER_TEST_VEHICLE,
  };
  const v1bOutcome = processDs4RpmHfV1bShadowTripTierAware({
    tripInput,
    attemptCount: 1,
    computedAt: GENERATED_AT,
    existingSucceededFingerprint: null,
  });
  const v1bResult = v1bOutcome.kind === 'SUCCEEDED' ? v1bOutcome.result : null;
  return {
    contractVersion: DS4_RPM_REAL_DATA_REPLAY_EXECUTOR_CONTRACT_VERSION,
    executionBoundary: 'OFFLINE_INJECTED_BUNDLE_ONLY',
    ownerAuthorizedProductionExecutionDeclared: false,
    bundleId: `fixture-${tier.toLowerCase()}`,
    cohortVehicleLabel: 'VW_ARTEON',
    organizationId: TIER_TEST_ORG,
    vehicleId: TIER_TEST_VEHICLE,
    tripId: `${TIER_TEST_TRIP}-${tier}`,
    providerSourceLinkId: TIER_TEST_LINK,
    dimoVehicleRawJson: SYNTHETIC_DIMO_RAW_JSON,
    dimoQueryFromIso: tripStartIso,
    dimoQueryToIso: tripEndIso,
    dimoBucketIntervalSeconds: 1,
    speedCoBucketedWithRpm: true,
    motionRunId: runId,
    motionPayload: payload,
    tripInput,
    v1bRunId: `fixture-v1b-${tier}`,
    v1bResult,
    canSpeedObservations: [],
    scenarioLabel: `P2D2A_${tier}`,
  };
}

describe('ds4-rpm-real-data-fusion-replay orchestrator v1 (offline injected only)', () => {
  it('admits offline synthetic bundle with fusion computed and source attestation unproven', () => {
    const artifact = executeDs4RpmRealDataFusionOfflineReplayV1(buildSyntheticApiBundleValid(GENERATED_AT), {
      codeSha: CODE_SHA,
      generatedAt: GENERATED_AT,
    });
    expect(artifact.outcomeLabels).toContain('RESEARCH_REPLAY_EXECUTED');
    expect(artifact.outcomeLabels).toContain('SOURCE_NOT_ATTESTED');
    expect(artifact.outcomeLabels).toContain('TEMPORAL_ALIGNMENT_UNVERIFIED');
    expect(artifact.sourceAttestationVerdict).toBe('SOURCE_NOT_ATTESTED');
    expect(artifact.fusionResult?.status).toBe('COMPUTED');
    expect(artifact.researchReplayStatus).toBe('EXECUTED');
    expect(artifact.syntheticFusionStatus).toBe('COMPUTED');
    expect(artifact.realObservationStatus.realObservationFusionAuthorized).toBe(false);
    expect(artifact.realObservationStatus.authorizationStatus).toBe('BLOCKED_BY_ATTESTATION');
    expect(artifact.realObservationStatus.blockingReasonCodes).toContain(
      'SYNTHETIC_RESEARCH_COMPUTED_DOES_NOT_AUTHORIZE_REAL_OBSERVATION',
    );
    expect(artifact.realObservationStatus.shadowProhibitionEffective).toBe(true);
  });

  it('reports missing independent source attestation dimensions', () => {
    const artifact = executeDs4RpmRealDataFusionOfflineReplayV1(buildSyntheticApiBundleValid(GENERATED_AT), {
      codeSha: CODE_SHA,
      generatedAt: GENERATED_AT,
    });
    expect(artifact.sourceAttestationVerdict).toBe('SOURCE_NOT_ATTESTED');
    const correlationRow = artifact.completenessMatrix.find((r) => r.dimension === 'CORRELATION_ELIGIBLE');
    expect([
      'OWNER_AUTHORIZED_READ_CONTEXT_MISSING',
      'INJECTED_FIXTURE_NOT_PRODUCTION_ATTESTATION',
      'EVENT_LOCAL_CADENCE_NOT_DEFENSIBLE',
    ]).toContain(correlationRow?.reasonCode);
  });

  it('hard-blocks R1 at fusion and r1 containment', () => {
    const artifact = executeDs4RpmRealDataFusionOfflineReplayV1(buildR1BlockedBundle(GENERATED_AT), {
      codeSha: CODE_SHA,
      generatedAt: GENERATED_AT,
    });
    expect(artifact.r1Containment.r1VetoActive).toBe(true);
    expect(artifact.outcomeLabels).toContain('FUSION_NOT_AUTHORIZED');
    expect(artifact.fusionResult).toBeNull();
    expect(artifact.blockingReasons).toEqual(
      expect.arrayContaining(['R1_HISTORICAL_OBD_POINT_TIME_CORRELATION_PROHIBITED']),
    );
  });

  it('blocks unknown telemetry source before shadow replay', () => {
    const artifact = executeDs4RpmRealDataFusionOfflineReplayV1(buildUnknownSourceBundle(GENERATED_AT), {
      codeSha: CODE_SHA,
      generatedAt: GENERATED_AT,
    });
    expect(artifact.shadowReplay.shadowTripReport).toBeNull();
    expect(artifact.fusionResult).toBeNull();
    expect(artifact.blockingReasons).toContain('TELEMETRY_SOURCE_FAMILY_UNKNOWN');
  });

  it('rejects mismatched org/link identity binding', () => {
    for (const bundle of [buildCrossTenantBundle(GENERATED_AT), buildWrongSourceLinkBundle(GENERATED_AT)]) {
      const artifact = executeDs4RpmRealDataFusionOfflineReplayV1(bundle, {
        codeSha: CODE_SHA,
        generatedAt: GENERATED_AT,
      });
      expect(artifact.fusionResult).toBeNull();
      expect(artifact.missingEvidenceInventory.length).toBeGreaterThan(0);
    }
  });

  it('rejects modified RPM fingerprint vs sealed v1b result', () => {
    const bundle = buildSyntheticApiBundleValid(GENERATED_AT);
    const tampered = {
      ...bundle,
      tripInput: {
        ...bundle.tripInput,
        rpmPoints: bundle.tripInput.rpmPoints.map((p, i) =>
          i === 0 ? { ...p, valueRpm: p.valueRpm + 77 } : p,
        ),
      },
    };
    const artifact = executeDs4RpmRealDataFusionOfflineReplayV1(tampered, {
      codeSha: CODE_SHA,
      generatedAt: GENERATED_AT,
    });
    expect(artifact.syntheticFusionStatus).toBe('UNAVAILABLE');
    expect(artifact.fusionResult?.status).toBe('UNAVAILABLE');
  });

  it('handles incomplete RPM coverage without claiming field accuracy', () => {
    const artifact = executeDs4RpmRealDataFusionOfflineReplayV1(buildMissingRpmWindowBundle(GENERATED_AT), {
      codeSha: CODE_SHA,
      generatedAt: GENERATED_AT,
    });
    expect(artifact.outcomeLabels).toContain('RESEARCH_REPLAY_EXECUTED');
    expect(artifact.fusionEligibility.ds4EventCoverage.fusionComputedEventCount).toBe(0);
  });

  it('computes fusion for RPM_1S and RPM_2S synthetic tiers', () => {
    for (const tier of ['RPM_1S', 'RPM_2S'] as const) {
      const bundle = buildTierOfflineBundle(tier, tier === 'RPM_1S' ? 1 : 2);
      const artifact = executeDs4RpmRealDataFusionOfflineReplayV1(bundle, {
        codeSha: CODE_SHA,
        generatedAt: GENERATED_AT,
      });
      expect(artifact.fusionResult?.status).toBe('COMPUTED');
      expect(artifact.fusionResult?.dynamicsTripResult?.bindings.cadenceTier).toBe(tier);
    }
  });

  it('runs RPM_3S observation path without claiming full event-local coverage', () => {
    const bundle = buildTierOfflineBundle('RPM_3S', 3);
    const artifact = executeDs4RpmRealDataFusionOfflineReplayV1(bundle, {
      codeSha: CODE_SHA,
      generatedAt: GENERATED_AT,
    });
    expect(artifact.outcomeLabels).toContain('RESEARCH_REPLAY_EXECUTED');
    expect(artifact.fusionResult).not.toBeNull();
    expect(artifact.alignmentDiagnostics.limitations).toContain('LABEL_TIME_HYPOTHESIS_NOT_PHYSICAL_SYNC');
  });

  it('blocks REAL_OBSERVATION fusion policy without re-labeling evidence', () => {
    const artifact = executeDs4RpmRealDataFusionOfflineReplayV1(buildSyntheticApiBundleValid(GENERATED_AT), {
      codeSha: CODE_SHA,
      generatedAt: GENERATED_AT,
      fusionEvidencePolicy: 'REAL_OBSERVATION_REQUESTED',
    });
    expect(artifact.outcomeLabels).toContain('FUSION_NOT_AUTHORIZED');
    expect(artifact.fusionResult).toBeNull();
    expect(artifact.realObservationStatus.realObservationFusionAuthorized).toBe(false);
    expect(artifact.realObservationStatus.authorizationStatus).toBe('BLOCKED_BY_POLICY');
    expect(artifact.realObservationStatus.blockingReasonCodes).toContain(
      'FUSION_SYNTHETIC_GATE_REJECTS_REAL_OBSERVATION',
    );
  });

  it('produces deterministic replay fingerprints', () => {
    const bundle = buildSyntheticApiBundleValid(GENERATED_AT);
    const a = executeDs4RpmRealDataFusionOfflineReplayV1(bundle, {
      codeSha: CODE_SHA,
      generatedAt: GENERATED_AT,
    });
    const b = executeDs4RpmRealDataFusionOfflineReplayV1(bundle, {
      codeSha: CODE_SHA,
      generatedAt: GENERATED_AT,
    });
    expect(a.deterministicArtifactFingerprint).toBe(b.deterministicArtifactFingerprint);
    expect(a.deterministicArtifactFingerprint).toHaveLength(64);
  });

  it('preserves shadow metric parity with standalone shadow replay executor', () => {
    const bundle = buildSyntheticApiBundleValid(GENERATED_AT);
    const fusionArtifact = executeDs4RpmRealDataFusionOfflineReplayV1(bundle, {
      codeSha: CODE_SHA,
      generatedAt: GENERATED_AT,
    });
    const shadowOnly = executeDs4RpmRealDataOfflineReplayTripV1(bundle, {
      codeSha: CODE_SHA,
      generatedAt: GENERATED_AT,
    });
    expect(fusionArtifact.shadowReplay.inputFingerprint).toBe(shadowOnly.inputFingerprint);
    expect(fusionArtifact.fusionResult).not.toBeNull();
    const shadowEvents = shadowOnly.shadowTripReport!.events;
    const fusionEvents = fusionArtifact.fusionResult!.events;
    expect(fusionEvents.length).toBe(shadowEvents.length);
    for (let i = 0; i < shadowEvents.length; i += 1) {
      expect(fusionEvents[i]!.shadowCorrelation.contextClassification).toBe(
        shadowEvents[i]!.contextClassification,
      );
      expect(fusionEvents[i]!.shadowCorrelation.descriptiveRpmStats).toEqual(
        shadowEvents[i]!.descriptiveRpmStats,
      );
    }
  });

  it('records cadence mismatch without silent downgrade', () => {
    const artifact = executeDs4RpmRealDataFusionOfflineReplayV1(buildCadenceMismatchBundle(GENERATED_AT), {
      codeSha: CODE_SHA,
      generatedAt: GENERATED_AT,
    });
    expect(artifact.outcomeLabels).toContain('RESEARCH_REPLAY_EXECUTED');
    expect(artifact.missingEvidenceInventory.length).toBeGreaterThan(0);
  });

  it('does not claim independent motion-run attestation on injected bundles', () => {
    const artifact = executeDs4RpmRealDataFusionOfflineReplayV1(buildSyntheticApiBundleValid(GENERATED_AT), {
      codeSha: CODE_SHA,
      generatedAt: GENERATED_AT,
    });
    expect(artifact.motionProvenance.persistedMotionRunAttestation).toBe('UNVERIFIED_INJECTED');
    expect(artifact.motionProvenance.externalMotionRunProvenanceDigest).toBeNull();
    expect(artifact.motionProvenance.offlineBundleIdentityBinding).toBe('CONSISTENT');
  });

  it('default injected bundle does not report event-local cadence PROVEN in attestation audit', () => {
    const artifact = executeDs4RpmRealDataFusionOfflineReplayV1(buildSyntheticApiBundleValid(GENERATED_AT), {
      codeSha: CODE_SHA,
      generatedAt: GENERATED_AT,
    });
    const cadenceRow = artifact.completenessMatrix.find((r) => r.dimension === 'EVENT_LOCAL_CADENCE_ASSESSABLE');
    expect(cadenceRow?.state).toBe('UNPROVEN');
    expect(cadenceRow?.reasonCode).toBe('EVENT_LOCAL_CADENCE_NOT_ASSESSED');
  });

  it('content fingerprint changes when code SHA changes', () => {
    const bundle = buildSyntheticApiBundleValid(GENERATED_AT);
    const a = executeDs4RpmRealDataFusionOfflineReplayV1(bundle, {
      codeSha: 'sha-alpha',
      generatedAt: GENERATED_AT,
    });
    const b = executeDs4RpmRealDataFusionOfflineReplayV1(bundle, {
      codeSha: 'sha-beta',
      generatedAt: GENERATED_AT,
    });
    expect(a.deterministicArtifactFingerprint).not.toBe(b.deterministicArtifactFingerprint);
  });

  it('content fingerprint changes when attestation dimension state changes', () => {
    const bundle = buildSyntheticApiBundleValid(GENERATED_AT);
    const baseline = executeDs4RpmRealDataFusionOfflineReplayV1(bundle, {
      codeSha: CODE_SHA,
      generatedAt: GENERATED_AT,
    });
    const tamperedBundle = {
      ...bundle,
      bundleId: 'bundle-id-changes-input-fingerprint',
    };
    const shifted = executeDs4RpmRealDataFusionOfflineReplayV1(tamperedBundle, {
      codeSha: CODE_SHA,
      generatedAt: GENERATED_AT,
    });
    expect(baseline.deterministicArtifactFingerprint).not.toBe(shifted.deterministicArtifactFingerprint);
  });
});
