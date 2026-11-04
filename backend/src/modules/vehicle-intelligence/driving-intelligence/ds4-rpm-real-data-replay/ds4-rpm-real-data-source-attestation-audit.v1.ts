import { hasUncertainHistoricalObdRecordTime } from '../../telemetry-source-family';
import type {
  Ds4RpmRealDataAttestationStateV1,
  Ds4RpmRealDataSourceAttestationBundleV1,
  Ds4RpmRealDataSourceAttestationDimensionV1,
  Ds4RpmRealDataSourceAttestationResultV1,
} from './ds4-rpm-real-data-source-attestation.contract.v1';
import { DS4_RPM_REAL_DATA_SOURCE_ATTESTATION_CONTRACT_VERSION } from './ds4-rpm-real-data-source-attestation.contract.v1';
import { computeDs4RpmRealDataSourceAttestationProvenanceFingerprintV1 } from './ds4-rpm-real-data-attestation-fingerprint.v1';
import type { Ds4RpmRealDataPilotReadAuthorizationContextV1 } from './ds4-rpm-real-data-pilot-read-authorization.contract.v1';
import { evaluateDs4RpmRealDataPilotReadAuthorizationV1 } from './ds4-rpm-real-data-pilot-read-authorization-gate.v1';

function dim(
  dimension: Ds4RpmRealDataSourceAttestationDimensionV1['dimension'],
  state: Ds4RpmRealDataAttestationStateV1,
  reasonCode: string,
): Ds4RpmRealDataSourceAttestationDimensionV1 {
  return { dimension, state, reasonCode };
}

