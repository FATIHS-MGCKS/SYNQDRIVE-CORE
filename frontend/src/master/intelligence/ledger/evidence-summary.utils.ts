import type { MasterVsiSignalDetailDto } from '../vsi-master-intelligence-api.types';
import type { EvidenceSummaryItem } from './evidence-dimension.types';

const ENGINE_RPM_KEY = 'engine_rpm';

export function buildEvidenceSummaryFromSignal(signal: MasterVsiSignalDetailDto): EvidenceSummaryItem[] {
  const items: EvidenceSummaryItem[] = [
    {
      kind: 'applicability',
      value: signal.powertrainApplicability ?? null,
    },
    {
      kind: 'declared',
      value: signal.declaredSupport?.trim() ? signal.declaredSupport : null,
    },
    {
      kind: 'observation',
      value: signal.empiricalObservation?.trim() ? signal.empiricalObservation : null,
    },
    {
      kind: 'freshness',
      value: signal.freshnessClassification,
    },
    {
      kind: 'quality',
      value: signal.qualityClassification,
    },
    {
      kind: 'confidence',
      value: signal.confidenceLevel,
    },
  ];

  if (
    signal.canonicalSignalKey === ENGINE_RPM_KEY ||
    signal.rpmCombinedEvidenceAvailabilityV1 != null
  ) {
    items.push({
      kind: 'combinedRpm',
      value: signal.rpmCombinedEvidenceAvailabilityV1 ?? null,
      attributionLimited: (signal.rpmCombinedEvidenceLimitationsV1?.length ?? 0) > 0,
    });
  }

  return items;
}
