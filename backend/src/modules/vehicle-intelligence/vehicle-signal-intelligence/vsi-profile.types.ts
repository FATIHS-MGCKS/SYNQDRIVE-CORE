import type { VsiCanonicalSignalKey } from './canonical-signal-keys';
import type {
  VsiEmpiricalObservationStatus,
  VsiEvidenceOrigin,
  VsiProviderCatalogStatus,
} from './vehicle-signal-evidence.contract';
import type { VsiSignalCadenceIntelligenceV2 } from './vsi-profile-cadence.types';

export const VSI_PROFILE_CONTRACT_VERSION = 'vsi-signal-profile-v2' as const;

/** Prior contract without per-signal quality fingerprint dimensions. */
export const VSI_PROFILE_CONTRACT_VERSION_V1 = 'vsi-signal-profile-v1' as const;

/** Canonical keys materialized in P0+P1 (P1 composer keys plus common DIMO telemetry). */
export const VSI_PROFILE_MATERIALIZATION_KEYS = [
  'lv_voltage',
  'hv_battery_soc',
  'provider_source_timestamp',
  'device_connectivity',
  'provider_last_successful_fetch',
  'vehicle_speed',
  'engine_rpm',
  'odometer',
  'fuel_level_relative',
  'diagnostic_trouble_code',
  'position_coordinates',
  'accelerator_pedal_position',
] as const satisfies readonly VsiCanonicalSignalKey[];

export type VsiProfileMaterializationKey = (typeof VSI_PROFILE_MATERIALIZATION_KEYS)[number];

export type VsiProfileDeclaredSupport =
  | 'LISTED'
  | 'NOT_LISTED'
  | 'UNKNOWN';

export type VsiProfileSignalSnapshotV1 = {
  canonicalSignalKey: VsiProfileMaterializationKey;
  providerNativeSignalName: string;
  declaredSupport: VsiProfileDeclaredSupport;
  empiricalObservation: VsiEmpiricalObservationStatus;
  lastValidObservationAt: string | null;
  lastSourceTimestamp: string | null;
  lastProviderFetchAt: string | null;
  lastProvenStrictSourceAdvanceAt: string | null;
  strictSourceAdvanced: boolean | 'UNKNOWN';
  freshnessClassification: 'FRESH' | 'STALE' | 'UNKNOWN';
  evidenceProvenance: VsiEvidenceOrigin[];
  limitations: string[];
  powertrainApplicability?: 'APPLICABLE' | 'NOT_APPLICABLE' | 'UNKNOWN';
};

export type VsiSignalQualityClassification =
  | 'OBSERVED_FRESH'
  | 'OBSERVED_STALE'
  | 'OBSERVED_INTERMITTENT'
  | 'NEVER_OBSERVED'
  | 'NOT_APPLICABLE'
  | 'INSUFFICIENT_HISTORY'
  | 'UNKNOWN';

export type VsiSignalConfidenceLevel = 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN';

export type VsiProfileSignalFingerprintV1 = VsiProfileSignalSnapshotV1 & {
  signalFingerprintContractVersion: 'vsi-signal-fingerprint-v1';
  qualityClassification: VsiSignalQualityClassification;
  confidenceLevel: VsiSignalConfidenceLevel;
  /** Count of usable bundle or signal samples; 0 when never observed. */
  observedSamples: number | null;
  /** Bundle-level strict source advances (per-signal only when provable). */
  provenSourceAdvances: number | null;
  observedCadenceMedianSeconds: number | null;
  observedCadenceSampleCount: number | null;
  maxStaleIntervalSeconds: number | null;
  /** Per-signal cadence dimension (V2); absent on legacy V1 snapshots. */
  cadenceIntelligence?: VsiSignalCadenceIntelligenceV2;
  contentFingerprint: string;
};

export type VsiProfileEvaluationDraft = {
  contractVersion: typeof VSI_PROFILE_CONTRACT_VERSION;
  organizationId: string;
  vehicleId: string;
  providerSourceLinkId: string;
  providerIdentity: string;
  verifiedModality: string | null;
  telemetrySourceFamily: string | null;
  evaluatedAt: Date;
  declaredCatalogCheckedAt: Date | null;
  lastMaterializedSourceTimestamp: Date | null;
  lastMaterializedProviderFetchAt: Date | null;
  lastProvenStrictSourceAdvanceAt: Date | null;
  signals: VsiProfileSignalSnapshotV1[];
  profileLimitations: string[];
};

export type VsiProfileBundleAdvanceFingerprint = {
  provenSourceAdvances: number;
  observedCadenceMedianSeconds: number | null;
  observedCadenceSampleCount: number;
  maxStaleIntervalSeconds: number | null;
};

export type VsiProfileEvaluationResult = Omit<VsiProfileEvaluationDraft, 'signals'> & {
  signals: VsiProfileSignalFingerprintV1[];
  /** Bundle-level provider source timestamp history (not projected to physical signals). */
  bundleAdvanceFingerprint?: VsiProfileBundleAdvanceFingerprint;
};

export function mapVsiCatalogToDeclaredSupport(
  catalog: VsiProviderCatalogStatus,
): VsiProfileDeclaredSupport {
  switch (catalog) {
    case 'LISTED':
      return 'LISTED';
    case 'NOT_LISTED':
      return 'NOT_LISTED';
    default:
      return 'UNKNOWN';
  }
}
