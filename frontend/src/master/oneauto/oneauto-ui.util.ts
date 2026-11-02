import { newIdempotencyKey } from '../../lib/mfa';
import type { OneAutoJobStatus } from './oneauto-api.types';
import { ONEAUTO_TERMINAL_JOB_STATUSES } from './oneauto-api.types';

export const ONEAUTO_POLL_INTERVAL_MS = 2000;
export const ONEAUTO_MAX_POLL_ATTEMPTS = 90;

export function maskVin(vin: string | null | undefined): string {
  const normalized = (vin ?? '').trim().toUpperCase();
  if (normalized.length < 8) return normalized || '—';
  return `${normalized.slice(0, 3)}…${normalized.slice(-4)}`;
}

export function formatMinorAmount(minor: number | null | undefined, currency: string): string {
  if (minor == null || !Number.isFinite(minor)) return '—';
  const major = minor / 100;
  try {
    return new Intl.NumberFormat('de-DE', {
      style: 'currency',
      currency: currency || 'EUR',
      minimumFractionDigits: 2,
    }).format(major);
  } catch {
    return `${major.toFixed(2)} ${currency}`;
  }
}

export function parseApiErrorCode(message: string): string | undefined {
  const match = /^\[([A-Z0-9_]+)\]/.exec(message.trim());
  return match?.[1];
}

export function isTerminalJobStatus(status: OneAutoJobStatus): boolean {
  return ONEAUTO_TERMINAL_JOB_STATUSES.has(status);
}

const IDEMPOTENCY_STORAGE_PREFIX = 'synqdrive.oneauto.idempotency.v1';

export function readStoredIdempotencyKey(orgId: string, vehicleId: string, serviceSku: string): string | null {
  try {
    return sessionStorage.getItem(`${IDEMPOTENCY_STORAGE_PREFIX}:${orgId}:${vehicleId}:${serviceSku}`);
  } catch {
    return null;
  }
}

export function writeStoredIdempotencyKey(
  orgId: string,
  vehicleId: string,
  serviceSku: string,
  key: string,
): void {
  try {
    sessionStorage.setItem(`${IDEMPOTENCY_STORAGE_PREFIX}:${orgId}:${vehicleId}:${serviceSku}`, key);
  } catch {
    /* ignore quota */
  }
}

export function clearStoredIdempotencyKey(orgId: string, vehicleId: string, serviceSku: string): void {
  try {
    sessionStorage.removeItem(`${IDEMPOTENCY_STORAGE_PREFIX}:${orgId}:${vehicleId}:${serviceSku}`);
  } catch {
    /* ignore */
  }
}

export function resolveExecuteIdempotencyKey(
  orgId: string,
  vehicleId: string,
  serviceSku: string,
  existing?: string | null,
): string {
  const stored = existing ?? readStoredIdempotencyKey(orgId, vehicleId, serviceSku);
  if (stored?.trim()) return stored.trim();
  const fresh = newIdempotencyKey('oneauto-execute');
  writeStoredIdempotencyKey(orgId, vehicleId, serviceSku, fresh);
  return fresh;
}

export function serviceSkuTranslationBase(serviceSku: string): string {
  return `master.oneAuto.sku.${serviceSku}`;
}

export function safeJsonPreview(value: unknown): string {
  if (value == null) return '—';
  try {
    const text = JSON.stringify(value, null, 2);
    if (text.length > 12000) {
      return `${text.slice(0, 12000)}\n…`;
    }
    return text;
  } catch {
    return String(value);
  }
}
