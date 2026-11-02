// ========================================
// TYPES
// ========================================

export type OrgStatus = 'Active' | 'Trial' | 'Suspended' | 'Churned';
export type ProductId = 'rental' | 'fleet' | 'taxi';
export type ProductStatus = 'Active' | 'Inactive';
export type SubscriptionPlan = 'Starter' | 'Business' | 'Enterprise' | 'Custom';
export type IntegrationId = 'woocommerce' | 'shopify';
export type IntegrationStatus = 'Connected' | 'Disconnected' | 'Error';
export type UserRole = 'Master Admin' | 'Org Admin' | 'Sub Admin' | 'Worker' | 'Driver' | 'Customer';
export type UserStatus = 'Active' | 'Inactive' | 'Invited';
// V4.6.86 — Platform-admin status union. Shares the canonical
// `Available` / `Reserved` / `Active Rented` labels with the rental
// surfaces (via `RENTAL_STATUS_MAP` / `VEHICLE_STATUS_MAP`), and keeps
// the admin-only `Blocked` distinction for `OUT_OF_SERVICE` so
// platform operators can differentiate a scheduled maintenance from a
// hard operational block. `Reserved` was previously missing from this
// union even though the backend emits it; that gap is now closed.
export type HvMasterSpecProvenance = 'ESTIMATED' | 'CONFIRMED';

export type VehicleStatus =
  | 'Available'
  | 'Reserved'
  | 'Active Rented'
  | 'Maintenance'
  | 'Blocked';
export type DimoConnectionStatus = 'Connected' | 'Disconnected' | 'Error';
export type StripeConnectionStatus = 'Connected' | 'Disconnected';

export interface OrgProduct {
  id: ProductId;
  name: string;
  status: ProductStatus;
  plan: SubscriptionPlan;
}

export interface OrgIntegration {
  id: IntegrationId;
  name: string;
  status: IntegrationStatus;
  apiKey: string;
  lastSync: string;
  syncStatus: 'Synced' | 'Pending' | 'Failed';
}

export interface OrgInvoice {
  id: string;
  amount: number;
  status: 'Paid' | 'Overdue' | 'Pending';
  date: string;
  plan: SubscriptionPlan;
}

export interface Organization {
  id: string;
  company_name: string;
  business_type: string;
  city: string;
  country: string;
  fleet_size: number;
  created_at: string;
  status: OrgStatus;
  plan: SubscriptionPlan;
  mrr: number;
  users: number;
  contactEmail: string;
  lastActive: string;
  products: OrgProduct[];
  integrations: OrgIntegration[];
  invoices: OrgInvoice[];
}

export interface PlatformUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  organizationId: string;
  organizationName: string;
  status: UserStatus;
  lastActive: string;
  created_at: string;
  avatar: string;
  last_login: string;
}

