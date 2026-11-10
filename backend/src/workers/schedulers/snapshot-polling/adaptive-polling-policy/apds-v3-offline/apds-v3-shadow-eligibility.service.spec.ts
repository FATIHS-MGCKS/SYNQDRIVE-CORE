import { ApdsV3ShadowEligibilityService } from './apds-v3-shadow-eligibility.service';

describe('ApdsV3ShadowEligibilityService', () => {
  const findFirst = jest.fn();
  const prisma = { vehicle: { findFirst } };
  const svc = new ApdsV3ShadowEligibilityService(prisma as never);

  beforeEach(() => jest.resetAllMocks());

  it('rejects tenant mismatch / missing vehicle', async () => {
    findFirst.mockResolvedValueOnce(null);
    await expect(svc.resolveForVehicle('org-a', 'veh-x')).resolves.toEqual({
      eligible: false,
      reason: 'VEHICLE_NOT_FOUND_OR_TENANT_MISMATCH',
    });
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'veh-x', organizationId: 'org-a' },
      }),
    );
  });

  it('rejects disconnected DIMO link', async () => {
    findFirst.mockResolvedValueOnce({
      id: 'veh-1',
      organizationId: 'org-b',
      registryLifecycle: 'ACTIVE',
      dimoVehicle: { connectionStatus: 'DISCONNECTED' },
      dataSourceLinks: [{ id: 'link-9' }],
    });
    await expect(svc.resolveForVehicle('org-b', 'veh-1')).resolves.toEqual({
      eligible: false,
      reason: 'CONNECTIVITY_INELIGIBLE',
    });
  });

  it('accepts active operational vehicle with DIMO link', async () => {
    findFirst.mockResolvedValueOnce({
      id: 'veh-2',
      organizationId: 'org-c',
      registryLifecycle: 'ACTIVE',
      dimoVehicle: { connectionStatus: 'CONNECTED' },
      dataSourceLinks: [{ id: 'link-3' }],
    });
    await expect(svc.resolveForVehicle('org-c', 'veh-2')).resolves.toMatchObject({
      eligible: true,
      providerSourceLinkId: 'link-3',
    });
  });
});
