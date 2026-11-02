import type { TireConfidenceLevel, TireDisplayMode, TireStatus } from '../vehicle-intelligence/tires/tire-status';
import type {
  TirePressureFreshness,
  TirePressureSourceType,
} from '../vehicle-intelligence/tires/tire-pressure-context.types';
import type { HealthState } from './rental-health.types';

export type TireRentalReviewRequirement =
  | 'NONE'
  | 'MEASUREMENT_REQUIRED'
  | 'REVIEW_REQUIRED';

export type TireRentalBlockingAction = 'NONE' | 'HARD_BLOCK';

export type TireRentalReasonCode =
  | 'TREAD_MEASURED_BELOW_LEGAL_MIN'
  | 'TREAD_MEASURED_CRITICAL'
  | 'TREAD_ESTIMATED_CRITICAL_HIGH_CONF'
  | 'TREAD_ESTIMATED_CRITICAL_LOW_CONF'
  | 'TREAD_DEFAULT_ASSUMPTION'
  | 'TREAD_UNKNOWN'
  | 'TREAD_STALE'
  | 'PRESSURE_TPMS_CRITICAL'
  | 'PRESSURE_PROVIDER_CRITICAL'
  | 'PRESSURE_WARNING'
  | 'PRESSURE_STALE'
  | 'PRESSURE_UNKNOWN'
  | 'NO_TIRE_DATA'
  | 'DATA_STALE'
  | 'REVIEW_OVERRIDE_ACTIVE'
  | 'V3_VERIFICATION_INSUFFICIENT_EVIDENCE'
  | 'V3_VERIFICATION_OVERDUE'
  | 'V3_READ_UNAVAILABLE';

export type TireMeasurementFreshness = 'fresh' | 'aging' | 'stale' | 'no_data';

export interface TireWearEvidence {
  displayMode: TireDisplayMode;
  lowestTreadMm: number | null;
  lowestTreadPosition: string | null;
  overallWearStatus: TireStatus;
  measuredAt: string | null;
  freshness: TireMeasurementFreshness;
  isDefaultAssumption: boolean;
  confidence: TireConfidenceLevel;
}

export interface TirePressureEvidence {
  sourceType: TirePressureSourceType;
  sourceLabel: 'hm_oem' | 'dimo' | 'mixed' | 'tire_health';
  overallPressureStatus: string;
  tpmsWarning: boolean | null;
  freshness: TirePressureFreshness;
  lastUpdatedAt: string | null;
  perWheelIssue: boolean;
}

export interface TireSpecEvidence {
  pressureSpecSource: string;
  pressureSpecConfidence: number;
  wearFactorEligible: boolean;
  pressureSpecMissingLabel: string | null;
}

export interface TireRentalBlockingEvidence {
  action: TireRentalBlockingAction;
  reasonCode: TireRentalReasonCode;
  source: string;
  value: number | string | null;
  threshold: number | string | null;
  timestamp: string | null;
  setupId: string | null;
  message: string;
}

export interface TireRentalReviewOverrideSummary {
  id: string;
  reason: string;
  grantedByUserId: string;
  expiresAt: string;
  createdAt: string;
}

export interface TireRentalHealthReadModel {
  wearEvidence: TireWearEvidence;
  pressureEvidence: TirePressureEvidence;
  specEvidence: TireSpecEvidence;
  measurementFreshness: TireMeasurementFreshness;
  pressureFreshness: TirePressureFreshness;
  overallStatus: HealthState;
  confidence: TireConfidenceLevel;
  reviewRequirement: TireRentalReviewRequirement;
  rentalBlockingEvidence: TireRentalBlockingEvidence | null;
  structuredReasonCodes: TireRentalReasonCode[];
  activeReviewOverride: TireRentalReviewOverrideSummary | null;
  /** Human-readable module reason for RentalHealthModule.reason */
  primaryReason: string;
  /** Latest relevant signal timestamp (max of tread + pressure). */
  lastUpdatedAt: string | null;
  dataStale: boolean;
  source: string;
  evidenceType: 'measured' | 'estimated' | 'provider' | 'unknown';
}

export interface TireRentalHealthModuleHealth {
  state: HealthState;
  reason: string;
  last_updated_at: string | null;
  data_stale: boolean;
  source?: string;
  evidence_type?:
    | 'measured'
    | 'estimated'
    | 'provider'
    | 'manual'
    | 'document'
    | 'sensor'
    | 'complaint'
    | 'unknown';
  tire_read_model: TireRentalHealthReadModel;
}
