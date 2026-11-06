import axios from 'axios';
import { ConfigService } from '@nestjs/config';
import { DimoTelemetryService } from './dimo-telemetry.service';
import { DimoProviderGateway } from './provider/dimo-provider-gateway.service';
import { DimoProviderAdmissionService } from './provider/dimo-provider-admission.service';
import { DimoProviderLimiterService } from './provider/dimo-provider-limiter.service';
import { DimoProviderRequestPriority } from './provider/dimo-provider-limiter.types';
import type { DimoProviderLimiterConfigShape } from '@config/dimo-provider-limiter.config';
import { DimoRequestExecutor } from './provider-budget/dimo-request-executor.service';
import { computeFsdQueryFingerprintV1, normalizeFsdQueryTextForFingerprintV1 } from './fsd-query-fingerprint.v1';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

function createOffGateway(): DimoProviderGateway {
  const config: DimoProviderLimiterConfigShape = {
    enabled: false,
    mode: 'off',
    rateLimitPerSecond: 20,
    rateBurst: 5,
    rateAlgorithm: 'token_bucket',
    maxInFlight: 40,
    inFlightLeaseMs: 45_000,
    reservedHighPrioritySlots: 12,
    maxWaitMs: 5_000,
    maxWaitMsByPriority: {
      [DimoProviderRequestPriority.P0_CRITICAL]: 10_000,
      [DimoProviderRequestPriority.P1_LIVE]: 10_000,
      [DimoProviderRequestPriority.P2_INTERACTIVE]: 5_000,
      [DimoProviderRequestPriority.P3_NORMAL]: 3_750,
      [DimoProviderRequestPriority.P4_BACKGROUND]: 2_500,
    },
    admissionPollMinMs: 25,
    admissionPollMaxMs: 250,
    retryAfterMaxSeconds: 120,
    canaryEnforceOrgIds: new Set<string>(),
    enforceCanaryEnabled: false,
    enforceCanaryPercent: 0,
    enforceCanaryVehicleIds: new Set<string>(),
    documentedCoreRatePerSecond: 25,
  };
  const limiter = {
    begin: jest.fn(),
    end: jest.fn(),
    setProviderCooldown: jest.fn(),
  } as unknown as DimoProviderLimiterService;
  const admission = {
    acquire: jest.fn().mockImplementation((input) => limiter.begin(input)),
  } as unknown as DimoProviderAdmissionService;
  return new DimoProviderGateway(config, admission, limiter);
}

function createBypassExecutor(): DimoRequestExecutor {
  return {
    execute: jest.fn(async (params: { execute: () => Promise<unknown> }) =>
      params.execute(),
    ),
  } as unknown as DimoRequestExecutor;
}

