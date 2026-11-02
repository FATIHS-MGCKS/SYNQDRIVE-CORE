import { detectAiTireSpecSetupConflicts } from './ai-tire-spec-setup-consistency.util';
import type { AiTireSpec } from './tire-health.config';

const baseSetup = {
  tireSeason: 'SUMMER',
  frontDimension: '225/45R17',
  rearDimension: null,
  loadIndexFront: '94',
  loadIndexRear: null,
  speedIndexFront: 'Y',
  speedIndexRear: null,
};

describe('detectAiTireSpecSetupConflicts', () => {
  it('reports season mismatch with setup_manual precedence when AI unconfirmed', () => {
    const spec: AiTireSpec = {
      seasonType: 'winter',
      tireSizeRaw: '225/45R17',
      loadIndex: '94',
      speedIndex: 'Y',
      userConfirmedSpec: false,
    } as AiTireSpec;

    const conflicts = detectAiTireSpecSetupConflicts(baseSetup, spec);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]!.code).toBe('SEASON_MISMATCH');
    expect(conflicts[0]!.precedence).toBe('setup_manual');
  });

  it('reports axle identity mismatch when LI/SI differ', () => {
    const spec: AiTireSpec = {
      tireSizeRaw: '225/45R17',
      loadIndex: '91',
      speedIndex: 'H',
    } as AiTireSpec;

    const conflicts = detectAiTireSpecSetupConflicts(baseSetup, spec);
    expect(conflicts.some((c) => c.code === 'AXLE_IDENTITY_MISMATCH')).toBe(true);
  });

  it('returns no conflicts when spec matches setup', () => {
    const spec: AiTireSpec = {
      seasonType: 'summer',
      tireSizeRaw: '225/45R17',
      loadIndex: '94',
      speedIndex: 'Y',
    } as AiTireSpec;

    expect(detectAiTireSpecSetupConflicts(baseSetup, spec)).toHaveLength(0);
  });

  it('returns empty list for null spec', () => {
    expect(detectAiTireSpecSetupConflicts(baseSetup, null)).toEqual([]);
  });
});
