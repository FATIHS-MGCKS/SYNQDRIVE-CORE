import {
  TIRE_WEAR_V3_CALIBRATION_SHADOW_BATCH_SIZE_ENV,
  TIRE_WEAR_V3_CALIBRATION_SHADOW_INTERVAL_MS_ENV,
  TIRE_WEAR_V3_CALIBRATION_SHADOW_WRITE_ENABLED_ENV,
  isTireWearV3CalibrationShadowWriteEnabled,
} from './tire-wear-v3-calibration-shadow.config';

describe('tire-wear-v3-calibration-shadow.config', () => {
  afterEach(() => {
    delete process.env[TIRE_WEAR_V3_CALIBRATION_SHADOW_WRITE_ENABLED_ENV];
    delete process.env[TIRE_WEAR_V3_CALIBRATION_SHADOW_BATCH_SIZE_ENV];
    delete process.env[TIRE_WEAR_V3_CALIBRATION_SHADOW_INTERVAL_MS_ENV];
  });

  it('defaults write flag to false', () => {
    expect(isTireWearV3CalibrationShadowWriteEnabled()).toBe(false);
  });
});
