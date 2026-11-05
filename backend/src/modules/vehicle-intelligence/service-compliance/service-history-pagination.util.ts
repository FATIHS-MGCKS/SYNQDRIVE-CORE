export const SERVICE_HISTORY_PAGE_DEFAULT_LIMIT = 100;
export const SERVICE_HISTORY_PAGE_MAX_LIMIT = 100;

export type ServiceHistoryCursorPayload = {
  eventDateIso: string;
  id: string;
};

export function encodeServiceHistoryCursor(payload: ServiceHistoryCursorPayload): string {
  return Buffer.from(`${payload.eventDateIso}|${payload.id}`, 'utf8').toString('base64url');
}

export function decodeServiceHistoryCursor(cursor: string): ServiceHistoryCursorPayload | null {
  try {
    const raw = Buffer.from(cursor, 'base64url').toString('utf8');
    const sep = raw.indexOf('|');
    if (sep <= 0) return null;
    const eventDateIso = raw.slice(0, sep);
    const id = raw.slice(sep + 1);
    if (!id || Number.isNaN(Date.parse(eventDateIso))) return null;
    return { eventDateIso, id };
  } catch {
    return null;
  }
}

export function clampServiceHistoryPageLimit(limit: number | undefined): number {
  if (limit == null || !Number.isFinite(limit)) return SERVICE_HISTORY_PAGE_DEFAULT_LIMIT;
  return Math.min(Math.max(Math.trunc(limit), 1), SERVICE_HISTORY_PAGE_MAX_LIMIT);
}
