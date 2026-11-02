import {
  VSI_CANONICAL_SIGNAL_DEFINITIONS,
  type VsiCanonicalSignalKey,
} from './canonical-signal-keys';
import { VSI_P3A_MATERIALIZATION_CATALOG_KEYS } from './vsi-p3a-catalog-axis.contract';
import type {
  VsiP0aApplicability,
  VsiP0aFindingClass,
  VsiP0aFindingPriority,
  VsiP0aHfAvailability,
  VsiP0aSignalIntegrityMatrixRow,
} from './vsi-p0a-signal-integrity-audit.types';
import type { VsiP0aAuditCohortVehicle } from './vsi-p0a-signal-integrity-audit.types';
import {
  resolveVsiRpmCombinedEvidenceAvailabilityV1,
  type VsiRpmCombinedEvidenceInputV1,
} from './vsi-engine-rpm-combined-evidence-v1.util';

function buildP0aEngineRpmCombinedInput(input: VsiP0aClassifierInput): VsiRpmCombinedEvidenceInputV1 {
  const rpmApplicability =
    input.applicability === 'NOT_APPLICABLE'
      ? 'NOT_APPLICABLE'
      : input.applicability === 'APPLICABLE'
        ? 'APPLICABLE'
        : 'UNKNOWN';
  const hfSamples = input.hfSampleCount ?? null;
  return {
    rpmApplicability,
    powertrainApplicability:
      input.applicability === 'NOT_APPLICABLE'
        ? 'NOT_APPLICABLE'
        : input.applicability === 'APPLICABLE'
          ? 'APPLICABLE'
          : 'UNKNOWN',
    profileLimitations: input.limitations.filter((l) =>
      [
        'MULTI_ACTIVE_SOURCE_LINK_DECLARED_CATALOG_AMBIGUOUS',
        'LATEST_STATE_NOT_ATTRIBUTED_TO_SOURCE_LINK',
        'PROVIDER_IDENTITY_MISMATCH_DECLARED_CATALOG_DIMO_ONLY',
      ].includes(l),
    ),
    snapshot: {
      empiricalObservation: input.snapshotObservation ?? 'UNKNOWN',
      freshnessClassification: input.freshness,
      lastValidObservationAt: null,
      qualityClassification: input.snapshotQuality,
    },
    cadence: {
      observedSampleCount: hfSamples,
      finalizedTripCount: input.hfAvailability === 'SUPPORTED_WITH_SAMPLES' ? 1 : null,
      activeRpmProfile: input.activeCadenceProfile,
      provenance: input.provenance,
      limitations: input.limitations,
      tripClassificationCount:
        input.hfAvailability === 'SUPPORTED_WITH_SAMPLES' && hfSamples != null && hfSamples > 0
          ? 1
          : 0,
    },
  };
}

export function resolveVsiP0aApplicability(
  key: VsiCanonicalSignalKey,
  vehicle: VsiP0aAuditCohortVehicle,
): VsiP0aApplicability {
  const def = VSI_CANONICAL_SIGNAL_DEFINITIONS[key];
  if (def.evOnly && vehicle.powertrainClass === 'ICE') return 'NOT_APPLICABLE';
  if (def.iceOnly && vehicle.powertrainClass === 'EV') return 'NOT_APPLICABLE';
  if (def.evOnly || def.iceOnly) return 'APPLICABLE';
  return 'UNKNOWN';
}

export function isVsiP0aDeclaredCatalogKey(key: VsiCanonicalSignalKey): boolean {
  return (VSI_P3A_MATERIALIZATION_CATALOG_KEYS as readonly string[]).includes(key);
}

export type VsiP0aClassifierInput = {
  vehicle: VsiP0aAuditCohortVehicle;
  canonicalSignal: VsiCanonicalSignalKey;
  applicability: VsiP0aApplicability;
  declaredSupport: string | null;
  snapshotObservation: string | null;
  snapshotQuality: string | null;
  snapshotConfidence: string | null;
  hfAvailability: VsiP0aHfAvailability;
  hfSampleCount: number | null;
  activeCadenceProfile: string | null;
  freshness: string | null;
  provenance: string[];
  limitations: string[];
  materializedInProfile: boolean;
};

