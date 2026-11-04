import { createHash } from 'crypto';
import { resolveTelemetrySourceFamily } from '../../telemetry-source-family';
import type { DiV0MotionCoreShadowPayloadV1 } from '../motion-core-shadow-worker/di-v0-motion-core-shadow.types';
import type { Ds4RpmHfV1aTripInputV1 } from '../rpm-hf-v1a/ds4-rpm-hf-v1a.contract';
import type { Ds4RpmHfV1bShadowResultV1 } from '../rpm-hf-v1b/ds4-rpm-hf-v1b.contract';
import { computeDs4RpmHfV1bTierAwareInputFingerprint } from '../rpm-hf-v1b/ds4-rpm-hf-v1b-input-fingerprint';
import { DS4_RPM_REAL_DATA_SOURCE_ELIGIBILITY_CONTRACT_VERSION } from './ds4-rpm-real-data-source-eligibility.contract.v1';
import type { Ds4RpmRealDataOfflineInputBundleV1 } from './ds4-rpm-real-data-replay.contract.v1';
import { DS4_RPM_REAL_DATA_REPLAY_EXECUTOR_CONTRACT_VERSION } from './ds4-rpm-real-data-replay.contract.v1';

export const DS4_RPM_REAL_DATA_OFFLINE_BUNDLE_INPUT_FINGERPRINT_VERSION =
  'ds4-rpm-real-data-offline-bundle-input-fingerprint-v2' as const;

/** Deterministic JSON-like serialization (sorted object keys). */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
}

function sha256Stable(value: unknown): string {
  return createHash('sha256').update(stableStringify(value)).digest('hex');
}

/**
 * Family-resolution evidence digest only — never embeds full rawJson in artifacts.
 * Uses resolved family + structural signals that affect {@link resolveTelemetrySourceFamily}.
 */
export function computeDs4RpmRealDataSourceFamilyIdentityDigestV1(rawJson: unknown): string {
  const resolved = resolveTelemetrySourceFamily(rawJson);
  let aftermarketSerialPrefix: string | null = null;
  let hasSyntheticDevice = false;
  let hasAftermarketDevice = false;
  if (rawJson != null && typeof rawJson === 'object' && !Array.isArray(rawJson)) {
    const o = rawJson as Record<string, unknown>;
    hasSyntheticDevice = o.syntheticDevice != null;
    hasAftermarketDevice = o.aftermarketDevice != null;
    const am = o.aftermarketDevice;
    if (am != null && typeof am === 'object' && !Array.isArray(am)) {
      const serial = (am as Record<string, unknown>).serial;
      if (typeof serial === 'string' && serial.length > 0) {
        aftermarketSerialPrefix = serial.slice(0, Math.min(8, serial.length));
      }
    }
  }
  return sha256Stable({
    resolvedTelemetrySourceFamily: resolved,
    hasSyntheticDevice,
    hasAftermarketDevice,
    aftermarketSerialPrefix,
    attestation: 'STRUCTURAL_DIMO_IDENTITY_SLICE_NOT_PRODUCTION_READ',
  });
}

function canonicalCanSpeedDigest(
  points: ReadonlyArray<{ recordedAtIso: string; valueKmh: number }>,
): string {
  const sorted = [...points].sort((a, b) => {
    const t = a.recordedAtIso.localeCompare(b.recordedAtIso);
    if (t !== 0) return t;
    return a.valueKmh - b.valueKmh;
  });
  const h = createHash('sha256');
  for (const p of sorted) {
    h.update(p.recordedAtIso);
    h.update('\0');
    h.update(String(p.valueKmh));
    h.update('\n');
  }
  return h.digest('hex');
}

function motionEvidenceDigest(payload: DiV0MotionCoreShadowPayloadV1): string {
  const speeds = [...payload.speeds]
    .map((s) => ({
      bucketLabelUtc: s.bucketLabelUtc,
      speedKmh: s.speedKmh,
      quality: s.quality,
      estimator: s.estimator,
      flags: [...(s.flags ?? [])].sort(),
    }))
    .sort((a, b) => a.bucketLabelUtc.localeCompare(b.bucketLabelUtc));

  const events = [...payload.events]
    .map((e) => ({
      kind: e.kind,
      startLabel: e.startLabel,
      endLabel: e.endLabel,
      startSpeedKmh: e.startSpeedKmh,
      endSpeedKmh: e.endSpeedKmh,
      deltaKmh: e.deltaKmh,
      quality: e.quality,
      flags: [...(e.flags ?? [])].sort(),
      intensity: e.intensity
        ? {
            meanAccelMps2: e.intensity.meanAccelMps2,
            durationS: e.intensity.durationS,
            steps: e.intensity.steps,
            coverageRatio: e.intensity.coverageRatio,
          }
        : null,
    }))
    .sort((a, b) => a.startLabel.localeCompare(b.startLabel));

  return sha256Stable({
    speedAuthority: payload.contract.speedAuthority,
    bundleAlgorithmVersion: payload.contract.algorithmVersions.bundle,
    eventsAlgorithmVersion: payload.contract.algorithmVersions.events,
    speeds,
    events,
    summary: payload.summary,
  });
}

