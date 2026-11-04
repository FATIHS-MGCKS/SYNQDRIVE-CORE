import { auditDs4RpmRealDataSourceAttestationV1 } from '../ds4-rpm-real-data-source-attestation-audit.v1';
import {
  computeDs4RpmRealDataPilotReadRequestFingerprintV1,
  computeDs4RpmRealDataSourceAttestationProvenanceFingerprintV1,
} from '../ds4-rpm-real-data-attestation-fingerprint.v1';
import {
  assertDs4RpmRealDataPilotLiveReadNotExecutedInPrB3,
  evaluateDs4RpmRealDataPilotReadAuthorizationV1,
} from '../ds4-rpm-real-data-pilot-read-authorization-gate.v1';
import { buildDs4RpmRealDataReferenceCohortReadinessMatrixV1 } from '../ds4-rpm-real-data-source-readiness-matrix.v1';
import {
  buildValidAttestationBundleFixture,
  buildValidAuthorizationContextFixture,
  R1_DIMO_RAW_JSON,
  UNKNOWN_DIMO_RAW_JSON,
} from './ds4-rpm-real-data-source-attestation-fixtures.harness';
import { computeDs4RpmRealDataSourceFamilyIdentityDigestV1 } from '../ds4-rpm-real-data-input-fingerprint.v1';

