import { createHash } from 'crypto';
import { stableStringify } from './ds4-rpm-real-data-input-fingerprint.v1';
import type { Ds4RpmRealDataSourceAttestationBundleV1 } from './ds4-rpm-real-data-source-attestation.contract.v1';
import type { Ds4RpmRealDataPilotReadRequestV1 } from './ds4-rpm-real-data-pilot-read-authorization.contract.v1';

export function computeDs4RpmRealDataSourceAttestationProvenanceFingerprintV1(
  bundle: Omit<Ds4RpmRealDataSourceAttestationBundleV1, 'provenanceFingerprint'>,
): string {
  return createHash('sha256').update(stableStringify(bundle)).digest('hex');
}

export function computeDs4RpmRealDataPilotReadRequestFingerprintV1(
  request: Ds4RpmRealDataPilotReadRequestV1,
): string {
  return createHash('sha256').update(stableStringify(request)).digest('hex');
}
