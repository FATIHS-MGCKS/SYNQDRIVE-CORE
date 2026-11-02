import { ForbiddenException } from '@nestjs/common';
import { VehiclesController } from './vehicles.controller';

describe('vehicle-oem-specification-patch.security', () => {
  const orgId = 'org-a';
  const vehicleId = 'veh-a';

  it('org-scoped PATCH forwards actorPlatformRole to VehiclesService.update', async () => {
    const vehiclesService = {
      update: jest.fn().mockResolvedValue({ id: vehicleId }),
    };
    const controller = new VehiclesController(
      vehiclesService as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await controller.updateByOrg(
      orgId,
      vehicleId,
      {
        oemEngineCode: 'CBBB',
        technicalSpecificationSave: { confirmedFieldKeys: ['oemEngineCode'] },
      } as never,
      { user: { platformRole: 'MASTER_ADMIN' } },
    );

    expect(vehiclesService.update).toHaveBeenCalledWith(
      vehicleId,
      expect.objectContaining({ oemEngineCode: 'CBBB' }),
      orgId,
      expect.objectContaining({
        rawBody: expect.objectContaining({ oemEngineCode: 'CBBB' }),
        actorPlatformRole: 'MASTER_ADMIN',
      }),
    );
  });

  it('direct vehicle PATCH forwards actorPlatformRole (generic route)', async () => {
    const vehiclesService = {
      update: jest.fn().mockResolvedValue({ id: vehicleId }),
    };
    const controller = new VehiclesController(
      vehiclesService as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await controller.update(
      vehicleId,
      {
        oemEngineCode: 'CBBB',
        technicalSpecificationSave: { confirmedFieldKeys: ['oemEngineCode'] },
      } as never,
      { user: { platformRole: 'MASTER_ADMIN', organizationId: orgId } },
    );

    expect(vehiclesService.update).toHaveBeenCalledWith(
      vehicleId,
      expect.any(Object),
      undefined,
      expect.objectContaining({ actorPlatformRole: 'MASTER_ADMIN' }),
    );
  });

  it('org fleet.write caller without platformRole cannot pass Master gate at service layer', async () => {
    const { assertMasterAdminForOemSpecificationSave } = await import(
      './vehicle-oem-specification-patch.util'
    );
    expect(() =>
      assertMasterAdminForOemSpecificationSave(
        {
          oemEngineCode: 'X',
          technicalSpecificationSave: { confirmedFieldKeys: ['oemEngineCode'] },
        },
        undefined,
      ),
    ).toThrow(ForbiddenException);
  });
});
