import { ConfigService } from '@nestjs/config';
import { OneAutoProviderJobStatus } from '@prisma/client';
import {
  buildExecutionVerifiedOeVinLookupEuFullDataCallback,
  seedOneAutoExecutionVerifiedRegistry,
} from './catalog/oneauto-execution-verified-registry';
import { ONEAUTO_EXECUTION_VERIFIED_PROVIDER_CONTRACTS } from './catalog/oneauto-verified-contracts';
import { evaluateOneAutoFullDataCallbackPayload } from './oneauto-callback-full-data.util';
import {
  ONEAUTO_E4_CALLBACK_RECOVERY_CALLBACK_RESPONSE_PHASE,
  ONEAUTO_E4_CALLBACK_RECOVERY_PRODUCTION_AUTHORIZED_ENV,
  ONEAUTO_E4_CALLBACK_RECOVERY_OWNER_ACK_ENV,
} from './oneauto-e4-failed-callback-recovery.constants';
import { OneAutoE4FailedCallbackRecoveryService } from './oneauto-e4-failed-callback-recovery.service';

/** Production VW job (2026-11-04) — synthetic VIN in tests only. */
const VW_JOB_ID = 'cmw2hf8zg005mrfvji5e134ns';
const VW_ORG_ID = 'faa710c9-6d91-4079-a7d5-91fdccdec14a';
const VW_VEHICLE_ID = '8c850ff1-4201-432b-af2e-2711dbc7ca48';
const VW_VIN = 'WVWZZZ3CZWE123456';

/**
 * Production-observed wrapped success callback (redacted inbox row for VW job).
 * Forensics: status=200, result.success=true, result.result object with 18 OpenAPI keys.
 */
function observedVwWrappedSuccessCallback(vin: string = VW_VIN) {
  return {
    status: 200,
    result: {
      success: true,
      result: {
        vehicle_identification_number: vin,
        manufacturer_desc: 'VOLKSWAGEN',
        vehicle_desc: 'GOLF',
        model_desc: 'GOLF',
        derivative_desc: '1.4 TSI',
        body_type_desc: 'Hatchback',
        fuel_type_desc: 'Petrol',
        transmission_desc: 'Manual',
        engine_size_desc: '1395',
        doors: '5',
        seats: '5',
        colour: 'Blue',
        registration_date: '2015-01-01',
        year_of_manufacture: '2015',
        co2_emissions: '120',
        power_output: '125',
        data_updated_at: '2026-11-04',
      },
    },
  };
}

function failedVwJob(overrides: Record<string, unknown> = {}) {
  const future = new Date(Date.now() + 86_400_000);
  return {
    id: VW_JOB_ID,
    organizationId: VW_ORG_ID,
    vehicleId: VW_VEHICLE_ID,
    vinSnapshot: VW_VIN,
    serviceSku: 'OE_VIN_LOOKUP_EU',
    status: OneAutoProviderJobStatus.FAILED,
    lastErrorCode: 'ONEAUTO_CALLBACK_PAYLOAD_MALFORMED',
    lastErrorMessageRedacted: 'Full-data callback payload rejected',
    initialProviderDispatchAt: new Date(Date.now() - 60_000),
    retrievalProviderDispatchAt: null,
    providerResultExpiresAt: future,
    expiresAt: future,
    providerCallbackReceivedAt: null,
    ...overrides,
  };
}

