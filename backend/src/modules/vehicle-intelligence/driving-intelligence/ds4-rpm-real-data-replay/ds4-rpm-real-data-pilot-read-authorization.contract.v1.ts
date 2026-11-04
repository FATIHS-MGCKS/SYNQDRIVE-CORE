export const DS4_RPM_REAL_DATA_PILOT_READ_AUTHORIZATION_CONTRACT_VERSION =
  'ds4-rpm-real-data-pilot-read-authorization-v1' as const;

/**
 * Trusted execution boundary clock — must be supplied by the executor runtime.
 * Must never be derived from {@link Ds4RpmRealDataPilotReadRequestV1.requestedAtIso}.
 */
export type Ds4RpmRealDataPilotReadTrustedExecutionBoundaryV1 = {
  evaluatedAtIso: string;
};

/**
 * Trusted execution context — enforced outside attestation bundles.
 * PR-B3 validates scope only; does not execute reads.
 *
 * `ownerAttestationReference` is an opaque owner record id — not verified trust by itself.
 * Future production read permission requires independently trusted execution context (out of scope PR-B3).
 */
export type Ds4RpmRealDataPilotReadAuthorizationContextV1 = {
  contractVersion: typeof DS4_RPM_REAL_DATA_PILOT_READ_AUTHORIZATION_CONTRACT_VERSION;
  authorizationRecordId: string;
  ownerAttestationReference: string;
  organizationId: string;
  vehicleId: string;
  allowedTripIds: readonly string[];
  providerSourceLinkId: string;
  queryFromIso: string;
  queryToIso: string;
  maxResponseRows: number;
  maxQueryBudgetUnits: number;
  readOnly: true;
  issuedAtIso: string;
  expiresAtIso: string;
};

export type Ds4RpmRealDataPilotReadRequestV1 = {
  organizationId: string;
  vehicleId: string;
  tripId: string;
  providerSourceLinkId: string;
  queryFromIso: string;
  queryToIso: string;
  estimatedResponseRows: number;
  estimatedQueryBudgetUnits: number;
  /** Audit metadata only — not used for authorization expiry. */
  requestedAtIso: string;
};

export type Ds4RpmRealDataPilotReadAuthorizationDecisionV1 =
  | {
      allowed: true;
      auditTrailId: string;
      /** Scope validation succeeded — not permission to execute production reads. */
      scopeValidationOnly: true;
      productionReadPermitted: false;
    }
  | { allowed: false; reasonCode: string; auditTrailId: string };

export type Ds4RpmRealDataPilotReadAuditEntryV1 = {
  auditTrailId: string;
  authorizationRecordId: string;
  decision: 'ALLOW' | 'DENY';
  reasonCode: string;
  requestFingerprint: string;
  scopeSummary: {
    organizationId: string;
    vehicleId: string;
    tripId: string;
    providerSourceLinkId: string;
  };
};

/**
 * Future live executor must also enforce ACTUAL row counts, provider response sizes,
 * and billed query cost against the same authorization record (estimate-only here).
 */
export const DS4_RPM_REAL_DATA_PILOT_READ_ACTUAL_COST_ENFORCEMENT_NOTE =
  'FUTURE_EXECUTOR_MUST_ENFORCE_ACTUAL_ROWS_AND_PROVIDER_QUERY_COST' as const;

export const DS4_RPM_REAL_DATA_PILOT_LIVE_READ_EXECUTION_FORBIDDEN_IN_PR_B3 = true as const;
