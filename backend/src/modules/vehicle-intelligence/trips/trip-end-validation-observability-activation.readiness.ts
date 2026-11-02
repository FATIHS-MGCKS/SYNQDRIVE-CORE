import type { PrismaService } from '@shared/database/prisma.service';
import {
  parseTripEndValidationObservabilityEnabled,
  parseTripEndValidationObservabilityVehicleAllowlist,
  TRIP_END_VALIDATION_OBSERVABILITY_ACTIVATION_ACK_ENV,
  TRIP_END_VALIDATION_OBSERVABILITY_ACK_BEST_EFFORT_ENV,
  TRIP_END_VALIDATION_OBSERVABILITY_ENABLED_ENV,
  TRIP_END_VALIDATION_OBSERVABILITY_VEHICLE_IDS_ENV,
  TRIP_END_VALIDATION_OBSERVATION_RETENTION_READY_ACK_ENV,
} from './trip-end-validation-observability.config';
import {
  validateTripEndValidationObservabilityRetentionConfig,
} from './trip-end-validation-observability-retention.service';
import type tripEndValidationObservabilityRetentionConfig from '@config/trip-end-validation-observability-retention.config';
import type { ConfigType } from '@nestjs/config';
import { TDL_EV_OBS_RETENTION_PURGE_STATUS } from './trip-end-validation-observability-retention.types';

export type ActivationGateClass = 'automatic' | 'manual_attestation' | 'operator_release';

export type ActivationReadinessFinding = {
  gate: ActivationGateClass;
  code: string;
  message: string;
};

/**
 * Manual attestation env gates (not sufficient alone for observability writes).
 */
export function collectManualObservabilityActivationAttestations(
  env: NodeJS.ProcessEnv = process.env,
): ActivationReadinessFinding[] {
  const findings: ActivationReadinessFinding[] = [];
  if (
    !parseTripEndValidationObservabilityEnabled(
      env[TRIP_END_VALIDATION_OBSERVABILITY_ACTIVATION_ACK_ENV],
    )
  ) {
    findings.push({
      gate: 'manual_attestation',
      code: 'ACTIVATION_ACK_MISSING',
      message: 'TRIP_END_VALIDATION_OBSERVABILITY_ACTIVATION_ACK!=true',
    });
  }
  if (
    !parseTripEndValidationObservabilityEnabled(
      env[TRIP_END_VALIDATION_OBSERVABILITY_ACK_BEST_EFFORT_ENV],
    )
  ) {
    findings.push({
      gate: 'manual_attestation',
      code: 'BEST_EFFORT_ACK_MISSING',
      message: 'TRIP_END_VALIDATION_OBSERVABILITY_ACK_BEST_EFFORT!=true',
    });
  }
  if (
    !parseTripEndValidationObservabilityEnabled(
      env[TRIP_END_VALIDATION_OBSERVATION_RETENTION_READY_ACK_ENV],
    )
  ) {
    findings.push({
      gate: 'manual_attestation',
      code: 'RETENTION_READY_ACK_MISSING',
      message: 'TRIP_END_VALIDATION_OBSERVATION_RETENTION_READY_ACK!=true',
    });
  }
  return findings;
}

/**
 * Operator release gates (explicit flag + non-empty UUID allowlist).
 */
export function collectOperatorObservabilityReleaseGates(
  vehicleId: string,
  env: NodeJS.ProcessEnv = process.env,
): ActivationReadinessFinding[] {
  const findings: ActivationReadinessFinding[] = [];
  if (
    !parseTripEndValidationObservabilityEnabled(
      env[TRIP_END_VALIDATION_OBSERVABILITY_ENABLED_ENV],
    )
  ) {
    findings.push({
      gate: 'operator_release',
      code: 'GLOBAL_FLAG_OFF',
      message: 'TRIP_END_VALIDATION_OBSERVABILITY_ENABLED!=true',
    });
  }
  const allowlist = parseTripEndValidationObservabilityVehicleAllowlist(
    env[TRIP_END_VALIDATION_OBSERVABILITY_VEHICLE_IDS_ENV],
  );
  if (allowlist.size === 0) {
    findings.push({
      gate: 'operator_release',
      code: 'ALLOWLIST_EMPTY',
      message: 'TRIP_END_VALIDATION_OBSERVABILITY_VEHICLE_IDS empty',
    });
  } else if (!allowlist.has(vehicleId)) {
    findings.push({
      gate: 'operator_release',
      code: 'VEHICLE_NOT_ALLOWLISTED',
      message: 'vehicle not in TRIP_END_VALIDATION_OBSERVABILITY_VEHICLE_IDS',
    });
  }
  return findings;
}

