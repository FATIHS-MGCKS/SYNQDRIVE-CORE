import { Test } from '@nestjs/testing';

import { PrismaService } from '@shared/database/prisma.service';
import { TripReconciliationService } from '../../modules/vehicle-intelligence/trips/reconciliation/trip-reconciliation.service';
import { TripReconciliationScheduler } from './trip-reconciliation.scheduler';
import { SchedulerLeaderGuardService } from '@shared/scheduler-leader/scheduler-leader-guard.service';

describe('TripReconciliationScheduler cohort independence', () => {
  let scheduler: TripReconciliationScheduler;
  let vlsFindMany: jest.Mock;
  let reconcileWindow: jest.Mock;
  let runDurableAdmissionRecoveryFleetPass: jest.Mock;

  beforeEach(async () => {
    vlsFindMany = jest.fn().mockResolvedValue([]);
    reconcileWindow = jest.fn().mockResolvedValue({
      repairsProposed: 0,
      repairsApplied: 0,
      repairsRejected: 0,
    });
    runDurableAdmissionRecoveryFleetPass = jest.fn().mockResolvedValue({
      vehiclesEligible: 0,
      vehiclesScanned: 0,
      writerAttempts: 0,
      released: 0,
      durationMs: 1,
    });

    const moduleRef = await Test.createTestingModule({
      providers: [
        TripReconciliationScheduler,
        {
          provide: PrismaService,
          useValue: {
            vehicleLatestState: { findMany: vlsFindMany },
          },
        },
        {
          provide: TripReconciliationService,
          useValue: { reconcileWindow, runDurableAdmissionRecoveryFleetPass },
        },
        {
          provide: SchedulerLeaderGuardService,
          useValue: { shouldRun: jest.fn().mockReturnValue(true) },
        },
      ],
    }).compile();

    scheduler = moduleRef.get(TripReconciliationScheduler);
  });

  it('fast repair uses activity-based cohort (not providerFetchedAt alone)', async () => {
    await scheduler.fastRepair();

    expect(vlsFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.any(Array),
        }),
        orderBy: { lastSeenAt: 'desc' },
      }),
    );
    const where = vlsFindMany.mock.calls[0][0].where;
    expect(JSON.stringify(where)).not.toContain('providerFetchedAt');
    expect(JSON.stringify(where)).toContain('lastSeenAt');
    expect(JSON.stringify(where)).toContain('lastActivityAt');
    expect(where).not.toHaveProperty('connectionStatus');
    expect(where).not.toHaveProperty('dimoVehicle');
  });

  it('warm repair selects vehicles by dimoTokenId only — not connectionStatus', async () => {
    vlsFindMany.mockResolvedValue([
      { vehicleId: 'veh-disconnected-but-token' },
      { vehicleId: 'veh-connected' },
    ]);

    await scheduler.warmRepair();

    expect(vlsFindMany).toHaveBeenCalledWith({
      where: { dimoTokenId: { not: null } },
      select: { vehicleId: true },
    });
    expect(reconcileWindow).toHaveBeenCalledTimes(2);
    expect(reconcileWindow).toHaveBeenCalledWith(
      'veh-disconnected-but-token',
      expect.any(Date),
      expect.any(Date),
      'warm',
      expect.objectContaining({ useDimoSegmentFallback: true, recoveryFleetBudget: expect.anything() }),
    );
  });

  it('cold repair uses the same token-only cohort as warm', async () => {
    vlsFindMany.mockResolvedValue([{ vehicleId: 'veh-1' }]);

    await scheduler.coldRepair();

    expect(vlsFindMany).toHaveBeenCalledWith({
      where: { dimoTokenId: { not: null } },
      select: { vehicleId: true },
    });
    expect(reconcileWindow).toHaveBeenCalledWith(
      'veh-1',
      expect.any(Date),
      expect.any(Date),
      'cold',
      expect.objectContaining({ useDimoSegmentFallback: true, recoveryFleetBudget: expect.anything() }),
    );
  });

  it('admission recovery fleet pass uses leader guard and delegates to reconciliation service', async () => {
    const prior = process.env.TRIP_DI_BOUNDARY_ADMISSION_RECOVERY_ACTIVATED_AT_UTC;
    process.env.TRIP_DI_BOUNDARY_ADMISSION_RECOVERY_ACTIVATED_AT_UTC = '2026-11-01T00:00:00.000Z';
    const leaderGuard = {
      shouldRun: jest.fn().mockReturnValue(true),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        TripReconciliationScheduler,
        {
          provide: PrismaService,
          useValue: { vehicleLatestState: { findMany: jest.fn() } },
        },
        {
          provide: TripReconciliationService,
          useValue: { reconcileWindow, runDurableAdmissionRecoveryFleetPass },
        },
        { provide: SchedulerLeaderGuardService, useValue: leaderGuard },
      ],
    }).compile();
    const sched = moduleRef.get(TripReconciliationScheduler);
    await sched.admissionRecoveryFleetPass();
    expect(leaderGuard.shouldRun).toHaveBeenCalledWith('trip_di_boundary_admission_recovery_fleet');
    expect(runDurableAdmissionRecoveryFleetPass).toHaveBeenCalled();
    if (prior === undefined) delete process.env.TRIP_DI_BOUNDARY_ADMISSION_RECOVERY_ACTIVATED_AT_UTC;
    else process.env.TRIP_DI_BOUNDARY_ADMISSION_RECOVERY_ACTIVATED_AT_UTC = prior;
  });
});
