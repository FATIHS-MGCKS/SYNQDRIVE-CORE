import type { Logger } from '@nestjs/common';
import type { Ds4RpmHfV1aTripInputV1 } from '../rpm-hf-v1a/ds4-rpm-hf-v1a.contract';
import type { Ds4RpmHfV1bShadowResultV1 } from '../rpm-hf-v1b/ds4-rpm-hf-v1b.contract';
import type { VsiIceRpmApplicability } from '../../vehicle-signal-intelligence/vsi-profile-cadence.types';
import {
  DS4_RPM_REFERENCE_INTELLIGENCE_V1_CONTRACT_VERSION,
  type Ds4RpmReferenceIntelligenceV1ComputeInput,
  type Ds4RpmReferenceIntelligenceV1Result,
  type Ds4RpmReferenceSpecProvenanceClass,
} from './ds4-rpm-reference-intelligence-v1.contract';
import { computeDs4RpmReferenceIntelligenceV1 } from './ds4-rpm-reference-intelligence-v1.engine';
import type { Ds4RpmReferenceIntelligenceV1AuthoritativeV1bTemporalV1 } from './ds4-rpm-reference-intelligence-v1-v1b-temporal-binding';
import {
  buildDs4RpmReferenceIntelligenceV1ReferenceFromVehicleRow,
  type Ds4RpmReferenceIntelligenceV1VehicleReferenceRow,
} from './ds4-rpm-reference-intelligence-v1-vehicle-reference.mapper';

export const DS4_RPM_REF_INTEL_V1_V1B_SHADOW_ATTACH_CONTRACT_VERSION =
  'ds4-rpm-reference-intelligence-v1-v1b-shadow-attach-v1' as const;

/** Stored attachments reflect vehicle reference values at calculation time; spec edits do not reopen historical runs. */
export const DS4_RPM_REF_INTEL_V1_V1B_ATTACHMENT_REVISION_POLICY =
  'REFERENCE_SNAPSHOT_AT_CALCULATION_TIME_NO_SPEC_REPLAY' as const;

export type Ds4RpmReferenceIntelligenceV1V1bShadowReferenceSnapshotUsedV1 = {
  idleRpm: number | null;
  maxRpm: number | null;
  idleRpmProvenance: Ds4RpmReferenceSpecProvenanceClass;
  maxRpmProvenance: Ds4RpmReferenceSpecProvenanceClass;
  iceRpmApplicability: VsiIceRpmApplicability;
};

export type Ds4RpmReferenceIntelligenceV1V1bShadowSummaryAttachmentV1 = {
  contractVersion: typeof DS4_RPM_REF_INTEL_V1_V1B_SHADOW_ATTACH_CONTRACT_VERSION;
  rpmReferenceIntelligenceContractVersion: typeof DS4_RPM_REFERENCE_INTELLIGENCE_V1_CONTRACT_VERSION;
  runId: string;
  inputFingerprint: string;
  organizationId: string;
  vehicleId: string;
  tripId: string;
  computedAtIso: string;
  referenceSnapshotUsed: Ds4RpmReferenceIntelligenceV1V1bShadowReferenceSnapshotUsedV1;
  revisionPolicy: typeof DS4_RPM_REF_INTEL_V1_V1B_ATTACHMENT_REVISION_POLICY;
  payload: Ds4RpmReferenceIntelligenceV1Result;
};

export type Ds4RpmHfV1bShadowPersistedSummaryV1 = Ds4RpmHfV1bShadowResultV1 & {
  rpmReferenceIntelligenceV1?: Ds4RpmReferenceIntelligenceV1V1bShadowSummaryAttachmentV1;
};

export function shouldAttachRpmReferenceIntelligenceV1ToV1bSummary(input: {
  attachEnabled: boolean;
  v1bResult: Ds4RpmHfV1bShadowResultV1;
}): boolean {
  if (!input.attachEnabled) return false;
  return (
    input.v1bResult.processingOutcome === 'SUCCEEDED' &&
    input.v1bResult.admission.processingAllowed === true
  );
}

export function buildAuthoritativeV1bTemporalFromShadowResult(
  v1bResult: Ds4RpmHfV1bShadowResultV1,
): Ds4RpmReferenceIntelligenceV1AuthoritativeV1bTemporalV1 | null {
  const tierEvidence = v1bResult.tierEvidence;
  if (!tierEvidence) return null;
  if (!tierEvidence.temporalCadenceProfile && !tierEvidence.tier) return null;
  return {
    temporalCadenceProfile: tierEvidence.temporalCadenceProfile ?? null,
    cadenceTier: tierEvidence.tier ?? v1bResult.admission.qualityExposure.cadenceTier,
  };
}

