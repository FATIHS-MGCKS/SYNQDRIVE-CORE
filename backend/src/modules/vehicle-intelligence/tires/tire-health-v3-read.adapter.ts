import type { TireAlert } from './tire-health.service';
import type { TireStatus } from './tire-status';
import { classifyTreadStatus } from './tire-status';
import type {
  TireHealthV3CustomerReadModel,
  TireHealthV3WheelReadModel,
} from './tire-health-v3-read.types';
import type { TireWearV3PriorSetupResult } from './wear-v3-prior/tire-wear-v3-prior.types';
import { roundDisplayTreadInterval } from './wear-v3-prior/tire-wear-v3-prior.display';

/** Sentinel model version when authoritative V3 compute did not produce a prior result. */
export const TIRE_WEAR_V3_UNAVAILABLE_MODEL_VERSION = 'tire-wear-v3-read-unavailable';

export type TireHealthV3ReadUnavailableReason =
  | 'dependency_unavailable'
  | 'no_result'
  | 'compute_failed';

export function buildAuthoritativeV3UnavailableRead(
  reason: TireHealthV3ReadUnavailableReason,
): TireHealthV3CustomerReadModel {
  return {
    modelVersion: TIRE_WEAR_V3_UNAVAILABLE_MODEL_VERSION,
    computedAt: new Date().toISOString(),
    inputFingerprint: `unavailable:${reason}`,
    rated: false,
    setupFlags: [],
    verificationStatus: 'INSUFFICIENT_EVIDENCE',
    verificationQualityFlags: [`V3_READ_${reason.toUpperCase()}`],
    wheels: [],
    lowestTreadPosition: null,
    lowestTreadMm: null,
    insufficientEvidence: true,
  };
}

export function mapV3SetupToCustomerRead(
  result: TireWearV3PriorSetupResult,
): TireHealthV3CustomerReadModel {
  const wheelVerification = new Map(
    result.verification.wheels.map((w) => [w.position, w]),
  );

  const wheels: TireHealthV3WheelReadModel[] = result.wheels.map((w) => {
    const vState = wheelVerification.get(w.position);
    return {
      position: w.position,
      treadDepthMm:
        w.treadEvidenceClass === 'INSUFFICIENT' || w.displayTreadMm == null
          ? null
          : roundDisplayTreadInterval(w.displayTreadMm),
      pointEstimateTreadMm: w.pointEstimateTreadMm,
      treadEvidenceClass: w.treadEvidenceClass,
      remainingKm: w.remainingKm,
      replacementThresholdMm: w.replacementThresholdMm,
      evidenceLevel: w.evidenceLevel,
      uncertaintyFlags: w.flags,
      verificationStatus: vState?.verificationStatus ?? 'INSUFFICIENT_EVIDENCE',
      lastAcceptedMeasurementAt: vState?.lastAcceptedMeasurementAt ?? null,
      kmSinceAcceptedMeasurement: vState?.kmSinceAcceptedMeasurement ?? null,
      nextDueOdometerKm: vState?.nextDueOdometerKm ?? null,
      mountPeriodQualityFlags: vState?.qualityFlags ?? [],
    };
  });

  const ratedWheels = wheels.filter((w) => w.treadEvidenceClass !== 'INSUFFICIENT');
  let lowest: TireHealthV3WheelReadModel | null = null;
  for (const w of ratedWheels) {
    if (!w.treadDepthMm) continue;
    if (
      !lowest ||
      w.treadDepthMm.lo < (lowest.treadDepthMm?.lo ?? Number.POSITIVE_INFINITY)
    ) {
      lowest = w;
    }
  }

  const insufficientEvidence =
    result.verification.status === 'INSUFFICIENT_EVIDENCE' ||
    ratedWheels.length === 0;

  return {
    modelVersion: result.modelVersion,
    computedAt: result.computedAt,
    inputFingerprint: result.inputFingerprint,
    rated: result.rated,
    setupFlags: result.setupFlags,
    verificationStatus: result.verification.status,
    verificationQualityFlags: result.verification.qualityFlags,
    wheels,
    lowestTreadPosition: lowest?.position ?? null,
    lowestTreadMm: lowest?.treadDepthMm ?? null,
    insufficientEvidence,
  };
}

export function resolveV3OverallTreadStatus(
  read: TireHealthV3CustomerReadModel,
  tireSeason: string | null,
): TireStatus {
  if (read.insufficientEvidence || read.lowestTreadMm == null) {
    return 'UNKNOWN';
  }
  const point = read.lowestTreadMm.lo;
  return classifyTreadStatus(point, tireSeason);
}

export function buildV3VerificationAlerts(
  read: TireHealthV3CustomerReadModel,
  setupId: string,
): TireAlert[] {
  const alerts: TireAlert[] = [];
  const baseKey = `v3_verify:${setupId}`;

  if (read.verificationStatus === 'INSUFFICIENT_EVIDENCE') {
    alerts.push({
      type: 'verification',
      code: 'TIRE_V3_INSUFFICIENT_EVIDENCE',
      severity: 'warning',
      message: 'Manual tread verification required — insufficient evidence for wear estimate.',
      reasonCode: 'TIRE_V3_INSUFFICIENT_EVIDENCE',
      dedupeKey: `${baseKey}:insufficient`,
    });
    return alerts;
  }

  if (read.verificationStatus === 'OVERDUE') {
    alerts.push({
      type: 'verification',
      code: 'TIRE_V3_VERIFICATION_OVERDUE',
      severity: 'warning',
      message: 'Tread verification overdue.',
      reasonCode: 'TIRE_V3_VERIFICATION_OVERDUE',
      dedupeKey: `${baseKey}:overdue`,
    });
  } else if (read.verificationStatus === 'DUE') {
    alerts.push({
      type: 'verification',
      code: 'TIRE_V3_VERIFICATION_DUE',
      severity: 'info',
      message: 'Tread verification due.',
      reasonCode: 'TIRE_V3_VERIFICATION_DUE',
      dedupeKey: `${baseKey}:due`,
    });
  } else if (read.verificationStatus === 'DUE_SOON') {
    alerts.push({
      type: 'verification',
      code: 'TIRE_V3_VERIFICATION_DUE_SOON',
      severity: 'info',
      message: 'Tread verification due soon.',
      reasonCode: 'TIRE_V3_VERIFICATION_DUE_SOON',
      dedupeKey: `${baseKey}:due_soon`,
    });
  }

  return alerts;
}
