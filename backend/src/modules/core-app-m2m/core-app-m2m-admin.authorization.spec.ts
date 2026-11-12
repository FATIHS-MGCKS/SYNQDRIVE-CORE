import { NotFoundException } from '@nestjs/common';
import { CoreAppM2mClientService } from './core-app-m2m-client.service';

describe('CoreAppM2mClientService — admin authorization', () => {
  const prisma = {
    coreAppServiceOrgGrant: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
  };
  let service: CoreAppM2mClientService;

  beforeEach(() => {
    jest.resetAllMocks();
    service = new CoreAppM2mClientService(prisma as any);
  });

  it('rejects grant revoke when grantId does not belong to service client', async () => {
    prisma.coreAppServiceOrgGrant.findFirst.mockResolvedValue(null);
    await expect(service.revokeGrantForClient('client-a', 'grant-x')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('revokes grant when bound to service client', async () => {
    prisma.coreAppServiceOrgGrant.findFirst.mockResolvedValue({
      id: 'grant-x',
      serviceClientId: 'client-a',
    });
    prisma.coreAppServiceOrgGrant.update.mockResolvedValue({ id: 'grant-x', grantVersion: 2 });
    const result = await service.revokeGrantForClient('client-a', 'grant-x');
    expect(result).toEqual({ id: 'grant-x', grantVersion: 2 });
    expect(prisma.coreAppServiceOrgGrant.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'grant-x' } }),
    );
  });
});
