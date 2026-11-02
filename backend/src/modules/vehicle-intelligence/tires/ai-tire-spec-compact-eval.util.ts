import { AI_TIRE_SPEC_V3_COMPACT_LLM_FIELD_KEYS } from './ai-tire-spec-canonical.contract';
import { processAiTireSpecCompactLlmOutput } from './ai-tire-spec-compact-pipeline.util';
import type {
  TireSpecCompactEvalCase,
  TireSpecCompactEvalCaseResult,
  TireSpecCompactEvalFieldVerdict,
  TireSpecCompactEvalRunSummary,
  TireSpecEvalAccuracyClass,
  TireSpecSeasonConsistencyReport,
} from './ai-tire-spec-compact-eval.types';

function valuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null && b == null) return true;
  return String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
}

export function listRejectedCompactFields(
  rawParsed: Record<string, unknown>,
  normalized: Record<string, unknown>,
): string[] {
  const rejected: string[] = [];
  for (const key of AI_TIRE_SPEC_V3_COMPACT_LLM_FIELD_KEYS) {
    const rawVal = rawParsed[key];
    const normVal = normalized[key];
    const rawPresent = rawVal !== null && rawVal !== undefined && rawVal !== '';
    if (rawPresent && normVal === null) {
      rejected.push(key);
    }
  }
  return rejected;
}

export function analyzeSeasonConsistency(
  evalCase: TireSpecCompactEvalCase,
  llmSeasonType: string | null | undefined,
): TireSpecSeasonConsistencyReport {
  const llmSeason = llmSeasonType?.trim().toLowerCase() || null;
  const refSeason = evalCase.reference.seasonType ?? null;
  const setup = evalCase.setupTireSeason;
  const setupNorm =
    setup === 'WINTER' ? 'winter' : setup === 'ALL_SEASON' ? 'all_season' : setup === 'SUMMER' ? 'summer' : null;

  const notes: string[] = [];
  let classification: TireSpecSeasonConsistencyReport['classification'] = 'UNVERIFIABLE';

  const refStatus = evalCase.reference.seasonVerificationStatus;
  if (evalCase.reference.seasonNotes) notes.push(evalCase.reference.seasonNotes);

  const mismatchVsReference =
    refSeason && llmSeason ? !valuesEqual(llmSeason, refSeason) : null;
  const mismatchVsSetup =
    setupNorm && llmSeason ? !valuesEqual(llmSeason, setupNorm) : null;

  if (!llmSeason) {
    classification = 'UNVERIFIABLE';
    notes.push('LLM seasonType null — cannot classify mismatch.');
  } else if (refStatus === 'AMBIGUOUS_PRODUCT_LINE' && mismatchVsReference) {
    classification = 'AMBIGUOUS_REFERENCE';
    notes.push('Reference product line season is ambiguous; LLM may disagree without clear ground truth.');
  } else if (mismatchVsSetup && setupNorm && !valuesEqual(setupNorm, llmSeason)) {
    if (mismatchVsReference === true && refStatus === 'VERIFIED_PRODUCT_LINE') {
      classification = 'LLM_MISCLASSIFICATION';
      notes.push('Setup tireSeason remains authoritative for V3; LLM season is not applied to setup.');
    } else if (mismatchVsReference === false) {
      classification = 'SETUP_CONFLICT';
      notes.push('LLM matches reference but differs from setup.tireSeason — operational conflict only.');
    } else {
      classification = 'LLM_MISCLASSIFICATION';
    }
  } else if (mismatchVsReference === true && refStatus === 'VERIFIED_PRODUCT_LINE') {
    classification = 'LLM_MISCLASSIFICATION';
  } else if (!mismatchVsReference && !mismatchVsSetup) {
    classification = 'ALIGNED';
  }

  if (evalCase.id === 'W2') {
    notes.push('Known P2 pattern: winter Alpin mislabeled all_season by knowledge LLM.');
  }
  if (evalCase.id === 'A2') {
    notes.push('Known P2 pattern: CrossClimate mislabeled summer; reference all_season vs marketing blur.');
  }

  return {
    llmSeasonType: llmSeason,
    setupTireSeason: setup,
    referenceSeason: refSeason,
    referenceVerification: refStatus,
    mismatchVsReference,
    mismatchVsSetup,
    classification,
    notes,
  };
}

