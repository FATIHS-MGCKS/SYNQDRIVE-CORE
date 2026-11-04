import { auditDs4RpmRealDataSourceAttestationV1 } from '../ds4-rpm-real-data-source-attestation-audit.v1';
import {
  authorizationWouldPermitR1HistoricalPointTimeCorrelation,
  evaluateDs4RpmRealDataPilotReadAuthorizationV1,
  parseIsoInstantToEpochMs,
} from '../ds4-rpm-real-data-pilot-read-authorization-gate.v1';
import {
  buildValidAttestationBundleFixture,
  buildValidAuthorizationContextFixture,
  GENERATED_AT,
} from './ds4-rpm-real-data-source-attestation-fixtures.harness';

const TRUSTED_EVAL = '2026-11-04T09:00:00.000Z';

function baseRequest(bundle: ReturnType<typeof buildValidAttestationBundleFixture>) {
  return {
    organizationId: bundle.organizationId,
    vehicleId: bundle.vehicleId,
    tripId: bundle.tripId,
    providerSourceLinkId: bundle.providerSourceLinkId,
    queryFromIso: bundle.queryProvenance.dimoQueryFromIso,
    queryToIso: bundle.queryProvenance.dimoQueryToIso,
    estimatedResponseRows: 100,
    estimatedQueryBudgetUnits: 5,
    requestedAtIso: '2020-01-01T00:00:00.000Z',
  };
}

function evaluate(
  bundle: ReturnType<typeof buildValidAttestationBundleFixture>,
  ctxOverrides: Record<string, unknown> = {},
  reqOverrides: Record<string, unknown> = {},
  trustedIso = TRUSTED_EVAL,
) {
  const ctx = { ...buildValidAuthorizationContextFixture(bundle), ...ctxOverrides };
  return evaluateDs4RpmRealDataPilotReadAuthorizationV1({
    context: ctx,
    trustedExecutionBoundary: { evaluatedAtIso: trustedIso },
    request: { ...baseRequest(bundle), ...reqOverrides },
  });
}

function denyReason(
  bundle: ReturnType<typeof buildValidAttestationBundleFixture>,
  ctxOverrides: Record<string, unknown> = {},
  reqOverrides: Record<string, unknown> = {},
  trustedIso = TRUSTED_EVAL,
): string {
  const { decision } = evaluate(bundle, ctxOverrides, reqOverrides, trustedIso);
  expect(decision.allowed).toBe(false);
  if (decision.allowed) throw new Error('expected deny');
  return decision.reasonCode;
}

