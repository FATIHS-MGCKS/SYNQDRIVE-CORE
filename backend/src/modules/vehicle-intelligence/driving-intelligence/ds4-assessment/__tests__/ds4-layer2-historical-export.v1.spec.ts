import { createHash } from 'crypto';
import type { Ds4LongitudinalEvidenceQualityContextV1 } from '../ds4-longitudinal-evidence-quality.v1';
import {
  assertMotionRunPinMatchesAssessmentV1,
  buildAssessmentExportRowV1,
  buildDs4Layer2HistoricalExportArtifactsV1,
  Ds4Layer2HistoricalExportIntegrityErrorV1,
  type Ds4Layer2HistoricalExportAssessmentRowV1,
  type Ds4Layer2HistoricalExportMotionPinV1,
  defaultCollectionCutoffUtcForExportV1,
} from '../export/ds4-layer2-historical-export.v1';
import { DS4_LAYER2_HISTORICAL_EXPORT_RECONSTRUCTION_MODE_V1 } from '../export/ds4-layer2-historical-export.v1.contract';
import { loadPersistedDs4Layer2HistoricalExportRowsV1 } from '../export/ds4-layer2-historical-export.loader.v1';

const ORG = 'faa710c9-6d91-4079-a7d5-91fdccdec14a';

function motionPin(overrides: Partial<Ds4Layer2HistoricalExportMotionPinV1> = {}): Ds4Layer2HistoricalExportMotionPinV1 {
  return {
    motionRunId: 'run-1',
    organizationId: ORG,
    vehicleId: 'veh-a',
    tripId: 'trip-1',
    pinnedSnapshotHash: 'snap-1',
    combinedInputIdentity: 'cii-1',
    shadowBundleVersion: 'DI_V0_MOTION_CORE_SHADOW_BUNDLE_V1',
    contentFingerprint: 'cf-1',
    workItemId: 'wi-1',
    sourceFamily: 'RUPTELA_R1',
    ...overrides,
  };
}

function baseAssessment(overrides: Record<string, unknown> = {}) {
  return {
    id: 'assess-1',
    organizationId: ORG,
    vehicleId: 'veh-a',
    tripId: 'trip-1',
    assessmentVersion: 'DS4_TRIP_ASSESSMENT_V1',
    assessmentStatus: 'UNRATED_COUNTS_ONLY',
    inputFingerprint: 'fp-1',
    sourceMotionRunId: 'run-1',
    pinnedSnapshotHash: 'snap-1',
    combinedInputIdentity: 'cii-1',
    eventRowContract: 'DI_V0_MOTION_CORE_EVENT_ROW_V2_INTENSITY_ORDINAL_V1',
    speedAuthority: 'C4_ONLY',
    evidenceQuality: 'PRESENT',
    reasonCodes: [],
    computedAt: new Date('2026-10-29T12:00:00.000Z'),
    eventSummariesJson: {
      ratedEventCount: 1,
      unratedEventCount: 1,
      artefactSuspectCount: 1,
      drivingExposure: {
        derivable: true,
        exposureSeconds: 120,
        distanceKm: 1.5,
        provenance: { provenanceVersion: 'DS4_ASSESSMENT_DRIVING_EXPOSURE_V2', speedAuthority: 'C4_ONLY' },
      },
      eventIntensityRecords: [
        {
          eventIndex: 0,
          kind: 'ACCELERATION',
          classification: 'ADMISSIBLE_FULL',
          durationTier: 'FULL_ELIGIBLE',
          eventQuality: 'OK',
          speedAuthority: 'C4_ONLY',
          meanAccelMps2: 1.2,
          durationS: 3,
          steps: 3,
          coverageRatio: 1,
          startUncertaintyS: null,
          endUncertaintyS: null,
          reasonCodes: ['EVENT_ADMISSIBLE_FULL_ELIGIBLE'],
          startLabel: '2026-10-29T12:00:01.000Z',
          endLabel: '2026-10-29T12:00:04.000Z',
        },
        {
          eventIndex: 1,
          kind: 'DECELERATION',
          classification: 'ADMISSIBLE_BIN_ONLY',
          durationTier: 'BIN_ONLY',
          eventQuality: 'OK',
          speedAuthority: 'C4_ONLY',
          meanAccelMps2: 0.8,
          durationS: 2,
          steps: 2,
          coverageRatio: 1,
          startUncertaintyS: null,
          endUncertaintyS: null,
          reasonCodes: ['EVENT_ADMISSIBLE_BIN_ONLY'],
          startLabel: '2026-10-29T12:00:10.000Z',
          endLabel: '2026-10-29T12:00:12.000Z',
        },
        {
          eventIndex: 2,
          kind: 'ACCELERATION',
          classification: 'EXCLUDED_ARTEFACT',
          durationTier: 'UNRATED',
          eventQuality: 'ARTEFACT_SUSPECT',
          speedAuthority: 'C4_ONLY',
          meanAccelMps2: null,
          durationS: 2,
          steps: 2,
          coverageRatio: 1,
          startUncertaintyS: null,
          endUncertaintyS: null,
          reasonCodes: ['EVENT_EXCLUDED_ARTEFACT'],
          startLabel: '2026-10-29T12:00:20.000Z',
          endLabel: '2026-10-29T12:00:22.000Z',
        },
        {
          eventIndex: 3,
          kind: 'DECELERATION',
          classification: 'UNRATED',
          durationTier: 'UNRATED',
          eventQuality: 'OK',
          speedAuthority: 'C4_ONLY',
          meanAccelMps2: null,
          durationS: 1,
          steps: 1,
          coverageRatio: 0.5,
          startUncertaintyS: null,
          endUncertaintyS: null,
          reasonCodes: ['EVENT_DURATION_BELOW_MINIMUM'],
          startLabel: '2026-10-29T12:00:30.000Z',
          endLabel: '2026-10-29T12:00:31.000Z',
        },
      ],
    },
    ...overrides,
  };
}

