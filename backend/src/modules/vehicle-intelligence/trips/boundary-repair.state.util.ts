/**
 * Durable boundary-repair + downstream-refresh state helpers.
 *
 * Persisted on VehicleTrip.rawDetectionMeta.boundaryRefresh and mirrored on
 * TripRepair.detectorEvidence.boundaryRefreshState for audit recovery.
 */

import type { AnalysisStageState } from './trip-analysis-status';

export type BoundaryRefreshState = 'PENDING' | 'ENQUEUED' | 'COMPLETED';

export type BoundaryRefreshStageState = 'pending' | 'done' | 'skipped' | 'failed';

export interface BoundaryRefreshStages {
  route: BoundaryRefreshStageState;
  behavior: BoundaryRefreshStageState;
  drivingImpact: BoundaryRefreshStageState;
}

export interface BoundaryRefreshRecord {
  state: BoundaryRefreshState;
  /** Deterministic repair generation — stale completions must not match newer repairs. */
  generation: string;
  requestedAt: string;
  enqueuedAt?: string | null;
  completedAt?: string | null;
  lastError?: string | null;
  lastAttemptAt?: string | null;
  lastProgressAt?: string | null;
  leaseUntil?: string | null;
  retryAfter?: string | null;
  attempts: number;
  stages: BoundaryRefreshStages;
}

export const MAX_BOUNDARY_REPAIR_HISTORY_ENTRIES = 20;

/** Active ENQUEUED lease — do not duplicate work while worker may still be running. */
export const BOUNDARY_REFRESH_ENQUEUED_LEASE_MS = 5 * 60_000;

/** ENQUEUED older than this without completion is considered stale/lost. */
export const BOUNDARY_REFRESH_ENQUEUED_STALE_MS = 15 * 60_000;

/** Base backoff for PENDING retries. */
export const BOUNDARY_REFRESH_PENDING_BACKOFF_BASE_MS = 30_000;

/** Max backoff for PENDING retries. */
export const BOUNDARY_REFRESH_PENDING_BACKOFF_MAX_MS = 30 * 60_000;

/** Per-vehicle recovery batch size (only trips with active boundaryRefresh states). */
export const BOUNDARY_REFRESH_RECOVERY_BATCH_SIZE = 20;

export function emptyBoundaryRefreshStages(): BoundaryRefreshStages {
  return {
    route: 'pending',
    behavior: 'pending',
    drivingImpact: 'pending',
  };
}

export function buildBoundaryRepairGeneration(input: {
  auditId: string;
  providerSegmentId: string;
  newStartTime: Date;
  newEndTime: Date;
}): string {
  return [
    input.auditId,
    input.providerSegmentId,
    input.newStartTime.toISOString(),
    input.newEndTime.toISOString(),
  ].join('|');
}

export function readCurrentBoundaryRepairGeneration(
  raw: unknown,
): string | null {
  const meta = readRawDetectionMeta(raw);
  const repair = meta.boundaryRepair;
  if (repair == null || typeof repair !== 'object' || Array.isArray(repair)) {
    return null;
  }
  const record = repair as Record<string, unknown>;
  const newStart = record.newStartTime;
  const newEnd = record.newEndTime;
  const providerSegmentId = record.providerSegmentId;
  if (
    typeof newStart !== 'string' ||
    typeof newEnd !== 'string' ||
    typeof providerSegmentId !== 'string'
  ) {
    return null;
  }
  const auditId =
    typeof record.auditId === 'string'
      ? record.auditId
      : typeof record.repairId === 'string'
        ? record.repairId
        : null;
  if (!auditId) return null;
  return buildBoundaryRepairGeneration({
    auditId,
    providerSegmentId,
    newStartTime: new Date(newStart),
    newEndTime: new Date(newEnd),
  });
}

/** Matches `REPAIR_TYPES.PARTIAL_TRIP_BOUNDARY_EXTENSION` written by boundary repair commit. */
export const PARTIAL_TRIP_BOUNDARY_EXTENSION_REPAIR_TYPE = 'PARTIAL_TRIP_BOUNDARY_EXTENSION';

export function hasCommittedPartialTripBoundaryExtension(raw: unknown): boolean {
  const meta = readRawDetectionMeta(raw);
  const repair = meta.boundaryRepair;
  if (repair == null || typeof repair !== 'object' || Array.isArray(repair)) {
    return false;
  }
  return (
    (repair as Record<string, unknown>).repairType === PARTIAL_TRIP_BOUNDARY_EXTENSION_REPAIR_TYPE
  );
}

export function boundaryRefreshGenerationMatchesRepair(
  refresh: BoundaryRefreshRecord,
  raw: unknown,
): boolean {
  const current = readCurrentBoundaryRepairGeneration(raw);
  return current != null && current === refresh.generation;
}

