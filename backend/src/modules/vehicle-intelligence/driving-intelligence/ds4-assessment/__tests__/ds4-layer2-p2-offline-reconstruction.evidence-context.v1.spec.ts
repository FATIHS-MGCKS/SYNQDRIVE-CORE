import {
  DI_V0_MOTION_CORE_SHADOW_EVENT_ROW_CONTRACT_V2_INTENSITY,
  DI_V0_MOTION_CORE_SHADOW_PERSISTENCE_CONTRACT_V2,
} from '../../motion-core-shadow-worker/di-v0-motion-core-shadow-event-row.contract';
import type { DiV0MotionCoreShadowPayloadV1 } from '../../motion-core-shadow-worker/di-v0-motion-core-shadow.types';
import { resolveDs4LongitudinalEvidenceQualityForLayer2V1 } from '../ds4-longitudinal-evidence-quality.v1';
import {
  buildDs4Layer2P2OfflineReconstructedRowV1,
  resolveDs4Layer2P2SparseChannelOutcomeFromMotionPayloadV1,
} from '../export/ds4-layer2-p2-offline-reconstruction.v1';
import { DS4_ASSESSMENT_CALIBRATION_COHORT_V1 } from '../ds4-assessment-calibration-cohort.v1';
import { DS4_LAYER2_P2_OFFLINE_PILOT_ORGANIZATION_ID_V1 } from '../export/ds4-layer2-p2-offline-reconstruction.cohort.v1';
import type { Ds4Layer2HistoricalExportMotionPinV1 } from '../export/ds4-layer2-historical-export.v1';

const ORG = DS4_LAYER2_P2_OFFLINE_PILOT_ORGANIZATION_ID_V1;
const TESLA_TRIP = 'b304e9ad-0dcb-4b69-a93e-5364078a20a1';
const TESLA_VEHICLE = DS4_ASSESSMENT_CALIBRATION_COHORT_V1.find(
  (v) => v.role === 'TESLA_MODEL_3_SOFTWARE_INTEGRATION',
)!.vehicleId;
const AUDI_VEHICLE = DS4_ASSESSMENT_CALIBRATION_COHORT_V1.find((v) => v.role === 'AUDI_A4_R1')!.vehicleId;
const AUDI_TRIP = 'ba66e2ad-a824-4944-83c9-4472a5508e82';

function admissibleIntensity() {
  return {
    meanAccelMps2: 1.85,
    durationS: 3,
    steps: 3,
    coverageRatio: 1,
    startUncertaintyS: '±1s',
    endUncertaintyS: '±1s',
  };
}

