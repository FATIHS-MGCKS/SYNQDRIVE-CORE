import { manifestDeclaredCatalogEvidenceV1 } from '../fsd-p6d-catalog-provenance.v1';

describe('FsdP6d catalog provenance', () => {
  it('rejects manifest-only declared fields at resolve layer', async () => {
    const { resolveFsdP6dCatalogEvidenceV1 } = await import('../fsd-p6d-catalog-provenance.v1');
    await expect(
      resolveFsdP6dCatalogEvidenceV1({
        prisma: { fsdDiscoveryRun: { findFirst: async () => null } } as never,
        preflight: {
          status: 'PREFLIGHT_OK',
          organizationId: 'o',
          vehicleId: 'v',
          providerSourceLinkId: 'l',
          dimoVehicleId: 'd',
          dimoTokenId: 1,
          connectionIdentityFingerprint: 'fp',
          linkActive: true,
          authorizationReference: 'a',
        },
        organizationId: 'o',
        vehicleId: 'v',
        providerSourceLinkId: 'l',
        manifestDeclaredFieldNames: ['speed'],
        allowCatalogPending: false,
      }),
    ).rejects.toThrow(/FSD_P6D_CATALOG_MANIFEST_ONLY_NOT_ACCEPTED/);
  });

  it('does not treat manifest helper as standalone evidence', () => {
    expect(
      manifestDeclaredCatalogEvidenceV1({
        preflight: { connectionIdentityFingerprint: 'fp', dimoTokenId: 1 },
        declaredFieldNames: ['speed'],
      })?.source,
    ).toBe('MANIFEST_DECLARED_FIELDS');
  });
});