function scoreIdentity(
  evalCase: TireSpecCompactEvalCase,
  normalized: Record<string, unknown>,
): TireSpecEvalAccuracyClass {
  const id = evalCase.authoritativeIdentity;
  const ok =
    valuesEqual(normalized.matchedBrand, id.brand) &&
    valuesEqual(normalized.matchedModel, id.model) &&
    valuesEqual(normalized.tireSizeRaw, id.tireSize) &&
    valuesEqual(normalized.loadIndex, id.loadIndex) &&
    valuesEqual(normalized.speedIndex, id.speedIndex);
  return ok ? 'CORRECT' : 'INCORRECT';
}

function scoreSeason(
  evalCase: TireSpecCompactEvalCase,
  normalized: Record<string, unknown>,
): TireSpecEvalAccuracyClass {
  const ref = evalCase.reference.seasonType;
  if (!ref || evalCase.reference.seasonVerificationStatus === 'UNVERIFIED_IN_AUDIT') {
    return 'UNVERIFIABLE';
  }
  if (evalCase.reference.seasonVerificationStatus === 'AMBIGUOUS_PRODUCT_LINE') {
    const llm = normalized.seasonType;
    if (llm == null) return 'UNVERIFIABLE';
    return valuesEqual(llm, ref) ? 'CORRECT' : 'UNVERIFIABLE';
  }
  const llm = normalized.seasonType;
  if (llm == null) return 'UNVERIFIABLE';
  return valuesEqual(llm, ref) ? 'CORRECT' : 'INCORRECT';
}

function scoreMarkings(
  evalCase: TireSpecCompactEvalCase,
  normalized: Record<string, unknown>,
): TireSpecEvalAccuracyClass {
  const ref = evalCase.reference;
  if (ref.markVerificationStatus === 'UNVERIFIED_IN_AUDIT' || ref.markEvidence === 'UNKNOWN') {
    return 'NOT_APPLICABLE';
  }

  const checks: Array<{ key: string; expected: boolean | null | undefined }> = [];
  if (ref.evOptimized != null) checks.push({ key: 'evOptimized', expected: ref.evOptimized });
  if (ref.runFlat != null) checks.push({ key: 'runFlat', expected: ref.runFlat });
  if (ref.xl != null) checks.push({ key: 'xl', expected: ref.xl });
  if (ref.severeSnowMarked != null) {
    checks.push({ key: 'severeSnowMarked', expected: ref.severeSnowMarked });
  }

  if (checks.length === 0) return 'NOT_APPLICABLE';

  let scored = 0;
  let correct = 0;
  for (const c of checks) {
    if (c.expected === null || c.expected === undefined) continue;
    scored++;
    if (normalized[c.key] === c.expected) correct++;
  }
  if (scored === 0) return 'NOT_APPLICABLE';
  return correct === scored ? 'CORRECT' : 'INCORRECT';
}

function buildFieldVerdicts(
  evalCase: TireSpecCompactEvalCase,
  normalized: Record<string, unknown>,
): TireSpecCompactEvalFieldVerdict[] {
  const verdicts: TireSpecCompactEvalFieldVerdict[] = [];
  const id = evalCase.authoritativeIdentity;

  for (const [field, expected, actual] of [
    ['matchedBrand', id.brand, normalized.matchedBrand],
    ['matchedModel', id.model, normalized.matchedModel],
    ['tireSizeRaw', id.tireSize, normalized.tireSizeRaw],
    ['loadIndex', id.loadIndex, normalized.loadIndex],
    ['speedIndex', id.speedIndex, normalized.speedIndex],
  ] as const) {
    verdicts.push({
      field,
      expected,
      actual,
      accuracy: valuesEqual(actual, expected) ? 'CORRECT' : 'INCORRECT',
    });
  }

  if (evalCase.reference.seasonType) {
    verdicts.push({
      field: 'seasonType',
      expected: evalCase.reference.seasonType,
      actual: normalized.seasonType,
      accuracy: scoreSeason(evalCase, normalized),
      note: evalCase.reference.seasonVerificationStatus,
    });
  }

  verdicts.push({
    field: 'newTreadDepthMm',
    expected: null,
    actual: normalized.newTreadDepthMm,
    accuracy: normalized.newTreadDepthMm === null ? 'CORRECT' : 'INCORRECT',
    note: 'Evidence gate — knowledge LLM must not persist nominal depth',
  });

  return verdicts;
}