export function collectAutomaticRetentionConfigBlockers(
  cfg: ConfigType<typeof tripEndValidationObservabilityRetentionConfig>,
): ActivationReadinessFinding[] {
  return validateTripEndValidationObservabilityRetentionConfig(cfg).map((message) => ({
    gate: 'automatic' as const,
    code: 'RETENTION_CONFIG_INVALID',
    message,
  }));
}

/**
 * Automatic persistence/runtime gates verified against PostgreSQL.
 */
export async function collectAutomaticObservabilityPersistenceBlockers(
  prisma: PrismaService,
  cfg: ConfigType<typeof tripEndValidationObservabilityRetentionConfig>,
): Promise<ActivationReadinessFinding[]> {
  const findings: ActivationReadinessFinding[] = [];
  findings.push(...collectAutomaticRetentionConfigBlockers(cfg));

  const tableRows = await prisma.$queryRaw<Array<{ exists: boolean }>>`
    SELECT to_regclass('public.trip_end_validation_decision_observations') IS NOT NULL AS exists
  `;
  if (tableRows[0]?.exists !== true) {
    findings.push({
      gate: 'automatic',
      code: 'PR0_TABLE_MISSING',
      message: 'trip_end_validation_decision_observations missing (migration not applied)',
    });
    return findings;
  }

  const purgeTableRows = await prisma.$queryRaw<Array<{ exists: boolean }>>`
    SELECT to_regclass('public.trip_end_validation_observability_retention_purge_runs') IS NOT NULL AS exists
  `;
  if (purgeTableRows[0]?.exists !== true) {
    findings.push({
      gate: 'automatic',
      code: 'RETENTION_AUDIT_TABLE_MISSING',
      message: 'trip_end_validation_observability_retention_purge_runs missing (PR1 migration not applied)',
    });
    return findings;
  }

  if (!cfg.dryRun) {
    const lastCompleted =
      await prisma.tripEndValidationObservabilityRetentionPurgeRun.findFirst({
        where: { status: TDL_EV_OBS_RETENTION_PURGE_STATUS.COMPLETED, dryRun: false },
        orderBy: { completedAt: 'desc' },
      });
    if (!lastCompleted) {
      findings.push({
        gate: 'automatic',
        code: 'NO_SUCCESSFUL_DESTRUCTIVE_PURGE',
        message:
          'retention dry-run disabled but no completed non-dry purge run recorded yet',
      });
    }
  } else {
    const lastAny = await prisma.tripEndValidationObservabilityRetentionPurgeRun.findFirst({
      where: { status: TDL_EV_OBS_RETENTION_PURGE_STATUS.COMPLETED },
      orderBy: { completedAt: 'desc' },
    });
    if (!lastAny) {
      findings.push({
        gate: 'automatic',
        code: 'NO_COMPLETED_PURGE_RUN',
        message: 'no completed retention purge run recorded yet (scheduler proof)',
      });
    }
  }

  return findings;
}

export async function assertObservabilityWritesAllowed(
  prisma: PrismaService,
  vehicleId: string,
  retentionCfg: ConfigType<typeof tripEndValidationObservabilityRetentionConfig>,
  env: NodeJS.ProcessEnv = process.env,
): Promise<ActivationReadinessFinding[]> {
  return [
    ...collectOperatorObservabilityReleaseGates(vehicleId, env),
    ...collectManualObservabilityActivationAttestations(env),
    ...(await collectAutomaticObservabilityPersistenceBlockers(prisma, retentionCfg)),
  ];
}
