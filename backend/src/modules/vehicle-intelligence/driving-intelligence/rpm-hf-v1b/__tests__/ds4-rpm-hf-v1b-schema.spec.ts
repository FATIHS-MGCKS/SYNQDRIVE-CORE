import { readFileSync } from 'fs';
import { join } from 'path';

describe('ds4-rpm-hf-v1b schema migration', () => {
  it('defines outbox and run tables with idempotent succeeded fingerprint index', () => {
    const sql = readFileSync(
      join(
        process.cwd(),
        'prisma/migrations/20261028180000_ds4_rpm_hf_v1b_shadow_v1/migration.sql',
      ),
      'utf8',
    );
    expect(sql).toContain('ds4_rpm_hf_v1b_shadow_runs_v1');
    expect(sql).toContain('ds4_rpm_hf_v1b_shadow_outbox_v1');
    expect(sql).toContain('ds4_rpm_hf_v1b_shadow_runs_succeeded_fp_uq');
    expect(sql).toContain('ds4_rpm_hf_v1b_shadow_outbox_trip_engine_uq');
    expect(sql).toContain('revision_last_probed_at');
  });
});
