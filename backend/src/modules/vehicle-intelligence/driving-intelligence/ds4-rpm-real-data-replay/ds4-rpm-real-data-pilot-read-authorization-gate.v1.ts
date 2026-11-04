import type { TelemetrySourceFamily } from '../../telemetry-source-family';
import { hasUncertainHistoricalObdRecordTime } from '../../telemetry-source-family';
import type {
  Ds4RpmRealDataHistoricalTimestampTrustLevelV1,
} from './ds4-rpm-real-data-source-attestation.contract.v1';
import type {
  Ds4RpmRealDataPilotReadAuditEntryV1,
  Ds4RpmRealDataPilotReadAuthorizationContextV1,
  Ds4RpmRealDataPilotReadAuthorizationDecisionV1,
  Ds4RpmRealDataPilotReadRequestV1,
  Ds4RpmRealDataPilotReadTrustedExecutionBoundaryV1,
} from './ds4-rpm-real-data-pilot-read-authorization.contract.v1';
import { computeDs4RpmRealDataPilotReadRequestFingerprintV1 } from './ds4-rpm-real-data-attestation-fingerprint.v1';

function auditId(prefix: string, fingerprint: string): string {
  return `${prefix}:${fingerprint.slice(0, 16)}`;
}

function deny(
  prefix: string,
  reasonCode: string,
  requestFingerprint: string,
  ctx: Ds4RpmRealDataPilotReadAuthorizationContextV1 | null,
  baseAudit: Ds4RpmRealDataPilotReadAuditEntryV1['scopeSummary'],
): {
  decision: Ds4RpmRealDataPilotReadAuthorizationDecisionV1;
  auditEntry: Ds4RpmRealDataPilotReadAuditEntryV1;
} {
  const auditTrailId = auditId(prefix, requestFingerprint);
  return {
    decision: { allowed: false, reasonCode, auditTrailId },
    auditEntry: {
      auditTrailId,
      authorizationRecordId: ctx?.authorizationRecordId ?? 'NONE',
      decision: 'DENY',
      reasonCode,
      requestFingerprint,
      scopeSummary: baseAudit,
    },
  };
}

/** Parse ISO-8601 instant to epoch ms; rejects non-finite and unparseable values. */
export function parseIsoInstantToEpochMs(iso: string): number | null {
  if (typeof iso !== 'string' || iso.trim() === '') return null;
  const ms = Date.parse(iso.trim());
  if (!Number.isFinite(ms)) return null;
  return ms;
}

function isPositiveInteger(n: number): boolean {
  return Number.isFinite(n) && Number.isInteger(n) && n > 0;
}

function isNonNegativeInteger(n: number): boolean {
  return Number.isFinite(n) && Number.isInteger(n) && n >= 0;
}

const VALID_TELEMETRY_FAMILIES: ReadonlySet<TelemetrySourceFamily> = new Set([
  'RUPTELA_R1',
  'API_SYNTHETIC',
  'UNKNOWN',
]);

