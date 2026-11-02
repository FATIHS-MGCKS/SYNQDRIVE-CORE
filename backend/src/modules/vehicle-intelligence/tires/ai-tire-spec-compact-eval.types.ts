import type { AiTireSpecAuthoritativeIdentityContext } from './ai-tire-spec-compact-pipeline.util';

/** Independent evidence class for eval references — not LLM output. */
export type TireSpecEvidenceClass =
  | 'CONFIRMED_SIDEWALL'
  | 'VERIFIED_MANUFACTURER'
  | 'VERIFIED_LABEL'
  | 'UNKNOWN';

export type TireSpecReferenceVerificationStatus =
  | 'VERIFIED_PRODUCT_LINE'
  | 'AMBIGUOUS_PRODUCT_LINE'
  | 'UNVERIFIED_IN_AUDIT';

export type TireSpecEvalAccuracyClass =
  | 'CORRECT'
  | 'INCORRECT'
  | 'UNVERIFIABLE'
  | 'NOT_APPLICABLE';

export interface TireSpecCompactEvalReference {
  /** Public product-line season when documented in fixture notes (not LLM). */
  seasonType?: 'summer' | 'winter' | 'all_season' | null;
  seasonEvidence?: TireSpecEvidenceClass;
  seasonVerificationStatus?: TireSpecReferenceVerificationStatus;
  seasonNotes?: string;
  /** Marks only scored when reference explicitly asserts observable sidewall/label fact. */
  runFlat?: boolean | null;
  xl?: boolean | null;
  evOptimized?: boolean | null;
  severeSnowMarked?: boolean | null;
  markEvidence?: TireSpecEvidenceClass;
  markVerificationStatus?: TireSpecReferenceVerificationStatus;
  sourceSummary: string;
}

export interface TireSpecCompactEvalCase {
  id: string;
  category: string;
  authoritativeIdentity: Required<
    Pick<
      AiTireSpecAuthoritativeIdentityContext,
      'brand' | 'model' | 'tireSize' | 'loadIndex' | 'speedIndex'
    >
  >;
  /** Authoritative for V3 — must not be overwritten by LLM season. */
  setupTireSeason: 'SUMMER' | 'WINTER' | 'ALL_SEASON' | 'OTHER';
  reference: TireSpecCompactEvalReference;
}

export interface TireSpecCompactEvalFieldVerdict {
  field: string;
  accuracy: TireSpecEvalAccuracyClass;
  expected: unknown;
  actual: unknown;
  note?: string;
}

export interface TireSpecSeasonConsistencyReport {
  llmSeasonType: string | null;
  setupTireSeason: string;
  referenceSeason: string | null;
  referenceVerification: TireSpecReferenceVerificationStatus | undefined;
  mismatchVsReference: boolean | null;
  mismatchVsSetup: boolean | null;
  classification:
    | 'ALIGNED'
    | 'LLM_MISCLASSIFICATION'
    | 'AMBIGUOUS_REFERENCE'
    | 'SETUP_CONFLICT'
    | 'UNVERIFIABLE';
  notes: string[];
}

export interface TireSpecCompactEvalCaseResult {
  id: string;
  category: string;
  authoritativeIdentity: TireSpecCompactEvalCase['authoritativeIdentity'];
  setupTireSeason: TireSpecCompactEvalCase['setupTireSeason'];
  reference: TireSpecCompactEvalReference;
  rawLlm: Record<string, unknown> | null;
  rawParseSource: 'live_mistral' | 'injected_fixture' | 'skipped';
  normalizedCompact: Record<string, unknown>;
  rejectedFields: string[];
  seasonConsistency: TireSpecSeasonConsistencyReport;
  fieldVerdicts: TireSpecCompactEvalFieldVerdict[];
  identityAccuracy: TireSpecEvalAccuracyClass;
  seasonAccuracy: TireSpecEvalAccuracyClass;
  markingAccuracy: TireSpecEvalAccuracyClass;
}

export interface TireSpecCompactEvalRunSummary {
  harnessVersion: 'p2a_v1';
  liveEvalBlocked: boolean;
  liveEvalBlockedReason?: string;
  mistralModel?: string;
  liveMistralCalls: number;
  caseCount: number;
  results: TireSpecCompactEvalCaseResult[];
  aggregate: {
    identityScored: number;
    identityCorrect: number;
    seasonScored: number;
    seasonCorrect: number;
    markingScored: number;
    markingCorrect: number;
  };
}