export interface RegisteredVehicle {
  id: string;
  vehicleName: string;
  vin: string;
  make: string;
  model: string;
  year: number;
  organizationId: string;
  organizationName: string;
  station: string;
  status: VehicleStatus;
  health: 'Good' | 'Warning' | 'Critical';
  lastSignal: string;
  online: boolean;
  fuelType: string;
  mileage: number;
  licensePlate: string;
  vehicleType: string;
  operationalStatus: string;
  notes: string;
  // LV Battery (12V auxiliary)
  batteryType: string;
  batteryAmpere: string;
  batteryVolt: string;
  lvBatteryChemistry?: string;
  // HV Battery (EV / PHEV traction)
  hvBatteryCapacityKwh: string;
  tankCapacityLiters?: string;
  hvBatteryPresent?: string;
  electrificationLevel?: string;
  hvBatteryChemistry?: string;
  hvBatteryCellFormat?: string;
  hvBatteryGrossCapacityKwh?: string;
  hvBatteryUsableCapacityKwh?: string;
  hvBatteryNominalVoltage?: string;
  hvBatteryArchitecture?: string;
  hvBatteryThermalManagement?: string;
  hvBatteryModuleCount?: string;
  hvBatteryCellCount?: string;
  hvBatteryWarrantyYears?: string;
  hvBatteryWarrantyKm?: string;
  acOnboardChargerKw?: string;
  dcFastChargeMaxKw?: string;
  hvMasterSpecificationProvenance?: HvMasterSpecProvenance | null;
  hvMasterSpecificationVariantLabel?: string | null;
  hvMasterSpecificationEvidenceNote?: string | null;
  hvMasterSpecificationCatalogReferences?: string[] | null;
  hvMasterSpecificationCatalogVariantKey?: string | null;
  hvMasterSpecificationFieldChangeClassification?: string | null;
  // Engine
  engineDisplacementCc?: string;
  cylinderCount?: string;
  // Tires
  tireFrontDimension: string;
  tireFrontBrandModel: string;
  tireFrontSeason: string;
  tireFrontDot: string;
  tireFrontLoadIndex: string;
  tireFrontSpeedIndex: string;
  tireBackDimension: string;
  tireBackBrandModel: string;
  tireBackSeason: string;
  tireBackDot: string;
  tireBackLoadIndex: string;
  tireBackSpeedIndex: string;
  treadDepthFL: string;
  treadDepthFR: string;
  treadDepthBL: string;
  treadDepthBR: string;
  tireCondition?: '' | 'NEW_INSTALLED' | 'ALREADY_MOUNTED';
  aiTireSpec?: Record<string, unknown> | null;
  // Brakes
  brakeFrontRotorDiameter: string;
  brakeFrontRotorWidth: string;
  brakeFrontPadThickness: string;
  brakeBackRotorDiameter: string;
  brakeBackRotorWidth: string;
  brakeBackPadThickness: string;
  // Engine
  idleRpm: string;
  maxRpm: string;
  // Technical
  drivetrain: string;
  brakeForceDistribution: string;
  frontToRearWeightDistribution: string;
  curbWeight: string;
  systemMotorPowerKw?: string;
  accel0To100S?: string;
  motionPhysicsVariantAssumption?: string;
  systemPowerDefinition?: string;
  serviceIntervals: string;
  // Service Intervals
  serviceIntervalManufacturerKm: string;
  serviceIntervalManufacturerMonths: string;
  // Oil Change
  oilChangeIntervalKm: string;
  oilChangeIntervalMonths: string;
  // Service History
  lastTuev: string;
  lastBokraft: string;
  lastInspection: string;
  lastOilChange: string;
  lastBrakePadChange: string;
  lastBrakeRotorChange: string;
  // V3 Hardware type — determines Driving Event source
  // LTE_R1: Driving Events from DIMO Telemetry API Events
  // SMART5:  Driving Events from HF time-series reconstruction
  // UNKNOWN: default (falls back to SMART5 behaviour)
  hardwareType?: 'LTE_R1' | 'SMART5' | 'UNKNOWN';
  /** Per-field AI provenance captured at registration (stored in vehicle extraData). */
  aiFieldProvenance?: Record<
    string,
    { category: 'AI_ESTIMATED' | 'KNOWLEDGE_ONLY' | 'USER_CONFIRMED' | 'INPUT_KNOWN'; confidence?: number | null }
  >;
  /** Verified onboarding connection modality (not DI routing hardware type). */
  connectionModality?: string | null;
  /** Telemetry family from connection identity evidence (e.g. API_SYNTHETIC). */
  telemetryConnectionFamily?: string | null;
  // Interpreted telemetry (from backend, centralized truth)
  signalAgeMs?: number;
  isFresh?: boolean;
  onlineStatus?: 'ONLINE' | 'STANDBY' | 'OFFLINE';
  displayState?: 'MOVING' | 'IDLE' | 'PARKED';
  displayIgnition?: 'ON' | 'OFF' | 'UNKNOWN';
  isLiveTracking?: boolean;
}

export interface DimoVehicle {
  id: string;
  tokenId: number | null;
  vin: string;
  make: string;
  model: string;
  year: number;
  odometer: number;
  battery: number | null;
  fuelLevel: number | null;
  powertrainType: string | null;
  lastSignal: string;
  connectionStatus: 'Connected' | 'Disconnected';
}

// ========================================
// INITIAL DATA
// ========================================

const defaultProducts = (enabled: ProductId[] = ['rental']): OrgProduct[] => [
  { id: 'rental', name: 'Rental Solutions', status: enabled.includes('rental') ? 'Active' : 'Inactive', plan: 'Business' },
  { id: 'fleet', name: 'Fleet Management', status: enabled.includes('fleet') ? 'Active' : 'Inactive', plan: 'Business' },
  { id: 'taxi', name: 'Taxi Dispatch', status: enabled.includes('taxi') ? 'Active' : 'Inactive', plan: 'Starter' },
];

