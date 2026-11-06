import { createFsdDimoLiveDiscoveryAdapterV1 } from '../fsd-dimo-live-discovery.adapter.v1';
import type { DimoAuthService } from '@modules/dimo/dimo-auth.service';
import type { DimoTelemetryService } from '@modules/dimo/dimo-telemetry.service';
import type { FsdDiscoveryPersistenceRepository } from '../../persistence/fsd-discovery-persistence.repository';
import {
  buildFsdSignalsLatestQueryDocument,
  computeFsdQueryFingerprintV1,
  normalizeFsdQueryTextForFingerprintV1,
} from '../../fsd-query-document.builder.v1';
import { buildAvailableSignalsQuery } from '@modules/dimo/queries/available-signals.query';

describe('FsdDimoLiveDiscoveryAdapterV1', () => {
  const dispatchContext = {
    organizationId: 'org-1',
    vehicleId: 'veh-1',
    providerSourceLinkId: 'link-1',
    runKey: 'rk',
    dimoTokenId: 99,
    connectionIdentityFingerprint: 'a'.repeat(64),
    discoveryStream: 'FSD3_CATALOG_SNAPSHOT' as const,
  };

  function makeDeps(overrides: Partial<{ queryFsdGraphql: jest.Mock; assertBinding: jest.Mock }> = {}) {
    const dimoAuth = {
      getVehicleJwt: jest.fn().mockResolvedValue('vehicle-jwt'),
    } as unknown as DimoAuthService;
    const dimoTelemetry = {
      queryFsdGraphql: overrides.queryFsdGraphql ?? jest.fn(),
    } as unknown as DimoTelemetryService;
    const persistence = {
      assertDimoDispatchBinding: overrides.assertBinding ?? jest.fn().mockResolvedValue(undefined),
    } as unknown as FsdDiscoveryPersistenceRepository;
    return { dimoAuth, dimoTelemetry, persistence };
  }

  it('maps snapshot FLOAT signalsLatest shapes to FSD observation kinds', async () => {
    const doc = buildFsdSignalsLatestQueryDocument({
      tokenId: 99,
      selections: ['speed { timestamp value }'],
      fieldNames: ['speed'],
    });
    const fp = doc.fingerprint;
    const { dimoAuth, dimoTelemetry, persistence } = makeDeps({
      queryFsdGraphql: jest.fn().mockResolvedValue({
        kind: 'HTTP_200_OK',
        httpStatus: 200,
        data: { signalsLatest: { speed: { value: 12 } } },
        errors: [],
      }),
    });
    const adapter = createFsdDimoLiveDiscoveryAdapterV1({
      dimoAuth,
      dimoTelemetry,
      persistence,
    });
    const port = adapter.createFsd3Port();
    const res = await port.executeSnapshotDocument({
      tokenId: 99,
      queryText: doc.queryText,
      documentFingerprint: fp,
      fieldNamesInDocument: ['speed'],
      dispatchContext,
    });
    expect(res.dataPresent).toBe(true);
    expect(res.valuesByField?.speed?.kind).toBe('VALID_NONZERO');
    expect(res.valuesByField?.speed?.numericValue).toBe(12);
    expect(dimoTelemetry.queryFsdGraphql).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedQueryFingerprint: fp,
        requestContext: expect.objectContaining({ tokenId: 99, organizationId: 'org-1', vehicleId: 'veh-1' }),
      }),
    );
    expect(dimoAuth.getVehicleJwt).toHaveBeenCalledWith(99);
  });

  it('maps historical FLOAT rows from signals[] buckets', async () => {
    const queryText = `
    query FsdHistoricalDiscovery {
      signals(
        tokenId: 99
        from: "2020-01-01T00:00:00.000Z"
        to: "2020-01-01T00:00:02.000Z"
        interval: "1s"
      ) {
        timestamp
        speed(agg: AVG)
      }
    }
  `.trim();
    const fp = computeFsdQueryFingerprintV1(normalizeFsdQueryTextForFingerprintV1(queryText));
    const { dimoAuth, dimoTelemetry, persistence } = makeDeps({
      queryFsdGraphql: jest.fn().mockResolvedValue({
        kind: 'HTTP_200_OK',
        httpStatus: 200,
        data: {
          signals: [
            { timestamp: '2020-01-01T00:00:00.100Z', speed: 5 },
            { timestamp: '2020-01-01T00:00:01.100Z', speed: 6 },
          ],
        },
        errors: [],
      }),
    });
    const adapter = createFsdDimoLiveDiscoveryAdapterV1({
      dimoAuth,
      dimoTelemetry,
      persistence,
    });
    const port = adapter.createFsd4Port();
    const res = await port.executeHistoricalDocument({
      tokenId: 99,
      queryText,
      documentFingerprint: fp,
      fieldNamesInDocument: ['speed'],
      dispatchContext: { ...dispatchContext, discoveryStream: 'FSD4_HISTORICAL' },
    });
    expect(res.dataPresent).toBe(true);
    expect(res.observationsByField?.speed?.length).toBe(2);
    expect(res.observationsByField?.speed?.[0]?.numericValue).toBe(5);
  });

  it('propagates classified GraphQL catalog outcome without throwing', async () => {
    const q = buildAvailableSignalsQuery(99);
    const fp = computeFsdQueryFingerprintV1(normalizeFsdQueryTextForFingerprintV1(q));
    const { dimoTelemetry } = makeDeps({
      queryFsdGraphql: jest.fn().mockResolvedValue({
        kind: 'GRAPHQL_ERRORS_NO_DATA',
        httpStatus: 200,
        data: null,
        errors: [{ message: 'boom' }],
      }),
    });
    const adapter = createFsdDimoLiveDiscoveryAdapterV1({
      dimoAuth: { getVehicleJwt: jest.fn().mockResolvedValue('j') } as never,
      dimoTelemetry,
      persistence: { assertDimoDispatchBinding: jest.fn() } as never,
    });
    const res = await adapter.createFsd3Port().fetchAvailableSignals({
      tokenId: 99,
      dispatchContext,
    });
    expect(res.httpStatus).toBe(200);
    expect(res.availableSignals).toEqual([]);
  });
});
