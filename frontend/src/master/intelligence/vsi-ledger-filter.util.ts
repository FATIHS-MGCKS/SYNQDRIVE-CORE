import { ENGINE_RPM_CANONICAL_KEY, parseEngineRpmCadenceEvidence } from './vsi-engine-rpm-dual-provenance.utils';
import type { MasterVsiSignalDetailDto } from './vsi-master-intelligence-api.types';
import { resolveApplicabilityValue } from './vsi-ledger-url.util';
import type { VsiLedgerFilterState } from './vsi-ledger-url.types';

function cadenceLimitationCount(signal: MasterVsiSignalDetailDto): number {
  const cadence = signal.cadenceIntelligence;
  if (!cadence || typeof cadence !== 'object') return 0;
  const lim = (cadence as Record<string, unknown>).limitations;
  return Array.isArray(lim) ? lim.filter((x) => typeof x === 'string').length : 0;
}

export function countSignalLimitations(signal: MasterVsiSignalDetailDto): number {
  return signal.limitations.length + cadenceLimitationCount(signal);
}

export function hasAttributableHfEvidence(signal: MasterVsiSignalDetailDto): boolean {
  if (signal.canonicalSignalKey !== ENGINE_RPM_CANONICAL_KEY) return false;
  const cadence = parseEngineRpmCadenceEvidence(signal);
  if (!cadence.hasHfEvidence) return false;
  if (
    signal.rpmCombinedEvidenceLimitationsV1?.includes('RPM_HF_SOURCE_LINK_ATTRIBUTION_UNPROVEN')
  ) {
    return false;
  }
  return true;
}

export function signalMatchesLedgerFilters(
  signal: MasterVsiSignalDetailDto,
  filters: VsiLedgerFilterState,
): boolean {
  if (filters.hideNA) {
    const appl = resolveApplicabilityValue(signal);
    if (appl === 'NOT_APPLICABLE' || signal.empiricalObservation === 'NOT_APPLICABLE') {
      return false;
    }
  }

  if (filters.q) {
    const q = filters.q.toLowerCase();
    const hay = `${signal.canonicalSignalKey} ${signal.providerNativeSignalName}`.toLowerCase();
    if (!hay.includes(q)) return false;
  }

  if (filters.appl.length) {
    const appl = resolveApplicabilityValue(signal);
    if (!filters.appl.includes(appl)) return false;
  }

  if (filters.obs.length && !filters.obs.includes(signal.empiricalObservation)) {
    return false;
  }

  if (filters.fresh.length) {
    const fresh = signal.freshnessClassification ?? 'UNKNOWN';
    if (!filters.fresh.includes(fresh)) return false;
  }

  if (filters.rpm.length) {
    if (signal.canonicalSignalKey !== ENGINE_RPM_CANONICAL_KEY) return false;
    const combined = signal.rpmCombinedEvidenceAvailabilityV1 ?? 'NOT_PROVEN';
    if (!filters.rpm.includes(combined)) return false;
  }

  if (filters.lim && countSignalLimitations(signal) === 0) return false;

  if (filters.hf && !hasAttributableHfEvidence(signal)) return false;

  return true;
}

export function filterSignalsForLedger(
  signals: MasterVsiSignalDetailDto[],
  filters: VsiLedgerFilterState,
): MasterVsiSignalDetailDto[] {
  return signals.filter((s) => signalMatchesLedgerFilters(s, filters));
}
