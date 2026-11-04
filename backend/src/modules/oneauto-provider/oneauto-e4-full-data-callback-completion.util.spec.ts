import { OneAutoProviderJobStatus } from '@prisma/client';
import { persistFullDataCallbackSuccessInTransaction } from './oneauto-e4-full-data-callback-completion.util';

const TEST_VIN = 'WBA12345678901234';

describe('persistFullDataCallbackSuccessInTransaction (atomic ordering)', () => {
  const evaluation = {
    ok: true as const,
    result: { vehicle_identification_number: TEST_VIN },
    envelope: { success: true, result: { vehicle_identification_number: TEST_VIN } },
    wrapperStatus: 200,
  };

  it('does not write audit or callback rows when job transition fails', async () => {
    const create = jest.fn();
    const tx = {
      oneAutoProviderJob: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      oneAutoProviderResponse: { create },
    };

    const result = await persistFullDataCallbackSuccessInTransaction(tx, {
      jobId: 'j1',
      evaluation,
      providerCallbackReceivedAt: new Date(),
      eligiblePriorStatuses: [OneAutoProviderJobStatus.FAILED],
      recoveryAudit: {
        priorStatus: OneAutoProviderJobStatus.FAILED,
        priorLastErrorCode: 'ONEAUTO_CALLBACK_PAYLOAD_MALFORMED',
        priorLastErrorMessageRedacted: 'x',
        inboxRowId: 'inbox-1',
        recoveredAt: new Date(),
      },
    });

    expect(result.transitioned).toBe(false);
    expect(create).not.toHaveBeenCalled();
    expect(tx.oneAutoProviderJob.updateMany).toHaveBeenCalledTimes(1);
  });

  it('writes audit then callback only after a successful transition', async () => {
    const order: string[] = [];
    const tx = {
      oneAutoProviderJob: {
        updateMany: jest.fn().mockImplementation(async () => {
          order.push('updateMany');
          return { count: 1 };
        }),
      },
      oneAutoProviderResponse: {
        create: jest.fn().mockImplementation(async (args: { data: { responsePhase: string } }) => {
          order.push(`create:${args.data.responsePhase}`);
        }),
      },
    };

    const result = await persistFullDataCallbackSuccessInTransaction(tx, {
      jobId: 'j1',
      evaluation,
      providerCallbackReceivedAt: new Date(),
      eligiblePriorStatuses: [OneAutoProviderJobStatus.FAILED],
      recoveryAudit: {
        priorStatus: OneAutoProviderJobStatus.FAILED,
        priorLastErrorCode: 'ONEAUTO_CALLBACK_PAYLOAD_MALFORMED',
        priorLastErrorMessageRedacted: 'x',
        inboxRowId: 'inbox-1',
        recoveredAt: new Date(),
      },
    });

    expect(result.transitioned).toBe(true);
    expect(order).toEqual(['updateMany', 'create:recovery_audit', 'create:callback']);
  });

  it('propagates create failure so the outer transaction can roll back the transition', async () => {
    const tx = {
      oneAutoProviderJob: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      oneAutoProviderResponse: {
        create: jest
          .fn()
          .mockResolvedValueOnce(undefined)
          .mockRejectedValueOnce(new Error('simulated persistence failure')),
      },
    };

    await expect(
      persistFullDataCallbackSuccessInTransaction(tx, {
        jobId: 'j1',
        evaluation,
        providerCallbackReceivedAt: new Date(),
        eligiblePriorStatuses: [OneAutoProviderJobStatus.FAILED],
        recoveryAudit: {
          priorStatus: OneAutoProviderJobStatus.FAILED,
          priorLastErrorCode: 'ONEAUTO_CALLBACK_PAYLOAD_MALFORMED',
          priorLastErrorMessageRedacted: 'x',
          inboxRowId: 'inbox-1',
          recoveredAt: new Date(),
        },
      }),
    ).rejects.toThrow('simulated persistence failure');

    expect(tx.oneAutoProviderJob.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.oneAutoProviderResponse.create).toHaveBeenCalledTimes(2);
  });
});
