import {
  PARTIAL_TRIP_BOUNDARY_EXTENSION_REPAIR_TYPE,
  buildBoundaryRepairGeneration,
  hasCommittedPartialTripBoundaryExtension,
  partialExtensionAllowsAdmissionDuringRetryableRefresh,
} from '../../boundary-repair.state.util';
import {
  buildTripDiBoundaryAdmissionPatch,
  buildTripDiBoundaryRevisionKey,
  canReleaseTripDiBoundaryAdmission,
  evaluateTripDiBoundaryAdmission,
  readTripDiBoundaryAdmissionV1,
  type TripDiBoundaryAdmissionScope,
} from '../trip-di-boundary-admission';

function baseScope(overrides: Partial<TripDiBoundaryAdmissionScope> = {}): TripDiBoundaryAdmissionScope {
  const start = new Date('2026-10-14T12:00:00.000Z');
  const end = new Date('2026-10-14T14:00:00.000Z');
  return {
    organizationId: 'org-1',
    vehicleId: 'veh-1',
    tripId: 'trip-1',
    tripStatus: 'COMPLETED',
    startTime: start,
    endTime: end,
    dimoSegmentId: 'seg-1',
    mergeParentTripId: null,
    rawDetectionMeta: {},
    detectionState: 'RESTING',
    activeTripId: null,
    proposedBoundaryRepairCount: 0,
    ...overrides,
  };
}

