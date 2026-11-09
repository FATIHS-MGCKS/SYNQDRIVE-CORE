import type { DbiP2c2OfflineEvidenceBundleV1 } from '../dbi-p2c2-offline-evidence-adapters/dbi-p2c2-evidence-adapter.contract.v1';
import { tryCanonicalizeJsonValue } from './dbi-p2c3-reconciliation.canonical-json.v1';
import type { DbiP2c3ReconciliationDiagnosticCodeV1 } from './dbi-p2c3-reconciliation.contract.v1';

function rejectIfNotJsonSafe(value: unknown, codes: DbiP2c3ReconciliationDiagnosticCodeV1[]): void {
  const result = tryCanonicalizeJsonValue(value);
  if (!result.ok) {
    codes.push('PARTICIPANT_PROJECTION_CANONICAL_INVALID');
  }
}

/** Fail-closed JSON safety for participant fields that are copied into moduleProjection and the result digest. */
export function validateParticipantProjectionJsonSafety(
  bundle: DbiP2c2OfflineEvidenceBundleV1,
): readonly DbiP2c3ReconciliationDiagnosticCodeV1[] {
  const codes: DbiP2c3ReconciliationDiagnosticCodeV1[] = [];

  if (bundle.descriptive) {
    const part = bundle.descriptive.participant;
    rejectIfNotJsonSafe(part.moduleAssessability, codes);
    rejectIfNotJsonSafe(part.highEpisodesMeta, codes);
  }

  for (const plane of bundle.powertrainProxies) {
    const part = plane.participant;
    switch (part.sourceModule) {
      case 'P2-B1':
        rejectIfNotJsonSafe(part.moduleCoverage, codes);
        break;
      case 'P2-B2':
        rejectIfNotJsonSafe(part.moduleCoverage, codes);
        rejectIfNotJsonSafe(part.subtypeAssessability, codes);
        break;
      case 'P2-B3':
        rejectIfNotJsonSafe(part.partialCoverage, codes);
        break;
      case 'P2-B4':
        rejectIfNotJsonSafe(part.facetA, codes);
        rejectIfNotJsonSafe(part.facetB, codes);
        break;
      default:
        break;
    }
  }

  return [...new Set(codes)].sort();
}
