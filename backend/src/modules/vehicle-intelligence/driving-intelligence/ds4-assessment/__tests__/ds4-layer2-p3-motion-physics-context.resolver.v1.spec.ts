import {
  MotionPhysicsEvidenceTier,
  MotionPhysicsReferenceSource,
} from '@prisma/client';
import { hashVinForFingerprint } from '@modules/vehicle-intelligence/motion-physics-reference/motion-physics-identity.util';
import {
  DS4_LAYER2_P3_MOTION_PHYSICS_CONTEXT_SCHEMA_VERSION_V1,
  DS4_LAYER2_P3_MOTION_PHYSICS_RESOLVER_VERSION_V1,
  type Ds4Layer2MotionPhysicsContextReferenceSnapshotV1,
  type Ds4Layer2MotionPhysicsContextResolverDepsV1,
  type Ds4Layer2MotionPhysicsContextVehicleSnapshotV1,
} from '../research/ds4-layer2-p3-motion-physics-context.v1.contract';
import { resolveDs4Layer2MotionPhysicsContextV1 } from '../research/ds4-layer2-p3-motion-physics-context.resolver.v1';

const ORG_A = 'faa710c9-6d91-4079-a7d5-91fdccdec14a';
const ORG_B = '00000000-0000-4000-8000-000000000001';
const AS_OF = new Date('2026-06-15T12:00:00.000Z');

function teslaVehicle(): Ds4Layer2MotionPhysicsContextVehicleSnapshotV1 {
  const vin = '5YJ3E1EA1KF123456';
  return {
    id: '68868291-5478-42cd-b0c4-cc77b2a78e21',
    organizationId: ORG_A,
    vin,
    make: 'Tesla',
    model: 'Model 3',
    year: 2019,
  };
}

function teslaReference(
  overrides: Partial<Ds4Layer2MotionPhysicsContextReferenceSnapshotV1> = {},
): Ds4Layer2MotionPhysicsContextReferenceSnapshotV1 {
  const v = teslaVehicle();
  return {
    id: 'ref-tesla-1',
    organizationId: ORG_A,
    vehicleId: v.id,
    identityFingerprintJson: {
      vinHash: hashVinForFingerprint(v.vin),
      make: v.make,
      model: v.model,
      modelYear: v.year,
      variantLabel: null,
    },
    curbMassKg: 1760,
    systemMotorPowerKw: 208,
    systemPowerDefinition: 'OEM_RATED_SYSTEM_KW',
    accel0To100S: 6.1,
    evidenceTier: MotionPhysicsEvidenceTier.CONFIRMED,
    source: MotionPhysicsReferenceSource.MANUAL_ENTRY,
    verifiedAt: null,
    verifiedByUserId: null,
    documentExtractionId: null,
    effectiveFrom: new Date('2025-01-01T00:00:00.000Z'),
    effectiveTo: null,
    isActive: true,
    supersededById: null,
    variantAssumption: null,
    ...overrides,
  };
}

function tiguanVehicle(): Ds4Layer2MotionPhysicsContextVehicleSnapshotV1 {
  return {
    id: '19fedd4b-c4e8-4de8-a125-dab293326e7e',
    organizationId: ORG_A,
    vin: 'WVGZZZ5NZKW123456',
    make: 'Volkswagen',
    model: 'Tiguan',
    year: 2019,
  };
}

