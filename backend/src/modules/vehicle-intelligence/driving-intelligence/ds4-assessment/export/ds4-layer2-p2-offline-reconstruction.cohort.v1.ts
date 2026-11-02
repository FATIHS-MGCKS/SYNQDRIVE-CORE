import type { TelemetrySourceFamily } from '../../../telemetry-source-family';
import type { Ds4SpeedAuthorityPartitionV1 } from '../ds4-trip-assessment-v1.contract';
import { DS4_ASSESSMENT_CALIBRATION_COHORT_V1 } from '../ds4-assessment-calibration-cohort.v1';
import { Ds4Layer2P2OfflineReconstructionErrorV1 } from './ds4-layer2-p2-offline-reconstruction.v1';

/** Pilot org scope — pinned from production feasibility audit (read-only). */
export const DS4_LAYER2_P2_OFFLINE_PILOT_ORGANIZATION_ID_V1 =
  'faa710c9-6d91-4079-a7d5-91fdccdec14a' as const;

export type Ds4Layer2P2OfflinePilotVehicleLineV1 = 'AUDI_A4' | 'VW_TIGUAN' | 'TESLA_MODEL_3';

export type Ds4Layer2P2OfflinePilotCohortEntryV1 = {
  tripId: string;
  expectedVehicleId: string;
  vehicleLine: Ds4Layer2P2OfflinePilotVehicleLineV1;
  expectedSpeedAuthority: Ds4SpeedAuthorityPartitionV1;
  expectedSourceFamily: TelemetrySourceFamily;
  feasibilityAuditClass: 'RECONSTRUCTABLE_V2';
};

const CALIBRATION_VEHICLE_ID_BY_LINE: Record<Ds4Layer2P2OfflinePilotVehicleLineV1, string> = {
  AUDI_A4: DS4_ASSESSMENT_CALIBRATION_COHORT_V1.find((v) => v.role === 'AUDI_A4_R1')!.vehicleId,
  VW_TIGUAN: DS4_ASSESSMENT_CALIBRATION_COHORT_V1.find((v) => v.role === 'VW_TIGUAN_R1')!.vehicleId,
  TESLA_MODEL_3: DS4_ASSESSMENT_CALIBRATION_COHORT_V1.find((v) => v.role === 'TESLA_MODEL_3_SOFTWARE_INTEGRATION')!
    .vehicleId,
};

/**
 * Eight motion-only trips from the 11 RECONSTRUCTABLE_V2 feasibility cohort.
 * Vehicle UUIDs match DS4 calibration cohort roles aligned to feasibility vehicleLine labels
 * (production feasibility audit @ SHA 7ab55a0d…, trip list `initialP2CohortRecommendation`).
 */
export const DS4_LAYER2_P2_OFFLINE_PILOT_COHORT_V1: readonly Ds4Layer2P2OfflinePilotCohortEntryV1[] = [
  {
    tripId: 'ba66e2ad-a824-4944-83c9-4472a5508e82',
    expectedVehicleId: CALIBRATION_VEHICLE_ID_BY_LINE.AUDI_A4,
    vehicleLine: 'AUDI_A4',
    expectedSpeedAuthority: 'C4_ONLY',
    expectedSourceFamily: 'RUPTELA_R1',
    feasibilityAuditClass: 'RECONSTRUCTABLE_V2',
  },
  {
    tripId: 'd06f1e85-cf2f-4d7f-88d7-13e5c0a24ac1',
    expectedVehicleId: CALIBRATION_VEHICLE_ID_BY_LINE.AUDI_A4,
    vehicleLine: 'AUDI_A4',
    expectedSpeedAuthority: 'C4_ONLY',
    expectedSourceFamily: 'RUPTELA_R1',
    feasibilityAuditClass: 'RECONSTRUCTABLE_V2',
  },
  {
    tripId: '3c8827e9-7dd0-46a8-ae7c-eb5c7495c65b',
    expectedVehicleId: CALIBRATION_VEHICLE_ID_BY_LINE.AUDI_A4,
    vehicleLine: 'AUDI_A4',
    expectedSpeedAuthority: 'C4_ONLY',
    expectedSourceFamily: 'RUPTELA_R1',
    feasibilityAuditClass: 'RECONSTRUCTABLE_V2',
  },
  {
    tripId: '004f9579-2875-42f2-8aa7-e82c343c954e',
    expectedVehicleId: CALIBRATION_VEHICLE_ID_BY_LINE.AUDI_A4,
    vehicleLine: 'AUDI_A4',
    expectedSpeedAuthority: 'C4_ONLY',
    expectedSourceFamily: 'RUPTELA_R1',
    feasibilityAuditClass: 'RECONSTRUCTABLE_V2',
  },
  {
    tripId: '4dcc7cbf-9d1c-4efa-b395-6ad540091143',
    expectedVehicleId: CALIBRATION_VEHICLE_ID_BY_LINE.VW_TIGUAN,
    vehicleLine: 'VW_TIGUAN',
    expectedSpeedAuthority: 'C5_1_PREFERRED',
    expectedSourceFamily: 'RUPTELA_R1',
    feasibilityAuditClass: 'RECONSTRUCTABLE_V2',
  },
  {
    tripId: 'dbdded5c-ee72-40f3-91bb-62d5a1b7f7ff',
    expectedVehicleId: CALIBRATION_VEHICLE_ID_BY_LINE.VW_TIGUAN,
    vehicleLine: 'VW_TIGUAN',
    expectedSpeedAuthority: 'C5_1_PREFERRED',
    expectedSourceFamily: 'RUPTELA_R1',
    feasibilityAuditClass: 'RECONSTRUCTABLE_V2',
  },
  {
    tripId: '2ccf0d2a-d5b8-4612-aabe-b4c1f387d9af',
    expectedVehicleId: CALIBRATION_VEHICLE_ID_BY_LINE.VW_TIGUAN,
    vehicleLine: 'VW_TIGUAN',
    expectedSpeedAuthority: 'C5_1_PREFERRED',
    expectedSourceFamily: 'RUPTELA_R1',
    feasibilityAuditClass: 'RECONSTRUCTABLE_V2',
  },
  {
    tripId: 'b304e9ad-0dcb-4b69-a93e-5364078a20a1',
    expectedVehicleId: CALIBRATION_VEHICLE_ID_BY_LINE.TESLA_MODEL_3,
    vehicleLine: 'TESLA_MODEL_3',
    expectedSpeedAuthority: 'C5_1_PREFERRED',
    expectedSourceFamily: 'API_SYNTHETIC',
    feasibilityAuditClass: 'RECONSTRUCTABLE_V2',
  },
] as const;

