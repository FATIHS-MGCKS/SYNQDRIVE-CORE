/**
 * Read-only tire_v3_compact Mistral evaluation harness.
 * No DB, jobs, apply, or production HTTP — stdout JSON only.
 *
 * Usage:
 *   cd backend && npx tsx scripts/ops/tire-v3-compact-mistral-eval.readonly.ts
 *   cd backend && npx tsx scripts/ops/tire-v3-compact-mistral-eval.readonly.ts --fixture=p2-simulated
 *
 * Requires MISTRAL_API_KEY for live calls (optional). Never logs secrets.
 */
import { Mistral } from '@mistralai/mistralai';
import {
  buildTireSpecJsonSchema,
  buildTireSpecPrompt,
  parseTireSpecJson,
} from '../../src/modules/ai/vehicle-specs/tire-spec-ai.schema.util';
import { TIRE_V3_COMPACT_EVAL_CASES } from '../../src/modules/vehicle-intelligence/tires/ai-tire-spec-compact-eval.fixture';
import {
  runCompactEvalSuite,
  type CompactEvalLlmFetcher,
} from '../../src/modules/vehicle-intelligence/tires/ai-tire-spec-compact-eval.util';
import type { TireSpecCompactEvalCase } from '../../src/modules/vehicle-intelligence/tires/ai-tire-spec-compact-eval.types';

const JSON_MODEL = process.env.MISTRAL_JSON_MODEL?.trim() || 'mistral-small-latest';

function tireSpecPromptContextFromIdentity(
  identity: TireSpecCompactEvalCase['authoritativeIdentity'],
): Parameters<typeof buildTireSpecPrompt>[0] {
  return {
    brand: identity.brand ?? undefined,
    model: identity.model ?? undefined,
    tireSize: identity.tireSize ?? undefined,
    loadIndex: identity.loadIndex ?? undefined,
    speedIndex: identity.speedIndex ?? undefined,
  };
}

/** Align with MistralLlmService.extractMessageContent — text chunks only. */
function extractMessageContent(
  content: string | ReadonlyArray<{ type?: string; text?: string }> | null | undefined,
): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .map((part) => (typeof part?.text === 'string' ? part.text : ''))
    .join('');
}

function extractMistralAssistantContent(
  content: string | ReadonlyArray<unknown> | null | undefined,
): string {
  if (typeof content === 'string' || content == null) {
    return extractMessageContent(content);
  }
  const textParts = content.map((chunk): { text?: string } => {
    if (typeof chunk !== 'object' || chunk === null || !('text' in chunk)) {
      return {};
    }
    const textValue = chunk.text;
    return typeof textValue === 'string' ? { text: textValue } : {};
  });
  return extractMessageContent(textParts);
}

/** P2 audit simulated raw payloads — offline pipeline validation only. */
const P2_SIMULATED_RAW: Record<string, Record<string, unknown>> = {
  S1: {
    matchedBrand: 'Michelin',
    matchedModel: 'Pilot Sport 4',
    seasonType: 'summer',
    newTreadDepthMm: 8.0,
    euWetGripClass: 'A',
    tireArchetype: 'ultra_high_performance',
    runFlat: false,
  },
  S2: {
    matchedBrand: 'Continental',
    matchedModel: 'PremiumContact 6',
    seasonType: 'summer',
    newTreadDepthMm: 7.8,
    utqgTreadwear: 280,
  },
  W1: {
    matchedBrand: 'Continental',
    matchedModel: 'WinterContact TS 870',
    seasonType: 'winter',
    severeSnowMarked: true,
    newTreadDepthMm: 9.0,
  },
  W2: {
    matchedBrand: 'Michelin',
    matchedModel: 'Alpin 6',
    seasonType: 'all_season',
    newTreadDepthMm: 8.5,
  },
  A1: {
    matchedBrand: 'Goodyear',
    matchedModel: 'Vector 4Seasons Gen-3',
    seasonType: 'all_season',
    severeSnowMarked: true,
  },
  A2: {
    matchedBrand: 'Michelin',
    matchedModel: 'CrossClimate 2',
    seasonType: 'summer',
    newTreadDepthMm: 8.0,
  },
  EV1: {
    matchedBrand: 'Michelin',
    matchedModel: 'Pilot Sport EV',
    seasonType: 'summer',
    evOptimized: true,
    tireArchetype: 'ev_optimized',
    newTreadDepthMm: 8.0,
  },
  RF1: {
    matchedBrand: 'Bridgestone',
    matchedModel: 'Turanza T005',
    seasonType: 'summer',
    runFlat: true,
    xl: true,
    reinforced: true,
    tireArchetype: 'run_flat',
    newTreadDepthMm: 7.5,
    euWetGripClass: 'B',
  },
  VAR: {
    matchedBrand: 'Michelin',
    matchedModel: 'Pilot Sport 4S',
    seasonType: 'summer',
    tireSizeRaw: '255/40R18',
    loadIndex: '99',
    speedIndex: 'Y',
  },
};

function buildLiveFetcher(apiKey: string): CompactEvalLlmFetcher {
  const client = new Mistral({ apiKey });
  const schema = buildTireSpecJsonSchema();

  return async (evalCase: TireSpecCompactEvalCase) => {
    const ctx = evalCase.authoritativeIdentity;
    const { system, user } = buildTireSpecPrompt(tireSpecPromptContextFromIdentity(ctx));

    const response = await client.chat.complete({
      model: JSON_MODEL,
      temperature: 0,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      responseFormat: {
        type: 'json_schema',
        jsonSchema: {
          name: 'synqdrive_tire_specs',
          schemaDefinition: schema,
          strict: true,
        },
      },
    });

    const choice = response.choices?.[0];
    const content = extractMistralAssistantContent(choice?.message?.content);

    const parsed = JSON.parse(content) as Record<string, unknown>;
    parseTireSpecJson(parsed);

    return {
      data: parsed,
      model: response.model ?? JSON_MODEL,
      rawContent: content,
    };
  };
}

async function main(): Promise<void> {
  const useFixture = process.argv.includes('--fixture=p2-simulated');
  const apiKey = process.env.MISTRAL_API_KEY?.trim();

  let llmFetcher: CompactEvalLlmFetcher | null = null;
  if (!useFixture && apiKey) {
    llmFetcher = buildLiveFetcher(apiKey);
  }

  const summary = await runCompactEvalSuite({
    cases: TIRE_V3_COMPACT_EVAL_CASES,
    llmFetcher,
    fixtureRawByCaseId: useFixture || !apiKey ? P2_SIMULATED_RAW : undefined,
  });

  if (!apiKey && !useFixture) {
    summary.liveEvalBlocked = true;
    summary.liveEvalBlockedReason = 'LIVE_EVAL_BLOCKED — set MISTRAL_API_KEY or pass --fixture=p2-simulated';
  }

  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

main().catch((err) => {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
