/**
 * Central tire rental-health / blocking policy.
 *
 * Consumed by RentalHealthService, Bookings gate (via rental_blocked), and
 * exposed on the API for UI — no parallel threshold logic elsewhere.
 */

import { TIRE_HEALTH_CONFIG } from '../vehicle-intelligence/tires/tire-health.config';
import type { TireHealthSummary } from '../vehicle-intelligence/tires/tire-health.service';
import type { TirePressureContext } from '../vehicle-intelligence/tires/tire-pressure-context.types';
import type { HealthState } from './rental-health.types';
import { isStale, toIso } from './rental-health.types';
import type {
  TireMeasurementFreshness,
  TireRentalBlockingEvidence,
  TireRentalHealthReadModel,
  TireRentalReasonCode,
  TireRentalReviewOverrideSummary,
  TireRentalReviewRequirement,
} from './tire-rental-health.types';

const LEGAL_MIN_MM = TIRE_HEALTH_CONFIG.legalMinTreadMm;

export interface TireRentalPolicyInput {
  summary: TireHealthSummary | null;
  activeReviewOverride?: TireRentalReviewOverrideSummary | null;
}

function emptyPressureContext(): TirePressureContext {
  return {
    frontLeft: null,
    frontRight: null,
    rearLeft: null,
    rearRight: null,
    wheels: {
      frontLeft: {
        value: null,
        normalizedUnit: 'BAR',
        sourceProvider: null,
        sourceTimestamp: null,
        freshness: 'no_data',
        plausibility: 'missing',
        statusToken: null,
        statusIssue: false,
      },
      frontRight: {
        value: null,
        normalizedUnit: 'BAR',
        sourceProvider: null,
        sourceTimestamp: null,
        freshness: 'no_data',
        plausibility: 'missing',
        statusToken: null,
        statusIssue: false,
      },
      rearLeft: {
        value: null,
        normalizedUnit: 'BAR',
        sourceProvider: null,
        sourceTimestamp: null,
        freshness: 'no_data',
        plausibility: 'missing',
        statusToken: null,
        statusIssue: false,
      },
      rearRight: {
        value: null,
        normalizedUnit: 'BAR',
        sourceProvider: null,
        sourceTimestamp: null,
        freshness: 'no_data',
        plausibility: 'missing',
        statusToken: null,
        statusIssue: false,
      },
    },
    normalizedUnit: 'BAR',
    sourceType: 'NONE',
    overallFreshness: 'no_data',
    coverage: {
      wheelsAvailable: 0,
      wheelsFresh: 0,
      wheelsUsableForWear: 0,
      coveragePercent: 0,
      periodStart: null,
      periodEnd: null,
      signalSpanMinutes: null,
      continuousExposureEligible: false,
      minWheelsRequired: 3,
      meetsWearThreshold: false,
    },
    tpmsWarning: null,
    tpmsWarningSource: null,
    recommendedPressure: {
      recommendedPressureFrontBar: null,
      recommendedPressureRearBar: null,
      recommendedPressureLoadedFrontBar: null,
      recommendedPressureLoadedRearBar: null,
      pressureSpecSource: 'UNKNOWN',
      pressureSpecConfirmedAt: null,
      pressureSpecConfidence: 0,
      wearFactorEligible: false,
      pressureSpecMissingLabel: 'Solldruck nicht hinterlegt',
    },
    pressureSpecMissingLabel: 'Solldruck nicht hinterlegt',
    qualityWarnings: [],
    wearEligibility: {
      eligible: false,
      reasons: [],
      confidencePenalty: 0,
      measurementHint: null,
    },
    overallStatus: 'UNKNOWN',
    source: 'NONE',
    dimoFreshness: 'no_data',
    hmFreshness: 'no_data',
    warningHints: [],
  };
}

