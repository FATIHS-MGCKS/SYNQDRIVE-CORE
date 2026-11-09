import type { ServiceEventOrigin, ServiceInfoStatus } from '../../../lib/api';
import type { TranslationKey } from '../../../i18n/LanguageContext';

export type ServiceHistoryItem = ServiceInfoStatus['serviceHistory'][number];

/**
 * Backend (`mapServiceHistoryEvent`) sets `externalSource === (origin === 'ONEAUTO')`.
 * UI labels must follow canonical `origin` first; `externalSource` is only a derived
 * flag for external-evidence limitations, not an override for conflicting metadata.
 */
export function isOriginMetadataInconsistent(item: ServiceHistoryItem): boolean {
  const origin = item.origin as ServiceEventOrigin | undefined;
  return Boolean(item.externalSource) && Boolean(origin) && origin !== 'ONEAUTO';
}

export function shouldShowExternalEvidenceLimitation(item: ServiceHistoryItem): boolean {
  if (isOriginMetadataInconsistent(item)) return true;
  return Boolean(item.externalSource) || item.origin === 'ONEAUTO';
}

export function resolveServiceHistoryOriginKey(item: ServiceHistoryItem): TranslationKey {
  if (isOriginMetadataInconsistent(item)) {
    return 'health.serviceInfo.v3.history.origin.ambiguous';
  }

  const origin = item.origin as ServiceEventOrigin | undefined;
  switch (origin) {
    case 'ONEAUTO':
      return 'health.serviceInfo.v3.history.origin.oneAuto';
    case 'MANUAL':
      return 'health.serviceInfo.v3.history.origin.manual';
    case 'AI_UPLOAD':
      return 'health.serviceInfo.v3.history.origin.aiUpload';
    case 'WORKSHOP_DOCUMENT':
      return 'health.serviceInfo.v3.history.origin.workshop';
    case 'OEM':
      return 'health.serviceInfo.v3.history.origin.oem';
    case 'IMPORT':
      return 'health.serviceInfo.v3.history.origin.import';
    default:
      if (item.externalSource) return 'health.serviceInfo.v3.history.origin.oneAuto';
      return 'health.serviceInfo.v3.history.origin.unknown';
  }
}

function parseEventTime(iso: string): number {
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? 0 : t;
}

/** Stable newest-first ordering; invalid dates sort last within tie-break by id. */
export function sortServiceHistoryItems(items: ServiceHistoryItem[]): ServiceHistoryItem[] {
  return [...items].sort((a, b) => {
    const dt = parseEventTime(b.date) - parseEventTime(a.date);
    if (dt !== 0) return dt;
    return a.id.localeCompare(b.id);
  });
}

/** Merge pages with ID-based duplicate protection. */
export function mergeServiceHistoryPages(
  initial: ServiceHistoryItem[],
  extra: ServiceHistoryItem[],
): ServiceHistoryItem[] {
  const seen = new Set<string>();
  const merged: ServiceHistoryItem[] = [];
  for (const item of [...initial, ...extra]) {
    if (!item?.id || seen.has(item.id)) continue;
    seen.add(item.id);
    merged.push(item);
  }
  return sortServiceHistoryItems(merged);
}

export function eventYear(iso: string): number | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.getFullYear();
}

export type ServiceHistoryYearGroup = {
  year: number | 'unknown';
  items: ServiceHistoryItem[];
};

export function groupServiceHistoryByYear(items: ServiceHistoryItem[]): ServiceHistoryYearGroup[] {
  const sorted = sortServiceHistoryItems(items);
  const groups: ServiceHistoryYearGroup[] = [];
  for (const item of sorted) {
    const y = eventYear(item.date);
    const bucket: number | 'unknown' = y ?? 'unknown';
    const last = groups[groups.length - 1];
    if (last && last.year === bucket) {
      last.items.push(item);
    } else {
      groups.push({ year: bucket, items: [item] });
    }
  }
  return groups;
}
