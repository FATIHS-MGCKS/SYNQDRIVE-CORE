import { FSD3_CATALOG_FINGERPRINT_EVIDENCE_SIGNAL_V1 } from '@modules/vehicle-intelligence/full-signal-discovery/orchestration/fsd3-discovery-request.v1';
import { FSD4_CATALOG_FINGERPRINT_EVIDENCE_SIGNAL_V1 } from '@modules/vehicle-intelligence/full-signal-discovery/orchestration/fsd4-discovery-request.v1';

const FSD3_REJECTED_DOCUMENT_PREFIX = '__fsd3_rejected_document__:';

export function isInternalFsdEvidenceSignalName(signalName: string): boolean {
  if (signalName === FSD3_CATALOG_FINGERPRINT_EVIDENCE_SIGNAL_V1) return true;
  if (signalName === FSD4_CATALOG_FINGERPRINT_EVIDENCE_SIGNAL_V1) return true;
  if (signalName.startsWith(FSD3_REJECTED_DOCUMENT_PREFIX)) return true;
  return false;
}

export function filterAuthoritativeCatalogSignalNames(names: readonly string[]): string[] {
  return [...names].filter((n) => !isInternalFsdEvidenceSignalName(n)).sort((a, b) => a.localeCompare(b));
}
