import {
  COLD_ENGINE_SHADOW_POLICY,
  confirmIceOperation,
  isPhevFuelType,
} from '../../shadow-detector/detectors/cold-engine-shadow.policy';
import type { ShadowDetectorHfSample } from '../../shadow-detector/shadow-detector.types';
import type { Ds4RpmReferenceSpecProvenanceClass } from '../rpm-reference-intelligence-v1/ds4-rpm-reference-intelligence-v1.contract';
import type {
  Ds4CanonicalMultichannelBucketV1,
  Ds4MultichannelCanonicalizeResultV1,
} from './ds4-powertrain-demand-multichannel-canonicalize.v1';
import { splitMultichannelSequences } from './ds4-powertrain-demand-multichannel-canonicalize.v1';
import type {
  Ds4ColdEngineProxyCandidateV1,
  Ds4ColdEngineProxyKindV1,
  Ds4ColdEngineSubtypeAssessabilityV1,
} from './ds4-powertrain-demand-research.contract.v1';
import { DS4_COLD_ENGINE_BUCKET_GRID_RESEARCH_POLICY_VERSION } from './ds4-powertrain-demand-research.contract.v1';

export const DS4_COLD_ENGINE_BUCKET_GRID_POLICY = {
  windowBuckets: 3,
  researchPolicyVersion: DS4_COLD_ENGINE_BUCKET_GRID_RESEARCH_POLICY_VERSION,
  shadowPolicyVersion: COLD_ENGINE_SHADOW_POLICY.version,
  coldCoolantMaxC: COLD_ENGINE_SHADOW_POLICY.coldCoolantMaxC,
  highLoadEngineLoadPct: COLD_ENGINE_SHADOW_POLICY.highLoadEngineLoadPct,
  highLoadRpmPctOfMax: COLD_ENGINE_SHADOW_POLICY.highLoadRpmPctOfMax,
  highLoadThrottleEntryPct: COLD_ENGINE_SHADOW_POLICY.highLoadThrottleEntryPct,
  iceRpmMin: COLD_ENGINE_SHADOW_POLICY.iceRpmMin,
  iceLoadMinPct: COLD_ENGINE_SHADOW_POLICY.iceLoadMinPct,
  iceConfirmationMinSamples: COLD_ENGINE_SHADOW_POLICY.iceConfirmationMinSamples,
} as const;

function bucketsToIceSamples(slice: readonly Ds4CanonicalMultichannelBucketV1[]): ShadowDetectorHfSample[] {
  return slice.map((b) => ({
    timestamp: b.recordedAtIso,
    speedKmh: b.speedKmh,
    coolantC: b.coolantC,
    rpm: b.rpm,
    throttlePct: b.throttlePct,
    loadPct: b.loadPct,
    engineRuntimeSec: null,
    torqueNm: null,
    torquePct: null,
    exteriorTempC: null,
    tractionBatteryPowerKw: null,
    socPct: null,
    tractionBatteryTemperatureC: null,
    altitudeM: null,
    gear: null,
    ignitionOn: null,
  }));
}

function isBucketCold(b: Ds4CanonicalMultichannelBucketV1): boolean {
  return b.coolantC != null && b.coolantC < COLD_ENGINE_SHADOW_POLICY.coldCoolantMaxC;
}

function windowBucketsConsecutive(
  seq: readonly Ds4CanonicalMultichannelBucketV1[],
  i: number,
  nominalIntervalMs: number,
): boolean {
  if (i < 2) return false;
  const b0 = seq[i - 2]!;
  const b1 = seq[i - 1]!;
  const b2 = seq[i]!;
  const maxGap = nominalIntervalMs * 1.5;
  if (b1.recordedAtMs - b0.recordedAtMs > maxGap) return false;
  if (b2.recordedAtMs - b1.recordedAtMs > maxGap) return false;
  return true;
}

function conventionalEngineOperationProxy(slice: readonly Ds4CanonicalMultichannelBucketV1[]): boolean {
  let hits = 0;
  for (const b of slice) {
    const rpmActive = b.rpm != null && b.rpm >= COLD_ENGINE_SHADOW_POLICY.iceRpmMin;
    const loadActive = b.loadPct != null && b.loadPct >= COLD_ENGINE_SHADOW_POLICY.iceLoadMinPct;
    if (rpmActive || loadActive) hits += 1;
  }
  return hits >= COLD_ENGINE_SHADOW_POLICY.iceConfirmationMinSamples;
}

