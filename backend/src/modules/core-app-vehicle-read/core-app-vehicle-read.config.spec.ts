import {
  isCoreAppVehicleReadV1Enabled,
  isCoreAppVehicleReadV1ModuleRegistered,
} from './core-app-vehicle-read.config';

describe('core-app-vehicle-read.config', () => {
  it('defaults vehicle read flag off', () => {
    expect(isCoreAppVehicleReadV1Enabled({})).toBe(false);
    expect(isCoreAppVehicleReadV1Enabled({ CORE_APP_VEHICLE_READ_V1_ENABLED: 'false' })).toBe(false);
  });

  it('requires both M2M and vehicle read flags for module registration', () => {
    expect(
      isCoreAppVehicleReadV1ModuleRegistered({
        CORE_APP_VEHICLE_READ_V1_ENABLED: 'true',
        CORE_APP_M2M_ENABLED: 'false',
      }),
    ).toBe(false);
    expect(
      isCoreAppVehicleReadV1ModuleRegistered({
        CORE_APP_VEHICLE_READ_V1_ENABLED: 'false',
        CORE_APP_M2M_ENABLED: 'true',
      }),
    ).toBe(false);
    expect(
      isCoreAppVehicleReadV1ModuleRegistered({
        CORE_APP_VEHICLE_READ_V1_ENABLED: 'true',
        CORE_APP_M2M_ENABLED: 'true',
      }),
    ).toBe(true);
  });
});