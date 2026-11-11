import { computeDs4RpmHfV1bTierAwareInputFingerprint } from '../rpm-hf-v1b/ds4-rpm-hf-v1b-input-fingerprint';
import { buildDs4RpmReferenceIntelligenceV1ReferenceBlock } from '../rpm-reference-intelligence-v1/ds4-rpm-reference-intelligence-v1-reference-input';
import { DS4_RPM_DYNAMICS_RESEARCH_CONTRACT_VERSION } from '../ds4-rpm-dynamics-research/ds4-rpm-dynamics-research.contract.v1';
import type { Ds4RpmHfV1aTripInputV1 } from '../rpm-hf-v1a/ds4-rpm-hf-v1a.contract';
import type { Ds4RpmHfV1bShadowResultV1 } from '../rpm-hf-v1b/ds4-rpm-hf-v1b.contract';
import type { DiV0MotionCoreShadowPayloadV1 } from '../motion-core-shadow-worker/di-v0-motion-core-shadow.types';
import {
  DS4_RPM_SHADOW_CORRELATION_CONTRACT_VERSION,
  type Ds4RpmShadowCorrelationEvidenceKind,
  type Ds4RpmShadowCorrelationRpmSampleEvidenceV1,
} from '../ds4-rpm-shadow-correlation/ds4-rpm-shadow-correlation-v1.contract';
import {
  DS4_RPM_DYNAMICS_FUSION_RESEARCH_CONTRACT_VERSION,
  type Ds4RpmDynamicsFusionResearchResultV1,
} from './ds4-rpm-dynamics-fusion-research.contract.v1';
import {
  computeDs4RpmDynamicsFusionResearchV1,
  type Ds4RpmDynamicsFusionResearchInputV1,
} from './ds4-rpm-dynamics-fusion-research.kernel.v1';

export type Ds4RpmDynamicsFusionHarnessExecuteInput = {
  organizationId: string;
  vehicleId: string;
  tripId: string;
  motionRunId: string;
  motionPayload: DiV0MotionCoreShadowPayloadV1;
  tripInput: Ds4RpmHfV1aTripInputV1;
  v1bResult: Ds4RpmHfV1bShadowResultV1 | null;
  v1bRunId: string;
  rpmSamples: Ds4RpmShadowCorrelationRpmSampleEvidenceV1 | null;
  evidenceKind: Ds4RpmShadowCorrelationEvidenceKind;
  dimoVehicleRawJson: unknown;
};

export function executeDs4RpmDynamicsFusionHarness(
  input: Ds4RpmDynamicsFusionHarnessExecuteInput,
): Ds4RpmDynamicsFusionResearchResultV1 {
  const fingerprint = computeDs4RpmHfV1bTierAwareInputFingerprint(input.tripInput);
  const correlation = {
    contractVersion: DS4_RPM_SHADOW_CORRELATION_CONTRACT_VERSION,
    organizationId: input.organizationId,
    vehicleId: input.vehicleId,
    tripId: input.tripId,
    motion: { runId: input.motionRunId, pinnedSnapshotHash: null, inputFingerprint: null },
    events: input.motionPayload.events,
    v1b: input.v1bResult
      ? {
          runId: input.v1bRunId,
          engineVersion: input.v1bResult.engineVersion,
          inputFingerprint: fingerprint,
          summary: input.v1bResult,
        }
      : null,
    rpmSamples: input.rpmSamples,
  };

  const dynamicsInput = {
    contractVersion: DS4_RPM_DYNAMICS_RESEARCH_CONTRACT_VERSION,
    evidenceOrigin: input.evidenceKind === 'SYNTHETIC_FIXTURE' ? ('SYNTHETIC_FIXTURE' as const) : ('OFFLINE_SEALED_BUNDLE' as const),
    sourceBundleId: null,
    organizationId: input.organizationId,
    vehicleId: input.vehicleId,
    tripId: input.tripId,
    providerSourceLinkId: input.tripInput.providerSourceLinkId ?? '',
    dimoVehicleRawJson: input.dimoVehicleRawJson,
    tripInput: input.tripInput,
    v1bResult: input.v1bResult,
    reference: buildDs4RpmReferenceIntelligenceV1ReferenceBlock({
      idleRpm: 800,
      maxRpm: 6800,
      idleRpmProvenance: { category: 'USER_CONFIRMED' },
      maxRpmProvenance: { category: 'USER_CONFIRMED' },
      iceRpmApplicability: input.tripInput.admission.iceRpmApplicability,
    }),
  };

  const fusionInput: Ds4RpmDynamicsFusionResearchInputV1 = {
    contractVersion: DS4_RPM_DYNAMICS_FUSION_RESEARCH_CONTRACT_VERSION,
    evidenceKind: input.evidenceKind,
    correlation,
    dynamicsInput,
    motionPayload: input.motionPayload,
    provenanceGate: {
      recomputedV1bInputFingerprint: fingerprint,
      evidenceKind: input.evidenceKind,
      canonicalTripRpmPoints: input.tripInput.rpmPoints.map((p) => ({ ...p })),
    },
  };

  return computeDs4RpmDynamicsFusionResearchV1(fusionInput);
}