describe('trip-di-boundary-admission', () => {
  it('blocks release when trip is not COMPLETED', () => {
    expect(canReleaseTripDiBoundaryAdmission(baseScope({ tripStatus: 'ONGOING', endTime: null }))).toBe(
      'TRIP_NOT_COMPLETED',
    );
  });

  it('blocks release when trip is CANCELLED (suffix must not be independently admitted)', () => {
    expect(
      canReleaseTripDiBoundaryAdmission(
        baseScope({ tripStatus: 'CANCELLED', endTime: new Date('2026-10-14T14:00:00.000Z') }),
      ),
    ).toBe('TRIP_NOT_COMPLETED');
  });

  it('blocks release when FSM still active on trip', () => {
    expect(canReleaseTripDiBoundaryAdmission(baseScope({ detectionState: 'DRIVING' }))).toBe('FSM_STILL_ACTIVE_ON_TRIP');
    expect(canReleaseTripDiBoundaryAdmission(baseScope({ activeTripId: 'trip-1' }))).toBe('FSM_STILL_ACTIVE_ON_TRIP');
  });

  it('blocks release when proposed boundary repairs exist', () => {
    expect(canReleaseTripDiBoundaryAdmission(baseScope({ proposedBoundaryRepairCount: 1 }))).toBe(
      'PROPOSED_BOUNDARY_REPAIR_OPEN',
    );
  });

  const pendingBoundaryRefreshMeta = {
    boundaryRefresh: {
      state: 'PENDING',
      generation: 'gen-test-1',
      requestedAt: '2026-10-31T10:00:00.000Z',
      attempts: 1,
      stages: { route: 'pending', behavior: 'pending', drivingImpact: 'pending' },
    },
  };

  it('blocks release when boundary refresh is retryable without committed partial extension', () => {
    expect(
      canReleaseTripDiBoundaryAdmission(
        baseScope({ rawDetectionMeta: pendingBoundaryRefreshMeta }),
      ),
    ).toBe('BOUNDARY_REFRESH_IN_FLIGHT');
  });

  it('allows release when partial extension refresh generation matches committed repair', () => {
    const start = new Date('2026-10-14T12:00:00.000Z');
    const end = new Date('2026-10-14T14:00:00.000Z');
    const generation = buildBoundaryRepairGeneration({
      auditId: 'audit-partial-1',
      providerSegmentId: 'seg-1',
      newStartTime: start,
      newEndTime: end,
    });
    expect(
      canReleaseTripDiBoundaryAdmission(
        baseScope({
          rawDetectionMeta: {
            boundaryRefresh: {
              state: 'PENDING',
              generation,
              requestedAt: '2026-10-31T10:00:00.000Z',
              attempts: 1,
              stages: { route: 'pending', behavior: 'pending', drivingImpact: 'pending' },
            },
            boundaryRepair: {
              repairType: PARTIAL_TRIP_BOUNDARY_EXTENSION_REPAIR_TYPE,
              auditId: 'audit-partial-1',
              providerSegmentId: 'seg-1',
              newStartTime: start.toISOString(),
              newEndTime: end.toISOString(),
            },
          },
        }),
      ),
    ).toBeNull();
    expect(
      partialExtensionAllowsAdmissionDuringRetryableRefresh({
        boundaryRefresh: {
          state: 'PENDING',
          generation,
          requestedAt: '2026-10-31T10:00:00.000Z',
          attempts: 1,
          stages: { route: 'pending', behavior: 'pending', drivingImpact: 'pending' },
        },
        boundaryRepair: {
          repairType: PARTIAL_TRIP_BOUNDARY_EXTENSION_REPAIR_TYPE,
          auditId: 'audit-partial-1',
          providerSegmentId: 'seg-1',
          newStartTime: start.toISOString(),
          newEndTime: end.toISOString(),
        },
      }),
    ).toBe(true);
  });

  it('blocks release when refresh generation is stale vs committed repair', () => {
    const start = new Date('2026-10-14T12:00:00.000Z');
    const end = new Date('2026-10-14T14:00:00.000Z');
    expect(
      canReleaseTripDiBoundaryAdmission(
        baseScope({
          rawDetectionMeta: {
            boundaryRefresh: {
              state: 'PENDING',
              generation: 'stale|seg-1|old|old',
              requestedAt: '2026-10-31T10:00:00.000Z',
              attempts: 1,
              stages: { route: 'pending', behavior: 'pending', drivingImpact: 'pending' },
            },
            boundaryRepair: {
              repairType: PARTIAL_TRIP_BOUNDARY_EXTENSION_REPAIR_TYPE,
              auditId: 'audit-partial-1',
              providerSegmentId: 'seg-1',
              newStartTime: start.toISOString(),
              newEndTime: end.toISOString(),
            },
          },
        }),
      ),
    ).toBe('BOUNDARY_REFRESH_IN_FLIGHT');
  });

  it('blocks release when repairType set but repair generation metadata is incomplete', () => {
    expect(
      canReleaseTripDiBoundaryAdmission(
        baseScope({
          rawDetectionMeta: {
            ...pendingBoundaryRefreshMeta,
            boundaryRepair: { repairType: PARTIAL_TRIP_BOUNDARY_EXTENSION_REPAIR_TYPE },
          },
        }),
      ),
    ).toBe('BOUNDARY_REFRESH_IN_FLIGHT');
  });

  it('hasCommittedPartialTripBoundaryExtension requires repairType on boundaryRepair', () => {
    expect(hasCommittedPartialTripBoundaryExtension({})).toBe(false);
    expect(
      hasCommittedPartialTripBoundaryExtension({
        boundaryRepair: { repairType: 'OTHER' },
      }),
    ).toBe(false);
    expect(
      hasCommittedPartialTripBoundaryExtension({
        boundaryRepair: { repairType: PARTIAL_TRIP_BOUNDARY_EXTENSION_REPAIR_TYPE },
      }),
    ).toBe(true);
  });

  it('requires admission record matching current revision for S4 admission', () => {
    const scope = baseScope();
    expect(evaluateTripDiBoundaryAdmission(scope)).toEqual({ ok: false, code: 'ADMISSION_RECORD_MISSING' });

    const revisionKey = buildTripDiBoundaryRevisionKey({
      organizationId: scope.organizationId,
      vehicleId: scope.vehicleId,
      tripId: scope.tripId,
      tripStatus: scope.tripStatus,
      startTime: scope.startTime,
      endTime: scope.endTime,
      dimoSegmentId: scope.dimoSegmentId,
      mergeParentTripId: scope.mergeParentTripId,
      rawDetectionMeta: scope.rawDetectionMeta,
    });
    const admitted = baseScope({
      rawDetectionMeta: buildTripDiBoundaryAdmissionPatch(revisionKey, 'RECONCILIATION'),
    });
    expect(evaluateTripDiBoundaryAdmission(admitted)).toMatchObject({ ok: true });
  });

  it('rejects stale admission when boundary repair generation changes', () => {
    const start = new Date('2026-10-14T12:00:00.000Z');
    const end = new Date('2026-10-14T14:00:00.000Z');
    const revisionKey = buildTripDiBoundaryRevisionKey({
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      tripId: 'trip-1',
      tripStatus: 'COMPLETED',
      startTime: start,
      endTime: end,
      dimoSegmentId: 'seg-1',
      mergeParentTripId: null,
      rawDetectionMeta: {
        boundaryRepair: {
          auditId: 'repair-a',
          providerSegmentId: 'seg-1',
          newStartTime: start.toISOString(),
          newEndTime: end.toISOString(),
        },
      },
    });
    const scope = baseScope({
      rawDetectionMeta: {
        boundaryRepair: {
          auditId: 'repair-b',
          providerSegmentId: 'seg-1',
          newStartTime: start.toISOString(),
          newEndTime: new Date('2026-10-14T14:30:00.000Z').toISOString(),
        },
        diV0BoundaryAdmissionV1: {
          revisionKey,
          releasedAtUtc: '2026-10-14T16:00:00.000Z',
          releasedBy: 'RECONCILIATION',
        },
      },
    });
    expect(evaluateTripDiBoundaryAdmission(scope)).toEqual({ ok: false, code: 'ADMISSION_REVISION_MISMATCH' });
  });

  it('parses admission v1 from raw_detection_meta', () => {
    const patch = buildTripDiBoundaryAdmissionPatch('rev-a', 'OPERATOR');
    const parsed = readTripDiBoundaryAdmissionV1(patch);
    expect(parsed?.revisionKey).toBe('rev-a');
    expect(parsed?.releasedBy).toBe('OPERATOR');
  });
});
