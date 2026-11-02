import {
  DS4_RPM_HF_V1B_ENV,
  isDs4RpmHfV1bShadowRunnable,
  parseDs4RpmHfV1bControlPlaneConfig,
  type Ds4RpmHfV1bControlPlaneConfig,
} from './ds4-rpm-hf-v1b-control-plane';

export const DS4_RPM_HF_V1B_TUNING = {
  schedulerIntervalMs: 120_000,
  defaultBatchLimit: 10,
  maxBatchLimit: 50,
  discoveryCandidatePageSize: 50,
  baseRetryDelayMs: 90_000,
  maxRetryDelayMs: 30 * 60_000,
  claimLeaseMs: 5 * 60_000,
  maxProcessingAttempts: 8,
  maxDeferAttempts: 6,
  /** Post-trip HF/VSI readiness window from trip end (defer path). */
  postTripReadinessWindowMs: 72 * 60 * 60_000,
  /** Max SUCCEEDED outbox rows probed per pass for input-revision reopen. */
  revisionProbeLimitPerPass: 5,
} as const;

export class Ds4RpmHfV1bConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'Ds4RpmHfV1bConfigError';
  }
}

export type Ds4RpmHfV1bRuntimeConfig = {
  controlPlane: Ds4RpmHfV1bControlPlaneConfig;
  enabledSince: Date | null;
  batchLimit: number;
  schedulerIntervalMs: number;
};

export function parseDs4RpmHfV1bRuntimeConfig(
  env: Readonly<Record<string, string | undefined>> = process.env,
): Ds4RpmHfV1bRuntimeConfig {
  const controlPlane = parseDs4RpmHfV1bControlPlaneConfig(env);
  const sinceRaw = env[DS4_RPM_HF_V1B_ENV.enabledSince]?.trim();
  let enabledSince: Date | null = null;
  if (sinceRaw) {
    const parsed = new Date(sinceRaw);
    if (Number.isNaN(parsed.getTime())) {
      throw new Ds4RpmHfV1bConfigError(
        `${DS4_RPM_HF_V1B_ENV.enabledSince} must be a valid ISO-8601 timestamp`,
      );
    }
    enabledSince = parsed;
  }
  if (isDs4RpmHfV1bShadowRunnable(controlPlane) && !enabledSince) {
    throw new Ds4RpmHfV1bConfigError(
      `${DS4_RPM_HF_V1B_ENV.enabledSince} is required when RPM HF V1B shadow flags are enabled`,
    );
  }

  const batchRaw = env[DS4_RPM_HF_V1B_ENV.batchLimit];
  const batchParsed = batchRaw
    ? Number.parseInt(batchRaw, 10)
    : DS4_RPM_HF_V1B_TUNING.defaultBatchLimit;
  const batchLimit = Math.min(
    Math.max(1, Number.isFinite(batchParsed) ? batchParsed : DS4_RPM_HF_V1B_TUNING.defaultBatchLimit),
    DS4_RPM_HF_V1B_TUNING.maxBatchLimit,
  );

  return {
    controlPlane,
    enabledSince,
    batchLimit,
    schedulerIntervalMs: DS4_RPM_HF_V1B_TUNING.schedulerIntervalMs,
  };
}

export function isDs4RpmHfV1bWorkerRunnable(config: Ds4RpmHfV1bRuntimeConfig): boolean {
  return isDs4RpmHfV1bShadowRunnable(config.controlPlane) && config.enabledSince != null;
}