describe('DimoTelemetryService (P1.3 gateway + global budget parity)', () => {
  let service: DimoTelemetryService;
  let gatewayExecuteSpy: jest.SpyInstance;
  let executorExecuteSpy: jest.SpyInstance;
  const vehicleJwt = 'vehicle-jwt-token';
  const postMock = jest.fn();

  beforeEach(() => {
    postMock.mockReset();
    mockedAxios.create.mockReturnValue({ post: postMock } as any);

    const gateway = createOffGateway();
    gatewayExecuteSpy = jest.spyOn(gateway, 'execute');

    const executor = createBypassExecutor();
    executorExecuteSpy = jest.spyOn(executor, 'execute');

    service = new DimoTelemetryService(
      {
        get: jest.fn((key: string) => {
          if (key === 'dimo.telemetryApiUrl') {
            return 'https://telemetry-api.dimo.zone/query';
          }
          if (key === 'dimo.requestTimeoutMs') {
            return 10000;
          }
          return undefined;
        }),
      } as unknown as ConfigService,
      executor,
      gateway,
    );
  });

  afterEach(() => {
    gatewayExecuteSpy.mockRestore();
    executorExecuteSpy.mockRestore();
  });

  it('A — successful queryGraphQL result unchanged', async () => {
    postMock.mockResolvedValue({
      data: { data: { signalsLatest: { speed: { value: 12 } } } },
    });

    const result = await service.queryGraphQL(vehicleJwt, 'query { x }');

    expect(result).toEqual({ data: { signalsLatest: { speed: { value: 12 } } } });
    expect(gatewayExecuteSpy).toHaveBeenCalled();
    expect(executorExecuteSpy).toHaveBeenCalled();
  });

  it('B — GraphQL 200 + errors without data throws unchanged', async () => {
    postMock.mockResolvedValue({
      data: { errors: [{ message: 'field forbidden' }] },
    });

    await expect(service.queryGraphQL(vehicleJwt, 'query { x }')).rejects.toThrow(
      'DIMO GraphQL error: field forbidden',
    );
  });

  it('B2 — GraphQL 200 + errors with partial data returns data unchanged', async () => {
    postMock.mockResolvedValue({
      data: {
        data: { signalsLatest: {} },
        errors: [{ message: 'partial' }],
      },
    });

    const result = await service.queryGraphQL(vehicleJwt, 'query { x }');
    expect(result.data.signalsLatest).toEqual({});
  });

  it('C — HTTP 401 propagates unchanged', async () => {
    const err = Object.assign(new Error('Request failed with status code 401'), {
      response: { status: 401, data: { message: 'unauthorized' } },
    });
    postMock.mockRejectedValue(err);

    await expect(service.queryGraphQL(vehicleJwt, 'query { x }')).rejects.toBe(err);
  });

  it('D — HTTP 403 propagates unchanged', async () => {
    const err = Object.assign(new Error('Request failed with status code 403'), {
      response: { status: 403 },
    });
    postMock.mockRejectedValue(err);

    await expect(service.queryGraphQL(vehicleJwt, 'query { x }')).rejects.toThrow();
  });

  it('E — HTTP 429 propagates unchanged', async () => {
    const err = Object.assign(new Error('Request failed with status code 429'), {
      response: { status: 429, headers: { 'retry-after': '2' } },
    });
    postMock.mockRejectedValue(err);

    await expect(service.queryGraphQL(vehicleJwt, 'query { x }')).rejects.toBe(err);
  });

  it('F — HTTP 5xx propagates unchanged', async () => {
    const err = Object.assign(new Error('Request failed with status code 503'), {
      response: { status: 503 },
    });
    postMock.mockRejectedValue(err);

    await expect(service.queryGraphQL(vehicleJwt, 'query { x }')).rejects.toThrow();
  });

  it('G — queryGraphQL uses 15s timeout override', async () => {
    postMock.mockResolvedValue({ data: { data: {} } });

    await service.queryGraphQL(vehicleJwt, 'query { x }', { tokenId: 1 });

    expect(postMock).toHaveBeenCalledWith(
      '',
      { query: 'query { x }', variables: { tokenId: 1 } },
      expect.objectContaining({
        headers: { Authorization: `Bearer ${vehicleJwt}` },
        timeout: 15000,
      }),
    );
  });

  it('H — gateway and executor are pass-through (execute invokes real HTTP)', async () => {
    postMock.mockResolvedValue({ data: { data: { ok: true } } });

    await service.queryGraphQL(vehicleJwt, 'query { ok }');

    expect(postMock).toHaveBeenCalledTimes(1);
    expect(gatewayExecuteSpy).toHaveBeenCalledTimes(1);
    expect(executorExecuteSpy).toHaveBeenCalledTimes(1);
  });

  it('I — GraphQL body and variables unchanged', async () => {
    postMock.mockResolvedValue({ data: { data: {} } });

    await service.queryGraphQL(vehicleJwt, 'query Q($id: Int!) { x }', { id: 9 });

    expect(postMock).toHaveBeenCalledWith(
      '',
      { query: 'query Q($id: Int!) { x }', variables: { id: 9 } },
      expect.any(Object),
    );
  });

  it('J — Authorization header unchanged', async () => {
    postMock.mockResolvedValue({ data: { data: {} } });

    await service.queryGraphQL(vehicleJwt, 'query { x }');

    expect(postMock.mock.calls[0][2].headers.Authorization).toBe(
      `Bearer ${vehicleJwt}`,
    );
  });

  it('fetchVehicleSummary preserves default client timeout (no 15s override)', async () => {
    postMock.mockResolvedValue({
      data: {
        data: {
          signalsLatest: {
            lastSeen: '2026-01-01T00:00:00Z',
            speed: { value: 40 },
          },
        },
      },
    });

    const summary = await service.fetchVehicleSummary(vehicleJwt, 123);

    expect(summary.speedKmh).toBe(40);
    expect(postMock).toHaveBeenCalledWith(
      '',
      expect.objectContaining({ query: expect.stringContaining('signalsLatest') }),
      expect.objectContaining({
        headers: { Authorization: `Bearer ${vehicleJwt}` },
      }),
    );
    expect(postMock.mock.calls[0][2].timeout).toBeUndefined();
    expect(gatewayExecuteSpy).toHaveBeenCalled();
    expect(executorExecuteSpy).toHaveBeenCalled();
  });

  it('fetchVehicleVin returns null on HTTP error (unchanged degrade)', async () => {
    postMock.mockRejectedValue(new Error('Request failed with status code 403'));

    const vin = await service.fetchVehicleVin(vehicleJwt, 456);

    expect(vin).toBeNull();
    expect(gatewayExecuteSpy).toHaveBeenCalled();
    expect(executorExecuteSpy).toHaveBeenCalled();
  });

  describe('queryFsdGraphql (FSD — single attempt, classified envelope)', () => {
    it('uses maxRetries 0 and ADMIN/BACKGROUND on executor', async () => {
      postMock.mockResolvedValue({ status: 200, data: { data: { availableSignals: ['speed'] } } });
      const q = 'query X { availableSignals(tokenId: 1) }';
      const fp = computeFsdQueryFingerprintV1(normalizeFsdQueryTextForFingerprintV1(q));

      const result = await service.queryFsdGraphql({
        vehicleJwt,
        query: q,
        expectedQueryFingerprint: fp,
        requestContext: { tokenId: 1, organizationId: 'o1', vehicleId: 'v1' },
      });

      expect(result.kind).toBe('HTTP_200_OK');
      expect(executorExecuteSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'ADMIN',
          priority: 'BACKGROUND',
          maxRetries: 0,
        }),
      );
      expect(gatewayExecuteSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          priority: DimoProviderRequestPriority.P4_BACKGROUND,
        }),
      );
    });

    it('classifies partial GraphQL errors with data', async () => {
      postMock.mockResolvedValue({
        status: 200,
        data: {
          data: { signalsLatest: {} },
          errors: [{ message: 'partial' }],
        },
      });
      const q = 'query P { signalsLatest(tokenId: 1) { speed { value } } }';
      const fp = computeFsdQueryFingerprintV1(normalizeFsdQueryTextForFingerprintV1(q));

      const result = await service.queryFsdGraphql({
        vehicleJwt,
        query: q,
        expectedQueryFingerprint: fp,
      });

      expect(result.kind).toBe('HTTP_200_PARTIAL_GRAPHQL_ERRORS');
      expect(result.errors[0]?.message).toBe('partial');
    });

    it('classifies GraphQL errors without data', async () => {
      postMock.mockResolvedValue({
        status: 200,
        data: { errors: [{ message: 'no data' }] },
      });
      const q = 'query E { x }';
      const fp = computeFsdQueryFingerprintV1(normalizeFsdQueryTextForFingerprintV1(q));

      const result = await service.queryFsdGraphql({
        vehicleJwt,
        query: q,
        expectedQueryFingerprint: fp,
      });

      expect(result.kind).toBe('GRAPHQL_ERRORS_NO_DATA');
    });

    it('classifies HTTP 400/422 from axios response', async () => {
      postMock.mockRejectedValue(
        Object.assign(new Error('bad'), { response: { status: 422, data: {} } }),
      );
      const q = 'query H { x }';
      const fp = computeFsdQueryFingerprintV1(normalizeFsdQueryTextForFingerprintV1(q));

      const result = await service.queryFsdGraphql({
        vehicleJwt,
        query: q,
        expectedQueryFingerprint: fp,
      });

      expect(result.kind).toBe('HTTP_422');
    });

    it('returns fingerprint mismatch without calling HTTP', async () => {
      const q = 'query M { x }';
      const result = await service.queryFsdGraphql({
        vehicleJwt,
        query: q,
        expectedQueryFingerprint: 'deadbeef',
      });

      expect(result.kind).toBe('QUERY_FINGERPRINT_MISMATCH');
      expect(postMock).not.toHaveBeenCalled();
    });
  });

  it('fetchLatestVehicleSnapshot forwards requestContext to queryGraphQL', async () => {
    postMock.mockResolvedValue({
      data: { data: { signalsLatest: { speed: { value: 1 } } } },
    });

    await service.fetchLatestVehicleSnapshot(vehicleJwt, 99, {
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      tokenId: 99,
    });

    expect(gatewayExecuteSpy).toHaveBeenCalled();
    expect(executorExecuteSpy).toHaveBeenCalled();
    expect(postMock).toHaveBeenCalled();
  });
});
