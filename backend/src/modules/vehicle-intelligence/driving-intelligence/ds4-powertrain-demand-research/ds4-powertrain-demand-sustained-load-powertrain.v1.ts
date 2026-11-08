import type {
  Ds4PowertrainDemandBindingAbstainReason,
  Ds4SustainedLoadResearchInputV1,
} from './ds4-powertrain-demand-research.contract.v1';

export type Ds4SustainedLoadPowertrainClassV1 =
  | 'CONVENTIONAL_ICE'
  | 'PHEV'
  | 'HYBRID_HEV'
  | 'BEV'
  | 'UNKNOWN';

const CONVENTIONAL_ICE_FUEL_TYPES = new Set([
  'GASOLINE',
  'DIESEL',
  'PETROL',
  'GAS',
  'LPG',
  'CNG',
  'BENZIN',
]);

const PHEV_FUEL_TYPES = new Set(['PHEV', 'PLUGIN_HYBRID', 'PLUGINHYBRID', 'PLUG_IN_HYBRID']);

const HYBRID_HEV_FUEL_TYPES = new Set(['HYBRID', 'HEV', 'MILD_HYBRID', 'FULL_HYBRID']);

const BEV_FUEL_TYPES = new Set(['BEV', 'ELECTRIC', 'EV', 'BATTERY_ELECTRIC']);

function normalizeFuelTypeToken(fuelType: string | null): string | null {
  if (fuelType == null) return null;
  const trimmed = fuelType.trim();
  if (trimmed.length === 0) return null;
  return trimmed.toUpperCase().replace(/[\s-]+/g, '_');
}

export function classifySustainedLoadPowertrainV1(
  fuelType: string | null,
  isEvPowertrain: boolean,
): { powertrainClass: Ds4SustainedLoadPowertrainClassV1; contradictoryEvIceClaim: boolean } {
  const token = normalizeFuelTypeToken(fuelType);
  const contradictoryEvIceClaim =
    isEvPowertrain && token != null && CONVENTIONAL_ICE_FUEL_TYPES.has(token);

  if (contradictoryEvIceClaim) {
    return { powertrainClass: 'UNKNOWN', contradictoryEvIceClaim: true };
  }

  if (isEvPowertrain || (token != null && BEV_FUEL_TYPES.has(token))) {
    return { powertrainClass: 'BEV', contradictoryEvIceClaim: false };
  }

  if (token == null) {
    return { powertrainClass: 'UNKNOWN', contradictoryEvIceClaim: false };
  }

  if (PHEV_FUEL_TYPES.has(token)) {
    return { powertrainClass: 'PHEV', contradictoryEvIceClaim: false };
  }
  if (HYBRID_HEV_FUEL_TYPES.has(token)) {
    return { powertrainClass: 'HYBRID_HEV', contradictoryEvIceClaim: false };
  }
  if (CONVENTIONAL_ICE_FUEL_TYPES.has(token)) {
    return { powertrainClass: 'CONVENTIONAL_ICE', contradictoryEvIceClaim: false };
  }

  return { powertrainClass: 'UNKNOWN', contradictoryEvIceClaim: false };
}

export function sustainedLoadRequiresSequenceIceRpmConfirmation(
  powertrainClass: Ds4SustainedLoadPowertrainClassV1,
): boolean {
  return powertrainClass === 'PHEV' || powertrainClass === 'HYBRID_HEV';
}

/** RPM-present and zero-RPM binding — BEV and unknown fuel fail closed at bind time. */
export function validateSustainedLoadPowertrainBindingAllPaths(
  input: Ds4SustainedLoadResearchInputV1,
  reasonCodes: Ds4PowertrainDemandBindingAbstainReason[],
): Ds4SustainedLoadPowertrainClassV1 {
  const { powertrainClass, contradictoryEvIceClaim } = classifySustainedLoadPowertrainV1(
    input.fuelType,
    input.isEvPowertrain,
  );

  if (contradictoryEvIceClaim || powertrainClass === 'BEV') {
    reasonCodes.push('POWERTRAIN_NOT_APPLICABLE');
  } else if (powertrainClass === 'UNKNOWN') {
    reasonCodes.push('ICE_OPERATION_NOT_CONFIRMED');
  }

  return powertrainClass;
}

/** Zero-RPM conventional ICE only — after shared all-paths classification. */
export function validateSustainedLoadZeroRpmConventionalIceAdmission(
  input: Ds4SustainedLoadResearchInputV1,
  powertrainClass: Ds4SustainedLoadPowertrainClassV1,
  reasonCodes: Ds4PowertrainDemandBindingAbstainReason[],
): void {
  if (powertrainClass !== 'CONVENTIONAL_ICE') {
    if (powertrainClass === 'PHEV' || powertrainClass === 'HYBRID_HEV') {
      reasonCodes.push('ICE_OPERATION_NOT_CONFIRMED');
    }
    return;
  }

  if (input.evidenceOrigin !== 'SYNTHETIC_FIXTURE') {
    reasonCodes.push('REFERENCE_TRUST_REQUIRES_SYNTHETIC_FIXTURE');
  }
}

export function validateSustainedLoadZeroRpmTripAdmission(
  input: Ds4SustainedLoadResearchInputV1,
  reasonCodes: Ds4PowertrainDemandBindingAbstainReason[],
): void {
  const { tripInput } = input;
  if (!tripInput.admission.processingAllowed) {
    reasonCodes.push('TRIP_ADMISSION_NOT_ALLOWED');
  }
  if (tripInput.admission.iceRpmApplicability !== 'APPLICABLE') {
    reasonCodes.push('ICE_APPLICABILITY_NOT_ADMITTED');
  }
}
