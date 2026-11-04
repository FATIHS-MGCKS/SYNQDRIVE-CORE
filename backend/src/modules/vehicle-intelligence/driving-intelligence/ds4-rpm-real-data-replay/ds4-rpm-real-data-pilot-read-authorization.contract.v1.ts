export const DS4_RPM_REAL_DATA_PILOT_READ_AUTHORIZATION_CONTRACT_VERSION =
  'ds4-rpm-real-data-pilot-read-authorization-v1' as const;

/**
 * Trusted execution context — enforced outside attestation bundles.
 * PR-B3 defines and validates shape only; does not execute reads.
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
  requestedAtIso: string;
};

export type Ds4RpmRealDataPilotReadAuthorizationDecisionV1 =
  | { allowed: true; auditTrailId: string }
  | { allowed: false; reasonCode: string; auditTrailId: string };

export type Ds4RpmRealDataPilotReadAuditEntryV1 = {
  auditTrailId: string;
  authorizationRecordId: string;
  decision: 'ALLOW' | 'DENY';
  reasonCode: string;
  requestFingerprint: string;
  /** No query payloads or secrets. */
  scopeSummary: {
    organizationId: string;
    vehicleId: string;
    tripId: string;
    providerSourceLinkId: string;
  };
};

/** Hard guard — live pilot reads are out of scope for PR-B3. */
export const DS4_RPM_REAL_DATA_PILOT_LIVE_READ_EXECUTION_FORBIDDEN_IN_PR_B3 = true as const;