describe('ds4-rpm-real-data source attestation v1 (offline)', () => {
  it('accepts valid source binding with separate orthogonal dimensions', () => {
    const bundle = buildValidAttestationBundleFixture();
    const result = auditDs4RpmRealDataSourceAttestationV1(bundle);
    expect(result.dimensions.find((d) => d.dimension === 'SOURCE_FAMILY_PROVEN')?.state).toBe(
      'PROVEN',
    );
    expect(result.correlationEligible).toBe(false);
    expect(
      result.dimensions.find((d) => d.dimension === 'CORRELATION_ELIGIBLE')?.state,
    ).not.toBe('PROVEN');
  });

  it('rejects wrong organization', () => {
    const valid = buildValidAttestationBundleFixture();
    const bundle = buildValidAttestationBundleFixture({ organizationId: 'org-wrong' });
    const ctx = buildValidAuthorizationContextFixture(valid);
    const result = auditDs4RpmRealDataSourceAttestationV1(bundle, {
      authorizationContext: ctx,
      authorizationRequestAtIso: '2026-11-04T09:00:00.000Z',
    });
    expect(result.abstainReasons).toContain('ORGANIZATION_SCOPE_MISMATCH');
  });

  it('rejects wrong vehicle, trip, and source link via authorization gate', () => {
    const bundle = buildValidAttestationBundleFixture();
    const ctx = buildValidAuthorizationContextFixture(bundle);
    for (const [field, value] of [
      ['vehicleId', 'veh-x'],
      ['tripId', 'trip-x'],
      ['providerSourceLinkId', 'link-x'],
    ] as const) {
      const tampered = { ...bundle, [field]: value };
      const result = auditDs4RpmRealDataSourceAttestationV1(tampered, {
        authorizationContext: ctx,
        authorizationRequestAtIso: '2026-11-04T09:00:00.000Z',
      });
      expect(result.correlationEligible).toBe(false);
    }
  });

  it('vetoes proven R1 historical OBD', () => {
    const bundle = buildValidAttestationBundleFixture({
      dimoDeviceIdentity: {
        dimoRawJsonMaterialDigest: computeDs4RpmRealDataSourceFamilyIdentityDigestV1(R1_DIMO_RAW_JSON),
        resolvedTelemetrySourceFamily: 'RUPTELA_R1',
        attestationLevel: 'PROVEN_FROM_INJECTED_FIXTURE',
      },
      historicalTimestampTrust: 'R1_HISTORICAL_OBD_UNCERTAIN',
    });
    const result = auditDs4RpmRealDataSourceAttestationV1(bundle);
    expect(
      result.dimensions.find((d) => d.dimension === 'SOURCE_TIMESTAMP_AUTHORITY_PROVEN')?.state,
    ).toBe('BLOCKED');
    expect(result.correlationEligible).toBe(false);
  });

  it('blocks unknown source family', () => {
    const bundle = buildValidAttestationBundleFixture({
      dimoDeviceIdentity: {
        dimoRawJsonMaterialDigest:
          computeDs4RpmRealDataSourceFamilyIdentityDigestV1(UNKNOWN_DIMO_RAW_JSON),
        resolvedTelemetrySourceFamily: 'UNKNOWN',
        attestationLevel: 'UNPROVEN',
      },
    });
    const result = auditDs4RpmRealDataSourceAttestationV1(bundle);
    expect(result.dimensions.find((d) => d.dimension === 'SOURCE_FAMILY_PROVEN')?.state).toBe(
      'BLOCKED',
    );
  });

  it('marks Tesla ICE RPM not applicable', () => {
    const bundle = buildValidAttestationBundleFixture({
      cohortVehicleLabel: 'TESLA_MODEL_3',
      iceRpmApplicability: 'NOT_APPLICABLE',
    });
    const result = auditDs4RpmRealDataSourceAttestationV1(bundle);
    expect(result.dimensions.find((d) => d.dimension === 'CORRELATION_ELIGIBLE')?.state).toBe(
      'NOT_APPLICABLE',
    );
  });

  it('fails closed on missing RPM and conflicting provenance fingerprint', () => {
    const base = buildValidAttestationBundleFixture();
    const missing = buildValidAttestationBundleFixture({
      evidenceIdentities: { ...base.evidenceIdentities, rpmPointCount: 0 },
    });
    expect(auditDs4RpmRealDataSourceAttestationV1(missing).abstainReasons).toContain(
      'RPM_EVIDENCE_MISSING',
    );

    const bundle = buildValidAttestationBundleFixture();
    const bad = { ...bundle, provenanceFingerprint: 'deadbeef'.repeat(8) };
    expect(auditDs4RpmRealDataSourceAttestationV1(bad).abstainReasons).toContain(
      'PROVENANCE_FINGERPRINT_MISMATCH',
    );
  });

  it('denies missing or expired authorization scope', () => {
    const bundle = buildValidAttestationBundleFixture();
    const noAuth = auditDs4RpmRealDataSourceAttestationV1(bundle);
    expect(noAuth.abstainReasons).toContain('AUTHORIZATION_CONTEXT_MISSING');

    const ctx = buildValidAuthorizationContextFixture(bundle);
    const expired = evaluateDs4RpmRealDataPilotReadAuthorizationV1({
      context: { ...ctx, expiresAtIso: '2026-01-01T00:00:00.000Z' },
      request: {
        organizationId: bundle.organizationId,
        vehicleId: bundle.vehicleId,
        tripId: bundle.tripId,
        providerSourceLinkId: bundle.providerSourceLinkId,
        queryFromIso: bundle.queryProvenance.dimoQueryFromIso,
        queryToIso: bundle.queryProvenance.dimoQueryToIso,
        estimatedResponseRows: 100,
        requestedAtIso: '2026-11-04T09:00:00.000Z',
      },
    });
    expect(expired.decision.allowed).toBe(false);
  });

  it('produces deterministic attestation fingerprints', () => {
    const a = buildValidAttestationBundleFixture();
    const b = buildValidAttestationBundleFixture();
    expect(a.provenanceFingerprint).toBe(b.provenanceFingerprint);
    const reqFp = computeDs4RpmRealDataPilotReadRequestFingerprintV1({
      organizationId: a.organizationId,
      vehicleId: a.vehicleId,
      tripId: a.tripId,
      providerSourceLinkId: a.providerSourceLinkId,
      queryFromIso: a.queryProvenance.dimoQueryFromIso,
      queryToIso: a.queryProvenance.dimoQueryToIso,
      estimatedResponseRows: 10,
      requestedAtIso: '2026-11-04T09:00:00.000Z',
    });
    expect(reqFp).toMatch(/^[a-f0-9]{64}$/);
  });

  it('readiness matrix stays UNPROVEN without live attestation and preserves R1 exclusion', () => {
    const matrix = buildDs4RpmRealDataReferenceCohortReadinessMatrixV1();
    expect(matrix.generatedWithoutLiveAttestation).toBe(true);
    expect(matrix.rows.find((r) => r.cohortVehicleLabel === 'VW_TIGUAN')?.correlationEligible).toBe(
      'NO_ELIGIBLE_REAL_DATA_SOURCE',
    );
    expect(matrix.minimalPilotReadPlan.length).toBeGreaterThan(0);
  });

  it('never executes live reads in PR-B3', () => {
    expect(() => assertDs4RpmRealDataPilotLiveReadNotExecutedInPrB3()).not.toThrow();
  });

  it('keeps SOURCE_FAMILY_PROVEN distinct from CORRELATION_ELIGIBLE', () => {
    const bundle = buildValidAttestationBundleFixture();
    const result = auditDs4RpmRealDataSourceAttestationV1(bundle);
    const family = result.dimensions.find((d) => d.dimension === 'SOURCE_FAMILY_PROVEN');
    const corr = result.dimensions.find((d) => d.dimension === 'CORRELATION_ELIGIBLE');
    expect(family?.state).toBe('PROVEN');
    expect(corr?.state).not.toBe('PROVEN');
  });
});
