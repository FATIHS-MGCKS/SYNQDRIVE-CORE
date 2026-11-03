import { VSI_DISCOVERY_CH_MAX_POINTS_PER_SIGNAL } from './vsi-clickhouse-discovery-safety.contract';
import {
  VsiEvidenceAxisEvaluationState,
  VsiEvidenceAxisNotEvaluatedReason,
} from './vsi-native-signal-discovery-evaluation-state';
import type { VsiNativeSignalDiscoveryInventoryV1 } from './vsi-native-signal-discovery-inventory.contract';

export type VsiHfHistoricalEvaluationContextV1 = {
  evaluatedWindow: { start: Date; end: Date };
  hadAttributableTrips: boolean;
  attributionAmbiguous: boolean;
  chUnavailable: boolean;
  hadTripQueryFailure: boolean;
  attributableTripQueryCount: number;
  /** All attributable trips received SUCCESS or EMPTY (not QUERY_FAILED / UNAVAILABLE). */
  attributableQueriesComplete: boolean;
  unionCapOmitted: boolean;
  hadQueryTimeout: boolean;
};

type SignalAggregateSlice = {
  pointCount: number;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
  tripCountWithPoints: number;
  windowStartAt: string | null;
  windowEndAt: string | null;
  readCapApplied: number | null;
  queryFailed: boolean;
};

function windowSampleMetadata(
  evaluatedWindow: { start: Date; end: Date },
  overrides: Partial<
    VsiNativeSignalDiscoveryInventoryV1['entries'][number]['historical']['sampleMetadata']
  > = {},
): VsiNativeSignalDiscoveryInventoryV1['entries'][number]['historical']['sampleMetadata'] {
  return {
    windowStartAt: evaluatedWindow.start.toISOString(),
    windowEndAt: evaluatedWindow.end.toISOString(),
    pointCount: null,
    tripCountWithPoints: null,
    readCapApplied: null,
    ...overrides,
  };
}

/**
 * Builds historical axis for one union key after bounded CH trip aggregation.
 * Never emits SNAPSHOT_EXTRACTOR_NOT_RUN on the historical axis.
 */
export function buildHistoricalAxisForUnionNativeKey(input: {
  nativeName: string;
  aggregate: SignalAggregateSlice | undefined;
  context: VsiHfHistoricalEvaluationContextV1;
}): VsiNativeSignalDiscoveryInventoryV1['entries'][number]['historical'] {
  const { context, aggregate } = input;
  const metaBase = windowSampleMetadata(context.evaluatedWindow);

  if (context.unionCapOmitted) {
    return {
      evaluation: {
        state: VsiEvidenceAxisEvaluationState.NOT_EVALUATED,
        notEvaluatedReason: VsiEvidenceAxisNotEvaluatedReason.HF_UNION_SIGNAL_CAP_OMITTED,
      },
      firstSeenAt: null,
      lastSeenAt: null,
      sampleMetadata: metaBase,
    };
  }

  if (context.chUnavailable) {
    return {
      evaluation: {
        state: VsiEvidenceAxisEvaluationState.NOT_EVALUATED,
        notEvaluatedReason: VsiEvidenceAxisNotEvaluatedReason.HF_MIRROR_UNAVAILABLE,
      },
      firstSeenAt: null,
      lastSeenAt: null,
      sampleMetadata: metaBase,
    };
  }

  if (context.attributionAmbiguous) {
    return {
      evaluation: {
        state: VsiEvidenceAxisEvaluationState.NOT_EVALUATED,
        notEvaluatedReason: VsiEvidenceAxisNotEvaluatedReason.LINK_ATTRIBUTION_AMBIGUOUS,
      },
      firstSeenAt: null,
      lastSeenAt: null,
      sampleMetadata: metaBase,
    };
  }

  if (!context.hadAttributableTrips) {
    return {
      evaluation: {
        state: VsiEvidenceAxisEvaluationState.NOT_EVALUATED,
        notEvaluatedReason: VsiEvidenceAxisNotEvaluatedReason.HF_NO_ATTRIBUTABLE_TRIPS,
      },
      firstSeenAt: null,
      lastSeenAt: null,
      sampleMetadata: metaBase,
    };
  }

  if (context.hadQueryTimeout) {
    return {
      evaluation: {
        state: VsiEvidenceAxisEvaluationState.NOT_EVALUATED,
        notEvaluatedReason: VsiEvidenceAxisNotEvaluatedReason.HF_QUERY_TIMEOUT,
      },
      firstSeenAt: null,
      lastSeenAt: null,
      sampleMetadata: metaBase,
    };
  }

  if (aggregate?.queryFailed) {
    return {
      evaluation: {
        state: VsiEvidenceAxisEvaluationState.NOT_EVALUATED,
        notEvaluatedReason: VsiEvidenceAxisNotEvaluatedReason.HF_READ_FAILED,
      },
      firstSeenAt: null,
      lastSeenAt: null,
      sampleMetadata: metaBase,
    };
  }

  if (!context.attributableQueriesComplete) {
    return {
      evaluation: {
        state: VsiEvidenceAxisEvaluationState.NOT_EVALUATED,
        notEvaluatedReason: VsiEvidenceAxisNotEvaluatedReason.HF_MIRROR_INCOMPLETE,
      },
      firstSeenAt: null,
      lastSeenAt: null,
      sampleMetadata: metaBase,
    };
  }

  if (!aggregate || aggregate.pointCount <= 0) {
    return {
      evaluation: { state: VsiEvidenceAxisEvaluationState.EVALUATED_NOT_OBSERVED },
      firstSeenAt: null,
      lastSeenAt: null,
      sampleMetadata: windowSampleMetadata(context.evaluatedWindow, {
        pointCount: 0,
        tripCountWithPoints: 0,
        readCapApplied: VSI_DISCOVERY_CH_MAX_POINTS_PER_SIGNAL,
      }),
    };
  }

  return {
    evaluation: { state: VsiEvidenceAxisEvaluationState.EVALUATED_OBSERVED },
    firstSeenAt: aggregate.firstSeenAt,
    lastSeenAt: aggregate.lastSeenAt,
    sampleMetadata: {
      windowStartAt: aggregate.windowStartAt ?? context.evaluatedWindow.start.toISOString(),
      windowEndAt: aggregate.windowEndAt ?? context.evaluatedWindow.end.toISOString(),
      pointCount: aggregate.pointCount,
      tripCountWithPoints: aggregate.tripCountWithPoints,
      readCapApplied: aggregate.readCapApplied,
    },
  };
}