describe('ds4-rpm-real-data pilot read authorization adversarial (offline)', () => {
  const bundle = buildValidAttestationBundleFixture();

  it('1 — backdated request.requestedAtIso cannot revive expired authorization', () => {
    const ctx = buildValidAuthorizationContextFixture(bundle);
    const expiredCtx = {
      ...ctx,
      issuedAtIso: '2026-01-01T00:00:00.000Z',
      expiresAtIso: '2026-06-01T00:00:00.000Z',
    };
    const result = evaluateDs4RpmRealDataPilotReadAuthorizationV1({
      context: expiredCtx,
      trustedExecutionBoundary: { evaluatedAtIso: TRUSTED_EVAL },
      request: {
        ...baseRequest(bundle),
        requestedAtIso: '2026-03-01T00:00:00.000Z',
      },
    });
    expect(result.decision.allowed).toBe(false);
    expect(result.decision).toMatchObject({
      allowed: false,
      reasonCode: 'AUTHORIZATION_EXPIRED_OR_NOT_YET_VALID',
    });
  });

  it('2 — rejects malformed issuedAt / expiresAt on context', () => {
    expect(denyReason(bundle, { issuedAtIso: 'not-a-date' })).toBe(
      'AUTHORIZATION_VALIDITY_INTERVAL_INVALID',
    );
    expect(denyReason(bundle, { expiresAtIso: '' })).toBe('AUTHORIZATION_VALIDITY_INTERVAL_INVALID');
    expect(
      denyReason(bundle, {
        issuedAtIso: '2026-12-31T00:00:00.000Z',
        expiresAtIso: '2026-11-01T00:00:00.000Z',
      }),
    ).toBe('AUTHORIZATION_VALIDITY_INTERVAL_INVALID');
  });

  it('3 — rejects invalid or reversed query windows', () => {
    expect(denyReason(bundle, {}, { queryFromIso: 'bad' })).toBe('QUERY_WINDOW_MALFORMED');
    expect(
      denyReason(bundle, {}, {
        queryFromIso: bundle.queryProvenance.dimoQueryToIso,
        queryToIso: bundle.queryProvenance.dimoQueryFromIso,
      }),
    ).toBe('QUERY_WINDOW_REVERSED_OR_EMPTY');
    expect(denyReason(bundle, {}, { queryFromIso: '2010-01-01T00:00:00.000Z' })).toBe(
      'TIME_WINDOW_EXCEEDS_AUTHORIZATION',
    );
  });

  it('4 — accepts timezone-equivalent ISO instants for window bounds', () => {
    const ctx = buildValidAuthorizationContextFixture(bundle);
    const fromZ = bundle.queryProvenance.dimoQueryFromIso;
    const toZ = bundle.queryProvenance.dimoQueryToIso;
    const fromMs = parseIsoInstantToEpochMs(fromZ)!;
    const toMs = parseIsoInstantToEpochMs(toZ)!;
    const fromOffset = new Date(fromMs).toISOString().replace('.000Z', '+00:00');
    const toOffset = new Date(toMs).toISOString().replace('.000Z', '+00:00');
    const ok = evaluateDs4RpmRealDataPilotReadAuthorizationV1({
      context: ctx,
      trustedExecutionBoundary: { evaluatedAtIso: TRUSTED_EVAL },
      request: {
        ...baseRequest(bundle),
        queryFromIso: fromOffset,
        queryToIso: toOffset,
      },
    });
    expect(ok.decision.allowed).toBe(true);
    if (ok.decision.allowed) {
      expect(ok.decision.productionReadPermitted).toBe(false);
      expect(ok.decision.scopeValidationOnly).toBe(true);
    }
  });

  it('5 — rejects negative, fractional and oversized row counts', () => {
    expect(denyReason(bundle, {}, { estimatedResponseRows: -1 })).toBe(
      'RESPONSE_SIZE_LIMIT_EXCEEDED',
    );
    expect(denyReason(bundle, {}, { estimatedResponseRows: 1.5 })).toBe(
      'RESPONSE_SIZE_LIMIT_EXCEEDED',
    );
    expect(denyReason(bundle, {}, { estimatedResponseRows: 0 })).toBe(
      'RESPONSE_SIZE_LIMIT_EXCEEDED',
    );
    expect(denyReason(bundle, {}, { estimatedResponseRows: 20_000 })).toBe(
      'RESPONSE_SIZE_LIMIT_EXCEEDED',
    );
  });

  it('6 — rejects missing or exceeded query budget', () => {
    expect(denyReason(bundle, {}, { estimatedQueryBudgetUnits: 0 })).toBe('QUERY_BUDGET_EXCEEDED');
    expect(denyReason(bundle, {}, { estimatedQueryBudgetUnits: 101 })).toBe('QUERY_BUDGET_EXCEEDED');
  });

  it('7 — rejects runtime readOnly=false on context', () => {
    const ctx = buildValidAuthorizationContextFixture(bundle);
    const result = evaluateDs4RpmRealDataPilotReadAuthorizationV1({
      context: { ...ctx, readOnly: false as unknown as true },
      trustedExecutionBoundary: { evaluatedAtIso: TRUSTED_EVAL },
      request: baseRequest(bundle),
    });
    expect(result.decision.allowed).toBe(false);
    if (!result.decision.allowed) {
      expect(result.decision.reasonCode).toBe('AUTHORIZATION_READ_ONLY_REQUIRED');
    }
  });

  it('8 — unknown source family never passes R1 historical correlation helper', () => {
    expect(
      authorizationWouldPermitR1HistoricalPointTimeCorrelation({
        telemetrySourceFamily: 'UNKNOWN',
        historicalTimestampTrust: 'API_SYNTHETIC_BUCKET_LABEL_ONLY',
      }),
    ).toBe(false);
    expect(
      authorizationWouldPermitR1HistoricalPointTimeCorrelation({
        telemetrySourceFamily: 'NOT_A_FAMILY',
        historicalTimestampTrust: 'API_SYNTHETIC_BUCKET_LABEL_ONLY',
      }),
    ).toBe(false);
  });

  it('9 — proven R1 historical timestamp veto via correlation helper', () => {
    expect(
      authorizationWouldPermitR1HistoricalPointTimeCorrelation({
        telemetrySourceFamily: 'RUPTELA_R1',
        historicalTimestampTrust: 'R1_HISTORICAL_OBD_UNCERTAIN',
      }),
    ).toBe(false);
    expect(
      authorizationWouldPermitR1HistoricalPointTimeCorrelation({
        telemetrySourceFamily: 'API_SYNTHETIC',
        historicalTimestampTrust: 'R1_HISTORICAL_OBD_UNCERTAIN',
      }),
    ).toBe(false);
  });

  it('10 — forged authorization metadata (empty record id)', () => {
    expect(denyReason(bundle, { authorizationRecordId: '  ' })).toBe(
      'AUTHORIZATION_METADATA_INCOMPLETE',
    );
  });

  it('11 — provenance fingerprint mismatch blocks correlation eligibility', () => {
    const valid = buildValidAttestationBundleFixture();
    const tampered = { ...valid, provenanceFingerprint: 'cafebabe'.repeat(8) };
    const result = auditDs4RpmRealDataSourceAttestationV1(tampered, {
      authorizationContext: buildValidAuthorizationContextFixture(valid),
      trustedEvaluatedAtIso: TRUSTED_EVAL,
    });
    expect(result.abstainReasons).toContain('PROVENANCE_FINGERPRINT_MISMATCH');
    expect(result.dimensions.find((d) => d.dimension === 'CORRELATION_ELIGIBLE')?.state).toBe(
      'BLOCKED',
    );
  });

  it('12 — cross-tenant and source-link mismatch', () => {
    expect(denyReason(bundle, {}, { organizationId: 'org-evil' })).toBe(
      'ORGANIZATION_SCOPE_MISMATCH',
    );
    expect(denyReason(bundle, {}, { providerSourceLinkId: 'link-evil' })).toBe(
      'SOURCE_LINK_SCOPE_MISMATCH',
    );
  });

  it('13 — valid offline scope validation allows scope check only', () => {
    const result = evaluate(bundle);
    expect(result.decision.allowed).toBe(true);
    if (result.decision.allowed) {
      expect(result.decision.scopeValidationOnly).toBe(true);
      expect(result.decision.productionReadPermitted).toBe(false);
    }
  });

  it('14 — no live provider or database I/O (fixture clock only)', () => {
    expect(GENERATED_AT.toISOString()).toBe('2026-11-04T10:00:00.000Z');
    const audit = auditDs4RpmRealDataSourceAttestationV1(bundle, {
      authorizationContext: buildValidAuthorizationContextFixture(bundle),
      trustedEvaluatedAtIso: TRUSTED_EVAL,
    });
    expect(audit.correlationEligible).toBe(false);
  });
});
