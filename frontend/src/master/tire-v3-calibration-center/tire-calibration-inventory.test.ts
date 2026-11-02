import { describe, expect, it } from 'vitest';
import { readTireCalibrationCenterUrl } from './tire-calibration-center-url';

describe('tire calibration center inventory tab', () => {
  it('parses inventory tab from URL', () => {
    const state = readTireCalibrationCenterUrl('?tccTab=inventory&orgId=o1&vehicleId=v1');
    expect(state.tab).toBe('inventory');
    expect(state.orgId).toBe('o1');
  });
});
