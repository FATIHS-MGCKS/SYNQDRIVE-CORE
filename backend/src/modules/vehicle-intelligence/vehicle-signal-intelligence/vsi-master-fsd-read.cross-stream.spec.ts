import { buildLiveCatalogOnlyCheckpointFixtureV1 } from './__fixtures__/vsi-master-fsd-read.fixture.v1';
import type { FsdRunWithStages } from './vsi-master-fsd-read.catalog-resolution';
import { resolveFsd4HistoricalCrossStreamLink } from './vsi-master-fsd-read.cross-stream';

describe('resolveFsd4HistoricalCrossStreamLink', () => {
  const checkpoint = buildLiveCatalogOnlyCheckpointFixtureV1();
  const fp = checkpoint.catalogFetch!.declaredCatalogFingerprint!;

  const auth = {
    organizationId: 'org',
    vehicleId: 'veh',
    providerSourceLinkId: 'link',
    dimoTokenId: 1,
    connectionIdentityFingerprint: 'fp',
    declaredCatalogFingerprint: fp,
  };

  function fsd4(id: string, match: boolean): FsdRunWithStages {
    return {
      id,
      discoveryStream: 'FSD4_HISTORICAL',
      organizationId: 'org',
      vehicleId: 'veh',
      providerSourceLinkId: 'link',
      dimoTokenId: match ? 1 : 2,
      connectionIdentityFingerprint: match ? 'fp' : 'other',
      invalidatedAt: null,
      stages: [
        {
          stageType: 'CATALOG',
          status: 'SUCCEEDED',
          checkpointJson: match
            ? checkpoint
            : { catalogFetch: { declaredCatalogFingerprint: 'mismatch' } },
        } as never,
        { stageType: 'HISTORICAL', status: 'SUCCEEDED', checkpointJson: {} } as never,
      ],
    } as unknown as FsdRunWithStages;
  }

  it('links independent FSD4 run when identity and fingerprint match', () => {
    const link = resolveFsd4HistoricalCrossStreamLink({
      authoritative: auth,
      fsd4RunsNewestFirst: [fsd4('fsd4-a', true)],
    });
    expect(link.kind).toBe('LINKED');
    if (link.kind === 'LINKED') expect(link.fsd4Run.id).toBe('fsd4-a');
  });

  it('does not link FSD4 run on same vehicle with mismatched fingerprint', () => {
    const link = resolveFsd4HistoricalCrossStreamLink({
      authoritative: auth,
      fsd4RunsNewestFirst: [fsd4('fsd4-b', false)],
    });
    expect(link.kind).toBe('UNVERIFIED_LINK');
  });
});
