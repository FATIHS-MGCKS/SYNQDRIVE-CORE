/**
 * Explicit Driving Intelligence admission contract: S4 may evaluate only after
 * Trip FSM + boundary reconciliation release a revision-bound admission record.
 */
import { buildDiV0S4BoundaryFingerprint, type DiV0S4BoundaryInput } from '../../driving-intelligence/s4a-foundation/di-v0-s4a-identity';
import {
  isBoundaryRefreshRetryable,
  partialExtensionAllowsAdmissionDuringRetryableRefresh,
  readBoundaryRefreshRecord,
  readCurrentBoundaryRepairGeneration,
} from '../boundary-repair.state.util';

export const TRIP_DI_BOUNDARY_ADMISSION_V1_KEY = 'diV0BoundaryAdmissionV1';
export const TRIP_DI_BOUNDARY_ADMISSION_CONTRACT_VERSION = 1;

export interface TripDiBoundaryAdmissionV1 {
  contractVersion: number;
  revisionKey: string;
  releasedAtUtc: string;
  releasedBy: 'RECONCILIATION' | 'OPERATOR' | 'LIVE_FSM_SETTLEMENT';
}

export type TripDiBoundaryAdmissionBlockCode =
  | 'TRIP_NOT_COMPLETED'
  | 'FSM_STILL_ACTIVE_ON_TRIP'
  | 'BOUNDARY_REFRESH_IN_FLIGHT'
  | 'PROPOSED_BOUNDARY_REPAIR_OPEN'
  | 'ADMISSION_RECORD_MISSING'
  | 'ADMISSION_REVISION_MISMATCH';

export type TripDiBoundaryAdmissionEvaluation =
  | { ok: true; admission: TripDiBoundaryAdmissionV1 }
  | { ok: false; code: TripDiBoundaryAdmissionBlockCode };

export interface TripDiBoundaryAdmissionScope {
  organizationId: string;
  vehicleId: string;
  tripId: string;
  tripStatus: string;
  startTime: Date;
  endTime: Date | null;
  dimoSegmentId: string | null;
  mergeParentTripId: string | null;
  rawDetectionMeta: unknown;
  detectionState: string | null;
  activeTripId: string | null;
  proposedBoundaryRepairCount: number;
}

export type TripDiBoundaryRevisionInput = Omit<DiV0S4BoundaryInput, 'boundaryRepairGeneration'> & {
  rawDetectionMeta?: unknown;
  boundaryRepairGeneration?: string | null;
};

export function buildTripDiBoundaryRevisionKey(scope: TripDiBoundaryRevisionInput): string {
  return buildDiV0S4BoundaryFingerprint({
    organizationId: scope.organizationId,
    vehicleId: scope.vehicleId,
    tripId: scope.tripId,
    tripStatus: scope.tripStatus,
    startTime: scope.startTime,
    endTime: scope.endTime,
    dimoSegmentId: scope.dimoSegmentId,
    mergeParentTripId: scope.mergeParentTripId,
    boundaryRepairGeneration:
      scope.boundaryRepairGeneration ?? readCurrentBoundaryRepairGeneration(scope.rawDetectionMeta),
  });
}

export function readTripDiBoundaryAdmissionV1(raw: unknown): TripDiBoundaryAdmissionV1 | null {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const record = (raw as Record<string, unknown>)[TRIP_DI_BOUNDARY_ADMISSION_V1_KEY];
  if (record == null || typeof record !== 'object' || Array.isArray(record)) return null;
  const r = record as Record<string, unknown>;
  const contractVersion = typeof r.contractVersion === 'number' ? r.contractVersion : 1;
  if (contractVersion !== TRIP_DI_BOUNDARY_ADMISSION_CONTRACT_VERSION) return null;
  const revisionKey = typeof r.revisionKey === 'string' ? r.revisionKey : '';
  const releasedAtUtc = typeof r.releasedAtUtc === 'string' ? r.releasedAtUtc : '';
  const releasedBy =
    r.releasedBy === 'RECONCILIATION' || r.releasedBy === 'OPERATOR' || r.releasedBy === 'LIVE_FSM_SETTLEMENT'
      ? r.releasedBy
      : null;
  if (!revisionKey || !releasedAtUtc || !releasedBy) return null;
  return { contractVersion, revisionKey, releasedAtUtc, releasedBy };
}

export function buildTripDiBoundaryAdmissionPatch(
  revisionKey: string,
  releasedBy: TripDiBoundaryAdmissionV1['releasedBy'],
  now: Date = new Date(),
): Record<string, unknown> {
  return {
    [TRIP_DI_BOUNDARY_ADMISSION_V1_KEY]: {
      contractVersion: TRIP_DI_BOUNDARY_ADMISSION_CONTRACT_VERSION,
      revisionKey,
      releasedAtUtc: now.toISOString(),
      releasedBy,
    },
  };
}

export function canReleaseTripDiBoundaryAdmission(scope: TripDiBoundaryAdmissionScope): TripDiBoundaryAdmissionBlockCode | null {
  if (scope.tripStatus !== 'COMPLETED' || scope.endTime == null) return 'TRIP_NOT_COMPLETED';
  if (scope.detectionState != null && scope.detectionState !== 'RESTING') return 'FSM_STILL_ACTIVE_ON_TRIP';
  if (scope.activeTripId != null && scope.activeTripId === scope.tripId) return 'FSM_STILL_ACTIVE_ON_TRIP';
  if (scope.proposedBoundaryRepairCount > 0) return 'PROPOSED_BOUNDARY_REPAIR_OPEN';
  const refresh = readBoundaryRefreshRecord(scope.rawDetectionMeta);
  if (isBoundaryRefreshRetryable(refresh)) {
    if (!partialExtensionAllowsAdmissionDuringRetryableRefresh(scope.rawDetectionMeta)) {
      return 'BOUNDARY_REFRESH_IN_FLIGHT';
    }
  }
  return null;
}

export function evaluateTripDiBoundaryAdmission(scope: TripDiBoundaryAdmissionScope): TripDiBoundaryAdmissionEvaluation {
  const releaseBlock = canReleaseTripDiBoundaryAdmission(scope);
  if (releaseBlock != null) {
    return { ok: false, code: releaseBlock };
  }
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
  const admission = readTripDiBoundaryAdmissionV1(scope.rawDetectionMeta);
  if (!admission) return { ok: false, code: 'ADMISSION_RECORD_MISSING' };
  if (admission.revisionKey !== revisionKey) return { ok: false, code: 'ADMISSION_REVISION_MISMATCH' };
  return { ok: true, admission };
}
