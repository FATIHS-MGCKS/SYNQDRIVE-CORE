import { registerAs } from '@nestjs/config';

const intEnv = (key: string, def: number): number => {
  const raw = process.env[key];
  if (raw === undefined || raw === null || raw.trim() === '') return def;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : def;
};

const boolEnv = (key: string, def: boolean): boolean => {
  const raw = process.env[key];
  if (raw === undefined || raw.trim() === '') return def;
  return raw.toLowerCase() === 'true' || raw === '1';
};

export const TRIP_END_VALIDATION_OBSERVATION_RETENTION_ENABLED_ENV =
  'TRIP_END_VALIDATION_OBSERVATION_RETENTION_ENABLED';
export const TRIP_END_VALIDATION_OBSERVATION_RETENTION_DAYS_ENV =
  'TRIP_END_VALIDATION_OBSERVATION_RETENTION_DAYS';
export const TRIP_END_VALIDATION_OBSERVATION_RETENTION_BATCH_SIZE_ENV =
  'TRIP_END_VALIDATION_OBSERVATION_RETENTION_BATCH_SIZE';
export const TRIP_END_VALIDATION_OBSERVATION_RETENTION_MAX_BATCHES_ENV =
  'TRIP_END_VALIDATION_OBSERVATION_RETENTION_MAX_BATCHES';
export const TRIP_END_VALIDATION_OBSERVATION_RETENTION_DRY_RUN_ENV =
  'TRIP_END_VALIDATION_OBSERVATION_RETENTION_DRY_RUN';

/** Hard caps — fail-closed validation rejects out-of-range env. */
export const TRIP_END_VALIDATION_OBSERVATION_RETENTION_BATCH_SIZE_MAX = 2000;
export const TRIP_END_VALIDATION_OBSERVATION_RETENTION_MAX_BATCHES_CAP = 500;
export const TRIP_END_VALIDATION_OBSERVATION_RETENTION_DAYS_MIN = 90;
export const TRIP_END_VALIDATION_OBSERVATION_RETENTION_DAYS_MAX = 3650;

export default registerAs('tripEndValidationObservabilityRetention', () => ({
  enabled: boolEnv(TRIP_END_VALIDATION_OBSERVATION_RETENTION_ENABLED_ENV, false),
  dryRun: boolEnv(TRIP_END_VALIDATION_OBSERVATION_RETENTION_DRY_RUN_ENV, true),
  retentionDays: intEnv(TRIP_END_VALIDATION_OBSERVATION_RETENTION_DAYS_ENV, 90),
  batchSize: intEnv(TRIP_END_VALIDATION_OBSERVATION_RETENTION_BATCH_SIZE_ENV, 500),
  maxBatchesPerRun: intEnv(TRIP_END_VALIDATION_OBSERVATION_RETENTION_MAX_BATCHES_ENV, 200),
}));