function basePayload(speedAuthority: 'C4_ONLY' | 'C5_1_PREFERRED'): DiV0MotionCoreShadowPayloadV1 {
  const fsmLabels = [
    { bucketLabelUtc: '2026-01-01T10:00:00Z', state: 'MOVING' as const, evidenceQuality: 'DIRECT' as const, reason: 'r', flags: [] },
    { bucketLabelUtc: '2026-01-01T10:00:01Z', state: 'MOVING' as const, evidenceQuality: 'DIRECT' as const, reason: 'r', flags: [] },
    { bucketLabelUtc: '2026-01-01T10:00:02Z', state: 'MOVING' as const, evidenceQuality: 'DIRECT' as const, reason: 'r', flags: [] },
    { bucketLabelUtc: '2026-01-01T10:00:03Z', state: 'MOVING' as const, evidenceQuality: 'DIRECT' as const, reason: 'r', flags: [] },
  ];
  const speeds = fsmLabels.map((l) => ({
    bucketLabelUtc: l.bucketLabelUtc,
    speedKmh: 36,
    quality: 'OK' as const,
    estimator: speedAuthority === 'C5_1_PREFERRED' ? 'C5_1' : 'C4',
    flags: [] as string[],
    support: [] as string[],
  }));
  return {
    contract: {
      algorithmVersions: {
        c4: 'c4',
        c5_1: speedAuthority === 'C5_1_PREFERRED' ? 'c5' : null,
        c5_1ProductionSafety: speedAuthority === 'C5_1_PREFERRED' ? 'safe' : null,
        c5_1AlgorithmFileSha256: speedAuthority === 'C5_1_PREFERRED' ? 'sha' : null,
        fsm: 'fsm',
        gapBridgeV1: null,
        fsmAuxBinding: null,
        events: 'ev',
        bundle: 'b1',
      },
      speedAuthority,
      persistence: DI_V0_MOTION_CORE_SHADOW_PERSISTENCE_CONTRACT_V2,
      timeSemantics: {
        processingMode: 'POST_TRIP_RETROSPECTIVE',
        c4ValueSupportForwardS: 1,
        c4FullFinalizationForwardS: 1,
        fsmMode: 'RETROSPECTIVE',
        eventFinalizationNote: 'test',
        computedAtUtc: '2026-01-01T00:00:00.000Z',
      },
      sparse: {
        channelOutcome: speedAuthority === 'C5_1_PREFERRED' ? 'NOT_APPLICABLE' : 'PRESENT',
        comparable: speedAuthority !== 'C5_1_PREFERRED',
        sampleCount: speedAuthority === 'C5_1_PREFERRED' ? 0 : 1,
        samples: [],
        limitations: [],
      },
      comparisonHints: {
        artefactSuspectExcludedFromAcceptedManoeuvreCounts: true,
        inferredNeverPromotedToDirect: true,
        unknownNotCountedAsConfirmedStandstill: true,
      },
    },
    speeds,
    fsmLabels,
    stopEpisodes: [],
    events: [
      {
        kind: 'ACCELERATION',
        startLabel: '2026-01-01T10:00:00Z',
        endLabel: '2026-01-01T10:00:03Z',
        startSpeedKmh: 10,
        endSpeedKmh: 30,
        deltaKmh: 20,
        quality: 'OK',
        flags: [],
        intensity: admissibleIntensity(),
      },
    ],
    summary: {
      labelCount: 4,
      speedNumericCount: 4,
      eventCount: 1,
      eventAcceptedCount: 1,
      eventArtefactSuspectCount: 0,
      stopEpisodeCount: 0,
      eventRowContract: DI_V0_MOTION_CORE_SHADOW_EVENT_ROW_CONTRACT_V2_INTENSITY,
    },
  } as DiV0MotionCoreShadowPayloadV1;
}

