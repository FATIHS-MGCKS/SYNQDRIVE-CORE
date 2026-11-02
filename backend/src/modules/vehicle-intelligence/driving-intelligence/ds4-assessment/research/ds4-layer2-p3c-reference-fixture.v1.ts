import { readFileSync } from 'fs';
import type {
  Ds4Layer2MotionPhysicsContextReferenceSnapshotV1,
  Ds4Layer2MotionPhysicsContextVehicleSnapshotV1,
} from './ds4-layer2-p3-motion-physics-context.v1.contract';
import {
  MotionPhysicsEvidenceTier,
  MotionPhysicsReferenceSource,
} from '@prisma/client';
import type { Ds4Layer2P3cVehicleReferenceResolutionV1 } from './ds4-layer2-p3c-physics-diagnostics.v1.contract';

type FixtureFile = {
  schemaVersion: string;
  organizationId: string;
  referenceInputProvenance: 'FIXTURE_SNAPSHOT';
  effectiveFromNotHistoricalEvidence: boolean;
  note: string;
  vehicles: Record<
    string,
    {
      vehicleLine: string;
      reference: Omit<
        Ds4Layer2MotionPhysicsContextReferenceSnapshotV1,
        'organizationId' | 'vehicleId' | 'evidenceTier' | 'source'
      > & {
        evidenceTier: string;
        source: string;
        /** Fixture authoring only — not persisted reference history. */
        effectiveFrom: string;
      };
    }
  >;
};

export function loadDs4Layer2P3cMotionPhysicsReferenceFixtureV1(path: string): FixtureFile {
  return JSON.parse(readFileSync(path, 'utf8')) as FixtureFile;
}

export function createReferenceResolverFromFixtureV1(
  fixture: FixtureFile,
): (input: {
  vehicleId: string;
  tripStartUtc: Date;
  tripEndUtc: Date;
}) => Promise<Ds4Layer2P3cVehicleReferenceResolutionV1 | null> {
  return async ({ vehicleId }) => {
    const entry = fixture.vehicles[vehicleId];
    if (!entry) return null;
    const fp = entry.reference.identityFingerprintJson as {
      make: string;
      model: string;
      modelYear: number;
    };
    const vehicle: Ds4Layer2MotionPhysicsContextVehicleSnapshotV1 = {
      id: vehicleId,
      organizationId: fixture.organizationId,
      vin: null,
      make: fp.make,
      model: fp.model,
      year: fp.modelYear,
    };
    const reference: Ds4Layer2MotionPhysicsContextReferenceSnapshotV1 = {
      ...entry.reference,
      organizationId: fixture.organizationId,
      vehicleId,
      evidenceTier: entry.reference.evidenceTier as MotionPhysicsEvidenceTier,
      source: entry.reference.source as MotionPhysicsReferenceSource,
      effectiveFrom: new Date(entry.reference.effectiveFrom),
      effectiveTo: entry.reference.effectiveTo ? new Date(entry.reference.effectiveTo) : null,
      verifiedAt: entry.reference.verifiedAt ? new Date(entry.reference.verifiedAt) : null,
    };
    return {
      vehicle,
      reference,
      resolutionSource: 'FIXTURE_SNAPSHOT',
      referenceCreatedAtUtc: null,
      selectedFromSupersededRow: false,
    };
  };
}