function tiguanReference(): Ds4Layer2MotionPhysicsContextReferenceSnapshotV1 {
  const v = tiguanVehicle();
  return {
    id: 'ref-tiguan-1',
    organizationId: ORG_A,
    vehicleId: v.id,
    identityFingerprintJson: {
      vinHash: hashVinForFingerprint(v.vin),
      make: v.make,
      model: v.model,
      modelYear: v.year,
      variantLabel: null,
    },
    curbMassKg: 1601,
    systemMotorPowerKw: 110,
    systemPowerDefinition: 'OEM_RATED_ENGINE_KW',
    accel0To100S: 9.1,
    evidenceTier: MotionPhysicsEvidenceTier.ESTIMATED,
    source: MotionPhysicsReferenceSource.MANUAL_ENTRY,
    verifiedAt: null,
    verifiedByUserId: null,
    documentExtractionId: null,
    effectiveFrom: new Date('2025-01-01T00:00:00.000Z'),
    effectiveTo: null,
    isActive: true,
    supersededById: null,
    variantAssumption: 'BASE_TRIM',
  };
}

function audiVehicle(): Ds4Layer2MotionPhysicsContextVehicleSnapshotV1 {
  return {
    id: 'c10351f8-b6a2-4258-947f-631aeaa6d359',
    organizationId: ORG_A,
    vin: 'WAUZZZ8K9KA123456',
    make: 'Audi',
    model: 'A4',
    year: 2019,
  };
}

function audiReference(): Ds4Layer2MotionPhysicsContextReferenceSnapshotV1 {
  const v = audiVehicle();
  return {
    id: 'ref-audi-1',
    organizationId: ORG_A,
    vehicleId: v.id,
    identityFingerprintJson: {
      vinHash: hashVinForFingerprint(v.vin),
      make: v.make,
      model: v.model,
      modelYear: v.year,
      variantLabel: null,
    },
    curbMassKg: 1735,
    systemMotorPowerKw: 200,
    systemPowerDefinition: 'OEM_RATED_ENGINE_KW',
    accel0To100S: 5.3,
    evidenceTier: MotionPhysicsEvidenceTier.CONFIRMED,
    source: MotionPhysicsReferenceSource.MANUAL_ENTRY,
    verifiedAt: null,
    verifiedByUserId: null,
    documentExtractionId: null,
    effectiveFrom: new Date('2025-01-01T00:00:00.000Z'),
    effectiveTo: null,
    isActive: true,
    supersededById: null,
    variantAssumption: null,
  };
}

function deps(input: {
  vehicle: Ds4Layer2MotionPhysicsContextVehicleSnapshotV1 | null;
  reference: Ds4Layer2MotionPhysicsContextReferenceSnapshotV1 | null;
}): Ds4Layer2MotionPhysicsContextResolverDepsV1 {
  return {
    loadVehicle: async ({ organizationId, vehicleId }) => {
      if (!input.vehicle) return null;
      if (
        input.vehicle.organizationId !== organizationId ||
        input.vehicle.id !== vehicleId
      ) {
        return null;
      }
      return input.vehicle;
    },
    findActiveReference: async ({ organizationId, vehicleId }) => {
      if (!input.reference) return null;
      if (
        input.reference.organizationId !== organizationId ||
        input.reference.vehicleId !== vehicleId
      ) {
        return null;
      }
      return input.reference;
    },
  };
}

