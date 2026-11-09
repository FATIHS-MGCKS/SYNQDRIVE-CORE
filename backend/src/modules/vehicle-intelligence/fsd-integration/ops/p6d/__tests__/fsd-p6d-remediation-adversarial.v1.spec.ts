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
import { createFsd3MockDiscoveryProvider } from '@modules/vehicle-intelligence/full-signal-discovery/orchestration/fsd3-mock-provider.v1';
import { fetchLiveCatalogEvidenceV1, resolveFsdP6dCatalogEvidenceV1 } from '../fsd-p6d-catalog-provenance.v1';
import { buildFsdP6cFleetDiscoveryPlanReportV1 } from '../../p6c/fsd-p6c-fleet-plan.v1';
import { assertFsdP6dPrepareExecuteIdentityFreezeV1, buildFsdP6dVehicleIdentityFreezeV1 } from '../fsd-p6d-identity-freeze.v1';

describe('FSD P6D architecture review remediation (adversarial)', () => {
  it('H1: live CLI rejects disposable DB without FSD_DISCOVERY_PERSISTENCE_PG', () => {
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

  it('H1: mock EXECUTE still requires disposable pg harness', () => {
    expect(() =>
      assertFsdP6dLiveCliDatabaseAdmissionV1({
        mode: 'EXECUTE',
        liveProvider: 'mock',
        env: { DATABASE_URL: 'postgresql://u:p@127.0.0.1:5432/synqdrive' },
      }),
    ).toThrow(/FSD_P6C_MOCK_EXECUTE_REQUIRES_DISPOSABLE_PG_FLAG/);
  });

  it('H1: mock transport forbidden on production profile', () => {
    expect(() =>
      assertFsdP6dMockTransportForbiddenOnProductionV1(
        { SYNQDRIVE_DATABASE_IDENTITY_PROFILE: 'production_vps' },
        true,
      ),
    ).toThrow(/FSD_P6D_MOCK_TRANSPORT_FORBIDDEN_ON_PRODUCTION/);
  });

  it('H2/H8: missing fleet execute authorization rejected', () => {
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

  it('H3: mock persisted catalog rejected on live path without integration flag', async () => {
    const checkpoint = {
      requestLedger: {
        budgetTotal: 1,
        attempts: [
          {
            attemptKey: 'catalog:availableSignals',
            queryFingerprint: 'q',
            outcome: 'SUCCEEDED',
            reservedAt: new Date().toISOString(),
          },
        ],
      },
      catalogFetch: {
        succeeded: true,
        availableSignals: ['fsdSyntheticFloat0001'],
        httpStatus: 200,
      },
    };
    const result = await resolveFsdP6dCatalogEvidenceV1({
      prisma: {
        fsdDiscoveryRun: {
          findFirst: async () => ({
            id: 'run-1',
            runKey: 'p6d-pg-mock-seed',
            stages: [{ checkpointJson: checkpoint, lastHttpStatus: 200 }],
          }),
        },
      } as never,
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
      env: { FSD_P6D_FORCE_MOCK_TRANSPORT: '0' },
      allowCatalogPending: true,
    });
    expect(result.kind).toBe('CATALOG_PENDING');
  });

  it('H4: live catalog 403 rejected', async () => {
    const provider = createFsd3MockDiscoveryProvider({ mode: 'CATALOG_HTTP_500' });
    const { manifest, goNoGo } = productionGoNoGoFixture();
    const planReport = buildFsdP6cFleetDiscoveryPlanReportV1({
      manifest,
      tokenIdByVehicleId: new Map(manifest.vehicles.map((v) => [v.vehicleId, 1])),
    });
    await expect(
      fetchLiveCatalogEvidenceV1({
        env: {
          FSD3_ONE_SHOT_HOST_ATTESTATION: '1',
          [SYNQDRIVE_FSD3_ONE_SHOT_LIVE_OWNER_AUTHORIZED]: '1',
          [SYNQDRIVE_FSD_P6C_ARCHITECTURE_REVIEW_CLEARED]: '1',
          SYNQDRIVE_FSD_P6D_LIVE_CATALOG_DISPATCH_AUTHORIZED: '1',
        },
        provider,
        preflight: {
          connectionIdentityFingerprint: 'fp',
          dimoTokenId: 1,
          dimoVehicleId: 'd',
        },
        manifest,
        planReport,
        goNoGo,
        releaseSha: 'sha',
        dispatchContext: {
          organizationId: manifest.organizationId,
          vehicleId: manifest.vehicles[0]!.vehicleId,
          providerSourceLinkId: manifest.vehicles[0]!.providerSourceLinkId,
          runKey: 'catalog-test',
          dimoTokenId: 1,
          connectionIdentityFingerprint: 'fp',
        },
      }),
    ).rejects.toThrow(/FSD_P6D_LIVE_CATALOG_MOCK_PROVIDER_REJECTED|SERVER_ERROR/);
  });

  it('H4: catalog pending fallback when no evidence', async () => {
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

  it('H5: identity drift between prepare and execute surfaces', () => {
    const evidence = {
      source: 'PERSISTED_FSD3_RUN' as const,
      provenanceClass: 'LIVE_VERIFIED' as const,
      availableSignals: ['speed'],
      connectionIdentityFingerprint: 'fp-a',
      dimoTokenId: 1,
      persistedRunId: 'run-1',
      httpStatus: 200,
      providerSourceLinkId: 'link',
    };
    const freeze = buildFsdP6dVehicleIdentityFreezeV1({
      vehicleId: 'v',
      providerSourceLinkId: 'link',
      evidence,
    });
    expect(() =>
      assertFsdP6dPrepareExecuteIdentityFreezeV1({
        label: 'tesla_model_3',
        freeze,
        connectionIdentityFingerprint: 'fp-b',
        dimoTokenId: 1,
        evidence: { ...evidence, availableSignals: ['speed'] },
      }),
    ).toThrow(/FSD_P6D_IDENTITY_DRIFT/);
  });
});
