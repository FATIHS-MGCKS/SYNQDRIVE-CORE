import {
  MotionPhysicsEvidenceTier,
  MotionPhysicsReferenceSource,
} from '@prisma/client';
import {
  normalizeMotionSystemPowerDefinition,
  resolveMotionPhysicsEvidenceTierForCreate,
} from './motion-physics-reference.domain';

describe('normalizeMotionSystemPowerDefinition', () => {
  it('maps legacy OEM_RATED_ENGINE_KW to OEM_RATED_MOTOR_KW', () => {
    expect(normalizeMotionSystemPowerDefinition('OEM_RATED_ENGINE_KW')).toBe('OEM_RATED_MOTOR_KW');
    expect(normalizeMotionSystemPowerDefinition('oem_rated_engine_kw')).toBe('OEM_RATED_MOTOR_KW');
  });

  it('accepts canonical tokens unchanged', () => {
    expect(normalizeMotionSystemPowerDefinition('OEM_RATED_SYSTEM_KW')).toBe('OEM_RATED_SYSTEM_KW');
  });

  it('returns null for unknown tokens (fail-closed)', () => {
    expect(normalizeMotionSystemPowerDefinition('COMBINED_SYSTEM')).toBeNull();
  });
});

describe('resolveMotionPhysicsEvidenceTierForCreate', () => {
  it('maps Mistral to ESTIMATED', () => {
    expect(resolveMotionPhysicsEvidenceTierForCreate(MotionPhysicsReferenceSource.MISTRAL_AI)).toBe(
      MotionPhysicsEvidenceTier.ESTIMATED,
    );
  });

  it('maps MANUAL_ENTRY to ESTIMATED unless explicit manualOperatorConfirm', () => {
    expect(resolveMotionPhysicsEvidenceTierForCreate(MotionPhysicsReferenceSource.MANUAL_ENTRY)).toBe(
      MotionPhysicsEvidenceTier.ESTIMATED,
    );
    expect(
      resolveMotionPhysicsEvidenceTierForCreate(MotionPhysicsReferenceSource.MANUAL_ENTRY, {
        manualOperatorConfirm: true,
      }),
    ).toBe(MotionPhysicsEvidenceTier.CONFIRMED);
  });

  it('maps document and onboarding sources to CONFIRMED', () => {
    expect(
      resolveMotionPhysicsEvidenceTierForCreate(MotionPhysicsReferenceSource.ONBOARDING_ACTIVATION),
    ).toBe(MotionPhysicsEvidenceTier.CONFIRMED);
    expect(
      resolveMotionPhysicsEvidenceTierForCreate(MotionPhysicsReferenceSource.REGISTRATION_CERTIFICATE),
    ).toBe(MotionPhysicsEvidenceTier.CONFIRMED);
  });

  it('forbids OPERATOR_CONFIRMED on create (confirm endpoint only)', () => {
    expect(resolveMotionPhysicsEvidenceTierForCreate(MotionPhysicsReferenceSource.OPERATOR_CONFIRMED)).toBeNull();
  });
});
