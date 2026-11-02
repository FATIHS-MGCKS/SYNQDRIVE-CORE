import { Ds4Layer2P2OfflineReconstructionErrorV1 } from '../export/ds4-layer2-p2-offline-reconstruction.v1';
import { loadDs4Layer2P2OfflinePilotReconstructionRowsV1 } from '../export/ds4-layer2-p2-offline-reconstruction.loader.v1';
import { DS4_LAYER2_P2_OFFLINE_PILOT_ORGANIZATION_ID_V1 } from '../export/ds4-layer2-p2-offline-reconstruction.cohort.v1';

describe('loadDs4Layer2P2OfflinePilotReconstructionRowsV1 tenant isolation', () => {
  it('rejects organizations outside the pilot scope without querying motion payloads', async () => {
    const prisma = {} as never;
    await expect(
      loadDs4Layer2P2OfflinePilotReconstructionRowsV1(prisma, '00000000-0000-4000-8000-000000000001', {
        evaluationCodeSha: 'd'.repeat(40),
        reconstructedAt: new Date(),
      }),
    ).rejects.toBeInstanceOf(Ds4Layer2P2OfflineReconstructionErrorV1);
  });

  it('requires pilot organization constant', () => {
    expect(DS4_LAYER2_P2_OFFLINE_PILOT_ORGANIZATION_ID_V1).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });
});
