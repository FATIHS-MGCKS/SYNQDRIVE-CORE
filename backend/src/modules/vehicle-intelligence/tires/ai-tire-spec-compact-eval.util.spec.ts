import { TIRE_V3_COMPACT_EVAL_CASES } from './ai-tire-spec-compact-eval.fixture';
import {
  analyzeSeasonConsistency,
  listRejectedCompactFields,
  runCompactEvalCase,
  runCompactEvalSuite,
} from './ai-tire-spec-compact-eval.util';

describe('ai-tire-spec-compact-eval', () => {
  it('lists fields nulled by evidence gate vs raw parse', () => {
    const raw = {
      matchedBrand: 'Michelin',
      matchedModel: 'Pilot Sport 4',
      newTreadDepthMm: 8,
      euWetGripClass: 'A',
      evOptimized: true,
    };
    const result = runCompactEvalCase(
      TIRE_V3_COMPACT_EVAL_CASES[0],
      raw,
      'injected_fixture',
    );
    expect(result.rejectedFields).toContain('newTreadDepthMm');
    expect(result.rejectedFields).toContain('euWetGripClass');
    expect(result.rejectedFields).toContain('evOptimized');
    expect(listRejectedCompactFields(raw, result.normalizedCompact)).toEqual(result.rejectedFields);
  });

  it('forces authoritative identity on variant drift (VAR case)', () => {
    const raw = {
      matchedBrand: 'Michelin',
      matchedModel: 'Pilot Sport 4S',
      tireSizeRaw: '255/40R18',
      loadIndex: '99',
      speedIndex: 'Y',
      seasonType: 'summer',
    };
    const evalCase = TIRE_V3_COMPACT_EVAL_CASES.find((c) => c.id === 'VAR')!;
    const result = runCompactEvalCase(evalCase, raw, 'injected_fixture');
    expect(result.identityAccuracy).toBe('CORRECT');
    expect(result.normalizedCompact.matchedModel).toBe('Pilot Sport 4');
    expect(result.normalizedCompact.tireSizeRaw).toBe('225/45R17');
  });

  it('classifies W2 season mismatch as LLM misclassification', () => {
    const w2 = TIRE_V3_COMPACT_EVAL_CASES.find((c) => c.id === 'W2')!;
    const report = analyzeSeasonConsistency(w2, 'all_season');
    expect(report.classification).toBe('LLM_MISCLASSIFICATION');
    expect(report.mismatchVsSetup).toBe(true);
  });

  it('classifies A2 with ambiguous reference', () => {
    const a2 = TIRE_V3_COMPACT_EVAL_CASES.find((c) => c.id === 'A2')!;
    const report = analyzeSeasonConsistency(a2, 'summer');
    expect(['LLM_MISCLASSIFICATION', 'AMBIGUOUS_REFERENCE']).toContain(report.classification);
  });

  it('runs full fixture suite without live Mistral', async () => {
    const summary = await runCompactEvalSuite({
      cases: TIRE_V3_COMPACT_EVAL_CASES,
      llmFetcher: null,
      fixtureRawByCaseId: {
        W2: { seasonType: 'all_season', matchedBrand: 'Michelin', matchedModel: 'Alpin 6' },
        A2: { seasonType: 'summer', matchedBrand: 'Michelin', matchedModel: 'CrossClimate 2' },
      },
    });
    expect(summary.caseCount).toBe(9);
    expect(summary.liveMistralCalls).toBe(0);
    expect(summary.liveEvalBlocked).toBe(true);
    expect(summary.aggregate.identityScored).toBe(9);
  });
});