/**
 * Committed partial-extension repair meta must match persisted trip row boundaries
 * (guards torn reads / concurrent mutation between repair commit and admission).
 */
export function committedBoundaryRepairMatchesTripRow(
  raw: unknown,
  startTime: Date,
  endTime: Date | null,
): boolean {
  if (endTime == null) return false;
  const meta = readRawDetectionMeta(raw);
  const repair = meta.boundaryRepair;
  if (repair == null || typeof repair !== 'object' || Array.isArray(repair)) {
    return false;
  }
  const record = repair as Record<string, unknown>;
  if (record.repairType !== PARTIAL_TRIP_BOUNDARY_EXTENSION_REPAIR_TYPE) {
    return false;
  }
  const newStart = record.newStartTime;
  const newEnd = record.newEndTime;
  if (typeof newStart !== 'string' || typeof newEnd !== 'string') {
    return false;
  }
  return (
    new Date(newStart).getTime() === startTime.getTime() &&
    new Date(newEnd).getTime() === endTime.getTime()
  );
}

/**
 * When boundaryRefresh is retryable, DI admission may proceed only if refresh generation
 * matches the active committed boundary repair (not repairType alone).
 */
export function partialExtensionAllowsAdmissionDuringRetryableRefresh(raw: unknown): boolean {
  if (!hasCommittedPartialTripBoundaryExtension(raw)) return false;
  if (readCurrentBoundaryRepairGeneration(raw) == null) return false;
  const refresh = readBoundaryRefreshRecord(raw);
  if (!isBoundaryRefreshRetryable(refresh)) return true;
  if (refresh == null) return false;
  return boundaryRefreshGenerationMatchesRepair(refresh, raw);
}

export function readRawDetectionMeta(
  raw: unknown,
): Record<string, unknown> {
  if (raw != null && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  return {};
}

export function normalizeBoundaryRepairHistory(raw: unknown): unknown[] {
  return Array.isArray(raw) ? raw : [];
}

export function appendBoundaryRepairHistory(
  priorMeta: Record<string, unknown>,
  entry: Record<string, unknown>,
  maxEntries: number = MAX_BOUNDARY_REPAIR_HISTORY_ENTRIES,
): unknown[] {
  const history = normalizeBoundaryRepairHistory(priorMeta.boundaryRepairHistory);
  const next = [...history, entry];
  if (next.length <= maxEntries) return next;
  return next.slice(next.length - maxEntries);
}

function readBoundaryRefreshStages(raw: unknown): BoundaryRefreshStages {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) {
    return emptyBoundaryRefreshStages();
  }
  const stages = raw as Record<string, unknown>;
  const stage = (key: keyof BoundaryRefreshStages): BoundaryRefreshStageState => {
    const v = stages[key];
    if (v === 'pending' || v === 'done' || v === 'skipped' || v === 'failed') return v;
    return 'pending';
  };
  return {
    route: stage('route'),
    behavior: stage('behavior'),
    drivingImpact: stage('drivingImpact'),
  };
}

export function readBoundaryRefreshRecord(
  raw: unknown,
): BoundaryRefreshRecord | null {
  const meta = readRawDetectionMeta(raw);
  const refresh = meta.boundaryRefresh;
  if (refresh == null || typeof refresh !== 'object' || Array.isArray(refresh)) {
    return null;
  }
  const record = refresh as Record<string, unknown>;
  const state = record.state;
  if (state !== 'PENDING' && state !== 'ENQUEUED' && state !== 'COMPLETED') {
    return null;
  }
  const generation = typeof record.generation === 'string' ? record.generation : '';
  if (!generation) return null;
  return {
    state,
    generation,
    requestedAt: String(record.requestedAt ?? ''),
    enqueuedAt: record.enqueuedAt != null ? String(record.enqueuedAt) : null,
    completedAt: record.completedAt != null ? String(record.completedAt) : null,
    lastError: record.lastError != null ? String(record.lastError) : null,
    lastAttemptAt: record.lastAttemptAt != null ? String(record.lastAttemptAt) : null,
    lastProgressAt: record.lastProgressAt != null ? String(record.lastProgressAt) : null,
    leaseUntil: record.leaseUntil != null ? String(record.leaseUntil) : null,
    retryAfter: record.retryAfter != null ? String(record.retryAfter) : null,
    attempts: typeof record.attempts === 'number' ? record.attempts : 0,
    stages: readBoundaryRefreshStages(record.stages),
  };
}

function isStageTerminal(state: BoundaryRefreshStageState): boolean {
  return state === 'done' || state === 'skipped';
}

