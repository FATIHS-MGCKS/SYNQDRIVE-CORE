import { paginateSortedUniqueSignalNames } from './vsi-master-fsd-read.signal-pagination';

describe('paginateSortedUniqueSignalNames', () => {
  const names = Array.from({ length: 26 }, (_, i) => `signal${String(i).padStart(2, '0')}`);

  it('paginates unique catalog names without duplicates across pages', () => {
    const limit = 10;
    const seen = new Set<string>();
    let cursor: string | null = null;
    let pages = 0;
    do {
      const page = paginateSortedUniqueSignalNames({ sortedNames: names, cursor, limit });
      pages += 1;
      expect(page.pageNames.length).toBeLessThanOrEqual(limit);
      for (const n of page.pageNames) {
        expect(seen.has(n)).toBe(false);
        seen.add(n);
      }
      cursor = page.hasMore ? page.nextCursor : null;
      if (page.hasMore) {
        expect(page.nextCursor).toBe(page.pageNames[page.pageNames.length - 1]);
      }
    } while (cursor != null);
    expect(seen.size).toBe(26);
    expect(pages).toBe(3);
  });

  it('resumes after cursor without skipping when many stage rows would share signal names', () => {
    const limit = 5;
    const page1 = paginateSortedUniqueSignalNames({ sortedNames: names, cursor: null, limit });
    const page2 = paginateSortedUniqueSignalNames({
      sortedNames: names,
      cursor: page1.nextCursor,
      limit,
    });
    expect(page1.pageNames[page1.pageNames.length - 1]).toBe('signal04');
    expect(page2.pageNames[0]).toBe('signal05');
    expect(new Set([...page1.pageNames, ...page2.pageNames]).size).toBe(10);
  });
});