export function evaluateDs4RpmRealDataPilotReadAuthorizationV1(input: {
  context: Ds4RpmRealDataPilotReadAuthorizationContextV1 | null;
  request: Ds4RpmRealDataPilotReadRequestV1;
  trustedExecutionBoundary: Ds4RpmRealDataPilotReadTrustedExecutionBoundaryV1;
}): {
  decision: Ds4RpmRealDataPilotReadAuthorizationDecisionV1;
  auditEntry: Ds4RpmRealDataPilotReadAuditEntryV1;
} {
  const requestFingerprint = computeDs4RpmRealDataPilotReadRequestFingerprintV1(input.request);
  const baseAudit = {
    requestFingerprint,
    scopeSummary: {
      organizationId: input.request.organizationId,
      vehicleId: input.request.vehicleId,
      tripId: input.request.tripId,
      providerSourceLinkId: input.request.providerSourceLinkId,
    },
  };

  if (input.context == null) {
    return deny(
      'deny-no-context',
      'AUTHORIZATION_CONTEXT_MISSING',
      requestFingerprint,
      null,
      baseAudit.scopeSummary,
    );
  }

  const ctx = input.context;

  if (ctx.readOnly !== true) {
    return deny(
      'deny-readonly',
      'AUTHORIZATION_READ_ONLY_REQUIRED',
      requestFingerprint,
      ctx,
      baseAudit.scopeSummary,
    );
  }

  const evaluatedMs = parseIsoInstantToEpochMs(input.trustedExecutionBoundary.evaluatedAtIso);
  if (evaluatedMs == null) {
    return deny(
      'deny-trusted-time',
      'TRUSTED_EVALUATION_TIME_INVALID',
      requestFingerprint,
      ctx,
      baseAudit.scopeSummary,
    );
  }

  const issuedMs = parseIsoInstantToEpochMs(ctx.issuedAtIso);
  const expiresMs = parseIsoInstantToEpochMs(ctx.expiresAtIso);
  if (issuedMs == null || expiresMs == null) {
    return deny(
      'deny-auth-interval',
      'AUTHORIZATION_VALIDITY_INTERVAL_INVALID',
      requestFingerprint,
      ctx,
      baseAudit.scopeSummary,
    );
  }

  if (issuedMs >= expiresMs) {
    return deny(
      'deny-auth-interval',
      'AUTHORIZATION_VALIDITY_INTERVAL_INVALID',
      requestFingerprint,
      ctx,
      baseAudit.scopeSummary,
    );
  }

  if (evaluatedMs < issuedMs || evaluatedMs >= expiresMs) {
    return deny(
      'deny-expired',
      'AUTHORIZATION_EXPIRED_OR_NOT_YET_VALID',
      requestFingerprint,
      ctx,
      baseAudit.scopeSummary,
    );
  }

  if (!ctx.authorizationRecordId?.trim() || !ctx.ownerAttestationReference?.trim()) {
    return deny(
      'deny-forged-meta',
      'AUTHORIZATION_METADATA_INCOMPLETE',
      requestFingerprint,
      ctx,
      baseAudit.scopeSummary,
    );
  }

  if (!isPositiveInteger(ctx.maxResponseRows) || !isPositiveInteger(ctx.maxQueryBudgetUnits)) {
    return deny(
      'deny-auth-limits',
      'AUTHORIZATION_LIMITS_INVALID',
      requestFingerprint,
      ctx,
      baseAudit.scopeSummary,
    );
  }

  for (const field of [
    ctx.organizationId,
    ctx.vehicleId,
    ctx.providerSourceLinkId,
    input.request.organizationId,
    input.request.vehicleId,
    input.request.tripId,
    input.request.providerSourceLinkId,
  ]) {
    if (typeof field !== 'string' || field.trim() === '') {
      return deny(
        'deny-empty-scope',
        'SCOPE_FIELD_EMPTY',
        requestFingerprint,
        ctx,
        baseAudit.scopeSummary,
      );
    }
  }

  if (input.request.organizationId !== ctx.organizationId) {
    return deny(
      'deny-org',
      'ORGANIZATION_SCOPE_MISMATCH',
      requestFingerprint,
      ctx,
      baseAudit.scopeSummary,
    );
  }

  if (input.request.vehicleId !== ctx.vehicleId) {
    return deny(
      'deny-vehicle',
      'VEHICLE_SCOPE_MISMATCH',
      requestFingerprint,
      ctx,
      baseAudit.scopeSummary,
    );
  }

  if (!ctx.allowedTripIds.includes(input.request.tripId)) {
    return deny(
      'deny-trip',
      'TRIP_NOT_IN_ALLOWLIST',
      requestFingerprint,
      ctx,
      baseAudit.scopeSummary,
    );
  }

  if (input.request.providerSourceLinkId !== ctx.providerSourceLinkId) {
    return deny(
      'deny-link',
      'SOURCE_LINK_SCOPE_MISMATCH',
      requestFingerprint,
      ctx,
      baseAudit.scopeSummary,
    );
  }

  const authFromMs = parseIsoInstantToEpochMs(ctx.queryFromIso);
  const authToMs = parseIsoInstantToEpochMs(ctx.queryToIso);
  const reqFromMs = parseIsoInstantToEpochMs(input.request.queryFromIso);
  const reqToMs = parseIsoInstantToEpochMs(input.request.queryToIso);

  if (authFromMs == null || authToMs == null || reqFromMs == null || reqToMs == null) {
    return deny(
      'deny-window-parse',
      'QUERY_WINDOW_MALFORMED',
      requestFingerprint,
      ctx,
      baseAudit.scopeSummary,
    );
  }

  if (authFromMs >= authToMs || reqFromMs >= reqToMs) {
    return deny(
      'deny-window-reversed',
      'QUERY_WINDOW_REVERSED_OR_EMPTY',
      requestFingerprint,
      ctx,
      baseAudit.scopeSummary,
    );
  }

  if (reqFromMs < authFromMs || reqToMs > authToMs) {
    return deny(
      'deny-window',
      'TIME_WINDOW_EXCEEDS_AUTHORIZATION',
      requestFingerprint,
      ctx,
      baseAudit.scopeSummary,
    );
  }

  if (
    !isPositiveInteger(input.request.estimatedResponseRows) ||
    input.request.estimatedResponseRows > ctx.maxResponseRows
  ) {
    return deny(
      'deny-size',
      'RESPONSE_SIZE_LIMIT_EXCEEDED',
      requestFingerprint,
      ctx,
      baseAudit.scopeSummary,
    );
  }

  if (
    !isPositiveInteger(input.request.estimatedQueryBudgetUnits) ||
    input.request.estimatedQueryBudgetUnits > ctx.maxQueryBudgetUnits
  ) {
    return deny(
      'deny-budget',
      'QUERY_BUDGET_EXCEEDED',
      requestFingerprint,
      ctx,
      baseAudit.scopeSummary,
    );
  }

  const auditTrailId = auditId('allow-scope', requestFingerprint);
  return {
    decision: {
      allowed: true,
      auditTrailId,
      scopeValidationOnly: true,
      productionReadPermitted: false,
    },
    auditEntry: {
      auditTrailId,
      authorizationRecordId: ctx.authorizationRecordId,
      decision: 'ALLOW',
      reasonCode: 'SCOPE_VALIDATION_PASSED_NOT_PRODUCTION_READ_PERMISSION',
      ...baseAudit,
    },
  };
}

export function assertDs4RpmRealDataPilotLiveReadNotExecutedInPrB3(): void {
  if (process.env.DS4_RPM_REAL_DATA_PILOT_LIVE_READ_EXECUTED === '1') {
    throw new Error('DS4_RPM_REAL_DATA_PILOT_LIVE_READ_FORBIDDEN_IN_PR_B3');
  }
}

/**
 * Historical OBD point-time correlation is never authorized by scope validation alone.
 * Non-R1 family classification does not prove timestamp authority.
 */
export function authorizationWouldPermitR1HistoricalPointTimeCorrelation(input: {
  telemetrySourceFamily: string | null;
  historicalTimestampTrust?: Ds4RpmRealDataHistoricalTimestampTrustLevelV1 | null;
}): boolean {
  const family = input.telemetrySourceFamily;
  if (family == null || !VALID_TELEMETRY_FAMILIES.has(family as TelemetrySourceFamily)) {
    return false;
  }
  if (family === 'UNKNOWN') return false;
  if (hasUncertainHistoricalObdRecordTime(family as TelemetrySourceFamily)) return false;
  if (input.historicalTimestampTrust !== 'API_SYNTHETIC_BUCKET_LABEL_ONLY') {
    return false;
  }
  return false;
}
