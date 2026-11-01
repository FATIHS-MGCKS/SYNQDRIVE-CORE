import { OneAutoProviderExecutionService } from './oneauto-provider-execution.service';
import { OneAutoProviderJobStatus } from '@prisma/client';
import { ConfigService } from '@nestjs/config';

describe('OneAutoProviderExecutionService dispatch safety', () => {
  it('does not call HTTP when contract unverified', async () => {
    const prisma = {
      oneAutoProviderJob: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'j1',
          organizationId: 'org1',
          vehicleId: 'v1',
          vinSnapshot: 'WBA12345678901234',
          serviceSku: 'OE_VIN_LOOKUP_EU',
          status: OneAutoProviderJobStatus.QUEUED,
          pollAttemptCount: 0,
          expiresAt: new Date(Date.now() + 60_000),
          initialProviderDispatchAt: null,
        }),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      oneAutoProviderResponse: { create: jest.fn() },
      vehicle: { findFirst: jest.fn() },
    };
    const http = { executeProviderGet: jest.fn() };
    const config = { get: () => ({ enabled: true }) } as unknown as ConfigService;
    const queue = { add: jest.fn() };
    const svc = new OneAutoProviderExecutionService(
      prisma as never,
      http as never,
      config,
      queue as never,
    );
    await svc.processJob('j1', 'initial');
    expect(http.executeProviderGet).not.toHaveBeenCalled();
    expect(prisma.oneAutoProviderJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ lastErrorCode: 'CONTRACT_UNVERIFIED' }),
      }),
    );
  });
});
