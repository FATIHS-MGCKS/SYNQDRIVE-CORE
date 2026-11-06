import type { Prisma } from '@prisma/client';
import type { FsdDiscoverySignalEvidenceState } from '@prisma/client';
import {
  classifyNumericObservation,
  isValidValueBucket,
  summarizeSignalBucketObservations,
  type FsdBucketObservationV1,
  type FsdCoverageSummaryV1,
} from '../fsd-coverage.calculator.v1';
import type { FsdHistoricalWindowV1 } from '../fsd-query-document.builder.v1';
import type { FsdGraphqlResponseInterpretationV1 } from '../fsd-response.interpreter.v1';
import { mapFsd3PlannerEvidenceToPersistenceState } from './fsd3-evidence.mapper.v1';
import type { Fsd4HistoricalObservationV1 } from './fsd4-provider.port.v1';

const LOCATION_FIELDS_FOR_HISTORICAL_BUCKETS = new Set([
  'currentLocationCoordinates',
  'currentLocationApproximateCoordinates',
]);

export function observationsToBucketSeries(
  fieldName: string,
  observations: readonly Fsd4HistoricalObservationV1[],
): FsdBucketObservationV1[] {
  if (LOCATION_FIELDS_FOR_HISTORICAL_BUCKETS.has(fieldName)) {
    return observations.map((o) => {
      if (o.latitude != null && o.longitude != null) {
        const lat = o.latitude;
        const lon = o.longitude;
        if (Number.isFinite(lat) && Number.isFinite(lon)) {
          return { timestampMs: o.timestampMs, numericValue: 1 };
        }
        return { timestampMs: o.timestampMs, numericValue: Number.POSITIVE_INFINITY };
      }
      return {
        timestampMs: o.timestampMs,
        numericValue: o.numericValue,
      };
    });
  }
  return observations.map((o) => ({
    timestampMs: o.timestampMs,
    numericValue: o.numericValue,
  }));
}

export function buildHistoricalCoverageQualityJson(input: {
  coverage: FsdCoverageSummaryV1;
  coSelectedFieldCount: number;
  fieldName: string;
}): Prisma.InputJsonValue {
  return {
    coverageAggregateOnly: true,
    fieldName: input.fieldName,
    coSelectedFieldCount: input.coSelectedFieldCount,
    expectedBucketPositions: input.coverage.expectedBucketPositions,
    validValueBucketCount: input.coverage.validValueBucketCount,
    validValueCoverageRatio: input.coverage.validValueCoverageRatio,
    nullBucketCount: input.coverage.nullBucketCount,
    missingBucketCount: input.coverage.missingBucketCount,
    invalidBucketCount: input.coverage.invalidBucketCount,
    zeroValueBucketCount: input.coverage.zeroValueBucketCount,
    duplicateTimestampsIgnored: input.coverage.duplicateTimestampsIgnored,
    collidingBucketObservationsIgnored: input.coverage.collidingBucketObservationsIgnored,
    outOfWindowObservations: input.coverage.outOfWindowObservations,
  };
}

export function mapHistoricalFieldEvidence(input: {
  window: FsdHistoricalWindowV1;
  fieldName: string;
  observations: readonly Fsd4HistoricalObservationV1[];
  coSelectedFieldCount: number;
  fieldInterpretation: FsdGraphqlResponseInterpretationV1['fields'][number] | undefined;
}): {
  evidenceState: FsdDiscoverySignalEvidenceState;
  queryAccepted: boolean | null;
  observedValue: boolean | null;
  qualityJson: Prisma.InputJsonValue;
  coverage: FsdCoverageSummaryV1;
} {
  const bucketSeries = observationsToBucketSeries(input.fieldName, input.observations);
  const coverage = summarizeSignalBucketObservations({
    window: input.window,
    observations: bucketSeries,
    coSelectedFieldCount: input.coSelectedFieldCount,
  });

  const interpretation = input.fieldInterpretation;
  const baseEvidence = interpretation?.evidence ?? {
    declared: true,
    schemaCompatible: true,
    queryPlanned: true,
    queryAccepted: false,
  };

  let queryAccepted = baseEvidence.queryAccepted === true;
  let observedValue: boolean | null = null;

  if (queryAccepted && input.coSelectedFieldCount > 1) {
    const hasOwnValid = bucketSeries.some((o) =>
      isValidValueBucket(classifyNumericObservation(o.numericValue)),
    );
    const hasOwnInvalidLocation =
      LOCATION_FIELDS_FOR_HISTORICAL_BUCKETS.has(input.fieldName) &&
      bucketSeries.some((o) => classifyNumericObservation(o.numericValue) === 'INVALID');
    queryAccepted = hasOwnValid || hasOwnInvalidLocation;
  }

  if (queryAccepted) {
    observedValue = coverage.validValueBucketCount > 0;
    if (input.fieldName === 'powertrainRange' && coverage.nullBucketCount > 0 && coverage.validValueBucketCount === 0) {
      observedValue = false;
    }
  }

  const invalidObserved =
    queryAccepted &&
    LOCATION_FIELDS_FOR_HISTORICAL_BUCKETS.has(input.fieldName) &&
    coverage.invalidBucketCount > 0 &&
    coverage.validValueBucketCount === 0;

  const dimensions = {
    ...baseEvidence,
    queryAccepted,
    observedValue: observedValue === true,
    observedNull:
      coverage.nullBucketCount > 0 &&
      coverage.validValueBucketCount === 0 &&
      !invalidObserved,
    queryFailed: baseEvidence.queryFailed === true || invalidObserved,
    notObserved: !queryAccepted,
  };

  return {
    evidenceState: mapFsd3PlannerEvidenceToPersistenceState(dimensions),
    queryAccepted,
    observedValue,
    qualityJson: buildHistoricalCoverageQualityJson({
      coverage,
      coSelectedFieldCount: input.coSelectedFieldCount,
      fieldName: input.fieldName,
    }),
    coverage,
  };
}
