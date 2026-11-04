import { ConfigService } from '@nestjs/config';
import { OneAutoProviderJobStatus } from '@prisma/client';
import { buildExecutionVerifiedOeVinLookupEuFullDataCallback } from './catalog/oneauto-execution-verified-registry';
import { seedOneAutoExecutionVerifiedRegistry } from './catalog/oneauto-execution-verified-registry';
import { ONEAUTO_EXECUTION_VERIFIED_PROVIDER_CONTRACTS } from './catalog/oneauto-verified-contracts';
import {
  evaluateOneAutoFullDataCallbackPayload,
  unwrapOneAutoCallbackBody,
} from './oneauto-callback-full-data.util';
import { OneAutoProviderCallbackService } from './oneauto-provider-callback.service';
import { redactProviderResponseBody } from './oneauto-provider-redact.util';

const TEST_VIN = 'WBA12345678901234';

/**
 * Production-observed One Auto full-data callback bodies (2026-11-04, redacted inbox rows).
 * Job cmw2hedwi… (Tesla Model 3): provider business failure wrapped under `status: 206`.
 * Job cmw2hf8zg… (VW): successful full-data result wrapped under `status: 200`.
 * Both were misclassified as ONEAUTO_CALLBACK_PAYLOAD_MALFORMED (`missing_success` on the wrapper).
 */
const OBSERVED_NO_DATA_CALLBACK = {
  status: 206,
  result: {
    success: false,
    result: null,
    error:
      'There is no data available for this vehicle identification number.  You have not been charged.',
  },
};

function observedSuccessCallback(vin: string = TEST_VIN) {
  return {
    status: 200,
    result: {
      success: true,
      result: {
        vehicle_identification_number: vin,
        manufacturer_desc: 'VOLKSWAGEN',
        vehicle_desc: 'Test',
      },
    },
  };
}

function fullDataContract() {
  return buildExecutionVerifiedOeVinLookupEuFullDataCallback();
}

function awaitingJob(id = 'j-wrapped') {
  return {
    id,
    organizationId: 'org1',
    vehicleId: 'v1',
    serviceSku: 'OE_VIN_LOOKUP_EU',
    vinSnapshot: TEST_VIN,
    status: OneAutoProviderJobStatus.AWAITING_PROVIDER,
    providerCallbackReceivedAt: null,
    retrievalProviderDispatchAt: null,
    providerResultExpiresAt: new Date(Date.now() + 60_000),
    expiresAt: new Date(Date.now() + 3600_000),
  };
}

const fullDataConfig = {
  get: () => ({ enabled: true, callbackEnabled: true, callbackFullDataEnabled: true }),
} as unknown as ConfigService;

