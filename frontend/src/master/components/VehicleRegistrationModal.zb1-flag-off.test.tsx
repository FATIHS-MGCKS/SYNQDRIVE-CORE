// @vitest-environment happy-dom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { LanguageProvider } from '../../i18n/LanguageContext';
import { VehicleRegistrationModal } from './VehicleRegistrationModal';
import type { RegisteredVehicle } from '../data/platform-data';
import { testMasterOrganization } from './vehicle-registration-modal.test-fixtures';

vi.mock('./ExteriorImagesEditor', () => ({
  ExteriorImagesEditor: () => createElement('div', { 'data-testid': 'exterior-images-stub' }),
  flushBufferedExteriorImages: vi.fn(),
}));

vi.mock('./VehicleIdentityP2Panel', () => ({
  VehicleIdentityP2Panel: () => createElement('div', { 'data-testid': 'vehicle-identity-p2-panel-stub' }),
}));

vi.mock('./MasterZb1RegistrationDialog', () => ({
  MasterZb1RegistrationDialog: () => null,
}));

vi.mock('../../lib/api', () => ({
  api: {
    highMobility: { checkAvailability: vi.fn().mockResolvedValue({ isLinked: false }), activateHealth: vi.fn() },
    vehicles: {
      motionPhysicsReference: { getActive: vi.fn().mockResolvedValue(null), create: vi.fn(), confirm: vi.fn() },
    },
  },
  streamAiSpecs: vi.fn(() => ({ abort: vi.fn() })),
  streamAiTireSpecs: vi.fn(),
}));

vi.mock('../connected-vehicles/vehicle-identity-p2.util', () => ({
  isVehicleIdentityP2Enabled: () => false,
  isVehicleIdentityP3Enabled: () => false,
  provenanceBadgeClass: () => '',
  provenanceLabelKey: () => 'master.vehicleIdentity.provenance.manual',
}));

function minimalExistingVehicle(): RegisteredVehicle {
  return {
    id: 'veh-zb1',
    vehicleName: 'VW Golf',
    vin: 'WVWZZZ3CZWE123456',
    make: 'VW',
    model: 'Golf',
    year: 2020,
    organizationId: 'org-1',
    organizationName: 'Org',
    station: '',
    status: 'Available',
    health: 'Good',
    lastSignal: '',
    online: false,
    fuelType: 'Diesel',
    mileage: 5000,
    licensePlate: 'B-XX 1',
    vehicleType: 'HATCHBACK',
    operationalStatus: 'Active',
    notes: '',
    batteryType: '',
    batteryAmpere: '',
    batteryVolt: '',
    hvBatteryCapacityKwh: '',
    tireFrontDimension: '',
    tireFrontBrandModel: '',
    tireFrontSeason: 'All Season',
    tireFrontDot: '',
    tireFrontLoadIndex: '',
    tireFrontSpeedIndex: '',
    tireBackDimension: '',
    tireBackBrandModel: '',
    tireBackSeason: 'All Season',
    tireBackDot: '',
    tireBackLoadIndex: '',
    tireBackSpeedIndex: '',
    treadDepthFL: '',
    treadDepthFR: '',
    treadDepthBL: '',
    treadDepthBR: '',
    brakeFrontRotorDiameter: '',
    brakeFrontRotorWidth: '',
    brakeFrontPadThickness: '',
    brakeBackRotorDiameter: '',
    brakeBackRotorWidth: '',
    brakeBackPadThickness: '',
    idleRpm: '',
    maxRpm: '',
    drivetrain: '',
    brakeForceDistribution: '',
    frontToRearWeightDistribution: '',
    curbWeight: '',
    systemMotorPowerKw: '',
    serviceIntervals: '',
    serviceIntervalManufacturerKm: '',
    serviceIntervalManufacturerMonths: '',
    oilChangeIntervalKm: '',
    oilChangeIntervalMonths: '',
    lastTuev: '',
    lastBokraft: '',
    lastInspection: '',
    lastOilChange: '',
    lastBrakePadChange: '',
    lastBrakeRotorChange: '',
    hardwareType: 'UNKNOWN',
  };
}

describe('VehicleRegistrationModal ZB1 flag OFF toolbar', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('shows a disabled upload control with hint when P2 frontend flag is off', async () => {
    await act(async () => {
      root.render(
        createElement(LanguageProvider, {
          children: createElement(VehicleRegistrationModal, {
            isDarkMode: false,
            isOpen: true,
            onClose: vi.fn(),
            organizations: [testMasterOrganization()],
            existingVehicle: minimalExistingVehicle(),
            initialOrganizationId: 'org-1',
            onRegister: vi.fn(),
            onUpdate: vi.fn(),
          }),
        }),
      );
    });

    const disabled = document.querySelector('[data-testid="vehicle-registration-upload-zb1-disabled"]');
    expect(disabled).toBeTruthy();
    expect((disabled as HTMLButtonElement).disabled).toBe(true);
    expect(document.querySelector('[data-testid="vehicle-registration-upload-zb1"]')).toBeNull();
    expect(document.querySelector('[data-testid="vehicle-registration-fetch-ai-specs"]')).toBeTruthy();
  });
});
