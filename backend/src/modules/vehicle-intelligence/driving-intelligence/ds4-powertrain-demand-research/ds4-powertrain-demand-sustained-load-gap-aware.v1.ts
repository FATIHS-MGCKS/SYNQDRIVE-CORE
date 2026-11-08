import { createHash } from 'crypto';
import {
  COLD_ENGINE_SHADOW_POLICY,
  isPhevFuelType,
} from '../../shadow-detector/detectors/cold-engine-shadow.policy';
import type {
  Ds4GapAwareSustainedLoadCandidateV1,
  Ds4SustainedLoadEntryBranchV1,
  Ds4SustainedLoadTripEvidenceClassificationV1,
} from './ds4-powertrain-demand-research.contract.v1';
import type { Ds4CanonicalMultichannelBucketV1 } from './ds4-powertrain-demand-multichannel-canonicalize.v1';
import type { Ds4MultichannelCanonicalizeResultV1 } from './ds4-powertrain-demand-multichannel-canonicalize.v1';
import { DS4_SUSTAINED_LOAD_GAP_AWARE_POLICY } from './ds4-powertrain-demand-sustained-load-reference.v1';

export { DS4_SUSTAINED_LOAD_GAP_AWARE_POLICY } from './ds4-powertrain-demand-sustained-load-reference.v1';

const BASE_LIMITATIONS = [
  'BUCKET_LABEL_UNVERIFIED',
  'MODE_A',
  'R1_HISTORICAL_OBD_RECORD_TIME_UNCERTAIN',
  'RESEARCH_LABEL_SPAN_NOT_VERIFIED_PHYSICAL_DURATION',
  'MISSING_VALUE_NOT_MEASURED_ZERO',
] as const;

type SequenceSlice = {
  buckets: Ds4CanonicalMultichannelBucketV1[];
  entryBranch: Ds4SustainedLoadEntryBranchV1;
};

export function resolveSustainedLoadEntryBranch(
  bucket: Ds4CanonicalMultichannelBucketV1,
): Ds4SustainedLoadEntryBranchV1 | null {
  const load = bucket.loadPct;
  if (load == null || load < DS4_SUSTAINED_LOAD_GAP_AWARE_POLICY.highEngineLoadEntryPct) {
    return null;
  }
  const rpmOk = bucket.rpm != null && bucket.rpm >= DS4_SUSTAINED_LOAD_GAP_AWARE_POLICY.minRpm;
  const thrOk =
    bucket.throttlePct != null && bucket.throttlePct >= DS4_SUSTAINED_LOAD_GAP_AWARE_POLICY.highThrottlePct;
  if (rpmOk && thrOk) return 'BOTH';
  if (rpmOk) return 'RPM';
  if (thrOk) return 'THROTTLE';
  return null;
}

function continuesHighLoad(bucket: Ds4CanonicalMultichannelBucketV1): boolean {
  return bucket.loadPct != null && bucket.loadPct >= DS4_SUSTAINED_LOAD_GAP_AWARE_POLICY.highEngineLoadContinuePct;
}

/** PHEV: RPM-only local ICE confirmation within the admitted candidate sequence (P2-B2 parity). */
function resolvePhevIceConfirmedInCandidateSequence(
  slice: readonly Ds4CanonicalMultichannelBucketV1[],
): boolean {
  let rpmIceSamples = 0;
  for (const b of slice) {
    if (b.rpm != null && b.rpm >= COLD_ENGINE_SHADOW_POLICY.iceRpmMin) {
      rpmIceSamples += 1;
    }
  }
  return rpmIceSamples >= COLD_ENGINE_SHADOW_POLICY.iceConfirmationMinSamples;
}

function sequenceMeetsAdmission(
  slice: SequenceSlice,
  fuelType: string | null,
): { ok: boolean; maxGapMs: number; peakLoad: number } {
  const buckets = slice.buckets;
  if (buckets.length < DS4_SUSTAINED_LOAD_GAP_AWARE_POLICY.minObservations) {
    return { ok: false, maxGapMs: 0, peakLoad: 0 };
  }
  const span =
    buckets[buckets.length - 1]!.recordedAtMs - buckets[0]!.recordedAtMs;
  if (span < DS4_SUSTAINED_LOAD_GAP_AWARE_POLICY.minResearchLabelSpanMs) {
    return { ok: false, maxGapMs: 0, peakLoad: 0 };
  }
  let maxGapMs = 0;
  for (let i = 1; i < buckets.length; i += 1) {
    const gap = buckets[i]!.recordedAtMs - buckets[i - 1]!.recordedAtMs;
    maxGapMs = Math.max(maxGapMs, gap);
    if (gap > DS4_SUSTAINED_LOAD_GAP_AWARE_POLICY.maxAdjacentLabelGapMs) {
      return { ok: false, maxGapMs, peakLoad: 0 };
    }
  }
  if (isPhevFuelType(fuelType) && !resolvePhevIceConfirmedInCandidateSequence(buckets)) {
    return { ok: false, maxGapMs, peakLoad: 0 };
  }
  const peakLoad = Math.max(...buckets.map((b) => b.loadPct ?? 0));
  return { ok: true, maxGapMs, peakLoad };
}

