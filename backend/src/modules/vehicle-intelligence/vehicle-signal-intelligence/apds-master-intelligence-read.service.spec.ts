import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ApdsMasterIntelligenceReadService } from './apds-master-intelligence-read.service';
import * as p5h1Config from './vsi-p5h1-profile-revision-history.config';

describe('ApdsMasterIntelligenceReadService tenant scope', () => {
  const prisma = {
    vehicle: { findFirst: jest.fn() },
    vehicleDataSourceLink: { findFirst: jest.fn() },
    apdShadowReconciliationDecision: {
      count: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      groupBy: jest.fn(),
    },
    apdShadowActivationEpoch: { findFirst: jest.fn(), findMany: jest.fn() },
    dimoPollLog: { findFirst: jest.fn() },
    vsiApdsP5CorrelationEvidence: { count: jest.fn() },
  };
  const revisionHistory = { resolveRevisionAsOf: jest.fn() };

  let service: ApdsMasterIntelligenceReadService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ApdsMasterIntelligenceReadService(prisma as never, revisionHistory as never);
  });

  it('rejects cross-org vehicle access', async () => {
    prisma.vehicle.findFirst.mockResolvedValue(null);
    await expect(service.getOverview('org-a', 'veh-1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects invalid decision cursor', async () => {
    prisma.vehicle.findFirst.mockResolvedValue({ id: 'veh-1' });
    await expect(
      service.getDecisionHistory({
        organizationId: 'org-a',
        vehicleId: 'veh-1',
        cursor: 'bad-cursor',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('returns NOT_CAPTURED revision semantics in VSI correlation when P5-H1 disabled', async () => {
    jest.spyOn(p5h1Config, 'isVsiP5h1ProfileRevisionHistoryCaptureEnabled').mockReturnValue(false);
    prisma.vehicle.findFirst.mockResolvedValue({ id: 'veh-1' });
    prisma.vehicleDataSourceLink.findFirst.mockResolvedValue({ id: 'link-1' });
    prisma.apdShadowReconciliationDecision.findUnique.mockResolvedValue({
      organizationId: 'org-a',
      vehicleId: 'veh-1',
      opportunityId: 'opp-1',
      policyVersion: 'P25_APD_B2_V1',
      decisionAt: new Date('2026-10-28T10:00:00.000Z'),
    });
    prisma.vsiApdsP5CorrelationEvidence.count.mockResolvedValue(0);

    const result = await service.getVsiCorrelation({
      organizationId: 'org-a',
      vehicleId: 'veh-1',
      providerSourceLinkId: 'link-1',
      opportunityId: 'opp-1',
      policyVersion: 'P25_APD_B2_V1',
      decisionAt: '2026-10-28T10:00:00.000Z',
    });
    expect(result.revisionHistoryCaptureStatus).toBe('NOT_CAPTURED');
    expect(result.historicalCorrelationIsNotRuntimeDriver).toBe(true);
    expect(revisionHistory.resolveRevisionAsOf).not.toHaveBeenCalled();
  });
});
