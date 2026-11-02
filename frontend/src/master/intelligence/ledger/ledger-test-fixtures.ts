import type { MasterVsiProfileDetailDto, MasterVsiSignalDetailDto } from '../vsi-master-intelligence-api.types';

/** Production-shaped Audi A4 engine_rpm excerpt (P0-a / dual-provenance tests). */
export const AUDI_ENGINE_RPM_SIGNAL: MasterVsiSignalDetailDto = {
  canonicalSignalKey: 'engine_rpm',
  providerNativeSignalName: 'powertrainCombustionEngineSpeed',
  declaredSupport: 'LISTED',
  empiricalObservation: 'NEVER_OBSERVED',
  qualityClassification: 'NEVER_OBSERVED',
  confidenceLevel: 'LOW',
  lastValidObservationAt: null,
  lastSourceTimestamp: null,
  lastProviderFetchAt: '2026-10-29T22:21:14.621Z',
  freshnessClassification: 'UNKNOWN',
  evidenceProvenance: ['VEHICLE_LATEST_STATE'],
  limitations: ['ICE_RPM_SNAPSHOT_ONLY_NOT_HISTORICAL_CADENCE'],
  powertrainApplicability: 'APPLICABLE',
  rpmCombinedEvidenceAvailabilityV1: 'PROVEN_HISTORICAL_ONLY',
  rpmCombinedEvidenceLimitationsV1: [],
  cadenceIntelligence: {
    provenance: ['CLICKHOUSE_TELEMETRY_HF_POINTS', 'CLICKHOUSE_TELEMETRY_HF_POINTS'],
    observedSampleCount: 2281,
  },
};

export const BEV_NOT_APPLICABLE_SIGNAL: MasterVsiSignalDetailDto = {
  canonicalSignalKey: 'engine_rpm',
  providerNativeSignalName: 'powertrainCombustionEngineSpeed',
  declaredSupport: 'NOT_LISTED',
  empiricalObservation: 'NOT_APPLICABLE',
  qualityClassification: null,
  confidenceLevel: null,
  lastValidObservationAt: null,
  lastSourceTimestamp: null,
  lastProviderFetchAt: '2026-10-29T22:21:14.621Z',
  freshnessClassification: null,
  evidenceProvenance: [],
  limitations: [],
  powertrainApplicability: 'NOT_APPLICABLE',
  rpmCombinedEvidenceAvailabilityV1: 'NOT_APPLICABLE',
  cadenceIntelligence: null,
};

export const UNKNOWN_APPLICABILITY_SIGNAL: MasterVsiSignalDetailDto = {
  canonicalSignalKey: 'lv_voltage',
  providerNativeSignalName: 'lowVoltageBatteryVoltage',
  declaredSupport: 'UNKNOWN',
  empiricalObservation: 'NEVER_OBSERVED',
  qualityClassification: 'UNKNOWN',
  confidenceLevel: null,
  lastValidObservationAt: null,
  lastSourceTimestamp: null,
  lastProviderFetchAt: null,
  freshnessClassification: 'UNKNOWN',
  evidenceProvenance: [],
  limitations: [],
  powertrainApplicability: 'UNKNOWN',
  cadenceIntelligence: null,
};

export const STALE_OBSERVATION_SIGNAL: MasterVsiSignalDetailDto = {
  canonicalSignalKey: 'vehicle_speed',
  providerNativeSignalName: 'speed',
  declaredSupport: 'LISTED',
  empiricalObservation: 'OBSERVED_STALE',
  qualityClassification: 'STALE_META',
  confidenceLevel: 'MEDIUM',
  lastValidObservationAt: '2026-09-01T12:00:00.000Z',
  lastSourceTimestamp: '2026-09-01T12:00:00.000Z',
  lastProviderFetchAt: '2026-10-29T22:21:14.621Z',
  freshnessClassification: 'STALE',
  evidenceProvenance: ['VEHICLE_LATEST_STATE'],
  limitations: [],
  powertrainApplicability: 'APPLICABLE',
  cadenceIntelligence: null,
};

export const ATTRIBUTION_LIMITED_RPM: MasterVsiSignalDetailDto = {
  ...AUDI_ENGINE_RPM_SIGNAL,
  rpmCombinedEvidenceAvailabilityV1: 'NOT_PROVEN',
  rpmCombinedEvidenceLimitationsV1: ['RPM_HF_SOURCE_LINK_ATTRIBUTION_UNPROVEN'],
};

