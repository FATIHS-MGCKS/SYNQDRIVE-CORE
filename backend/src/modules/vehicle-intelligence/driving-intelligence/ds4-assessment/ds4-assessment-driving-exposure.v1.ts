import { parseBucketLabelMs } from '../core/kinematics/motion-core-grid';
import { MOTION_CORE_EVENT_GUARDS_V0_1_DEV } from '../core/kinematics/motion-event-detector';
import type {
  DiV0MotionCoreShadowPayloadV1,
  DiV0MotionCoreShadowPersistedFsmRow,
  DiV0MotionCoreShadowPersistedSpeedRow,
} from '../motion-core-shadow-worker/di-v0-motion-core-shadow.types';
import { DS4_ASSESSMENT_DRIVING_EXPOSURE_RULE_VERSION_V2 } from './ds4-assessment-rule-bindings.v1';
import type { Ds4SpeedAuthorityPartitionV1 } from './ds4-trip-assessment-v1.contract';

export const DS4_ASSESSMENT_DRIVING_EXPOSURE_PROVENANCE_V2 = DS4_ASSESSMENT_DRIVING_EXPOSURE_RULE_VERSION_V2;

/** Canonical 1 Hz motion grid step — do not credit unobserved intermediate buckets. */
export const DS4_ASSESSMENT_DRIVING_EXPOSURE_MAX_INTERVAL_GAP_S = 1;

const usableSpeedQualities = new Set<string>(MOTION_CORE_EVENT_GUARDS_V0_1_DEV.usableQualities);

export type Ds4DrivingExposureProvenanceV1 = {
  provenanceVersion: typeof DS4_ASSESSMENT_DRIVING_EXPOSURE_PROVENANCE_V2;
  speedAuthority: Ds4SpeedAuthorityPartitionV1 | null;
  speedSeriesField: 'speeds';
  speedSeriesEstimator: string | null;
  fsmMovingDirectLabelCount: number;
  usableSpeedLabelCount: number;
  qualifyingIntervalCount: number;
  excludedGapIntervalCount: number;
  maxObservedIntervalGapS: number;
  speedLabelCount: number;
  duplicateLabelCount: number;
  conflictingDuplicateLabelCount: number;
  canonicalSpeedSeriesMissing: boolean;
};

export type Ds4DrivingExposureV1 = {
  exposureSeconds: number;
  distanceKm: number;
  derivable: boolean;
  provenance: Ds4DrivingExposureProvenanceV1;
};

function speedRowSignature(row: DiV0MotionCoreShadowPersistedSpeedRow): string {
  return JSON.stringify({
    speedKmh: row.speedKmh,
    quality: row.quality,
    estimator: row.estimator,
    flags: [...row.flags].sort(),
    support: [...row.support].sort(),
  });
}

function fsmRowSignature(row: DiV0MotionCoreShadowPersistedFsmRow): string {
  return JSON.stringify({
    state: row.state,
    evidenceQuality: row.evidenceQuality,
    reason: row.reason,
    flags: [...row.flags].sort(),
  });
}

type DuplicateResolution<T> = {
  accepted: T[];
  duplicateLabelCount: number;
  conflictingDuplicateLabelCount: number;
  rejectedLabels: Set<string>;
};

function resolveDuplicateLabels<T>(
  rows: T[],
  labelOf: (row: T) => string,
  signatureOf: (row: T) => string,
): DuplicateResolution<T> {
  const byLabel = new Map<string, T[]>();
  for (const row of rows) {
    const label = labelOf(row);
    const group = byLabel.get(label) ?? [];
    group.push(row);
    byLabel.set(label, group);
  }

  const duplicateLabels = new Set<string>();
  const rejectedLabels = new Set<string>();
  const accepted: T[] = [];

  for (const [label, group] of [...byLabel.entries()].sort(
    (a, b) => parseBucketLabelMs(a[0]) - parseBucketLabelMs(b[0]),
  )) {
    if (group.length === 1) {
      accepted.push(group[0]!);
      continue;
    }
    duplicateLabels.add(label);
    const signatures = new Set(group.map((row) => signatureOf(row)));
    if (signatures.size > 1) {
      rejectedLabels.add(label);
      continue;
    }
    const canonical = [...group].sort((a, b) => signatureOf(a).localeCompare(signatureOf(b)))[0]!;
    accepted.push(canonical);
  }

  return {
    accepted,
    duplicateLabelCount: duplicateLabels.size,
    conflictingDuplicateLabelCount: rejectedLabels.size,
    rejectedLabels,
  };
}

