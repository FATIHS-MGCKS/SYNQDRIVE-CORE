import { registerAs } from '@nestjs/config';

export const TIRE_WEAR_V3_CALIBRATION_SHADOW_WRITE_ENABLED_ENV =
  'TIRE_WEAR_V3_CALIBRATION_SHADOW_WRITE_ENABLED';

export const TIRE_WEAR_V3_CALIBRATION_SHADOW_BATCH_SIZE_ENV =
  'TIRE_WEAR_V3_CALIBRATION_SHADOW_BATCH_SIZE';

export const TIRE_WEAR_V3_CALIBRATION_SHADOW_INTERVAL_MS_ENV =
  'TIRE_WEAR_V3_CALIBRATION_SHADOW_INTERVAL_MS';

function parseBooleanEnv(value: string | undefined, defaultValue: boolean): boolean {
  if (value == null || value.trim() === '') return defaultValue;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return defaultValue;
}

function parsePositiveInt(value: string | undefined, defaultValue: number): number {
  if (value == null || value.trim() === '') return defaultValue;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return defaultValue;
  return parsed;
}

/** Default OFF — calibration snapshots are never written unless explicitly enabled (ops-only). */
export default registerAs('tireWearV3CalibrationShadow', () => ({
  writeEnabled: parseBooleanEnv(
    process.env[TIRE_WEAR_V3_CALIBRATION_SHADOW_WRITE_ENABLED_ENV],
    false,
  ),
  batchSize: parsePositiveInt(
    process.env[TIRE_WEAR_V3_CALIBRATION_SHADOW_BATCH_SIZE_ENV],
    25,
  ),
  intervalMs: parsePositiveInt(
    process.env[TIRE_WEAR_V3_CALIBRATION_SHADOW_INTERVAL_MS_ENV],
    900_000,
  ),
}));

export function isTireWearV3CalibrationShadowWriteEnabled(): boolean {
  return parseBooleanEnv(
    process.env[TIRE_WEAR_V3_CALIBRATION_SHADOW_WRITE_ENABLED_ENV],
    false,
  );
}