function resolvePhevIceConfirmed(slice: readonly Ds4CanonicalMultichannelBucketV1[]): boolean {
  let rpmIceSamples = 0;
  for (const b of slice) {
    if (b.rpm != null && b.rpm >= COLD_ENGINE_SHADOW_POLICY.iceRpmMin) {
      rpmIceSamples += 1;
    }
  }
  return rpmIceSamples >= COLD_ENGINE_SHADOW_POLICY.iceConfirmationMinSamples;
}

export function isReferenceMaxRpmAdmitted(input: {
  maxRpm: number | null;
  maxRpmProvenance: Ds4RpmReferenceSpecProvenanceClass | null;
}): boolean {
  return (
    input.maxRpm != null &&
    input.maxRpm > 0 &&
    input.maxRpmProvenance === 'USER_CONFIRMED'
  );
}

function highRpmThresholdFromReference(maxRpm: number): number {
  return maxRpm * COLD_ENGINE_SHADOW_POLICY.highLoadRpmPctOfMax;
}

type RawColdWindow = {
  kind: Ds4ColdEngineProxyKindV1;
  start: Ds4CanonicalMultichannelBucketV1;
  end: Ds4CanonicalMultichannelBucketV1;
  startIdx: number;
  endIdx: number;
  peakValue: number;
  peakUnit: string;
  limitationCodes: string[];
};

function detectRawColdWindowsInSequence(
  seq: readonly Ds4CanonicalMultichannelBucketV1[],
  nominalIntervalMs: number,
  fuelType: string | null,
  reference: { maxRpm: number | null; admitted: boolean },
): RawColdWindow[] {
  const out: RawColdWindow[] = [];
  const phev = isPhevFuelType(fuelType);

  for (let i = 2; i < seq.length; i += 1) {
    if (!windowBucketsConsecutive(seq, i, nominalIntervalMs)) continue;
    const slice = [seq[i - 2]!, seq[i - 1]!, seq[i]!];
    if (!slice.every(isBucketCold)) continue;

    const prev = seq[i - 2]!;
    const cur = seq[i]!;

    // HIGH LOAD — requires load proxy; PHEV requires RPM-based ICE confirmation (not load-only).
    if (slice.some((b) => b.loadPct != null && b.loadPct >= COLD_ENGINE_SHADOW_POLICY.highLoadEngineLoadPct)) {
      const iceOk = phev ? resolvePhevIceConfirmed(slice) : conventionalEngineOperationProxy(slice);
      if (iceOk) {
        const peakLoad = Math.max(...slice.map((b) => b.loadPct ?? 0));
        out.push({
          kind: 'COLD_ENGINE_HIGH_LOAD',
          start: slice[0]!,
          end: slice[2]!,
          startIdx: i - 2,
          endIdx: i,
          peakValue: peakLoad,
          peakUnit: 'load%',
          limitationCodes: phev ? [] : ['FUEL_TYPE_CALLER_DECLARED_UNVERIFIED'],
        });
      }
    }

    // HIGH RPM — reference-gated at detection time.
    if (reference.admitted && reference.maxRpm != null) {
      const threshold = highRpmThresholdFromReference(reference.maxRpm);
      if (
        slice.every((b) => b.rpm != null) &&
        slice.some((b) => (b.rpm ?? 0) >= threshold)
      ) {
        const iceOk = phev ? resolvePhevIceConfirmed(slice) : conventionalEngineOperationProxy(slice);
        if (iceOk) {
          const peakRpm = Math.max(...slice.map((b) => b.rpm ?? 0));
          out.push({
            kind: 'COLD_ENGINE_HIGH_RPM',
            start: slice[0]!,
            end: slice[2]!,
            startIdx: i - 2,
            endIdx: i,
            peakValue: peakRpm,
            peakUnit: 'rpm',
            limitationCodes: ['VEHICLE_REFERENCE_MAX_RPM_BOUND'],
          });
        }
      }
    }

    // FULL THROTTLE — throttle + engine-operation proxy (never speed).
    const throttlePresent = slice.every((b) => b.throttlePct != null);
    if (
      throttlePresent &&
      prev.throttlePct != null &&
      cur.throttlePct != null &&
      cur.throttlePct >= COLD_ENGINE_SHADOW_POLICY.highLoadThrottleEntryPct
    ) {
      const iceOk = phev ? resolvePhevIceConfirmed(slice) : conventionalEngineOperationProxy(slice);
      if (iceOk) {
        const peakThr = Math.max(...slice.map((b) => b.throttlePct ?? 0));
        out.push({
          kind: 'COLD_ENGINE_FULL_THROTTLE',
          start: slice[0]!,
          end: slice[2]!,
          startIdx: i - 2,
          endIdx: i,
          peakValue: peakThr,
          peakUnit: 'throttle%',
          limitationCodes: phev ? ['FUEL_TYPE_CALLER_DECLARED_UNVERIFIED'] : [],
        });
      }
    }
  }

  return out;
}

