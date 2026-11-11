import { describe, expect, it } from 'vitest';

import { interpolateTranslationVars } from './i18n-interpolate';

describe('interpolateTranslationVars', () => {
  it('substitutes double-brace placeholders', () => {
    expect(interpolateTranslationVars('{{count}} rows · {{declared}}', { count: 1, declared: 2 })).toBe(
      '1 rows · 2',
    );
  });

  it('substitutes single-brace placeholders', () => {
    expect(interpolateTranslationVars('Hello, {name}', { name: 'Ada' })).toBe('Hello, Ada');
  });

  it('prefers double-brace token before single-brace partial match', () => {
    const template = '{{count}} rows returned · declared count {{declared}}';
    expect(interpolateTranslationVars(template, { count: 1, declared: 2 })).toBe(
      '1 rows returned · declared count 2',
    );
  });
});
