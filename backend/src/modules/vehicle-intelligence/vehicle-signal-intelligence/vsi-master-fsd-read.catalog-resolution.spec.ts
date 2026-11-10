import { buildLiveCatalogOnlyCheckpointFixtureV1 } from './__fixtures__/vsi-master-fsd-read.fixture.v1';
import {
  describeExplicitRunCatalog,
  pickAuthoritativeFsd3Catalog,
  type FsdRunWithStages,
} from './vsi-master-fsd-read.catalog-resolution';

function fsd3Run(overrides: Partial<FsdRunWithStages> & { id: string; status: FsdRunWithStages['status'] }): FsdRunWithStages {
  const checkpoint = buildLiveCatalogOnlyCheckpointFixtureV1();
  return {
    runKey: overrides.id,
    organizationId: 'org-a',
    vehicleId: 'veh-1',
    providerSourceLinkId: 'link-1',
    discoveryStream: 'FSD3_CATALOG_SNAPSHOT',
    dimoTokenId: 1,
    connectionIdentityFingerprint: 'fp',
    invalidatedAt: null,
    supersededByRunId: null,
    createdAt: new Date('2026-11-10T10:00:00Z'),
    completedAt: overrides.status === 'COMPLETED' ? new Date('2026-11-10T10:05:00Z') : null,
    stages: [
      {
        stageType: 'CATALOG',
        status: overrides.status === 'COMPLETED' ? 'SUCCEEDED' : 'PLANNED',
        checkpointJson: checkpoint,
        lastHttpStatus: 200,
      } as never,
      { stageType: 'SNAPSHOT', status: 'PLANNED', checkpointJson: {}, lastHttpStatus: null } as never,
    ],
    ...overrides,
  } as FsdRunWithStages;
}

describe('pickAuthoritativeFsd3Catalog', () => {
  it('keeps older completed authoritative catalog when newer run is FAILED', () => {
    const older = fsd3Run({ id: 'run-old', status: 'COMPLETED', createdAt: new Date('2026-11-09T10:00:00Z') });
    const newerFailed = fsd3Run({ id: 'run-new', status: 'FAILED', createdAt: new Date('2026-11-10T10:00:00Z') });
    const picked = pickAuthoritativeFsd3Catalog([newerFailed, older]);
    expect(picked?.run.id).toBe('run-old');
  });

  it('never treats FAILED run with succeeded catalog stage as authoritative', () => {
    const failedShell = fsd3Run({ id: 'run-failed-shell', status: 'FAILED', createdAt: new Date('2026-11-10T10:00:00Z') });
    failedShell.stages[0]!.status = 'SUCCEEDED';
    expect(pickAuthoritativeFsd3Catalog([failedShell])).toBeNull();
    const described = describeExplicitRunCatalog(failedShell);
    expect(described.authoritative).toBe(false);
  });

  it('keeps older completed authoritative catalog when newer run is PENDING', () => {
    const older = fsd3Run({ id: 'run-old', status: 'COMPLETED', createdAt: new Date('2026-11-09T10:00:00Z') });
    const newerPending = fsd3Run({ id: 'run-new', status: 'PENDING', createdAt: new Date('2026-11-10T10:00:00Z') });
    const picked = pickAuthoritativeFsd3Catalog([newerPending, older]);
    expect(picked?.run.id).toBe('run-old');
  });

  it('marks explicit invalidated run as non-authoritative', () => {
    const run = fsd3Run({
      id: 'run-inv',
      status: 'COMPLETED',
      invalidatedAt: new Date('2026-11-10T11:00:00Z'),
    });
    const described = describeExplicitRunCatalog(run);
    expect(described.authoritative).toBe(false);
    expect(described.provenance?.availability).toBe('INVALIDATED');
  });
});
