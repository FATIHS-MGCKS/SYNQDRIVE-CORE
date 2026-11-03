// @vitest-environment happy-dom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { LanguageProvider } from '../../i18n/LanguageContext';
import { VehicleRegistrationModal } from './VehicleRegistrationModal';
import type { RegisteredVehicle } from '../data/platform-data';
import { testMasterOrganization } from './vehicle-registration-modal.test-fixtures';

const mockGetCatalog = vi.fn();

vi.mock('./ExteriorImagesEditor', () => ({
  ExteriorImagesEditor: () => createElement('div', { 'data-testid': 'exterior-images-stub' }),
  flushBufferedExteriorImages: vi.fn(),
}));

vi.mock('./VehicleIdentityP2Panel', () => ({
  VehicleIdentityP2Panel: () => createElement('div', { 'data-testid': 'vehicle-identity-p2-panel-stub' }),
}));

vi.mock('../../lib/api', () => ({
  api: {
    highMobility: {
      checkAvailability: vi.fn().mockResolvedValue({ isLinked: false }),
      activateHealth: vi.fn(),
    },
    vehicles: {
      motionPhysicsReference: {
        getActive: vi.fn().mockResolvedValue(null),
        create: vi.fn(),
        confirm: vi.fn(),
      },
    },
  },
  streamAiSpecs: vi.fn(() => ({ abort: vi.fn() })),
  streamAiTireSpecs: vi.fn(),
}));

vi.mock('../connected-vehicles/vehicle-identity-p2.util', () => ({
  isVehicleIdentityP2Enabled: () => true,
  isVehicleIdentityP3Enabled: () => false,
  provenanceBadgeClass: () => '',
  provenanceLabelKey: () => 'master.vehicleIdentity.provenance.manual',
}));

vi.mock('../../components/mfa/MfaStepUpDialog', () => ({
  MfaStepUpDialog: () => null,
}));

vi.mock('../oneauto/oneauto-api.client', () => ({
  oneAutoMasterApi: {
    getCatalog: (...args: unknown[]) => mockGetCatalog(...args),
    quote: vi.fn(),
    execute: vi.fn(),
    getJob: vi.fn(),
    getJobResult: vi.fn(),
  },
}));