export function auditDs4RpmRealDataSourceAttestationV1(
  bundle: Ds4RpmRealDataSourceAttestationBundleV1,
  options?: {
    authorizationContext?: Ds4RpmRealDataPilotReadAuthorizationContextV1 | null;
    /** Trusted executor clock — required when authorizationContext is set. */
    trustedEvaluatedAtIso?: string | null;
  },
): Ds4RpmRealDataSourceAttestationResultV1 {
  const abstainReasons: string[] = [];
  const dimensions: Ds4RpmRealDataSourceAttestationDimensionV1[] = [];

  const { provenanceFingerprint: _ignored, ...withoutFingerprint } = bundle;
  const expectedFingerprint =
    computeDs4RpmRealDataSourceAttestationProvenanceFingerprintV1(withoutFingerprint);
  if (bundle.provenanceFingerprint !== expectedFingerprint) {
    abstainReasons.push('PROVENANCE_FINGERPRINT_MISMATCH');
    dimensions.push(
      dim('CORRELATION_ELIGIBLE', 'BLOCKED', 'PROVENANCE_FINGERPRINT_MISMATCH'),
    );
  }

  const family = bundle.dimoDeviceIdentity.resolvedTelemetrySourceFamily;
  if (family === 'UNKNOWN') {
    dimensions.push(dim('SOURCE_FAMILY_PROVEN', 'BLOCKED', 'TELEMETRY_SOURCE_FAMILY_UNKNOWN'));
    abstainReasons.push('SOURCE_FAMILY_UNKNOWN');
  } else if (bundle.dimoDeviceIdentity.attestationLevel === 'UNPROVEN') {
    dimensions.push(dim('SOURCE_FAMILY_PROVEN', 'UNPROVEN', 'SOURCE_FAMILY_ATTESTATION_UNPROVEN'));
  } else if (hasUncertainHistoricalObdRecordTime(family)) {
    dimensions.push(
      dim('SOURCE_FAMILY_PROVEN', 'PROVEN', 'RUPTELA_R1_FAMILY_PROVEN_FROM_IDENTITY'),
    );
    dimensions.push(
      dim(
        'SOURCE_TIMESTAMP_AUTHORITY_PROVEN',
        'BLOCKED',
        'R1_HISTORICAL_OBD_POINT_TIME_CORRELATION_PROHIBITED',
      ),
    );
    abstainReasons.push('R1_HISTORICAL_TIMESTAMP_VETO');
  } else if (family === 'API_SYNTHETIC') {
    dimensions.push(dim('SOURCE_FAMILY_PROVEN', 'PROVEN', 'API_SYNTHETIC_FAMILY_PROVEN'));
    dimensions.push(
      dim(
        'SOURCE_TIMESTAMP_AUTHORITY_PROVEN',
        'UNPROVEN',
        'BUCKET_LABEL_PHASE_UNKNOWN_CROSS_DOMAIN',
      ),
    );
  } else {
    dimensions.push(dim('SOURCE_FAMILY_PROVEN', 'UNPROVEN', 'UNEXPECTED_FAMILY_PATH'));
  }

  if (!dimensions.some((d) => d.dimension === 'SOURCE_TIMESTAMP_AUTHORITY_PROVEN')) {
    if (bundle.historicalTimestampTrust === 'R1_HISTORICAL_OBD_UNCERTAIN') {
      dimensions.push(
        dim(
          'SOURCE_TIMESTAMP_AUTHORITY_PROVEN',
          'BLOCKED',
          'R1_HISTORICAL_OBD_POINT_TIME_CORRELATION_PROHIBITED',
        ),
      );
    } else if (bundle.historicalTimestampTrust === 'UNKNOWN') {
      dimensions.push(
        dim('SOURCE_TIMESTAMP_AUTHORITY_PROVEN', 'UNPROVEN', 'TIMESTAMP_AUTHORITY_UNKNOWN'),
      );
    } else {
      dimensions.push(
        dim(
          'SOURCE_TIMESTAMP_AUTHORITY_PROVEN',
          'UNPROVEN',
          'TIMESTAMP_AUTHORITY_NOT_INDEPENDENTLY_PROVEN',
        ),
      );
    }
  }

  if (bundle.iceRpmApplicability === 'NOT_APPLICABLE') {
    dimensions.push(dim('EVENT_LOCAL_CADENCE_ASSESSABLE', 'NOT_APPLICABLE', 'ICE_RPM_NOT_APPLICABLE'));
    dimensions.push(dim('CORRELATION_ELIGIBLE', 'NOT_APPLICABLE', 'ICE_RPM_NOT_APPLICABLE'));
    abstainReasons.push('ICE_RPM_NOT_APPLICABLE');
  } else if (bundle.evidenceIdentities.rpmPointCount === 0) {
    dimensions.push(dim('EVENT_LOCAL_CADENCE_ASSESSABLE', 'UNPROVEN', 'RPM_EVIDENCE_MISSING'));
    dimensions.push(dim('CORRELATION_ELIGIBLE', 'UNPROVEN', 'RPM_EVIDENCE_MISSING'));
    abstainReasons.push('RPM_EVIDENCE_MISSING');
  } else if (!bundle.eventLocalCadenceAssessed) {
    dimensions.push(
      dim('EVENT_LOCAL_CADENCE_ASSESSABLE', 'UNPROVEN', 'EVENT_LOCAL_CADENCE_NOT_ASSESSED'),
    );
  } else {
    dimensions.push(dim('EVENT_LOCAL_CADENCE_ASSESSABLE', 'PROVEN', 'EVENT_LOCAL_CADENCE_ASSESSED'));
  }

  if (!dimensions.some((d) => d.dimension === 'CORRELATION_ELIGIBLE')) {
    if (abstainReasons.includes('PROVENANCE_FINGERPRINT_MISMATCH')) {
      // CORRELATION_ELIGIBLE already BLOCKED
    } else {
      const familyBlocked = dimensions.some(
        (d) =>
          d.dimension === 'SOURCE_TIMESTAMP_AUTHORITY_PROVEN' && d.state === 'BLOCKED',
      );
      const familyUnproven = dimensions.some(
        (d) => d.dimension === 'SOURCE_FAMILY_PROVEN' && d.state !== 'PROVEN',
      );
      if (familyBlocked) {
        dimensions.push(
          dim('CORRELATION_ELIGIBLE', 'BLOCKED', 'HISTORICAL_TIMESTAMP_AUTHORITY_BLOCKED'),
        );
      } else if (familyUnproven) {
        dimensions.push(dim('CORRELATION_ELIGIBLE', 'UNPROVEN', 'SOURCE_FAMILY_UNPROVEN'));
      } else if (!bundle.v1bAdmissionSucceeded || !bundle.v1bProcessingAllowed) {
        dimensions.push(dim('CORRELATION_ELIGIBLE', 'UNPROVEN', 'V1B_ADMISSION_NOT_DEFENSIBLE'));
      } else if (
        !dimensions.some(
          (d) => d.dimension === 'EVENT_LOCAL_CADENCE_ASSESSABLE' && d.state === 'PROVEN',
        )
      ) {
        dimensions.push(
          dim('CORRELATION_ELIGIBLE', 'UNPROVEN', 'EVENT_LOCAL_CADENCE_NOT_DEFENSIBLE'),
        );
      } else if (options?.authorizationContext == null) {
        dimensions.push(
          dim('CORRELATION_ELIGIBLE', 'UNPROVEN', 'OWNER_AUTHORIZED_READ_CONTEXT_MISSING'),
        );
        abstainReasons.push('AUTHORIZATION_CONTEXT_MISSING');
      } else if (options.trustedEvaluatedAtIso == null) {
        dimensions.push(
          dim('CORRELATION_ELIGIBLE', 'UNPROVEN', 'TRUSTED_EVALUATION_TIME_MISSING'),
        );
        abstainReasons.push('TRUSTED_EVALUATION_TIME_MISSING');
      } else {
        const auth = evaluateDs4RpmRealDataPilotReadAuthorizationV1({
          context: options.authorizationContext,
          trustedExecutionBoundary: { evaluatedAtIso: options.trustedEvaluatedAtIso },
          request: {
            organizationId: bundle.organizationId,
            vehicleId: bundle.vehicleId,
            tripId: bundle.tripId,
            providerSourceLinkId: bundle.providerSourceLinkId,
            queryFromIso: bundle.queryProvenance.dimoQueryFromIso,
            queryToIso: bundle.queryProvenance.dimoQueryToIso,
            estimatedResponseRows: Math.max(1, bundle.evidenceIdentities.rpmPointCount),
            estimatedQueryBudgetUnits: 1,
            requestedAtIso: bundle.queryProvenance.dimoQueryFromIso,
          },
        });
        if (!auth.decision.allowed) {
          dimensions.push(
            dim('CORRELATION_ELIGIBLE', 'UNPROVEN', auth.decision.reasonCode),
          );
          abstainReasons.push(auth.decision.reasonCode);
        } else if (
          bundle.dimoDeviceIdentity.attestationLevel !== 'PROVEN_FROM_AUTHORIZED_READ'
        ) {
          dimensions.push(
            dim(
              'CORRELATION_ELIGIBLE',
              'UNPROVEN',
              'INJECTED_FIXTURE_NOT_PRODUCTION_ATTESTATION',
            ),
          );
          abstainReasons.push('INJECTED_FIXTURE_NOT_PRODUCTION_ATTESTATION');
          abstainReasons.push('TRUSTED_PRODUCTION_READ_CONTEXT_NOT_VERIFIED');
        } else {
          dimensions.push(
            dim('CORRELATION_ELIGIBLE', 'UNPROVEN', 'PILOT_ATTESTATION_INCOMPLETE'),
          );
        }
      }
    }
  }

  const correlationEligible =
    dimensions.find((d) => d.dimension === 'CORRELATION_ELIGIBLE')?.state === 'PROVEN';

  return {
    contractVersion: DS4_RPM_REAL_DATA_SOURCE_ATTESTATION_CONTRACT_VERSION,
    attestationBundleId: bundle.attestationBundleId,
    cohortVehicleLabel: bundle.cohortVehicleLabel,
    dimensions,
    abstainReasons: [...new Set(abstainReasons)],
    correlationEligible,
  };
}
