import {
  DBI_P2C2_NOT_REPORTED,
  type DbiP2c2NotReported,
  type DbiP2c2ParticipantIdentityV1,
  type DbiP2c2PowertrainProxyParticipantV1,
} from '../dbi-p2c2-offline-evidence-adapters/dbi-p2c2-evidence-adapter.contract.v1';
import type {
  DbiP2c3IdentityAdmissionDetailV1,
  DbiP2c3IdentityAdmissionVerdictV1,
  DbiP2c3RequiredBindingAssessmentV1,
} from './dbi-p2c3-reconciliation.contract.v1';

type RequiredFingerprintField = 'v1bInputFingerprint' | 'multichannelFingerprint';

const REQUIRED_FINGERPRINT_FIELDS: readonly RequiredFingerprintField[] = [
  'v1bInputFingerprint',
  'multichannelFingerprint',
] as const;

const OPTIONAL_IDENTITY_FIELDS = ['sourceBundleId'] as const;

const CORE_BINDING_FIELDS: readonly (keyof DbiP2c2ParticipantIdentityV1)[] = [
  'organizationId',
  'vehicleId',
  'tripId',
  'providerSourceLinkId',
] as const;

function isRequiredFingerprintReported(
  field: RequiredFingerprintField,
  value: string | null | DbiP2c2NotReported,
): boolean {
  if (field === 'multichannelFingerprint') {
    if (value === DBI_P2C2_NOT_REPORTED || value === null) return false;
    return typeof value === 'string' && value.trim().length > 0;
  }
  if (value === null) return false;
  return typeof value === 'string' && value.trim().length > 0;
}

function isSourceBundleReported(value: string | null): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

function assessRequiredBindings(identities: readonly DbiP2c2ParticipantIdentityV1[]): DbiP2c3RequiredBindingAssessmentV1 {
  const coreBindingsSatisfied = identities.every((id) =>
    CORE_BINDING_FIELDS.every((f) => typeof id[f] === 'string' && id[f].trim().length > 0),
  );
  const requiredFingerprintsSatisfied = identities.every((id) =>
    REQUIRED_FINGERPRINT_FIELDS.every((f) => isRequiredFingerprintReported(f, id[f])),
  );
  const optionalSourceBundleConsistentlyAbsent = identities.every((id) => !isSourceBundleReported(id.sourceBundleId));
  return {
    coreBindingsSatisfied,
    requiredFingerprintsSatisfied,
    optionalSourceBundleConsistentlyAbsent,
  };
}

export function evaluateProxyIdentityAdmission(input: {
  readonly proxyParticipants: readonly DbiP2c2PowertrainProxyParticipantV1[];
  readonly a1CoreBindings: Pick<
    DbiP2c2ParticipantIdentityV1,
    'organizationId' | 'vehicleId' | 'tripId'
  > | null;
}): DbiP2c3IdentityAdmissionDetailV1 {
  const contradictionFields: string[] = [];
  const inconclusiveFields: string[] = [];
  const limitationCodes: string[] = [
    'MATCHING_FINGERPRINTS_DO_NOT_ESTABLISH_SOURCE_ATTESTATION',
    'MISSING_OR_UNREPORTED_BINDINGS_ARE_NOT_EQUALITY',
    'V1B_AND_MULTICHANNEL_FINGERPRINTS_REQUIRED_FOR_PROXY_ADMISSION',
    'SOURCE_BUNDLE_ID_OPTIONAL_WHEN_CONSISTENTLY_ABSENT',
  ];

  if (input.proxyParticipants.length === 0) {
    return {
      verdict: 'INCONCLUSIVE',
      contradictionFields,
      inconclusiveFields: ['NO_PROXY_PARTICIPANTS'],
      limitationCodes: [...limitationCodes, 'NO_B1_B4_PROXY_PARTICIPANTS'],
      requiredBindingAssessment: {
        coreBindingsSatisfied: false,
        requiredFingerprintsSatisfied: false,
        optionalSourceBundleConsistentlyAbsent: true,
      },
    };
  }

  const identities = input.proxyParticipants.map((p) => p.identity);
  const requiredBindingAssessment = assessRequiredBindings(identities);

  for (const field of CORE_BINDING_FIELDS) {
    const values = [...new Set(identities.map((id) => id[field]))];
    if (values.length > 1) {
      contradictionFields.push(field);
    }
    if (values.some((v) => typeof v !== 'string' || v.trim().length === 0)) {
      contradictionFields.push(`REQUIRED_CORE_${field}`);
    }
  }

  for (const field of REQUIRED_FINGERPRINT_FIELDS) {
    const reported = identities
      .map((id) => (isRequiredFingerprintReported(field, id[field]) ? (id[field] as string) : null))
      .filter((v): v is string => v !== null);
    const uniqueReported = [...new Set(reported)];
    if (uniqueReported.length > 1) {
      contradictionFields.push(field);
      continue;
    }
    const anyReported = reported.length > 0;
    const anyUnreported = identities.some((id) => !isRequiredFingerprintReported(field, id[field]));
    if (anyUnreported) {
      inconclusiveFields.push(field);
      if (identities.length === 1) {
        inconclusiveFields.push(`SINGLE_PARTICIPANT_MISSING_${field}`);
      } else if (anyReported && anyUnreported) {
        inconclusiveFields.push(`MIXED_REPORTED_UNREPORTED_${field}`);
      } else if (!anyReported) {
        inconclusiveFields.push(`ALL_UNREPORTED_${field}`);
      }
    }
  }

  for (const field of OPTIONAL_IDENTITY_FIELDS) {
    const reported = identities
      .map((id) => (isSourceBundleReported(id.sourceBundleId) ? id.sourceBundleId : null))
      .filter((v): v is string => v !== null);
    const uniqueReported = [...new Set(reported)];
    if (uniqueReported.length > 1) {
      contradictionFields.push(field);
      continue;
    }
    const anyReported = reported.length > 0;
    const anyUnreported = identities.some((id) => !isSourceBundleReported(id.sourceBundleId));
    if (anyReported && anyUnreported && identities.length > 1) {
      inconclusiveFields.push(field);
    }
  }

  if (input.a1CoreBindings) {
    for (const field of ['organizationId', 'vehicleId', 'tripId'] as const) {
      const proxyValues = [...new Set(identities.map((id) => id[field]))];
      const a1Value = input.a1CoreBindings[field];
      if (proxyValues.some((v) => v !== a1Value)) {
        contradictionFields.push(`A1_${field}`);
      }
    }
    limitationCodes.push('A1_MULTICHANNEL_FINGERPRINT_NOT_REQUIRED_FOR_DESCRIPTIVE_PARTICIPANT');
  }

  if (!requiredBindingAssessment.requiredFingerprintsSatisfied) {
    limitationCodes.push('REQUIRED_FINGERPRINT_MISSING_PREVENTS_ADMISSION');
  }

  let verdict: DbiP2c3IdentityAdmissionVerdictV1;
  if (contradictionFields.length > 0) {
    verdict = 'REJECTED';
  } else if (inconclusiveFields.length > 0 || !requiredBindingAssessment.requiredFingerprintsSatisfied) {
    verdict = 'INCONCLUSIVE';
  } else {
    verdict = 'ADMITTED';
  }

  return {
    verdict,
    contradictionFields: [...new Set(contradictionFields)].sort(),
    inconclusiveFields: [...new Set(inconclusiveFields)].sort(),
    limitationCodes: [...new Set(limitationCodes)].sort(),
    requiredBindingAssessment,
  };
}
