import type { PrismaClient } from '@prisma/client';
import { loadDs4LongitudinalEvidenceQualityContextV1 } from '../ds4-longitudinal-evidence-quality-context.loader.v1';

describe('loadDs4LongitudinalEvidenceQualityContextV1', () => {
  const scope = {
    organizationId: 'org-tenant-a',
    tripId: 'trip-1',
    pinnedSnapshotHash: 'snap-hash-abc',
    sparseChannelOutcome: 'NOT_APPLICABLE' as string | null,
  };

  it('scopes read-only SQL to organizationId, tripId, and pinnedSnapshotHash', async () => {
    const queryRaw = jest
      .fn()
      .mockResolvedValueOnce([{ source_family: 'API_SYNTHETIC' }])
      .mockResolvedValueOnce([{ channel_manifest: [{ channel: 'POSITION', outcome: 'PRESENT' }] }]);
    const prisma = { $queryRaw: queryRaw } as unknown as PrismaClient;

    const ctx = await loadDs4LongitudinalEvidenceQualityContextV1(prisma, scope);

    expect(ctx?.sourceFamily).toBe('API_SYNTHETIC');
    expect(queryRaw).toHaveBeenCalledTimes(2);
    const firstCall = queryRaw.mock.calls[0]!;
    expect(JSON.stringify(firstCall)).toContain(scope.organizationId);
    expect(JSON.stringify(firstCall)).toContain(scope.tripId);
    expect(JSON.stringify(firstCall)).toContain(scope.pinnedSnapshotHash);
  });

  it('returns null when pinned snapshot hash is empty (fail closed)', async () => {
    const queryRaw = jest.fn();
    const prisma = { $queryRaw: queryRaw } as unknown as PrismaClient;
    expect(
      await loadDs4LongitudinalEvidenceQualityContextV1(prisma, {
        ...scope,
        pinnedSnapshotHash: '  ',
      }),
    ).toBeNull();
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it('returns null when work item source family is missing or unknown string', async () => {
    const queryRaw = jest.fn().mockResolvedValueOnce([{ source_family: 'NOT_A_FAMILY' }]);
    const prisma = { $queryRaw: queryRaw } as unknown as PrismaClient;
    expect(await loadDs4LongitudinalEvidenceQualityContextV1(prisma, scope)).toBeNull();
  });
});
