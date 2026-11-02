import { parseHfRpmValueFloat } from './hf-rpm-value-parse.util';

describe('parseHfRpmValueFloat', () => {
  it('rejects null and undefined', () => {
    expect(parseHfRpmValueFloat(null)).toBeNull();
    expect(parseHfRpmValueFloat(undefined)).toBeNull();
  });

  it('rejects empty string without coercing to 0', () => {
    expect(parseHfRpmValueFloat('')).toBeNull();
    expect(parseHfRpmValueFloat('   ')).toBeNull();
  });

  it('allows 0 rpm', () => {
    expect(parseHfRpmValueFloat(0)).toBe(0);
    expect(parseHfRpmValueFloat('0')).toBe(0);
  });

  it('rejects negative and non-finite', () => {
    expect(parseHfRpmValueFloat(-1)).toBeNull();
    expect(parseHfRpmValueFloat(Number.NaN)).toBeNull();
    expect(parseHfRpmValueFloat('not-a-number')).toBeNull();
  });

  it('accepts positive finite values', () => {
    expect(parseHfRpmValueFloat(1500)).toBe(1500);
    expect(parseHfRpmValueFloat('1800.5')).toBe(1800.5);
  });
});
