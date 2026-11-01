import type { PrismaService } from '@shared/database/prisma.service';
import { evaluateDiV0S4KillRow, type DiV0S4KillEvaluation } from '../../driving-intelligence/s4a-foundation/di-v0-s4a-control-plane';
import {
  parseDiV0Ds4FleetMotionAdmissionPolicyV1,
  type DiV0Ds4FleetMotionAdmissionPolicySnapshotV1,
} from '../../driving-intelligence/fleet-motion-admission/di-v0-ds4-fleet-motion-admission-policy.v1';
import {
  evaluateTripDiBoundaryAdmissionRecoveryVehicleEligibilityV1,
  type TripDiBoundaryAdmissionRecoveryVehicleContextV1,
} from './trip-di-boundary-admission-recovery.eligibility.v1';
import type { TripDiBoundaryAdmissionRecoveryPolicy } from './trip-di-boundary-admission-recovery.policy';
import { isTripDiBoundaryAdmissionRecoveryEnabled } from './trip-di-boundary-admission-recovery.policy';
import {
  computeTripDiBoundaryAdmissionRecoveryFleetPassRotationSeed,
  rotateTripDiBoundaryAdmissionRecoveryFleetVehiclesV1,
} from './trip-di-boundary-admission-recovery.fleet-fairness.v1';

export type TripDiBoundaryAdmissionRecoveryFleetVehicleV1 = {
  organizationId: string;
  vehicleId: string;
};

export async function loadTripDiBoundaryAdmissionRecoveryVehicleContextV1(
  prisma: Pick<PrismaService, '$queryRaw'>,
  vehicleId: string,
): Promise<TripDiBoundaryAdmissionRecoveryVehicleContextV1 | null> {
  const rows = await prisma.$queryRaw<
    Array<{
      vehicle_id: string;
      organization_id: string;
      registry_lifecycle: string;
      dimo_raw_json: unknown;
    }>
  >`
    SELECT v.id AS vehicle_id,
           v.organization_id,
           v.registry_lifecycle::text AS registry_lifecycle,
           d.raw_json AS dimo_raw_json
    FROM vehicles v
    LEFT JOIN dimo_vehicles d ON d.id = v.dimo_vehicle_id
    WHERE v.id = ${vehicleId}
    LIMIT 1`;
  const row = rows[0];
  if (!row) return null;
  return {
    vehicleId: row.vehicle_id,
    organizationId: row.organization_id,
    vehicleOrganizationId: row.organization_id,
    registryLifecycle: row.registry_lifecycle,
    dimoRawJson: row.dimo_raw_json,
  };
}

export async function readDiV0S4KillEvaluationForRecovery(
  prisma: Pick<PrismaService, '$queryRaw'>,
): Promise<DiV0S4KillEvaluation> {
  try {
    const rows = await prisma.$queryRaw<Array<{ kill_state: unknown }>>`
      SELECT kill_state FROM di_v0_s4_control WHERE id = 'GLOBAL'`;
    return evaluateDiV0S4KillRow(
      rows.length === 1 ? { kind: 'ROW', killState: rows[0].kill_state } : { kind: 'MISSING' },
    );
  } catch {
    return evaluateDiV0S4KillRow({ kind: 'READ_ERROR' });
  }
}

export function loadTripDiBoundaryAdmissionRecoveryDs4FleetMotionPolicyFromEnv(
  env: Readonly<Record<string, string | undefined>> = process.env,
): DiV0Ds4FleetMotionAdmissionPolicySnapshotV1 {
  return parseDiV0Ds4FleetMotionAdmissionPolicyV1(env);
}

/** @deprecated use loadTripDiBoundaryAdmissionRecoveryDs4FleetMotionPolicyFromEnv */
export const loadTripDiBoundaryAdmissionRecoveryFleetPolicyFromEnv =
  loadTripDiBoundaryAdmissionRecoveryDs4FleetMotionPolicyFromEnv;

/** ACTIVE registry vehicles eligible for recovery (provider + S4 + kill), independent of VLS token or fast cohort. */
export async function listTripDiBoundaryAdmissionRecoveryFleetVehiclesV1(
  prisma: Pick<PrismaService, '$queryRaw'>,
  params: {
    policy: TripDiBoundaryAdmissionRecoveryPolicy;
    ds4FleetMotionPolicy: DiV0Ds4FleetMotionAdmissionPolicySnapshotV1;
    kill: DiV0S4KillEvaluation;
    now?: Date;
  },
): Promise<TripDiBoundaryAdmissionRecoveryFleetVehicleV1[]> {
  if (!isTripDiBoundaryAdmissionRecoveryEnabled(params.policy)) return [];
  const rows = await prisma.$queryRaw<
    Array<{
      vehicle_id: string;
      organization_id: string;
      registry_lifecycle: string;
      dimo_raw_json: unknown;
    }>
  >`
    SELECT v.id AS vehicle_id,
           v.organization_id,
           v.registry_lifecycle::text AS registry_lifecycle,
           d.raw_json AS dimo_raw_json
    FROM vehicles v
    LEFT JOIN dimo_vehicles d ON d.id = v.dimo_vehicle_id
    WHERE v.registry_lifecycle::text = 'ACTIVE'
    ORDER BY v.organization_id ASC, v.id ASC`;
  const eligible: TripDiBoundaryAdmissionRecoveryFleetVehicleV1[] = [];
  for (const row of rows) {
    const vehicle: TripDiBoundaryAdmissionRecoveryVehicleContextV1 = {
      vehicleId: row.vehicle_id,
      organizationId: row.organization_id,
      vehicleOrganizationId: row.organization_id,
      registryLifecycle: row.registry_lifecycle,
      dimoRawJson: row.dimo_raw_json,
    };
    const decision = evaluateTripDiBoundaryAdmissionRecoveryVehicleEligibilityV1({
      policy: params.policy,
      ds4FleetMotionPolicy: params.ds4FleetMotionPolicy,
      kill: params.kill,
      vehicle,
    });
    if (decision.eligible) {
      eligible.push({ organizationId: row.organization_id, vehicleId: row.vehicle_id });
    }
  }
  const now = params.now ?? new Date();
  const seed = computeTripDiBoundaryAdmissionRecoveryFleetPassRotationSeed(now);
  return rotateTripDiBoundaryAdmissionRecoveryFleetVehiclesV1(eligible, seed);
}
