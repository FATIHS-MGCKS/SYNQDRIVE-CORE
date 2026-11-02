import {
  VSI_CONSUMER_REQUIREMENTS_CONTRACT_VERSION,
  type VsiConsumerModuleId,
  type VsiConsumerRequirementSpecV1,
  VsiConsumerModuleId as ModuleId,
  VsiDomainApprovalStatus,
} from './vsi-consumer-requirements.types';

const pending = VsiDomainApprovalStatus.PENDING_DOMAIN_APPROVAL;

/** Production runtime ELIGIBLE gate — design-contract-only specs are excluded. */
export function isConsumerRequirementRuntimeApproved(
  status: VsiDomainApprovalStatus,
): boolean {
  return status === VsiDomainApprovalStatus.APPROVED;
}

export function isConsumerRequirementDesignContractOnly(
  status: VsiDomainApprovalStatus,
): boolean {
  return status === VsiDomainApprovalStatus.APPROVED_DESIGN_CONTRACT;
}

/** Versioned registry — do not invent domain thresholds; null maxSignalAgeMs ⇒ pending. */
export const VSI_CONSUMER_REQUIREMENTS_V1: readonly VsiConsumerRequirementSpecV1[] = [
  {
    contractVersion: VSI_CONSUMER_REQUIREMENTS_CONTRACT_VERSION,
    consumerModule: ModuleId.BATTERY_V2,
    featureId: 'lv_measurement_gate',
    requirementId: 'battery_v2.lv_voltage.observed',
    canonicalSignalKeys: ['lv_voltage'],
    providerSourceLinkScoped: true,
    minimumEvidence: 'EMPIRICAL_OBSERVED',
    maxSignalAgeMs: null,
    minimumQuality: 'FRESH_AT_EVALUATION',
    historicalReliability: 'NONE',
    declaredOnlySufficient: false,
    requireAllSignalsTogether: false,
    fallbackChainId: null,
    domainOwner: 'battery_v2',
    domainApprovalStatus: pending,
    evidenceReference: 'architecture/battery-v2 — measurement gates authoritative; max age TBD',
  },
  {
    contractVersion: VSI_CONSUMER_REQUIREMENTS_CONTRACT_VERSION,
    consumerModule: ModuleId.BATTERY_V2,
    featureId: 'hv_soc_readiness',
    requirementId: 'battery_v2.hv_battery_soc.observed',
    canonicalSignalKeys: ['hv_battery_soc'],
    providerSourceLinkScoped: true,
    minimumEvidence: 'EMPIRICAL_OBSERVED',
    maxSignalAgeMs: null,
    minimumQuality: 'FRESH_AT_EVALUATION',
    historicalReliability: 'NONE',
    declaredOnlySufficient: false,
    requireAllSignalsTogether: false,
    fallbackChainId: null,
    domainOwner: 'battery_v2',
    domainApprovalStatus: pending,
    evidenceReference: 'architecture/battery-v2 — publication gates authoritative',
  },
  {
    contractVersion: VSI_CONSUMER_REQUIREMENTS_CONTRACT_VERSION,
    consumerModule: ModuleId.DRIVING_INTELLIGENCE,
    featureId: 'exp021_trip_speed_qc',
    requirementId: 'di.vehicle_speed.gps_numeric',
    canonicalSignalKeys: ['vehicle_speed'],
    providerSourceLinkScoped: true,
    minimumEvidence: 'EMPIRICAL_OBSERVED',
    maxSignalAgeMs: null,
    minimumQuality: 'FRESH_AT_EVALUATION',
    historicalReliability: 'NONE',
    declaredOnlySufficient: false,
    requireAllSignalsTogether: false,
    fallbackChainId: null,
    domainOwner: 'driving_intelligence',
    domainApprovalStatus: pending,
    evidenceReference: 'architecture/drivingintelligence/EXP021 — preserves GPS-speed QC; resolver threshold TBD',
  },
  {
    contractVersion: VSI_CONSUMER_REQUIREMENTS_CONTRACT_VERSION,
    consumerModule: ModuleId.DRIVING_INTELLIGENCE,
    featureId: 'exp021_position_context',
    requirementId: 'di.position_coordinates.observed',
    canonicalSignalKeys: ['position_coordinates'],
    providerSourceLinkScoped: true,
    minimumEvidence: 'EMPIRICAL_OBSERVED',
    maxSignalAgeMs: null,
    minimumQuality: 'FRESH_AT_EVALUATION',
    historicalReliability: 'NONE',
    declaredOnlySufficient: false,
    requireAllSignalsTogether: false,
    fallbackChainId: null,
    domainOwner: 'driving_intelligence',
    domainApprovalStatus: pending,
    evidenceReference: 'EXP021 GPS semantics — position assessability TBD',
  },
  {
    contractVersion: VSI_CONSUMER_REQUIREMENTS_CONTRACT_VERSION,
    consumerModule: ModuleId.DRIVING_INTELLIGENCE,
    featureId: 'behavior_accelerator_evidence',
    requirementId: 'di.accelerator_pedal_position.observed',
    canonicalSignalKeys: ['accelerator_pedal_position'],
    providerSourceLinkScoped: true,
    minimumEvidence: 'EMPIRICAL_OBSERVED',
    maxSignalAgeMs: null,
    minimumQuality: 'ANY_OBSERVED',
    historicalReliability: 'NONE',
    declaredOnlySufficient: false,
    requireAllSignalsTogether: false,
    fallbackChainId: 'di-gps-speed-for-accelerator-proposed',
    domainOwner: 'driving_intelligence',
    domainApprovalStatus: pending,
    evidenceReference: 'No validated DI accelerator pipeline — listed ≠ observed',
  },
  {
    contractVersion: VSI_CONSUMER_REQUIREMENTS_CONTRACT_VERSION,
    consumerModule: ModuleId.DRIVING_INTELLIGENCE,
    featureId: 'behavior_brake_evidence',
    requirementId: 'di.brake_pedal_position.observed',
    canonicalSignalKeys: ['brake_pedal_position'],
    providerSourceLinkScoped: true,
    minimumEvidence: 'EMPIRICAL_OBSERVED',
    maxSignalAgeMs: null,
    minimumQuality: 'ANY_OBSERVED',
    historicalReliability: 'NONE',
    declaredOnlySufficient: false,
    requireAllSignalsTogether: false,
    fallbackChainId: null,
    domainOwner: 'driving_intelligence',
    domainApprovalStatus: pending,
    evidenceReference: 'No brake_pedal_position materialization key — NOT_ASSESSABLE until domain defines key',
  },
  {
    contractVersion: VSI_CONSUMER_REQUIREMENTS_CONTRACT_VERSION,
    consumerModule: ModuleId.TRIP_DETECTION,
    featureId: 'trip_boundary_support_signals',
    requirementId: 'trip.provider_source_timestamp.fresh',
    canonicalSignalKeys: ['provider_source_timestamp'],
    providerSourceLinkScoped: true,
    minimumEvidence: 'EMPIRICAL_OBSERVED',
    maxSignalAgeMs: null,
    minimumQuality: 'FRESH_AT_EVALUATION',
    historicalReliability: 'BUNDLE_CADENCE_ONLY',
    declaredOnlySufficient: false,
    requireAllSignalsTogether: false,
    fallbackChainId: null,
    domainOwner: 'trip_detection',
    domainApprovalStatus: pending,
    evidenceReference: 'Trip FSM owns boundaries — availability requirement only',
  },
  {
    contractVersion: VSI_CONSUMER_REQUIREMENTS_CONTRACT_VERSION,
    consumerModule: ModuleId.DTC_DIAGNOSTICS,
    featureId: 'dtc_snapshot_readiness',
    requirementId: 'dtc.diagnostic_trouble_code.observed_or_empty',
    canonicalSignalKeys: ['diagnostic_trouble_code'],
    providerSourceLinkScoped: true,
    minimumEvidence: 'EMPIRICAL_OBSERVED',
    maxSignalAgeMs: null,
    minimumQuality: 'ANY_OBSERVED',
    historicalReliability: 'NONE',
    declaredOnlySufficient: false,
    requireAllSignalsTogether: false,
    fallbackChainId: null,
    domainOwner: 'dtc_diagnostics',
    domainApprovalStatus: pending,
    evidenceReference: 'DTC domain — algorithm unchanged in P4',
  },
  {
    contractVersion: VSI_CONSUMER_REQUIREMENTS_CONTRACT_VERSION,
    consumerModule: ModuleId.APDS,
    featureId: 'shadow_demand_profile_read',
    requirementId: 'apds.profile_revision.correlation',
    canonicalSignalKeys: ['provider_source_timestamp'],
    providerSourceLinkScoped: true,
    minimumEvidence: 'EMPIRICAL_OBSERVED',
    maxSignalAgeMs: null,
    minimumQuality: 'ANY_OBSERVED',
    historicalReliability: 'NONE',
    declaredOnlySufficient: false,
    requireAllSignalsTogether: false,
    fallbackChainId: null,
    domainOwner: 'apds',
    domainApprovalStatus: VsiDomainApprovalStatus.APPROVED_DESIGN_CONTRACT,
    evidenceReference:
      'vsi-apds-consumer.adapter.contract.ts — design/contract approval only; no APDS shadow wiring in P4',
  },
  {
    contractVersion: VSI_CONSUMER_REQUIREMENTS_CONTRACT_VERSION,
    consumerModule: ModuleId.DRIVING_INTELLIGENCE,
    featureId: 'ds4_rpm_hf_v1a',
    requirementId: 'di.engine_rpm.active_cadence_profile',
    canonicalSignalKeys: ['engine_rpm'],
    providerSourceLinkScoped: true,
    minimumEvidence: 'EMPIRICAL_OBSERVED',
    maxSignalAgeMs: null,
    minimumQuality: 'ANY_OBSERVED',
    historicalReliability: 'PER_SIGNAL_CADENCE_PROVEN',
    declaredOnlySufficient: false,
    requireAllSignalsTogether: false,
    fallbackChainId: null,
    domainOwner: 'driving_intelligence',
    domainApprovalStatus: VsiDomainApprovalStatus.APPROVED_DESIGN_CONTRACT,
    evidenceReference:
      'DS4 RPM HF V1A — reads cadenceIntelligence.activeRpmProfile only; design contract, no production activation',
  },
];

export function listConsumerRequirements(input: {
  consumerModule: VsiConsumerModuleId;
  featureId: string;
  requirementsVersion: typeof VSI_CONSUMER_REQUIREMENTS_CONTRACT_VERSION;
}): VsiConsumerRequirementSpecV1[] {
  if (input.requirementsVersion !== VSI_CONSUMER_REQUIREMENTS_CONTRACT_VERSION) {
    return [];
  }
  return VSI_CONSUMER_REQUIREMENTS_V1.filter(
    (r) => r.consumerModule === input.consumerModule && r.featureId === input.featureId,
  );
}

export function getConsumerRequirementById(
  requirementId: string,
): VsiConsumerRequirementSpecV1 | undefined {
  return VSI_CONSUMER_REQUIREMENTS_V1.find((r) => r.requirementId === requirementId);
}
