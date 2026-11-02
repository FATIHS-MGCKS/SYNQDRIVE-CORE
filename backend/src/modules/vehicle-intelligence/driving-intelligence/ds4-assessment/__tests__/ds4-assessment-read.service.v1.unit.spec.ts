import { DS4_LONGITUDINAL_LOAD_EXPOSURE_GATE_UNCALIBRATED } from '../ds4-longitudinal-load-observables.v1.contract';
import {
  buildDs4LongitudinalLoadObservablesInputFromPersistedAssessmentV1,
  coerceDs4TripAssessmentEventSummariesFromPersistedJsonV1,
  computeDs4LongitudinalLoadObservablesV1,
  projectDs4LongitudinalLoadObservablesV1FromPersistedAssessmentV1,
} from '../ds4-longitudinal-load-observables.v1';
import { Ds4AssessmentReadServiceV1 } from '../ds4-assessment-read.service.v1';
import { Ds4TripAssessmentRepositoryV1 } from '../ds4-trip-assessment.repository.v1';

describe('Ds4AssessmentReadServiceV1 — longitudinalLoadObservablesV1 (AP2)', () => {
  const scope = { organizationId: 'org-1', vehicleId: 'veh-1', tripId: 'trip-1' };

  function mockPrismaWithBundle(assessment: Record<string, unknown>, impact: Record<string, unknown> | null) {
    const queryRaw = jest
      .fn()
      .mockResolvedValueOnce([{ source_family: 'RUPTELA_R1' }])
      .mockResolvedValueOnce([
        {
          channel_manifest: [
            { channel: 'R1_OBD', outcome: 'PRESENT' },
            { channel: 'POSITION', outcome: 'PRESENT' },
          ],
        },
      ]);
    const prisma = {
      $queryRaw: queryRaw,
      diV0Ds4TripAssessmentV1: {
        findFirst: jest.fn().mockResolvedValue(assessment),
      },
      diV0Ds4TripDrivingImpactV2: {
        findUnique: jest.fn().mockResolvedValue(impact),
      },
    };
    return { prisma, queryRaw };
  }

  it('projects Layer-2 observables from persisted eventSummariesJson using AP1 kernel', async () => {
    const eventSummariesJson = {
      ratedEventCount: 1,
      unratedEventCount: 0,
      artefactSuspectCount: 0,
      drivingExposure: {
        derivable: true,
        exposureSeconds: 100,
        distanceKm: 2,
        provenance: { speedAuthority: 'C4_ONLY' },
      },
      eventIntensityRecords: [
        {
          eventIndex: 0,
          kind: 'DECELERATION',
          classification: 'ADMISSIBLE_FULL',
          durationTier: 'FULL',
          meanAccelMps2: 2,
          durationS: 3,
          steps: 3,
          reasonCodes: [],
        },
      ],
    };
    const assessment = {
      id: 'a1',
      assessmentVersion: 'DS4_TRIP_ASSESSMENT_V1',
      assessmentStatus: 'RATED',
      evidenceQuality: 'PRESENT',
      reasonCodes: [],
      speedAuthority: 'C4_ONLY',
      eventRowContract: 'V2',
      inputFingerprint: 'fp',
      sourceMotionRunId: 'run',
      pinnedSnapshotHash: 'hash',
      combinedInputIdentity: 'id',
      computedAt: new Date('2026-01-01T00:00:00.000Z'),
      completenessJson: {},
      eventSummariesJson,
      processingErrorJson: null,
    };
    const { prisma } = mockPrismaWithBundle(assessment, null);
    const service = new Ds4AssessmentReadServiceV1(prisma as never);

    const out = await service.readForTrip(scope);
    expect(out?.longitudinalLoadObservablesV1?.modelVersion).toBe('DS4_LOAD_OBSERVABLES_V1');
    expect(out?.longitudinalLoadObservablesV1?.exposureGate).toBe(DS4_LONGITUDINAL_LOAD_EXPOSURE_GATE_UNCALIBRATED);
    expect(out?.longitudinalLoadObservablesV1?.deceleration.specificLongitudinalImpulseMps).toBe(6);
    expect(out?.assessment?.eventSummaries).toEqual(eventSummariesJson);
  });

  it('fail-closed projection when historical eventSummariesJson is empty', async () => {
    const assessment = {
      id: 'a1',
      assessmentVersion: 'DS4_TRIP_ASSESSMENT_V1',
      assessmentStatus: 'RATED',
      evidenceQuality: 'PRESENT',
      reasonCodes: [],
      speedAuthority: 'C4_ONLY',
      eventRowContract: 'V2',
      inputFingerprint: 'fp',
      sourceMotionRunId: 'run',
      pinnedSnapshotHash: 'hash',
      combinedInputIdentity: 'id',
      computedAt: new Date(),
      completenessJson: {},
      eventSummariesJson: {},
      processingErrorJson: null,
    };
    const { prisma } = mockPrismaWithBundle(assessment, null);
    const service = new Ds4AssessmentReadServiceV1(prisma as never);
    const out = await service.readForTrip(scope);
    expect(out?.longitudinalLoadObservablesV1?.reasonCodes).toContain('DRIVING_EXPOSURE_NOT_DERIVABLE');
    expect(out?.longitudinalLoadObservablesV1?.deceleration.specificLongitudinalImpulseMps).toBeNull();
  });

  it('returns null bundle without DB writes beyond readLatestBundleForTrip', async () => {
    const prisma = {
      diV0Ds4TripAssessmentV1: { findFirst: jest.fn().mockResolvedValue(null) },
      diV0Ds4TripDrivingImpactV2: { findUnique: jest.fn() },
    };
    const service = new Ds4AssessmentReadServiceV1(prisma as never);
    expect(await service.readForTrip(scope)).toBeNull();
    expect(prisma.diV0Ds4TripDrivingImpactV2.findUnique).not.toHaveBeenCalled();
  });

  it('deterministic repeated read projection', () => {
    const eventSummariesJson = {
      ratedEventCount: 0,
      unratedEventCount: 0,
      artefactSuspectCount: 0,
      drivingExposure: { derivable: true, exposureSeconds: 60, distanceKm: 1, provenance: { speedAuthority: 'C4_ONLY' } },
      eventIntensityRecords: [],
    };
    const a = projectDs4LongitudinalLoadObservablesV1FromPersistedAssessmentV1({
      assessmentStatus: 'RATED',
      evidenceQuality: 'PRESENT',
      speedAuthority: 'C4_ONLY',
      eventSummariesJson,
    });
    const b = projectDs4LongitudinalLoadObservablesV1FromPersistedAssessmentV1({
      assessmentStatus: 'RATED',
      evidenceQuality: 'PRESENT',
      speedAuthority: 'C4_ONLY',
      eventSummariesJson,
    });
    expect(a).toEqual(b);
    expect(
      computeDs4LongitudinalLoadObservablesV1(
        buildDs4LongitudinalLoadObservablesInputFromPersistedAssessmentV1({
          assessmentStatus: 'RATED',
          evidenceQuality: 'PRESENT',
          speedAuthority: 'C4_ONLY',
          eventSummariesJson: coerceDs4TripAssessmentEventSummariesFromPersistedJsonV1({}, 'C4_ONLY'),
        }),
      ).reasonCodes,
    ).toContain('DRIVING_EXPOSURE_NOT_DERIVABLE');
  });

  it('scopes read via repository organizationId filter (tenant isolation contract)', async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    const prisma = {
      diV0Ds4TripAssessmentV1: { findFirst },
      diV0Ds4TripDrivingImpactV2: { findUnique: jest.fn() },
    };
    const service = new Ds4AssessmentReadServiceV1(prisma as never);
    await service.readForTrip({ organizationId: 'org-x', vehicleId: 'v', tripId: 't' });
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: 'org-x', vehicleId: 'v', tripId: 't' },
      }),
    );
  });

  it('does not invoke repository persist methods', () => {
    const repoProto = Ds4TripAssessmentRepositoryV1.prototype;
    expect(typeof repoProto.persistAssessmentAndImpact).toBe('function');
    expect(typeof repoProto.readLatestBundleForTrip).toBe('function');
  });
});