export function assertDs4Layer2P2PilotCohortIntegrityV1(): void {
  if (DS4_LAYER2_P2_OFFLINE_PILOT_COHORT_V1.length !== 8) {
    throw new Error('P2 pilot cohort must contain exactly 8 trips');
  }
  const tripIds = new Set<string>();
  for (const entry of DS4_LAYER2_P2_OFFLINE_PILOT_COHORT_V1) {
    if (tripIds.has(entry.tripId)) {
      throw new Error(`Duplicate P2 pilot tripId: ${entry.tripId}`);
    }
    tripIds.add(entry.tripId);
    if (entry.expectedVehicleId !== CALIBRATION_VEHICLE_ID_BY_LINE[entry.vehicleLine]) {
      throw new Error(`P2 pilot vehicleId drift for trip ${entry.tripId}`);
    }
  }
  const audi = DS4_LAYER2_P2_OFFLINE_PILOT_COHORT_V1.filter((e) => e.vehicleLine === 'AUDI_A4');
  const tiguan = DS4_LAYER2_P2_OFFLINE_PILOT_COHORT_V1.filter((e) => e.vehicleLine === 'VW_TIGUAN');
  const tesla = DS4_LAYER2_P2_OFFLINE_PILOT_COHORT_V1.filter((e) => e.vehicleLine === 'TESLA_MODEL_3');
  if (audi.length !== 4 || tiguan.length !== 3 || tesla.length !== 1) {
    throw new Error('P2 pilot cohort vehicle-line counts must be Audi 4 / Tiguan 3 / Tesla 1');
  }
}

export function assertDs4Layer2P2CohortScopeMatchesRuntimeV1(input: {
  entry: Ds4Layer2P2OfflinePilotCohortEntryV1;
  organizationId: string;
  vehicleId: string;
  tripId: string;
  sourceFamily: string | null;
  speedAuthority: Ds4SpeedAuthorityPartitionV1 | null;
}): void {
  if (input.organizationId !== DS4_LAYER2_P2_OFFLINE_PILOT_ORGANIZATION_ID_V1) {
    throw new Ds4Layer2P2OfflineReconstructionErrorV1(`P2 pilot organization mismatch for trip ${input.tripId}`);
  }
  if (input.tripId !== input.entry.tripId) {
    throw new Ds4Layer2P2OfflineReconstructionErrorV1(
      `P2 pilot tripId mismatch: expected ${input.entry.tripId}, got ${input.tripId}`,
    );
  }
  if (input.vehicleId !== input.entry.expectedVehicleId) {
    throw new Ds4Layer2P2OfflineReconstructionErrorV1(
      `P2 pilot vehicleId mismatch for trip ${input.tripId}: expected ${input.entry.expectedVehicleId}, got ${input.vehicleId}`,
    );
  }
  if (input.sourceFamily !== input.entry.expectedSourceFamily) {
    throw new Ds4Layer2P2OfflineReconstructionErrorV1(
      `P2 pilot sourceFamily mismatch for trip ${input.tripId}: expected ${input.entry.expectedSourceFamily}, got ${input.sourceFamily ?? 'null'}`,
    );
  }
  if (input.speedAuthority !== input.entry.expectedSpeedAuthority) {
    throw new Ds4Layer2P2OfflineReconstructionErrorV1(
      `P2 pilot speedAuthority mismatch for trip ${input.tripId}: expected ${input.entry.expectedSpeedAuthority}, got ${input.speedAuthority ?? 'null'}`,
    );
  }
}
