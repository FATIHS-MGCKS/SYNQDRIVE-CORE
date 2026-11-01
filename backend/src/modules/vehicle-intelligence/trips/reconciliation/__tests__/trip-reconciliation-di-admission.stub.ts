import type { TripDiBoundaryAdmissionService } from '../../di-boundary-admission/trip-di-boundary-admission.service';

/** Minimal stub for TripReconciliationService unit harnesses (production Nest always injects real service). */
export function stubTripDiBoundaryAdmissionService(): TripDiBoundaryAdmissionService {
  return {
    releaseForBoundaryScannedTripIds: jest.fn().mockResolvedValue({ released: 0, skipped: 0 }),
    releaseLiveFsmSplitSegmentsInReconciliationWindow: jest
      .fn()
      .mockResolvedValue({ released: 0, skipped: 0, tripIds: [] }),
    tryReleaseAfterPartialTripBoundaryExtension: jest
      .fn()
      .mockResolvedValue({ released: false, reason: 'BOUNDARY_REPAIR_NOT_COMMITTED' }),
    tryReleaseForTripTransactional: jest.fn().mockResolvedValue(false),
  } as unknown as TripDiBoundaryAdmissionService;
}
