import { TireSetupStatus } from '@prisma/client';
import type { AiTireSpec } from './tire-health.config';
import {
  countPhysicalAxlesMatchingIdentity,
  validateApplyGenerationBinding,
  validatePayloadIdentityAgainstSetup,
} from './ai-tire-spec-payload-identity.util';
import { preflightDirectAiTireSpecApply } from './ai-tire-spec-apply-preflight.util';
import { resolveDirectApplyTargetSetup } from './ai-tire-spec-direct-apply.guard';

const frontSetup = {
  id: 'setup-1',
  vehicleId: 'veh-1',
  status: TireSetupStatus.ACTIVE,
  removedAt: null,
  frontDimension: '225/45R17',
  rearDimension: null,
  loadIndexFront: '94',
  loadIndexRear: null,
  speedIndexFront: 'Y',
  speedIndexRear: null,
  updatedAt: new Date('2026-10-30T10:00:00.000Z'),
};

describe('validatePayloadIdentityAgainstSetup', () => {
  it('accepts matching payload identity on front axle', () => {
    const spec = {
      tireSizeRaw: '225/45R17',
      loadIndex: '94',
      speedIndex: 'Y',
    } as AiTireSpec;
    expect(validatePayloadIdentityAgainstSetup(spec, frontSetup).ok).toBe(true);
  });

  it('rejects mismatched load index', () => {
    const spec = {
      tireSizeRaw: '225/45R17',
      loadIndex: '91',
      speedIndex: 'Y',
    } as AiTireSpec;
    const r = validatePayloadIdentityAgainstSetup(spec, frontSetup);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('PAYLOAD_AXLE_IDENTITY_MISMATCH');
  });

  it('accepts setup-wide binding when front and rear share identical identity', () => {
    const unifiedSetup = {
      ...frontSetup,
      rearDimension: '225/45R17',
      loadIndexRear: '94',
      speedIndexRear: 'Y',
    };
    const spec = {
      tireSizeRaw: '225/45R17',
      loadIndex: '94',
      speedIndex: 'Y',
    } as AiTireSpec;
    expect(countPhysicalAxlesMatchingIdentity(
      { tireSize: '225/45R17', loadIndex: '94', speedIndex: 'Y' },
      unifiedSetup,
    )).toBe(2);
    const r = validatePayloadIdentityAgainstSetup(spec, unifiedSetup);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.bindingScope).toBe('setup_wide');
  });

  it('accepts front-axle binding on staggered setup', () => {
    const staggered = {
      ...frontSetup,
      frontDimension: '245/40R18',
      loadIndexFront: '97',
      speedIndexFront: 'W',
      rearDimension: '225/45R17',
      loadIndexRear: '94',
      speedIndexRear: 'Y',
    };
    const spec = {
      tireSizeRaw: '245/40R18',
      loadIndex: '97',
      speedIndex: 'W',
    } as AiTireSpec;
    const r = validatePayloadIdentityAgainstSetup(spec, staggered);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.bindingScope).toBe('front_axle');
  });

  it('accepts rear-axle binding on staggered setup', () => {
    const staggered = {
      ...frontSetup,
      frontDimension: '245/40R18',
      loadIndexFront: '97',
      speedIndexFront: 'W',
      rearDimension: '225/45R17',
      loadIndexRear: '94',
      speedIndexRear: 'Y',
    };
    const spec = {
      tireSizeRaw: '225/45R17',
      loadIndex: '94',
      speedIndex: 'Y',
    } as AiTireSpec;
    const r = validatePayloadIdentityAgainstSetup(spec, staggered);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.bindingScope).toBe('rear_axle');
  });

  it('rejects generation binding when request identity does not match any axle', () => {
    const staggered = {
      ...frontSetup,
      frontDimension: '245/40R18',
      loadIndexFront: '97',
      speedIndexFront: 'W',
      rearDimension: '225/45R17',
      loadIndexRear: '94',
      speedIndexRear: 'Y',
    };
    const spec = {
      tireSizeRaw: '245/40R18',
      loadIndex: '97',
      speedIndex: 'W',
    } as AiTireSpec;
    const r = validateApplyGenerationBinding({
      binding: {
        tireSetupId: 'setup-1',
        setupUpdatedAt: '2026-10-30T10:00:00.000Z',
        requestTireSize: '225/45R17',
        requestLoadIndex: '94',
        requestSpeedIndex: 'Y',
      },
      setup: staggered,
      spec,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('PAYLOAD_GENERATION_IDENTITY_MISMATCH');
  });

  it('rejects payload with no matching axle', () => {
    const spec = {
      tireSizeRaw: '255/40R18',
      loadIndex: '99',
      speedIndex: 'Y',
    } as AiTireSpec;
    const r = validatePayloadIdentityAgainstSetup(spec, frontSetup);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('PAYLOAD_AXLE_IDENTITY_MISMATCH');
  });
});

