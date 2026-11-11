import { ApdsV3ShadowEligibilityService } from './apds-v3-shadow-eligibility.service';

describe('ApdsV3ShadowEligibilityService', () => {
  const vehicleFindFirst = jest.fn();
  const linkFindFirst = jest.fn();
  const prisma = {
    vehicle: { findFirst: vehicleFindFirst },
    vehicleDataSourceLink: { findFirst: linkFindFirst },
  };
  const svc = new ApdsV3ShadowEligibilityService(prisma as never);

  beforeEach(() => jest.resetAllMocks());

  it('fails closed when baseline source link id is missing', async () => {
    await expect(svc.resolveForBaselinePoll('org-a', 'veh-x', null)).resolves.toEqual({
      eligible: false,
      reason: 'BASELINE_SOURCE_LINK_MISSING',
    });
    expect(linkFindFirst).not.toHaveBeenCalled();
  });

  it('rejects baseline link not found for vehicle/tenant', async () => {
    linkFindFirst.mockResolvedValueOnce(null);
    await expect(svc.resolveForBaselinePoll('org-a', 'veh-x', 'link-missing')).resolves.toEqual({
      eligible: false,
      reason: 'BASELINE_SOURCE_LINK_NOT_FOUND',
    });
  });

  it('rejects inactive baseline link', async () => {
    linkFindFirst.mockResolvedValueOnce({ id: 'link-1', isActive: false });
    await expect(svc.resolveForBaselinePoll('org-a', 'veh-x', 'link-1')).resolves.toEqual({
      eligible: false,
      reason: 'BASELINE_SOURCE_LINK_INACTIVE',
    });
  });

  it('rejects superseded baseline link binding on vehicle', async () => {
    linkFindFirst.mockResolvedValueOnce({ id: 'link-9', isActive: true });
    vehicleFindFirst.mockResolvedValueOnce({
      id: 'veh-1',
      organizationId: 'org-b',
      registryLifecycle: 'ACTIVE',
      dimoVehicle: { connectionStatus: 'CONNECTED' },
      dataSourceLinks: [],
    });
    await expect(svc.resolveForBaselinePoll('org-b', 'veh-1', 'link-9')).resolves.toEqual({
      eligible: false,
      reason: 'BASELINE_SOURCE_LINK_SUPERSEDED',
    });
  });

  it('accepts active operational vehicle with required DIMO link', async () => {
    linkFindFirst.mockResolvedValueOnce({ id: 'link-3', isActive: true });
    vehicleFindFirst.mockResolvedValueOnce({
      id: 'veh-2',
      organizationId: 'org-c',
      registryLifecycle: 'ACTIVE',
      dimoVehicle: { connectionStatus: 'CONNECTED' },
      dataSourceLinks: [{ id: 'link-3' }],
    });
    await expect(svc.resolveForBaselinePoll('org-c', 'veh-2', 'link-3')).resolves.toMatchObject({
      eligible: true,
      providerSourceLinkId: 'link-3',
    });
  });
});
