import type { DiV0MotionCoreShadowPersistedEventRow } from '../motion-core-shadow-worker/di-v0-motion-core-shadow.types';
import {
  isMotionCoreShadowIntensityConsumptionAllowed,
  readPersistedMotionEventIntensityForPayload,
  resolveMotionCoreShadowEventRowContract,
} from '../motion-core-shadow-worker/di-v0-motion-core-shadow-event-row.contract';
import type { DiV0MotionCoreShadowPayloadV1 } from '../motion-core-shadow-worker/di-v0-motion-core-shadow.types';
import type { Ds4SpeedAuthorityPartitionV1 } from './ds4-trip-assessment-v1.contract';

export type Ds4EventIntensityClassificationV1 =
  | 'EXCLUDED_ARTEFACT'
  | 'UNRATED'
  | 'ADMISSIBLE_FULL'
  | 'ADMISSIBLE_BIN_ONLY';

export type Ds4EventIntensityDurationTierV1 = 'FULL_ELIGIBLE' | 'BIN_ONLY' | 'UNRATED';

export type Ds4EventIntensityReasonCodeV1 =
  | 'EVENT_EXCLUDED_ARTEFACT'
  | 'EVENT_INTENSITY_UNAVAILABLE_V1_LEGACY'
  | 'EVENT_INTENSITY_UNAVAILABLE_CONTRACT'
  | 'EVENT_INTENSITY_UNAVAILABLE_INVALID'
  | 'EVENT_QUALITY_NOT_OK'
  | 'EVENT_COVERAGE_INCOMPLETE'
  | 'EVENT_STEPS_DURATION_MISMATCH'
  | 'EVENT_DURATION_BELOW_MINIMUM'
  | 'EVENT_ADMISSIBLE_FULL_ELIGIBLE'
  | 'EVENT_ADMISSIBLE_BIN_ONLY';

export type Ds4EventIntensityEligibilityRecordV1 = {
  eventIndex: number;
  kind: 'ACCELERATION' | 'DECELERATION' | 'OTHER';
  classification: Ds4EventIntensityClassificationV1;
  durationTier: Ds4EventIntensityDurationTierV1;
  eventQuality: string;
  speedAuthority: Ds4SpeedAuthorityPartitionV1 | null;
  meanAccelMps2: number | null;
  durationS: number | null;
  steps: number | null;
  coverageRatio: number | null;
  startUncertaintyS: string | null;
  endUncertaintyS: string | null;
  reasonCodes: Ds4EventIntensityReasonCodeV1[];
  startLabel: string;
  endLabel: string;
};

export type Ds4ManoeuvreKindIntensityCountsV1 = {
  totalEvents: number;
  acceptedEvents: number;
  excludedArtefacts: number;
  unratedEvents: number;
  admissibleEvents: number;
  fullEligibleEvents: number;
  binOnlyEvents: number;
  admissibleShareOfAccepted: number | null;
  admissibleDurationSeconds: number[];
  admissibleMeanAccelMps2: number[];
};

const MIN_ADMISSIBLE_DURATION_S = 2;

function classifyEventKind(kind: string): 'ACCELERATION' | 'DECELERATION' | 'OTHER' {
  const k = kind.toUpperCase();
  if (k.includes('DECEL') || k === 'BRAKING') return 'DECELERATION';
  if (k.includes('ACCEL')) return 'ACCELERATION';
  return 'OTHER';
}

function emptyKindCounts(): Ds4ManoeuvreKindIntensityCountsV1 {
  return {
    totalEvents: 0,
    acceptedEvents: 0,
    excludedArtefacts: 0,
    unratedEvents: 0,
    admissibleEvents: 0,
    fullEligibleEvents: 0,
    binOnlyEvents: 0,
    admissibleShareOfAccepted: null,
    admissibleDurationSeconds: [],
    admissibleMeanAccelMps2: [],
  };
}

function isCoverageExactlyOne(coverageRatio: number): boolean {
  return Math.abs(coverageRatio - 1) <= 1e-6;
}

