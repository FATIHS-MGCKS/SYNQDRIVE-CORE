export const TDL_EV_OBS_RETENTION_PURGE_STATUS = {
  RUNNING: 'RUNNING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  ABANDONED: 'ABANDONED',
  SKIPPED: 'SKIPPED',
} as const;

export type TdlEvObsRetentionPurgeStatus =
  (typeof TDL_EV_OBS_RETENTION_PURGE_STATUS)[keyof typeof TDL_EV_OBS_RETENTION_PURGE_STATUS];

export const TDL_EV_OBS_RETENTION_SKIP_REASON = {
  DISABLED: 'disabled',
  INVALID_CONFIG: 'invalid_config',
  IN_PROCESS_GUARD: 'in_process_guard',
  LEADER_SKIP: 'leader_skip',
  LOCK_CONTENTED: 'lock_contended',
  TABLE_MISSING: 'table_missing',
  TRANSACTION_FAILED: 'transaction_failed',
} as const;

export type TdlEvObsRetentionSkipReason =
  (typeof TDL_EV_OBS_RETENTION_SKIP_REASON)[keyof typeof TDL_EV_OBS_RETENTION_SKIP_REASON];

export type TripEndValidationObservabilityRetentionRunOptions = {
  trigger?: 'cron' | 'manual';
  dryRun?: boolean;
  now?: Date;
};

export type TripEndValidationObservabilityRetentionReport = {
  trigger: 'cron' | 'manual';
  dryRun: boolean;
  skipped: boolean;
  skipReason?: TdlEvObsRetentionSkipReason;
  runId?: string;
  cutoffAt?: Date;
  eligibleCount: number;
  rowsDeleted: number;
  batchCount: number;
  durationMs: number;
  errorMessage?: string;
};
