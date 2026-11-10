import { BadRequestException, NotFoundException } from '@nestjs/common';
import { VsiMasterFsdReadService } from './vsi-master-fsd-read.service';
import {
  build26SignalCatalogNamesV1,
  buildLiveCatalog26CheckpointFixtureV1,
  buildLiveCatalogOnlyCheckpointFixtureV1,
} from './__fixtures__/vsi-master-fsd-read.fixture.v1';
import { FSD3_CATALOG_FINGERPRINT_EVIDENCE_SIGNAL_V1 } from '@modules/vehicle-intelligence/full-signal-discovery/orchestration/fsd3-discovery-request.v1';

describe('VsiMasterFsdReadService', () => {
  const prisma = {
    vehicle: { findFirst: jest.fn() },
    vehicleDataSourceLink: { findFirst: jest.fn() },
    fsdDiscoveryRun: { findFirst: jest.fn(), findMany: jest.fn() },
    fsdDiscoveryStage: { findMany: jest.fn() },
    fsdDiscoverySignalEvidence: { findMany: jest.fn(), count: jest.fn(), groupBy: jest.fn() },
  };

  let service: VsiMasterFsdReadService;

  const scopeOk = () => {
    prisma.vehicle.findFirst.mockResolvedValue({ id: 'veh-1' });
    prisma.vehicleDataSourceLink.findFirst.mockResolvedValue({ id: 'link-1' });
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new VsiMasterFsdReadService(prisma as never);
  });

  it('rejects cross-org vehicle access', async () => {
    prisma.vehicle.findFirst.mockResolvedValue(null);
    await expect(service.getSummary('org-a', 'veh-1', 'link-1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects run inspector for out-of-scope run id', async () => {
    scopeOk();
    prisma.fsdDiscoveryRun.findFirst.mockResolvedValue(null);
    await expect(
      service.getRunInspector({
        organizationId: 'org-a',
        vehicleId: 'veh-1',
        providerSourceLinkId: 'link-1',
        runId: 'run-other',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects invalid run history cursor', async () => {
    scopeOk();
    await expect(
      service.getRunHistory({
        organizationId: 'org-a',
        vehicleId: 'veh-1',
        providerSourceLinkId: 'link-1',
        cursor: 'bad',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  function catalogRunRow(id: string, status: string, createdAt: string) {
    const checkpoint = buildLiveCatalogOnlyCheckpointFixtureV1();
    return {
      id,
      runKey: id,
      organizationId: 'org-a',
      vehicleId: 'veh-1',
      providerSourceLinkId: 'link-1',
      discoveryStream: 'FSD3_CATALOG_SNAPSHOT',
      status,
      dimoTokenId: 1,
      connectionIdentityFingerprint: 'fp',
      invalidatedAt: null,
      supersededByRunId: null,
      completedAt: status === 'COMPLETED' ? new Date(createdAt) : null,
      createdAt: new Date(createdAt),
      failureClass: null,
      stages: [
        {
          stageType: 'CATALOG',
          status: status === 'COMPLETED' ? 'SUCCEEDED' : 'PLANNED',
          checkpointJson: checkpoint,
          lastHttpStatus: 200,
        },
        { stageType: 'SNAPSHOT', status: 'PLANNED', checkpointJson: {}, lastHttpStatus: null },
      ],
    };
  }

  it('reports catalog-only snapshot as NOT_EXECUTED and uses authoritative not latest activity', async () => {
    scopeOk();
    const older = catalogRunRow('run-old', 'COMPLETED', '2026-11-09T19:41:00Z');
    const newerFailed = catalogRunRow('run-new', 'FAILED', '2026-11-10T19:41:00Z');
    prisma.fsdDiscoveryRun.findMany.mockImplementation(async (args: { where: { discoveryStream: string } }) => {
      if (args.where.discoveryStream === 'FSD3_CATALOG_SNAPSHOT') return [newerFailed, older];
      return [];
    });
    prisma.fsdDiscoverySignalEvidence.count.mockResolvedValue(0);

    const summary = await service.getSummary('org-a', 'veh-1', 'link-1');
    expect(summary.catalog.availability).toBe('AUTHORITATIVE_LIVE');
    expect(summary.catalog.authoritativeRunId).toBe('run-old');
    expect(summary.execution.fsd3.latestActivityRunId).toBe('run-new');
    expect(summary.evidence.snapshot).toBe('NOT_EXECUTED');
    expect(summary.execution.fsd4.state).toBe('NOT_YET_EXECUTED');
  });

  it('paginates signal explorer by unique catalog names across multi-stage evidence rows', async () => {
    scopeOk();
    const checkpoint = buildLiveCatalog26CheckpointFixtureV1();
    const signalNames = build26SignalCatalogNamesV1();
    const run = {
      id: 'run-fsd3',
      runKey: 'k',
      organizationId: 'org-a',
      vehicleId: 'veh-1',
      providerSourceLinkId: 'link-1',
      discoveryStream: 'FSD3_CATALOG_SNAPSHOT',
      status: 'COMPLETED',
      dimoTokenId: 1,
      connectionIdentityFingerprint: 'fp',
      invalidatedAt: null,
      completedAt: new Date(),
      createdAt: new Date(),
      stages: [
        { stageType: 'CATALOG', status: 'SUCCEEDED', checkpointJson: checkpoint, lastHttpStatus: 200 },
        { stageType: 'SNAPSHOT', status: 'SUCCEEDED', checkpointJson: {}, lastHttpStatus: 200 },
      ],
    };
    prisma.fsdDiscoveryRun.findMany.mockImplementation(async (args: { where: { discoveryStream: string } }) => {
      if (args.where.discoveryStream === 'FSD3_CATALOG_SNAPSHOT') return [run];
      return [];
    });

    const evidenceRows: Array<Record<string, unknown>> = [];
    for (const signalName of signalNames) {
      for (const stageType of ['CATALOG', 'SNAPSHOT', 'HISTORICAL']) {
        evidenceRows.push({
          signalName,
          declaredByProvider: true,
          schemaShape: null,
          evidenceState: 'OBSERVED',
          queryPlanned: stageType !== 'CATALOG',
          queryAccepted: stageType !== 'CATALOG' ? true : null,
          observedValue: stageType !== 'CATALOG' ? true : null,
          stageType,
          provenanceJson: {},
          qualityJson: { observationKind: 'OBSERVED' },
          runId: 'run-fsd3',
        });
      }
    }
  evidenceRows.push({
    signalName: FSD3_CATALOG_FINGERPRINT_EVIDENCE_SIGNAL_V1,
    stageType: 'CATALOG',
    evidenceState: 'DECLARED_ONLY',
    queryPlanned: false,
    queryAccepted: null,
    observedValue: null,
    runId: 'run-fsd3',
    declaredByProvider: false,
    schemaShape: null,
    provenanceJson: {},
    qualityJson: {},
  });

    prisma.fsdDiscoverySignalEvidence.findMany.mockImplementation(async (args: { where: { signalName: { in: string[] } } }) => {
      const allowed = new Set(args.where.signalName.in);
      return evidenceRows.filter((r) => allowed.has(r.signalName as string));
    });

    const page1 = await service.getSignalExplorer({
      organizationId: 'org-a',
      vehicleId: 'veh-1',
      providerSourceLinkId: 'link-1',
      limit: 10,
    });
    expect(page1.items).toHaveLength(10);
    expect(page1.page.hasMore).toBe(true);
    expect(page1.aggregates.declaredSignalCount).toBe(26);
    expect(page1.items.map((i) => i.providerNativeSignalName)).not.toContain(FSD3_CATALOG_FINGERPRINT_EVIDENCE_SIGNAL_V1);

    const page2 = await service.getSignalExplorer({
      organizationId: 'org-a',
      vehicleId: 'veh-1',
      providerSourceLinkId: 'link-1',
      limit: 10,
      cursor: page1.page.nextCursor,
    });
    const page1Names = new Set(page1.items.map((i) => i.providerNativeSignalName));
    for (const item of page2.items) {
      expect(page1Names.has(item.providerNativeSignalName)).toBe(false);
    }
    expect(page1.items[0]!.snapshotQuery?.queryPlanned).toBe(true);
    expect(page1.items[0]!.catalogQuery.queryPlanned).toBe(false);
  });

  it('does not invoke provider orchestration (read-only prisma)', async () => {
    scopeOk();
    prisma.fsdDiscoveryRun.findMany.mockResolvedValue([]);
    prisma.fsdDiscoverySignalEvidence.count.mockResolvedValue(0);
    await service.getSummary('org-a', 'veh-1', 'link-1');
    expect(prisma.fsdDiscoveryRun.findMany).toHaveBeenCalled();
  });
});