/** Tiguan-shaped engine_rpm with RPM_1HZ and PROVEN_HISTORICAL_ONLY. */
export const TIGUAN_ENGINE_RPM_SIGNAL: MasterVsiSignalDetailDto = {
  ...AUDI_ENGINE_RPM_SIGNAL,
  empiricalObservation: 'NEVER_OBSERVED',
  rpmCombinedEvidenceAvailabilityV1: 'PROVEN_HISTORICAL_ONLY',
  cadenceIntelligence: {
    contractVersion: 'vsi-signal-cadence-v2',
    provenance: ['CLICKHOUSE_TELEMETRY_HF_POINTS'],
    observedSampleCount: 4120,
    observedDensityLabel: 'ONE_SECOND_BUCKETS_UNPROVEN',
    activeRpmProfile: {
      activeProfile: 'RPM_1HZ',
      classificationDecisionCode: 'RPM_1HZ_QUALIFYING',
    },
    regimes: [
      { kind: 'POLL_BOUND_ACTIVE', sampleCount: 900, confidence: 'HIGH' },
    ],
  },
};

/** Arteon/Audi RPM_STANDARD with live-compatible snapshot observation. */
export const ARTEON_ENGINE_RPM_SIGNAL: MasterVsiSignalDetailDto = {
  ...AUDI_ENGINE_RPM_SIGNAL,
  empiricalObservation: 'OBSERVED',
  freshnessClassification: 'FRESH',
  qualityClassification: 'STALE_META',
  confidenceLevel: 'HIGH',
  lastValidObservationAt: '2026-10-29T17:32:37.000Z',
  lastSourceTimestamp: '2026-10-29T17:32:37.000Z',
  rpmCombinedEvidenceAvailabilityV1: 'PROVEN_LIVE',
  cadenceIntelligence: {
    contractVersion: 'vsi-signal-cadence-v2',
    provenance: ['CLICKHOUSE_TELEMETRY_HF_POINTS'],
    observedSampleCount: 1200,
    activeRpmProfile: { activeProfile: 'RPM_STANDARD' },
    tierResolution: {
      tier: 'RPM_STANDARD',
      decisionCode: 'TIER_RESOLVED',
      provenance: ['CLICKHOUSE_TELEMETRY_HF_POINTS'],
    },
  },
};

export const MALFORMED_CADENCE_SIGNAL: MasterVsiSignalDetailDto = {
  ...UNKNOWN_APPLICABILITY_SIGNAL,
  canonicalSignalKey: 'engine_rpm',
  cadenceIntelligence: {
    provenance: 'not-an-array',
    regimes: [{ sampleCount: 'bad' }],
  } as unknown as Record<string, unknown>,
};

export const LV_WITH_CADENCE_SIGNAL: MasterVsiSignalDetailDto = {
  ...UNKNOWN_APPLICABILITY_SIGNAL,
  empiricalObservation: 'OBSERVED',
  cadenceIntelligence: {
    provenance: ['CLICKHOUSE_TELEMETRY_LV'],
    observedSampleCount: 44,
    lvStandbyTransmissionProfile: {
      profile: 'LV_8H_OBSERVED',
      classificationDecisionCode: 'LV_8H',
      evidenceConfidence: 'HIGH',
      limitations: [],
    },
  },
};

export function buildTestProfileDetail(
  signals: MasterVsiSignalDetailDto[],
  overrides: Partial<MasterVsiProfileDetailDto> = {},
): MasterVsiProfileDetailDto {
  return {
    providerSourceLinkId: 'link-test',
    providerIdentity: 'dimo:test',
    provider: 'DIMO',
    profileRevision: 7,
    profileContractVersion: 'vsi-signal-profile-v2',
    evaluatedAt: '2026-10-29T22:21:14.704Z',
    lastMaterializedSourceTimestamp: '2026-10-29T17:32:37.000Z',
    lastMaterializedProviderFetchAt: '2026-10-29T22:21:14.621Z',
    profileLimitations: [],
    lvStandbyProfile: 'LV_8H_OBSERVED',
    lvClassificationDecisionCode: 'LV_8H',
    lvEvidenceConfidence: 'HIGH',
    rpmActiveProfile: 'RPM_STANDARD',
    rpmApplicability: 'APPLICABLE',
    rpmClassificationDecisionCode: 'RPM_STANDARD',
    observedDensityLabel: 'SUB_ONE_HZ',
    evaluationBlocked: false,
    evaluationBlockedCodes: [],
    contentFingerprintPrefix: 'abc12345',
    fetchTimeIsNotNewSignalProof: true,
    signals,
    ...overrides,
  };
}
