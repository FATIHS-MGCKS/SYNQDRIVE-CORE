import {
  BatterySourceType,
  EnrichmentJobType,
  type Prisma,
} from '@prisma/client';
import type { MasterDimoRegistrationInput } from './master-dimo-registration.types';
import { buildPostActivationVehiclePatch } from './master-dimo-registration.mapper';
import type { MasterDimoActivationFinalizeInput } from './master-dimo-activation-extensions';
import { applyMasterPostActivationVehicleScalarsInTransaction } from './master-dimo-post-activation.persistence';
import { computeMasterDimoRegistrationPayloadFingerprint } from './master-dimo-registration-payload-fingerprint';
import {
  assertAiTechnicalFieldsConfirmed,
  extractTechnicalSpecificationPatchInput,
} from '@modules/vehicles/vehicle-technical-spec-patch.util';
import { normalizeLvBatteryTypeInput } from '@modules/vehicles/vehicle-specification-canonical.contract';

export function assertMasterRegistrationAiTechnicalFieldsConfirmed(
  input: MasterDimoRegistrationInput,
): void {
  const extra = input.extraData ?? {};
  const technicalInput = extractTechnicalSpecificationPatchInput(
    extra as Record<string, unknown>,
  );
  if (!technicalInput) return;
  assertAiTechnicalFieldsConfirmed(
    technicalInput,
    (extra as { aiFieldProvenance?: Record<string, { category?: string }> }).aiFieldProvenance,
  );
}

export function buildMasterDimoActivationFinalizeInput(
  input: MasterDimoRegistrationInput,
): MasterDimoActivationFinalizeInput {
  assertMasterRegistrationAiTechnicalFieldsConfirmed(input);
  const patch = buildPostActivationVehiclePatch(input);
  if (input.actorUserId) {
    patch.createdByUserId = input.actorUserId;
  }
  return {
    vehicleScalarPatch: patch,
    lowVoltageBattery: input.manualSpecs?.battery ?? null,
    payloadFingerprint: computeMasterDimoRegistrationPayloadFingerprint(input),
  };
}

export async function applyMasterDimoActivationFinalizeInTransaction(
  tx: Prisma.TransactionClient,
  vehicleId: string,
  finalize: MasterDimoActivationFinalizeInput,
): Promise<void> {
  await applyMasterPostActivationVehicleScalarsInTransaction(
    tx,
    vehicleId,
    finalize.vehicleScalarPatch,
  );
  await applyLowVoltageBatterySpecIdempotentInTransaction(tx, vehicleId, finalize.lowVoltageBattery);
  await enqueueBatteryEnrichmentJobIdempotentInTransaction(tx, vehicleId);
}

export async function applyIdempotentMasterRegistrationPostActivation(
  tx: Prisma.TransactionClient,
  input: MasterDimoRegistrationInput,
  vehicleId: string,
): Promise<void> {
  const finalize = buildMasterDimoActivationFinalizeInput(input);
  await applyMasterDimoActivationFinalizeInTransaction(tx, vehicleId, finalize);
}

async function applyLowVoltageBatterySpecIdempotentInTransaction(
  tx: Prisma.TransactionClient,
  vehicleId: string,
  battery: MasterDimoActivationFinalizeInput['lowVoltageBattery'],
): Promise<void> {
  if (!battery) return;

  const normalizedType = normalizeLvBatteryTypeInput(battery.batteryType);
  if (!normalizedType) {
    return;
  }

  const existing = await tx.vehicleBatterySpec.findFirst({
    where: { vehicleId },
    select: { id: true },
  });
  if (existing) return;

  await tx.vehicleBatterySpec.create({
    data: {
      vehicleId,
      batteryType: normalizedType,
      batteryAmpere: battery.batteryAmpere ?? null,
      batteryVolt: battery.batteryVolt ?? null,
      sourceType: BatterySourceType.MANUAL,
      sourceConfidence: 1,
    },
  });
}

async function enqueueBatteryEnrichmentJobIdempotentInTransaction(
  tx: Prisma.TransactionClient,
  vehicleId: string,
): Promise<void> {
  const existing = await tx.vehicleEnrichmentJob.findFirst({
    where: { vehicleId, jobType: EnrichmentJobType.BATTERY },
    select: { id: true },
  });
  if (existing) return;
  await tx.vehicleEnrichmentJob.create({
    data: {
      vehicle: { connect: { id: vehicleId } },
      jobType: EnrichmentJobType.BATTERY,
      status: 'PENDING',
    },
  });
}
