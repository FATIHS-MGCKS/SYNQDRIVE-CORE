import type { DiV0MotionCoreShadowPayloadV1 } from '../../motion-core-shadow-worker/di-v0-motion-core-shadow.types';
import type {
  Ds4Layer2P4eBoundaryRepairStateV1,
  Ds4Layer2P4ePersistedRepairStateV1,
  Ds4Layer2P4eRepairEvidenceAvailabilityV1,
  Ds4Layer2P4eRepairStateEvidenceV1,
  Ds4Layer2P4eRepairStateHistogramV1,
  Ds4Layer2P4eWindowSpeedLimitationV1,
} from './ds4-layer2-p4e-repair-state-evidence.v1.contract';

function normalizeLabelUtc(label: string): string {
  return label.endsWith('Z') ? label : `${label.replace(/(\.\d{3})\d+Z$/, '$1Z')}`;
}

function labelInInclusiveWindow(bucketLabelUtc: string, startLabel: string, endLabel: string): boolean {
  const b = normalizeLabelUtc(bucketLabelUtc);
  const s = normalizeLabelUtc(startLabel);
  const e = normalizeLabelUtc(endLabel);
  return b >= s && b <= e;
}

/**
 * Legacy P4B research predicate — documented defect: treats PASS_THROUGH_* and REPAIR_REJECTED
 * the same as REPAIR_ACCEPTED; on pinned cohort this equals payload speedAuthority C5_1_PREFERRED.
 */
export function isDs4Layer2P4bLegacyRepairInfluencedV1(repairState: string | null | undefined): boolean {
  if (repairState == null) return false;
  const s = repairState.toUpperCase();
  return s !== 'NONE' && s !== 'UNREPAIRED' && s !== '';
}

function classifyPersistedRepairState(state: string | null | undefined): Ds4Layer2P4ePersistedRepairStateV1 | 'UNKNOWN' {
  if (state == null || state === '') return 'UNKNOWN';
  const upper = state.toUpperCase();
  switch (upper) {
    case 'REPAIR_ACCEPTED':
    case 'REPAIR_REJECTED':
    case 'PASS_THROUGH_OUTSIDE_WINDOW':
    case 'PASS_THROUGH_NO_REPAIR':
    case 'UNCERTAIN':
      return upper;
    default:
      return 'UNKNOWN';
  }
}

function isPassThroughState(state: Ds4Layer2P4ePersistedRepairStateV1 | 'UNKNOWN'): boolean {
  return state === 'PASS_THROUGH_OUTSIDE_WINDOW' || state === 'PASS_THROUGH_NO_REPAIR';
}

function boundaryStateFromRows(
  rows: readonly { bucketLabelUtc: string; repairState: string }[],
  boundaryLabel: string,
): Ds4Layer2P4eBoundaryRepairStateV1 {
  const match = rows.find((r) => normalizeLabelUtc(r.bucketLabelUtc) === normalizeLabelUtc(boundaryLabel));
  if (!match) return 'NO_ROW_AT_BOUNDARY';
  const classified = classifyPersistedRepairState(match.repairState);
  if (classified === 'UNKNOWN') return 'UNAVAILABLE';
  return classified as Ds4Layer2P4eBoundaryRepairStateV1;
}

function emptyHistogram(): Ds4Layer2P4eRepairStateHistogramV1 {
  return {
    repairAcceptedInWindow: 0,
    repairRejectedInWindow: 0,
    repairUncertainInWindow: 0,
    repairPassThroughInWindow: 0,
    repairUnknownStateInWindow: 0,
    inWindowRepairRowCount: 0,
  };
}

