import {
  buildLiveCatalogOnlyCheckpointFixtureV1,
  buildMockCatalogCheckpointFixtureV1,
} from './__fixtures__/vsi-master-fsd-read.fixture.v1';
import { resolvePersistedCatalogProvenanceReadV1 } from './vsi-master-fsd-read.provenance';

describe('VsiMasterFsdRead catalog provenance', () => {
  const base = {
    runId: 'run-1',
    runKey: 'key',
    organizationId: 'org',
    vehicleId: 'veh',
    providerSourceLinkId: 'link',
    dimoTokenId: 1,
    connectionIdentityFingerprint: 'fp',
    invalidatedAt: null as Date | null,
    stageHttpStatus: 200,
  };

  it('accepts LIVE_DIMO_VERIFIED persisted catalogs', () => {
    const resolved = resolvePersistedCatalogProvenanceReadV1({
      ...base,
      checkpoint: buildLiveCatalogOnlyCheckpointFixtureV1(),
    });
    expect(resolved.availability).toBe('AUTHORITATIVE_LIVE');
    expect(resolved.provenanceClass).toBe('LIVE_DIMO_VERIFIED');
    expect(resolved.declaredSignalCount).toBe(2);
  });

  it('excludes mock catalogs from authoritative production classification', () => {
    const resolved = resolvePersistedCatalogProvenanceReadV1({
      ...base,
      checkpoint: buildMockCatalogCheckpointFixtureV1(),
    });
    expect(resolved.availability).toBe('PRESENT_NOT_AUTHORITATIVE');
    expect(resolved.provenanceClass).toBe('INTEGRATION_MOCK_DISPOSABLE');
  });

  it('marks invalidated runs', () => {
    const resolved = resolvePersistedCatalogProvenanceReadV1({
      ...base,
      invalidatedAt: new Date('2026-11-09T00:00:00Z'),
      checkpoint: buildLiveCatalogOnlyCheckpointFixtureV1(),
    });
    expect(resolved.availability).toBe('INVALIDATED');
  });
});
