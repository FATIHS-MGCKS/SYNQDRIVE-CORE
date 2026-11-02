import {
  buildDs4RpmReferenceIntelligenceV1ReferenceFromVehicleRow,
  extractVehicleRpmReferenceFieldProvenance,
  mapRegistrationFieldProvenanceForRpmReference,
} from '../ds4-rpm-reference-intelligence-v1-vehicle-reference.mapper';

describe('ds4-rpm-reference-intelligence-v1 vehicle reference mapper', () => {
  it('maps USER_CONFIRMED registrationIdentityProvenance to reference block', () => {
    const reference = buildDs4RpmReferenceIntelligenceV1ReferenceFromVehicleRow({
      vehicle: {
        organizationId: 'org-1',
        idleRpm: 750,
        maxRpm: 6200,
        registrationIdentityProvenance: {
          version: 1,
          updatedAt: '2026-01-01T00:00:00.000Z',
          fields: {
            idleRpm: {
              value: 750,
              provenance: 'USER_CONFIRMED',
              confirmationStatus: 'USER_CONFIRMED',
              confirmedAt: '2026-01-01T00:00:00.000Z',
            },
            maxRpm: {
              value: 6200,
              provenance: 'USER_CONFIRMED',
              confirmationStatus: 'USER_CONFIRMED',
              confirmedAt: '2026-01-01T00:00:00.000Z',
            },
          },
        },
      },
      iceRpmApplicability: 'APPLICABLE',
    });
    expect(reference.idleRpmProvenance).toBe('USER_CONFIRMED');
    expect(reference.maxRpmProvenance).toBe('USER_CONFIRMED');
    expect(reference.idleRpm).toBe(750);
  });

  it('maps unrecognized provenance to UNKNOWN', () => {
    const field = mapRegistrationFieldProvenanceForRpmReference({
      value: 800,
      provenance: 'AI_ESTIMATED',
      confirmationStatus: 'SUGGESTED',
      confirmedAt: null,
      documentExtractionId: null,
    });
    expect(field?.category).toBe('AI_ESTIMATED');
    const reference = buildDs4RpmReferenceIntelligenceV1ReferenceFromVehicleRow({
      vehicle: {
        organizationId: 'org-1',
        idleRpm: 800,
        maxRpm: 6000,
        registrationIdentityProvenance: {
          version: 1,
          updatedAt: '2026-01-01T00:00:00.000Z',
          fields: {
            idleRpm: {
              value: 800,
              provenance: 'AI_ESTIMATED',
              confirmationStatus: 'SUGGESTED',
            },
          },
        },
      },
      iceRpmApplicability: 'APPLICABLE',
    });
    expect(extractVehicleRpmReferenceFieldProvenance(null, 'idleRpm')).toBeNull();
    expect(reference.idleRpmProvenance).toBe('AI_ESTIMATED');
  });
});