describe('OneAuto E4 failed callback recovery (offline)', () => {
  beforeEach(() => {
    ONEAUTO_EXECUTION_VERIFIED_PROVIDER_CONTRACTS.set(
      'OE_VIN_LOOKUP_EU',
      buildExecutionVerifiedOeVinLookupEuFullDataCallback(),
    );
    delete process.env[ONEAUTO_E4_CALLBACK_RECOVERY_PRODUCTION_AUTHORIZED_ENV];
    delete process.env[ONEAUTO_E4_CALLBACK_RECOVERY_OWNER_ACK_ENV];
  });

  afterEach(() => {
    seedOneAutoExecutionVerifiedRegistry(ONEAUTO_EXECUTION_VERIFIED_PROVIDER_CONTRACTS);
  });

  it('production VW inbox shape passes corrected parser and VIN binding (offline)', () => {
    const contract = buildExecutionVerifiedOeVinLookupEuFullDataCallback();
    const evaluation = evaluateOneAutoFullDataCallbackPayload({
      body: observedVwWrappedSuccessCallback(),
      contract,
      jobVinSnapshot: VW_VIN,
      vehicleVin: VW_VIN,
    });
    expect(evaluation.ok).toBe(true);
    if (!evaluation.ok) throw new Error(JSON.stringify(evaluation));
    expect(evaluation.wrapperStatus).toBe(200);
    expect(Object.keys(evaluation.result).length).toBeGreaterThanOrEqual(10);
  });

  it('recovers FAILED VW job from inbox without provider HTTP', async () => {
    const tx = {
      oneAutoProviderResponse: {
        create: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
      },
      oneAutoProviderJob: {
        findFirst: jest.fn().mockResolvedValue(failedVwJob()),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const prisma = {
      oneAutoProviderJob: {
        findFirst: jest.fn().mockResolvedValue(failedVwJob()),
        findUnique: jest.fn(),
      },
      oneAutoProviderCallbackInbox: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'inbox-vw-1',
            payloadJson: observedVwWrappedSuccessCallback(),
            receivedAt: new Date('2026-11-04T19:00:47.730Z'),
          },
        ]),
      },
      vehicle: {
        findFirst: jest.fn().mockResolvedValue({ vin: VW_VIN }),
      },
      $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<string>) => fn(tx)),
    };
    const materialize = { tryMaterializeFromSucceededJob: jest.fn().mockResolvedValue({ outcome: 'CREATED' }) };
    const svc = new OneAutoE4FailedCallbackRecoveryService(
      prisma as never,
      materialize as never,
    );

    const result = await svc.recoverFailedFullDataCallbackJob({
      jobId: VW_JOB_ID,
      organizationId: VW_ORG_ID,
      vehicleId: VW_VEHICLE_ID,
      expectedLastErrorCode: 'ONEAUTO_CALLBACK_PAYLOAD_MALFORMED',
      requireProductionAuthorization: false,
    });

    expect(result.outcome).toBe('RECOVERED');
    expect(result.providerHttpRequestCount).toBe(0);
    expect(tx.oneAutoProviderResponse.create).toHaveBeenCalledTimes(2);
    expect(tx.oneAutoProviderResponse.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ responsePhase: 'recovery_audit' }),
      }),
    );
    expect(tx.oneAutoProviderResponse.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          responsePhase: ONEAUTO_E4_CALLBACK_RECOVERY_CALLBACK_RESPONSE_PHASE,
          responseBodyJson: expect.objectContaining({ success: true }),
        }),
      }),
    );
    expect(materialize.tryMaterializeFromSucceededJob).toHaveBeenCalledWith(VW_JOB_ID);
  });

  it('rejects VIN mismatch between job and vehicle', async () => {
    const prisma = {
      oneAutoProviderJob: { findFirst: jest.fn().mockResolvedValue(failedVwJob()) },
      oneAutoProviderCallbackInbox: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'inbox-vw-1',
            payloadJson: observedVwWrappedSuccessCallback(),
            receivedAt: new Date(),
          },
        ]),
      },
      vehicle: { findFirst: jest.fn().mockResolvedValue({ vin: 'WBA99999999999999' }) },
    };
    const svc = new OneAutoE4FailedCallbackRecoveryService(
      prisma as never,
      { tryMaterializeFromSucceededJob: jest.fn() } as never,
    );
    const result = await svc.recoverFailedFullDataCallbackJob({
      jobId: VW_JOB_ID,
      organizationId: VW_ORG_ID,
      vehicleId: VW_VEHICLE_ID,
      expectedLastErrorCode: 'ONEAUTO_CALLBACK_PAYLOAD_MALFORMED',
      requireProductionAuthorization: false,
    });
    expect(result.outcome).toBe('PAYLOAD_REJECTED');
    expect(result.detail?.code ?? result.detail?.reason).toBeTruthy();
  });

  it('rejects expired retention window', async () => {
    const prisma = {
      oneAutoProviderJob: {
        findFirst: jest.fn().mockResolvedValue(
          failedVwJob({
            providerResultExpiresAt: new Date(Date.now() - 1000),
            expiresAt: new Date(Date.now() - 1000),
          }),
        ),
      },
    };
    const svc = new OneAutoE4FailedCallbackRecoveryService(
      prisma as never,
      { tryMaterializeFromSucceededJob: jest.fn() } as never,
    );
    const result = await svc.recoverFailedFullDataCallbackJob({
      jobId: VW_JOB_ID,
      organizationId: VW_ORG_ID,
      vehicleId: VW_VEHICLE_ID,
      expectedLastErrorCode: 'ONEAUTO_CALLBACK_PAYLOAD_MALFORMED',
      requireProductionAuthorization: false,
    });
    expect(result.outcome).toBe('RETENTION_EXPIRED');
  });

  it('rejects missing inbox row', async () => {
    const prisma = {
      oneAutoProviderJob: { findFirst: jest.fn().mockResolvedValue(failedVwJob()) },
      oneAutoProviderCallbackInbox: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const svc = new OneAutoE4FailedCallbackRecoveryService(
      prisma as never,
      { tryMaterializeFromSucceededJob: jest.fn() } as never,
    );
    const result = await svc.recoverFailedFullDataCallbackJob({
      jobId: VW_JOB_ID,
      organizationId: VW_ORG_ID,
      vehicleId: VW_VEHICLE_ID,
      expectedLastErrorCode: 'ONEAUTO_CALLBACK_PAYLOAD_MALFORMED',
      requireProductionAuthorization: false,
    });
    expect(result.outcome).toBe('INBOX_MISSING');
  });

  it('rejects unexpected last_error_code', async () => {
    const prisma = {
      oneAutoProviderJob: {
        findFirst: jest.fn().mockResolvedValue(
          failedVwJob({ lastErrorCode: 'ONEAUTO_ASYNC_POLL_UNVERIFIED' }),
        ),
      },
    };
    const svc = new OneAutoE4FailedCallbackRecoveryService(
      prisma as never,
      { tryMaterializeFromSucceededJob: jest.fn() } as never,
    );
    const result = await svc.recoverFailedFullDataCallbackJob({
      jobId: VW_JOB_ID,
      organizationId: VW_ORG_ID,
      vehicleId: VW_VEHICLE_ID,
      expectedLastErrorCode: 'ONEAUTO_CALLBACK_PAYLOAD_MALFORMED',
      requireProductionAuthorization: false,
    });
    expect(result.outcome).toBe('PRECONDITION_FAILED');
    expect(result.detail).toEqual(
      expect.objectContaining({ reason: 'unexpected_last_error_code' }),
    );
  });

  it('duplicate invocation is idempotent (already recovered)', async () => {
    const prisma = {
      oneAutoProviderJob: {
        findFirst: jest.fn().mockResolvedValue({
          ...failedVwJob(),
          status: OneAutoProviderJobStatus.SUCCEEDED,
          providerCallbackReceivedAt: new Date(),
        }),
      },
      oneAutoProviderResponse: { count: jest.fn().mockResolvedValue(1) },
    };
    const svc = new OneAutoE4FailedCallbackRecoveryService(
      prisma as never,
      { tryMaterializeFromSucceededJob: jest.fn() } as never,
    );
    const result = await svc.recoverFailedFullDataCallbackJob({
      jobId: VW_JOB_ID,
      organizationId: VW_ORG_ID,
      vehicleId: VW_VEHICLE_ID,
      expectedLastErrorCode: 'ONEAUTO_CALLBACK_PAYLOAD_MALFORMED',
      requireProductionAuthorization: false,
    });
    expect(result.outcome).toBe('ALREADY_RECOVERED');
  });

  it('returns ALREADY_RECOVERED when callback response already exists in transaction', async () => {
      const tx = {
        oneAutoProviderResponse: {
          create: jest.fn(),
          count: jest.fn().mockResolvedValue(1),
        },
        oneAutoProviderJob: { updateMany: jest.fn(), findFirst: jest.fn() },
      };
      const prisma = {
        oneAutoProviderJob: { findFirst: jest.fn().mockResolvedValue(failedVwJob()) },
        oneAutoProviderCallbackInbox: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: 'inbox-vw-1',
              payloadJson: observedVwWrappedSuccessCallback(),
              receivedAt: new Date(),
            },
          ]),
        },
        vehicle: { findFirst: jest.fn().mockResolvedValue({ vin: VW_VIN }) },
        $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<string>) => fn(tx)),
      };
      const svc = new OneAutoE4FailedCallbackRecoveryService(
        prisma as never,
        { tryMaterializeFromSucceededJob: jest.fn() } as never,
      );
      const result = await svc.recoverFailedFullDataCallbackJob({
        jobId: VW_JOB_ID,
        organizationId: VW_ORG_ID,
        vehicleId: VW_VEHICLE_ID,
        expectedLastErrorCode: 'ONEAUTO_CALLBACK_PAYLOAD_MALFORMED',
        requireProductionAuthorization: false,
      });
      expect(result.outcome).toBe('ALREADY_RECOVERED');
      expect(tx.oneAutoProviderJob.updateMany).not.toHaveBeenCalled();
      expect(tx.oneAutoProviderResponse.create).not.toHaveBeenCalled();
    });

  it('concurrent recovery: only one transition succeeds; loser is idempotent or precondition failed', async () => {
      let transitionAttempts = 0;
      const tx = {
        oneAutoProviderResponse: {
          create: jest.fn(),
          count: jest.fn().mockResolvedValue(0),
        },
        oneAutoProviderJob: {
          findFirst: jest.fn().mockResolvedValue(failedVwJob()),
          updateMany: jest.fn().mockImplementation(async () => {
            transitionAttempts += 1;
            return { count: transitionAttempts === 1 ? 1 : 0 };
          }),
        },
      };
      const prisma = {
        oneAutoProviderJob: {
          findFirst: jest.fn().mockResolvedValue(failedVwJob()),
          findUnique: jest.fn().mockResolvedValue({
            status: OneAutoProviderJobStatus.SUCCEEDED,
            providerCallbackReceivedAt: new Date(),
          }),
        },
        oneAutoProviderCallbackInbox: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: 'inbox-vw-1',
              payloadJson: observedVwWrappedSuccessCallback(),
              receivedAt: new Date(),
            },
          ]),
        },
        vehicle: { findFirst: jest.fn().mockResolvedValue({ vin: VW_VIN }) },
        $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<string>) => fn(tx)),
      };
      const materialize = { tryMaterializeFromSucceededJob: jest.fn().mockResolvedValue({ outcome: 'CREATED' }) };
      const svc = new OneAutoE4FailedCallbackRecoveryService(
        prisma as never,
        materialize as never,
      );

      const [first, second] = await Promise.all([
        svc.recoverFailedFullDataCallbackJob({
          jobId: VW_JOB_ID,
          organizationId: VW_ORG_ID,
          vehicleId: VW_VEHICLE_ID,
          expectedLastErrorCode: 'ONEAUTO_CALLBACK_PAYLOAD_MALFORMED',
          requireProductionAuthorization: false,
        }),
        svc.recoverFailedFullDataCallbackJob({
          jobId: VW_JOB_ID,
          organizationId: VW_ORG_ID,
          vehicleId: VW_VEHICLE_ID,
          expectedLastErrorCode: 'ONEAUTO_CALLBACK_PAYLOAD_MALFORMED',
          requireProductionAuthorization: false,
        }),
      ]);

      const outcomes = [first.outcome, second.outcome].sort();
      expect(outcomes).toEqual(['ALREADY_RECOVERED', 'RECOVERED'].sort());
      expect(materialize.tryMaterializeFromSucceededJob).toHaveBeenCalledTimes(1);
      expect(tx.oneAutoProviderResponse.create).toHaveBeenCalledTimes(2);
  });

  it('dry-run validates VW payload without writes', async () => {
    const prisma = {
      oneAutoProviderJob: { findFirst: jest.fn().mockResolvedValue(failedVwJob()) },
      oneAutoProviderCallbackInbox: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'inbox-vw-1',
            payloadJson: observedVwWrappedSuccessCallback(),
            receivedAt: new Date('2026-11-04T19:00:47.730Z'),
          },
        ]),
      },
      vehicle: { findFirst: jest.fn().mockResolvedValue({ vin: VW_VIN }) },
    };
    const svc = new OneAutoE4FailedCallbackRecoveryService(
      prisma as never,
      { tryMaterializeFromSucceededJob: jest.fn() } as never,
    );
    const result = await svc.recoverFailedFullDataCallbackJob({
      jobId: VW_JOB_ID,
      organizationId: VW_ORG_ID,
      vehicleId: VW_VEHICLE_ID,
      expectedLastErrorCode: 'ONEAUTO_CALLBACK_PAYLOAD_MALFORMED',
      dryRun: true,
      requireProductionAuthorization: false,
    });
    expect(result.outcome).toBe('DRY_RUN_OK');
    expect(result.detail?.wrapperStatus).toBe(200);
  });

  it('requires production authorization env when enabled', async () => {
    const svc = new OneAutoE4FailedCallbackRecoveryService(
      { oneAutoProviderJob: { findFirst: jest.fn() } } as never,
      { tryMaterializeFromSucceededJob: jest.fn() } as never,
    );
    const result = await svc.recoverFailedFullDataCallbackJob({
      jobId: VW_JOB_ID,
      organizationId: VW_ORG_ID,
      vehicleId: VW_VEHICLE_ID,
      expectedLastErrorCode: 'ONEAUTO_CALLBACK_PAYLOAD_MALFORMED',
    });
    expect(result.outcome).toBe('AUTHORIZATION_DENIED');
  });
});