describe('validateApplyGenerationBinding', () => {
  const binding = {
    tireSetupId: 'setup-1',
    setupUpdatedAt: '2026-10-30T10:00:00.000Z',
    requestTireSize: '225/45R17',
    requestLoadIndex: '94',
    requestSpeedIndex: 'Y',
  };

  it('rejects stale setup revision', () => {
    const spec = {
      tireSizeRaw: '225/45R17',
      loadIndex: '94',
      speedIndex: 'Y',
    } as AiTireSpec;
    const r = validateApplyGenerationBinding({
      binding,
      setup: { ...frontSetup, updatedAt: new Date('2026-10-30T11:00:00.000Z') },
      spec,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('STALE_GENERATION_BINDING');
  });

  it('rejects payload that differs from generation request identity', () => {
    const spec = {
      tireSizeRaw: '225/45R17',
      loadIndex: '91',
      speedIndex: 'Y',
    } as AiTireSpec;
    const r = validateApplyGenerationBinding({
      binding,
      setup: frontSetup,
      spec,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('PAYLOAD_GENERATION_IDENTITY_MISMATCH');
  });
});

describe('preflightDirectAiTireSpecApply', () => {
  it('allows season mismatch as warning only', () => {
    const spec = {
      tireSizeRaw: '225/45R17',
      loadIndex: '94',
      speedIndex: 'Y',
      seasonType: 'winter',
    } as AiTireSpec;
    const r = preflightDirectAiTireSpecApply({
      setup: { ...frontSetup, tireSeason: 'SUMMER' },
      spec,
      generationBinding: {
        tireSetupId: 'setup-1',
        setupUpdatedAt: '2026-10-30T10:00:00.000Z',
        requestTireSize: '225/45R17',
        requestLoadIndex: '94',
        requestSpeedIndex: 'Y',
      },
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.setupSpecWarnings).toHaveLength(1);
      expect(r.setupSpecWarnings[0]!.code).toBe('SEASON_MISMATCH');
    }
  });

  it('blocks axle identity mismatch without persisting (preflight only)', () => {
    const spec = {
      tireSizeRaw: '255/40R18',
      loadIndex: '94',
      speedIndex: 'Y',
    } as AiTireSpec;
    const r = preflightDirectAiTireSpecApply({
      setup: frontSetup,
      spec,
      generationBinding: {
        tireSetupId: 'setup-1',
        setupUpdatedAt: '2026-10-30T10:00:00.000Z',
        requestTireSize: '255/40R18',
        requestLoadIndex: '94',
        requestSpeedIndex: 'Y',
      },
    });
    expect(r.ok).toBe(false);
  });
});

describe('resolveDirectApplyTargetSetup', () => {
  it('requires tireSetupId when multiple active setups', () => {
    const other = { ...frontSetup, id: 'setup-2' };
    const r = resolveDirectApplyTargetSetup({
      tireSetupId: null,
      activeSetups: [frontSetup, other],
      boundSetup: null,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('AMBIGUOUS_ACTIVE_SETUP');
  });
});
