import type { Ds4RpmShadowCorrelationIceRpmEventApplicability } from './ds4-rpm-shadow-correlation-v1.contract';
import type { Ds4RpmShadowCorrelationInputV1 } from './ds4-rpm-shadow-correlation-v1.contract';

export function resolveIceRpmEventApplicability(
  input: Ds4RpmShadowCorrelationInputV1,
): Ds4RpmShadowCorrelationIceRpmEventApplicability {
  const ice = input.v1b?.summary.admission.iceRpmApplicability;
  if (ice === 'NOT_APPLICABLE') return 'NOT_APPLICABLE';
  if (ice === 'APPLICABLE') return 'APPLICABLE';
  return 'UNKNOWN';
}

export function isIceRpmEventContextBlocked(
  applicability: Ds4RpmShadowCorrelationIceRpmEventApplicability,
): boolean {
  return applicability === 'NOT_APPLICABLE';
}
