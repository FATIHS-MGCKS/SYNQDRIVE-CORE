import {
  assertFsdP6dAuthoritativePersistedCatalogV1,
} from '../fsd-p6d-catalog-provenance-authority.v1';
import { isAuthoritativeProductionDatabaseTargetV1 } from '../fsd-p6d-production-database-target.v1';
import {
  assertFsdP6dMockTransportForbiddenOnProductionV1,
  FSD_P6D_LIVE_FLEET_AUTHORIZED_RELEASE_SHA,
} from '../fsd-p6d-live-fleet-gate.v1';
import { assertFsdP6dProviderPreDispatchGateV1 } from '../fsd-p6d-pre-dispatch-gate.v1';
import { productionGoNoGoFixture } from './fsd-p6d-test-fixtures.v1';
import { buildFsdP6cFleetDiscoveryPlanReportV1 } from '../../p6c/fsd-p6c-fleet-plan.v1';
import { SYNQDRIVE_FSD3_ONE_SHOT_LIVE_OWNER_AUTHORIZED } from '../../fsd3-one-shot-live-owner-gate.v1';
import { SYNQDRIVE_FSD_P6C_ARCHITECTURE_REVIEW_CLEARED } from '../../p6c/fsd-p6c-go-no-go.v1';
import { SYNQDRIVE_FSD_P6D_LIVE_CATALOG_DISPATCH_AUTHORIZED } from '../fsd-p6d-live-fleet-gate.v1';
import { finalizeFsdP6dFleetPrepareArtifactV1, assertFsdP6dFleetPrepareArtifactForExecuteV1 } from '../fsd-p6d-fleet-prepare-artifact.v1';
import { FSD_P6D_FLEET_PREPARE_ARTIFACT_HMAC_SECRET_ENV } from '../fsd-p6d-fleet-prepare-artifact-auth.v1';
import { buildInitialFsdP6dFleetProviderAccountingV1 } from '../fsd-p6d-fleet-provider-accounting.v1';
import { assertFsdP6dPrepareFleetDisclosureCapV1 } from '../fsd-p6d-prepare-fleet-cap.v1';
import { deriveFsdP6dCatalogLedgerReplayV1 } from '../fsd-p6d-catalog-ledger-replay.v1';
import { FSD3_CATALOG_ATTEMPT_KEY_V1 } from '@modules/vehicle-intelligence/full-signal-discovery/orchestration/fsd3-request-ledger.v1';

