import type { DiV0MotionCoreShadowPayloadV1 } from '../../motion-core-shadow-worker/di-v0-motion-core-shadow.types';
import type { Ds4Layer2P4bWindowSpeedLimitationV1 } from './ds4-layer2-p4b-event-kinematics-evidence.v1.contract';
import { isDs4Layer2P4bLegacyRepairInfluencedV1 } from './ds4-layer2-p4e-repair-state-evidence.v1';

function normalizeLabelUtc(label: string): string {
  return label.endsWith('Z') ? label : `${label.replace(/(\.\d{3})\d+Z$/, '$1Z')}`;
}

function labelInInclusiveWindow(bucketLabelUtc: string, startLabel: string, endLabel: string): boolean {
  const b = normalizeLabelUtc(bucketLabelUtc);
  const s = normalizeLabelUtc(startLabel);
  const e = normalizeLabelUtc(endLabel);
  return b >= s && b <= e;
}

/** @deprecated Use isDs4Layer2P4bLegacyRepairInfluencedV1 — retained for call-site clarity. */
function isRepairInfluenced(repairState: string | null | undefined): boolean {
  return isDs4Layer2P4bLegacyRepairInfluencedV1(repairState);
}

export function computeDs4Layer2P4bInWindowSpeedKinematicsV1(input: {
  payload: DiV0MotionCoreShadowPayloadV1;
  startLabel: string;
  endLabel: string;
  durationTier: string;
  steps: number | null;
  coverageRatio: number | null;
}): {
  windowMinSpeedKmh: number | null;
  windowMaxSpeedKmh: number | null;
  windowMeanSpeedKmh: number | null;
  windowSampleCount: number | null;
  windowExpectedSampleCount: number | null;
  windowCoverageRatio: number | null;
  kinematicLimitations: Ds4Layer2P4bWindowSpeedLimitationV1[];
} {
  const kinematicLimitations: Ds4Layer2P4bWindowSpeedLimitationV1[] = [];
  const speeds = input.payload.speeds ?? [];
  const numeric: number[] = [];

  for (const row of speeds) {
    if (!labelInInclusiveWindow(row.bucketLabelUtc, input.startLabel, input.endLabel)) continue;
    if (row.speedKmh != null && Number.isFinite(row.speedKmh)) {
      numeric.push(row.speedKmh);
    }
  }

  const expected =
    input.steps != null && Number.isFinite(input.steps) ? Math.max(0, Math.floor(input.steps)) : null;

  if (input.durationTier === 'BIN_ONLY') {
    kinematicLimitations.push('BIN_ONLY_SPARSE_SUPPORT');
  }

  if (numeric.length === 0) {
    kinematicLimitations.push('NO_NUMERIC_SPEED_IN_WINDOW');
    return {
      windowMinSpeedKmh: null,
      windowMaxSpeedKmh: null,
      windowMeanSpeedKmh: null,
      windowSampleCount: 0,
      windowExpectedSampleCount: expected,
      windowCoverageRatio: expected && expected > 0 ? 0 : null,
      kinematicLimitations,
    };
  }

  if (expected != null && numeric.length < expected) {
    kinematicLimitations.push('INSUFFICIENT_SPEED_SAMPLES');
  }

  const sum = numeric.reduce((a, b) => a + b, 0);
  const windowCoverageRatio =
    expected != null && expected > 0 ? numeric.length / expected : input.coverageRatio ?? null;

  return {
    windowMinSpeedKmh: Math.min(...numeric),
    windowMaxSpeedKmh: Math.max(...numeric),
    windowMeanSpeedKmh: sum / numeric.length,
    windowSampleCount: numeric.length,
    windowExpectedSampleCount: expected,
    windowCoverageRatio,
    kinematicLimitations,
  };
}

export function computeDs4Layer2P4bInWindowSpeedEvidenceV1(input: {
  payload: DiV0MotionCoreShadowPayloadV1;
  startLabel: string;
  endLabel: string;
  durationTier: string;
  steps: number | null;
  coverageRatio: number | null;
}): {
  windowMinSpeedKmh: number | null;
  windowMaxSpeedKmh: number | null;
  windowMeanSpeedKmh: number | null;
  windowSampleCount: number | null;
  windowExpectedSampleCount: number | null;
  windowCoverageRatio: number | null;
  repairInfluenced: boolean;
  limitations: Ds4Layer2P4bWindowSpeedLimitationV1[];
} {
  const kinematics = computeDs4Layer2P4bInWindowSpeedKinematicsV1(input);
  const limitations = [...kinematics.kinematicLimitations];
  let repairInfluenced = false;

  for (const repair of input.payload.speedRepairs ?? []) {
    if (!labelInInclusiveWindow(repair.bucketLabelUtc, input.startLabel, input.endLabel)) continue;
    if (isRepairInfluenced(repair.repairState)) {
      repairInfluenced = true;
    }
  }

  if (repairInfluenced) {
    limitations.push('REPAIR_INFLUENCED_SAMPLE');
  }

  return {
    windowMinSpeedKmh: kinematics.windowMinSpeedKmh,
    windowMaxSpeedKmh: kinematics.windowMaxSpeedKmh,
    windowMeanSpeedKmh: kinematics.windowMeanSpeedKmh,
    windowSampleCount: kinematics.windowSampleCount,
    windowExpectedSampleCount: kinematics.windowExpectedSampleCount,
    windowCoverageRatio: kinematics.windowCoverageRatio,
    repairInfluenced,
    limitations,
  };
}