describe('DS4 Layer-2 P2 evidence context (source-family aware)', () => {
  it('reads sparse channelOutcome from motion payload (same as persisted assessment.evidenceQuality)', () => {
    const r1Payload = basePayload('C4_ONLY');
    expect(resolveDs4Layer2P2SparseChannelOutcomeFromMotionPayloadV1(r1Payload)).toBe('PRESENT');
    const teslaPayload = basePayload('C5_1_PREFERRED');
    expect(resolveDs4Layer2P2SparseChannelOutcomeFromMotionPayloadV1(teslaPayload)).toBe('NOT_APPLICABLE');
  });

  it('RUPTELA_R1: Layer-2 gate uses sparse PRESENT without synthesis', () => {
    const sparse = 'PRESENT';
    const resolution = resolveDs4LongitudinalEvidenceQualityForLayer2V1({
      assessmentEvidenceQuality: sparse,
      speedAuthority: 'C4_ONLY',
      eventSummaries: buildDs4Layer2P2OfflineReconstructedRowV1({
        organizationId: ORG,
        vehicleId: AUDI_VEHICLE,
        tripId: AUDI_TRIP,
        sourceFamily: 'RUPTELA_R1',
        motionPin: motionPin(AUDI_VEHICLE, AUDI_TRIP, 'RUPTELA_R1'),
        payload: basePayload('C4_ONLY'),
        evidenceQualityContext: null,
        evaluationCodeSha: 'c'.repeat(40),
        reconstructedAt: new Date('2026-10-30T15:00:00.000Z'),
        expectedSpeedAuthority: 'C4_ONLY',
      }).eventSummariesJson as never,
      context: { sourceFamily: 'RUPTELA_R1', sparseChannelOutcome: sparse },
    });
    expect(resolution.layer2EvidenceQualityInput).toBe('PRESENT');
    expect(resolution.sparseChannelOutcomeUnmodified).toBe('PRESENT');
  });

  it('API_SYNTHETIC: NOT_APPLICABLE sparse with POSITION present passes without R1 channel', () => {
    const payload = basePayload('C5_1_PREFERRED');
    const sparse = resolveDs4Layer2P2SparseChannelOutcomeFromMotionPayloadV1(payload);
    const row = buildDs4Layer2P2OfflineReconstructedRowV1({
      organizationId: ORG,
      vehicleId: TESLA_VEHICLE,
      tripId: TESLA_TRIP,
      sourceFamily: 'API_SYNTHETIC',
      motionPin: motionPin(TESLA_VEHICLE, TESLA_TRIP, 'API_SYNTHETIC'),
      payload,
      evidenceQualityContext: {
        sourceFamily: 'API_SYNTHETIC',
        sparseChannelOutcome: sparse,
        channelManifest: [{ channel: 'POSITION', outcome: 'PRESENT' }],
      },
      evaluationCodeSha: 'd'.repeat(40),
      reconstructedAt: new Date('2026-10-30T15:00:00.000Z'),
      expectedSpeedAuthority: 'C5_1_PREFERRED',
    });
    expect(sparse).toBe('NOT_APPLICABLE');
    expect(row.evidenceQuality).toBe('NOT_APPLICABLE');
    expect(row.longitudinalLoad.reasonCodes).toEqual([]);
  });

  it('API_SYNTHETIC: does not upgrade sparse to PRESENT when loader would pass null', () => {
    const payload = basePayload('C5_1_PREFERRED');
    const sparse = resolveDs4Layer2P2SparseChannelOutcomeFromMotionPayloadV1(payload);
    const resolution = resolveDs4LongitudinalEvidenceQualityForLayer2V1({
      assessmentEvidenceQuality: sparse,
      speedAuthority: 'C5_1_PREFERRED',
      eventSummaries: buildDs4Layer2P2OfflineReconstructedRowV1({
        organizationId: ORG,
        vehicleId: TESLA_VEHICLE,
        tripId: TESLA_TRIP,
        sourceFamily: 'API_SYNTHETIC',
        motionPin: motionPin(TESLA_VEHICLE, TESLA_TRIP, 'API_SYNTHETIC'),
        payload,
        evidenceQualityContext: {
          sourceFamily: 'API_SYNTHETIC',
          sparseChannelOutcome: sparse,
          channelManifest: [{ channel: 'POSITION', outcome: 'PRESENT' }],
        },
        evaluationCodeSha: 'e'.repeat(40),
        reconstructedAt: new Date('2026-10-30T15:00:00.000Z'),
        expectedSpeedAuthority: 'C5_1_PREFERRED',
      }).eventSummariesJson as never,
      context: {
        sourceFamily: 'API_SYNTHETIC',
        sparseChannelOutcome: sparse,
        channelManifest: [{ channel: 'POSITION', outcome: 'PRESENT' }],
      },
    });
    expect(resolution.sparseChannelOutcomeUnmodified).toBe('NOT_APPLICABLE');
    expect(resolution.layer2EvidenceQualityInput).toBe('PRESENT');
  });
});

function motionPin(
  vehicleId: string,
  tripId: string,
  sourceFamily: 'RUPTELA_R1' | 'API_SYNTHETIC',
): Ds4Layer2HistoricalExportMotionPinV1 {
  return {
    motionRunId: 'motion-run-evidence',
    organizationId: ORG,
    vehicleId,
    tripId,
    pinnedSnapshotHash: 'DI_V0_S4_EVIDENCE_V1:sha256:test',
    combinedInputIdentity: 'DI_V0_COMBINED_INPUT_IDENTITY_V0_3:sha256:test',
    shadowBundleVersion: 'bundle-v2',
    contentFingerprint: 'content-fp-evidence',
    workItemId: 'work-item-evidence',
    sourceFamily,
  };
}