function buildExportInput(rows: Ds4Layer2HistoricalExportAssessmentRowV1[]) {
  return {
    organizationId: ORG,
    evaluationCodeSha: '62ea0c4c3793ec1582838c1fd1218d03654ae759',
    exportedAt: new Date('2026-10-30T10:00:00.000Z'),
    collectionCutoffUtc: defaultCollectionCutoffUtcForExportV1(),
    sourceCollection: {
      table: 'di_v0_ds4_trip_assessment_v1' as const,
      organizationScope: ORG,
      reconstructionMode: DS4_LAYER2_HISTORICAL_EXPORT_RECONSTRUCTION_MODE_V1,
    },
    rows,
  };
}

describe('ds4-layer2-historical-export.v1', () => {
  it('produces deterministic export bytes for identical input', () => {
    const row = buildAssessmentExportRowV1({
      assessment: baseAssessment(),
      motionPin: motionPin(),
      evidenceQualityContext: { sourceFamily: 'RUPTELA_R1', sparseChannelOutcome: 'PRESENT' },
    });
    const a = buildDs4Layer2HistoricalExportArtifactsV1(buildExportInput([row]));
    const b = buildDs4Layer2HistoricalExportArtifactsV1(buildExportInput([row]));
    expect(a.assessmentsCsv).toBe(b.assessmentsCsv);
    expect(a.longitudinalEventsCsv).toBe(b.longitudinalEventsCsv);
    expect(a.exclusionsCsv).toBe(b.exclusionsCsv);
    expect(a.fileChecksums).toEqual(b.fileChecksums);
  });

  it('supports empty organization cohort (zero assessment rows)', () => {
    const artifacts = buildDs4Layer2HistoricalExportArtifactsV1(buildExportInput([]));
    expect(artifacts.assessmentsCsv.trim().split('\n')).toHaveLength(1);
    expect((artifacts.manifest.rowCounts as { assessments: number }).assessments).toBe(0);
  });

  it('enforces tenant isolation on export scope', () => {
    const row = buildAssessmentExportRowV1({
      assessment: baseAssessment({ organizationId: 'other-org' }),
      motionPin: motionPin({ organizationId: 'other-org' }),
      evidenceQualityContext: null,
    });
    expect(() => buildDs4Layer2HistoricalExportArtifactsV1(buildExportInput([row]))).toThrow(
      Ds4Layer2HistoricalExportIntegrityErrorV1,
    );
  });

  it('fail-closes on missing motion pin provenance', () => {
    expect(() =>
      assertMotionRunPinMatchesAssessmentV1({
        assessment: baseAssessment(),
        motion: motionPin({ pinnedSnapshotHash: 'wrong-snap' }),
      }),
    ).toThrow(/Pinned snapshot hash mismatch/);
  });

  it('preserves NULL intensity as empty CSV cells (not zero)', () => {
    const row = buildAssessmentExportRowV1({
      assessment: baseAssessment(),
      motionPin: motionPin(),
      evidenceQualityContext: { sourceFamily: 'RUPTELA_R1', sparseChannelOutcome: 'PRESENT' },
    });
    const { exclusionsCsv } = buildDs4Layer2HistoricalExportArtifactsV1(buildExportInput([row]));
    const artefactLine = exclusionsCsv.split('\n').find((l) => l.includes('EXCLUDED_ARTEFACT'));
    expect(artefactLine).toBeDefined();
    expect(artefactLine).not.toContain(',0,');
    expect(artefactLine).toContain('EXCLUDED_NOT_ZERO');
  });

  it('routes EXCLUDED_ARTEFACT and UNRATED to exclusions.csv only', () => {
    const row = buildAssessmentExportRowV1({
      assessment: baseAssessment(),
      motionPin: motionPin(),
      evidenceQualityContext: { sourceFamily: 'RUPTELA_R1', sparseChannelOutcome: 'PRESENT' },
    });
    const artifacts = buildDs4Layer2HistoricalExportArtifactsV1(buildExportInput([row]));
    expect(artifacts.exclusionsCsv).toContain('EXCLUDED_ARTEFACT');
    expect(artifacts.exclusionsCsv).toContain('UNRATED');
    expect(artifacts.longitudinalEventsCsv).not.toContain('EXCLUDED_ARTEFACT');
    expect(artifacts.longitudinalEventsCsv).toContain('ADMISSIBLE_FULL');
    expect(artifacts.longitudinalEventsCsv).toContain('ADMISSIBLE_BIN_ONLY');
  });

  it('keeps C4_ONLY and C5_1_PREFERRED on separate assessment rows', () => {
    const c4 = buildAssessmentExportRowV1({
      assessment: baseAssessment({ id: 'a1', inputFingerprint: 'fp-c4', speedAuthority: 'C4_ONLY', tripId: 't1' }),
      motionPin: motionPin({ tripId: 't1' }),
      evidenceQualityContext: { sourceFamily: 'RUPTELA_R1', sparseChannelOutcome: 'PRESENT' },
    });
    const c5 = buildAssessmentExportRowV1({
      assessment: baseAssessment({
        id: 'a2',
        inputFingerprint: 'fp-c5',
        speedAuthority: 'C5_1_PREFERRED',
        tripId: 't2',
        sourceMotionRunId: 'run-2',
      }),
      motionPin: motionPin({ tripId: 't2', motionRunId: 'run-2' }),
      evidenceQualityContext: { sourceFamily: 'RUPTELA_R1', sparseChannelOutcome: 'PRESENT' },
    });
    const csv = buildDs4Layer2HistoricalExportArtifactsV1(buildExportInput([c5, c4])).assessmentsCsv;
    expect(csv).toContain('C4_ONLY');
    expect(csv).toContain('C5_1_PREFERRED');
    const c4Line = csv.split('\n').find((l) => l.includes('fp-c4'));
    const c5Line = csv.split('\n').find((l) => l.includes('fp-c5'));
    expect(c4Line).toContain('C4_ONLY');
    expect(c5Line).toContain('C5_1_PREFERRED');
  });

  it('applies API_SYNTHETIC Tesla source-family handling via evidence context (fail-closed L2)', () => {
    const context: Ds4LongitudinalEvidenceQualityContextV1 = {
      sourceFamily: 'API_SYNTHETIC',
      sparseChannelOutcome: 'PRESENT',
      channelManifest: [{ channel: 'POSITION', outcome: 'ABSENT' }],
    };
    const summaries = baseAssessment().eventSummariesJson as Record<string, unknown>;
    const row = buildAssessmentExportRowV1({
      assessment: baseAssessment({
        vehicleId: '68868291-5478-42cd-b0c4-cc77b2a78e21',
        speedAuthority: 'C4_ONLY',
        eventSummariesJson: {
          ...summaries,
          ratedEventCount: 2,
          unratedEventCount: 2,
        },
      }),
      motionPin: motionPin({
        vehicleId: '68868291-5478-42cd-b0c4-cc77b2a78e21',
        sourceFamily: 'API_SYNTHETIC',
      }),
      evidenceQualityContext: context,
    });
    expect(row.motionPin.sourceFamily).toBe('API_SYNTHETIC');
    const csv = buildDs4Layer2HistoricalExportArtifactsV1(buildExportInput([row])).assessmentsCsv;
    expect(csv).toContain('API_SYNTHETIC');
    expect(csv).toContain('68868291-5478-42cd-b0c4-cc77b2a78e21');
  });

  it('reconciles event row counts between events and exclusions', () => {
    const row = buildAssessmentExportRowV1({
      assessment: baseAssessment(),
      motionPin: motionPin(),
      evidenceQualityContext: { sourceFamily: 'RUPTELA_R1', sparseChannelOutcome: 'PRESENT' },
    });
    const artifacts = buildDs4Layer2HistoricalExportArtifactsV1(buildExportInput([row]));
    const eventDataLines = artifacts.longitudinalEventsCsv.split('\n').slice(1).filter(Boolean).length;
    const exclusionDataLines = artifacts.exclusionsCsv.split('\n').slice(1).filter(Boolean).length;
    expect(eventDataLines + exclusionDataLines).toBe(row.eventIntensityRecords.length);
  });

  it('validates manifest checksums against artifact bodies', () => {
    const row = buildAssessmentExportRowV1({
      assessment: baseAssessment(),
      motionPin: motionPin(),
      evidenceQualityContext: { sourceFamily: 'RUPTELA_R1', sparseChannelOutcome: 'PRESENT' },
    });
    const artifacts = buildDs4Layer2HistoricalExportArtifactsV1(buildExportInput([row]));
    const checksums = artifacts.manifest.fileChecksumsSha256 as Record<string, string>;
    expect(checksums['assessments.csv']).toBe(
      createHash('sha256').update(artifacts.assessmentsCsv, 'utf8').digest('hex'),
    );
    expect(checksums['longitudinal_events.csv']).toBe(
      createHash('sha256').update(artifacts.longitudinalEventsCsv, 'utf8').digest('hex'),
    );
    expect(checksums['exclusions.csv']).toBe(
      createHash('sha256').update(artifacts.exclusionsCsv, 'utf8').digest('hex'),
    );
  });

  it('loader performs read-only prisma operations (no writes)', async () => {
    const assessment = baseAssessment();
    const queryRaw = jest
      .fn()
      .mockResolvedValueOnce([assessment])
      .mockResolvedValueOnce([
        {
          id: 'run-1',
          organizationId: ORG,
          vehicleId: 'veh-a',
          tripId: 'trip-1',
          pinnedSnapshotHash: 'snap-1',
          combinedInputIdentity: 'cii-1',
          shadowBundleVersion: 'bundle',
          contentFingerprint: 'cf',
          workItemId: 'wi-1',
          shadowStatus: 'SUCCEEDED',
        },
      ])
      .mockResolvedValueOnce([{ sourceFamily: 'RUPTELA_R1', organizationId: ORG, tripId: 'trip-1' }])
      .mockResolvedValueOnce([{ source_family: 'RUPTELA_R1' }])
      .mockResolvedValueOnce([{ channel_manifest: [{ channel: 'POSITION', outcome: 'PRESENT' }] }]);

    const prisma = {
      $queryRaw: queryRaw,
      $executeRaw: jest.fn(),
    };

    const rows = await loadPersistedDs4Layer2HistoricalExportRowsV1(prisma as never, ORG);
    expect(rows).toHaveLength(1);
    expect(queryRaw).toHaveBeenCalled();
    expect(prisma.$executeRaw).not.toHaveBeenCalled();
  });
});
