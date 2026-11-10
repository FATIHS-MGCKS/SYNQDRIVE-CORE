export function paginateSortedUniqueSignalNames(input: {
  sortedNames: readonly string[];
  cursor: string | null;
  limit: number;
}): { pageNames: string[]; nextCursor: string | null; hasMore: boolean } {
  const { sortedNames, limit } = input;
  let startIdx = 0;
  if (input.cursor) {
    const idx = sortedNames.findIndex((n) => n === input.cursor);
    if (idx >= 0) {
      startIdx = idx + 1;
    } else {
      startIdx = sortedNames.findIndex((n) => n.localeCompare(input.cursor!) > 0);
      if (startIdx < 0) startIdx = sortedNames.length;
    }
  }
  const slice = sortedNames.slice(startIdx, startIdx + limit + 1);
  const hasMore = slice.length > limit;
  const pageNames = slice.slice(0, limit);
  const nextCursor = hasMore && pageNames.length > 0 ? pageNames[pageNames.length - 1]! : null;
  return { pageNames, nextCursor, hasMore };
}
