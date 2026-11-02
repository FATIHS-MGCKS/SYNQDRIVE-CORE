import type { PrismaClient } from '@prisma/client';
import { Ds4Layer2HistoricalExportReadRepositoryV1 } from '../export/ds4-layer2-historical-export.repository.v1';

const ORG = 'faa710c9-6d91-4079-a7d5-91fdccdec14a';

describe('ds4-layer2-historical-export.repository.v1', () => {
  it('loads assessments with org-scoped SQL only', async () => {
    const queryRaw = jest.fn().mockResolvedValueOnce([]);
    const repo = new Ds4Layer2HistoricalExportReadRepositoryV1({ $queryRaw: queryRaw } as unknown as PrismaClient);
    await repo.loadAssessmentsForOrganization(ORG);
    expect(queryRaw).toHaveBeenCalledTimes(1);
    const sql = String(queryRaw.mock.calls[0]![0][0]);
    expect(sql).toContain('di_v0_ds4_trip_assessment_v1');
    expect(sql).toContain('organization_id');
  });

  it('loads motion pin scoped by organization and run id', async () => {
    const queryRaw = jest.fn().mockResolvedValueOnce([]);
    const repo = new Ds4Layer2HistoricalExportReadRepositoryV1({ $queryRaw: queryRaw } as unknown as PrismaClient);
    await repo.loadMotionRunPin({ motionRunId: 'run-1', organizationId: ORG });
    const sql = String(queryRaw.mock.calls[0]![0][0]);
    expect(sql).toContain('di_v0_motion_core_shadow_runs_v1');
    expect(sql).toContain('organization_id');
  });

  it('loads work item source family with org and trip pinning', async () => {
    const queryRaw = jest.fn().mockResolvedValueOnce([
      { sourceFamily: 'API_SYNTHETIC', organizationId: ORG, tripId: 'trip-1' },
    ]);
    const repo = new Ds4Layer2HistoricalExportReadRepositoryV1({ $queryRaw: queryRaw } as unknown as PrismaClient);
    const row = await repo.loadWorkItemPin({
      workItemId: 'wi-1',
      organizationId: ORG,
      tripId: 'trip-1',
    });
    expect(row?.sourceFamily).toBe('API_SYNTHETIC');
    const sql = String(queryRaw.mock.calls[0]![0][0]);
    expect(sql).toContain('di_v0_s4_work_items');
    expect(sql).toContain('trip_id');
  });
});