describe('OneAuto E4 callback — wrapped `{ status, result: <envelope> }` body (production-observed)', () => {
  beforeEach(() => {
    ONEAUTO_EXECUTION_VERIFIED_PROVIDER_CONTRACTS.set('OE_VIN_LOOKUP_EU', fullDataContract());
  });
  afterEach(() => {
    seedOneAutoExecutionVerifiedRegistry(ONEAUTO_EXECUTION_VERIFIED_PROVIDER_CONTRACTS);
  });

  describe('unwrapOneAutoCallbackBody', () => {
    it('unwraps the observed wrapper and exposes the provider status', () => {
      const unwrapped = unwrapOneAutoCallbackBody(OBSERVED_NO_DATA_CALLBACK);
      expect(unwrapped.wrapped).toBe(true);
      expect(unwrapped.wrapperStatus).toBe(206);
      expect(unwrapped.envelope).toBe(OBSERVED_NO_DATA_CALLBACK.result);
    });

    it('leaves a bare SUCCESS_RESULT_ERROR envelope untouched', () => {
      const bare = { success: true, result: { vehicle_identification_number: TEST_VIN } };
      expect(unwrapOneAutoCallbackBody(bare)).toEqual({
        envelope: bare,
        wrapped: false,
        wrapperStatus: null,
      });
    });

    it('does not treat a bare envelope whose `result` lacks `success` as wrapped', () => {
      const body = { status: 200, result: { vehicle_identification_number: TEST_VIN } };
      expect(unwrapOneAutoCallbackBody(body).wrapped).toBe(false);
    });
  });

  describe('evaluateOneAutoFullDataCallbackPayload', () => {
    it('classifies the observed Tesla no-data callback as provider failure, not malformed', () => {
      const evaluation = evaluateOneAutoFullDataCallbackPayload({
        body: OBSERVED_NO_DATA_CALLBACK,
        contract: fullDataContract(),
        jobVinSnapshot: TEST_VIN,
        vehicleVin: TEST_VIN,
      });
      expect(evaluation.ok).toBe(false);
      if (evaluation.ok) throw new Error('unreachable');
      expect(evaluation.code).toBe('ONEAUTO_CALLBACK_PROVIDER_FAILURE');
      expect(evaluation.diagnostic).toEqual(
        expect.objectContaining({ success: false, providerErrorPresent: true, wrapped: true, wrapperStatus: 206 }),
      );
      expect(evaluation.envelope).toBe(OBSERVED_NO_DATA_CALLBACK.result);
    });

    it('accepts the observed wrapped success callback and returns the unwrapped envelope', () => {
      const body = observedSuccessCallback();
      const evaluation = evaluateOneAutoFullDataCallbackPayload({
        body,
        contract: fullDataContract(),
        jobVinSnapshot: TEST_VIN,
        vehicleVin: TEST_VIN,
      });
      expect(evaluation.ok).toBe(true);
      if (!evaluation.ok) throw new Error('unreachable');
      expect(evaluation.result.vehicle_identification_number).toBe(TEST_VIN);
      expect(evaluation.envelope).toBe(body.result);
      expect(evaluation.wrapperStatus).toBe(200);
    });

    it('still rejects a wrapped success whose VIN does not match the job', () => {
      const evaluation = evaluateOneAutoFullDataCallbackPayload({
        body: observedSuccessCallback('WBA99999999999999'),
        contract: fullDataContract(),
        jobVinSnapshot: TEST_VIN,
        vehicleVin: TEST_VIN,
      });
      expect(evaluation.ok).toBe(false);
      if (evaluation.ok) throw new Error('unreachable');
      expect(evaluation.code).toBe('ONEAUTO_CALLBACK_VIN_MISMATCH');
    });

    it('classifies wrapped `success:true` under status 206 as partial content (not success)', () => {
      const evaluation = evaluateOneAutoFullDataCallbackPayload({
        body: { ...observedSuccessCallback(), status: 206 },
        contract: fullDataContract(),
        jobVinSnapshot: TEST_VIN,
        vehicleVin: TEST_VIN,
      });
      expect(evaluation.ok).toBe(false);
      if (evaluation.ok) throw new Error('unreachable');
      expect(evaluation.code).toBe('ONEAUTO_PARTIAL_CONTENT');
    });

    it('classifies a bare `success:false` envelope as provider failure', () => {
      const evaluation = evaluateOneAutoFullDataCallbackPayload({
        body: { success: false, error: 'x' },
        contract: fullDataContract(),
        jobVinSnapshot: TEST_VIN,
        vehicleVin: TEST_VIN,
      });
      expect(evaluation.ok).toBe(false);
      if (evaluation.ok) throw new Error('unreachable');
      expect(evaluation.code).toBe('ONEAUTO_CALLBACK_PROVIDER_FAILURE');
    });

    it('keeps genuinely malformed bodies as ONEAUTO_CALLBACK_PAYLOAD_MALFORMED with top-level keys', () => {
      const evaluation = evaluateOneAutoFullDataCallbackPayload({
        body: { status: 200, result: { data: {} } },
        contract: fullDataContract(),
        jobVinSnapshot: TEST_VIN,
        vehicleVin: TEST_VIN,
      });
      expect(evaluation.ok).toBe(false);
      if (evaluation.ok) throw new Error('unreachable');
      expect(evaluation.code).toBe('ONEAUTO_CALLBACK_PAYLOAD_MALFORMED');
      expect(evaluation.diagnostic).toEqual(
        expect.objectContaining({ reason: 'missing_success', wrapped: false, topLevelKeys: ['result', 'status'] }),
      );
      expect(evaluation.envelope).toBeUndefined();
    });
  });

  describe('OneAutoProviderCallbackService.ingestProviderCallback', () => {
    function buildPrisma(overrides: { updateManyCount?: number } = {}) {
      const tx = {
        oneAutoProviderResponse: { create: jest.fn() },
        oneAutoProviderJob: {
          updateMany: jest.fn().mockResolvedValue({ count: overrides.updateManyCount ?? 1 }),
        },
      };
      const prisma = {
        oneAutoProviderJob: {
          findFirst: jest.fn().mockResolvedValue(awaitingJob()),
          findUnique: jest.fn(),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
        oneAutoProviderResponse: { create: jest.fn() },
        oneAutoProviderCallbackInbox: {
          findFirst: jest.fn().mockResolvedValue(null),
          create: jest.fn(),
        },
        vehicle: { findFirst: jest.fn().mockResolvedValue({ vin: TEST_VIN }) },
        $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<number>) => fn(tx)),
      };
      return { prisma, tx };
    }

    it('observed no-data callback: job FAILED with provider-failure code, envelope persisted, HTTP-level ack', async () => {
      const { prisma, tx } = buildPrisma();
      const queue = { add: jest.fn() };
      const materialize = { tryMaterializeFromSucceededJob: jest.fn() };
      const svc = new OneAutoProviderCallbackService(
        prisma as never,
        fullDataConfig,
        queue as never,
        materialize as never,
      );

      const result = await svc.ingestProviderCallback({
        deliveryToken: 'tok',
        rawBody: JSON.stringify(OBSERVED_NO_DATA_CALLBACK),
        parsedBody: OBSERVED_NO_DATA_CALLBACK,
      });

      expect(result).toEqual({ ok: true, status: 'provider_failure' });
      expect(prisma.oneAutoProviderCallbackInbox.create).toHaveBeenCalledTimes(1);
      expect(prisma.oneAutoProviderResponse.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          jobId: 'j-wrapped',
          httpStatus: 206,
          responsePhase: 'callback',
          responseBodyJson: expect.objectContaining({ success: false, result: null }),
        }),
      });
      expect(prisma.oneAutoProviderJob.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: OneAutoProviderJobStatus.FAILED,
            lastErrorCode: 'ONEAUTO_CALLBACK_PROVIDER_FAILURE',
          }),
        }),
      );
      // No success transaction, no retrieval GET, no automatic retry, no materialization.
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(tx.oneAutoProviderJob.updateMany).not.toHaveBeenCalled();
      expect(queue.add).not.toHaveBeenCalled();
      expect(materialize.tryMaterializeFromSucceededJob).not.toHaveBeenCalled();
    });

    it('observed wrapped success callback: job SUCCEEDED, unwrapped envelope persisted, no retrieval GET', async () => {
      const { prisma, tx } = buildPrisma();
      const queue = { add: jest.fn() };
      const materialize = { tryMaterializeFromSucceededJob: jest.fn() };
      const svc = new OneAutoProviderCallbackService(
        prisma as never,
        fullDataConfig,
        queue as never,
        materialize as never,
      );
      const body = observedSuccessCallback();

      const result = await svc.ingestProviderCallback({
        deliveryToken: 'tok',
        rawBody: JSON.stringify(body),
        parsedBody: body,
      });

      expect(result).toEqual({ ok: true, status: 'completed' });
      expect(tx.oneAutoProviderResponse.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          httpStatus: 200,
          responsePhase: 'callback',
          responseBodyJson: expect.objectContaining({
            success: true,
            result: expect.objectContaining({ vehicle_identification_number: TEST_VIN }),
          }),
        }),
      });
      const persisted = tx.oneAutoProviderResponse.create.mock.calls[0][0].data.responseBodyJson;
      expect(persisted).not.toHaveProperty('status');
      expect(tx.oneAutoProviderJob.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: OneAutoProviderJobStatus.SUCCEEDED }),
        }),
      );
      expect(queue.add).not.toHaveBeenCalled();
      expect(materialize.tryMaterializeFromSucceededJob).toHaveBeenCalledWith('j-wrapped');
    });

    it('provider-failure callback on an already terminal job does not re-fail or persist a response', async () => {
      const { prisma } = buildPrisma();
      prisma.oneAutoProviderJob.findFirst.mockResolvedValue({
        ...awaitingJob(),
        status: OneAutoProviderJobStatus.FAILED,
      });
      const svc = new OneAutoProviderCallbackService(
        prisma as never,
        fullDataConfig,
        { add: jest.fn() } as never,
        { tryMaterializeFromSucceededJob: jest.fn() } as never,
      );
      const result = await svc.ingestProviderCallback({
        deliveryToken: 'tok',
        rawBody: JSON.stringify(OBSERVED_NO_DATA_CALLBACK),
        parsedBody: OBSERVED_NO_DATA_CALLBACK,
      });
      expect(result).toEqual({ ok: true, status: 'ignored_terminal' });
      expect(prisma.oneAutoProviderResponse.create).not.toHaveBeenCalled();
      expect(prisma.oneAutoProviderJob.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('redactProviderResponseBody', () => {
    it('redacts the provider 202 echo `callBackUrl` (carries the delivery token)', () => {
      const redacted = redactProviderResponseBody({
        success: true,
        result: {
          status: 'Accepted',
          function: 'Vin Lookup',
          callBackUrl: 'https://app.example/api/v1/webhooks/oneauto/provider-callback/secret-token',
          callback_url: 'https://app.example/x/secret-token',
        },
      }) as { result: Record<string, unknown> };
      expect(redacted.result.callBackUrl).toBe('[REDACTED]');
      expect(redacted.result.callback_url).toBe('[REDACTED]');
      expect(redacted.result.status).toBe('Accepted');
    });
  });
});
