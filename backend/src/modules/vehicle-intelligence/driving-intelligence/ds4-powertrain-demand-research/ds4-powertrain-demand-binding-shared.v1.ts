import { createHash } from 'crypto';
import { resolveTelemetrySourceFamily } from '../../telemetry-source-family';
import { DI_V0_R1_OBD_EVIDENCE_SNAPSHOT_V0_3 } from '../r1-obd-acquisition/di-v0-r1-obd-acquisition.versions';
import {
  computeDs4RpmHfV1bInputFingerprint,
  computeDs4RpmHfV1bTierAwareInputFingerprint,
} from '../rpm-hf-v1b/ds4-rpm-hf-v1b-input-fingerprint';
import { DS4_RPM_HF_V1B_ENGINE_VERSION_TIER_AWARE } from '../rpm-hf-v1b/ds4-rpm-hf-v1b.contract';
import type {
  Ds4MultichannelBucketObservationV1,
  Ds4MultichannelSourceManifestV1,
  Ds4PowertrainDemandBindingAbstainReason,
  Ds4PowertrainDemandResearchInputV1,
} from './ds4-powertrain-demand-research.contract.v1';
import {
  DS4_KICKDOWN_BUCKET_GRID_RESEARCH_POLICY_VERSION,
  DS4_MULTICHANNEL_MANIFEST_VERSION,
  DS4_POWERTRAIN_DEMAND_RESEARCH_CONTRACT_VERSION,
  DS4_R1_MULTICHANNEL_CHANNEL_IDS,
} from './ds4-powertrain-demand-research.contract.v1';
import {
  canonicalizeMultichannelObservations,
  verifyMultichannelRpmParityWithV1a,
} from './ds4-powertrain-demand-multichannel-canonicalize.v1';

export function fingerprintsMatch(input: Ds4PowertrainDemandResearchInputV1): {
  ok: boolean;
  expected: string;
} {
  const tierAware = input.v1bResult?.engineVersion === DS4_RPM_HF_V1B_ENGINE_VERSION_TIER_AWARE;
  const expected = tierAware
    ? computeDs4RpmHfV1bTierAwareInputFingerprint(input.tripInput)
    : computeDs4RpmHfV1bInputFingerprint(input.tripInput);
  const actual = input.v1bResult?.inputFingerprint ?? '';
  return { ok: actual === expected, expected };
}