function toClassification(kind: Ds4ColdEngineProxyKindV1): Ds4ColdEngineProxyCandidateV1['classification'] {
  switch (kind) {
    case 'COLD_ENGINE_HIGH_LOAD':
      return 'COLD_ENGINE_HIGH_LOAD_PROXY_CANDIDATE';
    case 'COLD_ENGINE_HIGH_RPM':
      return 'COLD_ENGINE_HIGH_RPM_PROXY_CANDIDATE';
    case 'COLD_ENGINE_FULL_THROTTLE':
      return 'COLD_ENGINE_FULL_THROTTLE_PROXY_CANDIDATE';
    default:
      return 'NOT_ASSESSABLE';
  }
}

function dedupeKey(tripId: string, linkId: string, kind: string, startMs: number): string {
  return `${tripId}:${linkId}:cold-proxy:${kind}:${startMs}`;
}

export function detectColdEngineBucketGridCandidates(input: {
  tripId: string;
  providerSourceLinkId: string;
  canon: Ds4MultichannelCanonicalizeResultV1;
  sequenceMaxGapSeconds: number;
  nominalCadenceMs: number;
  fuelType: string | null;
  referenceMaxRpm: number | null;
  referenceMaxRpmProvenance: Ds4RpmReferenceSpecProvenanceClass | null;
}): {
  rawWindowCount: number;
  candidates: Ds4ColdEngineProxyCandidateV1[];
  subtypeAssessability: Record<Ds4ColdEngineProxyKindV1, Ds4ColdEngineSubtypeAssessabilityV1>;
} {
  const referenceAdmitted = isReferenceMaxRpmAdmitted({
    maxRpm: input.referenceMaxRpm,
    maxRpmProvenance: input.referenceMaxRpmProvenance,
  });

  const subtypeAssessability: Record<Ds4ColdEngineProxyKindV1, Ds4ColdEngineSubtypeAssessabilityV1> = {
    COLD_ENGINE_HIGH_LOAD: { status: 'ASSESSABLE', reasonCodes: [] },
    COLD_ENGINE_HIGH_RPM: referenceAdmitted
      ? { status: 'ASSESSABLE', reasonCodes: [] }
      : {
          status: 'NOT_ASSESSABLE',
          reasonCodes: ['REFERENCE_MAX_RPM_NOT_ADMITTED'],
        },
    COLD_ENGINE_FULL_THROTTLE: { status: 'ASSESSABLE', reasonCodes: [] },
  };

  const sequences = splitMultichannelSequences(input.canon.buckets, input.sequenceMaxGapSeconds);
  const rawAll: RawColdWindow[] = [];
  for (const seq of sequences) {
    rawAll.push(
      ...detectRawColdWindowsInSequence(seq, input.nominalCadenceMs, input.fuelType, {
        maxRpm: input.referenceMaxRpm,
        admitted: referenceAdmitted,
      }),
    );
  }

  const seen = new Set<string>();
  const candidates: Ds4ColdEngineProxyCandidateV1[] = [];

  for (const w of rawAll) {
    if (w.kind === 'COLD_ENGINE_HIGH_RPM' && !referenceAdmitted) continue;

    const start = w.start;
    const end = w.end;
    const key = dedupeKey(input.tripId, input.providerSourceLinkId, w.kind, start.recordedAtMs);
    if (seen.has(key)) continue;
    seen.add(key);

    candidates.push({
      episodeKey: key,
      proxyKind: w.kind,
      classification: toClassification(w.kind),
      providerBucketLabelStartIso: start.recordedAtIso,
      providerBucketLabelEndIso: end.recordedAtIso,
      startBucketIndex: w.startIdx,
      endBucketIndex: w.endIdx,
      observedBucketSpanCount: w.endIdx - w.startIdx + 1,
      peakValue: w.peakValue,
      peakUnit: w.peakUnit,
      limitationCodes: [
        ...w.limitationCodes,
        'BUCKET_LABEL_UNVERIFIED',
        'NO_SYNCHRONIZED_PHYSICAL_EVENT',
        'NO_MEASURED_DURATION_CLAIM',
      ],
      requiredChannelPresence: {
        powertrainCombustionEngineECT: true,
        obdEngineLoad: w.kind === 'COLD_ENGINE_HIGH_LOAD',
        powertrainCombustionEngineSpeed: w.kind === 'COLD_ENGINE_HIGH_RPM',
        obdThrottlePosition: w.kind === 'COLD_ENGINE_FULL_THROTTLE',
      },
    });
  }

  return {
    rawWindowCount: rawAll.length,
    candidates,
    subtypeAssessability,
  };
}
