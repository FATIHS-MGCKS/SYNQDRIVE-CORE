import { VehicleOffboardingService } from '../services/vehicle-offboarding.service';
import { VehicleOnboardingError } from '../errors/vehicle-onboarding.errors';

describe('VehicleOffboardingService', () => {
  it('rejects organization transfer attempts fail-closed', async () => {
    const prisma = { $transaction: jest.fn() };
    const service = new VehicleOffboardingService(
      prisma as any,
      { enqueueInTransaction: jest.fn() } as any,
      { invalidateDimoSourceLinksForVehicleLifecycle: jest.fn() } as any,
    );
    await expect(
      service.offboardVehicle({
        organizationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        vehicleId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        reason: 'ADMINISTRATIVE_OFFBOARD',
        actorUserId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        idempotencyKey: 'key-1',
        destinationOrganizationId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      }),
    ).rejects.toMatchObject({ code: 'ORG_TRANSFER_NOT_SUPPORTED' });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
