import {
  DBI_P2C2_NOT_REPORTED,
  type DbiP2c2NotReported,
  type DbiP2c2ParticipantIdentityV1,
  type DbiP2c2PowertrainProxyParticipantV1,
} from '../dbi-p2c2-offline-evidence-adapters/dbi-p2c2-evidence-adapter.contract.v1';
import type {
  DbiP2c3IdentityAdmissionDetailV1,
  DbiP2c3IdentityAdmissionVerdictV1,
} from './dbi-p2c3-reconciliation.contract.v1';

type OptionalIdentityField =
  | 'v1bInputFingerprint'
  | 'multichannelFingerprint'
  | 'sourceBundleId';

const OPTIONAL_IDENTITY_FIELDS: readonly OptionalIdentityField[] = [
  'v1bInputFingerprint',
  'multichannelFingerprint',
  'sourceBundleId',
] as const;

const CORE_BINDING_FIELDS: readonly (keyof DbiP2c2ParticipantIdentityV1)[] = [
  'organizationId',
  'vehicleId',
  'tripId',
  'providerSourceLinkId',
] as const;

function isOptionalFieldReported(
  field: OptionalIdentityField,
  value: string | null | DbiP2c2NotReported,
): boolean {
  if (field === 'multichannelFingerprint') {
    if (value === DBI_P2C2_NOT_REPORTED || value === null) return false;
    return typeof value === 'string' && value.length > 0;
  }
  if (value === null) return false;
  return typeof value === 'string' && value.length > 0;
}

function normalizeOptionalValue(
  field: OptionalIdentityField,
  value: string | null | DbiP2c2NotReported,
): string | null {
  if (!isOptionalFieldReported(field, value)) return null;
  return value as string;
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
  ];

  if (input.proxyParticipants.length === 0) {
    return {
      verdict: 'INCONCLUSIVE',
      contradictionFields,
      inconclusiveFields: ['NO_PROXY_PARTICIPANTS'],
      limitationCodes: [...limitationCodes, 'NO_B1_B4_PROXY_PARTICIPANTS'],
    };
  }

  const identities = input.proxyParticipants.map((p) => p.identity);

  for (const field of CORE_BINDING_FIELDS) {
    const values = [...new Set(identities.map((id) => id[field]))];
    if (values.length > 1) {
      contradictionFields.push(field);
    }
  }

  for (const field of OPTIONAL_IDENTITY_FIELDS) {
    const reported = identities
      .map((id) => normalizeOptionalValue(field, id[field]))
      .filter((v): v is string => v !== null);
    const uniqueReported = [...new Set(reported)];
    if (uniqueReported.length > 1) {
      contradictionFields.push(field);
      continue;
    }
    const anyReported = reported.length > 0;
    const anyUnreported = identities.some((id) => !isOptionalFieldReported(field, id[field]));
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

  let verdict: DbiP2c3IdentityAdmissionVerdictV1;
  if (contradictionFields.length > 0) {
    verdict = 'REJECTED';
  } else if (inconclusiveFields.length > 0) {
    verdict = 'INCONCLUSIVE';
  } else {
    verdict = 'ADMITTED';
  }

  return {
    verdict,
    contradictionFields: [...contradictionFields].sort(),
    inconclusiveFields: [...inconclusiveFields].sort(),
    limitationCodes: [...limitationCodes].sort(),
  };
}
