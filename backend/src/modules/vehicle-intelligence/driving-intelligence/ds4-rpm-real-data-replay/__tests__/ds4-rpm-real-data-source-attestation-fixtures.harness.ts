import { computeDs4RpmRealDataSourceFamilyIdentityDigestV1 } from '../ds4-rpm-real-data-input-fingerprint.v1';
import { computeDs4RpmRealDataSourceAttestationProvenanceFingerprintV1 } from '../ds4-rpm-real-data-attestation-fingerprint.v1';
import type { Ds4RpmRealDataSourceAttestationBundleV1 } from '../ds4-rpm-real-data-source-attestation.contract.v1';
import { DS4_RPM_REAL_DATA_SOURCE_ATTESTATION_CONTRACT_VERSION } from '../ds4-rpm-real-data-source-attestation.contract.v1';
import type { Ds4RpmRealDataPilotReadAuthorizationContextV1 } from '../ds4-rpm-real-data-pilot-read-authorization.contract.v1';
import { DS4_RPM_REAL_DATA_PILOT_READ_AUTHORIZATION_CONTRACT_VERSION } from '../ds4-rpm-real-data-pilot-read-authorization.contract.v1';
import {
  R1_DIMO_RAW_JSON,
  SYNTHETIC_DIMO_RAW_JSON,
  UNKNOWN_DIMO_RAW_JSON,
  buildSyntheticApiBundleValid,
} from './ds4-rpm-real-data-replay-fixtures.harness';

const GENERATED_AT = new Date('2026-11-04T10:00:00.000Z');

export function buildValidAttestationBundleFixture(
  overrides: Partial<Ds4RpmRealDataSourceAttestationBundleV1> = {},
): Ds4RpmRealDataSourceAttestationBundleV1 {
  const offline = buildSyntheticApiBundleValid(GENERATED_AT);
  const base: Omit<Ds4RpmRealDataSourceAttestationBundleV1, 'provenanceFingerprint'> = {
    contractVersion: DS4_RPM_REAL_DATA_SOURCE_ATTESTATION_CONTRACT_VERSION,
    attestationBundleId: 'attest-fixture-valid',
    cohortVehicleLabel: 'AUDI_A4',
    organizationId: offline.organizationId,
    vehicleId: offline.vehicleId,
    tripId: offline.tripId,
    providerSourceLinkId: offline.providerSourceLinkId,
    dimoDeviceIdentity: {
      dimoRawJsonMaterialDigest: computeDs4RpmRealDataSourceFamilyIdentityDigestV1(
        SYNTHETIC_DIMO_RAW_JSON,
      ),
      resolvedTelemetrySourceFamily: 'API_SYNTHETIC',
      attestationLevel: 'PROVEN_FROM_INJECTED_FIXTURE',
    },
    queryProvenance: {
      dimoQueryFromIso: offline.dimoQueryFromIso,
      dimoQueryToIso: offline.dimoQueryToIso,
      dimoBucketIntervalSeconds: 1,
      aggregationSemantics: 'DIMO_1S_AVG_PER_SIGNAL',
      speedCoBucketedWithRpm: true,
      rpmObservationSupportWidthSeconds: 'UNKNOWN',
    },
    evidenceIdentities: {
      v1aInputFingerprint: offline.v1bResult?.inputFingerprint ?? null,
      v1bRunId: offline.v1bRunId,
      v1bInputFingerprint: offline.v1bResult?.inputFingerprint ?? null,
      motionRunId: offline.motionRunId,
      motionEventCount: offline.motionPayload.events.length,
      rpmPointCount: offline.tripInput.rpmPoints.length,
      canSpeedObservationCount: offline.canSpeedObservations.length,
    },
    historicalTimestampTrust: 'UNKNOWN',
    iceRpmApplicability: 'APPLICABLE',
    v1bAdmissionSucceeded: offline.v1bResult?.processingOutcome === 'SUCCEEDED',
    v1bProcessingAllowed: offline.v1bResult?.admission.processingAllowed ?? false,
    vsiCadenceTier: 'RPM_1S',
    eventLocalCadenceAssessed: true,
    ...overrides,
  };
  const provenanceFingerprint = computeDs4RpmRealDataSourceAttestationProvenanceFingerprintV1(base);
  return { ...base, provenanceFingerprint };
}

export function buildValidAuthorizationContextFixture(
  bundle: Ds4RpmRealDataSourceAttestationBundleV1,
): Ds4RpmRealDataPilotReadAuthorizationContextV1 {
  return {
    contractVersion: DS4_RPM_REAL_DATA_PILOT_READ_AUTHORIZATION_CONTRACT_VERSION,
    authorizationRecordId: 'owner-auth-fixture-001',
    ownerAttestationReference: 'OWNER_SIGNED_SCOPE_FIXTURE',
    organizationId: bundle.organizationId,
    vehicleId: bundle.vehicleId,
    allowedTripIds: [bundle.tripId],
    providerSourceLinkId: bundle.providerSourceLinkId,
    queryFromIso: bundle.queryProvenance.dimoQueryFromIso,
    queryToIso: bundle.queryProvenance.dimoQueryToIso,
    maxResponseRows: 10_000,
    maxQueryBudgetUnits: 100,
    readOnly: true,
    issuedAtIso: '2026-11-04T08:00:00.000Z',
    expiresAtIso: '2026-12-31T23:59:59.000Z',
  };
}

export { R1_DIMO_RAW_JSON, SYNTHETIC_DIMO_RAW_JSON, UNKNOWN_DIMO_RAW_JSON, GENERATED_AT };
