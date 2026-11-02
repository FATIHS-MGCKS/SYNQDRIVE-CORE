export const DI_V0_DS4_ASSESSMENT_ENV = {
  enabled: 'DI_V0_DS4_ASSESSMENT_ENABLED',
  worker: 'DI_V0_DS4_ASSESSMENT_WORKER_ENABLED',
  batchLimit: 'DI_V0_DS4_ASSESSMENT_BATCH_LIMIT',
  minMotionRunCreatedAt: 'DI_V0_DS4_ASSESSMENT_MIN_MOTION_RUN_CREATED_AT',
} as const;

/** Proposed owner activation boundary (DS4 L2 deploy completion); not a runtime default. */
export const DI_V0_DS4_ASSESSMENT_PROPOSED_COLLECTION_CUTOFF_UTC = '2026-10-28T17:42:00Z' as const;

export const DI_V0_DS4_ASSESSMENT_TUNING = {
  schedulerIntervalMs: 120_000,
  defaultBatchLimit: 5,
  maxBatchLimit: 25,
  baseRetryDelayMs: 60_000,
  maxRetryDelayMs: 30 * 60_000,
  claimLeaseMs: 5 * 60_000,
  maxProcessingAttempts: 5,
} as const;

export type DiV0Ds4AssessmentRuntimeConfig = {
  enabled: boolean;
  workerEnabled: boolean;
  batchLimit: number;
  schedulerIntervalMs: number;
  /** Parsed once from env at process start; unset/invalid => worker fail-closed. */
  minMotionRunCreatedAt: Date | null;
};

function parseBooleanFlag(raw: string | undefined): boolean {
  return raw === '1' || raw?.toLowerCase() === 'true';
}

export function parseDiV0Ds4AssessmentMinMotionRunCreatedAt(
  raw: string | undefined,
): Date | null {
  if (raw === undefined || raw.trim().length === 0) return null;
  const parsed = new Date(raw.trim());
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

export function parseDiV0Ds4AssessmentRuntimeConfig(
  env: Readonly<Record<string, string | undefined>> = process.env,
): DiV0Ds4AssessmentRuntimeConfig {
  const batchRaw = env[DI_V0_DS4_ASSESSMENT_ENV.batchLimit];
  const batchParsed = batchRaw ? Number.parseInt(batchRaw, 10) : DI_V0_DS4_ASSESSMENT_TUNING.defaultBatchLimit;
  const batchLimit = Math.min(
    Math.max(1, Number.isFinite(batchParsed) ? batchParsed : DI_V0_DS4_ASSESSMENT_TUNING.defaultBatchLimit),
    DI_V0_DS4_ASSESSMENT_TUNING.maxBatchLimit,
  );
  return {
    enabled: parseBooleanFlag(env[DI_V0_DS4_ASSESSMENT_ENV.enabled]),
    workerEnabled: parseBooleanFlag(env[DI_V0_DS4_ASSESSMENT_ENV.worker]),
    batchLimit,
    schedulerIntervalMs: DI_V0_DS4_ASSESSMENT_TUNING.schedulerIntervalMs,
    minMotionRunCreatedAt: parseDiV0Ds4AssessmentMinMotionRunCreatedAt(
      env[DI_V0_DS4_ASSESSMENT_ENV.minMotionRunCreatedAt],
    ),
  };
}

export function isDiV0Ds4AssessmentWorkerRunnable(config: DiV0Ds4AssessmentRuntimeConfig): boolean {
  return config.enabled && config.workerEnabled && config.minMotionRunCreatedAt != null;
}