export function evaluateDs4EventIntensityEligibilityV1(input: {
  payload: DiV0MotionCoreShadowPayloadV1;
  event: DiV0MotionCoreShadowPersistedEventRow;
  eventIndex: number;
  speedAuthority: Ds4SpeedAuthorityPartitionV1 | null;
}): Ds4EventIntensityEligibilityRecordV1 {
  const kind = classifyEventKind(input.event.kind);
  const reasonCodes: Ds4EventIntensityReasonCodeV1[] = [];

  if (input.event.quality === 'ARTEFACT_SUSPECT') {
    return {
      eventIndex: input.eventIndex,
      kind,
      classification: 'EXCLUDED_ARTEFACT',
      durationTier: 'UNRATED',
      eventQuality: input.event.quality,
      speedAuthority: input.speedAuthority,
      meanAccelMps2: null,
      durationS: null,
      steps: null,
      coverageRatio: null,
      startUncertaintyS: null,
      endUncertaintyS: null,
      reasonCodes: ['EVENT_EXCLUDED_ARTEFACT'],
      startLabel: input.event.startLabel,
      endLabel: input.event.endLabel,
    };
  }

  const contract = resolveMotionCoreShadowEventRowContract(input.payload);
  if (!isMotionCoreShadowIntensityConsumptionAllowed(contract)) {
    reasonCodes.push('EVENT_INTENSITY_UNAVAILABLE_V1_LEGACY');
    return unratedRecord(input, kind, reasonCodes, null);
  }

  const intensity = readPersistedMotionEventIntensityForPayload(input.payload, input.event);
  if (!intensity) {
    if (input.event.intensity != null) {
      reasonCodes.push('EVENT_INTENSITY_UNAVAILABLE_INVALID');
    } else {
      reasonCodes.push('EVENT_INTENSITY_UNAVAILABLE_CONTRACT');
    }
    return unratedRecord(input, kind, reasonCodes, null);
  }

  const { meanAccelMps2, durationS, steps, coverageRatio, startUncertaintyS, endUncertaintyS } = intensity;

  if (input.event.quality !== 'OK') {
    reasonCodes.push('EVENT_QUALITY_NOT_OK');
    return unratedRecord(input, kind, reasonCodes, intensity);
  }
  if (!isCoverageExactlyOne(coverageRatio)) {
    reasonCodes.push('EVENT_COVERAGE_INCOMPLETE');
    return unratedRecord(input, kind, reasonCodes, intensity);
  }
  if (steps !== durationS) {
    reasonCodes.push('EVENT_STEPS_DURATION_MISMATCH');
    return unratedRecord(input, kind, reasonCodes, intensity);
  }
  if (durationS < MIN_ADMISSIBLE_DURATION_S) {
    reasonCodes.push('EVENT_DURATION_BELOW_MINIMUM');
    return unratedRecord(input, kind, reasonCodes, intensity);
  }

  if (durationS >= 3) {
    reasonCodes.push('EVENT_ADMISSIBLE_FULL_ELIGIBLE');
    return {
      eventIndex: input.eventIndex,
      kind,
      classification: 'ADMISSIBLE_FULL',
      durationTier: 'FULL_ELIGIBLE',
      eventQuality: input.event.quality,
      speedAuthority: input.speedAuthority,
      meanAccelMps2,
      durationS,
      steps,
      coverageRatio,
      startUncertaintyS,
      endUncertaintyS,
      reasonCodes,
      startLabel: input.event.startLabel,
      endLabel: input.event.endLabel,
    };
  }

  reasonCodes.push('EVENT_ADMISSIBLE_BIN_ONLY');
  return {
    eventIndex: input.eventIndex,
    kind,
    classification: 'ADMISSIBLE_BIN_ONLY',
    durationTier: 'BIN_ONLY',
    eventQuality: input.event.quality,
    speedAuthority: input.speedAuthority,
    meanAccelMps2,
    durationS,
    steps,
    coverageRatio,
    startUncertaintyS,
    endUncertaintyS,
    reasonCodes,
    startLabel: input.event.startLabel,
    endLabel: input.event.endLabel,
  };
}

