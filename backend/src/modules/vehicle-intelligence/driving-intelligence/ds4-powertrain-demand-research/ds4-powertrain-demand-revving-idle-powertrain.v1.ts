import type {
  Ds4PowertrainDemandBindingAbstainReason,
  Ds4RevvingIdleResearchInputV1,
} from './ds4-powertrain-demand-research.contract.v1';
import {
  classifySustainedLoadPowertrainV1,
  type Ds4SustainedLoadPowertrainClassV1,
  sustainedLoadRequiresSequenceIceRpmConfirmation,
  validateSustainedLoadPowertrainBindingAllPaths,
  validateSustainedLoadZeroRpmConventionalIceAdmission,
  validateSustainedLoadZeroRpmTripAdmission,
} from './ds4-powertrain-demand-sustained-load-powertrain.v1';

export {
  classifySustainedLoadPowertrainV1,
  sustainedLoadRequiresSequenceIceRpmConfirmation,
  type Ds4SustainedLoadPowertrainClassV1,
};

/** B4 V1: BEV not applicable for either facet; unknown/contradictory fail-closed (P2-B3 parity). */
export function validateRevvingIdlePowertrainBindingAllPaths(
  input: Ds4RevvingIdleResearchInputV1,
  reasonCodes: Ds4PowertrainDemandBindingAbstainReason[],
): Ds4SustainedLoadPowertrainClassV1 {
  return validateSustainedLoadPowertrainBindingAllPaths(input, reasonCodes);
}

export function validateRevvingIdleZeroRpmConventionalIceAdmission(
  input: Ds4RevvingIdleResearchInputV1,
  powertrainClass: Ds4SustainedLoadPowertrainClassV1,
  reasonCodes: Ds4PowertrainDemandBindingAbstainReason[],
): void {
  validateSustainedLoadZeroRpmConventionalIceAdmission(input, powertrainClass, reasonCodes);
}

export function validateRevvingIdleZeroRpmTripAdmission(
  input: Ds4RevvingIdleResearchInputV1,
  reasonCodes: Ds4PowertrainDemandBindingAbstainReason[],
): void {
  validateSustainedLoadZeroRpmTripAdmission(input, reasonCodes);
}
