/**
 * Minimal GraphQL error surface shared by DIMO telemetry (FSD path) and FSD planners.
 * Kept in dimo/ so production pipelines do not import the FSD planner package (planner regression guard).
 */

export type FsdGraphqlErrorPathSegment = string | number;

export type FsdGraphqlErrorV1 = {
  message?: string;
  path?: readonly FsdGraphqlErrorPathSegment[];
};
