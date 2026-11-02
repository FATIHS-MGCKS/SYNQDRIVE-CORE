import {
  MotionPhysicsEvidenceTier,
  MotionPhysicsReferenceSource,
} from '@prisma/client';
import {
  evaluateMotionPhysicsConfirm,
  evaluateMotionPhysicsReferenceCreate,
  evaluateMotionPhysicsVerify,
} from './motion-physics-reference.policy';

describe('motion-physics-reference.policy', () => {
  it('rejects empty payload on create', () => {
    const result = evaluateMotionPhysicsReferenceCreate({
      payload: {},
      proposedTier: MotionPhysicsEvidenceTier.ESTIMATED,
      proposedSource: MotionPhysicsReferenceSource.MISTRAL_AI,
    });
    expect(result.ok).toBe(false);
    expect(result.reasonCodes).toContain('MISSING_REQUIRED_FIELD');
  });

  it('blocks Mistral create when active reference is CONFIRMED', () => {
    const result = evaluateMotionPhysicsReferenceCreate({
      payload: { systemMotorPowerKw: 150 },
      proposedTier: MotionPhysicsEvidenceTier.ESTIMATED,
      proposedSource: MotionPhysicsReferenceSource.MISTRAL_AI,
      activeTier: MotionPhysicsEvidenceTier.CONFIRMED,
    });
    expect(result.ok).toBe(false);
    expect(result.reasonCodes).toContain('TIER_DOWNGRADE_FORBIDDEN');
  });

  it('blocks Mistral create when active reference is VERIFIED', () => {
    const result = evaluateMotionPhysicsReferenceCreate({
      payload: { systemMotorPowerKw: 150 },
      proposedTier: MotionPhysicsEvidenceTier.ESTIMATED,
      proposedSource: MotionPhysicsReferenceSource.MISTRAL_AI,
      activeTier: MotionPhysicsEvidenceTier.VERIFIED,
    });
    expect(result.ok).toBe(false);
    expect(result.reasonCodes).toContain('TIER_DOWNGRADE_FORBIDDEN');
  });

  it('forbids VERIFIED tier via create endpoint', () => {
    const result = evaluateMotionPhysicsReferenceCreate({
      payload: { curbMassKg: 1800 },
      proposedTier: MotionPhysicsEvidenceTier.VERIFIED,
      proposedSource: MotionPhysicsReferenceSource.REGISTRATION_CERTIFICATE,
    });
    expect(result.ok).toBe(false);
    expect(result.reasonCodes).toContain('VERIFY_NOT_ALLOWED');
  });

  it('requires validated document for verify', () => {
    const result = evaluateMotionPhysicsVerify({
      isActive: true,
      isSuperseded: false,
      currentTier: MotionPhysicsEvidenceTier.CONFIRMED,
      documentExtractionId: 'doc-1',
      documentValidated: false,
      identityMatch: true,
      vinIdentityMatch: true,
    });
    expect(result.ok).toBe(false);
    expect(result.reasonCodes).toContain('DOCUMENT_NOT_VALIDATED');
    expect(result.reasonCodes).toContain('VERIFY_EVIDENCE_PIPELINE_NOT_READY');
  });

  it('blocks verify until Phase C evidence pipeline is ready even with validated document', () => {
    const result = evaluateMotionPhysicsVerify({
      isActive: true,
      isSuperseded: false,
      currentTier: MotionPhysicsEvidenceTier.CONFIRMED,
      documentExtractionId: 'doc-1',
      documentValidated: true,
      identityMatch: true,
      vinIdentityMatch: true,
    });
    expect(result.ok).toBe(false);
    expect(result.reasonCodes).toContain('VERIFY_EVIDENCE_PIPELINE_NOT_READY');
  });

  it('rejects confirm on superseded reference', () => {
    const result = evaluateMotionPhysicsConfirm({
      currentTier: MotionPhysicsEvidenceTier.ESTIMATED,
      isActive: false,
      isSuperseded: true,
    });
    expect(result.ok).toBe(false);
    expect(result.reasonCodes).toContain('SUPERSEDED');
  });

  it('allows confirm on active ESTIMATED row', () => {
    const result = evaluateMotionPhysicsConfirm({
      currentTier: MotionPhysicsEvidenceTier.ESTIMATED,
      isActive: true,
      isSuperseded: false,
    });
    expect(result.ok).toBe(true);
  });

  it('rejects OPERATOR_CONFIRMED source on create (implicit confirm)', () => {
    const result = evaluateMotionPhysicsReferenceCreate({
      payload: { curbMassKg: 1800 },
      proposedTier: MotionPhysicsEvidenceTier.CONFIRMED,
      proposedSource: MotionPhysicsReferenceSource.OPERATOR_CONFIRMED,
    });
    expect(result.ok).toBe(false);
    expect(result.reasonCodes).toContain('IMPLICIT_OPERATOR_CONFIRM_FORBIDDEN');
  });

  it('rejects MANUAL_ENTRY CONFIRMED without manualOperatorConfirm flag', () => {
    const result = evaluateMotionPhysicsReferenceCreate({
      payload: { curbMassKg: 1800 },
      proposedTier: MotionPhysicsEvidenceTier.CONFIRMED,
      proposedSource: MotionPhysicsReferenceSource.MANUAL_ENTRY,
      manualOperatorConfirm: false,
    });
    expect(result.ok).toBe(false);
    expect(result.reasonCodes).toContain('IMPLICIT_MANUAL_CONFIRM_FORBIDDEN');
  });

  it('allows MANUAL_ENTRY CONFIRMED with explicit manualOperatorConfirm', () => {
    const result = evaluateMotionPhysicsReferenceCreate({
      payload: { curbMassKg: 1800 },
      proposedTier: MotionPhysicsEvidenceTier.CONFIRMED,
      proposedSource: MotionPhysicsReferenceSource.MANUAL_ENTRY,
      manualOperatorConfirm: true,
    });
    expect(result.ok).toBe(true);
  });

  it('allows create payload with systemPowerDefinition only', () => {
    const result = evaluateMotionPhysicsReferenceCreate({
      payload: { systemPowerDefinition: 'OEM_RATED_MOTOR_KW' },
      proposedTier: MotionPhysicsEvidenceTier.CONFIRMED,
      proposedSource: MotionPhysicsReferenceSource.MANUAL_ENTRY,
      manualOperatorConfirm: true,
    });
    expect(result.ok).toBe(true);
  });
});