export function computeDs4Layer2P4eRepairStateEvidenceV1(input: {
  payload: DiV0MotionCoreShadowPayloadV1;
  payloadSpeedAuthority: string | null;
  startLabel: string;
  endLabel: string;
  durationTier: string;
  kinematicLimitations: readonly Ds4Layer2P4eWindowSpeedLimitationV1[];
}): Ds4Layer2P4eRepairStateEvidenceV1 {
  const limitations: Ds4Layer2P4eWindowSpeedLimitationV1[] = [...input.kinematicLimitations];
  const histogram = emptyHistogram();
  let repairInfluencedLegacy = false;

  const authority = input.payloadSpeedAuthority ?? input.payload.contract?.speedAuthority ?? null;
  let repairEvidenceAvailability: Ds4Layer2P4eRepairEvidenceAvailabilityV1 = 'UNKNOWN_REPAIR_STATE';

  if (authority === 'C4_ONLY') {
    repairEvidenceAvailability = 'NOT_APPLICABLE_C4_ONLY';
  } else if (input.payload.speedRepairs == null) {
    repairEvidenceAvailability = 'PAYLOAD_ROWS_MISSING';
  } else {
    repairEvidenceAvailability = 'PAYLOAD_ROWS_PRESENT';
  }

  const inWindowRows: { bucketLabelUtc: string; repairState: string }[] = [];
  for (const repair of input.payload.speedRepairs ?? []) {
    if (!labelInInclusiveWindow(repair.bucketLabelUtc, input.startLabel, input.endLabel)) continue;
    inWindowRows.push(repair);
    if (isDs4Layer2P4bLegacyRepairInfluencedV1(repair.repairState)) {
      repairInfluencedLegacy = true;
    }
    histogram.inWindowRepairRowCount += 1;
    const classified = classifyPersistedRepairState(repair.repairState);
    switch (classified) {
      case 'REPAIR_ACCEPTED':
        histogram.repairAcceptedInWindow += 1;
        break;
      case 'REPAIR_REJECTED':
        histogram.repairRejectedInWindow += 1;
        break;
      case 'UNCERTAIN':
        histogram.repairUncertainInWindow += 1;
        break;
      case 'PASS_THROUGH_OUTSIDE_WINDOW':
      case 'PASS_THROUGH_NO_REPAIR':
        histogram.repairPassThroughInWindow += 1;
        break;
      default:
        histogram.repairUnknownStateInWindow += 1;
        repairEvidenceAvailability = 'UNKNOWN_REPAIR_STATE';
        break;
    }
  }

  if (repairInfluencedLegacy) {
    limitations.push('REPAIR_INFLUENCED_SAMPLE');
  }

  const repairAcceptedInWindow = histogram.repairAcceptedInWindow > 0;
  const repairSuspicionInWindow =
    !repairAcceptedInWindow && histogram.repairRejectedInWindow + histogram.repairUncertainInWindow > 0;

  if (repairAcceptedInWindow) {
    limitations.push('REPAIR_ACCEPTED_IN_WINDOW');
  } else if (repairSuspicionInWindow) {
    limitations.push('REPAIR_SUSPICION_IN_WINDOW');
  }

  const boundaryStartRepairState = boundaryStateFromRows(inWindowRows, input.startLabel);
  const boundaryEndRepairState = boundaryStateFromRows(inWindowRows, input.endLabel);

  if (authority !== 'C4_ONLY' && repairEvidenceAvailability === 'PAYLOAD_ROWS_PRESENT' && histogram.inWindowRepairRowCount === 0) {
    // C5.1 path with repair contract but no rows overlapping event — still valid, not UNKNOWN.
    repairEvidenceAvailability = 'PAYLOAD_ROWS_PRESENT';
  }

  return {
    repairEvidenceAvailability,
    payloadSpeedAuthority: authority,
    repairInfluencedLegacy,
    repairAcceptedInWindow,
    repairSuspicionInWindow,
    boundaryStartRepairState,
    boundaryEndRepairState,
    histogram,
    limitations,
  };
}

export function aggregateDs4Layer2P4eRepairStateHistogramV1(
  rows: readonly Ds4Layer2P4eRepairStateEvidenceV1[],
): Record<string, unknown> {
  const totals = emptyHistogram();
  let legacyTrue = 0;
  let acceptedInWindowEvents = 0;
  let suspicionInWindowEvents = 0;
  let notApplicableC4 = 0;
  let payloadMissing = 0;
  let unknownState = 0;

  for (const row of rows) {
    if (row.repairInfluencedLegacy) legacyTrue += 1;
    if (row.repairAcceptedInWindow) acceptedInWindowEvents += 1;
    if (row.repairSuspicionInWindow) suspicionInWindowEvents += 1;
    if (row.repairEvidenceAvailability === 'NOT_APPLICABLE_C4_ONLY') notApplicableC4 += 1;
    if (row.repairEvidenceAvailability === 'PAYLOAD_ROWS_MISSING') payloadMissing += 1;
    if (row.repairEvidenceAvailability === 'UNKNOWN_REPAIR_STATE') unknownState += 1;
    totals.repairAcceptedInWindow += row.histogram.repairAcceptedInWindow;
    totals.repairRejectedInWindow += row.histogram.repairRejectedInWindow;
    totals.repairUncertainInWindow += row.histogram.repairUncertainInWindow;
    totals.repairPassThroughInWindow += row.histogram.repairPassThroughInWindow;
    totals.repairUnknownStateInWindow += row.histogram.repairUnknownStateInWindow;
    totals.inWindowRepairRowCount += row.histogram.inWindowRepairRowCount;
  }

  return {
    eventCount: rows.length,
    legacyRepairInfluencedEventCount: legacyTrue,
    repairAcceptedInWindowEventCount: acceptedInWindowEvents,
    repairSuspicionInWindowEventCount: suspicionInWindowEvents,
    repairEvidenceNotApplicableC4Only: notApplicableC4,
    repairEvidencePayloadRowsMissing: payloadMissing,
    repairEvidenceUnknownStateEvents: unknownState,
    inWindowRepairRowTotals: totals,
    byPersistedRepairStateInWindow: {
      REPAIR_ACCEPTED: totals.repairAcceptedInWindow,
      REPAIR_REJECTED: totals.repairRejectedInWindow,
      UNCERTAIN: totals.repairUncertainInWindow,
      PASS_THROUGH: totals.repairPassThroughInWindow,
      UNKNOWN: totals.repairUnknownStateInWindow,
    },
  };
}
