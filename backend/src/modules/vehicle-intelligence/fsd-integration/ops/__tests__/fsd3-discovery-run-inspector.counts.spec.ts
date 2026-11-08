import { Fsd3DiscoveryRunInspectorService } from '../fsd3-discovery-run-inspector.service';

describe('Fsd3DiscoveryRunInspectorService evidence counting', () => {
  it('counts OBSERVED, NULL, DEFERRED and QUERY_FAILED from evidenceState and qualityJson', async () => {
    const runId = 'run-1';
    const orgId = 'org-1';
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue({ status: 'ACTIVE', platformRole: 'MASTER_ADMIN' }) },
      fsdDiscoveryRun: {
        findFirst: jest.fn().mockResolvedValue({
          id: runId,
          organizationId: orgId,
          vehicleId: 'v1',
          providerSourceLinkId: 'l1',
          discoveryStream: 'FSD3_CATALOG_SNAPSHOT',
          status: 'COMPLETED',
          version: 1,
          leaseOwner: null,
          leaseExpiresAt: null,
          invalidatedAt: null,
        }),
      },
      fsdDiscoverySignalEvidence: {
        findMany: jest.fn().mockResolvedValue([
          { evidenceState: 'OBSERVED', qualityJson: { observationKind: 'VALID_NONZERO' } },
          { evidenceState: 'OBSERVED', qualityJson: { observationKind: 'NULL' } },
          { evidenceState: 'DEFERRED', qualityJson: {} },
          { evidenceState: 'QUERY_FAILED', qualityJson: {} },
        ]),
      },
    };
    const persistence = {
      loadRunOrchestrationBundle: jest.fn().mockResolvedValue({ stages: [] }),
    };
    const svc = new Fsd3DiscoveryRunInspectorService(prisma as never, persistence as never);
    const report = await svc.inspectTenantScoped({ actorUserId: 'actor', organizationId: orgId, runId });
    expect(report.signalObservationCounts).toEqual({
      observed: 1,
      null: 1,
      deferred: 1,
      queryFailed: 1,
      absent: 0,
      other: 0,
      total: 4,
    });
  });
});
