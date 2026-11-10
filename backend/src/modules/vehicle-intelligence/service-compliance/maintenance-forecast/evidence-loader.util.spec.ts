import { EVIDENCE_MAX_EVENTS, EVIDENCE_PAGE_SIZE, loadBoundedEvidencePages } from './evidence-loader.util';

describe('loadBoundedEvidencePages', () => {
  const makeRows = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `e-${i}` }));

  it('loads a single page when total <= page size', async () => {
    const all = makeRows(50);
    const { rows, loadFlags } = await loadBoundedEvidencePages(
      async (skip, take) => all.slice(skip, skip + take),
      async () => false,
    );
    expect(rows).toHaveLength(50);
    expect(loadFlags).toHaveLength(0);
  });

  it('paginates 201 rows without truncation flag', async () => {
    const all = makeRows(201);
    const { rows, loadFlags } = await loadBoundedEvidencePages(
      async (skip, take) => all.slice(skip, skip + take),
      async () => false,
    );
    expect(rows).toHaveLength(201);
    expect(loadFlags).not.toContain('HISTORY_EVIDENCE_TRUNCATED');
  });

  it('flags truncation when more than EVIDENCE_MAX_EVENTS exist', async () => {
    const all = makeRows(EVIDENCE_MAX_EVENTS + 5);
    const { rows, loadFlags } = await loadBoundedEvidencePages(
      async (skip, take) => all.slice(skip, skip + take),
      async (skip) => skip < all.length,
    );
    expect(rows).toHaveLength(EVIDENCE_MAX_EVENTS);
    expect(loadFlags).toContain('HISTORY_EVIDENCE_TRUNCATED');
  });

  it('retrieves proof beyond the first page boundary (row 199)', async () => {
    const all = makeRows(250);
    const proof = { id: 'oil-proof', marker: true };
    all[199] = proof;
    const { rows } = await loadBoundedEvidencePages(
      async (skip, take) => all.slice(skip, skip + take),
      async () => false,
    );
    expect(rows.some((r) => (r as { id: string }).id === 'oil-proof')).toBe(true);
    expect(EVIDENCE_PAGE_SIZE).toBe(200);
  });
});