function resolveSpeedSeries(input: {
  payload: DiV0MotionCoreShadowPayloadV1;
  speedAuthority: Ds4SpeedAuthorityPartitionV1 | null;
}): {
  rows: DiV0MotionCoreShadowPersistedSpeedRow[];
  canonicalSeriesPresent: boolean;
} {
  const rows = input.payload.speeds ?? [];
  if (rows.length > 0) {
    return { rows, canonicalSeriesPresent: true };
  }
  if (input.speedAuthority === 'C5_1_PREFERRED' && (input.payload.c4Speeds?.length ?? 0) > 0) {
    return { rows: [], canonicalSeriesPresent: false };
  }
  return { rows: [], canonicalSeriesPresent: false };
}

function buildAcceptedSpeedAndFsm(input: {
  payload: DiV0MotionCoreShadowPayloadV1;
  speedAuthority: Ds4SpeedAuthorityPartitionV1 | null;
}): {
  rows: DiV0MotionCoreShadowPersistedSpeedRow[];
  fsmMap: Map<string, DiV0MotionCoreShadowPersistedFsmRow>;
  duplicateLabelCount: number;
  conflictingDuplicateLabelCount: number;
  canonicalSpeedSeriesMissing: boolean;
} {
  const { rows: rawSpeed, canonicalSeriesPresent } = resolveSpeedSeries(input);
  const speedDedupe = resolveDuplicateLabels(rawSpeed, (r) => r.bucketLabelUtc, speedRowSignature);
  const fsmDedupe = resolveDuplicateLabels(
    input.payload.fsmLabels ?? [],
    (r) => r.bucketLabelUtc,
    fsmRowSignature,
  );

  const rejectedLabels = new Set<string>([
    ...speedDedupe.rejectedLabels,
    ...fsmDedupe.rejectedLabels,
  ]);

  const duplicateLabelsUnion = new Set<string>();
  const speedCounts = new Map<string, number>();
  for (const row of rawSpeed) {
    speedCounts.set(row.bucketLabelUtc, (speedCounts.get(row.bucketLabelUtc) ?? 0) + 1);
  }
  for (const [label, count] of speedCounts) {
    if (count > 1) duplicateLabelsUnion.add(label);
  }
  const fsmCounts = new Map<string, number>();
  for (const row of input.payload.fsmLabels ?? []) {
    fsmCounts.set(row.bucketLabelUtc, (fsmCounts.get(row.bucketLabelUtc) ?? 0) + 1);
  }
  for (const [label, count] of fsmCounts) {
    if (count > 1) duplicateLabelsUnion.add(label);
  }

  const rows = speedDedupe.accepted
    .filter((row) => !rejectedLabels.has(row.bucketLabelUtc))
    .sort((a, b) => parseBucketLabelMs(a.bucketLabelUtc) - parseBucketLabelMs(b.bucketLabelUtc));

  const fsmMap = new Map<string, DiV0MotionCoreShadowPersistedFsmRow>();
  for (const row of fsmDedupe.accepted) {
    if (rejectedLabels.has(row.bucketLabelUtc)) {
      continue;
    }
    fsmMap.set(row.bucketLabelUtc, row);
  }

  return {
    rows,
    fsmMap,
    duplicateLabelCount: duplicateLabelsUnion.size,
    conflictingDuplicateLabelCount: rejectedLabels.size,
    canonicalSpeedSeriesMissing: !canonicalSeriesPresent,
  };
}

function isUsableNumericSpeed(row: DiV0MotionCoreShadowPersistedSpeedRow): boolean {
  if (row.speedKmh == null || !Number.isFinite(row.speedKmh) || row.speedKmh < 0) {
    return false;
  }
  return usableSpeedQualities.has(String(row.quality));
}

function qualifiesExposureSample(
  speedRow: DiV0MotionCoreShadowPersistedSpeedRow,
  fsm: DiV0MotionCoreShadowPersistedFsmRow | undefined,
): boolean {
  if (!isUsableNumericSpeed(speedRow)) {
    return false;
  }
  if (!fsm) {
    return false;
  }
  return fsm.state === 'MOVING' && fsm.evidenceQuality === 'DIRECT';
}

