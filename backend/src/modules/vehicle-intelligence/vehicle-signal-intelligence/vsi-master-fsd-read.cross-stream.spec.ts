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
    });
    expect(link.kind).toBe('LINKED');
    if (link.kind === 'LINKED') expect(link.fsd4Run.id).toBe('fsd4-a');
  });

  it('skips newer failed run without historical evidence and picks older completed run', () => {
    const link = pickValidFsd4HistoricalEvidenceRun({
      authoritative: auth,
      fsd4RunsNewestFirst: [
        fsd4('fsd4-new-failed', {
          match: true,
          runStatus: 'FAILED',
          historicalStatus: 'PLANNED',
          createdAt: '2026-11-11T12:00:00Z',
        }),
        fsd4('fsd4-old-good', {
          match: true,
          runStatus: 'COMPLETED',
          historicalStatus: 'SUCCEEDED',
          createdAt: '2026-11-09T12:00:00Z',
        }),
      ],
    });
    expect(link.kind).toBe('LINKED');
    if (link.kind === 'LINKED') expect(link.fsd4Run.id).toBe('fsd4-old-good');
  });

  it('accepts older unknown outcome with persisted historical attempt over newer pending shell', () => {
    const link = pickValidFsd4HistoricalEvidenceRun({
      authoritative: auth,
      fsd4RunsNewestFirst: [
        fsd4('fsd4-pending', {
          match: true,
          runStatus: 'PENDING',
          historicalStatus: 'PLANNED',
          createdAt: '2026-11-11T12:00:00Z',
        }),
        fsd4('fsd4-partial', {
          match: true,
          runStatus: 'COMPLETED',
          historicalStatus: 'UNKNOWN_OUTCOME',
          createdAt: '2026-11-08T12:00:00Z',
        }),
      ],
    });
    expect(link.kind).toBe('LINKED');
    if (link.kind === 'LINKED') expect(link.fsd4Run.id).toBe('fsd4-partial');
  });

  it('does not link FSD4 run on same vehicle with mismatched fingerprint', () => {
    const link = pickValidFsd4HistoricalEvidenceRun({
      authoritative: auth,
      fsd4RunsNewestFirst: [
        fsd4('fsd4-b', { match: false, runStatus: 'COMPLETED', historicalStatus: 'SUCCEEDED' }),
      ],
    });
    expect(link.kind).toBe('UNVERIFIED_LINK');
  });
});