export function runCompactEvalCase(
  evalCase: TireSpecCompactEvalCase,
  rawLlm: Record<string, unknown> | null,
  rawParseSource: TireSpecCompactEvalCaseResult['rawParseSource'],
): TireSpecCompactEvalCaseResult {
  const rawParsed = rawLlm ?? {};
  const normalizedCompact = processAiTireSpecCompactLlmOutput(rawParsed, evalCase.authoritativeIdentity);
  const rejectedFields = listRejectedCompactFields(rawParsed, normalizedCompact);
  const seasonConsistency = analyzeSeasonConsistency(evalCase, normalizedCompact.seasonType as string);

  return {
    id: evalCase.id,
    category: evalCase.category,
    authoritativeIdentity: evalCase.authoritativeIdentity,
    setupTireSeason: evalCase.setupTireSeason,
    reference: evalCase.reference,
    rawLlm: rawLlm,
    rawParseSource,
    normalizedCompact,
    rejectedFields,
    seasonConsistency,
    fieldVerdicts: buildFieldVerdicts(evalCase, normalizedCompact),
    identityAccuracy: scoreIdentity(evalCase, normalizedCompact),
    seasonAccuracy: scoreSeason(evalCase, normalizedCompact),
    markingAccuracy: scoreMarkings(evalCase, normalizedCompact),
  };
}

export function aggregateEvalResults(
  results: TireSpecCompactEvalCaseResult[],
): TireSpecCompactEvalRunSummary['aggregate'] {
  const agg = {
    identityScored: 0,
    identityCorrect: 0,
    seasonScored: 0,
    seasonCorrect: 0,
    markingScored: 0,
    markingCorrect: 0,
  };
  for (const r of results) {
    if (r.identityAccuracy !== 'UNVERIFIABLE' && r.identityAccuracy !== 'NOT_APPLICABLE') {
      agg.identityScored++;
      if (r.identityAccuracy === 'CORRECT') agg.identityCorrect++;
    }
    if (r.seasonAccuracy === 'CORRECT' || r.seasonAccuracy === 'INCORRECT') {
      agg.seasonScored++;
      if (r.seasonAccuracy === 'CORRECT') agg.seasonCorrect++;
    }
    if (r.markingAccuracy === 'CORRECT' || r.markingAccuracy === 'INCORRECT') {
      agg.markingScored++;
      if (r.markingAccuracy === 'CORRECT') agg.markingCorrect++;
    }
  }
  return agg;
}

export type CompactEvalLlmFetcher = (evalCase: TireSpecCompactEvalCase) => Promise<{
  data: Record<string, unknown>;
  model: string;
  rawContent: string;
}>;

export async function runCompactEvalSuite(options: {
  cases: TireSpecCompactEvalCase[];
  llmFetcher?: CompactEvalLlmFetcher | null;
  fixtureRawByCaseId?: Record<string, Record<string, unknown>>;
}): Promise<TireSpecCompactEvalRunSummary> {
  const { cases, llmFetcher, fixtureRawByCaseId } = options;
  let liveEvalBlocked = !llmFetcher;
  let liveEvalBlockedReason = llmFetcher ? undefined : 'MISTRAL_API_KEY not configured';
  let liveMistralCalls = 0;
  let mistralModel: string | undefined;
  const results: TireSpecCompactEvalCaseResult[] = [];

  for (const evalCase of cases) {
    let raw: Record<string, unknown> | null = null;
    let source: TireSpecCompactEvalCaseResult['rawParseSource'] = 'skipped';

    if (llmFetcher) {
      try {
        const res = await llmFetcher(evalCase);
        raw = res.data;
        mistralModel = res.model;
        liveMistralCalls++;
        source = 'live_mistral';
      } catch {
        liveEvalBlocked = true;
        liveEvalBlockedReason = 'Mistral call failed — no retry per policy';
        source = 'skipped';
      }
    } else if (fixtureRawByCaseId?.[evalCase.id]) {
      raw = fixtureRawByCaseId[evalCase.id];
      source = 'injected_fixture';
    }

    results.push(runCompactEvalCase(evalCase, raw, source));
  }

  return {
    harnessVersion: 'p2a_v1',
    liveEvalBlocked,
    liveEvalBlockedReason,
    mistralModel,
    liveMistralCalls,
    caseCount: cases.length,
    results,
    aggregate: aggregateEvalResults(results),
  };
}
