/** P2C Group A — mixed query that failed with HTTP 422 in pilot. */
export const FSD_P2C_GROUP_A_FIELDS_V1 = [
  'speed',
  'chassisAxleRow1WheelLeftTirePressure',
  'chassisAxleRow1WheelRightTirePressure',
  'chassisAxleRow2WheelLeftTirePressure',
  'chassisAxleRow2WheelRightTirePressure',
  'currentLocationCoordinates',
  'exteriorAirTemperature',
  'powertrainTractionBatteryCurrentPower',
  'powertrainTractionBatteryStateOfChargeCurrent',
] as const;

/** Tesla pilot full declared set (26 signals). */
export const FSD_TESLA_P2E_DECLARED_FIELDS_V1 = [
  ...FSD_P2C_GROUP_A_FIELDS_V1,
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
] as const;

export const FSD_P2E_HISTORICAL_WINDOW_V1 = {
  fromUtc: '2026-11-04T04:32:00.000Z',
  toUtc: '2026-11-04T04:57:37.477Z',
} as const;

export const FSD_P2E_AGGREGATE_EXPECTATIONS_V1 = {
  windowSeconds: 1537.477,
  expectedBucketPositions: 1538,
  speedValidBuckets: 64,
  speedMovingBuckets: 57,
  speedStationaryBuckets: 7,
  speedUnknownMotionPositions: 1474,
  gpsValidBuckets: 1133,
  historicalAcceptedSignals: 26,
  historicalSignalsWithValues: 25,
  historicalNullOnlySignals: 1,
  nullOnlySignal: 'powertrainRange',
} as const;
