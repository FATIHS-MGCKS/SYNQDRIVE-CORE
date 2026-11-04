import { hasUncertainHistoricalObdRecordTime } from '../../telemetry-source-family';
import type {
  Ds4RpmRealDataPilotReadAuditEntryV1,
  Ds4RpmRealDataPilotReadAuthorizationContextV1,
  Ds4RpmRealDataPilotReadAuthorizationDecisionV1,
  Ds4RpmRealDataPilotReadRequestV1,
} from './ds4-rpm-real-data-pilot-read-authorization.contract.v1';
import { computeDs4RpmRealDataPilotReadRequestFingerprintV1 } from './ds4-rpm-real-data-attestation-fingerprint.v1';

function auditId(prefix: string, fingerprint: string): string {
  return `${prefix}:${fingerprint.slice(0, 16)}`;
}

export function evaluateDs4RpmRealDataPilotReadAuthorizationV1(input: {
  context: Ds4RpmRealDataPilotReadAuthorizationContextV1 | null;
  request: Ds4RpmRealDataPilotReadRequestV1;
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
    const auditTrailId = auditId('deny-no-context', requestFingerprint);
    return {
      decision: { allowed: false, reasonCode: 'AUTHORIZATION_CONTEXT_MISSING', auditTrailId },
      auditEntry: {
        auditTrailId,
        authorizationRecordId: 'NONE',
        decision: 'DENY',
        reasonCode: 'AUTHORIZATION_CONTEXT_MISSING',
        ...baseAudit,
      },
    };
  }

  const ctx = input.context;
  const nowMs = Date.parse(input.request.requestedAtIso);
  const expiresMs = Date.parse(ctx.expiresAtIso);
  const issuedMs = Date.parse(ctx.issuedAtIso);

  if (Number.isNaN(nowMs) || Number.isNaN(expiresMs) || nowMs > expiresMs) {
    const auditTrailId = auditId('deny-expired', requestFingerprint);
    return {
      decision: { allowed: false, reasonCode: 'AUTHORIZATION_EXPIRED', auditTrailId },
      auditEntry: {
        auditTrailId,
        authorizationRecordId: ctx.authorizationRecordId,
        decision: 'DENY',
        reasonCode: 'AUTHORIZATION_EXPIRED',
        ...baseAudit,
      },
    };
  }

  if (nowMs < issuedMs) {
    const auditTrailId = auditId('deny-not-yet-valid', requestFingerprint);
    return {
      decision: { allowed: false, reasonCode: 'AUTHORIZATION_NOT_YET_VALID', auditTrailId },
      auditEntry: {
        auditTrailId,
        authorizationRecordId: ctx.authorizationRecordId,
        decision: 'DENY',
        reasonCode: 'AUTHORIZATION_NOT_YET_VALID',
        ...baseAudit,
      },
    };
  }

  if (input.request.organizationId !== ctx.organizationId) {
    const auditTrailId = auditId('deny-org', requestFingerprint);
    return {
      decision: { allowed: false, reasonCode: 'ORGANIZATION_SCOPE_MISMATCH', auditTrailId },
      auditEntry: {
        auditTrailId,
        authorizationRecordId: ctx.authorizationRecordId,
        decision: 'DENY',
        reasonCode: 'ORGANIZATION_SCOPE_MISMATCH',
        ...baseAudit,
      },
    };
  }

  if (input.request.vehicleId !== ctx.vehicleId) {
    const auditTrailId = auditId('deny-vehicle', requestFingerprint);
    return {
      decision: { allowed: false, reasonCode: 'VEHICLE_SCOPE_MISMATCH', auditTrailId },
      auditEntry: {
        auditTrailId,
        authorizationRecordId: ctx.authorizationRecordId,
        decision: 'DENY',
        reasonCode: 'VEHICLE_SCOPE_MISMATCH',
        ...baseAudit,
      },
    };
  }

  if (!ctx.allowedTripIds.includes(input.request.tripId)) {
    const auditTrailId = auditId('deny-trip', requestFingerprint);
    return {
      decision: { allowed: false, reasonCode: 'TRIP_NOT_IN_ALLOWLIST', auditTrailId },
      auditEntry: {
        auditTrailId,
        authorizationRecordId: ctx.authorizationRecordId,
        decision: 'DENY',
        reasonCode: 'TRIP_NOT_IN_ALLOWLIST',
        ...baseAudit,
      },
    };
  }

  if (input.request.providerSourceLinkId !== ctx.providerSourceLinkId) {
    const auditTrailId = auditId('deny-link', requestFingerprint);
    return {
      decision: { allowed: false, reasonCode: 'SOURCE_LINK_SCOPE_MISMATCH', auditTrailId },
      auditEntry: {
        auditTrailId,
        authorizationRecordId: ctx.authorizationRecordId,
        decision: 'DENY',
        reasonCode: 'SOURCE_LINK_SCOPE_MISMATCH',
        ...baseAudit,
      },
    };
  }

  if (
    input.request.queryFromIso < ctx.queryFromIso ||
    input.request.queryToIso > ctx.queryToIso
  ) {
    const auditTrailId = auditId('deny-window', requestFingerprint);
    return {
      decision: { allowed: false, reasonCode: 'TIME_WINDOW_EXCEEDS_AUTHORIZATION', auditTrailId },
      auditEntry: {
        auditTrailId,
        authorizationRecordId: ctx.authorizationRecordId,
        decision: 'DENY',
        reasonCode: 'TIME_WINDOW_EXCEEDS_AUTHORIZATION',
        ...baseAudit,
      },
    };
  }

  if (input.request.estimatedResponseRows > ctx.maxResponseRows) {
    const auditTrailId = auditId('deny-size', requestFingerprint);
    return {
      decision: { allowed: false, reasonCode: 'RESPONSE_SIZE_LIMIT_EXCEEDED', auditTrailId },
      auditEntry: {
        auditTrailId,
        authorizationRecordId: ctx.authorizationRecordId,
        decision: 'DENY',
        reasonCode: 'RESPONSE_SIZE_LIMIT_EXCEEDED',
        ...baseAudit,
      },
    };
  }

  const auditTrailId = auditId('allow', requestFingerprint);
  return {
    decision: { allowed: true, auditTrailId },
    auditEntry: {
      auditTrailId,
      authorizationRecordId: ctx.authorizationRecordId,
      decision: 'ALLOW',
      reasonCode: 'SCOPE_MATCH',
      ...baseAudit,
    },
  };
}

/** PR-B3 must never invoke provider/DB clients — explicit runtime guard for future wiring. */
export function assertDs4RpmRealDataPilotLiveReadNotExecutedInPrB3(): void {
  // Contract marker for static analysis and future executor boundaries.
  if (process.env.DS4_RPM_REAL_DATA_PILOT_LIVE_READ_EXECUTED === '1') {
    throw new Error('DS4_RPM_REAL_DATA_PILOT_LIVE_READ_FORBIDDEN_IN_PR_B3');
  }
}

export function authorizationWouldPermitR1HistoricalPointTimeCorrelation(
  family: string | null,
): boolean {
  if (family == null) return false;
  return !hasUncertainHistoricalObdRecordTime(
    family as import('../../telemetry-source-family').TelemetrySourceFamily,
  );
}
