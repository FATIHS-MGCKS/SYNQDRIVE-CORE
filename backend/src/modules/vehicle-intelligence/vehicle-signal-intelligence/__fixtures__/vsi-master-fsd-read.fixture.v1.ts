import type { Fsd3CatalogStageCheckpointV1 } from '@modules/vehicle-intelligence/full-signal-discovery/orchestration/fsd3-request-ledger.v1';
import { FSD3_CATALOG_ATTEMPT_KEY_V1 } from '@modules/vehicle-intelligence/full-signal-discovery/orchestration/fsd3-request-ledger.v1';
import { buildFsd3DeclaredCatalogFingerprintV1 } from '@modules/vehicle-intelligence/full-signal-discovery/orchestration/fsd3-fingerprint.v1';

const SAMPLE_SIGNALS = ['powertrainRPM', 'exteriorBatteryVoltage'] as const;

export function buildLiveCatalogOnlyCheckpointFixtureV1(): Fsd3CatalogStageCheckpointV1 {
  const fp = buildFsd3DeclaredCatalogFingerprintV1([...SAMPLE_SIGNALS]);
  return {
    requestLedger: {
      budgetTotal: 4,
      attempts: [
        {
          attemptKey: FSD3_CATALOG_ATTEMPT_KEY_V1,
          queryFingerprint: 'fp-catalog-test',
          outcome: 'SUCCEEDED',
          reservedAt: '2026-11-09T19:40:00.000Z',
          finishedAt: '2026-11-09T19:40:01.000Z',
          httpStatus: 200,
        },
      ],
    },
    catalogFetch: {
      declaredCatalogFingerprint: fp,
      availableSignalNames: [...SAMPLE_SIGNALS],
      httpStatus: 200,
      succeeded: true,
      providerKind: 'live',
      catalogFetchSucceeded: true,
    },
  };
}

export function buildMockCatalogCheckpointFixtureV1(): Fsd3CatalogStageCheckpointV1 {
  const names = ['mockSignalA'];
  return {
    requestLedger: {
      budgetTotal: 1,
      attempts: [
        {
          attemptKey: FSD3_CATALOG_ATTEMPT_KEY_V1,
          queryFingerprint: 'fp-mock',
          outcome: 'SUCCEEDED',
          reservedAt: '2026-11-09T12:00:00.000Z',
          finishedAt: '2026-11-09T12:00:01.000Z',
          httpStatus: 200,
        },
      ],
    },
    catalogFetch: {
      availableSignalNames: names,
      httpStatus: 200,
      providerKind: 'mock',
      catalogFetchSucceeded: true,
    },
  };
}
