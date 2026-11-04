import { isValidFsdGraphqlFieldName } from './fsd-graphql-field.util.v1';

export type FsdSignalShapeV1 = 'FLOAT' | 'STRING' | 'LOCATION' | 'UNKNOWN';

export type FsdSchemaAuthorityV1 = 'KNOWN_REGISTRY' | 'UNKNOWN';

export type FsdClassifiedSignalV1 = {
  fieldName: string;
  shape: FsdSignalShapeV1;
  schemaAuthority: FsdSchemaAuthorityV1;
  historicalAggregationSupported: boolean;
  latestSelectionSupported: boolean;
};

const LOCATION_FIELDS = new Set([
  'currentLocationCoordinates',
  'currentLocationApproximateCoordinates',
]);

const STRING_FIELDS = new Set(['obdDTCList', 'obdFuelTypeName', 'vin']);

/** Latest-only strings in DIMO schema — no historical aggregation. */
const LATEST_ONLY_STRING_FIELDS = new Set(['obdDTCList', 'obdFuelTypeName']);

/** Verified float fields (includes boolean-like values exposed as SignalFloat). */
const KNOWN_FLOAT_FIELDS = new Set([
  'speed',
  'angularVelocityYaw',
  'chassisAxleRow1WheelLeftSpeed',
  'chassisAxleRow1WheelRightSpeed',
  'chassisAxleRow2WheelLeftSpeed',
  'chassisAxleRow2WheelRightSpeed',
  'chassisBrakeCircuit1PressurePrimary',
  'chassisBrakeCircuit2PressurePrimary',
  'chassisBrakeIsPedalPressed',
  'chassisBrakePedalPosition',
  'obdThrottlePosition',
  'powertrainCombustionEngineTPS',
  'powertrainCombustionEngineSpeed',
  'obdEngineLoad',
  'powertrainCombustionEngineTorque',
  'powertrainCombustionEngineTorquePercent',
  'powertrainCombustionEngineMAF',
  'powertrainTransmissionCurrentGear',
  'powertrainTransmissionActualGear',
  'powertrainTransmissionSelectedGear',
  'powertrainTransmissionGearRatio',
  'powertrainTransmissionTemperature',
  'powertrainTractionBatteryCurrentPower',
  'powertrainTractionBatteryStateOfChargeCurrent',
  'chassisAxleRow1WheelLeftTirePressure',
  'chassisAxleRow1WheelRightTirePressure',
  'chassisAxleRow2WheelLeftTirePressure',
  'chassisAxleRow2WheelRightTirePressure',
  'exteriorAirTemperature',
  'currentLocationHeading',
  'currentLocationAltitude',
  'isIgnitionOn',
  'obdRunTime',
  'cabinDoorRow1DriverSideIsOpen',
  'cabinDoorRow1DriverSideWindowIsOpen',
  'cabinDoorRow1PassengerSideIsOpen',
  'cabinDoorRow1PassengerSideWindowIsOpen',
  'cabinDoorRow2DriverSideIsOpen',
  'cabinDoorRow2DriverSideWindowIsOpen',
  'cabinDoorRow2PassengerSideIsOpen',
  'cabinDoorRow2PassengerSideWindowIsOpen',
  'powertrainRange',
  'powertrainTractionBatteryChargingAddedEnergy',
  'powertrainTractionBatteryChargingChargeCurrentAC',
  'powertrainTractionBatteryChargingChargeLimit',
  'powertrainTractionBatteryChargingChargeVoltageUnknownType',
  'powertrainTractionBatteryChargingIsCharging',
  'powertrainTractionBatteryChargingIsChargingCableConnected',
  'powertrainTractionBatteryStateOfChargeCurrentEnergy',
  'powertrainTransmissionTravelledDistance',
]);

const SYNTHETIC_TEST_FLOAT_FIELD = /^fsdSyntheticFloat\d+$/;

export function classifyFsdSignalShape(fieldName: string): FsdClassifiedSignalV1 | null {
  if (!isValidFsdGraphqlFieldName(fieldName)) {
    return null;
  }

  if (SYNTHETIC_TEST_FLOAT_FIELD.test(fieldName)) {
    return {
      fieldName,
      shape: 'FLOAT',
      schemaAuthority: 'KNOWN_REGISTRY',
      historicalAggregationSupported: true,
      latestSelectionSupported: true,
    };
  }

  if (LOCATION_FIELDS.has(fieldName)) {
    return {
      fieldName,
      shape: 'LOCATION',
      schemaAuthority: 'KNOWN_REGISTRY',
      historicalAggregationSupported: true,
      latestSelectionSupported: true,
    };
  }

  if (STRING_FIELDS.has(fieldName)) {
    const latestOnly = LATEST_ONLY_STRING_FIELDS.has(fieldName);
    return {
      fieldName,
      shape: 'STRING',
      schemaAuthority: 'KNOWN_REGISTRY',
      historicalAggregationSupported: !latestOnly,
      latestSelectionSupported: true,
    };
  }

  if (KNOWN_FLOAT_FIELDS.has(fieldName)) {
    return {
      fieldName,
      shape: 'FLOAT',
      schemaAuthority: 'KNOWN_REGISTRY',
      historicalAggregationSupported: true,
      latestSelectionSupported: true,
    };
  }

  return {
    fieldName,
    shape: 'UNKNOWN',
    schemaAuthority: 'UNKNOWN',
    historicalAggregationSupported: false,
    latestSelectionSupported: true,
  };
}

export function classifyDeclaredFsdSignals(
  declaredFieldNames: readonly string[],
): FsdClassifiedSignalV1[] {
  const out: FsdClassifiedSignalV1[] = [];
  for (const name of declaredFieldNames) {
    const classified = classifyFsdSignalShape(name);
    if (classified) {
      out.push(classified);
    }
  }
  return out.sort((a, b) => a.fieldName.localeCompare(b.fieldName));
}
