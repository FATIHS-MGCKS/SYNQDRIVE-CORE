import {
  DI_V0_MOTION_CORE_SHADOW_EVENT_ROW_CONTRACT_V2_INTENSITY,
  DI_V0_MOTION_CORE_SHADOW_PERSISTENCE_CONTRACT_V2,
} from '../../motion-core-shadow-worker/di-v0-motion-core-shadow-event-row.contract';
import type { DiV0MotionCoreShadowPayloadV1 } from '../../motion-core-shadow-worker/di-v0-motion-core-shadow.types';
import {
  assertDs4Layer2P2EventReconciliationV1,
  buildDs4Layer2P2OfflineReconstructedRowV1,
  evaluateDs4Layer2P2MotionRevisionCandidateV1,
} from '../export/ds4-layer2-p2-offline-reconstruction.v1';
import { DS4_LAYER2_P2_OFFLINE_PILOT_ORGANIZATION_ID_V1 } from '../export/ds4-layer2-p2-offline-reconstruction.cohort.v1';
import type { Ds4Layer2HistoricalExportMotionPinV1 } from '../export/ds4-layer2-historical-export.v1';
import { gzipSync } from 'zlib';

import { DS4_ASSESSMENT_CALIBRATION_COHORT_V1 } from '../ds4-assessment-calibration-cohort.v1';

const ORG = DS4_LAYER2_P2_OFFLINE_PILOT_ORGANIZATION_ID_V1;
const TRIP = 'ba66e2ad-a824-4944-83c9-4472a5508e82';
const VEHICLE = DS4_ASSESSMENT_CALIBRATION_COHORT_V1.find((v) => v.role === 'AUDI_A4_R1')!.vehicleId;

function admissibleIntensity(overrides: Partial<{ meanAccelMps2: number; durationS: number; steps: number }> = {}) {
  return {
    meanAccelMps2: 1.85,
    durationS: 3,
    steps: 3,
    coverageRatio: 1,
    startUncertaintyS: '±1s',
    endUncertaintyS: '±1s',
    ...overrides,
  };
}

function syntheticPayload(): DiV0MotionCoreShadowPayloadV1 {
  const fsmLabels = [
    { bucketLabelUtc: '2026-01-01T10:00:00Z', state: 'MOVING' as const, evidenceQuality: 'DIRECT' as const, reason: 'r', flags: [] },
    { bucketLabelUtc: '2026-01-01T10:00:01Z', state: 'MOVING' as const, evidenceQuality: 'DIRECT' as const, reason: 'r', flags: [] },
    { bucketLabelUtc: '2026-01-01T10:00:02Z', state: 'MOVING' as const, evidenceQuality: 'DIRECT' as const, reason: 'r', flags: [] },
    { bucketLabelUtc: '2026-01-01T10:00:03Z', state: 'MOVING' as const, evidenceQuality: 'DIRECT' as const, reason: 'r', flags: [] },
  ];
  const speeds = [
    { bucketLabelUtc: '2026-01-01T10:00:00Z', speedKmh: 36, quality: 'OK' as const, estimator: 'C4', flags: [], support: [] },
    { bucketLabelUtc: '2026-01-01T10:00:01Z', speedKmh: 36, quality: 'OK' as const, estimator: 'C4', flags: [], support: [] },
    { bucketLabelUtc: '2026-01-01T10:00:02Z', speedKmh: 36, quality: 'OK' as const, estimator: 'C4', flags: [], support: [] },
    { bucketLabelUtc: '2026-01-01T10:00:03Z', speedKmh: 36, quality: 'OK' as const, estimator: 'C4', flags: [], support: [] },
  ];
  return {
    contract: {
      algorithmVersions: { c4: 'c4', c5_1: null, c5_1ProductionSafety: null, c5_1AlgorithmFileSha256: null, fsm: 'fsm', gapBridgeV1: null, fsmAuxBinding: null, events: 'ev', bundle: 'b1' },
      speedAuthority: 'C4_ONLY',
      persistence: DI_V0_MOTION_CORE_SHADOW_PERSISTENCE_CONTRACT_V2,
      timeSemantics: {
        processingMode: 'POST_TRIP_RETROSPECTIVE',
        c4ValueSupportForwardS: 1,
        c4FullFinalizationForwardS: 1,
        fsmMode: 'RETROSPECTIVE',
        eventFinalizationNote: 'test',
        computedAtUtc: '2026-01-01T00:00:00.000Z',
      },
      sparse: { channelOutcome: 'PRESENT', comparable: true, sampleCount: 1, samples: [], limitations: [] },
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
      {
        kind: 'DECELERATION',
        startLabel: '2026-01-01T10:00:04Z',
        endLabel: '2026-01-01T10:00:05Z',
        startSpeedKmh: 30,
        endSpeedKmh: 26,
        deltaKmh: -4,
        quality: 'OK',
        flags: [],
        intensity: admissibleIntensity({ meanAccelMps2: 1.1, durationS: 2, steps: 2 }),
      },
    ],
    summary: {
      labelCount: 4,
      speedNumericCount: 4,
      eventCount: 2,
      eventAcceptedCount: 2,
      eventArtefactSuspectCount: 0,
      stopEpisodeCount: 0,
      eventRowContract: DI_V0_MOTION_CORE_SHADOW_EVENT_ROW_CONTRACT_V2_INTENSITY,
    },
  } as DiV0MotionCoreShadowPayloadV1;
}

