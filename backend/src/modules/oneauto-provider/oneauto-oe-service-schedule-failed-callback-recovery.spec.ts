import { OneAutoProviderJobStatus } from '@prisma/client';
import {
  buildExecutionVerifiedOeServiceScheduleEuFullDataCallback,
  seedOneAutoExecutionVerifiedRegistry,
} from './catalog/oneauto-execution-verified-registry';
import { ONEAUTO_EXECUTION_VERIFIED_PROVIDER_CONTRACTS } from './catalog/oneauto-verified-contracts';
import {
  ONEAUTO_OE_SERVICE_SCHEDULE_CALLBACK_RECOVERY_OWNER_ACK_ENV,
  ONEAUTO_OE_SERVICE_SCHEDULE_CALLBACK_RECOVERY_PRODUCTION_AUTHORIZED_ENV,
} from './oneauto-oe-service-schedule-failed-callback-recovery.constants';
import { OneAutoOeServiceScheduleFailedCallbackRecoveryService } from './oneauto-oe-service-schedule-failed-callback-recovery.service';
import { ONEAUTO_OE_SERVICE_SCHEDULE_EU_SERVICE_SKU } from './service-schedule/oneauto-service-schedule-eu.types';
import { ONEAUTO_E4_CALLBACK_RECOVERY_CALLBACK_RESPONSE_PHASE } from './oneauto-e4-failed-callback-recovery.constants';

const JOB_ID = 'cmw4nivup00t8f9nmykx7puu0';
const ORG_ID = 'faa710c9-6d91-4079-a7d5-91fdccdec14a';
const VEHICLE_ID = '8c850ff1-4201-432b-af2e-2711dbc7ca48';
const VIN = 'WVWZZZ3HZLE010725';

function makeScheduleService(serviceId: string): Record<string, unknown> {
  return {
    service_id: serviceId,
    service_interval_desc: 'interval',
    service_months: 36,
    service_kms: null,
    service_miles: null,
    service_description: 'Oil change',
    service_time_hours: 0.5,
    service_tasks: [
      {
        task_id: 'TID1',
        task_action: 'Drain/refill',
        task_description: 'Oil',
        vehicle_position: 'raised',
      },
    ],
    service_parts: [],
  };
}

function wrappedScheduleInboxPayload(vin: string, normalCount: number, extraCount: number) {
  return {
    status: 200,
    result: {
      success: true,
      result: {
        vehicle_identification_number: vin,
        normal_services: Array.from({ length: normalCount }, (_, i) => makeScheduleService(`SIDN${i}`)),
        extra_services: Array.from({ length: extraCount }, (_, i) => makeScheduleService(`SIDE${i}`)),
      },
    },
  };
}

function failedScheduleJob(overrides: Record<string, unknown> = {}) {
  const future = new Date(Date.now() + 86_400_000);
  return {
    id: JOB_ID,
    organizationId: ORG_ID,
    vehicleId: VEHICLE_ID,
    vinSnapshot: VIN,
    serviceSku: ONEAUTO_OE_SERVICE_SCHEDULE_EU_SERVICE_SKU,
    status: OneAutoProviderJobStatus.FAILED,
    lastErrorCode: 'ONEAUTO_CALLBACK_PAYLOAD_INCOMPLETE',
    lastErrorMessageRedacted: 'callback incomplete',
    initialProviderDispatchAt: new Date(Date.now() - 60_000),
    retrievalProviderDispatchAt: null,
    providerResultExpiresAt: future,
    expiresAt: future,
    providerCallbackReceivedAt: null,
    ...overrides,
  };
}

const baseInput = {
  jobId: JOB_ID,
  organizationId: ORG_ID,
  vehicleId: VEHICLE_ID,
  expectedVin: VIN,
  expectedServiceSku: ONEAUTO_OE_SERVICE_SCHEDULE_EU_SERVICE_SKU,
  expectedLastErrorCode: 'ONEAUTO_CALLBACK_PAYLOAD_INCOMPLETE',
  expectedNormalServicesCount: 9,
  expectedExtraServicesCount: 21,
  requireProductionAuthorization: false,
};

