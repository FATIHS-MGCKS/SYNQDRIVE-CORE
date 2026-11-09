import { assertFsdP6dLiveCliDatabaseAdmissionV1 } from '../fsd-p6d-live-cli-database-guard.v1';
import {
  assertFsdP6dMockTransportForbiddenOnProductionV1,
  assertFsdP6dLiveFleetExecuteGateV1,
  FSD_P6D_LIVE_FLEET_AUTHORIZED_RELEASE_SHA,
  SYNQDRIVE_FSD_P6D_LIVE_FLEET_EXECUTE_AUTHORIZED,
} from '../fsd-p6d-live-fleet-gate.v1';
import { SYNQDRIVE_FSD3_ONE_SHOT_LIVE_OWNER_AUTHORIZED } from '../../fsd3-one-shot-live-owner-gate.v1';
import { SYNQDRIVE_FSD_P6C_ARCHITECTURE_REVIEW_CLEARED } from '../../p6c/fsd-p6c-go-no-go.v1';
import { productionGoNoGoFixture } from './fsd-p6d-test-fixtures.v1';
import { resolveFsdP6dCatalogEvidenceV1 } from '../fsd-p6d-catalog-provenance.v1';
import { assertFsdP6dPrepareExecuteIdentityFreezeV1, buildFsdP6dVehicleIdentityFreezeV1 } from '../fsd-p6d-identity-freeze.v1';

describe('FSD P6D architecture review remediation (adversarial)', () => {
  it('live CLI rejects disposable DB without FSD_DISCOVERY_PERSISTENCE_PG', () => {
    expect(() =>
      assertFsdP6dLiveCliDatabaseAdmissionV1({
        mode: 'PREPARE_LIVE_FLEET',
        liveProvider: 'dimo_live',
        env: {
          DATABASE_URL: 'postgresql://u:p@127.0.0.1:5432/fsd2_test_orphan',
        },
      }),
    ).toThrow(/FSD_P6D_LIVE_CLI_DISPOSABLE_DB_REQUIRES_PG_FLAG/);
  });

  it('mock EXECUTE still requires disposable pg harness', () => {
    const prevPg = process.env.FSD_DISCOVERY_PERSISTENCE_PG;
    delete process.env.FSD_DISCOVERY_PERSISTENCE_PG;
    try {
      expect(() =>
        assertFsdP6dLiveCliDatabaseAdmissionV1({
          mode: 'EXECUTE',
          liveProvider: 'mock',
          env: { DATABASE_URL: 'postgresql://u:p@127.0.0.1:5432/synqdrive' },
        }),
      ).toThrow(/FSD_P6C_MOCK_EXECUTE_DB_FORBIDDEN:FSD_DISCOVERY_PERSISTENCE_PG must be 1/);
    } finally {
      if (prevPg !== undefined) {
        process.env.FSD_DISCOVERY_PERSISTENCE_PG = prevPg;
      }
    }
  });

  it('mock transport forbidden on production database target', () => {
    expect(() =>
      assertFsdP6dMockTransportForbiddenOnProductionV1(
        { DATABASE_URL: 'postgresql://u:p@127.0.0.1:5432/synqdrive' },
        true,
      ),
    ).toThrow(/FSD_P6D_MOCK_TRANSPORT_FORBIDDEN_ON_PRODUCTION_DATABASE/);
  });

  it('missing fleet execute authorization rejected', () => {
    const { manifest, goNoGo } = productionGoNoGoFixture();
    expect(() =>
      assertFsdP6dLiveFleetExecuteGateV1({
        env: {
          FSD3_ONE_SHOT_HOST_ATTESTATION: '1',
          [SYNQDRIVE_FSD3_ONE_SHOT_LIVE_OWNER_AUTHORIZED]: '1',
          [SYNQDRIVE_FSD_P6C_ARCHITECTURE_REVIEW_CLEARED]: '1',
          [SYNQDRIVE_FSD_P6D_LIVE_FLEET_EXECUTE_AUTHORIZED]: '0',
          [FSD_P6D_LIVE_FLEET_AUTHORIZED_RELEASE_SHA]: 'sha-1',
        },
        releaseSha: 'sha-1',
        manifest,
        goNoGo,
        liveProvider: 'dimo_live',
        forceMockTransport: false,
      }),
    ).toThrow(/FSD_P6D_LIVE_FLEET_EXECUTE_NOT_AUTHORIZED/);
  });

  it('catalog pending fallback when no evidence', async () => {
    const resolution = await resolveFsdP6dCatalogEvidenceV1({
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
      manifestDeclaredFieldNames: [],
      allowCatalogPending: true,
    });
    expect(resolution.kind).toBe('CATALOG_PENDING');
  });

  it('identity drift between prepare and execute surfaces', () => {
    const evidence = {
      source: 'PERSISTED_FSD3_RUN' as const,
      provenanceClass: 'LIVE_DIMO_VERIFIED' as const,
      availableSignals: ['speed'],
      declaredCatalogFingerprint: 'cfp',
      connectionIdentityFingerprint: 'fp-a',
      dimoTokenId: 1,
      persistedRunId: 'run-1',
      httpStatus: 200,
      providerSourceLinkId: 'link',
    };
    const freeze = buildFsdP6dVehicleIdentityFreezeV1({
      vehicleId: 'v',
      providerSourceLinkId: 'link',
      historicalWindow: { fromUtc: '2026-01-01T00:00:00.000Z', toUtc: '2026-01-01T01:00:00.000Z' },
      evidence,
    });
    expect(() =>
      assertFsdP6dPrepareExecuteIdentityFreezeV1({
        label: 'tesla_model_3',
        freeze,
        providerSourceLinkId: 'link',
        connectionIdentityFingerprint: 'fp-b',
        dimoTokenId: 1,
        evidence,
        historicalWindow: freeze.historicalWindow,
      }),
    ).toThrow(/FSD_P6D_IDENTITY_DRIFT/);
  });
});
