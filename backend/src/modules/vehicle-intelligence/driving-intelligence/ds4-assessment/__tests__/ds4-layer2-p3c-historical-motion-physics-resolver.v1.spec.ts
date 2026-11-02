import { MotionPhysicsEvidenceTier, MotionPhysicsReferenceSource } from '@prisma/client';
import { selectMotionPhysicsReferenceEffectiveAtTripV1 } from '../research/ds4-layer2-p3c-historical-motion-physics-resolver.v1';
import type { Ds4Layer2P3cHistoricalReferenceRowV1 } from '../research/ds4-layer2-p3c-historical-motion-physics-resolver.v1';
import { classifyDs4Layer2P3cTemporalProvenanceV1 } from '../research/ds4-layer2-p3c-temporal-provenance.v1';

function row(partial: Partial<Ds4Layer2P3cHistoricalReferenceRowV1> & Pick<Ds4Layer2P3cHistoricalReferenceRowV1, 'id'>): Ds4Layer2P3cHistoricalReferenceRowV1 {
  return {
    id: partial.id,
    organizationId: 'org',
    vehicleId: 'veh',
    identityFingerprintJson: { make: 'Audi', model: 'A4', modelYear: 2019, vinHash: null, variantLabel: null },
    curbMassKg: 1700,
    systemMotorPowerKw: 100,
    systemPowerDefinition: 'OEM_RATED_ENGINE_KW',
    accel0To100S: 8,
    evidenceTier: MotionPhysicsEvidenceTier.ESTIMATED,
    source: MotionPhysicsReferenceSource.MANUAL_ENTRY,
    verifiedAt: null,
    verifiedByUserId: null,
    documentExtractionId: null,
    effectiveFrom: partial.effectiveFrom ?? new Date('2026-01-01T00:00:00.000Z'),
    effectiveTo: partial.effectiveTo ?? null,
    isActive: partial.isActive ?? true,
    supersededById: partial.supersededById ?? null,
    variantAssumption: null,
    createdAt: partial.createdAt ?? new Date('2026-01-01T00:00:00.000Z'),
  };
}

describe('selectMotionPhysicsReferenceEffectiveAtTripV1', () => {
  it('selects superseded row effective during trip when it existed before trip end', () => {
    const tripStart = new Date('2026-10-28T10:00:00.000Z');
    const tripEnd = new Date('2026-10-28T11:00:00.000Z');
    const superseded = row({
      id: 'old',
      effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
      effectiveTo: new Date('2026-12-01T00:00:00.000Z'),
      isActive: false,
      supersededById: 'new',
      createdAt: new Date('2026-02-01T00:00:00.000Z'),
    });
    const active = row({
      id: 'new',
      effectiveFrom: new Date('2026-12-01T00:00:00.000Z'),
      createdAt: new Date('2026-12-01T00:00:00.000Z'),
    });

    const selected = selectMotionPhysicsReferenceEffectiveAtTripV1({
      rows: [active, superseded],
      tripStartUtc: tripStart,
      tripEndUtc: tripEnd,
    });

    expect(selected.row?.id).toBe('old');
    expect(selected.selectedFromSupersededRow).toBe(true);
  });

  it('returns null when no row existed before trip end', () => {
    const tripStart = new Date('2026-10-28T10:00:00.000Z');
    const tripEnd = new Date('2026-10-28T11:00:00.000Z');
    const future = row({
      id: 'future',
      effectiveFrom: new Date('2026-11-01T00:00:00.000Z'),
      createdAt: new Date('2026-11-01T00:00:00.000Z'),
    });
    const selected = selectMotionPhysicsReferenceEffectiveAtTripV1({
      rows: [future],
      tripStartUtc: tripStart,
      tripEndUtc: tripEnd,
    });
    expect(selected.row).toBeNull();
  });
});

describe('classifyDs4Layer2P3cTemporalProvenanceV1', () => {
  it('classifies fixture snapshots as retrospective, not historically evidenced', () => {
    const result = classifyDs4Layer2P3cTemporalProvenanceV1({
      resolutionSource: 'FIXTURE_SNAPSHOT',
      referenceCreatedAtUtc: null,
      tripStartUtc: new Date('2026-10-28T10:00:00.000Z'),
      tripEndUtc: new Date('2026-10-28T11:00:00.000Z'),
      temporalReferenceEvidence: 'EFFECTIVE_AT_TRIP_END',
      atTripEnd: {
        applicability: 'AVAILABLE_CONFIRMED_UNVERIFIED',
      } as never,
    });
    expect(result.temporalProvenance).toBe('RETROSPECTIVE_REFERENCE');
    expect(result.historicalEvidenceSupported).toBe(false);
  });
});