export function resolveMeasurementFreshness(
  summary: TireHealthSummary | null,
): TireMeasurementFreshness {
  if (!summary?.lastMeasurementAt) return 'no_data';
  const age = summary.measurementAgeDays;
  if (age == null) return 'no_data';
  const { overdueDays, staleDays } = TIRE_HEALTH_CONFIG.measurementFreshness;
  if (age >= staleDays) return 'stale';
  if (age >= overdueDays) return 'aging';
  return 'fresh';
}

export function mapPressureSourceLabel(
  sourceType: TirePressureContext['sourceType'],
  tpmsWarningSource?: TirePressureContext['tpmsWarningSource'],
): 'hm_oem' | 'dimo' | 'mixed' | 'tire_health' {
  switch (sourceType) {
    case 'HIGH_MOBILITY':
      return 'hm_oem';
    case 'DIMO':
      return 'dimo';
    case 'MIXED':
      return 'mixed';
    default:
      if (tpmsWarningSource === 'DIMO') return 'dimo';
      if (tpmsWarningSource === 'HIGH_MOBILITY') return 'hm_oem';
      if (tpmsWarningSource === 'MIXED') return 'mixed';
      return 'tire_health';
  }
}

function resolvePressureLastUpdated(pressure: TirePressureContext): string | null {
  const timestamps = [
    pressure.coverage.periodEnd,
    ...Object.values(pressure.wheels).map((w) => w.sourceTimestamp),
  ].filter((v): v is string => v != null);
  if (timestamps.length === 0) return null;
  return timestamps.sort().at(-1) ?? null;
}

function isHighConfidenceEstimate(summary: TireHealthSummary): boolean {
  return (
    summary.confidence === 'HIGH' ||
    (summary.confidence === 'MEDIUM' && !summary.isDefaultAssumption)
  );
}

function isLowConfidenceEstimate(summary: TireHealthSummary): boolean {
  return (
    summary.isDefaultAssumption ||
    summary.confidence === 'LOW' ||
    summary.confidence === 'UNKNOWN'
  );
}

function hasDirectPressureCritical(
  pressure: TirePressureContext,
): { critical: boolean; reviewOnly: boolean } {
  if (pressure.tpmsWarning === true && pressure.overallStatus === 'ISSUE') {
    if (pressure.overallFreshness === 'stale') {
      return { critical: false, reviewOnly: true };
    }
    return { critical: true, reviewOnly: false };
  }

  if (pressure.overallFreshness === 'stale' || pressure.overallFreshness === 'no_data') {
    return { critical: false, reviewOnly: true };
  }

  const perWheelIssue = Object.values(pressure.wheels).some((w) => w.statusIssue);
  if (perWheelIssue && pressure.sourceType !== 'NONE') {
    return { critical: true, reviewOnly: false };
  }
  if (pressure.overallStatus === 'ISSUE') {
    return { critical: false, reviewOnly: true };
  }
  return { critical: false, reviewOnly: false };
}

function maxIso(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return Date.parse(a) >= Date.parse(b) ? a : b;
}

function mergeReviewRequirement(
  current: TireRentalReviewRequirement,
  next: TireRentalReviewRequirement,
): TireRentalReviewRequirement {
  if (current === 'REVIEW_REQUIRED' || next === 'REVIEW_REQUIRED') {
    return 'REVIEW_REQUIRED';
  }
  if (current === 'MEASUREMENT_REQUIRED' || next === 'MEASUREMENT_REQUIRED') {
    return 'MEASUREMENT_REQUIRED';
  }
  return 'NONE';
}

function healthStateRank(state: HealthState): number {
  switch (state) {
    case 'critical':
      return 4;
    case 'warning':
      return 3;
    case 'unknown':
      return 2;
    case 'good':
      return 1;
    default:
      return 0;
  }
}

function maxHealthState(a: HealthState, b: HealthState): HealthState {
  return healthStateRank(a) >= healthStateRank(b) ? a : b;
}