export function buildDs4RpmReferenceIntelligenceV1ComputeInputFromV1bShadow(input: {
  tripInput: Ds4RpmHfV1aTripInputV1;
  v1bResult: Ds4RpmHfV1bShadowResultV1;
  reference: Ds4RpmReferenceIntelligenceV1ComputeInput['reference'];
}): Ds4RpmReferenceIntelligenceV1ComputeInput {
  return {
    tripStartIso: input.tripInput.tripStartIso ?? undefined,
    tripEndIso: input.tripInput.tripEndIso ?? undefined,
    reference: input.reference,
    hf: {
      points: input.tripInput.rpmPoints.map((p) => ({
        recordedAtIso: p.recordedAtIso,
        valueRpm: p.valueRpm,
      })),
      admission: {
        processingAllowed: input.tripInput.admission.processingAllowed,
        iceRpmApplicability: input.tripInput.admission
          .iceRpmApplicability as VsiIceRpmApplicability,
      },
      qualityExposure: input.v1bResult.admission.qualityExposure,
      authoritativeV1bTemporal: buildAuthoritativeV1bTemporalFromShadowResult(input.v1bResult),
    },
  };
}

export function buildRpmReferenceIntelligenceV1V1bShadowAttachment(input: {
  runId: string;
  inputFingerprint: string;
  computedAt: Date;
  tripInput: Ds4RpmHfV1aTripInputV1;
  v1bResult: Ds4RpmHfV1bShadowResultV1;
  vehicle: Ds4RpmReferenceIntelligenceV1VehicleReferenceRow;
}): Ds4RpmReferenceIntelligenceV1V1bShadowSummaryAttachmentV1 {
  if (input.vehicle.organizationId !== input.tripInput.organizationId) {
    throw new Error('TENANCY_MISMATCH');
  }
  if (input.vehicle.organizationId !== input.v1bResult.organizationId) {
    throw new Error('TENANCY_MISMATCH');
  }
  const reference = buildDs4RpmReferenceIntelligenceV1ReferenceFromVehicleRow({
    vehicle: input.vehicle,
    iceRpmApplicability: input.tripInput.admission
      .iceRpmApplicability as VsiIceRpmApplicability,
  });
  const computeInput = buildDs4RpmReferenceIntelligenceV1ComputeInputFromV1bShadow({
    tripInput: input.tripInput,
    v1bResult: input.v1bResult,
    reference,
  });
  const payload = computeDs4RpmReferenceIntelligenceV1(computeInput);
  return {
    contractVersion: DS4_RPM_REF_INTEL_V1_V1B_SHADOW_ATTACH_CONTRACT_VERSION,
    rpmReferenceIntelligenceContractVersion: DS4_RPM_REFERENCE_INTELLIGENCE_V1_CONTRACT_VERSION,
    runId: input.runId,
    inputFingerprint: input.inputFingerprint,
    organizationId: input.v1bResult.organizationId,
    vehicleId: input.v1bResult.vehicleId,
    tripId: input.v1bResult.tripId,
    computedAtIso: input.computedAt.toISOString(),
    referenceSnapshotUsed: {
      idleRpm: reference.idleRpm,
      maxRpm: reference.maxRpm,
      idleRpmProvenance: reference.idleRpmProvenance,
      maxRpmProvenance: reference.maxRpmProvenance,
      iceRpmApplicability: reference.iceRpmApplicability,
    },
    revisionPolicy: DS4_RPM_REF_INTEL_V1_V1B_ATTACHMENT_REVISION_POLICY,
    payload,
  };
}

export function applyRpmReferenceIntelligenceV1V1bShadowAttachment(input: {
  summary: Ds4RpmHfV1bShadowResultV1;
  tripInput: Ds4RpmHfV1aTripInputV1;
  vehicle: Ds4RpmReferenceIntelligenceV1VehicleReferenceRow;
  runId: string;
  inputFingerprint: string;
  computedAt: Date;
  attachEnabled: boolean;
  logger?: Pick<Logger, 'warn'>;
}): Ds4RpmHfV1bShadowPersistedSummaryV1 {
  if (!shouldAttachRpmReferenceIntelligenceV1ToV1bSummary({
    attachEnabled: input.attachEnabled,
    v1bResult: input.summary,
  })) {
    return input.summary;
  }
  try {
    const attachment = buildRpmReferenceIntelligenceV1V1bShadowAttachment({
      runId: input.runId,
      inputFingerprint: input.inputFingerprint,
      computedAt: input.computedAt,
      tripInput: input.tripInput,
      v1bResult: input.summary,
      vehicle: input.vehicle,
    });
    return { ...input.summary, rpmReferenceIntelligenceV1: attachment };
  } catch (error) {
    input.logger?.warn(
      `rpm ref intel v1 v1b attach failed tripId=${input.summary.tripId} runId=${input.runId}: ${
        error instanceof Error ? error.message.slice(0, 200) : 'unknown'
      }`,
    );
    return input.summary;
  }
}
