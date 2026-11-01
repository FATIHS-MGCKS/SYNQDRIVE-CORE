import { describe, expect, it } from 'vitest';
import { ALL_MASTER_VIEWS } from '../navigation/master-nav-url';

describe('tire calibration center routing', () => {
  it('includes canonical master view id', () => {
    expect(ALL_MASTER_VIEWS).toContain('tire-v3-calibration-center');
  });
});
