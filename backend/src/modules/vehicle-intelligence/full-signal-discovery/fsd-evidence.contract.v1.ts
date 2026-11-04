/** Independent evidence dimensions — not a single mutually exclusive lifecycle enum. */
export type FsdEvidenceDimensionsV1 = {
  declared: boolean;
  schemaCompatible: boolean;
  queryPlanned: boolean;
  /** Set only after a provider response is interpreted — never by the planner. */
  queryAccepted?: boolean;
  observedValue?: boolean;
  observedNull?: boolean;
  notObserved?: boolean;
  queryFailed?: boolean;
  notEvaluable?: boolean;
};

export type FsdHistoricalFrequencyClassV1 = 'AGGREGATED_1S' | 'NATIVE_CADENCE_UNKNOWN';

export type FsdValueObservationKindV1 =
  | 'VALID_NONZERO'
  | 'VALID_ZERO'
  | 'NULL'
  | 'MISSING'
  | 'INVALID';

export type FsdUnsupportedPlanningReasonV1 =
  | 'INVALID_GRAPHQL_FIELD_NAME'
  | 'UNKNOWN_SHAPE_NOT_PLANNED_IN_FSD1'
  | 'STRING_HISTORICAL_UNSUPPORTED'
  | 'LATEST_ONLY_FIELD'
  | 'DEFERRED_BY_REQUEST_BUDGET'
  | 'NOT_DECLARED';

export function createPlannerStageEvidenceDimensions(input: {
  declared: boolean;
  schemaCompatible: boolean;
  queryPlanned: boolean;
  notEvaluable?: boolean;
}): FsdEvidenceDimensionsV1 {
  return {
    declared: input.declared,
    schemaCompatible: input.schemaCompatible,
    queryPlanned: input.queryPlanned,
    notEvaluable: input.notEvaluable ?? !input.queryPlanned,
  };
}
