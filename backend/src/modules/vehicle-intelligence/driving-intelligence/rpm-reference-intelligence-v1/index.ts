export {
  DS4_RPM_REFERENCE_INTELLIGENCE_V1_CONTRACT_VERSION,
  DS4_RPM_REF_INTEL_REASON,
  type Ds4RpmReferenceIntelligenceV1Availability,
  type Ds4RpmReferenceIntelligenceV1ComputeInput,
  type Ds4RpmReferenceIntelligenceV1HfAdmissionSlice,
  type Ds4RpmReferenceIntelligenceV1HfPoint,
  type Ds4RpmReferenceIntelligenceV1MetricsV1,
  type Ds4RpmReferenceIntelligenceV1ReasonCode,
  type Ds4RpmReferenceIntelligenceV1ReferenceQualityV1,
  type Ds4RpmReferenceIntelligenceV1Result,
  type Ds4RpmReferenceOperatingBandId,
} from './ds4-rpm-reference-intelligence-v1.contract';

export {
  buildDs4RpmReferenceIntelligenceV1ReferenceBlock,
  referencePairIsConsistent,
  type Ds4RpmReferenceIntelligenceV1VehicleSpecFieldProvenance,
} from './ds4-rpm-reference-intelligence-v1-reference-input';

export {
  computeDs4RpmReferenceIntelligenceV1,
  DS4_RPM_REF_INTEL_DEFAULT_MIN_ELIGIBLE_WEIGHTED_SECONDS,
  DS4_RPM_REF_INTEL_IDLE_PROXIMITY_NORMALIZED_MAX,
} from './ds4-rpm-reference-intelligence-v1.engine';

export {
  resolveDs4RpmReferenceIntelligenceV1SequenceMaxGap,
  type Ds4RpmReferenceIntelligenceV1AuthoritativeV1bTemporalV1,
  type Ds4RpmReferenceIntelligenceV1SequenceGapResolution,
} from './ds4-rpm-reference-intelligence-v1-v1b-temporal-binding';

export type {
  Ds4RpmReferenceIntelligenceV1ConsumerContractRef,
  Ds4RpmReferenceIntelligenceV1ConsumerReadModel,
  Ds4RpmReferenceIntelligenceV1OptionalAttachment,
} from './ds4-rpm-reference-intelligence-v1-di-consumer.interface';

export {
  parseDs4RpmRefIntelV1V1bAttachEnabled,
  DS4_RPM_REF_INTEL_V1_V1B_ATTACH_ENV,
} from './ds4-rpm-reference-intelligence-v1-v1b-attach.config';

export {
  buildDs4RpmReferenceIntelligenceV1ReferenceFromVehicleRow,
  extractVehicleRpmReferenceFieldProvenance,
  mapRegistrationFieldProvenanceForRpmReference,
  type Ds4RpmReferenceIntelligenceV1VehicleReferenceRow,
} from './ds4-rpm-reference-intelligence-v1-vehicle-reference.mapper';

export {
  applyRpmReferenceIntelligenceV1V1bShadowAttachment,
  buildAuthoritativeV1bTemporalFromShadowResult,
  buildDs4RpmReferenceIntelligenceV1ComputeInputFromV1bShadow,
  buildRpmReferenceIntelligenceV1V1bShadowAttachment,
  shouldAttachRpmReferenceIntelligenceV1ToV1bSummary,
  DS4_RPM_REF_INTEL_V1_V1B_ATTACHMENT_REVISION_POLICY,
  DS4_RPM_REF_INTEL_V1_V1B_SHADOW_ATTACH_CONTRACT_VERSION,
  type Ds4RpmHfV1bShadowPersistedSummaryV1,
  type Ds4RpmReferenceIntelligenceV1V1bShadowSummaryAttachmentV1,
} from './ds4-rpm-reference-intelligence-v1-v1b-shadow-attach';
