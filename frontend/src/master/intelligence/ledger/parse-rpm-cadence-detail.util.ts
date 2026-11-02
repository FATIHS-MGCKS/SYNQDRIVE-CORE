import type { MasterVsiSignalDetailDto } from '../vsi-master-intelligence-api.types';

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function asFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export type VsiRpmCadenceRegimeView = {
  kind: string;
  sampleCount: number | null;
  confidence: string | null;
};

export type VsiRpmCadenceDetailView = {
  contractVersion: string | null;
  observedDensityLabel: string | null;
  regimes: VsiRpmCadenceRegimeView[];
  tierResolution: {
    tier: string | null;
    decisionCode: string | null;
    provenance: string[];
  } | null;
  cadenceLimitations: string[];
};

export function parseRpmCadenceDetail(
  signal: MasterVsiSignalDetailDto,
): VsiRpmCadenceDetailView | null {
  const cadence = asRecord(signal.cadenceIntelligence);
  if (!cadence) return null;

  const regimes: VsiRpmCadenceRegimeView[] = [];
  if (Array.isArray(cadence.regimes)) {
    for (const item of cadence.regimes) {
      const row = asRecord(item);
      if (!row) continue;
      const kind = asString(row.kind);
      if (!kind) continue;
      regimes.push({
        kind,
        sampleCount: asFiniteNumber(row.sampleCount),
        confidence: asString(row.confidence),
      });
    }
  }

  const tierRaw = asRecord(cadence.tierResolution);
  const tierResolution = tierRaw
    ? {
        tier: asString(tierRaw.tier),
        decisionCode: asString(tierRaw.decisionCode),
        provenance: Array.isArray(tierRaw.provenance)
          ? tierRaw.provenance.filter((p): p is string => typeof p === 'string')
          : [],
      }
    : null;

  const limitationsRaw = cadence.limitations;
  const cadenceLimitations = Array.isArray(limitationsRaw)
    ? limitationsRaw.filter((c): c is string => typeof c === 'string')
    : [];

  return {
    contractVersion: asString(cadence.contractVersion),
    observedDensityLabel: asString(cadence.observedDensityLabel),
    regimes,
    tierResolution,
    cadenceLimitations,
  };
}
