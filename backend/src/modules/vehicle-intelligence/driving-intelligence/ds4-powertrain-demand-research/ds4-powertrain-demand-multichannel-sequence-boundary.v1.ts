/**
 * v1b admitted multichannel sequence continuity vs research detector cluster gaps.
 * W3-046: merge defects occur when label gap exceeds sequenceMaxGapSeconds but
 * remains within the detector maxAdjacentLabelGapMs bridge window.
 */
export function gapCrossesAdmittedSequenceBoundary(input: {
  labelGapMs: number;
  sequenceMaxGapSeconds: number;
  maxAdjacentLabelGapMs: number;
}): boolean {
  const seqMaxMs = input.sequenceMaxGapSeconds * 1000;
  return input.labelGapMs > seqMaxMs && input.labelGapMs < input.maxAdjacentLabelGapMs;
}

export function splitBucketsAtAdmittedSequenceBoundaries<T extends { recordedAtMs: number }>(
  buckets: readonly T[],
  sequenceMaxGapSeconds: number,
  maxAdjacentLabelGapMs: number,
): T[][] {
  if (buckets.length === 0) return [];
  const sorted = [...buckets].sort((a, b) => a.recordedAtMs - b.recordedAtMs);
  const sequences: T[][] = [[sorted[0]!]];
  for (let i = 1; i < sorted.length; i += 1) {
    const gap = sorted[i]!.recordedAtMs - sorted[i - 1]!.recordedAtMs;
    if (
      gapCrossesAdmittedSequenceBoundary({
        labelGapMs: gap,
        sequenceMaxGapSeconds,
        maxAdjacentLabelGapMs,
      })
    ) {
      sequences.push([sorted[i]!]);
    } else {
      sequences[sequences.length - 1]!.push(sorted[i]!);
    }
  }
  return sequences;
}