export function classifyVsiP0aSignalFinding(input: VsiP0aClassifierInput): {
  findingClass: VsiP0aFindingClass;
  severity: VsiP0aFindingPriority;
  evidenceReference: string;
} {
  const key = input.canonicalSignal;

  if (
    input.snapshotObservation === 'OBSERVED' &&
    (input.snapshotQuality === 'UNKNOWN' || input.snapshotQuality == null)
  ) {
    const lim = input.limitations.find((l) => l.includes('EMPIRICAL_EXTRACTOR_NOT_IMPLEMENTED'));
    if (lim || key === 'provider_last_successful_fetch') {
      return {
        findingClass: 'CONFIRMED_BUG',
        severity: 'P0',
        evidenceReference: `observed_unknown_quality:${key}:${lim ?? 'quality_unknown'}`,
      };
    }
  }

  const provenanceDup =
    input.provenance.length > 1 &&
    new Set(input.provenance).size < input.provenance.length;
  if (provenanceDup) {
    return {
      findingClass: 'CONFIRMED_BUG',
      severity: 'P0',
      evidenceReference: 'cadence_provenance_duplicate_entries',
    };
  }

  if (
    key === 'engine_rpm' &&
    input.snapshotObservation === 'NEVER_OBSERVED' &&
    input.hfAvailability === 'SUPPORTED_WITH_SAMPLES' &&
    (input.hfSampleCount ?? 0) > 0 &&
    input.activeCadenceProfile &&
    input.activeCadenceProfile !== 'UNKNOWN'
  ) {
    const combined = resolveVsiRpmCombinedEvidenceAvailabilityV1(
      buildP0aEngineRpmCombinedInput(input),
    );
    if (combined.availability === 'PROVEN_HISTORICAL_ONLY') {
      return {
        findingClass: 'EXPECTED_BEHAVIOR',
        severity: 'P3',
        evidenceReference: 'rpm_dual_lane_combined_historical_only_v1',
      };
    }
    return {
      findingClass: 'MISLEADING_PRESENTATION',
      severity: 'P1',
      evidenceReference: 'lane_a_never_observed_lane_b_hf_rpm_profile',
    };
  }

  if (
    input.applicability === 'NOT_APPLICABLE' &&
    (input.snapshotObservation === 'NEVER_OBSERVED' ||
      input.snapshotObservation === 'NOT_APPLICABLE')
  ) {
    if (input.snapshotObservation === 'NOT_APPLICABLE') {
      return {
        findingClass: 'EXPECTED_BEHAVIOR',
        severity: 'P3',
        evidenceReference: 'powertrain_not_applicable_correctly_materialized',
      };
    }
    return {
      findingClass: 'MISLEADING_PRESENTATION',
      severity: 'P1',
      evidenceReference: 'not_applicable_shown_as_never_observed',
    };
  }

  if (!isVsiP0aDeclaredCatalogKey(key) && input.declaredSupport === 'UNKNOWN') {
    return {
      findingClass: 'SEMANTIC_AMBIGUITY',
      severity: 'P1',
      evidenceReference: 'declared_support_unknown_outside_p3a_catalog',
    };
  }

  if (
    input.snapshotConfidence === 'LOW' &&
    input.hfAvailability === 'SUPPORTED_WITH_SAMPLES' &&
    (input.hfSampleCount ?? 0) > 0 &&
    key === 'engine_rpm'
  ) {
    return {
      findingClass: 'MISLEADING_PRESENTATION',
      severity: 'P1',
      evidenceReference: 'low_confidence_despite_hf_samples',
    };
  }

  if (input.freshness === 'FRESH' && key === 'vehicle_speed') {
    return {
      findingClass: 'SEMANTIC_AMBIGUITY',
      severity: 'P2',
      evidenceReference: 'freshness_standby_semantics_review',
    };
  }

  if (!input.materializedInProfile) {
    return {
      findingClass: 'INSUFFICIENT_EVIDENCE',
      severity: 'P3',
      evidenceReference: 'signal_not_materialized_in_profile_snapshot',
    };
  }

  if (input.hfAvailability === 'NOT_VERIFIED') {
    return {
      findingClass: 'INSUFFICIENT_EVIDENCE',
      severity: 'P3',
      evidenceReference: 'hf_channel_not_verified',
    };
  }

  return {
    findingClass: 'EXPECTED_BEHAVIOR',
    severity: 'P3',
    evidenceReference: 'no_actionable_deviation',
  };
}

export function summarizeVsiP0aMatrix(rows: VsiP0aSignalIntegrityMatrixRow[]): {
  confirmedBugs: number;
  misleadingPresentations: number;
  semanticAmbiguities: number;
  insufficientEvidence: number;
  expectedBehavior: number;
  p0Findings: number;
  p1Findings: number;
  verifiedRows: number;
  notVerifiedRows: number;
} {
  let confirmedBugs = 0;
  let misleadingPresentations = 0;
  let semanticAmbiguities = 0;
  let insufficientEvidence = 0;
  let expectedBehavior = 0;
  let p0Findings = 0;
  let p1Findings = 0;
  let verifiedRows = 0;
  let notVerifiedRows = 0;

  for (const row of rows) {
    if (row.verificationStatus === 'VERIFIED') verifiedRows += 1;
    else notVerifiedRows += 1;
    switch (row.findingClass) {
      case 'CONFIRMED_BUG':
        confirmedBugs += 1;
        break;
      case 'MISLEADING_PRESENTATION':
        misleadingPresentations += 1;
        break;
      case 'SEMANTIC_AMBIGUITY':
        semanticAmbiguities += 1;
        break;
      case 'INSUFFICIENT_EVIDENCE':
        insufficientEvidence += 1;
        break;
      default:
        expectedBehavior += 1;
    }
    if (row.severity === 'P0') p0Findings += 1;
    if (row.severity === 'P1') p1Findings += 1;
  }

  return {
    confirmedBugs,
    misleadingPresentations,
    semanticAmbiguities,
    insufficientEvidence,
    expectedBehavior,
    p0Findings,
    p1Findings,
    verifiedRows,
    notVerifiedRows,
  };
}
