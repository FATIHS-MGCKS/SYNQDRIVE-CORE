/**
 * Read-only historical aiTireSpec parser comparison (stdin JSONL).
 * Each line: {"aiTireSpec":<object>}
 * No writes; aggregates only — safe for production piping.
 *
 * Usage (production read-only):
 *   psql ... -t -A -c "SELECT json_build_object('aiTireSpec', ai_tire_spec)::text FROM vehicle_tire_setups WHERE ai_tire_spec IS NOT NULL;" \
 *     | npx tsx backend/scripts/ops/tire-ai-spec-historical-parser-audit.ts
 */
import { parseValidatedAiTireSpecFromStorage } from '../../src/modules/vehicle-intelligence/tires/ai-tire-spec-read.util';

const METADATA_KEYS = new Set([
  'userConfirmedSpec',
  'specSourceType',
  'fetchedAt',
  'jobId',
  'normalizedAt',
  'tireSpecConfidence',
  'schemaVersion',
]);

function legacyStr(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length > 0 ? s : null;
}

function legacyNum(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}

function legacyBool(v: unknown): boolean | null {
  if (v === true || v === 'true' || v === 1) return true;
  if (v === false || v === 'false' || v === 0) return false;
  return null;
}

/** Pre-PR permissive read shape (main branch parseAiTireSpec). */
function parseLegacyPermissive(raw: unknown): Record<string, unknown> | null {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  const hasContent = Object.entries(obj).some(
    ([k, v]) => v != null && !METADATA_KEYS.has(k),
  );
  if (!hasContent) return null;
  return {
    matchedBrand: legacyStr(obj.matchedBrand),
    matchedModel: legacyStr(obj.matchedModel),
    newTreadDepthMm: legacyNum(obj.newTreadDepthMm),
    widthMm: legacyNum(obj.widthMm),
    aspectRatio: legacyNum(obj.aspectRatio),
    rimDiameterInch: legacyNum(obj.rimDiameterInch),
    loadIndex: legacyStr(obj.loadIndex),
    speedIndex: legacyStr(obj.speedIndex),
    seasonType: legacyStr(obj.seasonType),
    tireArchetype: legacyStr(obj.tireArchetype),
    confidenceScore: legacyNum(obj.confidenceScore),
    maxInflationKpa: legacyNum(obj.maxInflationKpa),
    manufacturerSourceUrl: legacyStr(obj.manufacturerSourceUrl),
    labelSourceUrl: legacyStr(obj.labelSourceUrl),
    legalMinimumMm: legacyNum(obj.legalMinimumMm ?? obj.legalMinTreadDepthMm),
  };
}

const TRACKED_KEYS = [
  'matchedBrand',
  'newTreadDepthMm',
  'widthMm',
  'aspectRatio',
  'rimDiameterInch',
  'loadIndex',
  'speedIndex',
  'seasonType',
  'tireArchetype',
  'confidenceScore',
  'maxInflationKpa',
  'manufacturerSourceUrl',
  'labelSourceUrl',
  'legalMinimumMm',
] as const;

async function main() {
  const chunks: Buffer[] = [];
  for await (const c of process.stdin) chunks.push(c as Buffer);
  const text = Buffer.concat(chunks).toString('utf8').trim();
  const lines = text ? text.split('\n').filter(Boolean) : [];

  let examined = 0;
  let legacyNull = 0;
  let newNull = 0;
  let recordsChanged = 0;
  const fieldNullified: Record<string, number> = {};
  const fieldChanged: Record<string, number> = {};

  for (const line of lines) {
    let parsed: { aiTireSpec?: unknown };
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }
    const raw = parsed.aiTireSpec;
    if (raw == null) continue;
    examined += 1;

    const legacy = parseLegacyPermissive(raw);
    const modern = parseValidatedAiTireSpecFromStorage(raw);
    if (!legacy) legacyNull += 1;
    if (!modern) newNull += 1;
    if (!legacy || !modern) continue;

    let rowChanged = false;
    for (const key of TRACKED_KEYS) {
      const l = legacy[key];
      const n = (modern as Record<string, unknown>)[key];
      if (l !== n && !(l == null && n == null)) {
        rowChanged = true;
        fieldChanged[key] = (fieldChanged[key] ?? 0) + 1;
        if (l != null && n == null) {
          fieldNullified[key] = (fieldNullified[key] ?? 0) + 1;
        }
      }
    }
    if (rowChanged) recordsChanged += 1;
  }

  const summary = {
    examined,
    legacyNull,
    newNull,
    recordsChanged,
    fieldNullified,
    fieldChanged,
    productionSource: 'stdin',
  };
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
