import type {
  VsiActiveRpmProfileResolutionV1,
  VsiRpmCadenceTierResolutionV1,
  VsiSignalCadenceIntelligenceV2,
} from '../../vehicle-signal-intelligence/vsi-profile-cadence.types';

type SnapshotSignalRow = {
  canonicalSignalKey?: string;
  cadenceIntelligence?: VsiSignalCadenceIntelligenceV2;
};

export function readEngineRpmCadenceFromSignalsSnapshot(
  signalsSnapshot: unknown,
): {
  cadence: VsiSignalCadenceIntelligenceV2 | null;
  activeRpmProfile: VsiActiveRpmProfileResolutionV1 | null;
  rpmCadenceTierResolution: VsiRpmCadenceTierResolutionV1 | null;
} {
  if (!Array.isArray(signalsSnapshot)) {
    return { cadence: null, activeRpmProfile: null, rpmCadenceTierResolution: null };
  }
  for (const raw of signalsSnapshot) {
    const row = raw as SnapshotSignalRow;
    if (row.canonicalSignalKey !== 'engine_rpm') {
      continue;
    }
    const cadence = row.cadenceIntelligence ?? null;
    return {
      cadence,
      activeRpmProfile: cadence?.activeRpmProfile ?? null,
      rpmCadenceTierResolution: cadence?.rpmCadenceTierResolution ?? null,
    };
  }
  return { cadence: null, activeRpmProfile: null, rpmCadenceTierResolution: null };
}
