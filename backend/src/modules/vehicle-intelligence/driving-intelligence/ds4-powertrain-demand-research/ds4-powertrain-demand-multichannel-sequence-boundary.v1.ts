/**
 * v1b admitted multichannel sequence continuity (W3-046 closeout).
 * Sequence breaks when label gap strictly exceeds binding sequenceMaxGapSeconds.
 * Detector cluster maxAdjacent must not override this continuity rule.
 */
export function gapCrossesAdmittedSequenceBoundary(input: {
  labelGapMs: number;
  sequenceMaxGapSeconds: number;
}): boolean {
  const seqMaxMs = input.sequenceMaxGapSeconds * 1000;
  return input.labelGapMs > seqMaxMs;
}

/** Split sorted buckets at v1b sequence continuity boundaries (gap > sequenceMaxGapSeconds). */
export function splitBucketsAtAdmittedSequenceBoundaries<T extends { recordedAtMs: number }>(
  buckets: readonly T[],
  sequenceMaxGapSeconds: number,
): T[][] {
  if (buckets.length === 0) return [];
  const sorted = [...buckets].sort((a, b) => a.recordedAtMs - b.recordedAtMs);
  const maxGapMs = sequenceMaxGapSeconds * 1000;
  const sequences: T[][] = [[sorted[0]!]];
  for (let i = 1; i < sorted.length; i += 1) {
    const gap = sorted[i]!.recordedAtMs - sorted[i - 1]!.recordedAtMs;
    if (gap > maxGapMs) {
      sequences.push([sorted[i]!]);
    } else {
      sequences[sequences.length - 1]!.push(sorted[i]!);
    }
  }
  return sequences;
}