function motionPin(): Ds4Layer2HistoricalExportMotionPinV1 {
  return {
    motionRunId: 'motion-run-1',
    organizationId: ORG,
    vehicleId: VEHICLE,
    tripId: TRIP,
    pinnedSnapshotHash: 'DI_V0_S4_EVIDENCE_V1:sha256:test',
    combinedInputIdentity: 'DI_V0_COMBINED_INPUT_IDENTITY_V0_3:sha256:test',
    shadowBundleVersion: 'bundle-v2',
    contentFingerprint: 'content-fp-1',
    workItemId: 'work-item-1',
    sourceFamily: 'RUPTELA_R1',
  };
}

describe('DS4 Layer-2 P2 offline reconstruction (synthetic)', () => {
  it('marks revision candidate collection-eligible for V2 payload', () => {
    const payload = syntheticPayload();
    const gzip = gzipSync(JSON.stringify(payload));
    const candidate = evaluateDs4Layer2P2MotionRevisionCandidateV1({
      motionRunId: 'motion-run-1',
      createdAt: new Date('2026-10-30T12:00:00.000Z'),
      pinnedSnapshotHash: 'snap',
      combinedInputIdentity: 'cii',
      contentFingerprint: 'cf',
      summaryJson: payload.summary,
      payloadGzip: gzip,
      scope: { organizationId: ORG, vehicleId: VEHICLE, tripId: TRIP },
    });
    expect(candidate.payloadContract).toBe('V2_INTENSITY');
    expect(candidate.collectionEligible).toBe(true);
    expect(candidate.speedAuthority).toBe('C4_ONLY');
    expect(candidate.exposureDerivable).toBe(true);
  });

  it('builds offline row with NEWLY_COMPUTED_OFFLINE provenance and reconciles events', () => {
    const reconstructedAt = new Date('2026-10-30T15:00:00.000Z');
    const row = buildDs4Layer2P2OfflineReconstructedRowV1({
      organizationId: ORG,
      vehicleId: VEHICLE,
      tripId: TRIP,
      sourceFamily: 'RUPTELA_R1',
      motionPin: motionPin(),
      payload: syntheticPayload(),
      evidenceQualityContext: { sourceFamily: 'RUPTELA_R1', sparseChannelOutcome: 'PRESENT' },
      evaluationCodeSha: 'a'.repeat(40),
      reconstructedAt,
      expectedSpeedAuthority: 'C4_ONLY',
    });

    expect(row.reconstructionMode).toBe('NEWLY_COMPUTED_OFFLINE');
    expect(row.longitudinalLoad.reasonCodes).toEqual([]);
    expect(row.eventIntensityRecords.some((r) => r.classification === 'ADMISSIBLE_FULL')).toBe(true);
    expect(row.eventIntensityRecords.some((r) => r.classification === 'ADMISSIBLE_BIN_ONLY')).toBe(true);
    assertDs4Layer2P2EventReconciliationV1(row);
  });

  it('preserves NULL intensity semantics for excluded events without zero imputation', () => {
    const payload = syntheticPayload();
    payload.events = [
      ...payload.events,
      {
        kind: 'OTHER',
        startLabel: '2026-01-01T10:00:06Z',
        endLabel: '2026-01-01T10:00:07Z',
        startSpeedKmh: 0,
        endSpeedKmh: 0,
        deltaKmh: 0,
        quality: 'ARTEFACT_SUSPECT',
        flags: ['SPIKE'],
      },
    ];
    const row = buildDs4Layer2P2OfflineReconstructedRowV1({
      organizationId: ORG,
      vehicleId: VEHICLE,
      tripId: TRIP,
      sourceFamily: 'RUPTELA_R1',
      motionPin: motionPin(),
      payload,
      evidenceQualityContext: null,
      evaluationCodeSha: 'b'.repeat(40),
      reconstructedAt: new Date('2026-10-30T15:00:00.000Z'),
      expectedSpeedAuthority: 'C4_ONLY',
    });
    const excluded = row.eventIntensityRecords.filter((r) => r.classification === 'EXCLUDED_ARTEFACT');
    expect(excluded.length).toBeGreaterThan(0);
    expect(excluded.every((r) => r.meanAccelMps2 == null)).toBe(true);
  });
});
