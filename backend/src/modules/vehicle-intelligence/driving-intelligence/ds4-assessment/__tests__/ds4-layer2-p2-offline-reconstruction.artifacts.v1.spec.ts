import { buildDs4Layer2P2OfflineArtifactsV1 } from '../export/ds4-layer2-p2-offline-reconstruction.artifacts.v1';
import {
  buildDs4Layer2P2OfflineReconstructedRowV1,
} from '../export/ds4-layer2-p2-offline-reconstruction.v1';
import { DS4_LAYER2_P2_OFFLINE_PILOT_ORGANIZATION_ID_V1 } from '../export/ds4-layer2-p2-offline-reconstruction.cohort.v1';
import {
  DI_V0_MOTION_CORE_SHADOW_EVENT_ROW_CONTRACT_V2_INTENSITY,
  DI_V0_MOTION_CORE_SHADOW_PERSISTENCE_CONTRACT_V2,
} from '../../motion-core-shadow-worker/di-v0-motion-core-shadow-event-row.contract';
import type { DiV0MotionCoreShadowPayloadV1 } from '../../motion-core-shadow-worker/di-v0-motion-core-shadow.types';
import type { Ds4Layer2HistoricalExportMotionPinV1 } from '../export/ds4-layer2-historical-export.v1';

import { DS4_ASSESSMENT_CALIBRATION_COHORT_V1 } from '../ds4-assessment-calibration-cohort.v1';

function vehicleIdForLine(line: 'AUDI_A4_R1' | 'TESLA_MODEL_3_SOFTWARE_INTEGRATION') {
  return DS4_ASSESSMENT_CALIBRATION_COHORT_V1.find((v) => v.role === line)!.vehicleId;
}