function v1bAdmissionAndTierDigest(
  v1b: Ds4RpmHfV1bShadowResultV1 | null,
  tripAdmission: Ds4RpmHfV1aTripInputV1['admission'],
): string {
  return sha256Stable({
    tripAdmission: {
      processingAllowed: tripAdmission.processingAllowed,
      processingStatus: tripAdmission.processingStatus,
      reasonCode: tripAdmission.reasonCode,
      iceRpmApplicability: tripAdmission.iceRpmApplicability,
      tripRpmProfile: tripAdmission.tripRpmProfile,
    },
    v1b: v1b
      ? {
          contractVersion: v1b.contractVersion,
          engineVersion: v1b.engineVersion,
          processingOutcome: v1b.processingOutcome,
          inputFingerprint: v1b.inputFingerprint,
          admission: {
            processingAllowed: v1b.admission.processingAllowed,
            processingStatus: v1b.admission.processingStatus,
            reasonCode: v1b.admission.reasonCode,
            iceRpmApplicability: v1b.admission.iceRpmApplicability,
            qualityExposure: v1b.admission.qualityExposure,
          },
          tierEvidence: v1b.tierEvidence ?? null,
        }
      : null,
  });
}

export type Ds4RpmRealDataOfflineBundleInputFingerprintComponentsV1 = {
  fingerprintVersion: typeof DS4_RPM_REAL_DATA_OFFLINE_BUNDLE_INPUT_FINGERPRINT_VERSION;
  v1bTierAwareTripInputFingerprint: string;
  motionEvidenceDigest: string;
  canSpeedObservationDigest: string;
  sourceFamilyIdentityDigest: string;
  v1bAdmissionAndTierDigest: string;
};

export function computeDs4RpmRealDataOfflineBundleInputFingerprintComponentsV1(
  bundle: Ds4RpmRealDataOfflineInputBundleV1,
): Ds4RpmRealDataOfflineBundleInputFingerprintComponentsV1 {
  return {
    fingerprintVersion: DS4_RPM_REAL_DATA_OFFLINE_BUNDLE_INPUT_FINGERPRINT_VERSION,
    v1bTierAwareTripInputFingerprint: computeDs4RpmHfV1bTierAwareInputFingerprint(bundle.tripInput),
    motionEvidenceDigest: motionEvidenceDigest(bundle.motionPayload),
    canSpeedObservationDigest: canonicalCanSpeedDigest(bundle.canSpeedObservations),
    sourceFamilyIdentityDigest: computeDs4RpmRealDataSourceFamilyIdentityDigestV1(
      bundle.dimoVehicleRawJson,
    ),
    v1bAdmissionAndTierDigest: v1bAdmissionAndTierDigest(bundle.v1bResult, bundle.tripInput.admission),
  };
}

/**
 * Deterministic digest over all material offline bundle inputs consumed by replay.
 * Excludes replay-time clocks (`generatedAt`) and never emits rawJson in the digest output string.
 */
export function computeDs4RpmRealDataOfflineBundleInputFingerprintV1(
  bundle: Ds4RpmRealDataOfflineInputBundleV1,
): string {
  const components = computeDs4RpmRealDataOfflineBundleInputFingerprintComponentsV1(bundle);
  const payload = {
    fingerprintVersion: components.fingerprintVersion,
    executorContractVersion: DS4_RPM_REAL_DATA_REPLAY_EXECUTOR_CONTRACT_VERSION,
    eligibilityContractVersion: DS4_RPM_REAL_DATA_SOURCE_ELIGIBILITY_CONTRACT_VERSION,
    v1aContractVersion: bundle.tripInput.contractVersion,
    bundleId: bundle.bundleId,
    executionBoundary: bundle.executionBoundary,
    ownerAuthorizedProductionExecutionDeclared: bundle.ownerAuthorizedProductionExecutionDeclared,
    cohortVehicleLabel: bundle.cohortVehicleLabel,
    organizationId: bundle.organizationId,
    vehicleId: bundle.vehicleId,
    tripId: bundle.tripId,
    providerSourceLinkId: bundle.providerSourceLinkId,
    dimoQueryFromIso: bundle.dimoQueryFromIso,
    dimoQueryToIso: bundle.dimoQueryToIso,
    dimoBucketIntervalSeconds: bundle.dimoBucketIntervalSeconds,
    speedCoBucketedWithRpm: bundle.speedCoBucketedWithRpm,
    motionRunId: bundle.motionRunId,
    v1bRunId: bundle.v1bRunId,
    scenarioLabel: bundle.scenarioLabel,
    components,
  };
  return sha256Stable(payload);
}