export type Ds4GapAwareSustainedLoadDetectResultV1 = {
  candidates: Ds4GapAwareSustainedLoadCandidateV1[];
  entryLabelCount: number;
  longestRunLabelCount: number;
};

export function detectGapAwareSustainedLoadCandidates(input: {
  tripId: string;
  providerSourceLinkId: string;
  fuelType: string | null;
  canon: Ds4MultichannelCanonicalizeResultV1;
}): Ds4GapAwareSustainedLoadDetectResultV1 {
  const sorted = [...input.canon.buckets].sort((a, b) => a.recordedAtMs - b.recordedAtMs);
  const candidates: Ds4GapAwareSustainedLoadCandidateV1[] = [];
  let entryLabelCount = 0;
  let longestRunLabelCount = 0;
  const countedEntryLabelMs = new Set<number>();

  let active: SequenceSlice | null = null;

  const countEntryLabelIfNew = (bucket: Ds4CanonicalMultichannelBucketV1): Ds4SustainedLoadEntryBranchV1 | null => {
    const entry = resolveSustainedLoadEntryBranch(bucket);
    if (entry != null && !countedEntryLabelMs.has(bucket.recordedAtMs)) {
      countedEntryLabelMs.add(bucket.recordedAtMs);
      entryLabelCount += 1;
    }
    return entry;
  };

  const flush = () => {
    if (!active || active.buckets.length === 0) {
      active = null;
      return;
    }
    longestRunLabelCount = Math.max(longestRunLabelCount, active.buckets.length);
    const admission = sequenceMeetsAdmission(active, input.fuelType);
    if (!admission.ok) {
      active = null;
      return;
    }
    const start = active.buckets[0]!;
    const end = active.buckets[active.buckets.length - 1]!;
    const episodeKey = createHash('sha256')
      .update(
        `${input.tripId}|${input.providerSourceLinkId}|${start.recordedAtMs}|${end.recordedAtMs}|${active.entryBranch}`,
      )
      .digest('hex')
      .slice(0, 32);
    const last = active.buckets[active.buckets.length - 1]!;
    candidates.push({
      episodeKey,
      classification: 'GAP_AWARE_SUSTAINED_PROXY_CANDIDATE',
      startProviderBucketLabelIso: start.recordedAtIso,
      endProviderBucketLabelIso: end.recordedAtIso,
      observedLabelCount: active.buckets.length,
      researchLabelSpanMs: last.recordedAtMs - start.recordedAtMs,
      maxObservedLabelGapMs: admission.maxGapMs,
      peakObservedLoadPct: admission.peakLoad,
      entryBranch: active.entryBranch,
      limitationCodes: [...BASE_LIMITATIONS],
      requiredChannelPresence: {
        obdEngineLoad: true,
        rpm: active.buckets.some((b) => b.rpm != null),
        throttle: active.buckets.some((b) => b.throttlePct != null),
      },
    });
    active = null;
  };

  for (const bucket of sorted) {
    if (bucket.loadPct == null) {
      flush();
      continue;
    }

    const entry = countEntryLabelIfNew(bucket);

    if (active) {
      const prev = active.buckets[active.buckets.length - 1]!;
      const gap = bucket.recordedAtMs - prev.recordedAtMs;
      if (gap > DS4_SUSTAINED_LOAD_GAP_AWARE_POLICY.maxAdjacentLabelGapMs || !continuesHighLoad(bucket)) {
        flush();
      } else {
        active.buckets.push(bucket);
        continue;
      }
    }

    if (entry) {
      active = { buckets: [bucket], entryBranch: entry };
    }
  }
  flush();

  return {
    candidates,
    entryLabelCount,
    longestRunLabelCount,
  };
}

export function classifySustainedLoadTripEvidence(input: {
  entryLabelCount: number;
  candidateCount: number;
  longestRunLabelCount: number;
}): Ds4SustainedLoadTripEvidenceClassificationV1 {
  if (input.candidateCount > 0) {
    return 'GAP_AWARE_SUSTAINED_PROXY_CANDIDATE';
  }
  if (input.entryLabelCount === 0) {
    return 'NOT_OBSERVED';
  }
  if (input.longestRunLabelCount >= DS4_SUSTAINED_LOAD_GAP_AWARE_POLICY.minObservations) {
    return 'INSUFFICIENT_OBSERVATIONS';
  }
  if (input.longestRunLabelCount >= 2) {
    return 'MULTI_LABEL_HIGH_LOAD_RUN';
  }
  if (input.entryLabelCount === 1 && input.longestRunLabelCount === 1) {
    return 'SINGLE_HIGH_LOAD_ENTRY_LABEL';
  }
  return 'INSUFFICIENT_OBSERVATIONS';
}