function minimalRow(tripId: string, authority: 'C4_ONLY' | 'C5_1_PREFERRED', sourceFamily: string) {
  const payload = {
    contract: {
      algorithmVersions: { c4: 'c4', c5_1: 'c51', c5_1ProductionSafety: null, c5_1AlgorithmFileSha256: null, fsm: 'fsm', gapBridgeV1: null, fsmAuxBinding: null, events: 'ev', bundle: 'b1' },
      speedAuthority: authority,
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
    speeds: [
      { bucketLabelUtc: '2026-01-01T10:00:00Z', speedKmh: 36, quality: 'OK' as const, estimator: authority === 'C4_ONLY' ? 'C4' : 'C5_1', flags: [], support: [] },
      { bucketLabelUtc: '2026-01-01T10:00:01Z', speedKmh: 36, quality: 'OK' as const, estimator: authority === 'C4_ONLY' ? 'C4' : 'C5_1', flags: [], support: [] },
      { bucketLabelUtc: '2026-01-01T10:00:02Z', speedKmh: 36, quality: 'OK' as const, estimator: authority === 'C4_ONLY' ? 'C4' : 'C5_1', flags: [], support: [] },
    ],
    fsmLabels: [
      { bucketLabelUtc: '2026-01-01T10:00:00Z', state: 'MOVING' as const, evidenceQuality: 'DIRECT' as const, reason: 'r', flags: [] },
      { bucketLabelUtc: '2026-01-01T10:00:01Z', state: 'MOVING' as const, evidenceQuality: 'DIRECT' as const, reason: 'r', flags: [] },
      { bucketLabelUtc: '2026-01-01T10:00:02Z', state: 'MOVING' as const, evidenceQuality: 'DIRECT' as const, reason: 'r', flags: [] },
    ],
    stopEpisodes: [],
    events: [
      {
        kind: 'ACCELERATION',
        startLabel: '2026-01-01T10:00:00Z',
        endLabel: '2026-01-01T10:00:02Z',
        startSpeedKmh: 10,
        endSpeedKmh: 20,
        deltaKmh: 10,
        quality: 'OK',
        flags: [],
        intensity: {
          meanAccelMps2: 1.4,
          durationS: 3,
          steps: 3,
          coverageRatio: 1,
          startUncertaintyS: '±1s',
          endUncertaintyS: '±1s',
        },
      },
    ],
    summary: {
      labelCount: 3,
      speedNumericCount: 3,
      eventCount: 1,
      eventAcceptedCount: 1,
      eventArtefactSuspectCount: 0,
      stopEpisodeCount: 0,
      eventRowContract: DI_V0_MOTION_CORE_SHADOW_EVENT_ROW_CONTRACT_V2_INTENSITY,
    },
  } as DiV0MotionCoreShadowPayloadV1;

  const pin: Ds4Layer2HistoricalExportMotionPinV1 = {
    motionRunId: `run-${tripId.slice(0, 8)}`,
    organizationId: DS4_LAYER2_P2_OFFLINE_PILOT_ORGANIZATION_ID_V1,
    vehicleId:
      authority === 'C4_ONLY'
        ? vehicleIdForLine('AUDI_A4_R1')
        : vehicleIdForLine('TESLA_MODEL_3_SOFTWARE_INTEGRATION'),
    tripId,
    pinnedSnapshotHash: `snap-${tripId.slice(0, 8)}`,
    combinedInputIdentity: `cii-${tripId.slice(0, 8)}`,
    shadowBundleVersion: 'bundle',
    contentFingerprint: `cf-${tripId.slice(0, 8)}`,
    workItemId: 'wi-1',
    sourceFamily,
  };

  return buildDs4Layer2P2OfflineReconstructedRowV1({
    organizationId: DS4_LAYER2_P2_OFFLINE_PILOT_ORGANIZATION_ID_V1,
    vehicleId: pin.vehicleId,
    tripId,
    sourceFamily,
    motionPin: pin,
    payload,
    evidenceQualityContext: { sourceFamily: sourceFamily as 'RUPTELA_R1' | 'API_SYNTHETIC' },
    evaluationCodeSha: 'c'.repeat(40),
    reconstructedAt: new Date('2026-10-30T16:00:00.000Z'),
    expectedSpeedAuthority: authority,
  });
}

describe('buildDs4Layer2P2OfflineArtifactsV1', () => {
  it('produces deterministic checksums and separates source families and speed authorities', () => {
    const rows = [
      minimalRow('004f9579-2875-42f2-8aa7-e82c343c954e', 'C4_ONLY', 'RUPTELA_R1'),
      minimalRow('b304e9ad-0dcb-4b69-a93e-5364078a20a1', 'C5_1_PREFERRED', 'API_SYNTHETIC'),
    ];
    const revisionRows = rows.flatMap((row) => [
      {
        tripId: row.tripId,
        motionRunId: row.sourceMotionRunId,
        createdAtUtc: '2026-10-30T12:00:00.000Z',
        selected: true,
        rejectionReasons: [] as string[],
        pinnedSnapshotHash: row.pinnedSnapshotHash,
        combinedInputIdentity: row.combinedInputIdentity,
        contentFingerprint: row.motionPin.contentFingerprint,
        payloadContract: 'V2_INTENSITY',
        collectionEligible: true,
        speedAuthority: row.speedAuthority,
        exposureDerivable: true,
      },
    ]);

    const input = {
      organizationId: DS4_LAYER2_P2_OFFLINE_PILOT_ORGANIZATION_ID_V1,
      evaluationCodeSha: 'c'.repeat(40),
      reconstructedAt: new Date('2026-10-30T16:00:00.000Z'),
      feasibilityAuditProductionSha: '7ab55a0d22223ad9de5bc6691b726e169d377517',
      revisionSelectionPolicy: 'test-policy',
      rows,
      revisionRows,
    };

    const first = buildDs4Layer2P2OfflineArtifactsV1(input);
    const second = buildDs4Layer2P2OfflineArtifactsV1(input);

    expect(first.fileChecksums).toEqual(second.fileChecksums);
    expect(first.manifest.reconstructionMode).toBe('NEWLY_COMPUTED_OFFLINE');
    expect(first.coverageSummary.p1Isolation).toMatchObject({
      note: expect.stringContaining('never merged'),
    });
    expect(first.coverageSummary.bySpeedAuthority).toEqual({ C4_ONLY: 1, C5_1_PREFERRED: 1 });
    expect(first.coverageSummary.bySourceFamily).toEqual({ RUPTELA_R1: 1, API_SYNTHETIC: 1 });
    expect(first.reconstructedAssessmentsCsv).toContain('NEWLY_COMPUTED_OFFLINE');
    expect(first.reconstructedAssessmentsCsv).not.toContain('PERSISTED_ASSESSMENT_ONLY');
  });
});
