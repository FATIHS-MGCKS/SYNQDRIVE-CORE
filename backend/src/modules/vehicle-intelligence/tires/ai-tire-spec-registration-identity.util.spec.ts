import {
  resolveRegistrationTireIdentityContext,
  splitTireBrandModelLine,
} from './ai-tire-spec-registration-identity.util';

describe('splitTireBrandModelLine', () => {
  it('splits first token as tire brand and remainder as model', () => {
    expect(splitTireBrandModelLine('Michelin Pilot Sport 4')).toEqual({
      brand: 'Michelin',
      model: 'Pilot Sport 4',
    });
  });

  it('returns null brand/model for empty input', () => {
    expect(splitTireBrandModelLine('')).toEqual({ brand: null, model: null });
    expect(splitTireBrandModelLine(null)).toEqual({ brand: null, model: null });
  });

  it('does not guess model when only brand token present', () => {
    expect(splitTireBrandModelLine('Continental')).toEqual({
      brand: 'Continental',
      model: null,
    });
  });
});

describe('resolveRegistrationTireIdentityContext', () => {
  it('maps registration tire fields (not vehicle make/model)', () => {
    const ctx = resolveRegistrationTireIdentityContext({
      brandModelFront: 'Bridgestone Turanza T005',
      frontDimension: '205/55R16',
      loadIndexFront: '91',
      speedIndexFront: 'V',
    });
    expect(ctx).toEqual({
      brand: 'Bridgestone',
      model: 'Turanza T005',
      tireSize: '205/55R16',
      loadIndex: '91',
      speedIndex: 'V',
    });
  });

  it('leaves missing tire identity unknown', () => {
    expect(resolveRegistrationTireIdentityContext({})).toEqual({
      brand: null,
      model: null,
      tireSize: null,
      loadIndex: null,
      speedIndex: null,
    });
  });
});