describe('resolveDs4Layer2MotionPhysicsContextV1', () => {
  it('returns Tesla confirmed reference as AVAILABLE_CONFIRMED_UNVERIFIED with system power', async () => {
    const v = teslaVehicle();
    const result = await resolveDs4Layer2MotionPhysicsContextV1(deps({ vehicle: v, reference: teslaReference() }), {
      organizationId: ORG_A,
      vehicleId: v.id,
      asOfUtc: AS_OF,
    });

    expect(result.schemaVersion).toBe(DS4_LAYER2_P3_MOTION_PHYSICS_CONTEXT_SCHEMA_VERSION_V1);
    expect(result.resolverVersion).toBe(DS4_LAYER2_P3_MOTION_PHYSICS_RESOLVER_VERSION_V1);
    expect(result.applicability).toBe('AVAILABLE_CONFIRMED_UNVERIFIED');
    expect(result.systemMotorPowerKw).toBe(208);
    expect(result.systemPowerDefinition).toBe('OEM_RATED_SYSTEM_KW');
    expect(result.limitationReasons).not.toContain('ENGINE_RATED_POWER_NOT_SYSTEM_POWER');
    expect(result.verifiedAt).toBeNull();
  });

  it('returns Tiguan estimated reference with engine-rated limitation', async () => {
    const v = tiguanVehicle();
    const result = await resolveDs4Layer2MotionPhysicsContextV1(deps({ vehicle: v, reference: tiguanReference() }), {
      organizationId: ORG_A,
      vehicleId: v.id,
      asOfUtc: AS_OF,
    });

    expect(result.applicability).toBe('ESTIMATED_ONLY');
    expect(result.evidenceTier).toBe(MotionPhysicsEvidenceTier.ESTIMATED);
    expect(result.systemPowerDefinition).toBe('OEM_RATED_MOTOR_KW');
    expect(result.limitationReasons).toContain('ENGINE_RATED_POWER_NOT_SYSTEM_POWER');
  });

  it('returns Audi confirmed reference without promoting engine power to system power', async () => {
    const v = audiVehicle();
    const result = await resolveDs4Layer2MotionPhysicsContextV1(deps({ vehicle: v, reference: audiReference() }), {
      organizationId: ORG_A,
      vehicleId: v.id,
      asOfUtc: AS_OF,
    });

    expect(result.applicability).toBe('AVAILABLE_CONFIRMED_UNVERIFIED');
    expect(result.systemMotorPowerKw).toBe(200);
    expect(result.systemPowerDefinition).toBe('OEM_RATED_MOTOR_KW');
    expect(result.limitationReasons).toContain('ENGINE_RATED_POWER_NOT_SYSTEM_POWER');
  });

  it('returns MISSING when no active reference', async () => {
    const v = teslaVehicle();
    const result = await resolveDs4Layer2MotionPhysicsContextV1(deps({ vehicle: v, reference: null }), {
      organizationId: ORG_A,
      vehicleId: v.id,
    });

    expect(result.applicability).toBe('MISSING');
    expect(result.motionReferenceId).toBeNull();
    expect(result.limitationReasons).toContain('NO_ACTIVE_MOTION_PHYSICS_REFERENCE');
    expect(result.resolutionProvenance).toBe('NO_ACTIVE_REFERENCE');
  });

  it('returns AMBIGUOUS for inactive or superseded reference integrity', async () => {
    const v = teslaVehicle();
    const result = await resolveDs4Layer2MotionPhysicsContextV1(
      deps({
        vehicle: v,
        reference: teslaReference({
          isActive: false,
          supersededById: 'ref-newer',
        }),
      }),
      { organizationId: ORG_A, vehicleId: v.id, asOfUtc: AS_OF },
    );

    expect(result.applicability).toBe('AMBIGUOUS');
    expect(result.limitationReasons).toContain('REFERENCE_INTEGRITY_INACTIVE_OR_SUPERSEDED');
    expect(result.curbMassKg).toBeNull();
  });

  it('returns IDENTITY_MISMATCH when fingerprint does not match vehicle', async () => {
    const v = teslaVehicle();
    const result = await resolveDs4Layer2MotionPhysicsContextV1(
      deps({
        vehicle: v,
        reference: teslaReference({
          identityFingerprintJson: {
            vinHash: hashVinForFingerprint(v.vin),
            make: 'Tesla',
            model: 'Model Y',
            modelYear: v.year,
            variantLabel: null,
          },
        }),
      }),
      { organizationId: ORG_A, vehicleId: v.id, asOfUtc: AS_OF },
    );

    expect(result.applicability).toBe('IDENTITY_MISMATCH');
    expect(result.limitationReasons).toContain('IDENTITY_MISMATCH');
    expect(result.systemMotorPowerKw).toBeNull();
  });

  it('returns AMBIGUOUS for malformed identity fingerprint JSON', async () => {
    const v = teslaVehicle();
    const result = await resolveDs4Layer2MotionPhysicsContextV1(
      deps({
        vehicle: v,
        reference: teslaReference({ identityFingerprintJson: { make: 'Tesla' } }),
      }),
      { organizationId: ORG_A, vehicleId: v.id, asOfUtc: AS_OF },
    );

    expect(result.applicability).toBe('AMBIGUOUS');
    expect(result.identityFingerprint).toBeNull();
  });

  it('preserves nullable reference fields on success path', async () => {
    const v = teslaVehicle();
    const result = await resolveDs4Layer2MotionPhysicsContextV1(
      deps({
        vehicle: v,
        reference: teslaReference({
          curbMassKg: null,
          systemMotorPowerKw: null,
          accel0To100S: null,
          effectiveTo: null,
        }),
      }),
      { organizationId: ORG_A, vehicleId: v.id, asOfUtc: AS_OF },
    );

    expect(result.applicability).toBe('AVAILABLE_CONFIRMED_UNVERIFIED');
    expect(result.curbMassKg).toBeNull();
    expect(result.systemMotorPowerKw).toBeNull();
    expect(result.accel0To100S).toBeNull();
    expect(result.effectiveTo).toBeNull();
  });

  it('returns NOT_ELIGIBLE for cross-organization vehicle lookup', async () => {
    const v = teslaVehicle();
    const result = await resolveDs4Layer2MotionPhysicsContextV1(deps({ vehicle: v, reference: teslaReference() }), {
      organizationId: ORG_B,
      vehicleId: v.id,
    });

    expect(result.applicability).toBe('NOT_ELIGIBLE');
    expect(result.limitationReasons).toContain('VEHICLE_NOT_FOUND');
  });

  it('does not claim AVAILABLE_VERIFIED without verification evidence', async () => {
    const v = teslaVehicle();
    const result = await resolveDs4Layer2MotionPhysicsContextV1(
      deps({
        vehicle: v,
        reference: teslaReference({
          evidenceTier: MotionPhysicsEvidenceTier.VERIFIED,
          verifiedAt: null,
          verifiedByUserId: null,
          documentExtractionId: null,
        }),
      }),
      { organizationId: ORG_A, vehicleId: v.id, asOfUtc: AS_OF },
    );

    expect(result.applicability).toBe('AMBIGUOUS');
    expect(result.limitationReasons).toContain('VERIFIED_TIER_WITHOUT_VERIFICATION_EVIDENCE');
  });

  it('returns AVAILABLE_VERIFIED only with full verification evidence', async () => {
    const v = teslaVehicle();
    const verifiedAt = new Date('2026-01-01T00:00:00.000Z');
    const result = await resolveDs4Layer2MotionPhysicsContextV1(
      deps({
        vehicle: v,
        reference: teslaReference({
          evidenceTier: MotionPhysicsEvidenceTier.VERIFIED,
          verifiedAt,
          verifiedByUserId: 'user-1',
          documentExtractionId: 'doc-ext-1',
        }),
      }),
      { organizationId: ORG_A, vehicleId: v.id, asOfUtc: AS_OF },
    );

    expect(result.applicability).toBe('AVAILABLE_VERIFIED');
    expect(result.verifiedAt).toBe(verifiedAt.toISOString());
  });

  it('returns AMBIGUOUS when reference is outside effective window', async () => {
    const v = teslaVehicle();
    const result = await resolveDs4Layer2MotionPhysicsContextV1(
      deps({
        vehicle: v,
        reference: teslaReference({
          effectiveFrom: new Date('2027-01-01T00:00:00.000Z'),
        }),
      }),
      { organizationId: ORG_A, vehicleId: v.id, asOfUtc: AS_OF },
    );

    expect(result.applicability).toBe('AMBIGUOUS');
    expect(result.limitationReasons).toContain('REFERENCE_NOT_EFFECTIVE_AT_AS_OF');
  });
});
