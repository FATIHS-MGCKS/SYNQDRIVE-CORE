import { createHash } from 'crypto';
import type { Ds4RpmRealDataOfflineInputBundleV1 } from './ds4-rpm-real-data-replay.contract.v1';

function stableStringify(value: unknown): string {
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

/** Deterministic digest over binding fields and canonical trip RPM points (no motion payload hash). */
export function computeDs4RpmRealDataOfflineBundleInputFingerprintV1(
  bundle: Ds4RpmRealDataOfflineInputBundleV1,
): string {
  const payload = {
    bundleId: bundle.bundleId,
    organizationId: bundle.organizationId,
    vehicleId: bundle.vehicleId,
    tripId: bundle.tripId,
    providerSourceLinkId: bundle.providerSourceLinkId,
    dimoQueryFromIso: bundle.dimoQueryFromIso,
    dimoQueryToIso: bundle.dimoQueryToIso,
    dimoBucketIntervalSeconds: bundle.dimoBucketIntervalSeconds,
    motionRunId: bundle.motionRunId,
    v1bRunId: bundle.v1bRunId,
    rpmPoints: bundle.tripInput.rpmPoints.map((p) => ({
      recordedAtIso: p.recordedAtIso,
      valueRpm: p.valueRpm,
    })),
    motionEventKeys: bundle.motionPayload.events.map((e) => ({
      kind: e.kind,
      startLabel: e.startLabel,
      endLabel: e.endLabel,
    })),
  };
  return createHash('sha256').update(stableStringify(payload)).digest('hex');
}