export function buildTireRentalHealthReadModel(
  input: TireRentalPolicyInput,
): TireRentalHealthReadModel {
  const summary = input.summary;
  const activeReviewOverride = input.activeReviewOverride ?? null;
  const reasonCodes: TireRentalReasonCode[] = [];
  let reviewRequirement: TireRentalReviewRequirement = 'NONE';
  let rentalBlockingEvidence: TireRentalBlockingEvidence | null = null;
  let wearState: HealthState = 'unknown';
  let pressureState: HealthState = 'n_a';
  let primaryReason = 'Keine Reifendaten verfügbar';

  const pressure = summary?.pressureContext ?? emptyPressureContext();
  const measurementFreshness = resolveMeasurementFreshness(summary);
  const pressureFreshness = pressure.overallFreshness;
  const pressureLastUpdated = resolvePressureLastUpdated(pressure);
  const perWheelIssue = Object.values(pressure.wheels).some((w) => w.statusIssue);

  const wearEvidence = {
    displayMode: summary?.displayMode ?? 'UNKNOWN',
    lowestTreadMm: summary?.lowestTreadMm ?? null,
    lowestTreadPosition: summary?.lowestTreadPosition ?? null,
    overallWearStatus: summary?.overallStatus ?? 'UNKNOWN',
    measuredAt: summary?.lastMeasurementAt ?? null,
    freshness: measurementFreshness,
    isDefaultAssumption: summary?.isDefaultAssumption ?? false,
    confidence: summary?.confidence ?? 'UNKNOWN',
  };

  const pressureEvidence = {
    sourceType: pressure.sourceType,
    sourceLabel: mapPressureSourceLabel(pressure.sourceType, pressure.tpmsWarningSource),
    overallPressureStatus: pressure.overallStatus,
    tpmsWarning: pressure.tpmsWarning,
    freshness: pressureFreshness,
    lastUpdatedAt: pressureLastUpdated,
    perWheelIssue,
  };

  const specEvidence = {
    pressureSpecSource: summary?.recommendedPressure?.pressureSpecSource ?? 'UNKNOWN',
    pressureSpecConfidence: summary?.recommendedPressure?.pressureSpecConfidence ?? 0,
    wearFactorEligible: summary?.recommendedPressure?.wearFactorEligible ?? false,
    pressureSpecMissingLabel: summary?.pressureSpecMissingLabel ?? null,
  };

  if (!summary) {
    reasonCodes.push('NO_TIRE_DATA');
    wearState = 'unknown';
    pressureState = 'unknown';
    primaryReason = 'Keine Reifendaten verfügbar';
  } else {
    // ── V3 verification (P2 cutover — distinguish overdue vs insufficient) ─
    const v3Verify = summary.wearV3?.verificationStatus;
    if (v3Verify === 'INSUFFICIENT_EVIDENCE') {
      reasonCodes.push('V3_VERIFICATION_INSUFFICIENT_EVIDENCE');
      wearState = 'unknown';
      reviewRequirement = mergeReviewRequirement(
        reviewRequirement,
        'MEASUREMENT_REQUIRED',
      );
      primaryReason =
        'Reifen-V3: unzureichende Nachweise — Profiltiefenmessung erforderlich';
    } else if (v3Verify === 'OVERDUE') {
      reasonCodes.push('V3_VERIFICATION_OVERDUE');
      wearState = 'warning';
      reviewRequirement = mergeReviewRequirement(reviewRequirement, 'REVIEW_REQUIRED');
      primaryReason = 'Reifen-V3: Verifikation überfällig — Messung vor Vermietung';
    }

    if (summary.wearReadModel === 'v3' && !summary.wearV3) {
      reasonCodes.push('V3_READ_UNAVAILABLE');
      wearState = 'unknown';
      reviewRequirement = mergeReviewRequirement(
        reviewRequirement,
        'MEASUREMENT_REQUIRED',
      );
      primaryReason =
        'Reifen-V3: Verschleißberechnung nicht verfügbar — Profiltiefenmessung erforderlich';
    }

    // ── Wear path ─────────────────────────────────────────────────────────
    if (summary.isDefaultAssumption) {
      reasonCodes.push('TREAD_DEFAULT_ASSUMPTION');
      wearState = 'unknown';
      reviewRequirement = mergeReviewRequirement(
        reviewRequirement,
        'MEASUREMENT_REQUIRED',
      );
      primaryReason = 'Reifenprofil basiert auf Standardannahme (8 mm) — Messung erforderlich';
    } else if (measurementFreshness === 'stale') {
      reasonCodes.push('TREAD_STALE');
      wearState = 'unknown';
      reviewRequirement = mergeReviewRequirement(reviewRequirement, 'REVIEW_REQUIRED');
      primaryReason = 'Reifenmessung veraltet — erneute Profiltiefenmessung erforderlich';
    } else if (
      summary.displayMode === 'MEASURED' &&
      summary.lowestTreadMm != null &&
      summary.lowestTreadMm <= LEGAL_MIN_MM
    ) {
      reasonCodes.push('TREAD_MEASURED_BELOW_LEGAL_MIN');
      wearState = 'critical';
      rentalBlockingEvidence = {
        action: 'HARD_BLOCK',
        reasonCode: 'TREAD_MEASURED_BELOW_LEGAL_MIN',
        source: 'tire_measurement',
        value: summary.lowestTreadMm,
        threshold: LEGAL_MIN_MM,
        timestamp: summary.lastMeasurementAt,
        setupId: summary.activeSetupId,
        message: `Gemessene Profiltiefe ${summary.lowestTreadMm.toFixed(1)} mm ≤ gesetzliches Minimum ${LEGAL_MIN_MM} mm`,
      };
      primaryReason = rentalBlockingEvidence.message;
    } else if (
      summary.displayMode === 'MEASURED' &&
      summary.overallStatus === 'CRITICAL'
    ) {
      reasonCodes.push('TREAD_MEASURED_CRITICAL');
      wearState = 'warning';
      reviewRequirement = mergeReviewRequirement(reviewRequirement, 'REVIEW_REQUIRED');
      primaryReason = `Gemessene Profiltiefe kritisch (${summary.lowestTreadMm?.toFixed(1) ?? '?'} mm) — Prüfung erforderlich`;
    } else if (
      summary.displayMode === 'ESTIMATED' &&
      summary.overallStatus === 'CRITICAL'
    ) {
      if (isHighConfidenceEstimate(summary)) {
        reasonCodes.push('TREAD_ESTIMATED_CRITICAL_HIGH_CONF');
        wearState = 'warning';
        reviewRequirement = mergeReviewRequirement(
          reviewRequirement,
          'REVIEW_REQUIRED',
        );
        primaryReason =
          'Geschätzte Profiltiefe kritisch — Messung vor Vermietung erforderlich';
      } else if (isLowConfidenceEstimate(summary)) {
        reasonCodes.push('TREAD_ESTIMATED_CRITICAL_LOW_CONF');
        wearState = 'warning';
        reviewRequirement = mergeReviewRequirement(
          reviewRequirement,
          'MEASUREMENT_REQUIRED',
        );
        primaryReason =
          'Geschätzte Profiltiefe kritisch (niedrige Confidence) — Messung erforderlich';
      } else {
        reasonCodes.push('TREAD_ESTIMATED_CRITICAL_HIGH_CONF');
        wearState = 'warning';
        reviewRequirement = mergeReviewRequirement(
          reviewRequirement,
          'MEASUREMENT_REQUIRED',
        );
        primaryReason =
          'Geschätzte Profiltiefe kritisch — Messung vor Vermietung erforderlich';
      }
    } else if (summary.overallStatus === 'UNKNOWN' || summary.displayMode === 'UNKNOWN') {
      reasonCodes.push('TREAD_UNKNOWN');
      wearState = 'unknown';
      reviewRequirement = mergeReviewRequirement(reviewRequirement, 'REVIEW_REQUIRED');
      primaryReason = 'Reifenstatus unbekannt — Prüfung erforderlich';
    } else if (summary.overallStatus === 'WARNING' || summary.overallStatus === 'WATCH') {
      wearState = 'warning';
      primaryReason =
        summary.overallStatus === 'WARNING'
          ? 'Reifenverschleiß Warnung'
          : 'Reifen beobachten';
    } else if (summary.overallStatus === 'GOOD') {
      const v3BlocksLegacyGoodClearance =
        summary.wearReadModel === 'v3' &&
        (!summary.wearV3 ||
          summary.wearV3.insufficientEvidence ||
          summary.wearV3.verificationStatus === 'INSUFFICIENT_EVIDENCE');
      if (!v3BlocksLegacyGoodClearance) {
        wearState = 'good';
        primaryReason = 'Reifen in Ordnung';
      }
    } else {
      wearState = 'unknown';
      reasonCodes.push('TREAD_UNKNOWN');
      primaryReason = 'Reifenstatus unbekannt';
    }

    // ── Pressure path ─────────────────────────────────────────────────────
    switch (pressure.overallStatus) {
      case 'OK':
        pressureState = 'good';
        break;
      case 'ISSUE': {
        const pressureCritical = hasDirectPressureCritical(pressure);
        if (pressureCritical.critical) {
          const code: TireRentalReasonCode = pressure.tpmsWarning
            ? 'PRESSURE_TPMS_CRITICAL'
            : 'PRESSURE_PROVIDER_CRITICAL';
          reasonCodes.push(code);
          pressureState = 'critical';
          if (!rentalBlockingEvidence) {
            rentalBlockingEvidence = {
              action: 'HARD_BLOCK',
              reasonCode: code,
              source: mapPressureSourceLabel(pressure.sourceType, pressure.tpmsWarningSource),
              value: pressure.tpmsWarning === true ? 'TPMS_WARNING' : 'WHEEL_STATUS_ISSUE',
              threshold: null,
              timestamp: pressureLastUpdated,
              setupId: summary.activeSetupId,
              message:
                pressure.tpmsWarning === true
                  ? 'TPMS-Warnung aktiv'
                  : 'Kritische Reifendruck-Evidenz vom Fahrzeug',
            };
          }
        } else {
          reasonCodes.push('PRESSURE_WARNING');
          pressureState = 'warning';
          reviewRequirement = mergeReviewRequirement(
            reviewRequirement,
            pressureCritical.reviewOnly ? 'REVIEW_REQUIRED' : 'NONE',
          );
        }
        break;
      }
      case 'STALE':
        reasonCodes.push('PRESSURE_STALE');
        pressureState = 'unknown';
        reviewRequirement = mergeReviewRequirement(reviewRequirement, 'REVIEW_REQUIRED');
        break;
      case 'UNKNOWN':
      default:
        if (pressure.sourceType === 'NONE') {
          pressureState = 'n_a';
        } else {
          reasonCodes.push('PRESSURE_UNKNOWN');
          pressureState = 'unknown';
          reviewRequirement = mergeReviewRequirement(reviewRequirement, 'REVIEW_REQUIRED');
        }
        break;
    }

    const criticalTpmsAlert = summary.alerts.some(
      (a) =>
        a.severity === 'critical' &&
        (a.type === 'PRESSURE_IMPACT' ||
          String(a.code ?? '') === 'TIRE_PRESSURE_ISSUE'),
    );
    if (criticalTpmsAlert && pressureFreshness !== 'stale') {
      reasonCodes.push('PRESSURE_TPMS_CRITICAL');
      pressureState = 'critical';
      if (!rentalBlockingEvidence) {
        rentalBlockingEvidence = {
          action: 'HARD_BLOCK',
          reasonCode: 'PRESSURE_TPMS_CRITICAL',
          source: mapPressureSourceLabel(pressure.sourceType, pressure.tpmsWarningSource),
          value: 'CRITICAL_ALERT',
          threshold: null,
          timestamp: pressureLastUpdated,
          setupId: summary.activeSetupId,
          message: 'Kritische Reifendruck-Warnung',
        };
      }
    }
  }

  if (
    measurementFreshness === 'stale' &&
    pressureFreshness === 'stale' &&
    !rentalBlockingEvidence
  ) {
    reasonCodes.push('DATA_STALE');
    reviewRequirement = mergeReviewRequirement(reviewRequirement, 'REVIEW_REQUIRED');
  }

  let overallStatus = maxHealthState(wearState, pressureState === 'n_a' ? 'unknown' : pressureState);
  if (pressureState === 'n_a' && wearState === 'good' && summary && !summary.isDefaultAssumption) {
    overallStatus = wearState;
  } else if (pressureState === 'n_a') {
    overallStatus = maxHealthState(wearState, 'unknown');
  } else {
    overallStatus = maxHealthState(wearState, pressureState);
  }

  // Unknown must never present as good.
  if (
    overallStatus === 'good' &&
    (measurementFreshness === 'no_data' ||
      measurementFreshness === 'stale' ||
      summary?.isDefaultAssumption ||
      summary?.displayMode === 'UNKNOWN' ||
      summary?.overallStatus === 'UNKNOWN')
  ) {
    overallStatus = 'unknown';
  }

  if (pressureState === 'unknown' && wearState === 'good') {
    overallStatus = 'unknown';
  }

  if (overallStatus !== wearState && rentalBlockingEvidence?.action !== 'HARD_BLOCK') {
    if (pressureState === 'critical' || pressureState === 'warning') {
      primaryReason =
        rentalBlockingEvidence?.message ??
        (pressureState === 'critical'
          ? 'Kritische Reifendruck-Evidenz'
          : 'Reifendruck auffällig');
    }
  }

  if (activeReviewOverride) {
    reasonCodes.push('REVIEW_OVERRIDE_ACTIVE');
    if (rentalBlockingEvidence?.action === 'HARD_BLOCK') {
      rentalBlockingEvidence = null;
      if (overallStatus === 'critical') {
        overallStatus = 'warning';
      }
      primaryReason = `Manuelle Freigabe bis ${new Date(activeReviewOverride.expiresAt).toLocaleDateString('de-DE')} — ${activeReviewOverride.reason}`;
    }
  }

  const treadTs = summary?.lastMeasurementAt ?? null;
  const lastUpdatedAt = toIso(maxIso(treadTs, pressureLastUpdated));
  const dataStale =
    isStale(treadTs) && (pressure.sourceType === 'NONE' || isStale(pressureLastUpdated));

  const evidenceType =
    summary?.displayMode === 'MEASURED'
      ? 'measured'
      : summary?.displayMode === 'ESTIMATED'
        ? 'estimated'
        : pressure.sourceType !== 'NONE'
          ? 'provider'
          : 'unknown';

  const source =
    pressure.sourceType === 'NONE'
      ? mapPressureSourceLabel(pressure.sourceType, pressure.tpmsWarningSource)
      : mapPressureSourceLabel(pressure.sourceType, pressure.tpmsWarningSource);

  return {
    wearEvidence,
    pressureEvidence,
    specEvidence,
    measurementFreshness,
    pressureFreshness,
    overallStatus,
    confidence: summary?.confidence ?? 'UNKNOWN',
    reviewRequirement,
    rentalBlockingEvidence,
    structuredReasonCodes: [...new Set(reasonCodes)],
    activeReviewOverride,
    primaryReason,
    lastUpdatedAt,
    dataStale,
    source,
    evidenceType,
  };
}

export function isTireRentalHardBlocked(readModel: TireRentalHealthReadModel): boolean {
  return (
    readModel.rentalBlockingEvidence?.action === 'HARD_BLOCK' &&
    readModel.activeReviewOverride == null
  );
}

export function buildTireModuleHealth(
  input: TireRentalPolicyInput,
): import('./tire-rental-health.types').TireRentalHealthModuleHealth {
  const readModel = buildTireRentalHealthReadModel(input);
  return {
    state: readModel.overallStatus,
    reason: readModel.primaryReason,
    last_updated_at: readModel.lastUpdatedAt,
    data_stale: readModel.dataStale,
    source: readModel.source,
    evidence_type: readModel.evidenceType,
    tire_read_model: readModel,
  };
}