describe('FSD P6D final closeout adversarial', () => {
  it('Blocker A: rejects persisted catalog without providerKind', () => {
    expect(() =>
      assertFsdP6dAuthoritativePersistedCatalogV1({
        context: {
          runId: 'r1',
          runKey: 'k',
          organizationId: 'o',
          vehicleId: 'v',
          providerSourceLinkId: 'l',
          dimoTokenId: 1,
          connectionIdentityFingerprint: 'fp',
          invalidatedAt: null,
          stageHttpStatus: 200,
          checkpoint: {
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
              availableSignalNames: ['speed'],
              httpStatus: 200,
              catalogFetchSucceeded: true,
              declaredCatalogFingerprint: 'abc',
            },
          },
        },
      }),
    ).toThrow(/FSD_P6D_PERSISTED_CATALOG_PROVIDER_ORIGIN_MISSING/);
  });

  it('Blocker A: rejects mock providerKind as LIVE without integration flags', () => {
    expect(() =>
      assertFsdP6dAuthoritativePersistedCatalogV1({
        env: { FSD_P6D_FORCE_MOCK_TRANSPORT: '0' },
        context: {
          runId: 'r1',
          runKey: 'ordinary-key',
          organizationId: 'o',
          vehicleId: 'v',
          providerSourceLinkId: 'l',
          dimoTokenId: 1,
          connectionIdentityFingerprint: 'fp',
          invalidatedAt: null,
          stageHttpStatus: 200,
          checkpoint: {
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
              availableSignalNames: ['speed'],
              httpStatus: 200,
              catalogFetchSucceeded: true,
              providerKind: 'mock',
              declaredCatalogFingerprint: 'abc',
            },
          },
        },
      }),
    ).toThrow(/FSD_P6D_MOCK_PERSISTED_CATALOG_REJECTED/);
  });

  it('Blocker F: mock transport forbidden when DATABASE_URL targets synqdrive', () => {
    expect(isAuthoritativeProductionDatabaseTargetV1('postgresql://u:p@127.0.0.1:5432/synqdrive')).toBe(
      true,
    );
    expect(() =>
      assertFsdP6dMockTransportForbiddenOnProductionV1(
        { DATABASE_URL: 'postgresql://u:p@127.0.0.1:5432/synqdrive', NODE_ENV: 'test' },
        true,
      ),
    ).toThrow(/FSD_P6D_MOCK_TRANSPORT_FORBIDDEN_ON_PRODUCTION_DATABASE/);
  });

  it('Blocker B: PREPARE catalog fetch requires authorized release SHA', () => {
    const { manifest, goNoGo } = productionGoNoGoFixture();
    const planReport = buildFsdP6cFleetDiscoveryPlanReportV1({
      manifest,
      tokenIdByVehicleId: new Map(manifest.vehicles.map((v) => [v.vehicleId, 1])),
      allowCatalogPending: true,
    });
    expect(() =>
      assertFsdP6dProviderPreDispatchGateV1({
        env: {
          FSD3_ONE_SHOT_HOST_ATTESTATION: '1',
          [SYNQDRIVE_FSD3_ONE_SHOT_LIVE_OWNER_AUTHORIZED]: '1',
          [SYNQDRIVE_FSD_P6C_ARCHITECTURE_REVIEW_CLEARED]: '1',
          [SYNQDRIVE_FSD_P6D_LIVE_CATALOG_DISPATCH_AUTHORIZED]: '1',
          FSD_DISCOVERY_PERSISTENCE_PG: '1',
          DATABASE_URL: 'postgresql://u:p@127.0.0.1:5432/fsd2_test_ci',
          [FSD_P6D_LIVE_FLEET_AUTHORIZED_RELEASE_SHA]: 'sha-a',
        },
        context: 'PREPARE_CATALOG_FETCH',
        releaseSha: 'sha-b',
        goNoGo,
        planReport,
        manifest,
        forceMockTransport: false,
      }),
    ).toThrow(/FSD_P6D_LIVE_FLEET_RELEASE_SHA_MISMATCH/);
  });

  it('Blocker D/G: execute rejects stale prepare artifact releaseSha', () => {
    const { manifest } = productionGoNoGoFixture();
    const testEnv = {
      [FSD_P6D_FLEET_PREPARE_ARTIFACT_HMAC_SECRET_ENV]: 'adversarial-hmac-secret',
    } as NodeJS.ProcessEnv;
    const artifact = finalizeFsdP6dFleetPrepareArtifactV1(
      {
        schemaVersion: 'FSD_P6D_FLEET_PREPARE_ARTIFACT_V1',
        fleetPrepareRequestKey: 'prep-1',
        releaseSha: 'sha-old',
        organizationId: manifest.organizationId,
        preparedAtUtc: new Date().toISOString(),
        providerBudgetFleetPlanned: 1,
        providerAccounting: buildInitialFsdP6dFleetProviderAccountingV1({
          manifest,
          executePlannedFleetCumulativeRequests: 1,
        }),
        vehicles: manifest.vehicles.map((v) => ({
        label: v.label,
        vehicleId: v.vehicleId,
        providerSourceLinkId: v.providerSourceLinkId,
        discoveryRequestKey: v.discoveryRequestKey,
        historicalRequestKey: v.historicalRequestKey,
        historicalWindow: manifest.historicalWindow,
        dimoTokenId: 1,
        connectionIdentityFingerprint: 'fp',
        declaredCatalogFingerprint: 'cfp',
        catalogPersistedRunId: 'run-1',
        catalogEvidenceSource: 'PERSISTED_FSD3_RUN',
        })),
      },
      testEnv,
    );
    expect(() =>
      assertFsdP6dFleetPrepareArtifactForExecuteV1({
        artifact,
        manifest,
        releaseSha: 'sha-new',
        fleetPrepareRequestKey: 'prep-1',
        env: testEnv,
      }),
    ).toThrow(/FSD_P6D_PREPARE_ARTIFACT_RELEASE_SHA_MISMATCH/);
  });

  it('PREPARE fleet disclosure cap fails closed before catalog provider calls', () => {
    expect(() =>
      assertFsdP6dPrepareFleetDisclosureCapV1({
        fleetPlannedRequestDisclosureCap: 2,
        prepareLedgerAttemptsCommitted: 0,
        executePlannedFleetCumulativeRequests: 0,
        pendingCatalogDispatches: 4,
      }),
    ).toThrow(/FSD_P6D_PREPARE_FLEET_DISCLOSURE_CAP_NO_GO/);
  });

  it('ledger replay derived without mock getCatalogCallCount hook', () => {
    const checkpoint = {
      requestLedger: {
        budgetTotal: 1,
        attempts: [
          {
            attemptKey: FSD3_CATALOG_ATTEMPT_KEY_V1,
            queryFingerprint: 'q',
            outcome: 'SUCCEEDED' as const,
            reservedAt: '2026-01-01T00:00:00.000Z',
            finishedAt: '2026-01-01T00:00:01.000Z',
          },
        ],
      },
      catalogFetch: {
        succeeded: true,
        availableSignalNames: ['speed'],
        catalogFetchSucceeded: true,
        httpStatus: 200,
        providerKind: 'mock' as const,
        declaredCatalogFingerprint: 'fp',
      },
    };
    const replay = deriveFsdP6dCatalogLedgerReplayV1({
      ledgerBefore: {
        runId: 'run-1',
        catalogAttemptSucceeded: true,
        catalogAttemptReservedAt: '2026-01-01T00:00:00.000Z',
      },
      persistedRunId: 'run-1',
      checkpoint,
    });
    expect(replay.ledgerReplayed).toBe(true);
    expect(replay.providerDispatchConsumed).toBe(false);
  });

  it('Blocker D: HMAC authentication rejects tampered artifact fields', () => {
    const { manifest } = productionGoNoGoFixture();
    const testEnv = {
      [FSD_P6D_FLEET_PREPARE_ARTIFACT_HMAC_SECRET_ENV]: 'adversarial-hmac-secret',
    } as NodeJS.ProcessEnv;
    const artifact = finalizeFsdP6dFleetPrepareArtifactV1(
      {
        schemaVersion: 'FSD_P6D_FLEET_PREPARE_ARTIFACT_V1',
        fleetPrepareRequestKey: 'prep-1',
        releaseSha: 'sha-a',
        organizationId: manifest.organizationId,
        preparedAtUtc: new Date().toISOString(),
        providerBudgetFleetPlanned: 1,
        providerAccounting: buildInitialFsdP6dFleetProviderAccountingV1({
          manifest,
          executePlannedFleetCumulativeRequests: 1,
        }),
        vehicles: manifest.vehicles.map((v) => ({
          label: v.label,
          vehicleId: v.vehicleId,
          providerSourceLinkId: v.providerSourceLinkId,
          discoveryRequestKey: v.discoveryRequestKey,
          historicalRequestKey: v.historicalRequestKey,
          historicalWindow: manifest.historicalWindow,
          dimoTokenId: 1,
          connectionIdentityFingerprint: 'fp',
          declaredCatalogFingerprint: 'cfp',
          catalogPersistedRunId: 'run-1',
          catalogEvidenceSource: 'PERSISTED_FSD3_RUN',
        })),
      },
      testEnv,
    );
    const tampered = {
      ...artifact,
      releaseSha: 'sha-b',
    };
    expect(() =>
      assertFsdP6dFleetPrepareArtifactForExecuteV1({
        artifact: tampered,
        manifest,
        releaseSha: 'sha-b',
        fleetPrepareRequestKey: 'prep-1',
        env: testEnv,
      }),
    ).toThrow(/FSD_P6D_PREPARE_ARTIFACT_AUTHENTICATION_FAILED/);
  });
});