export function emptyDs4DrivingExposureV1(speedAuthority: Ds4SpeedAuthorityPartitionV1 | null = null): Ds4DrivingExposureV1 {
  return {
    exposureSeconds: 0,
    distanceKm: 0,
    derivable: false,
    provenance: {
      provenanceVersion: DS4_ASSESSMENT_DRIVING_EXPOSURE_PROVENANCE_V2,
      speedAuthority,
      speedSeriesField: 'speeds',
      speedSeriesEstimator: null,
      fsmMovingDirectLabelCount: 0,
      usableSpeedLabelCount: 0,
      qualifyingIntervalCount: 0,
      excludedGapIntervalCount: 0,
      maxObservedIntervalGapS: 0,
      speedLabelCount: 0,
      duplicateLabelCount: 0,
      conflictingDuplicateLabelCount: 0,
      canonicalSpeedSeriesMissing: true,
    },
  };
}

export function deriveDs4DrivingExposureV1(input: {
  payload: DiV0MotionCoreShadowPayloadV1;
  speedAuthority: Ds4SpeedAuthorityPartitionV1 | null;
}): Ds4DrivingExposureV1 {
  const {
    rows,
    fsmMap,
    duplicateLabelCount,
    conflictingDuplicateLabelCount,
    canonicalSpeedSeriesMissing,
  } = buildAcceptedSpeedAndFsm(input);

  let fsmMovingDirectLabelCount = 0;
  let usableSpeedLabelCount = 0;
  let qualifyingIntervalCount = 0;
  let excludedGapIntervalCount = 0;
  let maxObservedIntervalGapS = 0;
  let exposureSeconds = 0;
  let distanceKm = 0;

  for (const row of rows) {
    const fsm = fsmMap.get(row.bucketLabelUtc);
    if (fsm?.state === 'MOVING' && fsm.evidenceQuality === 'DIRECT') {
      fsmMovingDirectLabelCount += 1;
    }
    if (isUsableNumericSpeed(row)) {
      usableSpeedLabelCount += 1;
    }
  }

  for (let i = 0; i < rows.length - 1; i++) {
    const current = rows[i]!;
    const next = rows[i + 1]!;
    const dtS = (parseBucketLabelMs(next.bucketLabelUtc) - parseBucketLabelMs(current.bucketLabelUtc)) / 1000;
    if (dtS <= 0) {
      continue;
    }
    maxObservedIntervalGapS = Math.max(maxObservedIntervalGapS, dtS);
    if (dtS > DS4_ASSESSMENT_DRIVING_EXPOSURE_MAX_INTERVAL_GAP_S) {
      excludedGapIntervalCount += 1;
      continue;
    }
    const currentFsm = fsmMap.get(current.bucketLabelUtc);
    const nextFsm = fsmMap.get(next.bucketLabelUtc);
    if (!qualifiesExposureSample(current, currentFsm)) {
      continue;
    }
    if (!qualifiesExposureSample(next, nextFsm)) {
      continue;
    }
    const speedKmh = current.speedKmh!;
    qualifyingIntervalCount += 1;
    exposureSeconds += dtS;
    distanceKm += (speedKmh * dtS) / 3600;
  }

  const derivable =
    input.speedAuthority != null &&
    !canonicalSpeedSeriesMissing &&
    rows.length >= 2 &&
    qualifyingIntervalCount > 0 &&
    exposureSeconds > 0;
  const estimator = rows[0]?.estimator ?? null;

  return {
    exposureSeconds: derivable ? exposureSeconds : 0,
    distanceKm: derivable ? distanceKm : 0,
    derivable,
    provenance: {
      provenanceVersion: DS4_ASSESSMENT_DRIVING_EXPOSURE_PROVENANCE_V2,
      speedAuthority: input.speedAuthority,
      speedSeriesField: 'speeds',
      speedSeriesEstimator: estimator,
      fsmMovingDirectLabelCount,
      usableSpeedLabelCount,
      qualifyingIntervalCount,
      excludedGapIntervalCount,
      maxObservedIntervalGapS,
      speedLabelCount: rows.length,
      duplicateLabelCount,
      conflictingDuplicateLabelCount,
      canonicalSpeedSeriesMissing,
    },
  };
}
