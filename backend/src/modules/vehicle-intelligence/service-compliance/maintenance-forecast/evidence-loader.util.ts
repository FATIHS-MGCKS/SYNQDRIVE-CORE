import type { MaintenanceDataQualityFlag } from './maintenance-forecast.types';

/** Rows returned per DB page (newest first). */
export const EVIDENCE_PAGE_SIZE = 200;
/** Hard cap on service-history rows loaded per forecast (bounded scan). */
export const EVIDENCE_MAX_EVENTS = 600;

export type EvidencePageLoader = (skip: number, take: number) => Promise<unknown[]>;
export type EvidenceOverflowProbe = (skip: number) => Promise<boolean>;

/**
 * Loads service-history evidence in deterministic pages until the stream ends or {@link EVIDENCE_MAX_EVENTS} is reached.
 * When the cap is hit and additional rows exist, {@link HISTORY_EVIDENCE_TRUNCATED} is returned.
 */
export async function loadBoundedEvidencePages(
  loadPage: EvidencePageLoader,
  hasMoreBeyond: EvidenceOverflowProbe,
): Promise<{ rows: unknown[]; loadFlags: MaintenanceDataQualityFlag[] }> {
  const loadFlags: MaintenanceDataQualityFlag[] = [];
  const rows: unknown[] = [];
  let skip = 0;

  while (rows.length < EVIDENCE_MAX_EVENTS) {
    const take = Math.min(EVIDENCE_PAGE_SIZE, EVIDENCE_MAX_EVENTS - rows.length);
    let page: unknown[];
    try {
      page = await loadPage(skip, take);
    } catch {
      loadFlags.push('HISTORY_EVIDENCE_LOAD_FAILED');
      break;
    }
    if (page.length === 0) break;
    rows.push(...page);
    if (page.length < take) break;
    skip += page.length;
  }

  if (!loadFlags.includes('HISTORY_EVIDENCE_LOAD_FAILED') && rows.length >= EVIDENCE_MAX_EVENTS) {
    try {
      const more = await hasMoreBeyond(EVIDENCE_MAX_EVENTS);
      if (more) {
        loadFlags.push('HISTORY_EVIDENCE_TRUNCATED');
        rows.splice(EVIDENCE_MAX_EVENTS);
      }
    } catch {
      loadFlags.push('HISTORY_EVIDENCE_LOAD_FAILED');
    }
  }

  return { rows, loadFlags };
}
