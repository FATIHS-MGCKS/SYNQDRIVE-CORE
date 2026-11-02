/**
 * Display-only provenance deduplication. Does not mutate API payloads.
 * Preserves first-seen ordering (matches P1-G semantic intent for operators).
 */
export function dedupeProvenanceTagsForDisplay(tags: readonly string[] | null | undefined): string[] {
  if (!tags?.length) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const tag of tags) {
    const normalized = tag.trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

export function readCadenceProvenanceTags(
  cadenceIntelligence: Record<string, unknown> | null | undefined,
): string[] {
  if (!cadenceIntelligence || typeof cadenceIntelligence !== 'object') return [];
  const raw = cadenceIntelligence.provenance;
  if (!Array.isArray(raw)) return [];
  return raw.filter((entry): entry is string => typeof entry === 'string');
}