/** Mandatory boundary-sensitive stages before COMPLETED. Misuse/post-finalize are non-blocking. */
export function areBoundaryRefreshStagesComplete(stages: BoundaryRefreshStages): boolean {
  if (stages.route === 'failed' || stages.behavior === 'failed' || stages.drivingImpact === 'failed') {
    return false;
  }
  return (
    isStageTerminal(stages.route) &&
    isStageTerminal(stages.behavior) &&
    isStageTerminal(stages.drivingImpact)
  );
}

export function mapAnalysisStageToBoundaryStage(
  state: AnalysisStageState | undefined,
): BoundaryRefreshStageState {
  if (state === 'done' || state === 'skipped' || state === 'failed' || state === 'pending') {
    return state;
  }
  return 'pending';
}

export function computePendingRetryAfterMs(attempts: number): number {
  const exp = Math.min(attempts, 8);
  return Math.min(
    BOUNDARY_REFRESH_PENDING_BACKOFF_BASE_MS * 2 ** exp,
    BOUNDARY_REFRESH_PENDING_BACKOFF_MAX_MS,
  );
}

export function isEnqueuedLeaseActive(
  record: BoundaryRefreshRecord,
  nowMs: number = Date.now(),
): boolean {
  if (record.state !== 'ENQUEUED' || !record.leaseUntil) return false;
  return Date.parse(record.leaseUntil) > nowMs;
}

export function isEnqueuedStale(
  record: BoundaryRefreshRecord,
  nowMs: number = Date.now(),
): boolean {
  if (record.state !== 'ENQUEUED') return false;
  const anchor = record.lastProgressAt ?? record.enqueuedAt ?? record.requestedAt;
  if (!anchor) return true;
  return nowMs - Date.parse(anchor) >= BOUNDARY_REFRESH_ENQUEUED_STALE_MS;
}

export function isBoundaryRefreshRetryable(
  record: BoundaryRefreshRecord | null,
  nowMs: number = Date.now(),
): boolean {
  if (!record) return false;
  if (record.state === 'COMPLETED') return false;
  if (record.state === 'PENDING') {
    if (record.retryAfter && Date.parse(record.retryAfter) > nowMs) return false;
    return true;
  }
  if (record.state === 'ENQUEUED') {
    if (isEnqueuedLeaseActive(record, nowMs)) return false;
    return isEnqueuedStale(record, nowMs);
  }
  return false;
}

/** @deprecated Prefer isBoundaryRefreshRetryable — kept for call sites checking active work. */
export function isBoundaryRefreshPending(raw: unknown): boolean {
  return isBoundaryRefreshRetryable(readBoundaryRefreshRecord(raw));
}

export function buildBoundaryRefreshRecord(
  state: BoundaryRefreshState,
  prior: BoundaryRefreshRecord | null,
  error?: string,
  opts?: {
    generation?: string;
    stages?: Partial<BoundaryRefreshStages>;
    now?: Date;
  },
): BoundaryRefreshRecord {
  const now = opts?.now ?? new Date();
  const nowIso = now.toISOString();
  const generation = opts?.generation ?? prior?.generation ?? '';
  const attempts =
    state === 'PENDING' && prior
      ? prior.attempts + 1
      : prior?.attempts ?? (state === 'PENDING' ? 1 : 0);

  const stages: BoundaryRefreshStages = {
    ...emptyBoundaryRefreshStages(),
    ...(prior?.stages ?? {}),
    ...(opts?.stages ?? {}),
  };

  let leaseUntil = prior?.leaseUntil ?? null;
  let retryAfter = prior?.retryAfter ?? null;
  let lastAttemptAt = prior?.lastAttemptAt ?? null;

  if (state === 'PENDING') {
    lastAttemptAt = prior ? nowIso : null;
    if (prior) {
      retryAfter = new Date(
        now.getTime() + computePendingRetryAfterMs(Math.max(attempts, 1)),
      ).toISOString();
    } else {
      retryAfter = null;
    }
    leaseUntil = null;
  }

  if (state === 'ENQUEUED') {
    lastAttemptAt = nowIso;
    leaseUntil = new Date(now.getTime() + BOUNDARY_REFRESH_ENQUEUED_LEASE_MS).toISOString();
    retryAfter = null;
  }

  if (state === 'COMPLETED') {
    leaseUntil = null;
    retryAfter = null;
  }

  return {
    state,
    generation,
    requestedAt: prior?.requestedAt ?? nowIso,
    enqueuedAt:
      state === 'ENQUEUED' || state === 'COMPLETED'
        ? nowIso
        : prior?.enqueuedAt ?? null,
    completedAt: state === 'COMPLETED' ? nowIso : prior?.completedAt ?? null,
    lastError: error ?? (state === 'COMPLETED' ? null : prior?.lastError ?? null),
    lastAttemptAt,
    lastProgressAt:
      state === 'COMPLETED' ? nowIso : prior?.lastProgressAt ?? lastAttemptAt,
    leaseUntil,
    retryAfter,
    attempts,
    stages,
  };
}
