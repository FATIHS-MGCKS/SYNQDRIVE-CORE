import { buildLiveCatalogOnlyCheckpointFixtureV1 } from './__fixtures__/vsi-master-fsd-read.fixture.v1';
import type { FsdRunWithStages } from './vsi-master-fsd-read.catalog-resolution';
import { pickValidFsd4HistoricalEvidenceRun } from './vsi-master-fsd-read.cross-stream';

describe('pickValidFsd4HistoricalEvidenceRun', () => {
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

  function fsd4(
    id: string,
    input: {
      match: boolean;
      runStatus: string;
      historicalStatus: string;
      createdAt?: string;
    },
  ): FsdRunWithStages {
    return {
      id,
      discoveryStream: 'FSD4_HISTORICAL',
      organizationId: 'org',
      vehicleId: 'veh',
      providerSourceLinkId: 'link',
      dimoTokenId: input.match ? 1 : 2,
      connectionIdentityFingerprint: input.match ? 'fp' : 'other',
      invalidatedAt: null,
      status: input.runStatus as never,
      createdAt: new Date(input.createdAt ?? '2026-11-10T12:00:00Z'),
      stages: [
        {
          stageType: 'CATALOG',
          status: 'SUCCEEDED',
          checkpointJson: input.match ? checkpoint : { catalogFetch: { declaredCatalogFingerprint: 'mismatch' } },
        } as never,
        { stageType: 'HISTORICAL', status: input.historicalStatus, checkpointJson: {} } as never,
      ],
    } as unknown as FsdRunWithStages;
  }

  it('links independent FSD4 run when identity, fingerprint, and historical stage qualify', () => {
    const link = pickValidFsd4HistoricalEvidenceRun({
      authoritative: auth,
      fsd4RunsNewestFirst: [fsd4('fsd4-a', { match: true, runStatus: 'COMPLETED', historicalStatus: 'SUCCEEDED' })],
      historicalEvidenceRowCountByRunId: { 'fsd4-a': 12 },
    });
    expect(link.kind).toBe('LINKED');
    if (link.kind === 'LINKED') {
      expect(link.fsd4Run.id).toBe('fsd4-a');
      expect(link.historicalEvidenceClass).toBe('FULL');
    }
  });

  it('skips newer in-progress shell with zero historical rows and selects older completed evidence', () => {
    const link = pickValidFsd4HistoricalEvidenceRun({
      authoritative: auth,
      fsd4RunsNewestFirst: [
        fsd4('fsd4-new', {
          match: true,
          runStatus: 'IN_PROGRESS',
          historicalStatus: 'IN_PROGRESS',
          createdAt: '2026-11-11T12:00:00Z',
        }),
        fsd4('fsd4-old-good', {
          match: true,
          runStatus: 'COMPLETED',
          historicalStatus: 'SUCCEEDED',
          createdAt: '2026-11-09T12:00:00Z',
        }),
      ],
      historicalEvidenceRowCountByRunId: { 'fsd4-new': 0, 'fsd4-old-good': 26 },
    });
    expect(link.kind).toBe('LINKED');
    if (link.kind === 'LINKED') expect(link.fsd4Run.id).toBe('fsd4-old-good');
  });

  it('labels demonstrated partial historical evidence when newest full completion is absent', () => {
    const link = pickValidFsd4HistoricalEvidenceRun({
      authoritative: auth,
      fsd4RunsNewestFirst: [
        fsd4('fsd4-partial', {
          match: true,
          runStatus: 'COMPLETED',
          historicalStatus: 'UNKNOWN_OUTCOME',
          createdAt: '2026-11-08T12:00:00Z',
        }),
      ],
      historicalEvidenceRowCountByRunId: { 'fsd4-partial': 5 },
    });
    expect(link.kind).toBe('LINKED');
    if (link.kind === 'LINKED') expect(link.historicalEvidenceClass).toBe('PARTIAL');
  });

  it('does not link FSD4 run on same vehicle with mismatched fingerprint', () => {
    const link = pickValidFsd4HistoricalEvidenceRun({
      authoritative: auth,
      fsd4RunsNewestFirst: [
        fsd4('fsd4-b', { match: false, runStatus: 'COMPLETED', historicalStatus: 'SUCCEEDED' }),
      ],
      historicalEvidenceRowCountByRunId: { 'fsd4-b': 10 },
    });
    expect(link.kind).toBe('UNVERIFIED_LINK');
  });
});