function unratedRecord(
  input: {
    event: DiV0MotionCoreShadowPersistedEventRow;
    eventIndex: number;
    speedAuthority: Ds4SpeedAuthorityPartitionV1 | null;
  },
  kind: Ds4EventIntensityEligibilityRecordV1['kind'],
  reasonCodes: Ds4EventIntensityReasonCodeV1[],
  intensity: {
    meanAccelMps2: number;
    durationS: number;
    steps: number;
    coverageRatio: number;
    startUncertaintyS: string;
    endUncertaintyS: string;
  } | null,
): Ds4EventIntensityEligibilityRecordV1 {
  return {
    eventIndex: input.eventIndex,
    kind,
    classification: 'UNRATED',
    durationTier: 'UNRATED',
    eventQuality: input.event.quality,
    speedAuthority: input.speedAuthority,
    meanAccelMps2: intensity?.meanAccelMps2 ?? null,
    durationS: intensity?.durationS ?? null,
    steps: intensity?.steps ?? null,
    coverageRatio: intensity?.coverageRatio ?? null,
    startUncertaintyS: intensity?.startUncertaintyS ?? null,
    endUncertaintyS: intensity?.endUncertaintyS ?? null,
    reasonCodes,
    startLabel: input.event.startLabel,
    endLabel: input.event.endLabel,
  };
}

export function aggregateDs4EventIntensityEligibilityV1(input: {
  payload: DiV0MotionCoreShadowPayloadV1;
  speedAuthority: Ds4SpeedAuthorityPartitionV1 | null;
}): {
  records: Ds4EventIntensityEligibilityRecordV1[];
  acceleration: Ds4ManoeuvreKindIntensityCountsV1;
  deceleration: Ds4ManoeuvreKindIntensityCountsV1;
  admissibleOrdinalValues: { acceleration: number[]; deceleration: number[] };
  ratedEventCount: number;
  unratedEventCount: number;
} {
  const records: Ds4EventIntensityEligibilityRecordV1[] = [];
  const acceleration = emptyKindCounts();
  const deceleration = emptyKindCounts();
  const admissibleOrdinalValues = { acceleration: [] as number[], deceleration: [] as number[] };

  const events = input.payload.events ?? [];
  for (let i = 0; i < events.length; i++) {
    const record = evaluateDs4EventIntensityEligibilityV1({
      payload: input.payload,
      event: events[i]!,
      eventIndex: i,
      speedAuthority: input.speedAuthority,
    });
    records.push(record);

    const bucket = record.kind === 'ACCELERATION' ? acceleration : record.kind === 'DECELERATION' ? deceleration : null;
    if (bucket) {
      bucket.totalEvents += 1;
      if (record.classification === 'EXCLUDED_ARTEFACT') {
        bucket.excludedArtefacts += 1;
      } else {
        bucket.acceptedEvents += 1;
      }
      if (record.classification === 'UNRATED') {
        bucket.unratedEvents += 1;
      }
      if (record.classification === 'ADMISSIBLE_FULL' || record.classification === 'ADMISSIBLE_BIN_ONLY') {
        bucket.admissibleEvents += 1;
        if (record.meanAccelMps2 != null) {
          bucket.admissibleMeanAccelMps2.push(record.meanAccelMps2);
          bucket.admissibleDurationSeconds.push(record.durationS ?? 0);
        }
        if (record.classification === 'ADMISSIBLE_FULL') {
          bucket.fullEligibleEvents += 1;
        } else {
          bucket.binOnlyEvents += 1;
        }
        if (record.kind === 'ACCELERATION' && record.meanAccelMps2 != null) {
          admissibleOrdinalValues.acceleration.push(record.meanAccelMps2);
        }
        if (record.kind === 'DECELERATION' && record.meanAccelMps2 != null) {
          admissibleOrdinalValues.deceleration.push(record.meanAccelMps2);
        }
      }
    }
  }

  for (const bucket of [acceleration, deceleration]) {
    bucket.admissibleMeanAccelMps2.sort((a, b) => a - b);
    bucket.admissibleDurationSeconds.sort((a, b) => a - b);
    bucket.admissibleShareOfAccepted =
      bucket.acceptedEvents > 0 ? bucket.admissibleEvents / bucket.acceptedEvents : null;
  }
  admissibleOrdinalValues.acceleration.sort((a, b) => a - b);
  admissibleOrdinalValues.deceleration.sort((a, b) => a - b);

  const ratedEventCount = acceleration.admissibleEvents + deceleration.admissibleEvents;
  const unratedEventCount =
    acceleration.unratedEvents +
    deceleration.unratedEvents +
    acceleration.excludedArtefacts +
    deceleration.excludedArtefacts;

  return {
    records,
    acceleration,
    deceleration,
    admissibleOrdinalValues,
    ratedEventCount,
    unratedEventCount,
  };
}
