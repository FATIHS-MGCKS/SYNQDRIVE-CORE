import { Fsd3DiscoveryRunInspectorService } from '../fsd3-discovery-run-inspector.service';

describe('Fsd3DiscoveryRunInspector edge cases', () => {
  it('reports partial run with no CATALOG ledger', async () => {
    const runId = 'run-partial';
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
          status: 'FAILED',
          version: 1,
          leaseOwner: null,
          leaseExpiresAt: null,
          invalidatedAt: null,
        }),
      },
      fsdDiscoverySignalEvidence: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const persistence = {
      loadRunOrchestrationBundle: jest.fn().mockResolvedValue({
        stages: [
          {
            stageType: 'CATALOG',
            status: 'FAILED',
            version: 1,
            checkpointJson: null,
          },
        ],
      }),
    };
    const svc = new Fsd3DiscoveryRunInspectorService(prisma as never, persistence as never);
    const report = await svc.inspectTenantScoped({ actorUserId: 'actor', organizationId: orgId, runId });
    expect(report.ledgerAttemptCount).toBeNull();
    expect(report.ledgerReconciliation).toBeNull();
    expect(report.status).toBe('FAILED');
  });

  it('aggregates snapshot stage ledger with catalog', async () => {
    const runId = 'run-multi';
    const orgId = 'org-1';
    const ledger = {
      budgetTotal: 2,
      attempts: [{ attemptKey: 'a1', queryFingerprint: 'fp1', outcome: 'SUCCEEDED', reservedAt: 't' }],
    };
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue({ status: 'ACTIVE', platformRole: 'MASTER_ADMIN' }) },
      fsdDiscoveryRun: {
        findFirst: jest.fn().mockResolvedValue({
          id: runId,
          organizationId: orgId,
          vehicleId: 'v1',
          providerSourceLinkId: 'l1',
          discoveryStream: 'FSD3_CATALOG_SNAPSHOT',
          status: 'PARTIAL',
          version: 2,
          leaseOwner: 'owner',
          leaseExpiresAt: new Date(Date.now() + 60_000),
          invalidatedAt: null,
        }),
      },
      fsdDiscoverySignalEvidence: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const persistence = {
      loadRunOrchestrationBundle: jest.fn().mockResolvedValue({
        stages: [
          {
            stageType: 'CATALOG',
            status: 'COMPLETED',
            version: 1,
            checkpointJson: { requestLedger: ledger },
          },
          {
            stageType: 'SNAPSHOT',
            status: 'PARTIAL',
            version: 1,
            checkpointJson: {
              requestLedger: {
                budgetTotal: 2,
                attempts: [
                  {
                    attemptKey: 's1',
                    queryFingerprint: 'fp2',
                    outcome: 'SUCCEEDED',
                    reservedAt: 't',
                  },
                ],
              },
            },
          },
        ],
      }),
    };
    const svc = new Fsd3DiscoveryRunInspectorService(prisma as never, persistence as never);
    const report = await svc.inspectTenantScoped({ actorUserId: 'actor', organizationId: orgId, runId });
    expect(report.ledgerReconciliation?.totalAttempts).toBe(2);
    expect(report.ledgerReconciliation?.catalogAttempts).toBe(1);
    expect(report.ledgerReconciliation?.snapshotAttempts).toBe(1);
  });
});