describe('OneAutoOeServiceScheduleFailedCallbackRecoveryService (offline)', () => {
  beforeEach(() => {
    ONEAUTO_EXECUTION_VERIFIED_PROVIDER_CONTRACTS.set(
      ONEAUTO_OE_SERVICE_SCHEDULE_EU_SERVICE_SKU,
      buildExecutionVerifiedOeServiceScheduleEuFullDataCallback(),
    );
    delete process.env[ONEAUTO_OE_SERVICE_SCHEDULE_CALLBACK_RECOVERY_PRODUCTION_AUTHORIZED_ENV];
    delete process.env[ONEAUTO_OE_SERVICE_SCHEDULE_CALLBACK_RECOVERY_OWNER_ACK_ENV];
  });

  afterEach(() => {
    seedOneAutoExecutionVerifiedRegistry(ONEAUTO_EXECUTION_VERIFIED_PROVIDER_CONTRACTS);
  });

  it('DRY_RUN_OK: valid 9+21 wrapped payload with JSON nulls', async () => {
    const prisma = {
      oneAutoProviderJob: { findFirst: jest.fn().mockResolvedValue(failedScheduleJob()) },
      oneAutoProviderCallbackInbox: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'inbox-1',
            payloadJson: wrappedScheduleInboxPayload(VIN, 9, 21),
            receivedAt: new Date('2026-11-06T07:27:08.144Z'),
          },
        ]),
      },
      vehicle: { findFirst: jest.fn().mockResolvedValue({ vin: VIN }) },
      oneAutoProviderResponse: { count: jest.fn().mockResolvedValue(0) },
    };
    const svc = new OneAutoOeServiceScheduleFailedCallbackRecoveryService(prisma as never);
    const result = await svc.recoverFailedScheduleCallbackJob({ ...baseInput, dryRun: true });
    expect(result.outcome).toBe('DRY_RUN_OK');
    expect(result.providerHttpRequestCount).toBe(0);
    expect(result.detail?.normalServicesCount).toBe(9);
    expect(result.detail?.extraServicesCount).toBe(21);
  });

  it('RECOVERED: persists audit then callback; zero provider HTTP', async () => {
    const tx = {
      oneAutoProviderResponse: {
        create: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
      },
      oneAutoProviderJob: {
        findFirst: jest.fn().mockResolvedValue(failedScheduleJob()),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const prisma = {
      oneAutoProviderJob: { findFirst: jest.fn().mockResolvedValue(failedScheduleJob()) },
      oneAutoProviderCallbackInbox: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'inbox-1',
            payloadJson: wrappedScheduleInboxPayload(VIN, 9, 21),
            receivedAt: new Date('2026-11-06T07:27:08.144Z'),
          },
        ]),
      },
      vehicle: { findFirst: jest.fn().mockResolvedValue({ vin: VIN }) },
      oneAutoProviderResponse: {
        count: jest.fn().mockResolvedValue(0),
      },
      $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<string>) => fn(tx)),
    };
    const svc = new OneAutoOeServiceScheduleFailedCallbackRecoveryService(prisma as never);
    const result = await svc.recoverFailedScheduleCallbackJob({ ...baseInput, dryRun: false });
    expect(result.outcome).toBe('RECOVERED');
    expect(tx.oneAutoProviderResponse.create).toHaveBeenCalledTimes(2);
    expect(tx.oneAutoProviderResponse.create.mock.calls[0][0].data.responsePhase).toBe('recovery_audit');
    expect(tx.oneAutoProviderResponse.create.mock.calls[1][0].data.responsePhase).toBe(
      ONEAUTO_E4_CALLBACK_RECOVERY_CALLBACK_RESPONSE_PHASE,
    );
    expect(tx.oneAutoProviderResponse.create.mock.calls[1][0].data.responseBodyJson).toMatchObject({
      success: true,
    });
  });

  it('PRECONDITION_FAILED: vehicle VIN mismatch', async () => {
    const prisma = {
      oneAutoProviderJob: { findFirst: jest.fn().mockResolvedValue(failedScheduleJob()) },
      oneAutoProviderCallbackInbox: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'inbox-1', payloadJson: wrappedScheduleInboxPayload(VIN, 9, 21), receivedAt: new Date() },
        ]),
      },
      vehicle: { findFirst: jest.fn().mockResolvedValue({ vin: 'WBA99999999999999' }) },
      oneAutoProviderResponse: { count: jest.fn() },
    };
    const svc = new OneAutoOeServiceScheduleFailedCallbackRecoveryService(prisma as never);
    const result = await svc.recoverFailedScheduleCallbackJob({ ...baseInput, dryRun: true });
    expect(result.outcome).toBe('PAYLOAD_REJECTED');
  });

  it('PRECONDITION_FAILED: wrong organization', async () => {
    const prisma = {
      oneAutoProviderJob: {
        findFirst: jest.fn().mockResolvedValue(failedScheduleJob({ organizationId: 'other-org' })),
      },
    };
    const svc = new OneAutoOeServiceScheduleFailedCallbackRecoveryService(prisma as never);
    const result = await svc.recoverFailedScheduleCallbackJob({ ...baseInput, dryRun: true });
    expect(result.outcome).toBe('PRECONDITION_FAILED');
  });

  it('PRECONDITION_FAILED: wrong expected service SKU', async () => {
    const prisma = {
      oneAutoProviderJob: {
        findFirst: jest.fn().mockResolvedValue(failedScheduleJob()),
      },
    };
    const svc = new OneAutoOeServiceScheduleFailedCallbackRecoveryService(prisma as never);
    const result = await svc.recoverFailedScheduleCallbackJob({
      ...baseInput,
      expectedServiceSku: 'OE_VIN_LOOKUP_EU',
      dryRun: true,
    });
    expect(result.outcome).toBe('PRECONDITION_FAILED');
  });

  it('PRECONDITION_FAILED: unexpected lastErrorCode', async () => {
    const prisma = {
      oneAutoProviderJob: {
        findFirst: jest.fn().mockResolvedValue(failedScheduleJob({ lastErrorCode: 'OTHER' })),
      },
    };
    const svc = new OneAutoOeServiceScheduleFailedCallbackRecoveryService(prisma as never);
    const result = await svc.recoverFailedScheduleCallbackJob({ ...baseInput, dryRun: true });
    expect(result.outcome).toBe('PRECONDITION_FAILED');
  });

  it('PRECONDITION_FAILED: expected VIN does not match job snapshot', async () => {
    const prisma = { oneAutoProviderJob: { findFirst: jest.fn().mockResolvedValue(failedScheduleJob()) } };
    const svc = new OneAutoOeServiceScheduleFailedCallbackRecoveryService(prisma as never);
    const result = await svc.recoverFailedScheduleCallbackJob({
      ...baseInput,
      expectedVin: 'WBA12345678901234',
      dryRun: true,
    });
    expect(result.outcome).toBe('PRECONDITION_FAILED');
  });

  it('INBOX_MISSING', async () => {
    const prisma = {
      oneAutoProviderJob: { findFirst: jest.fn().mockResolvedValue(failedScheduleJob()) },
      oneAutoProviderCallbackInbox: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const svc = new OneAutoOeServiceScheduleFailedCallbackRecoveryService(prisma as never);
    const result = await svc.recoverFailedScheduleCallbackJob({ ...baseInput, dryRun: true });
    expect(result.outcome).toBe('INBOX_MISSING');
  });

  it('INBOX_AMBIGUOUS when two non-duplicate rows', async () => {
    const prisma = {
      oneAutoProviderJob: { findFirst: jest.fn().mockResolvedValue(failedScheduleJob()) },
      oneAutoProviderCallbackInbox: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'a', payloadJson: {}, receivedAt: new Date() },
          { id: 'b', payloadJson: {}, receivedAt: new Date() },
        ]),
      },
    };
    const svc = new OneAutoOeServiceScheduleFailedCallbackRecoveryService(prisma as never);
    const result = await svc.recoverFailedScheduleCallbackJob({ ...baseInput, dryRun: true });
    expect(result.outcome).toBe('INBOX_AMBIGUOUS');
  });

  it('ALREADY_RECOVERED when callback response exists', async () => {
    const prisma = {
      oneAutoProviderJob: { findFirst: jest.fn().mockResolvedValue(failedScheduleJob()) },
      oneAutoProviderCallbackInbox: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'inbox-1', payloadJson: wrappedScheduleInboxPayload(VIN, 9, 21), receivedAt: new Date() },
        ]),
      },
      vehicle: { findFirst: jest.fn().mockResolvedValue({ vin: VIN }) },
      oneAutoProviderResponse: { count: jest.fn().mockResolvedValue(1) },
    };
    const svc = new OneAutoOeServiceScheduleFailedCallbackRecoveryService(prisma as never);
    const result = await svc.recoverFailedScheduleCallbackJob({ ...baseInput, dryRun: true });
    expect(result.outcome).toBe('ALREADY_RECOVERED');
  });

  it('RETENTION_EXPIRED', async () => {
    const past = new Date(Date.now() - 60_000);
    const prisma = {
      oneAutoProviderJob: {
        findFirst: jest.fn().mockResolvedValue(
          failedScheduleJob({ providerResultExpiresAt: past, expiresAt: past }),
        ),
      },
    };
    const svc = new OneAutoOeServiceScheduleFailedCallbackRecoveryService(prisma as never);
    const result = await svc.recoverFailedScheduleCallbackJob({ ...baseInput, dryRun: true, now: new Date() });
    expect(result.outcome).toBe('RETENTION_EXPIRED');
  });

  it('BLOCKED: wrapper status 206 (partial content)', async () => {
    const inner = (wrappedScheduleInboxPayload(VIN, 9, 21) as { result: { result: Record<string, unknown> } }).result;
    const prisma = {
      oneAutoProviderJob: { findFirst: jest.fn().mockResolvedValue(failedScheduleJob()) },
      oneAutoProviderCallbackInbox: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'inbox-1',
            payloadJson: { status: 206, result: { success: true, result: inner.result } },
            receivedAt: new Date(),
          },
        ]),
      },
      vehicle: { findFirst: jest.fn().mockResolvedValue({ vin: VIN }) },
      oneAutoProviderResponse: { count: jest.fn().mockResolvedValue(0) },
    };
    const svc = new OneAutoOeServiceScheduleFailedCallbackRecoveryService(prisma as never);
    const result = await svc.recoverFailedScheduleCallbackJob({ ...baseInput, dryRun: true });
    expect(result.outcome).toBe('BLOCKED');
  });

  it('BLOCKED: count mismatch vs expected', async () => {
    const prisma = {
      oneAutoProviderJob: { findFirst: jest.fn().mockResolvedValue(failedScheduleJob()) },
      oneAutoProviderCallbackInbox: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'inbox-1', payloadJson: wrappedScheduleInboxPayload(VIN, 8, 21), receivedAt: new Date() },
        ]),
      },
      vehicle: { findFirst: jest.fn().mockResolvedValue({ vin: VIN }) },
      oneAutoProviderResponse: { count: jest.fn().mockResolvedValue(0) },
    };
    const svc = new OneAutoOeServiceScheduleFailedCallbackRecoveryService(prisma as never);
    const result = await svc.recoverFailedScheduleCallbackJob({ ...baseInput, dryRun: true });
    expect(result.outcome).toBe('BLOCKED');
  });

  it('PAYLOAD_REJECTED: invalid nested service (service_kms wrong type)', async () => {
    const bad = JSON.parse(JSON.stringify(wrappedScheduleInboxPayload(VIN, 9, 21))) as {
      result: { result: { normal_services: Record<string, unknown>[] } };
    };
    bad.result.result.normal_services[0].service_kms = 'not-a-number' as unknown as number;
    const prisma = {
      oneAutoProviderJob: { findFirst: jest.fn().mockResolvedValue(failedScheduleJob()) },
      oneAutoProviderCallbackInbox: {
        findMany: jest.fn().mockResolvedValue([{ id: 'inbox-1', payloadJson: bad, receivedAt: new Date() }]),
      },
      vehicle: { findFirst: jest.fn().mockResolvedValue({ vin: VIN }) },
      oneAutoProviderResponse: { count: jest.fn().mockResolvedValue(0) },
    };
    const svc = new OneAutoOeServiceScheduleFailedCallbackRecoveryService(prisma as never);
    const result = await svc.recoverFailedScheduleCallbackJob({ ...baseInput, dryRun: true });
    expect(result.outcome).toBe('PAYLOAD_REJECTED');
    expect(result.detail?.code).toBe('ONEAUTO_CALLBACK_PAYLOAD_INCOMPLETE');
  });

  it('concurrent recovery: one RECOVERED one PRECONDITION_FAILED (lost transition)', async () => {
    let transitionCalls = 0;
    const tx = {
      oneAutoProviderResponse: {
        create: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
      },
      oneAutoProviderJob: {
        findFirst: jest.fn().mockResolvedValue(failedScheduleJob()),
        updateMany: jest.fn().mockImplementation(async () => {
          transitionCalls += 1;
          return { count: transitionCalls === 1 ? 1 : 0 };
        }),
      },
    };
    const prisma = {
      oneAutoProviderJob: {
        findFirst: jest.fn().mockResolvedValue(failedScheduleJob()),
        findUnique: jest.fn().mockResolvedValue({
          status: OneAutoProviderJobStatus.FAILED,
          providerCallbackReceivedAt: null,
        }),
      },
      oneAutoProviderCallbackInbox: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'inbox-1', payloadJson: wrappedScheduleInboxPayload(VIN, 9, 21), receivedAt: new Date() },
        ]),
      },
      vehicle: { findFirst: jest.fn().mockResolvedValue({ vin: VIN }) },
      oneAutoProviderResponse: { count: jest.fn().mockResolvedValue(0) },
      $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<string>) => fn(tx)),
    };
    const svc = new OneAutoOeServiceScheduleFailedCallbackRecoveryService(prisma as never);
    const [a, b] = await Promise.all([
      svc.recoverFailedScheduleCallbackJob({ ...baseInput, dryRun: false }),
      svc.recoverFailedScheduleCallbackJob({ ...baseInput, dryRun: false }),
    ]);
    const outcomes = new Set([a.outcome, b.outcome]);
    expect(outcomes.has('RECOVERED')).toBe(true);
    expect(outcomes.has('PRECONDITION_FAILED')).toBe(true);
  });

  it('rollback: transaction rejects on second create', async () => {
    const tx = {
      oneAutoProviderResponse: {
        create: jest
          .fn()
          .mockResolvedValueOnce(undefined)
          .mockRejectedValueOnce(new Error('simulated persistence failure')),
        count: jest.fn().mockResolvedValue(0),
      },
      oneAutoProviderJob: {
        findFirst: jest.fn().mockResolvedValue(failedScheduleJob()),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const prisma = {
      oneAutoProviderJob: { findFirst: jest.fn().mockResolvedValue(failedScheduleJob()) },
      oneAutoProviderCallbackInbox: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'inbox-1', payloadJson: wrappedScheduleInboxPayload(VIN, 9, 21), receivedAt: new Date() },
        ]),
      },
      vehicle: { findFirst: jest.fn().mockResolvedValue({ vin: VIN }) },
      oneAutoProviderResponse: { count: jest.fn().mockResolvedValue(0) },
      $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
    };
    const svc = new OneAutoOeServiceScheduleFailedCallbackRecoveryService(prisma as never);
    await expect(svc.recoverFailedScheduleCallbackJob({ ...baseInput, dryRun: false })).rejects.toThrow(
      'simulated persistence failure',
    );
  });

  it('requires production authorization when enabled', async () => {
    const svc = new OneAutoOeServiceScheduleFailedCallbackRecoveryService({
      oneAutoProviderJob: { findFirst: jest.fn() },
    } as never);
    const result = await svc.recoverFailedScheduleCallbackJob({
      ...baseInput,
      requireProductionAuthorization: true,
    });
    expect(result.outcome).toBe('AUTHORIZATION_DENIED');
  });
});
