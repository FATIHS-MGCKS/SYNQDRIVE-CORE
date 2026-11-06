/**
 * DS4 DBI W0 — E9 null Monte Carlo selection reporting (research only).
 * Aggregates abstention accounting and empirical eligibility from drawRecords without changing D8.
 */

/** Independent audit: 200k-trial MC (~0.02251 P(D8 KNOWN)); not the same random stream as the offline 50-draw batch. */
export const DS4_DBI_W0_E9_EXTERNAL_ELIGIBILITY_AUDIT_200K_V1 = {
  source: 'ARCHITECT_SELECTION_GATE_AUDIT_2026_11_06',
  totalTrials: 200_000,
  estimatedEligibilityRateApprox: 0.02251,
  methodologyNote:
    'Separate deterministic MC with same mulberry32 PRNG and E9 geometry (Es=660s, n=12, 11 × 60s slots); not produced by this CLI draw batch.',
} as const;

export type E9NullMonteCarloDrawRecordLikeV1 = {
  seed: number;
  d8Status: 'KNOWN' | 'ABSTAIN';
  d8ReasonCodes: readonly string[];
  indexOfDispersion: number | null;
};

export type E9NullMonteCarloCoreResultLikeV1 = {
  acceptedIOD: readonly number[];
  acceptedCount: number;
  abstainedCount: number;
  drawRecords: readonly E9NullMonteCarloDrawRecordLikeV1[];
  meanIod: number | null;
};

function abstentionReasonKeyV1(r: E9NullMonteCarloDrawRecordLikeV1): string {
  const codes = [...new Set([...r.d8ReasonCodes].map((c) => String(c)))].sort();
  return `${r.d8Status}::${codes.join('|') || '_'}`;
}

/** Verdict when empirical acceptance is zero in a finite batch (not "the probability is zero"). */
export function buildE9SelectionHazardV1(input: {
  model: 'OCCUPANCY_CONDITIONED_NULL' | 'UNRESTRICTED_UNIFORM_ON_EXPOSURE';
  empiricalEligibilityRate: number;
  totalDraws: number;
  abstainedCount: number;
}): {
  verdict: 'LOW_FINITE_BATCH_CENSORSHIP_RISK' | 'HIGH_D8_GATE_CENSORSHIP';
  summary: string;
  empiricalRateFromThisRunOnly: number;
  finiteBatchWarning: string;
  d8SupportGateAffectsUnrestrictedReference: boolean;
} {
  const finiteBatchWarning =
    'empiricalEligibilityRate is acceptedCount/totalDraws for this batch only; 0/totalDraws does not imply a theoretical or population eligibility of zero.';

  if (input.model === 'OCCUPANCY_CONDITIONED_NULL') {
    return {
      verdict: 'LOW_FINITE_BATCH_CENSORSHIP_RISK',
      summary:
        'Occupancy-enforcing construction mechanically tends to satisfy preregistered minNonemptyWindowsD8 alongside nEv≥minEventsD8; finite-batch acceptance can still be <1 if other D8 paths fail.',
      empiricalRateFromThisRunOnly: input.empiricalEligibilityRate,
      finiteBatchWarning,
      d8SupportGateAffectsUnrestrictedReference: false,
    };
  }

  const highCensorship = input.empiricalEligibilityRate === 0 || input.abstainedCount / Math.max(1, input.totalDraws) > 0.85;
  return {
    verdict: highCensorship ? 'HIGH_D8_GATE_CENSORSHIP' : 'LOW_FINITE_BATCH_CENSORSHIP_RISK',
    summary:
      'UNRESTRICTED_UNIFORM_ON_EXPOSURE draws are evaluated through the same preregistered D8 support gate; most draws may ABSTAIN (e.g. insufficient nonempty 60s windows). IOD summaries on accepted-only paths therefore reflect a censored reference, not the full unrestricted process.',
    empiricalRateFromThisRunOnly: input.empiricalEligibilityRate,
    finiteBatchWarning,
    d8SupportGateAffectsUnrestrictedReference: true,
  };
}

export function buildE9NullDistributionSelectionBlockV1(input: {
  model: 'OCCUPANCY_CONDITIONED_NULL' | 'UNRESTRICTED_UNIFORM_ON_EXPOSURE';
  totalDraws: number;
  mc: E9NullMonteCarloCoreResultLikeV1;
  /** Extra narrative for unrestricted vs occupancy */
  interpretationLimitation: string;
  constructionSemantics: string;
  /** When true, attach external 200k audit metadata (unrestricted arm). */
  includeExternalEligibilityEvidence: boolean;
}): {
  totalDraws: number;
  acceptedCount: number;
  abstainedCount: number;
  empiricalEligibilityRate: number;
  abstentionReasonCounts: Record<string, number>;
  selectionHazard: ReturnType<typeof buildE9SelectionHazardV1>;
  interpretationLimitation: string;
  constructionSemantics: string;
  externalEligibilityScaleEvidence?: typeof DS4_DBI_W0_E9_EXTERNAL_ELIGIBILITY_AUDIT_200K_V1;
} {
  const { mc, totalDraws, model } = input;
  if (mc.drawRecords.length !== totalDraws) {
    throw new Error(`E9 null report: drawRecords length ${mc.drawRecords.length} !== totalDraws ${totalDraws}`);
  }
  if (mc.acceptedCount + mc.abstainedCount !== totalDraws) {
    throw new Error(`E9 null report: acceptedCount+abstainedCount !== totalDraws`);
  }

  const abstentionReasonCounts: Record<string, number> = {};
  for (const r of mc.drawRecords) {
    const accepted =
      r.d8Status === 'KNOWN' && r.indexOfDispersion != null && Number.isFinite(r.indexOfDispersion);
    if (!accepted) {
      const k = abstentionReasonKeyV1(r);
      abstentionReasonCounts[k] = (abstentionReasonCounts[k] ?? 0) + 1;
    }
  }
  const empiricalEligibilityRate = totalDraws > 0 ? mc.acceptedCount / totalDraws : 0;

  const selectionHazard = buildE9SelectionHazardV1({
    model,
    empiricalEligibilityRate,
    totalDraws,
    abstainedCount: mc.abstainedCount,
  });

  const base = {
    totalDraws,
    acceptedCount: mc.acceptedCount,
    abstainedCount: mc.abstainedCount,
    empiricalEligibilityRate,
    abstentionReasonCounts,
    selectionHazard,
    interpretationLimitation: input.interpretationLimitation,
    constructionSemantics: input.constructionSemantics,
  };

  if (input.includeExternalEligibilityEvidence) {
    return {
      ...base,
      externalEligibilityScaleEvidence: DS4_DBI_W0_E9_EXTERNAL_ELIGIBILITY_AUDIT_200K_V1,
    };
  }
  return base;
}