export function computeMultichannelContentFingerprint(input: {
  organizationId: string;
  vehicleId: string;
  tripId: string;
  providerSourceLinkId: string;
  telemetrySourceFamily: string;
  observations: readonly Ds4MultichannelBucketObservationV1[];
}): string {
  const canon = canonicalizeMultichannelObservations(input.observations);
  const channelPresence = {
    speed: canon.buckets.some((b) => b.speedKmh != null),
    rpm: canon.buckets.some((b) => b.rpm != null),
    throttle: canon.buckets.some((b) => b.throttlePct != null),
    load: canon.buckets.some((b) => b.loadPct != null),
    coolant: canon.buckets.some((b) => b.coolantC != null),
  };
  const payload = {
    contractVersion: DS4_POWERTRAIN_DEMAND_RESEARCH_CONTRACT_VERSION,
    policyVersion: DS4_KICKDOWN_BUCKET_GRID_RESEARCH_POLICY_VERSION,
    organizationId: input.organizationId,
    vehicleId: input.vehicleId,
    tripId: input.tripId,
    providerSourceLinkId: input.providerSourceLinkId,
    telemetrySourceFamily: input.telemetrySourceFamily,
    channelNames: [...DS4_R1_MULTICHANNEL_CHANNEL_IDS],
    channelPresence,
    buckets: canon.buckets.map((b) => ({
      ms: b.recordedAtMs,
      speedKmh: b.speedKmh,
      rpm: b.rpm,
      throttlePct: b.throttlePct,
      loadPct: b.loadPct,
      coolantC: b.coolantC,
    })),
  };
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

export function buildManifestChannelExpectations(
  canon: ReturnType<typeof canonicalizeMultichannelObservations>,
): Ds4MultichannelSourceManifestV1['channels'] {
  const n = canon.buckets.length;
  const count = (pred: (b: (typeof canon.buckets)[0]) => boolean) =>
    canon.buckets.filter(pred).length;
  const mk = (
    channelId: (typeof DS4_R1_MULTICHANNEL_CHANNEL_IDS)[number],
    pred: (b: (typeof canon.buckets)[0]) => boolean,
  ) => {
    const observed = count(pred);
    return {
      channelId,
      present: observed > 0,
      observedBucketCount: observed,
      completenessRatio: n > 0 ? observed / n : null,
    };
  };
  return [
    mk('speed', (b) => b.speedKmh != null),
    mk('powertrainCombustionEngineSpeed', (b) => b.rpm != null),
    mk('obdThrottlePosition', (b) => b.throttlePct != null),
    mk('obdEngineLoad', (b) => b.loadPct != null),
    mk('powertrainCombustionEngineECT', (b) => b.coolantC != null),
  ];
}

export function validateMultichannelManifest(input: {
  manifest: Ds4MultichannelSourceManifestV1;
  researchInput: Ds4PowertrainDemandResearchInputV1;
  family: ReturnType<typeof resolveTelemetrySourceFamily>;
  expectedMcFp: string;
  canon: ReturnType<typeof canonicalizeMultichannelObservations>;
  reasonCodes: Ds4PowertrainDemandBindingAbstainReason[];
}): void {
  const { manifest: m, reasonCodes } = input;
  if (m.manifestVersion !== DS4_MULTICHANNEL_MANIFEST_VERSION) {
    reasonCodes.push('MANIFEST_VERSION_INVALID');
  }
  if (
    m.organizationId !== input.researchInput.organizationId ||
    m.vehicleId !== input.researchInput.vehicleId ||
    m.tripId !== input.researchInput.tripId ||
    m.providerSourceLinkId !== input.researchInput.providerSourceLinkId
  ) {
    reasonCodes.push('MULTICHANNEL_MANIFEST_MISMATCH');
  }
  if (m.telemetrySourceFamily !== input.family) {
    reasonCodes.push('MANIFEST_SOURCE_FAMILY_MISMATCH');
  }
  if (m.expectedMultichannelFingerprint !== input.expectedMcFp) {
    reasonCodes.push('MULTICHANNEL_MANIFEST_TAMPERED');
  }
  if (m.independentFieldValidation === true) {
    reasonCodes.push('FORGED_INDEPENDENT_ATTESTATION');
  }
  if (input.family === 'RUPTELA_R1' && m.r1SnapshotVersion !== DI_V0_R1_OBD_EVIDENCE_SNAPSHOT_V0_3) {
    reasonCodes.push('MANIFEST_R1_SNAPSHOT_MISMATCH');
  }

  const allowed = new Set<string>(DS4_R1_MULTICHANNEL_CHANNEL_IDS);
  for (const ch of m.channels) {
    if (!allowed.has(ch.channelId)) {
      reasonCodes.push('MANIFEST_CHANNEL_MISMATCH');
      break;
    }
  }

  const expectedChannels = buildManifestChannelExpectations(input.canon);
  if (m.channels.length !== expectedChannels.length) {
    reasonCodes.push('MANIFEST_CHANNEL_MISMATCH');
  } else {
    for (let i = 0; i < expectedChannels.length; i += 1) {
      const exp = expectedChannels[i]!;
      const act = m.channels[i]!;
      if (
        exp.channelId !== act.channelId ||
        exp.present !== act.present ||
        exp.observedBucketCount !== act.observedBucketCount
      ) {
        reasonCodes.push('MANIFEST_CHANNEL_MISMATCH');
        break;
      }
    }
  }
}

export function validatePowertrainIdentityAndTrip(
  input: Ds4PowertrainDemandResearchInputV1,
  reasonCodes: Ds4PowertrainDemandBindingAbstainReason[],
): { tripStartMs: number; tripEndMs: number } | null {
  const { tripInput } = input;
  if (input.organizationId !== tripInput.organizationId) {
    reasonCodes.push('ORGANIZATION_ID_MISMATCH');
  }
  if (input.vehicleId !== tripInput.vehicleId) reasonCodes.push('VEHICLE_ID_MISMATCH');
  if (input.tripId !== tripInput.tripId) reasonCodes.push('TRIP_ID_MISMATCH');
  if (input.providerSourceLinkId !== tripInput.providerSourceLinkId) {
    reasonCodes.push('PROVIDER_SOURCE_LINK_MISMATCH');
  }
  if (!input.providerSourceLinkId || !tripInput.providerSourceLinkId) {
    reasonCodes.push('PROVIDER_SOURCE_LINK_NULL');
  }

  const tripStartMs = Date.parse(tripInput.tripStartIso);
  const tripEndMs = Date.parse(tripInput.tripEndIso);
  if (!Number.isFinite(tripStartMs) || !Number.isFinite(tripEndMs) || tripEndMs < tripStartMs) {
    reasonCodes.push('INVALID_TRIP_BOUNDS');
    return null;
  }

  if (tripInput.clickHouseRead.tenantScopeViolation) reasonCodes.push('TENANT_SCOPE_VIOLATION');
  if (tripInput.dataQuality.completenessLabel !== 'COMPLETE') {
    reasonCodes.push('HF_READ_INCOMPLETE');
  }

  for (const row of input.multichannelObservations) {
    if (row.providerSourceLinkId != null && row.providerSourceLinkId !== input.providerSourceLinkId) {
      reasonCodes.push('MIXED_SOURCE_OBSERVATION');
      break;
    }
    if (row.tripId != null && row.tripId !== input.tripId) {
      reasonCodes.push('MIXED_SOURCE_OBSERVATION');
      break;
    }
  }

  return { tripStartMs, tripEndMs };
}

export function validateCanonicalMultichannelGrid(
  input: Ds4PowertrainDemandResearchInputV1,
  tripStartMs: number,
  tripEndMs: number,
  reasonCodes: Ds4PowertrainDemandBindingAbstainReason[],
): ReturnType<typeof canonicalizeMultichannelObservations> {
  const canon = canonicalizeMultichannelObservations(input.multichannelObservations);
  if (canon.invalidTimestampOrValueCount > 0) reasonCodes.push('INVALID_TIMESTAMP_OR_VALUE');
  if (canon.r1ForbiddenFieldCount > 0) reasonCodes.push('R1_FORBIDDEN_CHANNEL_POPULATED');
  if (canon.hasConflictingDuplicates) reasonCodes.push('CONFLICTING_DUPLICATE_BUCKETS');
  if (canon.invalidSignalDomainCount > 0) reasonCodes.push('INVALID_SIGNAL_DOMAIN');

  if (Number.isFinite(tripStartMs) && Number.isFinite(tripEndMs)) {
    for (const b of canon.buckets) {
      if (b.recordedAtMs < tripStartMs || b.recordedAtMs > tripEndMs) {
        reasonCodes.push('MULTICHANNEL_OUT_OF_TRIP_WINDOW');
        break;
      }
    }
  }
  return canon;
}

export function validateConditionalRpmV1aParity(
  input: Ds4PowertrainDemandResearchInputV1,
  canon: ReturnType<typeof canonicalizeMultichannelObservations>,
  reasonCodes: Ds4PowertrainDemandBindingAbstainReason[],
): boolean {
  const multichannelHasRpm = canon.buckets.some((b) => b.rpm != null);
  if (!multichannelHasRpm) {
    return false;
  }

  const parity = verifyMultichannelRpmParityWithV1a({
    buckets: canon.buckets,
    rpmPoints: input.tripInput.rpmPoints,
  });
  if (!parity.ok) reasonCodes.push(parity.reason);

  const bucketByEpoch = new Map(canon.buckets.map((b) => [b.recordedAtMs, b]));
  for (const p of input.tripInput.rpmPoints) {
    const ms = Date.parse(p.recordedAtIso);
    if (!Number.isFinite(ms)) continue;
    const bucket = bucketByEpoch.get(ms);
    if (bucket != null && bucket.rpm == null) {
      reasonCodes.push('RPM_V1A_UNMATCHED_LABEL');
      break;
    }
  }
  return true;
}

export function validateMultichannelFingerprint(
  input: Ds4PowertrainDemandResearchInputV1,
  family: ReturnType<typeof resolveTelemetrySourceFamily>,
  reasonCodes: Ds4PowertrainDemandBindingAbstainReason[],
): string {
  const familyStr = family ?? 'UNKNOWN';
  const expectedMcFp = computeMultichannelContentFingerprint({
    organizationId: input.organizationId,
    vehicleId: input.vehicleId,
    tripId: input.tripId,
    providerSourceLinkId: input.providerSourceLinkId,
    telemetrySourceFamily: familyStr,
    observations: input.multichannelObservations,
  });
  if (input.multichannelFingerprint !== expectedMcFp) {
    reasonCodes.push('MULTICHANNEL_FINGERPRINT_MISMATCH');
  }
  return expectedMcFp;
}

export function validateOfflineManifestAttestation(
  input: Ds4PowertrainDemandResearchInputV1,
  family: ReturnType<typeof resolveTelemetrySourceFamily>,
  expectedMcFp: string,
  canon: ReturnType<typeof canonicalizeMultichannelObservations>,
  reasonCodes: Ds4PowertrainDemandBindingAbstainReason[],
): void {
  if (input.evidenceOrigin !== 'OFFLINE_SEALED_BUNDLE') return;
  reasonCodes.push('OFFLINE_SOURCE_ATTESTATION_NOT_VERIFIED');
  const m = input.multichannelManifest;
  if (m == null) {
    reasonCodes.push('MULTICHANNEL_MANIFEST_MISSING');
  } else {
    validateMultichannelManifest({
      manifest: m,
      researchInput: input,
      family,
      expectedMcFp,
      canon,
      reasonCodes,
    });
  }
}
