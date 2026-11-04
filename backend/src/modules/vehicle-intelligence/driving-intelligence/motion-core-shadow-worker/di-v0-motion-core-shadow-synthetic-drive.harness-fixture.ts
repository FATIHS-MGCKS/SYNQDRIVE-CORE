import type { MotionCorePositionBucket } from '../core/kinematics/motion-core-grid';
import type { DiV0MotionCoreShadowEvidenceAdaptation } from './di-v0-motion-core-shadow-evidence.adapter';

const T0 = 1_900_000_000;

export function syntheticDriveLabel(i: number): string {
  return new Date((T0 + i) * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/** Shared synthetic drive for shadow replay / correlation harness (not production). */
export function syntheticAccelDecelDrive(): MotionCorePositionBucket[] {
  const speeds: number[] = [];
  for (let i = 0; i <= 10; i += 1) speeds.push(2 * i);
  for (let i = 0; i < 10; i += 1) speeds.push(20);
  for (let i = 1; i <= 10; i += 1) speeds.push(20 - 2 * i);
  for (let i = 0; i < 5; i += 1) speeds.push(0);
  const out: MotionCorePositionBucket[] = [];
  let dist = 0;
  speeds.forEach((v, i) => {
    dist += v;
    out.push({
      bucketLabelUtc: syntheticDriveLabel(i),
      availability: 'PRESENT',
      latitude: 48.1 + dist / 111_320,
      longitude: 11.5,
    });
  });
  return out;
}

export function syntheticDriveEvidence(
  buckets: MotionCorePositionBucket[] = syntheticAccelDecelDrive(),
): DiV0MotionCoreShadowEvidenceAdaptation {
  return {
    buckets,
    sparseSpeed: [],
    sparsePersisted: [],
    sparseChannelOutcome: null,
    sparseComparable: false,
    limitations: [],
  };
}