const defaultIntegrations = (woo = false, shopify = false): OrgIntegration[] => [
  { id: 'woocommerce', name: 'WooCommerce', status: woo ? 'Connected' : 'Disconnected', apiKey: woo ? 'wc_key_••••••••' : '', lastSync: woo ? '2h ago' : 'Never', syncStatus: woo ? 'Synced' : 'Pending' },
  { id: 'shopify', name: 'Shopify', status: shopify ? 'Connected' : 'Disconnected', apiKey: shopify ? 'shpat_••••••••' : '', lastSync: shopify ? '30 min ago' : 'Never', syncStatus: shopify ? 'Synced' : 'Pending' },
];

// Simulated data removed - all data loaded from API
export const initialOrganizations: Organization[] = [];
export const initialUsers: PlatformUser[] = [];
export const initialRegisteredVehicles: RegisteredVehicle[] = [];
export const initialDimoVehicles: DimoVehicle[] = [];

// AI Worker simulation data (looked up by make+model)
export const aiWorkerData: Record<string, {
  batteryType: string; batteryAmpere: string; batteryVolt: string;
  brakeFrontRotorDiameter: string; brakeFrontRotorWidth: string; brakeFrontPadThickness: string;
  brakeBackRotorDiameter: string; brakeBackRotorWidth: string; brakeBackPadThickness: string;
  idleRpm: string; maxRpm: string; curbWeight: string; serviceIntervals: string;
}> = {
  'Volkswagen ID.4': { batteryType: 'Li-ion 77 kWh', batteryAmpere: '-', batteryVolt: '400', brakeFrontRotorDiameter: '340', brakeFrontRotorWidth: '30', brakeFrontPadThickness: '13', brakeBackRotorDiameter: '310', brakeBackRotorWidth: '22', brakeBackPadThickness: '11.5', idleRpm: '-', maxRpm: '-', curbWeight: '2124', serviceIntervals: '30000 km / 24 months' },
  'BMW iX3': { batteryType: 'Li-ion 80 kWh', batteryAmpere: '-', batteryVolt: '400', brakeFrontRotorDiameter: '348', brakeFrontRotorWidth: '36', brakeFrontPadThickness: '14', brakeBackRotorDiameter: '345', brakeBackRotorWidth: '24', brakeBackPadThickness: '12', idleRpm: '-', maxRpm: '-', curbWeight: '2185', serviceIntervals: '30000 km / 24 months' },
  'Tesla Model Y': { batteryType: 'Li-ion 75 kWh', batteryAmpere: '-', batteryVolt: '400', brakeFrontRotorDiameter: '355', brakeFrontRotorWidth: '32', brakeFrontPadThickness: '12', brakeBackRotorDiameter: '335', brakeBackRotorWidth: '26', brakeBackPadThickness: '10.5', idleRpm: '-', maxRpm: '-', curbWeight: '1979', serviceIntervals: '20000 km / 12 months' },
  'Audi Q4 e-tron': { batteryType: 'Li-ion 82 kWh', batteryAmpere: '-', batteryVolt: '400', brakeFrontRotorDiameter: '338', brakeFrontRotorWidth: '28', brakeFrontPadThickness: '13.5', brakeBackRotorDiameter: '310', brakeBackRotorWidth: '22', brakeBackPadThickness: '11', idleRpm: '-', maxRpm: '-', curbWeight: '2135', serviceIntervals: '30000 km / 24 months' },
  'Mercedes-Benz EQA': { batteryType: 'Li-ion 66.5 kWh', batteryAmpere: '-', batteryVolt: '400', brakeFrontRotorDiameter: '330', brakeFrontRotorWidth: '28', brakeFrontPadThickness: '12.8', brakeBackRotorDiameter: '300', brakeBackRotorWidth: '20', brakeBackPadThickness: '10.5', idleRpm: '-', maxRpm: '-', curbWeight: '2040', serviceIntervals: '25000 km / 24 months' },
  'Skoda Enyaq': { batteryType: 'Li-ion 77 kWh', batteryAmpere: '-', batteryVolt: '400', brakeFrontRotorDiameter: '340', brakeFrontRotorWidth: '30', brakeFrontPadThickness: '13', brakeBackRotorDiameter: '310', brakeBackRotorWidth: '22', brakeBackPadThickness: '11', idleRpm: '-', maxRpm: '-', curbWeight: '2100', serviceIntervals: '30000 km / 24 months' },
};

export function getAiWorkerKey(make: string, model: string): string {
  return `${make} ${model}`;
}

export function generateId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}
