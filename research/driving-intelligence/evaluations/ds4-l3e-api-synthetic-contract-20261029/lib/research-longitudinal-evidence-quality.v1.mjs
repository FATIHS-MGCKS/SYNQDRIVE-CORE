/**
 * Research-only — NOT imported by production code.
 * Maps pinned motion + assessment summaries to Layer 2 evidenceQuality input without mutating sparse.channelOutcome.
 */

export const RESEARCH_LONGITUDINAL_EVIDENCE_CONTRACT_ID =
  'DS4_LONGITUDINAL_EVIDENCE_QUALITY_RESEARCH_V1';
export const RESEARCH_LONGITUDINAL_EVIDENCE_CONTRACT_VERSION = '20261029';

/**
 * @param {object} input
 * @param {string} input.sourceFamily
 * @param {Array<{channel:string,outcome:string}>} input.channelManifest
 * @param {string|null} input.sparseChannelOutcome
 * @param {'C4_ONLY'|'C5_1_PREFERRED'|'AMBIGUOUS'|string|null} input.speedAuthority
 * @param {object|null} input.eventSummaries
 */
export function evaluateResearchLongitudinalEvidenceQualityV1(input) {
  const sparseChannelOutcomeUnmodified = input.sparseChannelOutcome ?? null;
  const channelManifest = input.channelManifest ?? [];

  if (input.eventSummaries == null || typeof input.eventSummaries !== 'object') {
    return {
      verdict: 'NOT_EVALUABLE',
      longitudinalL2InputEvidenceQuality: null,
      sparseChannelOutcomeUnmodified,
      reasonCodes: ['ASSESSMENT_SUMMARIES_INCOMPLETE'],
    };
  }

  const exposure = input.eventSummaries.drivingExposure;
  if (exposure == null || typeof exposure !== 'object') {
    return {
      verdict: 'NOT_EVALUABLE',
      longitudinalL2InputEvidenceQuality: null,
      sparseChannelOutcomeUnmodified,
      reasonCodes: ['ASSESSMENT_SUMMARIES_INCOMPLETE'],
    };
  }

  if (input.sourceFamily === 'RUPTELA_R1') {
    const l2q = sparseChannelOutcomeUnmodified;
    const pass = l2q === 'PRESENT';
    return {
      verdict: pass ? 'PASS' : 'FAIL',
      longitudinalL2InputEvidenceQuality: l2q,
      sparseChannelOutcomeUnmodified,
      reasonCodes: pass
        ? ['SOURCE_FAMILY_R1_LEGACY_PATH']
        : ['SOURCE_FAMILY_R1_LEGACY_PATH', 'R1_CHANNEL_OUTCOME_NOT_PRESENT'],
    };
  }

  if (input.sourceFamily === 'API_SYNTHETIC') {
    const reasonCodes = ['SOURCE_FAMILY_API_SYNTHETIC_PATH'];
    const position = channelManifest.find((c) => c.channel === 'POSITION');
    if (position?.outcome !== 'PRESENT') {
      reasonCodes.push('POSITION_OUTCOME_NOT_PRESENT');
    }
    if (input.speedAuthority !== 'C4_ONLY' && input.speedAuthority !== 'C5_1_PREFERRED') {
      reasonCodes.push('SPEED_AUTHORITY_AMBIGUOUS');
    }
    if (exposure.derivable !== true) {
      reasonCodes.push('DRIVING_EXPOSURE_NOT_DERIVABLE');
    }
    const eS = exposure.exposureSeconds;
    if (!(typeof eS === 'number' && Number.isFinite(eS) && eS > 0)) {
      reasonCodes.push('EXPOSURE_SECONDS_INVALID');
    }
    const prov = exposure.provenance ?? {};
    if (prov.canonicalSpeedSeriesMissing === true) {
      reasonCodes.push('CANONICAL_SPEED_SERIES_MISSING');
    }
    if (!(typeof prov.qualifyingIntervalCount === 'number' && prov.qualifyingIntervalCount > 0)) {
      reasonCodes.push('QUALIFYING_INTERVALS_ABSENT');
    }
    const directFsm = typeof prov.fsmMovingDirectLabelCount === 'number' ? prov.fsmMovingDirectLabelCount : 0;
    if (directFsm <= 0) {
      reasonCodes.push('FSM_DIRECT_LABELS_ABSENT');
    }
    const rated = input.eventSummaries.ratedEventCount;
    if (!(typeof rated === 'number' && rated >= 1)) {
      reasonCodes.push('RATED_EVENTS_ABSENT');
    }

    const failPredicates = reasonCodes.filter((c) => c !== 'SOURCE_FAMILY_API_SYNTHETIC_PATH');
    const pass = failPredicates.length === 0;
    return {
      verdict: pass ? 'PASS' : 'FAIL',
      longitudinalL2InputEvidenceQuality: pass ? 'PRESENT' : sparseChannelOutcomeUnmodified,
      sparseChannelOutcomeUnmodified,
      reasonCodes,
    };
  }

  return {
    verdict: 'NOT_EVALUABLE',
    longitudinalL2InputEvidenceQuality: null,
    sparseChannelOutcomeUnmodified,
    reasonCodes: ['ASSESSMENT_SUMMARIES_INCOMPLETE'],
  };
}
