import { TripReconciliationService } from './trip-reconciliation.service';

describe('TripReconciliationService durable admission recovery isolation', () => {
  it('runs recovery in finally even when an earlier reconciliation phase throws', async () => {
    const runDurableAdmissionRecoveryPass = jest.fn().mockResolvedValue({
      mode: 'SHADOW',
      scanOutcome: 'none_in_window',
      scanned: 0,
      needsRelease: 0,
      released: 0,
      skipped: 0,
      guarded: 0,
      alreadyCurrent: 0,
      capTruncated: false,
      durationMs: 1,
    });
    const service = Object.create(TripReconciliationService.prototype) as TripReconciliationService;
    (service as unknown as { logger: { warn: jest.Mock } }).logger = { warn: jest.fn() };
    (service as unknown as { diBoundaryAdmission: { runDurableAdmissionRecoveryPass: typeof runDurableAdmissionRecoveryPass } })
      .diBoundaryAdmission = { runDurableAdmissionRecoveryPass };
    (service as unknown as { resolveOrganizationId: jest.Mock }).resolveOrganizationId = jest
      .fn()
      .mockResolvedValue('org-1');
    (service as unknown as { repairStaleOngoingTrips: jest.Mock }).repairStaleOngoingTrips = jest
      .fn()
      .mockRejectedValue(new Error('phase-1-failed'));
    (service as unknown as { retryPendingBoundaryRefreshes: jest.Mock }).retryPendingBoundaryRefreshes =
      jest.fn();

    await (
      service as unknown as {
        executeReconcileWindow: (
          v: string,
          f: Date,
          t: Date,
          tier: string,
          o?: unknown,
        ) => Promise<unknown>;
      }
    ).executeReconcileWindow('veh-1', new Date(), new Date(), 'fast', {});

    expect(runDurableAdmissionRecoveryPass).toHaveBeenCalledWith('org-1', 'veh-1', {
      fleetBudget: undefined,
    });
  });
});
