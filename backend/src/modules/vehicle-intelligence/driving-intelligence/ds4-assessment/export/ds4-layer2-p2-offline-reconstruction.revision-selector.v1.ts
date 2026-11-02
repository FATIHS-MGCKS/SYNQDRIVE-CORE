import type { Ds4SpeedAuthorityPartitionV1 } from '../ds4-trip-assessment-v1.contract';

export type Ds4Layer2P2MotionRevisionCandidateV1 = {
  motionRunId: string;
  createdAtUtc: string;
  pinnedSnapshotHash: string;
  combinedInputIdentity: string;
  contentFingerprint: string;
  payloadContract: string;
  collectionEligible: boolean;
  collectionIneligibleReason: string | null;
  speedAuthority: Ds4SpeedAuthorityPartitionV1 | null;
  exposureDerivable: boolean;
  corruptOrMissingPayload: boolean;
};

export type Ds4Layer2P2RevisionSelectionRowV1 = {
  tripId: string;
  motionRunId: string;
  createdAtUtc: string;
  selected: boolean;
  rejectionReasons: readonly string[];
  pinnedSnapshotHash: string;
  combinedInputIdentity: string;
  contentFingerprint: string;
  payloadContract: string;
  collectionEligible: boolean;
  speedAuthority: string | null;
  exposureDerivable: boolean;
};

export type Ds4Layer2P2RevisionSelectionResultV1 = {
  selected: Ds4Layer2P2MotionRevisionCandidateV1;
  rows: readonly Ds4Layer2P2RevisionSelectionRowV1[];
  selectionPolicy: string;
};

const SELECTION_POLICY =
  'V2 collection-eligible + exposure-derivable + known speed authority (C4_ONLY or C5_1_PREFERRED); latest created_at among eligible; motionRunId lexicographic tie-break; never mix revisions';

function compareCandidatesAscending(
  a: Ds4Layer2P2MotionRevisionCandidateV1,
  b: Ds4Layer2P2MotionRevisionCandidateV1,
): number {
  const byCreated = a.createdAtUtc.localeCompare(b.createdAtUtc);
  if (byCreated !== 0) return byCreated;
  return a.motionRunId.localeCompare(b.motionRunId);
}

function compareEligibleForSelection(
  a: Ds4Layer2P2MotionRevisionCandidateV1,
  b: Ds4Layer2P2MotionRevisionCandidateV1,
): number {
  const byCreatedDesc = b.createdAtUtc.localeCompare(a.createdAtUtc);
  if (byCreatedDesc !== 0) return byCreatedDesc;
  return a.motionRunId.localeCompare(b.motionRunId);
}

function rejectionReasons(candidate: Ds4Layer2P2MotionRevisionCandidateV1): string[] {
  const reasons: string[] = [];
  if (candidate.corruptOrMissingPayload) reasons.push('CORRUPT_OR_MISSING_PAYLOAD');
  if (candidate.payloadContract !== 'V2_INTENSITY') reasons.push('PAYLOAD_CONTRACT_NOT_V2');
  if (!candidate.collectionEligible) {
    reasons.push(candidate.collectionIneligibleReason ?? 'COLLECTION_INELIGIBLE');
  }
  if (!candidate.exposureDerivable) reasons.push('EXPOSURE_NOT_DERIVABLE');
  if (
    candidate.speedAuthority !== 'C4_ONLY' &&
    candidate.speedAuthority !== 'C5_1_PREFERRED'
  ) {
    reasons.push('SPEED_AUTHORITY_UNKNOWN_OR_AMBIGUOUS');
  }
  return reasons;
}

function isEligible(candidate: Ds4Layer2P2MotionRevisionCandidateV1): boolean {
  return rejectionReasons(candidate).length === 0;
}

export function selectDs4Layer2P2MotionRevisionV1(input: {
  tripId: string;
  candidates: readonly Ds4Layer2P2MotionRevisionCandidateV1[];
}): Ds4Layer2P2RevisionSelectionResultV1 {
  if (input.candidates.length === 0) {
    throw new Error(`No motion revisions for trip ${input.tripId}`);
  }

  const sorted = [...input.candidates].sort(compareCandidatesAscending);
  const eligible = sorted.filter(isEligible);
  const selected =
    eligible.length > 0 ? [...eligible].sort(compareEligibleForSelection)[0]! : null;

  if (!selected) {
    throw new Error(`No eligible motion revision for trip ${input.tripId}`);
  }

  const rows: Ds4Layer2P2RevisionSelectionRowV1[] = sorted.map((c) => {
    const reasons = rejectionReasons(c);
    const isSelected = c.motionRunId === selected.motionRunId;
    if (isSelected && reasons.length > 0) {
      throw new Error(`Internal selection invariant violated for trip ${input.tripId}`);
    }
    if (!isSelected && reasons.length === 0) {
      reasons.push('SUPERSEDED_BY_LATER_ELIGIBLE_REVISION');
    }
    return {
      tripId: input.tripId,
      motionRunId: c.motionRunId,
      createdAtUtc: c.createdAtUtc,
      selected: isSelected,
      rejectionReasons: reasons,
      pinnedSnapshotHash: c.pinnedSnapshotHash,
      combinedInputIdentity: c.combinedInputIdentity,
      contentFingerprint: c.contentFingerprint,
      payloadContract: c.payloadContract,
      collectionEligible: c.collectionEligible,
      speedAuthority: c.speedAuthority,
      exposureDerivable: c.exposureDerivable,
    };
  });

  return {
    selected,
    rows,
    selectionPolicy: SELECTION_POLICY,
  };
}
