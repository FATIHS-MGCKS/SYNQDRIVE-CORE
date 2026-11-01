import {
  buildTripDiBoundaryRevisionKey,
  readTripDiBoundaryAdmissionV1,
  type TripDiBoundaryAdmissionScope,
} from '../trip-di-boundary-admission';
import { classifyTripDiBoundaryAdmissionRecoveryCandidate, computeMissingAdmissionScanCap } from '../trip-di-boundary-admission-recovery.util';
import { buildTripDiBoundaryAdmissionPatch } from '../trip-di-boundary-admission';

function scope(partial: Partial<TripDiBoundaryAdmissionScope> & Pick<TripDiBoundaryAdmissionScope, 'tripId'>): TripDiBoundaryAdmissionScope {
  const start = new Date('2026-10-01T10:00:00.000Z');
  const end = new Date('2026-10-01T11:00:00.000Z');
  return {
    organizationId: 'org',
    vehicleId: 'veh',
    tripId: partial.tripId,
    tripStatus: partial.tripStatus ?? 'COMPLETED',
    startTime: partial.startTime ?? start,
    endTime: partial.endTime ?? end,
    dimoSegmentId: partial.dimoSegmentId ?? 'seg',
    mergeParentTripId: partial.mergeParentTripId ?? null,
    rawDetectionMeta: partial.rawDetectionMeta ?? {},
    detectionState: partial.detectionState ?? 'RESTING',
    activeTripId: partial.activeTripId ?? null,
    proposedBoundaryRepairCount: partial.proposedBoundaryRepairCount ?? 0,
  };
}

describe('computeMissingAdmissionScanCap', () => {
  it('reserves minimum keyset slots from scan limit', () => {
    expect(computeMissingAdmissionScanCap(32)).toBe(24);
    expect(computeMissingAdmissionScanCap(8)).toBe(0);
    expect(computeMissingAdmissionScanCap(10)).toBe(2);
  });
});

describe('classifyTripDiBoundaryAdmissionRecoveryCandidate', () => {
  it('NEEDS_RELEASE when admission missing', () => {
    const s = scope({ tripId: 't1' });
    expect(classifyTripDiBoundaryAdmissionRecoveryCandidate(s).kind).toBe('NEEDS_RELEASE');
  });

  it('ALREADY_CURRENT when admission revision matches boundary fingerprint', () => {
    const s = scope({ tripId: 't2' });
    const revisionKey = buildTripDiBoundaryRevisionKey(s);
    const meta = buildTripDiBoundaryAdmissionPatch(revisionKey, 'RECONCILIATION');
    const withAdmission = scope({ tripId: 't2', rawDetectionMeta: meta });
    expect(classifyTripDiBoundaryAdmissionRecoveryCandidate(withAdmission).kind).toBe('ALREADY_CURRENT');
  });

  it('GUARDED when FSM still active on trip', () => {
    const s = scope({ tripId: 't3', activeTripId: 't3', detectionState: 'ACTIVE_TRIP' });
    const outcome = classifyTripDiBoundaryAdmissionRecoveryCandidate(s);
    expect(outcome).toMatchObject({ kind: 'GUARDED', code: 'FSM_STILL_ACTIVE_ON_TRIP' });
  });

  it('GUARDED when proposed boundary repair open', () => {
    const s = scope({ tripId: 't4', proposedBoundaryRepairCount: 1 });
    expect(classifyTripDiBoundaryAdmissionRecoveryCandidate(s)).toMatchObject({
      kind: 'GUARDED',
      code: 'PROPOSED_BOUNDARY_REPAIR_OPEN',
    });
  });

  it('NEEDS_RELEASE when admission revision stale after boundary repair generation change', () => {
    const s = scope({ tripId: 't5' });
    const staleKey = buildTripDiBoundaryRevisionKey({ ...s, boundaryRepairGeneration: 'gen-a' });
    const meta = buildTripDiBoundaryAdmissionPatch(staleKey, 'RECONCILIATION');
    const repaired = scope({
      tripId: 't5',
      rawDetectionMeta: {
        ...meta,
        boundaryRepair: { auditId: 'a', providerSegmentId: 'seg', newStartTime: s.startTime.toISOString(), newEndTime: s.endTime!.toISOString() },
      },
    });
    const outcome = classifyTripDiBoundaryAdmissionRecoveryCandidate(repaired);
    expect(outcome.kind).toBe('NEEDS_RELEASE');
    expect(readTripDiBoundaryAdmissionV1(repaired.rawDetectionMeta)?.revisionKey).toBe(staleKey);
  });
});