function existingVehicle(): RegisteredVehicle {
  return {
    id: 'veh-stack',
    vehicleName: 'Tesla Model 3',
    vin: '5YJ3E1EA1PF123456',
    make: 'Tesla',
    model: 'Model 3',
    year: 2023,
    organizationId: 'org-1',
    organizationName: 'Org',
    station: '',
    status: 'Available',
    health: 'Good',
    lastSignal: '',
    online: false,
    fuelType: 'Electric',
    mileage: 1000,
    licensePlate: 'B-EV 1',
    vehicleType: 'SEDAN',
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

function renderModal() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  return { container, root };
}

describe('VehicleRegistrationModal nested dialog stacking', () => {
  beforeEach(() => {
    mockGetCatalog.mockResolvedValue({
      services: [
        {
          serviceSku: 'OE_VIN_LOOKUP_EU',
          displayName: 'VIN Lookup',
          description: 'desc',
          providerPathTemplate: 'path',
          httpMethod: 'GET',
          executionMode: 'SYNC',
          requiredParameters: ['vin'],
          indicativePriceMinor: 100,
          currency: 'GBP',
          pricingSourceVersion: 'v1',
          availabilityStatus: 'DISABLED_FLAG',
          resultHandling: 'EXTERNAL_STORE_ONLY',
          contractGate: {
            serviceSku: 'OE_VIN_LOOKUP_EU',
            executable: false,
            reason: 'DISABLED_FLAG',
            unverifiedFields: [],
          },
          executable: false,
        },
      ],
      indicativePricingDisclaimer: 'indicative',
    });
  });

  afterEach(() => {
    mockGetCatalog.mockReset();
  });

  it('One Auto dialog stacks above registration shell, loads catalog, closes without closing parent', async () => {
    const { container, root } = renderModal();

    await act(async () => {
      root.render(
        createElement(LanguageProvider, {
          children: createElement(VehicleRegistrationModal, {
            isDarkMode: false,
            isOpen: true,
            onClose: vi.fn(),
            existingVehicle: existingVehicle(),
            organizations: [testMasterOrganization()],
            initialOrganizationId: 'org-1',
            onRegister: vi.fn(),
            onUpdate: vi.fn(),
          }),
        }),
      );
    });

    const scrim = document.querySelector('[data-testid="vehicle-registration-modal-scrim"]');
    expect(scrim?.className.includes('z-[100]')).toBe(true);

    const oneAutoBtn = document.querySelector(
      '[data-testid="vehicle-registration-oneauto-api"]',
    ) as HTMLButtonElement;
    await act(async () => {
      oneAutoBtn.click();
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(mockGetCatalog).toHaveBeenCalledWith('org-1');
    expect(document.querySelector('[data-testid="oneauto-context-binding"]')).toBeTruthy();
    expect(document.querySelector('[data-testid="app-dialog-overlay-elevated"]')).toBeTruthy();

    const panel = document.querySelector('.sq-dialog-panel');
    expect(panel?.className.includes('z-[110]')).toBe(true);
    expect(scrim?.className.includes('z-[100]')).toBe(true);

    const licenseInput = document.querySelector(
      'input[placeholder="e.g. B AB 1234"]',
    ) as HTMLInputElement;
    expect(licenseInput).toBeTruthy();
    expect(licenseInput.disabled).not.toBe(true);

    const closeFooter = document.querySelector('[data-testid="oneauto-dialog-footer-close"]');
    expect(closeFooter).toBeTruthy();
    await act(async () => {
      (closeFooter as HTMLButtonElement).click();
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(document.querySelector('[data-testid="oneauto-context-binding"]')).toBeNull();
    expect(document.querySelector('[data-testid="vehicle-registration-modal-panel"]')).toBeTruthy();

    await act(async () => {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        'value',
      )?.set;
      nativeInputValueSetter?.call(licenseInput, 'B-NEW 99');
      licenseInput.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(licenseInput.value).toBe('B-NEW 99');

    act(() => root.unmount());
    container.remove();
  });

  it('One Auto dialog dismisses on Escape while parent modal stays open', async () => {
    const { container, root } = renderModal();

    await act(async () => {
      root.render(
        createElement(LanguageProvider, {
          children: createElement(VehicleRegistrationModal, {
            isDarkMode: false,
            isOpen: true,
            onClose: vi.fn(),
            existingVehicle: existingVehicle(),
            organizations: [testMasterOrganization()],
            initialOrganizationId: 'org-1',
            onRegister: vi.fn(),
            onUpdate: vi.fn(),
          }),
        }),
      );
    });

    const oneAutoBtn = document.querySelector(
      '[data-testid="vehicle-registration-oneauto-api"]',
    ) as HTMLButtonElement;
    await act(async () => {
      oneAutoBtn.click();
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(document.querySelector('[data-testid="oneauto-context-binding"]')).toBeTruthy();

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(document.querySelector('[data-testid="oneauto-context-binding"]')).toBeNull();
    expect(document.querySelector('[data-testid="vehicle-registration-modal-panel"]')).toBeTruthy();

    act(() => root.unmount());
    container.remove();
  });

  it('ZB-I dialog uses elevated stack when opened from registration modal', async () => {
    const { container, root } = renderModal();

    await act(async () => {
      root.render(
        createElement(LanguageProvider, {
          children: createElement(VehicleRegistrationModal, {
            isDarkMode: false,
            isOpen: true,
            onClose: vi.fn(),
            existingVehicle: existingVehicle(),
            organizations: [testMasterOrganization()],
            initialOrganizationId: 'org-1',
            onRegister: vi.fn(),
            onUpdate: vi.fn(),
          }),
        }),
      );
    });

    const zb1Btn = document.querySelector('[data-testid="vehicle-registration-upload-zb1"]');
    await act(async () => {
      zb1Btn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(document.querySelector('[data-testid="app-dialog-overlay-elevated"]')).toBeTruthy();
    expect(document.querySelector('.sq-dialog-panel')?.className.includes('z-[110]')).toBe(true);
    expect(document.querySelector('[data-testid="vehicle-identity-p2-panel-stub"]')).toBeTruthy();

    act(() => root.unmount());
    container.remove();
  });
});
