import {
  FSD_TESLA_P2E_DECLARED_FIELDS_V1,
} from '@modules/vehicle-intelligence/full-signal-discovery/__fixtures__/fsd-p2e-tesla.fixture.v1';
import type { FsdP6cFleetVehicleLabelV1 } from './fsd-p6c-fleet-manifest.v1';

/** VAG ICE-oriented offline planning subset — production manifests must use live catalog-derived lists. */
export const FSD_P6C_VAG_ICE_OFFLINE_DECLARED_FIELDS_V1 = [
  'speed',
  'chassisAxleRow1WheelLeftTirePressure',
  'chassisAxleRow1WheelRightTirePressure',
  'chassisAxleRow2WheelLeftTirePressure',
  'chassisAxleRow2WheelRightTirePressure',
  'currentLocationCoordinates',
  'exteriorAirTemperature',
  'cabinDoorRow1DriverSideIsOpen',
  'cabinDoorRow1DriverSideWindowIsOpen',
  'cabinDoorRow1PassengerSideIsOpen',
  'cabinDoorRow1PassengerSideWindowIsOpen',
  'powertrainTransmissionTravelledDistance',
] as const;

/**
 * Offline mock declared fields per fleet label when manifest omits production-specific lists.
 * Live production runs must always supply `declaredFieldNames` from verified catalog evidence.
 */
export function resolveFsdP6cOfflineDeclaredFieldNamesV1(
  label: FsdP6cFleetVehicleLabelV1,
): readonly string[] {
  if (label === 'tesla_model_3') {
    return FSD_TESLA_P2E_DECLARED_FIELDS_V1;
  }
  return FSD_P6C_VAG_ICE_OFFLINE_DECLARED_FIELDS_V1;
}
