import {
  CANONICAL_LV_BATTERY_STORAGE_TYPES,
  deriveElectrificationLevelReadOnly,
  resolveRegistrationLvBatteryFormState,
  resolveRegistrationLvBatteryForSubmit,
} from '../connected-vehicles/vehicle-specification-canonical.util';
import { X, Sparkles, ChevronDown, ChevronUp, Save, AlertCircle, CheckCircle2, XCircle, Loader2, Bot, Pencil, Radio, Search, Link2, Shield, Camera, FileText, Cloud } from 'lucide-react';
import { useState, useEffect, useRef, useCallback } from 'react';
import { api, streamAiSpecs, streamAiTireSpecs } from '../../lib/api';
import { useLanguage } from '../../i18n/LanguageContext';
import type { AgentStep, AiSpecsStreamEvent, AiTireSpecsStreamEvent, HmAvailabilityDto } from '../../lib/api';
import type { DimoVehicle, Organization, RegisteredVehicle } from '../data/platform-data';
import { HV_CATALOG_VARIANT_KEYS } from '../connected-vehicles/master-hv-master-specification.util';
import { generateId } from '../data/platform-data';
import { formatAiHvBatteryPresentForForm } from '../connected-vehicles/ai-spec-hv-boolean.util';
import {
  resolveVehicleAiSpecsProvenance,
  shouldApplyVehicleAiSpecsFromStreamResult,
} from '../connected-vehicles/vehicle-registration-ai-stream.util';
import {
  buildAiFieldProvenanceFromSpecs,
  type VehicleAiFieldProvenanceMap,
} from '../connected-vehicles/vehicle-ai-field-provenance.util';
import {
  isMotionPhysicsTierLockedForAiMerge,
  shouldApplyAiSpecToEmptyField,
} from '../connected-vehicles/ai-spec-field-merge.util';
import {
  buildMotionPhysicsReferenceCreateBody,
  canConfirmEstimatedAiMotionReference,
  canConfirmManualMotionValues,
  formatMotionPhysicsUserErrorMessage,
  hasMotionPhysicsFormValues,
  hasMotionPhysicsValuesAtRiskOnRoutineVehicleSave,
  hasUnconfirmedManualMotionPhysicsEdits,
  hydrateSystemPowerDefinitionFormState,
  isMotionPhysicsReferenceReadOnly,
  mergeMotionPhysicsReferenceFromCreateResponse,
  MOTION_PHYSICS_SYNC_REASON_CODES,
  MOTION_SYSTEM_POWER_DEFINITION_OPTIONS,
  motionPhysicsReferenceSourceForSave,
  parseMotionSystemPowerDefinitionOption,
  resolveMotionPhysicsPendingAfterAiApply,
  shouldSyncMotionPhysicsReferenceOnSave,
  snapshotMotionPhysicsFormFields,
  snapshotMotionPhysicsFromActiveReference,
  validateMotionPhysicsReferenceCreatePayload,
  type AiSpecsApplyProvenance,
  type MotionPhysicsFormSnapshot,
  type MotionPhysicsPendingCreateSource,
  type MotionSystemPowerDefinitionOption,
} from '../connected-vehicles/motion-physics-reference-sync.util';
import { isMasterElectrifiedFuelType } from '../connected-vehicles/master-ev-fuel-type.util';
import {
  formatMasterConnectionModalityLabel,
  formatMasterTelemetryConnectionFamilyLabel,
} from '../connected-vehicles/master-connection-identity-display.util';
import {
  ExteriorImagesEditor,
  flushBufferedExteriorImages,
  type ExteriorImageBufferEntry,
} from './ExteriorImagesEditor';
import { VehicleIdentityP2Panel } from './VehicleIdentityP2Panel';
import { MasterZb1RegistrationDialog } from './MasterZb1RegistrationDialog';
import { OneAutoServiceDialog } from '../oneauto/OneAutoServiceDialog';
import { isVehicleIdentityP2Enabled } from '../connected-vehicles/vehicle-identity-p2.util';
import type { Zb1RegistrationFormPatch } from '../connected-vehicles/zb1-registration-form-merge.util';

interface VehicleRegistrationModalProps {
  isDarkMode: boolean;
  isOpen: boolean;
  onClose: () => void;
  dimoVehicle?: DimoVehicle;
  existingVehicle?: RegisteredVehicle;
  organizations: Organization[];
  initialOrganizationId?: string | null;
  /** When true, service history / HM blocks are hidden (not persisted on manual create). */
  manualCreateOnly?: boolean;
  onRegister: (vehicle: RegisteredVehicle) => void | Promise<void>;
  onUpdate?: (vehicle: RegisteredVehicle) => void | Promise<void>;
}

function inferDefaultFuelType(d: DimoVehicle): string {
  if (d.battery != null && d.fuelLevel == null) return 'Electric';
  const pt = (d.powertrainType || '').toUpperCase();
  if (pt.includes('PHEV') || pt.includes('PLUGIN')) return 'Plugin Hybrid';
  if (pt.includes('HEV') || pt === 'HYBRID') return 'Hybrid';
  if (pt === 'BEV' || pt === 'ELECTRIC') return 'Electric';
  return 'Gasoline';
}

const HIGH_MOBILITY_SIGNALS = [
  { id: 'dashboard_lights', label: 'Dashboard Lights' },
  { id: 'brake_lining_warning', label: 'Brake Lining Pre-Warning' },
  { id: 'oil_level', label: 'Oil Level' },
  { id: 'limp_mode', label: 'Limp Mode' },
  { id: 'distance_next_service', label: 'Distance to Next Service' },
  { id: 'time_next_service', label: 'Time to Next Service' },
  { id: 'tire_pressure', label: 'Tire Pressure' },
  { id: 'tire_pressure_statuses', label: 'Tire Pressure Statuses' },
  { id: 'parking_brake_status', label: 'Parking Brake Status' },
] as const;

export function VehicleRegistrationModal({ isDarkMode, isOpen, onClose, dimoVehicle, existingVehicle, organizations, initialOrganizationId, manualCreateOnly = false, onRegister, onUpdate }: VehicleRegistrationModalProps) {
  const { t } = useLanguage();
  const isEditMode = !!existingVehicle;
  const isManualCreate = manualCreateOnly || (!isEditMode && !dimoVehicle);

  const [manualVin, setManualVin] = useState('');
  const [manualMake, setManualMake] = useState('');
  const [manualModel, setManualModel] = useState('');
  const [manualYear, setManualYear] = useState(new Date().getFullYear());
  const [manualOdometer, setManualOdometer] = useState(0);

  const vehicleIdentity = isEditMode
    ? { vin: existingVehicle.vin, make: existingVehicle.make, model: existingVehicle.model, year: existingVehicle.year, odometer: existingVehicle.mileage }
    : dimoVehicle
      ? { vin: dimoVehicle.vin, make: dimoVehicle.make, model: dimoVehicle.model, year: dimoVehicle.year, odometer: dimoVehicle.odometer }
      : { vin: manualVin, make: manualMake, model: manualModel, year: manualYear, odometer: manualOdometer };

  const [expandedSections, setExpandedSections] = useState<string[]>(['assignment', 'technical', 'battery', 'brakes', 'tires', 'service', 'history', 'exterior', 'hm', 'hardware']);
  const [aiLoading, setAiLoading] = useState(!isEditMode);
  const [aiDegraded, setAiDegraded] = useState(false);
  const [aiErrorDetail, setAiErrorDetail] = useState('');
  const [aiSteps, setAiSteps] = useState<AgentStep[]>([]);
  const [aiLiveStep, setAiLiveStep] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [zb1DialogOpen, setZb1DialogOpen] = useState(false);
  const [oneAutoDialogOpen, setOneAutoDialogOpen] = useState(false);
  const [batteryValidationError, setBatteryValidationError] = useState<string | null>(null);

  // Assignment
  const [organizationId, setOrganizationId] = useState('');
  const [station, setStation] = useState('');
  const [vehicleType, setVehicleType] = useState('SEDAN');
  const [fuelType, setFuelType] = useState('Gasoline');
  const [licensePlate, setLicensePlate] = useState('');
  const [operationalStatus, setOperationalStatus] = useState('Active');
  const [notes, setNotes] = useState('');

  // V3 Hardware
  const [hardwareType, setHardwareType] = useState<'LTE_R1' | 'SMART5' | 'UNKNOWN'>('UNKNOWN');

  // Technical
  const [drivetrain, setDrivetrain] = useState('');
  const [curbWeight, setCurbWeight] = useState('');
  const [systemMotorPowerKw, setSystemMotorPowerKw] = useState('');
  const [accel0To100S, setAccel0To100S] = useState('');
  const [motionPhysicsVariantAssumption, setMotionPhysicsVariantAssumption] = useState('');
  const [motionPhysicsReferenceId, setMotionPhysicsReferenceId] = useState<string | null>(null);
  const [motionPhysicsEvidenceTier, setMotionPhysicsEvidenceTier] = useState<
    'ESTIMATED' | 'CONFIRMED' | 'VERIFIED' | null
  >(null);
  const [motionPhysicsConfirming, setMotionPhysicsConfirming] = useState(false);
  const [motionPhysicsManualConfirming, setMotionPhysicsManualConfirming] = useState(false);
  const [systemPowerDefinition, setSystemPowerDefinition] = useState<MotionSystemPowerDefinitionOption | ''>('');
  const [motionPhysicsSyncError, setMotionPhysicsSyncError] = useState('');
  const [motionPhysicsSaveInfo, setMotionPhysicsSaveInfo] = useState('');
  const motionPhysicsPendingCreateSourceRef = useRef<MotionPhysicsPendingCreateSource>(null);
  const motionPhysicsManualEditedRef = useRef(false);
  const motionPhysicsLoadedBaselineRef = useRef<MotionPhysicsFormSnapshot | null>(null);
  const motionPhysicsNoReferenceSessionBaselineRef = useRef<MotionPhysicsFormSnapshot | null>(
    null,
  );
  const [idleRpm, setIdleRpm] = useState('');
  const [maxRpm, setMaxRpm] = useState('');
  const [brakeForceDistribution, setBrakeForceDistribution] = useState('');
  const [frontToRearWeightDistribution, setFrontToRearWeightDistribution] = useState('');

  // LV Battery (12V auxiliary)
  const [batteryType, setBatteryType] = useState('');
  const [batteryAmpere, setBatteryAmpere] = useState('');
  const [batteryVolt, setBatteryVolt] = useState('');
  const [lvBatteryChemistry, setLvBatteryChemistry] = useState('');

  // HV Battery (EV / PHEV traction)
  const [hvBatteryCapacityKwh, setHvBatteryCapacityKwh] = useState('');
  const [hvBatteryPresent, setHvBatteryPresent] = useState('');
  const [electrificationLevel, setElectrificationLevel] = useState('');
  const [hvBatteryChemistry, setHvBatteryChemistry] = useState('');
  const [hvBatteryCellFormat, setHvBatteryCellFormat] = useState('');
  const [hvBatteryGrossCapacityKwh, setHvBatteryGrossCapacityKwh] = useState('');
  const [hvBatteryUsableCapacityKwh, setHvBatteryUsableCapacityKwh] = useState('');
  const [hvBatteryNominalVoltage, setHvBatteryNominalVoltage] = useState('');
  const [hvBatteryArchitecture, setHvBatteryArchitecture] = useState('');
  const [hvBatteryThermalManagement, setHvBatteryThermalManagement] = useState('');
  const [hvBatteryWarrantyYears, setHvBatteryWarrantyYears] = useState('');
  const [hvBatteryWarrantyKm, setHvBatteryWarrantyKm] = useState('');
  const [acOnboardChargerKw, setAcOnboardChargerKw] = useState('');
  const [dcFastChargeMaxKw, setDcFastChargeMaxKw] = useState('');
  const [hvMasterSpecificationCatalogVariantKey, setHvMasterSpecificationCatalogVariantKey] =
    useState('');

  // Fuel tank
  const [tankCapacityLiters, setTankCapacityLiters] = useState('');

  // Engine
  const [engineDisplacementCc, setEngineDisplacementCc] = useState('');
  const [cylinderCount, setCylinderCount] = useState('');

  // Brakes
  const [brakeFrontRotorDiameter, setBrakeFrontRotorDiameter] = useState('');
  const [brakeFrontRotorWidth, setBrakeFrontRotorWidth] = useState('');
  const [brakeFrontPadThickness, setBrakeFrontPadThickness] = useState('');
  const [brakeBackRotorDiameter, setBrakeBackRotorDiameter] = useState('');
  const [brakeBackRotorWidth, setBrakeBackRotorWidth] = useState('');
  const [brakeBackPadThickness, setBrakeBackPadThickness] = useState('');

  // Tires
  const [tireFrontDimension, setTireFrontDimension] = useState('');
  const [tireFrontBrandModel, setTireFrontBrandModel] = useState('');
  const [tireFrontSeason, setTireFrontSeason] = useState('All Season');
  const [tireFrontDot, setTireFrontDot] = useState('');
  const [tireFrontLoadIndex, setTireFrontLoadIndex] = useState('');
  const [tireFrontSpeedIndex, setTireFrontSpeedIndex] = useState('');
  const [tireBackDimension, setTireBackDimension] = useState('');
  const [tireBackBrandModel, setTireBackBrandModel] = useState('');
  const [tireBackSeason, setTireBackSeason] = useState('All Season');
  const [tireBackDot, setTireBackDot] = useState('');
  const [tireBackLoadIndex, setTireBackLoadIndex] = useState('');
  const [tireBackSpeedIndex, setTireBackSpeedIndex] = useState('');
  const [treadDepthFL, setTreadDepthFL] = useState('');
  const [treadDepthFR, setTreadDepthFR] = useState('');
  const [treadDepthBL, setTreadDepthBL] = useState('');
  const [treadDepthBR, setTreadDepthBR] = useState('');
  const [tireCondition, setTireCondition] = useState<'' | 'NEW_INSTALLED' | 'ALREADY_MOUNTED'>('');

  // AI Tire Spec agent
  const [tireAiLoading, setTireAiLoading] = useState(false);
  const [tireAiResult, setTireAiResult] = useState<Record<string, unknown> | null>(null);
  const [tireAiError, setTireAiError] = useState('');
  const [tireAiSteps, setTireAiSteps] = useState<AgentStep[]>([]);
  const [tireAiCountdown, setTireAiCountdown] = useState(0);
  const [tireAiResultExpanded, setTireAiResultExpanded] = useState(false);
  const tireAiAbortRef = useRef<AbortController | null>(null);
  const tireAiCountdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Service & Maintenance
  const [serviceIntervals, setServiceIntervals] = useState('');
  const [serviceIntervalManufacturerKm, setServiceIntervalManufacturerKm] = useState('');
  const [serviceIntervalManufacturerMonths, setServiceIntervalManufacturerMonths] = useState('');
  const [oilChangeIntervalKm, setOilChangeIntervalKm] = useState('');
  const [oilChangeIntervalMonths, setOilChangeIntervalMonths] = useState('');

  // Service History
  const [lastTuev, setLastTuev] = useState('');
  const [lastBokraft, setLastBokraft] = useState('');
  const [lastInspection, setLastInspection] = useState('');
  const [lastOilChange, setLastOilChange] = useState('');
  const [lastBrakePadChange, setLastBrakePadChange] = useState('');
  const [lastBrakeRotorChange, setLastBrakeRotorChange] = useState('');

  // High Mobility — frontend-only signal toggles (legacy, kept for state compat)
  const [hmEnabled, setHmEnabled] = useState(false);
  const [hmSignals, setHmSignals] = useState<Record<string, boolean>>(
    Object.fromEntries(HIGH_MOBILITY_SIGNALS.map(s => [s.id, false])),
  );

  // High Mobility — backend availability state (Phase 1)
  const [hmAvailability, setHmAvailability] = useState<HmAvailabilityDto | null>(null);
  const [hmAvailabilityLoading, setHmAvailabilityLoading] = useState(false);
  const [hmActivating, setHmActivating] = useState(false);
  const [hmActivated, setHmActivated] = useState(false);

  // V4.7.50 — Exterior photos (Damage Map). In edit mode the editor talks to
  // the API directly via the existing vehicleId. In create mode we buffer
  // the chosen files in memory and flush them after the registration POST
  // returns the new vehicleId.
  const [bufferedExteriorImages, setBufferedExteriorImages] = useState<ExteriorImageBufferEntry[]>([]);

  const prefillFromExisting = (v: RegisteredVehicle) => {
    setHardwareType((v.hardwareType as 'LTE_R1' | 'SMART5' | 'UNKNOWN') ?? 'UNKNOWN');
    setOrganizationId(v.organizationId);
    setStation(v.station);
    setVehicleType(v.vehicleType || 'SEDAN');
    setFuelType(v.fuelType || 'Gasoline');
    setLicensePlate(v.licensePlate);
    setOperationalStatus(v.operationalStatus || 'Active');
    setNotes(v.notes);
    setDrivetrain(v.drivetrain || '');
    setCurbWeight(v.curbWeight);
    setSystemMotorPowerKw(v.systemMotorPowerKw ?? '');
    setAccel0To100S(v.accel0To100S ?? '');
    setMotionPhysicsVariantAssumption(v.motionPhysicsVariantAssumption ?? '');
    setSystemPowerDefinition(hydrateSystemPowerDefinitionFormState(undefined, v.systemPowerDefinition));
    motionPhysicsManualEditedRef.current = false;
    motionPhysicsPendingCreateSourceRef.current = null;
    motionPhysicsLoadedBaselineRef.current = null;
    setMotionPhysicsSaveInfo('');
    setIdleRpm(v.idleRpm);
    setMaxRpm(v.maxRpm);
    setBrakeForceDistribution(v.brakeForceDistribution || '');
    setFrontToRearWeightDistribution(v.frontToRearWeightDistribution || '');
    setBatteryType(v.batteryType);
    setBatteryAmpere(v.batteryAmpere);
    setBatteryVolt(v.batteryVolt);
    setLvBatteryChemistry(v.lvBatteryChemistry ?? '');
    setHvBatteryCapacityKwh(v.hvBatteryCapacityKwh);
    setHvBatteryPresent(v.hvBatteryPresent ?? '');
    setElectrificationLevel(v.electrificationLevel ?? '');
    setHvBatteryChemistry(v.hvBatteryChemistry ?? '');
    setHvBatteryCellFormat(v.hvBatteryCellFormat ?? '');
    setHvBatteryGrossCapacityKwh(v.hvBatteryGrossCapacityKwh ?? '');
    setHvBatteryUsableCapacityKwh(v.hvBatteryUsableCapacityKwh ?? '');
    setHvBatteryNominalVoltage(v.hvBatteryNominalVoltage ?? '');
    setHvBatteryArchitecture(v.hvBatteryArchitecture ?? '');
    setHvBatteryThermalManagement(v.hvBatteryThermalManagement ?? '');
    setHvBatteryWarrantyYears(v.hvBatteryWarrantyYears ?? '');
    setHvBatteryWarrantyKm(v.hvBatteryWarrantyKm ?? '');
    setAcOnboardChargerKw(v.acOnboardChargerKw ?? '');
    setDcFastChargeMaxKw(v.dcFastChargeMaxKw ?? '');
    setHvMasterSpecificationCatalogVariantKey(v.hvMasterSpecificationCatalogVariantKey ?? '');
    setTankCapacityLiters(v.tankCapacityLiters ?? '');
    setEngineDisplacementCc(v.engineDisplacementCc ?? '');
    setCylinderCount(v.cylinderCount ?? '');
    setBrakeFrontRotorDiameter(v.brakeFrontRotorDiameter);
    setBrakeFrontRotorWidth(v.brakeFrontRotorWidth);
    setBrakeFrontPadThickness(v.brakeFrontPadThickness);
    setBrakeBackRotorDiameter(v.brakeBackRotorDiameter);
    setBrakeBackRotorWidth(v.brakeBackRotorWidth);
    setBrakeBackPadThickness(v.brakeBackPadThickness);
    setTireFrontDimension(v.tireFrontDimension);
    setTireFrontBrandModel(v.tireFrontBrandModel);
    setTireFrontSeason(v.tireFrontSeason || 'All Season');
    setTireFrontDot(v.tireFrontDot);
    setTireFrontLoadIndex(v.tireFrontLoadIndex);
    setTireFrontSpeedIndex(v.tireFrontSpeedIndex);
    setTireBackDimension(v.tireBackDimension);
    setTireBackBrandModel(v.tireBackBrandModel);
    setTireBackSeason(v.tireBackSeason || 'All Season');
    setTireBackDot(v.tireBackDot);
    setTireBackLoadIndex(v.tireBackLoadIndex);
    setTireBackSpeedIndex(v.tireBackSpeedIndex);
    setTreadDepthFL(v.treadDepthFL);
    setTreadDepthFR(v.treadDepthFR);
    setTreadDepthBL(v.treadDepthBL);
    setTreadDepthBR(v.treadDepthBR);
    setServiceIntervals(v.serviceIntervals);
    setServiceIntervalManufacturerKm(v.serviceIntervalManufacturerKm);
    setServiceIntervalManufacturerMonths(v.serviceIntervalManufacturerMonths);
    setOilChangeIntervalKm(v.oilChangeIntervalKm);
    setOilChangeIntervalMonths(v.oilChangeIntervalMonths);
    const toDateVal = (iso: string) => {
      if (!iso) return '';
      const d = new Date(iso);
      return isNaN(d.getTime()) ? iso : d.toISOString().slice(0, 10);
    };
    setLastTuev(toDateVal(v.lastTuev));
    setLastBokraft(toDateVal(v.lastBokraft));
    setLastInspection(toDateVal(v.lastInspection));
    setLastOilChange(toDateVal(v.lastOilChange));
    setLastBrakePadChange(toDateVal(v.lastBrakePadChange));
    setLastBrakeRotorChange(toDateVal(v.lastBrakeRotorChange));
  };

  useEffect(() => {
    if (!isOpen) return;
    const body = document.body;
    const previousOverflow = body.style.overflow;
    body.style.overflow = 'hidden';
    return () => {
      body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    if (isEditMode) {
      prefillFromExisting(existingVehicle);
      aiFieldProvenanceRef.current = existingVehicle.aiFieldProvenance ?? {};
      setAiLoading(false);
      return;
    }
    aiFieldProvenanceRef.current = {};
    setOrganizationId(initialOrganizationId ?? '');
    setStation('');
    setVehicleType('SEDAN');
    setFuelType(dimoVehicle ? inferDefaultFuelType(dimoVehicle) : 'Gasoline');
    setLicensePlate('');
    setOperationalStatus('Active');
    setNotes('');
    if (!dimoVehicle) {
      setManualVin('');
      setManualMake('');
      setManualModel('');
      setManualYear(new Date().getFullYear());
      setManualOdometer(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, isEditMode ? existingVehicle?.id : dimoVehicle?.id, initialOrganizationId]);

  const aiAbortRef = useRef<AbortController | null>(null);
  const aiGenerationRef = useRef(0);
  const aiFieldProvenanceRef = useRef<VehicleAiFieldProvenanceMap>({});

  const curbWeightRef = useRef(curbWeight);
  const systemMotorPowerKwRef = useRef(systemMotorPowerKw);
  const accel0To100SRef = useRef(accel0To100S);
  const motionPhysicsVariantAssumptionRef = useRef(motionPhysicsVariantAssumption);
  const systemPowerDefinitionRef = useRef(systemPowerDefinition);
  const motionPhysicsEvidenceTierRef = useRef(motionPhysicsEvidenceTier);
  const lvBatteryChemistryRef = useRef(lvBatteryChemistry);
  const hvBatteryPresentRef = useRef(hvBatteryPresent);
  const hvBatteryChemistryRef = useRef(hvBatteryChemistry);
  const hvBatteryCellFormatRef = useRef(hvBatteryCellFormat);
  const hvBatteryGrossCapacityKwhRef = useRef(hvBatteryGrossCapacityKwh);
  const hvBatteryUsableCapacityKwhRef = useRef(hvBatteryUsableCapacityKwh);
  const hvBatteryNominalVoltageRef = useRef(hvBatteryNominalVoltage);
  const hvBatteryArchitectureRef = useRef(hvBatteryArchitecture);
  const hvBatteryThermalManagementRef = useRef(hvBatteryThermalManagement);
  const hvBatteryWarrantyYearsRef = useRef(hvBatteryWarrantyYears);
  const hvBatteryWarrantyKmRef = useRef(hvBatteryWarrantyKm);
  const hvBatteryCapacityKwhRef = useRef(hvBatteryCapacityKwh);
  const acOnboardChargerKwRef = useRef(acOnboardChargerKw);
  const dcFastChargeMaxKwRef = useRef(dcFastChargeMaxKw);
  const tankCapacityLitersRef = useRef(tankCapacityLiters);
  const engineDisplacementCcRef = useRef(engineDisplacementCc);
  const cylinderCountRef = useRef(cylinderCount);
  const batteryTypeRef = useRef(batteryType);
  const batteryAmpereRef = useRef(batteryAmpere);
  const batteryVoltRef = useRef(batteryVolt);
  const drivetrainRef = useRef(drivetrain);
  const electrificationLevelRef = useRef(electrificationLevel);
  const idleRpmRef = useRef(idleRpm);
  const maxRpmRef = useRef(maxRpm);
  const brakeForceDistributionRef = useRef(brakeForceDistribution);
  const frontToRearWeightDistributionRef = useRef(frontToRearWeightDistribution);
  const serviceIntervalManufacturerKmRef = useRef(serviceIntervalManufacturerKm);
  const serviceIntervalManufacturerMonthsRef = useRef(serviceIntervalManufacturerMonths);
  const oilChangeIntervalKmRef = useRef(oilChangeIntervalKm);
  const oilChangeIntervalMonthsRef = useRef(oilChangeIntervalMonths);
  const serviceIntervalsRef = useRef(serviceIntervals);
  const brakeFrontRotorDiameterRef = useRef(brakeFrontRotorDiameter);
  const brakeFrontRotorWidthRef = useRef(brakeFrontRotorWidth);
  const brakeFrontPadThicknessRef = useRef(brakeFrontPadThickness);
  const brakeBackRotorDiameterRef = useRef(brakeBackRotorDiameter);
  const brakeBackRotorWidthRef = useRef(brakeBackRotorWidth);
  const brakeBackPadThicknessRef = useRef(brakeBackPadThickness);

  curbWeightRef.current = curbWeight;
  systemMotorPowerKwRef.current = systemMotorPowerKw;
  accel0To100SRef.current = accel0To100S;
  motionPhysicsVariantAssumptionRef.current = motionPhysicsVariantAssumption;
  systemPowerDefinitionRef.current = systemPowerDefinition;
  motionPhysicsEvidenceTierRef.current = motionPhysicsEvidenceTier;
  lvBatteryChemistryRef.current = lvBatteryChemistry;
  hvBatteryPresentRef.current = hvBatteryPresent;
  hvBatteryChemistryRef.current = hvBatteryChemistry;
  hvBatteryCellFormatRef.current = hvBatteryCellFormat;
  hvBatteryGrossCapacityKwhRef.current = hvBatteryGrossCapacityKwh;
  hvBatteryUsableCapacityKwhRef.current = hvBatteryUsableCapacityKwh;
  hvBatteryNominalVoltageRef.current = hvBatteryNominalVoltage;
  hvBatteryArchitectureRef.current = hvBatteryArchitecture;
  hvBatteryThermalManagementRef.current = hvBatteryThermalManagement;
  hvBatteryWarrantyYearsRef.current = hvBatteryWarrantyYears;
  hvBatteryWarrantyKmRef.current = hvBatteryWarrantyKm;
  hvBatteryCapacityKwhRef.current = hvBatteryCapacityKwh;
  acOnboardChargerKwRef.current = acOnboardChargerKw;
  dcFastChargeMaxKwRef.current = dcFastChargeMaxKw;
  tankCapacityLitersRef.current = tankCapacityLiters;
  engineDisplacementCcRef.current = engineDisplacementCc;
  cylinderCountRef.current = cylinderCount;
  batteryTypeRef.current = batteryType;
  batteryAmpereRef.current = batteryAmpere;
  batteryVoltRef.current = batteryVolt;
  drivetrainRef.current = drivetrain;
  electrificationLevelRef.current = electrificationLevel;
  idleRpmRef.current = idleRpm;
  maxRpmRef.current = maxRpm;
  brakeForceDistributionRef.current = brakeForceDistribution;
  frontToRearWeightDistributionRef.current = frontToRearWeightDistribution;
  serviceIntervalManufacturerKmRef.current = serviceIntervalManufacturerKm;
  serviceIntervalManufacturerMonthsRef.current = serviceIntervalManufacturerMonths;
  oilChangeIntervalKmRef.current = oilChangeIntervalKm;
  oilChangeIntervalMonthsRef.current = oilChangeIntervalMonths;
  serviceIntervalsRef.current = serviceIntervals;
  brakeFrontRotorDiameterRef.current = brakeFrontRotorDiameter;
  brakeFrontRotorWidthRef.current = brakeFrontRotorWidth;
  brakeFrontPadThicknessRef.current = brakeFrontPadThickness;
  brakeBackRotorDiameterRef.current = brakeBackRotorDiameter;
  brakeBackRotorWidthRef.current = brakeBackRotorWidth;
  brakeBackPadThicknessRef.current = brakeBackPadThickness;

  const noteMotionPhysicsManualEdit = () => {
    motionPhysicsManualEditedRef.current = true;
    motionPhysicsPendingCreateSourceRef.current = null;
  };

  const applySpecs = (
    specs: Record<string, string | number | boolean | null>,
    options?: { provenance?: AiSpecsApplyProvenance },
  ) => {
    const provenance = options?.provenance ?? 'local_fallback';
    const str = (v: string | number | boolean | null | undefined) => (v != null ? String(v) : '');
    const maybeSetIfEmpty = (
      current: () => string,
      setter: (v: string) => void,
      v: string | number | boolean | null | undefined,
    ) => {
      if (!shouldApplyAiSpecToEmptyField(current(), v)) return;
      setter(str(v as string | number | boolean));
    };
    const motionLocked = isMotionPhysicsTierLockedForAiMerge(motionPhysicsEvidenceTierRef.current);
    // LV battery — support both new lvBattery* names and legacy names
    maybeSetIfEmpty(() => batteryTypeRef.current, setBatteryType, specs.lvBatteryType ?? specs.batteryType);
    maybeSetIfEmpty(() => batteryAmpereRef.current, setBatteryAmpere, specs.lvBatteryAmpere ?? specs.batteryAmpere);
    maybeSetIfEmpty(() => batteryVoltRef.current, setBatteryVolt, specs.lvBatteryVolt ?? specs.batteryVolt);
    maybeSetIfEmpty(() => lvBatteryChemistryRef.current, setLvBatteryChemistry, specs.lvBatteryChemistry);
    // HV battery
    maybeSetIfEmpty(
      () => hvBatteryPresentRef.current,
      setHvBatteryPresent,
      formatAiHvBatteryPresentForForm(specs.hvBatteryPresent),
    );
    maybeSetIfEmpty(() => hvBatteryChemistryRef.current, setHvBatteryChemistry, specs.hvBatteryChemistry);
    maybeSetIfEmpty(() => hvBatteryCellFormatRef.current, setHvBatteryCellFormat, specs.hvBatteryCellFormat);
    maybeSetIfEmpty(() => hvBatteryGrossCapacityKwhRef.current, setHvBatteryGrossCapacityKwh, specs.hvBatteryGrossCapacityKwh);
    maybeSetIfEmpty(() => hvBatteryUsableCapacityKwhRef.current, setHvBatteryUsableCapacityKwh, specs.hvBatteryUsableCapacityKwh);
    maybeSetIfEmpty(() => hvBatteryNominalVoltageRef.current, setHvBatteryNominalVoltage, specs.hvBatteryNominalVoltage);
    maybeSetIfEmpty(() => hvBatteryArchitectureRef.current, setHvBatteryArchitecture, specs.hvBatteryArchitecture);
    maybeSetIfEmpty(() => hvBatteryThermalManagementRef.current, setHvBatteryThermalManagement, specs.hvBatteryThermalManagement);
    maybeSetIfEmpty(() => hvBatteryWarrantyYearsRef.current, setHvBatteryWarrantyYears, specs.hvBatteryWarrantyYears);
    maybeSetIfEmpty(() => hvBatteryWarrantyKmRef.current, setHvBatteryWarrantyKm, specs.hvBatteryWarrantyKm);
    maybeSetIfEmpty(() => acOnboardChargerKwRef.current, setAcOnboardChargerKw, specs.acOnboardChargerKw);
    maybeSetIfEmpty(() => dcFastChargeMaxKwRef.current, setDcFastChargeMaxKw, specs.dcFastChargeMaxKw);
    const usableKwh = specs.hvBatteryUsableCapacityKwh ?? specs.hvBatteryCapacityKwh;
    maybeSetIfEmpty(() => hvBatteryCapacityKwhRef.current, setHvBatteryCapacityKwh, usableKwh);
    maybeSetIfEmpty(() => tankCapacityLitersRef.current, setTankCapacityLiters, specs.tankCapacityLiters ?? specs.fuelTankCapacityLiters);
    maybeSetIfEmpty(() => engineDisplacementCcRef.current, setEngineDisplacementCc, specs.engineDisplacementCc);
    maybeSetIfEmpty(() => cylinderCountRef.current, setCylinderCount, specs.cylinderCount);
    maybeSetIfEmpty(() => brakeFrontRotorDiameterRef.current, setBrakeFrontRotorDiameter, specs.frontRotorDiameterMm ?? specs.brakeFrontRotorDiameter);
    maybeSetIfEmpty(() => brakeFrontRotorWidthRef.current, setBrakeFrontRotorWidth, specs.frontRotorWidthMm ?? specs.brakeFrontRotorWidth);
    maybeSetIfEmpty(() => brakeFrontPadThicknessRef.current, setBrakeFrontPadThickness, specs.frontPadThicknessMm ?? specs.brakeFrontPadThickness);
    maybeSetIfEmpty(() => brakeBackRotorDiameterRef.current, setBrakeBackRotorDiameter, specs.rearRotorDiameterMm ?? specs.brakeBackRotorDiameter);
    maybeSetIfEmpty(() => brakeBackRotorWidthRef.current, setBrakeBackRotorWidth, specs.rearRotorWidthMm ?? specs.brakeBackRotorWidth);
    maybeSetIfEmpty(() => brakeBackPadThicknessRef.current, setBrakeBackPadThickness, specs.rearPadThicknessMm ?? specs.brakeBackPadThickness);
    maybeSetIfEmpty(() => idleRpmRef.current, setIdleRpm, specs.idleRpm);
    maybeSetIfEmpty(() => maxRpmRef.current, setMaxRpm, specs.maxRpm);
    if (!motionLocked) {
      const motionBeforeApply = snapshotMotionPhysicsFormFields({
        curbWeight: curbWeightRef.current,
        systemMotorPowerKw: systemMotorPowerKwRef.current,
        accel0To100S: accel0To100SRef.current,
        variantAssumption: motionPhysicsVariantAssumptionRef.current,
        systemPowerDefinition: systemPowerDefinitionRef.current,
      });
      let appliedMotionFromAi = false;
      const applyMotion = (
        current: () => string,
        setter: (v: string) => void,
        v: string | number | boolean | null | undefined,
      ) => {
        if (!shouldApplyAiSpecToEmptyField(current(), v)) return;
        setter(str(v as string | number | boolean));
        appliedMotionFromAi = true;
      };
      applyMotion(() => curbWeightRef.current, setCurbWeight, specs.curbWeightKg ?? specs.curbWeight);
      applyMotion(() => systemMotorPowerKwRef.current, setSystemMotorPowerKw, specs.systemMotorPowerKw);
      applyMotion(() => accel0To100SRef.current, setAccel0To100S, specs.accel0To100S);
      applyMotion(
        () => motionPhysicsVariantAssumptionRef.current,
        setMotionPhysicsVariantAssumption,
        specs.variantAssumption,
      );
      const aiDefinition = parseMotionSystemPowerDefinitionOption(specs.systemPowerDefinition);
      if (
        aiDefinition &&
        shouldApplyAiSpecToEmptyField(systemPowerDefinitionRef.current, aiDefinition)
      ) {
        setSystemPowerDefinition(aiDefinition);
        appliedMotionFromAi = true;
      }
      motionPhysicsPendingCreateSourceRef.current = resolveMotionPhysicsPendingAfterAiApply({
        provenance,
        appliedMotionFromAi,
        motionFieldsHadValuesBeforeApply: hasMotionPhysicsFormValues(motionBeforeApply),
        manualEditedAfterApply: motionPhysicsManualEditedRef.current,
      });
    }
    maybeSetIfEmpty(() => drivetrainRef.current, setDrivetrain, specs.drivetrain);
    maybeSetIfEmpty(
      () => electrificationLevelRef.current,
      setElectrificationLevel,
      specs.electrificationLevel,
    );
    maybeSetIfEmpty(() => brakeForceDistributionRef.current, setBrakeForceDistribution, specs.brakeForceDistribution);
    maybeSetIfEmpty(
      () => frontToRearWeightDistributionRef.current,
      setFrontToRearWeightDistribution,
      specs.frontToRearWeightDistribution,
    );
    const svcKm = str(specs.manufacturerServiceIntervalKm);
    const svcMo = str(specs.manufacturerServiceIntervalMonths);
    if (!serviceIntervalManufacturerKmRef.current.trim() && svcKm) setServiceIntervalManufacturerKm(svcKm);
    if (!serviceIntervalManufacturerMonthsRef.current.trim() && svcMo) setServiceIntervalManufacturerMonths(svcMo);
    const oilKm = str(specs.oilchangeIntervalKm);
    const oilMo = str(specs.oilchangeIntervalMonths);
    if (!oilChangeIntervalKmRef.current.trim() && oilKm) setOilChangeIntervalKm(oilKm);
    if (!oilChangeIntervalMonthsRef.current.trim() && oilMo) setOilChangeIntervalMonths(oilMo);
    const parts: string[] = [];
    if (svcKm || svcMo) parts.push(`Service: ${[svcKm && `${svcKm} km`, svcMo && `${svcMo} months`].filter(Boolean).join(' / ')}`);
    if (oilKm || oilMo) parts.push(`Oil: ${[oilKm && `${oilKm} km`, oilMo && `${oilMo} months`].filter(Boolean).join(' / ')}`);
    const svcSummary = parts.join('; ') || str(specs.serviceIntervals);
    if (!serviceIntervalsRef.current.trim() && svcSummary) setServiceIntervals(svcSummary);

    if (provenance === 'mistral_live' || provenance === 'mistral_knowledge_only') {
      const chunk = buildAiFieldProvenanceFromSpecs(specs, {
        provenance,
        variantConfidence:
          typeof specs.variantConfidence === 'number' ? specs.variantConfidence : null,
      });
      aiFieldProvenanceRef.current = { ...aiFieldProvenanceRef.current, ...chunk };
    }
  };

  const handleFetchAi = () => {
    if (aiAbortRef.current) aiAbortRef.current.abort();
    const gen = ++aiGenerationRef.current;

    setAiLoading(true);
    setAiDegraded(false);
    setAiSteps([]);
    setAiErrorDetail('');
    setAiLiveStep('Verbindung zum KI-Agent...');

    const streamParams: Record<string, string | undefined> = {
      vin: vehicleIdentity.vin || undefined,
      make: vehicleIdentity.make || undefined,
      model: vehicleIdentity.model || undefined,
      year: vehicleIdentity.year ? String(vehicleIdentity.year) : undefined,
      fuelType: fuelType || undefined,
      powertrainType: dimoVehicle?.powertrainType ?? undefined,
    };
    if (dimoVehicle?.id) streamParams.dimoVehicleId = dimoVehicle.id;
    if (dimoVehicle?.tokenId != null) streamParams.tokenId = String(dimoVehicle.tokenId);
    if (organizationId) streamParams.organizationId = organizationId;
    if (isEditMode && existingVehicle?.id) streamParams.vehicleId = existingVehicle.id;

    const isStale = () => gen !== aiGenerationRef.current;

    const controller = streamAiSpecs(
      streamParams,
      (evt: AiSpecsStreamEvent) => {
        if (isStale()) return;
        switch (evt.event) {
          case 'step':
            setAiSteps(prev => {
              const existing = prev.findIndex(s => s.step === evt.data.step);
              if (existing >= 0) {
                const next = [...prev];
                next[existing] = evt.data;
                return next;
              }
              return [...prev, evt.data];
            });
            if (evt.data.status === 'working') {
              setAiLiveStep(evt.data.step + (evt.data.detail ? ` — ${evt.data.detail}` : ''));
            }
            break;
          case 'progress':
            setAiLiveStep(evt.data.content || 'Verarbeitung...');
            break;
          case 'result': {
            if (shouldApplyVehicleAiSpecsFromStreamResult(evt.data)) {
              applySpecs(evt.data.specs!, {
                provenance: resolveVehicleAiSpecsProvenance(evt.data),
              });
              if (evt.data.knowledgeOnlyFallback || evt.data.degraded) {
                setAiDegraded(true);
              }
            } else {
              setAiDegraded(true);
            }
            setAiLoading(false);
            break;
          }
          case 'error': {
            setAiDegraded(true);
            setAiErrorDetail(evt.data.message || 'Unbekannter Fehler');
            setAiLoading(false);
            break;
          }
        }
      },
      () => {
        if (!isStale()) setAiLoading(false);
      },
    );

    aiAbortRef.current = controller;
  };

  // Auto-start AI stream for new registrations with a known DIMO vehicle
  useEffect(() => {
    if (!isOpen || isEditMode || !dimoVehicle) {
      if (!isEditMode && !dimoVehicle) setAiLoading(false);
      return;
    }
    handleFetchAi();
    return () => { aiAbortRef.current?.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, isEditMode, dimoVehicle?.id]);

  // Cleanup AI tire spec countdown on unmount
  useEffect(() => {
    return () => {
      if (tireAiCountdownRef.current) clearInterval(tireAiCountdownRef.current);
      tireAiAbortRef.current?.abort();
    };
  }, []);

  const applyActiveMotionPhysicsReference = useCallback(
    (ref: {
      id: string;
      evidenceTier: 'ESTIMATED' | 'CONFIRMED' | 'VERIFIED';
      curbMassKg?: number | null;
      systemMotorPowerKw?: number | null;
      accel0To100S?: number | null;
      variantAssumption?: string | null;
      systemPowerDefinition?: string | null;
    }) => {
      setMotionPhysicsReferenceId(ref.id);
      setMotionPhysicsEvidenceTier(ref.evidenceTier);
      if (ref.curbMassKg != null) setCurbWeight(String(ref.curbMassKg));
      if (ref.systemMotorPowerKw != null) setSystemMotorPowerKw(String(ref.systemMotorPowerKw));
      if (ref.accel0To100S != null) setAccel0To100S(String(ref.accel0To100S));
      if (ref.variantAssumption) setMotionPhysicsVariantAssumption(ref.variantAssumption);
      if (ref.systemPowerDefinition) {
        const def = parseMotionSystemPowerDefinitionOption(ref.systemPowerDefinition);
        if (def) {
          setSystemPowerDefinition(def);
        }
      }
      motionPhysicsManualEditedRef.current = false;
      motionPhysicsPendingCreateSourceRef.current = null;
      motionPhysicsNoReferenceSessionBaselineRef.current = null;
      motionPhysicsLoadedBaselineRef.current =
        ref.evidenceTier === 'VERIFIED'
          ? null
          : snapshotMotionPhysicsFromActiveReference(ref);
      setMotionPhysicsSaveInfo('');
      setMotionPhysicsSyncError('');
    },
    [],
  );

  const snapshotMotionPhysicsBaselineFromVehicle = useCallback((vehicle: RegisteredVehicle) => {
    return snapshotMotionPhysicsFormFields({
      curbWeight: vehicle.curbWeight ?? '',
      systemMotorPowerKw: vehicle.systemMotorPowerKw ?? '',
      accel0To100S: vehicle.accel0To100S ?? '',
      variantAssumption: vehicle.motionPhysicsVariantAssumption ?? '',
      systemPowerDefinition: hydrateSystemPowerDefinitionFormState(
        undefined,
        vehicle.systemPowerDefinition,
      ),
    });
  }, []);

  useEffect(() => {
    if (!isOpen || !isEditMode || !existingVehicle?.id || !organizationId) {
      setMotionPhysicsReferenceId(null);
      setMotionPhysicsEvidenceTier(null);
      motionPhysicsPendingCreateSourceRef.current = null;
      motionPhysicsManualEditedRef.current = false;
      motionPhysicsLoadedBaselineRef.current = null;
      motionPhysicsNoReferenceSessionBaselineRef.current = null;
      setMotionPhysicsSaveInfo('');
      return;
    }

    const vehicleId = existingVehicle.id;
    let cancelled = false;

    setSystemPowerDefinition(
      hydrateSystemPowerDefinitionFormState(undefined, existingVehicle.systemPowerDefinition),
    );

    motionPhysicsNoReferenceSessionBaselineRef.current =
      snapshotMotionPhysicsBaselineFromVehicle(existingVehicle);

    api.vehicles.motionPhysicsReference
      .getActive(organizationId, vehicleId)
      .then((ref) => {
        if (cancelled) return;
        if (!ref) {
          setMotionPhysicsReferenceId(null);
          setMotionPhysicsEvidenceTier(null);
          motionPhysicsLoadedBaselineRef.current = null;
          return;
        }
        applyActiveMotionPhysicsReference(ref);
      })
      .catch((error) => {
        if (cancelled) return;
        setMotionPhysicsReferenceId(null);
        setMotionPhysicsEvidenceTier(null);
        motionPhysicsLoadedBaselineRef.current = null;
        setMotionPhysicsSyncError(
          formatMotionPhysicsUserErrorMessage(
            t('master.motionPhysics.activeReferenceLoadError'),
            error,
            MOTION_PHYSICS_SYNC_REASON_CODES.REFERENCE_RELOAD_FAILED,
          ),
        );
      });

    return () => {
      cancelled = true;
    };
  }, [
    isOpen,
    isEditMode,
    existingVehicle,
    organizationId,
    applyActiveMotionPhysicsReference,
    snapshotMotionPhysicsBaselineFromVehicle,
  ]);

  const motionPhysicsFormSnapshot = snapshotMotionPhysicsFormFields({
    curbWeight,
    systemMotorPowerKw,
    accel0To100S,
    variantAssumption: motionPhysicsVariantAssumption,
    systemPowerDefinition,
  });

  const motionPhysicsHasUnsavedManualEdits = hasUnconfirmedManualMotionPhysicsEdits({
    evidenceTier: motionPhysicsEvidenceTier,
    referenceId: motionPhysicsReferenceId,
    loadedReferenceBaseline: motionPhysicsLoadedBaselineRef.current,
    currentForm: motionPhysicsFormSnapshot,
  });

  const motionPhysicsRoutineSaveAtRisk = hasMotionPhysicsValuesAtRiskOnRoutineVehicleSave({
    evidenceTier: motionPhysicsEvidenceTier,
    referenceId: motionPhysicsReferenceId,
    loadedReferenceBaseline: motionPhysicsLoadedBaselineRef.current,
    noReferenceSessionBaseline: motionPhysicsNoReferenceSessionBaselineRef.current,
    currentForm: motionPhysicsFormSnapshot,
    pendingCreateSource: motionPhysicsPendingCreateSourceRef.current,
    manualMotionEdited: motionPhysicsManualEditedRef.current,
  });

  const canConfirmAiEstimateReference = canConfirmEstimatedAiMotionReference({
    evidenceTier: motionPhysicsEvidenceTier,
    referenceId: motionPhysicsReferenceId,
    loadedReferenceBaseline: motionPhysicsLoadedBaselineRef.current,
    currentForm: motionPhysicsFormSnapshot,
  });

  const motionPhysicsFieldsDisabled = isMotionPhysicsReferenceReadOnly(motionPhysicsEvidenceTier);

  const motionPhysicsPowerHintKey =
    systemPowerDefinition === 'OEM_RATED_MOTOR_KW'
      ? 'master.motionPhysics.systemMotorPowerKw.hintMotor'
      : systemPowerDefinition === 'OEM_RATED_SYSTEM_KW' ||
          systemPowerDefinition === 'OEM_RATED_SYSTEM_KW_ESTIMATED'
        ? 'master.motionPhysics.systemMotorPowerKw.hintSystem'
        : 'master.motionPhysics.systemPowerDefinition.hint';

  const handleConfirmManualMotionReference = async () => {
    if (
      !organizationId ||
      !existingVehicle?.id ||
      motionPhysicsManualConfirming ||
      !canConfirmManualMotionValues(motionPhysicsEvidenceTier)
    ) {
      return;
    }
    const hasMotionValues = hasMotionPhysicsFormValues({
      curbWeight,
      systemMotorPowerKw,
      accel0To100S,
      variantAssumption: motionPhysicsVariantAssumption,
      systemPowerDefinition,
    });
    if (!hasMotionValues) return;

    const createBody = buildMotionPhysicsReferenceCreateBody({
      curbWeight,
      systemMotorPowerKw,
      accel0To100S,
      variantAssumption: motionPhysicsVariantAssumption,
      systemPowerDefinition,
      source: 'MANUAL_ENTRY',
      manualOperatorConfirm: true,
    });
    const payloadError = validateMotionPhysicsReferenceCreatePayload(createBody);
    if (payloadError) {
      setMotionPhysicsSyncError(
        `${t('master.motionPhysics.manualConfirmError')} (${payloadError})`,
      );
      return;
    }

    setMotionPhysicsManualConfirming(true);
    setMotionPhysicsSyncError('');
    try {
      const created = await api.vehicles.motionPhysicsReference.create(
        organizationId,
        existingVehicle.id,
        createBody,
      );

      let reloaded: Awaited<ReturnType<typeof api.vehicles.motionPhysicsReference.getActive>> = null;
      try {
        reloaded = await api.vehicles.motionPhysicsReference.getActive(
          organizationId,
          existingVehicle.id,
        );
      } catch {
        reloaded = null;
      }

      if (reloaded) {
        applyActiveMotionPhysicsReference(reloaded);
      } else {
        applyActiveMotionPhysicsReference(
          mergeMotionPhysicsReferenceFromCreateResponse(created, {
            curbWeight,
            systemMotorPowerKw,
            accel0To100S,
            variantAssumption: motionPhysicsVariantAssumption,
            systemPowerDefinition,
          }),
        );
        setMotionPhysicsSaveInfo(
          `${t('master.motionPhysics.manualConfirmReloadWarning')} (${MOTION_PHYSICS_SYNC_REASON_CODES.REFERENCE_RELOAD_FAILED})`,
        );
      }
    } catch (error) {
      setMotionPhysicsSyncError(
        formatMotionPhysicsUserErrorMessage(
          t('master.motionPhysics.manualConfirmError'),
          error,
          MOTION_PHYSICS_SYNC_REASON_CODES.REFERENCE_CONFIRM_FAILED,
        ),
      );
    } finally {
      setMotionPhysicsManualConfirming(false);
    }
  };

  const handleConfirmMotionReference = async () => {
    if (!motionPhysicsReferenceId || !organizationId || !existingVehicle?.id || motionPhysicsConfirming) return;
    if (!canConfirmAiEstimateReference) {
      setMotionPhysicsSyncError(t('master.motionPhysics.confirmAiEstimateBlockedHint'));
      return;
    }
    setMotionPhysicsConfirming(true);
    setMotionPhysicsSyncError('');
    try {
      const updated = await api.vehicles.motionPhysicsReference.confirm(
        organizationId,
        existingVehicle.id,
        motionPhysicsReferenceId,
      );
      setMotionPhysicsEvidenceTier(updated.evidenceTier);
      motionPhysicsManualEditedRef.current = false;
      motionPhysicsLoadedBaselineRef.current = null;
      setMotionPhysicsSaveInfo('');
    } catch {
      setAiErrorDetail(t('master.motionPhysics.confirmError'));
    } finally {
      setMotionPhysicsConfirming(false);
    }
  };

  const syncMotionPhysicsReferenceAfterSave = async (vehicleId: string, orgId: string) => {
    const hasMotionValues = hasMotionPhysicsFormValues({
      curbWeight,
      systemMotorPowerKw,
      accel0To100S,
      variantAssumption: motionPhysicsVariantAssumption,
      systemPowerDefinition,
    });
    if (
      !shouldSyncMotionPhysicsReferenceOnSave({
        evidenceTier: motionPhysicsEvidenceTier,
        referenceId: motionPhysicsReferenceId,
        pendingCreateSource: motionPhysicsPendingCreateSourceRef.current,
        hasMotionValues,
        manualMotionEdited: motionPhysicsManualEditedRef.current,
      })
    ) {
      return;
    }
    const source = motionPhysicsReferenceSourceForSave(motionPhysicsPendingCreateSourceRef.current);
    if (!source) return;

    const created = await api.vehicles.motionPhysicsReference.create(
      orgId,
      vehicleId,
      buildMotionPhysicsReferenceCreateBody({
        curbWeight,
        systemMotorPowerKw,
        accel0To100S,
        variantAssumption: motionPhysicsVariantAssumption,
        systemPowerDefinition,
        source,
      }),
    );
    setMotionPhysicsReferenceId(created.id);
    setMotionPhysicsEvidenceTier(created.evidenceTier);
    motionPhysicsPendingCreateSourceRef.current = null;
    setMotionPhysicsSyncError('');
  };

  // Check HM Health availability when modal opens with a known VIN
  useEffect(() => {
    const vin = vehicleIdentity.vin?.trim();
    if (!isOpen || !vin) { setHmAvailability(null); return; }
    setHmAvailabilityLoading(true);
    api.highMobility.checkAvailability(vin)
      .then(res => {
        setHmAvailability(res);
        if (res.isLinked) setHmActivated(true);
      })
      .catch(() => setHmAvailability(null))
      .finally(() => setHmAvailabilityLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, vehicleIdentity.vin]);

  const tireAiCanFetch = !!(
    tireFrontBrandModel.trim() &&
    tireFrontDimension.trim() &&
    tireFrontLoadIndex.trim() &&
    tireFrontSpeedIndex.trim() &&
    vehicleIdentity.year
  );

  const handleFetchTireAi = useCallback(() => {
    if (tireAiAbortRef.current) tireAiAbortRef.current.abort();
    if (tireAiCountdownRef.current) clearInterval(tireAiCountdownRef.current);

    setTireAiLoading(true);
    setTireAiResult(null);
    setTireAiError('');
    setTireAiSteps([]);
    setTireAiCountdown(60);
    setTireAiResultExpanded(false);

    const interval = setInterval(() => {
      setTireAiCountdown(prev => {
        if (prev <= 1) { clearInterval(interval); return 0; }
        return prev - 1;
      });
    }, 1000);
    tireAiCountdownRef.current = interval;

    const brandParts = tireFrontBrandModel.trim().split(/\s+/);
    const brand = brandParts[0] || '';
    const model = brandParts.slice(1).join(' ') || '';

    const controller = streamAiTireSpecs(
      {
        brand,
        model,
        year: String(vehicleIdentity.year || ''),
        tireSize: tireFrontDimension.trim(),
        loadIndex: tireFrontLoadIndex.trim(),
        speedIndex: tireFrontSpeedIndex.trim(),
      },
      (evt: AiTireSpecsStreamEvent) => {
        switch (evt.event) {
          case 'step':
            setTireAiSteps(prev => {
              const idx = prev.findIndex(s => s.step === evt.data.step);
              if (idx >= 0) { const n = [...prev]; n[idx] = evt.data; return n; }
              return [...prev, evt.data];
            });
            break;
          case 'progress':
            break;
          case 'result': {
            if (tireAiCountdownRef.current) clearInterval(tireAiCountdownRef.current);
            setTireAiCountdown(0);
            if (evt.data.success && evt.data.specs) {
              setTireAiResult(evt.data.specs);
              setTireAiResultExpanded(true);
            } else {
              setTireAiError('AI Tire Spec konnte nicht abgerufen werden.');
            }
            setTireAiLoading(false);
            break;
          }
          case 'error': {
            if (tireAiCountdownRef.current) clearInterval(tireAiCountdownRef.current);
            setTireAiCountdown(0);
            setTireAiError(evt.data.message || 'Unbekannter Fehler');
            setTireAiLoading(false);
            break;
          }
        }
      },
      () => {
        if (tireAiCountdownRef.current) clearInterval(tireAiCountdownRef.current);
        setTireAiLoading(false);
      },
    );

    tireAiAbortRef.current = controller;
  }, [tireFrontBrandModel, tireFrontDimension, tireFrontLoadIndex, tireFrontSpeedIndex, vehicleIdentity.year]);

  const applyZb1PatchToRegistrationForm = useCallback((patch: Zb1RegistrationFormPatch) => {
    if (patch.engineDisplacementCc != null) {
      setEngineDisplacementCc(patch.engineDisplacementCc);
    }
    if (patch.fuelType != null) {
      setFuelType(patch.fuelType);
    }
    if (patch.curbWeight != null) {
      setCurbWeight(patch.curbWeight);
    }
  }, []);

  const zb1RegistrationFormCurrent = {
    engineDisplacementCc,
    fuelType,
    curbWeight,
  };

  const toggleSection = (s: string) => setExpandedSections(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);

  if (!isOpen) return null;

  const inputClass = 'w-full px-3 py-2 rounded-xl border text-sm transition-colors outline-none bg-background border-border/50 text-foreground focus:border-brand placeholder:text-muted-foreground';
  const labelClass = `block text-xs font-semibold mb-1 text-muted-foreground`;
  const aiTag = <span className={`inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-md ml-1 ${isDarkMode ? 'bg-purple-500/15 text-purple-400' : 'bg-purple-50 text-purple-600'}`}><Sparkles className="w-2.5 h-2.5" />AI</span>;
  const sectionHeader = (id: string, num: string, title: string, icon?: React.ReactNode) => (
    <button onClick={() => toggleSection(id)} className={`w-full flex items-center gap-3 py-3 px-1 transition-colors ${isDarkMode ? 'hover:surface-premium' : 'hover:bg-muted'}`}>
      <span className={`w-6 h-6 rounded-lg flex items-center justify-center text-[11px] font-bold shrink-0 ${isDarkMode ? 'bg-status-info-soft text-status-info' : 'bg-status-info-soft text-status-info'}`}>{num}</span>
      {icon}
      <span className={`text-sm font-semibold flex-1 text-left text-foreground`}>{title}</span>
      {expandedSections.includes(id) ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
    </button>
  );

  const orgName = organizations.find(o => o.id === organizationId)?.company_name || '';

  const buildVehicle = (): RegisteredVehicle => {
    const lvBattery = resolveRegistrationLvBatteryForSubmit({
      typeRaw: batteryType,
      ampereRaw: batteryAmpere,
      voltRaw: batteryVolt,
    });
    return {
    id: isEditMode ? existingVehicle.id : generateId('rv'),
    vehicleName: `${vehicleIdentity.make} ${vehicleIdentity.model}`,
    vin: vehicleIdentity.vin,
    make: vehicleIdentity.make,
    model: vehicleIdentity.model,
    year: vehicleIdentity.year,
    organizationId,
    organizationName: orgName,
    station,
    status: isEditMode ? existingVehicle.status : 'Available' as const,
    health: isEditMode ? existingVehicle.health : 'Good' as const,
    lastSignal: isEditMode ? existingVehicle.lastSignal : (dimoVehicle?.lastSignal ?? ''),
    online: isEditMode ? existingVehicle.online : (dimoVehicle?.connectionStatus === 'Connected' || false),
    fuelType,
    electrificationLevel:
      deriveElectrificationLevelReadOnly({ fuelType }) ??
      (electrificationLevel.trim() || undefined),
    mileage: vehicleIdentity.odometer, licensePlate, vehicleType, operationalStatus, notes,
    batteryType: lvBattery.canonical ?? lvBattery.legacyRaw ?? '',
    batteryAmpere, batteryVolt,
    lvBatteryChemistry: undefined,
    hvBatteryCapacityKwh, hvBatteryPresent, hvBatteryChemistry, hvBatteryCellFormat,
    hvBatteryGrossCapacityKwh, hvBatteryUsableCapacityKwh, hvBatteryNominalVoltage,
    hvBatteryArchitecture, hvBatteryThermalManagement,
    hvBatteryWarrantyYears, hvBatteryWarrantyKm,
    acOnboardChargerKw,     dcFastChargeMaxKw,
    hvMasterSpecificationCatalogVariantKey:
      hvMasterSpecificationCatalogVariantKey.trim() || null,
    tankCapacityLiters,
    engineDisplacementCc, cylinderCount,
    tireFrontDimension, tireFrontBrandModel, tireFrontSeason, tireFrontDot, tireFrontLoadIndex, tireFrontSpeedIndex,
    tireBackDimension, tireBackBrandModel, tireBackSeason, tireBackDot, tireBackLoadIndex, tireBackSpeedIndex,
    treadDepthFL, treadDepthFR, treadDepthBL, treadDepthBR, tireCondition,
    aiTireSpec: tireAiResult || undefined,
    brakeFrontRotorDiameter, brakeFrontRotorWidth, brakeFrontPadThickness,
    brakeBackRotorDiameter, brakeBackRotorWidth, brakeBackPadThickness,
    idleRpm, maxRpm, drivetrain, brakeForceDistribution, frontToRearWeightDistribution,
    curbWeight,
    systemMotorPowerKw,
    accel0To100S,
    motionPhysicsVariantAssumption,
    serviceIntervals,
    serviceIntervalManufacturerKm, serviceIntervalManufacturerMonths,
    oilChangeIntervalKm, oilChangeIntervalMonths,
    lastTuev, lastBokraft, lastInspection, lastOilChange, lastBrakePadChange, lastBrakeRotorChange,
    hardwareType,
    aiFieldProvenance:
      Object.keys(aiFieldProvenanceRef.current).length > 0
        ? aiFieldProvenanceRef.current
        : undefined,
    };
  };

  const handleSubmit = async () => {
    if (!organizationId || submitting) return;
    setBatteryValidationError(null);
    const lvBattery = resolveRegistrationLvBatteryForSubmit({
      typeRaw: batteryType,
      ampereRaw: batteryAmpere,
      voltRaw: batteryVolt,
    });
    if (lvBattery.validationError) {
      setBatteryValidationError(t(`master.registration.lvBatteryType.${lvBattery.validationError}`));
      return;
    }
    setSubmitting(true);
    setMotionPhysicsSaveInfo('');
    const rv = buildVehicle();
    const motionPhysicsBlockedAfterSave = motionPhysicsRoutineSaveAtRisk;
    try {
      if (isEditMode && onUpdate) {
        await Promise.resolve(onUpdate(rv));
        if (organizationId && rv.id) {
          try {
            await syncMotionPhysicsReferenceAfterSave(rv.id, organizationId);
          } catch (error) {
            setMotionPhysicsSyncError(
              formatMotionPhysicsUserErrorMessage(
                t('master.motionPhysics.backfillError'),
                error,
                MOTION_PHYSICS_SYNC_REASON_CODES.REFERENCE_CREATE_FAILED,
              ),
            );
            return;
          }
        }
        if (motionPhysicsBlockedAfterSave) {
          setMotionPhysicsSaveInfo(
            `${t('master.motionPhysics.unsavedAfterVehicleSave')} (${MOTION_PHYSICS_SYNC_REASON_CODES.ROUTINE_SAVE_REFERENCE_FIELDS_NOT_PERSISTED})`,
          );
          return;
        }
      } else {
        await Promise.resolve(onRegister(rv));
        // V4.7.50 — flush buffered exterior photos (best-effort) once we
        // know the new vehicleId. We use the locally-generated id from
        // `buildVehicle()`; if the parent persisted under a different id
        // this will silently no-op for failed uploads, which the user can
        // re-do later from PlatformVehiclesView → Exterior Photos.
        if (bufferedExteriorImages.length > 0 && rv.id) {
          await flushBufferedExteriorImages(rv.id, bufferedExteriorImages);
        }
      }
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  const toggleHmSignal = (id: string) => setHmSignals(prev => ({ ...prev, [id]: !prev[id] }));
  const toggleAllHmSignals = (on: boolean) => setHmSignals(Object.fromEntries(HIGH_MOBILITY_SIGNALS.map(s => [s.id, on])));
  const lvBatteryForm = resolveRegistrationLvBatteryFormState(batteryType);

  return (
    <div
      className="overlay-scrim fixed inset-0 z-[100] flex flex-col sm:items-center sm:justify-center sm:overflow-y-auto sm:px-4 sm:py-6"
      data-testid="vehicle-registration-modal-scrim"
      role="dialog"
      aria-modal="true"
    >
      <div
        className={`flex min-h-0 w-full max-w-3xl flex-col border surface-solid border-border sm:mx-auto sm:max-h-[calc(100dvh-3rem)] sm:h-auto h-[100dvh] max-h-[100dvh] pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]`}
        data-testid="vehicle-registration-modal-panel"
      >

        {/* ── Header ── */}
        <div className={`flex shrink-0 items-center justify-between px-4 sm:px-8 py-4 sm:py-5 border-b ${isDarkMode ? 'border-neutral-800' : 'border-border'}`}>
          <div className="flex items-center gap-3">
            {isEditMode && <Pencil className={`w-5 h-5 ${isDarkMode ? 'text-status-info' : 'text-status-info'}`} />}
            <div>
              <h2 className={`text-xl font-bold text-foreground`}>
                {isEditMode ? 'Edit Registered Vehicle' : 'Register Vehicle'}
              </h2>
              <p className={`text-sm mt-0.5 text-muted-foreground`}>
                {vehicleIdentity.make} {vehicleIdentity.model} {vehicleIdentity.year}
              </p>
            </div>
          </div>
          <button onClick={onClose} className={`p-2 transition-colors ${isDarkMode ? 'hover:surface-premium text-muted-foreground' : 'hover:bg-muted text-muted-foreground'}`}><X className="w-5 h-5" /></button>
        </div>

        {/* ── AI Agent — prominent status panel + Fetch AI button ── */}
        <div className={`shrink-0 px-4 sm:px-8 py-4 border-b ${
          aiLoading
            ? (isDarkMode ? 'bg-purple-950/40 border-purple-800/40' : 'bg-gradient-to-r from-purple-50 to-indigo-50 border-purple-200/40')
            : aiDegraded
              ? (isDarkMode ? 'bg-amber-950/30 border-amber-800/30' : 'bg-gradient-to-r from-amber-50/80 to-orange-50/60 border-amber-200/40')
              : !aiLoading && aiSteps.length > 0
                ? (isDarkMode ? 'bg-emerald-950/30 border-emerald-800/30' : 'bg-gradient-to-r from-emerald-50/80 to-green-50/60 border-emerald-200/40')
                : (isDarkMode ? 'surface-premium border-neutral-700/50' : 'bg-gradient-to-r from-purple-50/60 to-indigo-50/60 border-purple-200/30')
        }`}>

          {/* ── Row 1: Status badge + spec actions (AI fetch, ZB-I upload) ── */}
          <div
            className="flex items-center justify-between"
            data-testid="vehicle-registration-spec-actions"
          >
            <div className="flex items-center gap-3">
              {/* Animated status indicator */}
              <div className={`relative w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                aiLoading
                  ? (isDarkMode ? 'bg-purple-500/20' : 'bg-purple-100')
                  : aiDegraded
                    ? (isDarkMode ? 'bg-amber-500/20' : 'bg-amber-100')
                    : aiSteps.length > 0
                      ? (isDarkMode ? 'bg-emerald-500/20' : 'bg-emerald-100')
                      : 'bg-muted'
              }`}>
                {aiLoading && (
                  <span className="absolute inset-0 rounded-xl animate-ping opacity-30 bg-purple-500" />
                )}
                {aiLoading
                  ? <Loader2 className="w-4.5 h-4.5 text-purple-500 animate-spin" />
                  : aiDegraded
                    ? <AlertCircle className="w-4.5 h-4.5 text-amber-500" />
                    : aiSteps.length > 0
                      ? <CheckCircle2 className="w-4.5 h-4.5 text-emerald-500" />
                      : <Bot className="w-4.5 h-4.5 text-purple-500" />
                }
              </div>

              <div>
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-bold text-foreground`}>DIMO AI Agent</span>
                  {/* Status pill */}
                  <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                    aiLoading
                      ? (isDarkMode ? 'bg-purple-500/20 text-purple-400' : 'bg-purple-100 text-purple-700')
                      : aiDegraded
                        ? (isDarkMode ? 'bg-amber-500/20 text-amber-400' : 'bg-amber-100 text-amber-700')
                        : aiSteps.length > 0
                          ? (isDarkMode ? 'bg-emerald-500/20 text-emerald-400' : 'bg-emerald-100 text-emerald-700')
                          : 'bg-muted text-muted-foreground'
                  }`}>
                    {aiLoading && <span className="relative flex h-1.5 w-1.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-purple-500 opacity-75" /><span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-purple-500" /></span>}
                    {!aiLoading && aiDegraded && <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />}
                    {!aiLoading && !aiDegraded && aiSteps.length > 0 && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />}
                    {!aiLoading && !aiDegraded && aiSteps.length === 0 && <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />}
                    {aiLoading ? 'Arbeitet' : aiDegraded ? 'Fehler' : aiSteps.length > 0 ? 'Fertig' : 'Bereit'}
                  </span>
                </div>
                <p className={`text-xs mt-0.5 text-muted-foreground`}>
                  {aiLoading
                    ? 'Der KI-Agent ruft Fahrzeugspezifikationen ab…'
                    : aiDegraded
                      ? 'Die KI-Anreicherung konnte nicht abgeschlossen werden.'
                      : aiSteps.length > 0
                        ? 'Fahrzeugdaten wurden erfolgreich geladen.'
                        : 'Fahrzeugdaten per KI-Agent automatisch ausfüllen.'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {isEditMode && existingVehicle?.id && organizationId ? (
                isVehicleIdentityP2Enabled() ? (
                  <button
                    type="button"
                    data-testid="vehicle-registration-upload-zb1"
                    onClick={() => setZb1DialogOpen(true)}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all border ${
                      isDarkMode
                        ? 'border-border/60 text-foreground hover:bg-muted/80'
                        : 'border-border bg-white/80 text-foreground hover:bg-white shadow-sm'
                    }`}
                  >
                    <FileText className="w-3.5 h-3.5" />
                    {t('master.vehicleIdentity.uploadToolbar' as never)}
                  </button>
                ) : (
                  <button
                    type="button"
                    data-testid="vehicle-registration-upload-zb1-disabled"
                    disabled
                    title={t('master.vehicleIdentity.p2ToolbarDisabledHint' as never)}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border opacity-50 cursor-not-allowed border-border/60 text-muted-foreground"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    {t('master.vehicleIdentity.uploadToolbar' as never)}
                  </button>
                )
              ) : null}
              {isEditMode && existingVehicle?.id && organizationId ? (
                <button
                  type="button"
                  data-testid="vehicle-registration-oneauto-api"
                  onClick={() => setOneAutoDialogOpen(true)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all border ${
                    isDarkMode
                      ? 'border-border/60 text-foreground hover:bg-muted/80'
                      : 'border-border bg-white/80 text-foreground hover:bg-white shadow-sm'
                  }`}
                >
                  <Cloud className="w-3.5 h-3.5" />
                  {t('master.oneAuto.buttonLabel' as never)}
                </button>
              ) : null}
              <button
                type="button"
                data-testid="vehicle-registration-fetch-ai-specs"
                onClick={handleFetchAi}
                disabled={aiLoading || (!vehicleIdentity.vin && !vehicleIdentity.make)}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold transition-all shrink-0 ${
                  aiLoading || (!vehicleIdentity.vin && !vehicleIdentity.make)
                    ? 'opacity-50 cursor-not-allowed'
                    : 'hover:shadow-md hover:scale-[1.02] active:scale-[0.98]'
                } ${isDarkMode ? 'bg-purple-600/80 text-purple-100 hover:bg-purple-600' : 'bg-gradient-to-br from-purple-500 to-indigo-600 text-white shadow-sm'}`}
              >
                {aiLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                {aiLoading ? 'AI lädt…' : aiSteps.length > 0 || aiDegraded ? 'Erneut abrufen' : 'Fetch AI Specs'}
              </button>
            </div>
          </div>

          {/* ── Progress bar ── */}
          {(aiLoading || (!aiLoading && !aiDegraded && aiSteps.length > 0)) && (() => {
            const totalSteps = 4;
            const doneSteps = aiSteps.filter(s => s.status === 'done').length;
            const pct = aiLoading
              ? Math.max(8, Math.min(92, Math.round((doneSteps / totalSteps) * 85) + (aiSteps.some(s => s.status === 'working') ? 12 : 5)))
              : 100;
            const barColor = !aiLoading ? (isDarkMode ? 'bg-emerald-500' : 'bg-emerald-500') : (isDarkMode ? 'bg-purple-500/80' : 'bg-purple-500');
            const trackColor = !aiLoading ? (isDarkMode ? 'bg-emerald-900/30' : 'bg-emerald-100') : (isDarkMode ? 'bg-purple-900/40' : 'bg-purple-100');
            return (
              <div className={`mt-3 h-1.5 rounded-full overflow-hidden ${trackColor}`}>
                <div className={`h-full rounded-full transition-all duration-700 ease-out ${barColor}`} style={{ width: `${pct}%` }} />
              </div>
            );
          })()}

          {/* ── Live activity feed (while loading) ── */}
          {aiLoading && aiLiveStep && (
            <div className={`mt-3 flex items-center gap-2 px-3 py-2 rounded-xl ${isDarkMode ? 'bg-purple-900/20 border border-purple-800/30' : 'bg-white/60 border border-purple-200/40'}`}>
              <Loader2 className="w-3.5 h-3.5 text-purple-500 animate-spin shrink-0" />
              <span className={`text-xs font-medium truncate ${isDarkMode ? 'text-purple-300' : 'text-purple-700'}`}>{aiLiveStep}</span>
            </div>
          )}

          {/* ── Pipeline steps (visible when steps exist) ── */}
          {aiSteps.length > 0 && (
            <div className={`mt-3 border overflow-hidden ${isDarkMode ? 'surface-premium/30 border-neutral-700/40' : 'bg-white/50 border-border/40'}`}>
              {aiSteps.map((s, i) => (
                <div key={i} className={`flex items-center gap-2.5 px-3 py-1.5 ${i > 0 ? (isDarkMode ? 'border-t border-neutral-700/30' : 'border-t border-border') : ''}`}>
                  {s.status === 'done' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />}
                  {s.status === 'error' && <XCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />}
                  {s.status === 'skipped' && <AlertCircle className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
                  {s.status === 'working' && <Loader2 className="w-3.5 h-3.5 text-purple-500 animate-spin shrink-0" />}
                  <span className={`text-xs font-medium flex-1 ${isDarkMode ? 'text-muted-foreground' : 'text-foreground'}`}>{s.step}</span>
                  {s.detail && <span className={`text-[10px] shrink-0 ${s.status === 'error' ? 'text-red-500' : 'text-muted-foreground'}`}>{s.detail}</span>}
                </div>
              ))}
            </div>
          )}

          {/* ── Error detail (when degraded / failed) ── */}
          {!aiLoading && aiDegraded && (
            <div className={`mt-3 flex items-start gap-2.5 px-3 py-2.5 rounded-xl ${isDarkMode ? 'bg-amber-900/20 border border-amber-800/30' : 'bg-amber-50/80 border border-amber-200/40'}`}>
              <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <div>
                <p className={`text-xs font-medium ${isDarkMode ? 'text-amber-400' : 'text-amber-700'}`}>
                  KI-Anreicherung nicht verfügbar — Formular soweit möglich mit lokalen Daten vorausgefüllt.
                </p>
                {aiErrorDetail && (
                  <p className={`text-[10px] mt-0.5 ${isDarkMode ? 'text-amber-500/60' : 'text-amber-600/60'}`}>{aiErrorDetail}</p>
                )}
              </div>
            </div>
          )}

          {/* ── Success summary (when completed) ── */}
          {!aiLoading && !aiDegraded && aiSteps.length > 0 && (
            <div className={`mt-3 flex items-center gap-2.5 px-3 py-2 rounded-xl ${isDarkMode ? 'bg-emerald-900/20 border border-emerald-800/30' : 'bg-emerald-50/80 border border-emerald-200/40'}`}>
              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
              <span className={`text-xs font-medium ${isDarkMode ? 'text-emerald-400' : 'text-emerald-700'}`}>
                Alle Felder mit {aiTag} wurden automatisch ausgefüllt. Du kannst die Werte manuell anpassen.
              </span>
            </div>
          )}
        </div>

        <div
          className="min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-y-contain touch-pan-y px-4 sm:px-8 py-5 [-webkit-overflow-scrolling:touch]"
          data-testid="vehicle-registration-modal-scroll"
          style={{ scrollbarWidth: 'thin' }}
        >

          {isManualCreate && !isEditMode ? (
            <div className="mb-4 rounded-xl border border-border bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
              <p className="font-medium text-foreground">{t('master.cv.addVehicle.manualBaselineTitle')}</p>
              <p className="mt-1">{t('master.cv.addVehicle.manualBaselineHint')}</p>
              <p className="mt-1">{t('master.cv.addVehicle.manualServiceHistoryUnavailable')}</p>
            </div>
          ) : null}

          {/* ═══════════════════════════════════════════════
              SECTION 0 — Vehicle Identity (read-only)
             ═══════════════════════════════════════════════ */}
          <div className={`p-4 border mb-4 ${isDarkMode ? 'surface-premium/30 border-neutral-700/40' : 'bg-muted/80 border-border/40'}`}>
            <div className="flex items-center gap-2 mb-3">
              <span className={`w-6 h-6 rounded-lg flex items-center justify-center text-[11px] font-bold bg-muted text-muted-foreground`}>ID</span>
              <span className={`text-sm font-semibold text-foreground`}>Vehicle Identity</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-medium bg-muted text-muted-foreground`}>
                {isEditMode ? 'From Registration' : isManualCreate ? 'Manual entry' : 'From DIMO'}
              </span>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
              <div>
                <label className={labelClass}>VIN</label>
                <input
                  value={vehicleIdentity.vin}
                  readOnly={!isManualCreate}
                  onChange={(e) => isManualCreate && setManualVin(e.target.value)}
                  className={`${inputClass} ${!isManualCreate ? 'opacity-60 cursor-not-allowed' : ''} font-mono text-xs`}
                />
              </div>
              <div>
                <label className={labelClass}>Make</label>
                <input
                  value={vehicleIdentity.make}
                  readOnly={!isManualCreate}
                  onChange={(e) => isManualCreate && setManualMake(e.target.value)}
                  className={`${inputClass} ${!isManualCreate ? 'opacity-60 cursor-not-allowed' : ''}`}
                />
              </div>
              <div>
                <label className={labelClass}>Model</label>
                <input
                  value={vehicleIdentity.model}
                  readOnly={!isManualCreate}
                  onChange={(e) => isManualCreate && setManualModel(e.target.value)}
                  className={`${inputClass} ${!isManualCreate ? 'opacity-60 cursor-not-allowed' : ''}`}
                />
              </div>
              <div>
                <label className={labelClass}>Year</label>
                <input
                  value={vehicleIdentity.year}
                  readOnly={!isManualCreate}
                  onChange={(e) => isManualCreate && setManualYear(Number(e.target.value) || 0)}
                  className={`${inputClass} ${!isManualCreate ? 'opacity-60 cursor-not-allowed' : ''}`}
                  type={isManualCreate ? 'number' : 'text'}
                />
              </div>
              <div>
                <label className={labelClass}>Odometer</label>
                {isManualCreate ? (
                  <input
                    value={manualOdometer}
                    onChange={(e) => setManualOdometer(Number(e.target.value) || 0)}
                    className={inputClass}
                    type="number"
                    min={0}
                  />
                ) : (
                  <input
                    value={`${(vehicleIdentity.odometer ?? 0).toLocaleString()} km`}
                    readOnly
                    className={`${inputClass} opacity-60 cursor-not-allowed`}
                  />
                )}
              </div>
            </div>
          </div>

          {isEditMode && existingVehicle && organizationId && isVehicleIdentityP2Enabled() ? (
            <div className={`p-4 border mb-4 ${isDarkMode ? 'surface-premium/30 border-neutral-700/40' : 'bg-muted/80 border-border/40'}`}>
              <VehicleIdentityP2Panel
                isDarkMode={isDarkMode}
                organizationId={organizationId}
                vehicleId={existingVehicle.id}
                hideDocumentUpload
                registrationFormCurrent={zb1RegistrationFormCurrent}
                onApplyToRegistrationForm={applyZb1PatchToRegistrationForm}
              />
            </div>
          ) : null}

          {/* ═══════════════════════════════════════════════
              SECTION 1 — Assignment & Operations
             ═══════════════════════════════════════════════ */}
          {sectionHeader('assignment', '1', 'Assignment & Operations')}
          {expandedSections.includes('assignment') && (
            <div className="grid grid-cols-2 gap-3 pl-1 pb-3">
              <div>
                <label className={labelClass}>Organization *</label>
                <select value={organizationId} onChange={e => setOrganizationId(e.target.value)} className={inputClass} disabled={isEditMode}>
                  <option value="">Select…</option>
                  {organizations.filter(o => o.status === 'Active' || o.status === 'Trial').map(o => <option key={o.id} value={o.id}>{o.company_name}</option>)}
                </select>
              </div>
              <div><label className={labelClass}>Station</label><input value={station} onChange={e => setStation(e.target.value)} placeholder="e.g. Berlin Hbf" className={inputClass} /></div>
              <div><label className={labelClass}>License Plate</label><input value={licensePlate} onChange={e => setLicensePlate(e.target.value)} placeholder="e.g. B AB 1234" className={inputClass} /></div>
              <div>
                <label className={labelClass}>Fuel Type</label>
                <select value={fuelType} onChange={e => setFuelType(e.target.value)} className={inputClass}>
                  <option value="Electric">Electric</option><option value="Gasoline">Gasoline</option><option value="Diesel">Diesel</option>
                  <option value="Hybrid">Hybrid</option><option value="Plugin Hybrid">Plugin Hybrid</option><option value="Other">Other</option>
                </select>
              </div>
              <div>
                <label className={labelClass}>Vehicle Type</label>
                <select value={vehicleType} onChange={e => setVehicleType(e.target.value)} className={inputClass}>
                  <option value="SEDAN">Sedan</option><option value="SUV">SUV</option><option value="HATCHBACK">Hatchback</option>
                  <option value="WAGON">Wagon</option><option value="VAN">Van</option><option value="TRUCK">Truck</option>
                  <option value="COUPE">Sports / Coupé</option><option value="MINIVAN">Minivan</option><option value="OTHER">Other</option>
                </select>
              </div>
              <div>
                <label className={labelClass}>Operational Status</label>
                <select value={operationalStatus} onChange={e => setOperationalStatus(e.target.value)} className={inputClass}>
                  <option>Active</option><option>Inactive</option><option>Pending Setup</option>
                </select>
              </div>
              <div className="col-span-2"><label className={labelClass}>Notes</label><textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} className={inputClass} placeholder="Optional notes…" /></div>
            </div>
          )}

          {/* ═══════════════════════════════════════════════
              SECTION 2 — Technical Vehicle Data
             ═══════════════════════════════════════════════ */}
          {sectionHeader('technical', '2', 'Technical Vehicle Data')}
          {expandedSections.includes('technical') && (
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 pl-1 pb-3">
              <div>
                <label className={labelClass}>Drivetrain {aiTag}</label>
                <select value={drivetrain} onChange={e => setDrivetrain(e.target.value)} className={inputClass}>
                  <option value="">Unknown</option><option value="FWD">FWD</option><option value="RWD">RWD</option><option value="AWD">AWD</option><option value="4WD">4WD</option>
                </select>
              </div>
              <div><label className={labelClass}>Curb Weight (kg) {aiTag}</label><input value={curbWeight} onChange={e => { noteMotionPhysicsManualEdit(); setCurbWeight(e.target.value); }} className={inputClass} placeholder="e.g. 1500" disabled={motionPhysicsFieldsDisabled} /></div>
              <div className="col-span-2 lg:col-span-3 border-t border-border/40 pt-3 mt-1">
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <span className={`text-xs font-bold text-muted-foreground`}>{t('master.motionPhysics.sectionTitle')}</span>
                  {motionPhysicsEvidenceTier && (
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md ${
                      motionPhysicsEvidenceTier === 'VERIFIED'
                        ? 'bg-status-success-soft text-status-success'
                        : motionPhysicsEvidenceTier === 'CONFIRMED'
                          ? 'bg-status-info-soft text-status-info'
                          : 'bg-muted text-muted-foreground'
                    }`}>
                      {motionPhysicsEvidenceTier === 'VERIFIED'
                        ? t('master.motionPhysics.evidence.verified')
                        : motionPhysicsEvidenceTier === 'CONFIRMED'
                          ? t('master.motionPhysics.evidence.confirmed')
                          : t('master.motionPhysics.evidence.estimated')}
                    </span>
                  )}
                  {isEditMode && motionPhysicsReferenceId && motionPhysicsEvidenceTier === 'ESTIMATED' && (
                    <button
                      type="button"
                      disabled={motionPhysicsConfirming || !canConfirmAiEstimateReference}
                      title={
                        !canConfirmAiEstimateReference
                          ? t('master.motionPhysics.confirmAiEstimateBlockedHint')
                          : undefined
                      }
                      onClick={handleConfirmMotionReference}
                      className="text-[11px] font-semibold px-2 py-1 rounded-lg bg-brand/10 text-brand hover:bg-brand/20 disabled:opacity-50"
                    >
                      {t('master.motionPhysics.confirmAction')}
                    </button>
                  )}
                  {isEditMode && canConfirmManualMotionValues(motionPhysicsEvidenceTier) && (
                    <button
                      type="button"
                      disabled={motionPhysicsManualConfirming || motionPhysicsFieldsDisabled}
                      onClick={handleConfirmManualMotionReference}
                      className="text-[11px] font-semibold px-2 py-1 rounded-lg bg-status-info-soft text-status-info hover:opacity-90 disabled:opacity-50"
                    >
                      {t('master.motionPhysics.manualConfirmAction')}
                    </button>
                  )}
                  {(motionPhysicsHasUnsavedManualEdits || motionPhysicsRoutineSaveAtRisk) && (
                    <p className="text-[11px] text-status-warning w-full">
                      {motionPhysicsHasUnsavedManualEdits
                        ? t('master.motionPhysics.unsavedManualValuesHint')
                        : t('master.motionPhysics.routineSaveWillNotPersistHint')}
                    </p>
                  )}
                  {motionPhysicsSaveInfo && (
                    <p className="text-[11px] text-status-info w-full">{motionPhysicsSaveInfo}</p>
                  )}
                  {motionPhysicsSyncError && (
                    <p className="text-[11px] text-status-danger w-full">{motionPhysicsSyncError}</p>
                  )}
                </div>
                <p className="text-[10px] text-muted-foreground col-span-2 lg:col-span-3 mb-1">
                  {t(motionPhysicsPowerHintKey)}
                </p>
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                  <div>
                    <label className={labelClass}>{t('master.motionPhysics.systemPowerDefinition')}</label>
                    <select
                      value={systemPowerDefinition}
                      onChange={e => {
                        noteMotionPhysicsManualEdit();
                        setSystemPowerDefinition(e.target.value as MotionSystemPowerDefinitionOption | '');
                      }}
                      className={inputClass}
                      disabled={motionPhysicsFieldsDisabled}
                    >
                      <option value="">—</option>
                      <option value="OEM_RATED_MOTOR_KW">{t('master.motionPhysics.systemPowerDefinition.option.motor')}</option>
                      <option value="OEM_RATED_SYSTEM_KW">{t('master.motionPhysics.systemPowerDefinition.option.system')}</option>
                      <option value="OEM_RATED_SYSTEM_KW_ESTIMATED">
                        {t('master.motionPhysics.systemPowerDefinition.option.estimated')}
                      </option>
                    </select>
                    {isEditMode && !motionPhysicsFieldsDisabled && (
                      <p
                        className="text-[10px] text-muted-foreground mt-1"
                        data-testid="motion-physics-system-power-definition-persist-hint"
                      >
                        {t('master.motionPhysics.systemPowerDefinition.persistHint')}
                      </p>
                    )}
                  </div>
                  <div>
                    <label className={labelClass}>{t('master.motionPhysics.systemMotorPowerKw')} {aiTag}</label>
                    <input
                      data-testid="motion-physics-system-power-kw"
                      value={systemMotorPowerKw}
                      onChange={e => {
                        noteMotionPhysicsManualEdit();
                        setSystemMotorPowerKw(e.target.value);
                      }}
                      className={inputClass}
                      placeholder={t('master.motionPhysics.placeholder.systemMotorPowerKw')}
                      disabled={motionPhysicsFieldsDisabled}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>{t('master.motionPhysics.accel0To100S')} {aiTag}</label>
                    <input
                      data-testid="motion-physics-accel-0-100"
                      value={accel0To100S}
                      onChange={e => {
                        noteMotionPhysicsManualEdit();
                        setAccel0To100S(e.target.value);
                      }}
                      className={inputClass}
                      placeholder={t('master.motionPhysics.placeholder.accel0To100S')}
                      disabled={motionPhysicsFieldsDisabled}
                    />
                  </div>
                  <div className="col-span-2 lg:col-span-1">
                    <label className={labelClass}>{t('master.motionPhysics.variantAssumption')} {aiTag}</label>
                    <input
                      value={motionPhysicsVariantAssumption}
                      onChange={e => {
                        noteMotionPhysicsManualEdit();
                        setMotionPhysicsVariantAssumption(e.target.value);
                      }}
                      className={inputClass}
                      placeholder={t('master.motionPhysics.placeholder.variantAssumption')}
                      disabled={motionPhysicsFieldsDisabled}
                    />
                  </div>
                </div>
              </div>
              <div><label className={labelClass}>Tank Capacity (L)</label><input type="number" value={tankCapacityLiters} onChange={e => setTankCapacityLiters(e.target.value)} className={inputClass} placeholder="e.g. 54" /></div>
              <div><label className={labelClass}>Engine Displacement (cc) {aiTag}</label><input value={engineDisplacementCc} onChange={e => setEngineDisplacementCc(e.target.value)} className={inputClass} placeholder="e.g. 1998" /></div>
              <div><label className={labelClass}>Cylinder Count {aiTag}</label><input value={cylinderCount} onChange={e => setCylinderCount(e.target.value)} className={inputClass} placeholder="e.g. 4" /></div>
              <div><label className={labelClass}>Idle RPM {aiTag}</label><input value={idleRpm} onChange={e => setIdleRpm(e.target.value)} className={inputClass} placeholder="e.g. 750" /></div>
              <div><label className={labelClass}>Max RPM {aiTag}</label><input value={maxRpm} onChange={e => setMaxRpm(e.target.value)} className={inputClass} placeholder="e.g. 6500" /></div>
              <div><label className={labelClass}>Brake Force Dist. {aiTag}</label><input value={brakeForceDistribution} onChange={e => setBrakeForceDistribution(e.target.value)} className={inputClass} placeholder="e.g. 60/40 or 60" /></div>
              <div><label className={labelClass}>Weight Dist. (F/R) {aiTag}</label><input value={frontToRearWeightDistribution} onChange={e => setFrontToRearWeightDistribution(e.target.value)} className={inputClass} placeholder="e.g. 55/45" /></div>
            </div>
          )}

          {/* ═══════════════════════════════════════════════
              SECTION 3 — Battery (LV + HV)
             ═══════════════════════════════════════════════ */}
          {sectionHeader('battery', '3', 'Battery System')}
          {expandedSections.includes('battery') && (
            <div className="space-y-4 pl-1 pb-3">

              {/* LV Battery subsection */}
              <div>
                <p className={`text-xs font-bold mb-2 flex items-center gap-1.5 text-muted-foreground`}>
                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-muted text-muted-foreground`}>12V LV</span>
                  Low Voltage Auxiliary Battery
                </p>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  <div>
                    <label className={labelClass}>
                      {t('master.registration.lvBatteryConstructionType.label')} {aiTag}
                    </label>
                    <select
                      value={lvBatteryForm.selectValue}
                      onChange={(e) => {
                        setBatteryValidationError(null);
                        setBatteryType(e.target.value);
                      }}
                      className={inputClass}
                    >
                      <option value="">—</option>
                      {CANONICAL_LV_BATTERY_STORAGE_TYPES.map((token) => (
                        <option key={token} value={token}>
                          {token === 'LEAD_ACID'
                            ? t('master.registration.lvBatteryConstructionType.leadAcid')
                            : token === 'LITHIUM'
                              ? 'Lithium'
                              : token}
                        </option>
                      ))}
                    </select>
                    {lvBatteryForm.legacyDisplay ? (
                      <p className="mt-1 text-[11px] text-amber-600 dark:text-amber-400">
                        {t('master.registration.lvBatteryType.legacyLabel')}: {lvBatteryForm.legacyDisplay}
                      </p>
                    ) : null}
                  </div>
                  <div>
                    <label className={labelClass}>
                      {t('master.registration.lvBatteryChemistryHint.label')} {aiTag}
                    </label>
                    <input
                      value={lvBatteryChemistry}
                      onChange={(e) => setLvBatteryChemistry(e.target.value)}
                      className={`${inputClass} opacity-70`}
                      placeholder={t('master.registration.lvBatteryChemistryHint.placeholder')}
                      title={t('master.registration.lvBatteryChemistryHint.title')}
                      readOnly
                    />
                  </div>
                  <div><label className={labelClass}>Capacity (Ah) {aiTag}</label><input value={batteryAmpere} onChange={e => { setBatteryValidationError(null); setBatteryAmpere(e.target.value); }} className={inputClass} placeholder="e.g. 70" /></div>
                  <div><label className={labelClass}>Voltage (V) {aiTag}</label><input value={batteryVolt} onChange={e => { setBatteryValidationError(null); setBatteryVolt(e.target.value); }} className={inputClass} placeholder="e.g. 12" /></div>
                </div>
                {batteryValidationError ? (
                  <p className="text-xs text-destructive mt-2" role="alert">{batteryValidationError}</p>
                ) : null}
              </div>

              {/* HV Battery subsection */}
              <div>
                <p className={`text-xs font-bold mb-2 flex items-center gap-1.5 text-muted-foreground`}>
                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${
                    isMasterElectrifiedFuelType(fuelType)
                      ? (isDarkMode ? 'bg-emerald-500/20 text-emerald-400' : 'bg-emerald-100 text-emerald-700')
                      : 'bg-muted text-muted-foreground'
                  }`}>HV</span>
                  High Voltage Traction Battery
                  {!isMasterElectrifiedFuelType(fuelType) && (
                    <span className={`text-[9px] font-normal text-muted-foreground`}>— EV / PHEV / HEV only</span>
                  )}
                  {hvBatteryPresent === 'true' && <span className={`text-[9px] font-semibold ml-1 ${isDarkMode ? 'text-emerald-400' : 'text-emerald-600'}`}>● Present</span>}
                  {hvBatteryPresent === 'false' && <span className={`text-[9px] font-semibold ml-1 text-muted-foreground`}>● Not present</span>}
                </p>
                {(() => {
                  const isEv = isMasterElectrifiedFuelType(fuelType);
                  const hvUsableCapacityReadOnly = isEditMode && isEv;
                  const hvFieldDisabled = !isEv;
                  const cls = (readOnlyUsable: boolean) =>
                    `${inputClass} ${hvFieldDisabled ? 'opacity-40 cursor-not-allowed' : readOnlyUsable ? 'bg-muted/30 cursor-default' : ''}`;
                  const clsExtended = cls(false);
                  const clsUsable = cls(hvUsableCapacityReadOnly);
                  return (
                    <div className="space-y-2">
                      {hvUsableCapacityReadOnly && (
                        <p className="text-[11px] text-muted-foreground">
                          {t('master.cv.technicalSpecs.hvLegacyMasterDataHint')}
                        </p>
                      )}
                      <div className="mb-2">
                        <label className={labelClass}>
                          {t('master.cv.technicalSpecs.hvCatalogVariantLabel')}
                        </label>
                        <select
                          value={hvMasterSpecificationCatalogVariantKey}
                          onChange={(e) => setHvMasterSpecificationCatalogVariantKey(e.target.value)}
                          disabled={hvFieldDisabled}
                          className={clsExtended}
                          data-testid="hv-catalog-variant-key"
                        >
                          <option value="">
                            {t('master.cv.technicalSpecs.hvCatalogVariantNone')}
                          </option>
                          <option value={HV_CATALOG_VARIANT_KEYS.TESLA_MODEL3_RWD_LFP_CATL6L}>
                            {t('master.cv.technicalSpecs.hvCatalogVariantTeslaModel3RwdCatl6l')}
                          </option>
                        </select>
                      </div>
                      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                      <div>
                        <label className={labelClass}>Usable Capacity (kWh) {aiTag}</label>
                        <input
                          value={hvBatteryUsableCapacityKwh || hvBatteryCapacityKwh}
                          onChange={e => {
                            setHvBatteryUsableCapacityKwh(e.target.value);
                            setHvBatteryCapacityKwh(e.target.value);
                          }}
                          disabled={hvFieldDisabled}
                          readOnly={hvUsableCapacityReadOnly}
                          aria-readonly={hvUsableCapacityReadOnly}
                          placeholder={isEv ? 'e.g. 75' : 'N/A'}
                          className={clsUsable}
                          data-testid="hv-usable-capacity-kwh"
                        />
                      </div>
                      <div><label className={labelClass}>Gross Capacity (kWh) {aiTag}</label><input value={hvBatteryGrossCapacityKwh} onChange={e => setHvBatteryGrossCapacityKwh(e.target.value)} disabled={hvFieldDisabled} placeholder={isEv ? 'e.g. 82' : 'N/A'} className={clsExtended} /></div>
                      <div><label className={labelClass}>Nominal Voltage (V) {aiTag}</label><input value={hvBatteryNominalVoltage} onChange={e => setHvBatteryNominalVoltage(e.target.value)} disabled={hvFieldDisabled} placeholder={isEv ? 'e.g. 400' : 'N/A'} className={clsExtended} /></div>
                      <div><label className={labelClass}>Chemistry {aiTag}</label><input value={hvBatteryChemistry} onChange={e => setHvBatteryChemistry(e.target.value)} disabled={hvFieldDisabled} placeholder={isEv ? 'e.g. NMC, LFP' : 'N/A'} className={clsExtended} /></div>
                      <div><label className={labelClass}>Cell Format {aiTag}</label><input value={hvBatteryCellFormat} onChange={e => setHvBatteryCellFormat(e.target.value)} disabled={hvFieldDisabled} placeholder={isEv ? 'e.g. prismatic' : 'N/A'} className={clsExtended} /></div>
                      <div><label className={labelClass}>Architecture {aiTag}</label><input value={hvBatteryArchitecture} onChange={e => setHvBatteryArchitecture(e.target.value)} disabled={hvFieldDisabled} placeholder={isEv ? 'e.g. 400V, 800V' : 'N/A'} className={clsExtended} /></div>
                      <div><label className={labelClass}>Thermal Management {aiTag}</label><input value={hvBatteryThermalManagement} onChange={e => setHvBatteryThermalManagement(e.target.value)} disabled={hvFieldDisabled} placeholder={isEv ? 'e.g. liquid-cooled' : 'N/A'} className={clsExtended} /></div>
                      <div><label className={labelClass}>AC Charger (kW) {aiTag}</label><input value={acOnboardChargerKw} onChange={e => setAcOnboardChargerKw(e.target.value)} disabled={hvFieldDisabled} placeholder={isEv ? 'e.g. 11' : 'N/A'} className={clsExtended} /></div>
                      <div><label className={labelClass}>DC Fast Charge (kW) {aiTag}</label><input value={dcFastChargeMaxKw} onChange={e => setDcFastChargeMaxKw(e.target.value)} disabled={hvFieldDisabled} placeholder={isEv ? 'e.g. 150' : 'N/A'} className={clsExtended} /></div>
                      <div><label className={labelClass}>Warranty (years) {aiTag}</label><input value={hvBatteryWarrantyYears} onChange={e => setHvBatteryWarrantyYears(e.target.value)} disabled={hvFieldDisabled} placeholder={isEv ? 'e.g. 8' : 'N/A'} className={clsExtended} /></div>
                      <div><label className={labelClass}>Warranty (km) {aiTag}</label><input value={hvBatteryWarrantyKm} onChange={e => setHvBatteryWarrantyKm(e.target.value)} disabled={hvFieldDisabled} placeholder={isEv ? 'e.g. 160000' : 'N/A'} className={clsExtended} /></div>
                    </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          )}

          {/* ═══════════════════════════════════════════════
              SECTION 4 — Brakes
             ═══════════════════════════════════════════════ */}
          {sectionHeader('brakes', '4', 'Brakes')}
          {expandedSections.includes('brakes') && (
            <div className="space-y-3 pl-1 pb-3">
              <p className={`text-xs font-bold text-muted-foreground`}>Front Axle</p>
              <p className="text-[10px] text-muted-foreground">{t('master.registration.brake.nominalNotMeasurementHint')}</p>
              <div className="grid grid-cols-3 gap-3">
                <div><label className={labelClass}>{t('master.registration.brake.discDiameterFront')} {aiTag}</label><input value={brakeFrontRotorDiameter} onChange={e => setBrakeFrontRotorDiameter(e.target.value)} className={inputClass} /></div>
                <div><label className={labelClass}>{t('master.registration.brake.discNominalThicknessFront')} {aiTag}</label><input value={brakeFrontRotorWidth} onChange={e => setBrakeFrontRotorWidth(e.target.value)} className={inputClass} /></div>
                <div><label className={labelClass}>{t('master.registration.brake.padNominalThicknessFront')} {aiTag}</label><input value={brakeFrontPadThickness} onChange={e => setBrakeFrontPadThickness(e.target.value)} className={inputClass} /></div>
              </div>
              <p className={`text-xs font-bold text-muted-foreground`}>Rear Axle</p>
              <div className="grid grid-cols-3 gap-3">
                <div><label className={labelClass}>{t('master.registration.brake.discDiameterRear')} {aiTag}</label><input value={brakeBackRotorDiameter} onChange={e => setBrakeBackRotorDiameter(e.target.value)} className={inputClass} /></div>
                <div><label className={labelClass}>{t('master.registration.brake.discNominalThicknessRear')} {aiTag}</label><input value={brakeBackRotorWidth} onChange={e => setBrakeBackRotorWidth(e.target.value)} className={inputClass} /></div>
                <div><label className={labelClass}>{t('master.registration.brake.padNominalThicknessRear')} {aiTag}</label><input value={brakeBackPadThickness} onChange={e => setBrakeBackPadThickness(e.target.value)} className={inputClass} /></div>
              </div>
            </div>
          )}

          {/* ═══════════════════════════════════════════════
              SECTION 5 — Tires & Tread
             ═══════════════════════════════════════════════ */}
          {sectionHeader('tires', '5', 'Tires & Tread Depth')}
          {expandedSections.includes('tires') && (
            <div className="space-y-4 pl-1 pb-3">
              <p className={`text-xs font-bold text-muted-foreground`}>Front Axle</p>
              <div className="grid grid-cols-2 gap-3">
                <div><label className={labelClass}>Dimension</label><input value={tireFrontDimension} onChange={e => setTireFrontDimension(e.target.value)} className={inputClass} placeholder="235/45 R19" /></div>
                <div><label className={labelClass}>Brand & Model</label><input value={tireFrontBrandModel} onChange={e => setTireFrontBrandModel(e.target.value)} className={inputClass} placeholder="Pirelli P Zero" /></div>
                <div>
                  <label className={labelClass}>Season</label>
                  <select value={tireFrontSeason} onChange={e => setTireFrontSeason(e.target.value)} className={inputClass}><option>Summer</option><option>Winter</option><option>All Season</option></select>
                </div>
                <div><label className={labelClass}>DOT <span className="font-normal opacity-60">(KWYY)</span></label><input value={tireFrontDot} onChange={e => setTireFrontDot(e.target.value.replace(/[^0-9]/g, '').slice(0, 4))} className={inputClass} placeholder="2524" maxLength={4} /></div>
                <div><label className={labelClass}>Load Index</label><input value={tireFrontLoadIndex} onChange={e => setTireFrontLoadIndex(e.target.value)} className={inputClass} placeholder="94" /></div>
                <div><label className={labelClass}>Speed Index</label><input value={tireFrontSpeedIndex} onChange={e => setTireFrontSpeedIndex(e.target.value)} className={inputClass} placeholder="V" /></div>
              </div>
              <p className={`text-xs font-bold text-muted-foreground`}>Rear Axle</p>
              <div className="grid grid-cols-2 gap-3">
                <div><label className={labelClass}>Dimension</label><input value={tireBackDimension} onChange={e => setTireBackDimension(e.target.value)} className={inputClass} placeholder="235/45 R19" /></div>
                <div><label className={labelClass}>Brand & Model</label><input value={tireBackBrandModel} onChange={e => setTireBackBrandModel(e.target.value)} className={inputClass} placeholder="Pirelli P Zero" /></div>
                <div>
                  <label className={labelClass}>Season</label>
                  <select value={tireBackSeason} onChange={e => setTireBackSeason(e.target.value)} className={inputClass}><option>Summer</option><option>Winter</option><option>All Season</option></select>
                </div>
                <div><label className={labelClass}>DOT <span className="font-normal opacity-60">(KWYY)</span></label><input value={tireBackDot} onChange={e => setTireBackDot(e.target.value.replace(/[^0-9]/g, '').slice(0, 4))} className={inputClass} placeholder="2524" maxLength={4} /></div>
                <div><label className={labelClass}>Load Index</label><input value={tireBackLoadIndex} onChange={e => setTireBackLoadIndex(e.target.value)} className={inputClass} placeholder="94" /></div>
                <div><label className={labelClass}>Speed Index</label><input value={tireBackSpeedIndex} onChange={e => setTireBackSpeedIndex(e.target.value)} className={inputClass} placeholder="V" /></div>
              </div>

              {/* ── AI Tire Spec Agent ── */}
              <div className={`rounded-lg border p-4 ${
                tireAiLoading
                  ? (isDarkMode ? 'bg-cyan-950/30 border-cyan-800/40' : 'bg-gradient-to-r from-cyan-50 to-teal-50 border-cyan-200/40')
                  : tireAiResult
                    ? (isDarkMode ? 'bg-emerald-950/20 border-emerald-800/30' : 'bg-gradient-to-r from-emerald-50/80 to-green-50/60 border-emerald-200/40')
                    : tireAiError
                      ? (isDarkMode ? 'bg-red-950/20 border-red-800/30' : 'bg-red-50/80 border-red-200/40')
                      : (isDarkMode ? 'surface-premium/30 border-neutral-700/40' : 'bg-muted/60 border-border/40')
              }`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Search className={`w-4 h-4 ${isDarkMode ? 'text-cyan-400' : 'text-cyan-600'}`} />
                    <span className={`text-xs font-bold text-foreground`}>AI Tire Spec Agent</span>
                    {tireAiResult && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-semibold ${isDarkMode ? 'bg-emerald-500/20 text-emerald-400' : 'bg-emerald-100 text-emerald-700'}`}>Fertig</span>
                    )}
                    {tireAiLoading && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-semibold ${isDarkMode ? 'bg-cyan-500/20 text-cyan-400' : 'bg-cyan-100 text-cyan-700'}`}>Arbeitet…</span>
                    )}
                  </div>
                  <div className="relative group">
                    <button
                      type="button"
                      onClick={handleFetchTireAi}
                      disabled={tireAiLoading || !tireAiCanFetch}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                        tireAiLoading || !tireAiCanFetch
                          ? 'opacity-50 cursor-not-allowed'
                          : 'hover:shadow-md hover:scale-[1.02] active:scale-[0.98]'
                      } ${isDarkMode ? 'bg-cyan-600/80 text-cyan-100 hover:bg-cyan-600' : 'bg-gradient-to-br from-cyan-500 to-teal-600 text-white shadow-sm'}`}
                    >
                      {tireAiLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Search className="w-3 h-3" />}
                      {tireAiLoading ? 'Lädt…' : tireAiResult ? 'Erneut abrufen' : 'Fetch AI Tire Spec'}
                    </button>
                    {!tireAiCanFetch && !tireAiLoading && (
                      <div className="absolute right-0 top-full mt-1 z-50 w-56 px-3 py-2 rounded-lg text-[10px] font-medium shadow-lg border pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity bg-popover border-border text-muted-foreground">
                        Bitte Brand & Model, Dimension, Load Index, Speed Index und Year ausfüllen.
                      </div>
                    )}
                  </div>
                </div>

                {tireAiLoading && (
                  <div className="space-y-2">
                    <div className={`flex items-center gap-2 px-3 py-2 rounded-xl ${isDarkMode ? 'bg-cyan-900/20 border border-cyan-800/30' : 'bg-white/60 border border-cyan-200/40'}`}>
                      <Loader2 className="w-3.5 h-3.5 text-cyan-500 animate-spin shrink-0" />
                      <span className={`text-xs font-medium ${isDarkMode ? 'text-cyan-300' : 'text-cyan-700'}`}>
                        {tireAiCountdown > 0 ? `Geschätzte Zeit: ${tireAiCountdown}s` : 'Dauert etwas länger als erwartet…'}
                      </span>
                    </div>
                    {tireAiSteps.length > 0 && (
                      <div className={` border overflow-hidden ${isDarkMode ? 'surface-premium/20 border-neutral-700/30' : 'bg-white/40 border-border/40'}`}>
                        {tireAiSteps.map((s, i) => (
                          <div key={i} className={`flex items-center gap-2 px-3 py-1 ${i > 0 ? (isDarkMode ? 'border-t border-neutral-700/20' : 'border-t border-border') : ''}`}>
                            {s.status === 'done' && <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />}
                            {s.status === 'error' && <XCircle className="w-3 h-3 text-red-500 shrink-0" />}
                            {s.status === 'working' && <Loader2 className="w-3 h-3 text-cyan-500 animate-spin shrink-0" />}
                            <span className={`text-[11px] flex-1 text-muted-foreground`}>{s.step}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {tireAiError && !tireAiLoading && (
                  <div className={`flex items-start gap-2 px-3 py-2 rounded-xl ${isDarkMode ? 'bg-red-900/20 border border-red-800/30' : 'bg-red-50/80 border border-red-200/40'}`}>
                    <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" />
                    <span className={`text-xs ${isDarkMode ? 'text-red-400' : 'text-red-600'}`}>{tireAiError}</span>
                  </div>
                )}

                {tireAiResult && !tireAiLoading && (
                  <div className="space-y-2">
                    <div className={`flex items-center gap-2 px-3 py-2 rounded-xl ${isDarkMode ? 'bg-emerald-900/20 border border-emerald-800/30' : 'bg-emerald-50/80 border border-emerald-200/40'}`}>
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                      <span className={`text-xs font-medium flex-1 ${isDarkMode ? 'text-emerald-400' : 'text-emerald-700'}`}>
                        AI Tire Spec erfolgreich abgerufen
                        {tireAiResult.confidenceScore != null && (
                          <> · Confidence: <strong>{typeof tireAiResult.confidenceScore === 'number' && tireAiResult.confidenceScore <= 1 ? `${Math.round((tireAiResult.confidenceScore as number) * 100)}%` : `${tireAiResult.confidenceScore}`}</strong></>
                        )}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setTireAiResultExpanded(p => !p)}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-colors bg-muted hover:bg-muted/80 text-foreground`}
                    >
                      <span>AI Tire Spec Ergebnis {tireAiResultExpanded ? 'ausblenden' : 'anzeigen'}</span>
                      {tireAiResultExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>
                    {tireAiResultExpanded && (
                      <div className={` border overflow-hidden ${isDarkMode ? 'surface-premium/20 border-neutral-700/30' : 'bg-white/60 border-border/40'}`}>
                        <div className="max-h-64 overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
                          <table className="w-full text-xs">
                            <tbody>
                              {Object.entries(tireAiResult).map(([key, val]) => (
                                <tr key={key} className={`${isDarkMode ? 'border-b border-neutral-700/20' : 'border-b border-border'}`}>
                                  <td className={`px-3 py-1.5 font-medium whitespace-nowrap text-muted-foreground`}>{key}</td>
                                  <td className={`px-3 py-1.5 font-mono ${
                                    val === null ? ('text-muted-foreground') : ('text-foreground')
                                  }`}>{val === null ? 'null' : typeof val === 'object' ? JSON.stringify(val) : String(val)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => { setTireAiResult(null); setTireAiResultExpanded(false); }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium bg-muted text-muted-foreground hover:bg-muted/80`}
                      >Verwerfen</button>
                    </div>
                  </div>
                )}

                {!tireAiLoading && !tireAiResult && !tireAiError && (
                  <p className={`text-[10px] text-muted-foreground`}>
                    Ruft Reifenspezifikationen per KI ab: Profiltiefe, Sensitivitäten, EU-Label, Verschleißparameter u.v.m.
                  </p>
                )}
              </div>

              <p className={`text-xs font-bold text-muted-foreground`}>Tire Condition</p>
              <div className="grid grid-cols-2 gap-3">
                <button type="button" onClick={() => setTireCondition(tireCondition === 'NEW_INSTALLED' ? '' : 'NEW_INSTALLED')} className={`px-3 py-2 rounded-lg text-xs font-semibold border-2 transition-all ${tireCondition === 'NEW_INSTALLED' ? (isDarkMode ? 'border-brand bg-status-info/10 text-status-info' : 'border-brand bg-brand-soft text-status-info') : (isDarkMode ? 'border-border text-muted-foreground' : 'border-border text-muted-foreground')}`}>Newly Installed</button>
                <button type="button" onClick={() => setTireCondition(tireCondition === 'ALREADY_MOUNTED' ? '' : 'ALREADY_MOUNTED')} className={`px-3 py-2 rounded-lg text-xs font-semibold border-2 transition-all ${tireCondition === 'ALREADY_MOUNTED' ? (isDarkMode ? 'border-amber-500 bg-amber-500/10 text-amber-400' : 'border-amber-400 bg-amber-50 text-amber-700') : (isDarkMode ? 'border-border text-muted-foreground' : 'border-border text-muted-foreground')}`}>Already Mounted (Used)</button>
              </div>
              {tireCondition === 'ALREADY_MOUNTED' && (
                <p className={`text-[10px] ${isDarkMode ? 'text-amber-400/80' : 'text-amber-600'}`}>For used tires, please enter current per-wheel tread depths below for accurate wear tracking.</p>
              )}
              <p className={`text-xs font-bold text-muted-foreground`}>Tread Depth (mm){tireCondition === 'ALREADY_MOUNTED' ? ' — recommended' : ''}</p>
              <div className="grid grid-cols-4 gap-3">
                <div><label className={labelClass}>FL</label><input value={treadDepthFL} onChange={e => setTreadDepthFL(e.target.value)} className={inputClass} placeholder="6.5" /></div>
                <div><label className={labelClass}>FR</label><input value={treadDepthFR} onChange={e => setTreadDepthFR(e.target.value)} className={inputClass} placeholder="6.5" /></div>
                <div><label className={labelClass}>RL</label><input value={treadDepthBL} onChange={e => setTreadDepthBL(e.target.value)} className={inputClass} placeholder="6.5" /></div>
                <div><label className={labelClass}>RR</label><input value={treadDepthBR} onChange={e => setTreadDepthBR(e.target.value)} className={inputClass} placeholder="6.5" /></div>
              </div>
            </div>
          )}

          {/* ═══════════════════════════════════════════════
              SECTION 6 — Service & Maintenance Baselines
             ═══════════════════════════════════════════════ */}
          {sectionHeader('service', '6', 'Service & Maintenance Baselines')}
          {expandedSections.includes('service') && (
            <div className="space-y-3 pl-1 pb-3">
              <p className={`text-xs font-bold text-muted-foreground`}>Manufacturer Service Interval</p>
              <div className="grid grid-cols-2 gap-3">
                <div><label className={labelClass}>Interval (km) {aiTag}</label><input type="number" value={serviceIntervalManufacturerKm} onChange={e => setServiceIntervalManufacturerKm(e.target.value)} placeholder="e.g. 30000" className={inputClass} /></div>
                <div><label className={labelClass}>Interval (months) {aiTag}</label><input type="number" value={serviceIntervalManufacturerMonths} onChange={e => setServiceIntervalManufacturerMonths(e.target.value)} placeholder="e.g. 24" className={inputClass} /></div>
              </div>
              <p className={`text-xs font-bold text-muted-foreground`}>Oil Change Interval</p>
              <div className="grid grid-cols-2 gap-3">
                <div><label className={labelClass}>Interval (km) {aiTag}</label><input type="number" value={oilChangeIntervalKm} onChange={e => setOilChangeIntervalKm(e.target.value)} placeholder="e.g. 15000" className={inputClass} /></div>
                <div><label className={labelClass}>Interval (months) {aiTag}</label><input type="number" value={oilChangeIntervalMonths} onChange={e => setOilChangeIntervalMonths(e.target.value)} placeholder="e.g. 12" className={inputClass} /></div>
              </div>
              {serviceIntervals && (
                <div className={`text-xs rounded-lg px-3 py-2 bg-muted text-muted-foreground`}>
                  Summary: {serviceIntervals}
                </div>
              )}
            </div>
          )}

          {/* ═══════════════════════════════════════════════
              SECTION 7 — Service History
             ═══════════════════════════════════════════════ */}
          {!isManualCreate ? sectionHeader('history', '7', 'Service History') : null}
          {!isManualCreate && expandedSections.includes('history') && (
            <div className="grid grid-cols-2 gap-3 pl-1 pb-3">
              <div><label className={labelClass}>Last TÜV</label><input type="date" value={lastTuev} onChange={e => setLastTuev(e.target.value)} className={inputClass} /></div>
              <div><label className={labelClass}>Last BOKraft</label><input type="date" value={lastBokraft} onChange={e => setLastBokraft(e.target.value)} className={inputClass} /></div>
              <div><label className={labelClass}>Last Inspection</label><input type="date" value={lastInspection} onChange={e => setLastInspection(e.target.value)} className={inputClass} /></div>
              <div><label className={labelClass}>Last Oil Change</label><input type="date" value={lastOilChange} onChange={e => setLastOilChange(e.target.value)} className={inputClass} /></div>
              <div><label className={labelClass}>Last Brake Pad Change</label><input type="date" value={lastBrakePadChange} onChange={e => setLastBrakePadChange(e.target.value)} className={inputClass} /></div>
              <div><label className={labelClass}>Last Brake Rotor Change</label><input type="date" value={lastBrakeRotorChange} onChange={e => setLastBrakeRotorChange(e.target.value)} className={inputClass} /></div>
            </div>
          )}

          {/* ═══════════════════════════════════════════════
              SECTION 8 — Exterior Photos (Damage Map)
             ═══════════════════════════════════════════════ */}
          {sectionHeader('exterior', '8', 'Exterior Photos (Damage Map)', <Camera className={`w-3.5 h-3.5 ${isDarkMode ? 'text-amber-400' : 'text-amber-500'}`} />)}
          {expandedSections.includes('exterior') && (
            <div className="pl-1 pb-3">
              <ExteriorImagesEditor
                isDarkMode={isDarkMode}
                vehicleId={isEditMode ? existingVehicle.id : null}
                vehicleMake={vehicleIdentity.make}
                vehicleModel={vehicleIdentity.model}
                title="Five canonical views"
                subtitle="Upload one photo per view (front, left, right, rear, roof). They drive the Rental damage map carousel."
                onBufferedChange={setBufferedExteriorImages}
              />
            </div>
          )}

          {/* ═══════════════════════════════════════════════
              SECTION 9 — High Mobility Data
             ═══════════════════════════════════════════════ */}
          {!isManualCreate ? sectionHeader('hm', '9', 'High Mobility Data') : null}
          {!isManualCreate && expandedSections.includes('hm') && (
            <div className="pl-1 pb-3 space-y-3">
              {/* Loading state */}
              {hmAvailabilityLoading && (
                <div className={`flex items-center gap-2 px-3 py-2.5 border text-xs surface-solid border-border text-muted-foreground`}>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Checking HM Health availability for this VIN…
                </div>
              )}

              {/* No VIN available */}
              {!hmAvailabilityLoading && !vehicleIdentity.vin && (
                <p className={`text-xs text-muted-foreground`}>
                  VIN required to check High Mobility Health availability.
                </p>
              )}

              {/* HM not available for this VIN */}
              {!hmAvailabilityLoading && hmAvailability && !hmAvailability.available && (
                <div className={`flex items-start gap-2.5 px-3 py-2.5 border text-xs surface-solid border-border text-muted-foreground`}>
                  <Radio className="w-3.5 h-3.5 mt-0.5 shrink-0 opacity-40" />
                  <div>
                    <div className="font-medium">High Mobility Health not available</div>
                    <div className="mt-0.5 opacity-70">
                      {hmAvailability.clearanceStatus
                        ? `VIN found in HM system (status: ${hmAvailability.clearanceStatus}) — approval pending.`
                        : 'No approved HM Health record found for this VIN. Add the vehicle in Master Admin → High Mobility.'}
                    </div>
                  </div>
                </div>
              )}

              {/* HM available — already linked (active) */}
              {!hmAvailabilityLoading && hmAvailability?.available && (hmActivated || hmAvailability.isLinked) && (
                <div className={`flex items-start gap-2.5 px-3 py-2.5 rounded-xl border text-xs ${isDarkMode ? 'bg-emerald-900/20 border-emerald-800/40 text-emerald-300' : 'bg-emerald-50 border-emerald-200 text-emerald-700'}`}>
                  <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  <div>
                    <div className="font-semibold">High Mobility Health — Active</div>
                    <div className="mt-0.5 opacity-80">
                      OEM informational health signals are active for this vehicle.
                      DIMO telematics remain the primary operational source.
                    </div>
                  </div>
                </div>
              )}

              {/* HM available — approved, not yet linked, can activate */}
              {!hmAvailabilityLoading && hmAvailability?.available && !hmActivated && !hmAvailability.isLinked && (
                <div className={`rounded-xl border overflow-hidden ${isDarkMode ? 'bg-status-info-soft border-border' : 'bg-brand-soft border-border'}`}>
                  <div className="px-3 py-2.5">
                    <div className="flex items-start gap-2.5">
                      <Shield className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${isDarkMode ? 'text-status-info' : 'text-brand'}`} />
                      <div className="flex-1">
                        <div className={`text-xs font-semibold ${isDarkMode ? 'text-brand' : 'text-status-info'}`}>
                          High Mobility Health available — Approved
                        </div>
                        <div className={`text-[11px] mt-0.5 ${isDarkMode ? 'text-status-info/70' : 'text-brand/70'}`}>
                          This VIN has an approved HM Health clearance. Activating adds OEM informational signals
                          (tire pressure, service info) without affecting DIMO telematics or health calculations.
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className={`px-3 py-2 border-t flex items-center gap-2 ${isDarkMode ? 'border-border' : 'border-border'}`}>
                    {isEditMode && existingVehicle?.id ? (
                      <button
                        type="button"
                        disabled={hmActivating}
                        onClick={async () => {
                          if (!hmAvailability?.hmVehicleId || !existingVehicle?.id) return;
                          setHmActivating(true);
                          try {
                            await api.highMobility.activateHealth(existingVehicle.id, hmAvailability.hmVehicleId);
                            setHmActivated(true);
                          } catch {
                            // toast shown by parent
                          } finally {
                            setHmActivating(false);
                          }
                        }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-brand text-brand-foreground hover:bg-brand-hover disabled:opacity-50 transition-colors"
                      >
                        {hmActivating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Link2 className="w-3.5 h-3.5" />}
                        Activate High Mobility Health
                      </button>
                    ) : (
                      <div className={`text-[11px] flex items-center gap-1.5 ${isDarkMode ? 'text-status-info/70' : 'text-brand/60'}`}>
                        <Radio className="w-3 h-3" />
                        Activation available after vehicle is registered — use Master Admin → High Mobility.
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* No API result yet and VIN present */}
              {!hmAvailabilityLoading && !hmAvailability && vehicleIdentity.vin && (
                <p className={`text-xs text-muted-foreground`}>
                  Could not check HM availability (backend unreachable or not configured).
                </p>
              )}
            </div>
          )}
          {/* ═══════════════════════════════════════════════
               SECTION 10 — Hardware Type (V3)
               ═══════════════════════════════════════════════ */}
          {sectionHeader('hardware', '10', t('master.cv.technicalSpecs.diRoutingSectionTitle'))}
          {expandedSections.includes('hardware') && (
            <div className="pl-1 pb-3 space-y-3">
              <p className={`text-xs text-muted-foreground`}>
                {t('master.cv.technicalSpecs.diRoutingHint')}
              </p>
              {(existingVehicle?.connectionModality ||
                existingVehicle?.telemetryConnectionFamily) && (
                <div
                  className={`rounded-xl border px-3 py-2 text-xs space-y-1 ${isDarkMode ? 'border-border bg-muted/20' : 'border-border bg-muted/40'}`}
                  data-testid="connection-identity-summary"
                >
                  {existingVehicle?.connectionModality && (
                    <p>
                      <span className="font-semibold">
                        {t('master.cv.technicalSpecs.connectionModalityLabel')}:
                      </span>{' '}
                      {formatMasterConnectionModalityLabel(existingVehicle.connectionModality)}
                    </p>
                  )}
                  {existingVehicle?.telemetryConnectionFamily && (
                    <p>
                      <span className="font-semibold">
                        {t('master.cv.technicalSpecs.telemetryFamilyLabel')}:
                      </span>{' '}
                      {formatMasterTelemetryConnectionFamilyLabel(
                        existingVehicle.telemetryConnectionFamily,
                      )}
                    </p>
                  )}
                </div>
              )}
              <p className={`text-xs font-semibold text-muted-foreground`}>
                {t('master.cv.technicalSpecs.diRoutingHardwareLabel')}
              </p>
              <div className="grid grid-cols-3 gap-2">
                {(['LTE_R1', 'SMART5', 'UNKNOWN'] as const).map((hw) => (
                  <button
                    key={hw}
                    type="button"
                    disabled={isEditMode}
                    onClick={() => {
                      if (isEditMode) return;
                      setHardwareType(hw);
                    }}
                    className={`py-2.5 rounded-xl text-sm font-semibold border transition-all ${
                      isEditMode ? 'opacity-60 cursor-not-allowed' : ''
                    } ${
                      hardwareType === hw
                        ? isDarkMode
                          ? 'bg-brand/30 border-brand text-brand'
                          : 'bg-brand-soft border-brand text-brand'
                        : isDarkMode
                          ? 'surface-premium border-neutral-700 text-muted-foreground hover:border-neutral-500'
                          : 'bg-muted border-border text-muted-foreground hover:border-border'
                    }`}
                  >
                    {hw === 'UNKNOWN' ? 'Unknown' : hw}
                  </button>
                ))}
              </div>
              {isEditMode && (
                <p className="text-[11px] text-muted-foreground">
                  {t('master.cv.technicalSpecs.diRoutingReadOnlyHint')}
                </p>
              )}
              {hardwareType === 'LTE_R1' && (
                <div className={`rounded-xl px-3 py-2 text-xs ${isDarkMode ? 'bg-status-info-soft text-status-info border border-border' : 'bg-status-info-soft text-status-info border border-border'}`}>
                  {t('master.cv.technicalSpecs.diRoutingLteR1Info')}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div className={`flex shrink-0 items-center justify-between px-4 sm:px-8 py-4 sm:py-5 border-t ${isDarkMode ? 'border-neutral-800' : 'border-border'}`}>
          <div className={`text-xs text-muted-foreground`}>
            {isEditMode ? 'Editing registered vehicle' : 'Creating new registered vehicle'}{organizationId ? ` · ${orgName}` : ''}
          </div>
          <div className="flex items-center gap-3">
            <button onClick={onClose} className={`px-5 py-2.5 text-sm font-semibold transition-all surface-solid text-foreground hover:bg-muted`}>Cancel</button>
            <button
              onClick={() => void handleSubmit()}
              disabled={!organizationId || submitting}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold transition-all shadow-lg ${!organizationId || submitting ? 'opacity-50 cursor-not-allowed' : 'hover:shadow-xl hover:scale-[1.02] active:scale-[0.98]'} bg-gradient-to-br from-indigo-500 to-indigo-600 text-white`}
            >
              <Save className="w-4 h-4" />
              {submitting ? (isEditMode ? 'Saving…' : 'Registering…') : (isEditMode ? 'Save Changes' : 'Register Vehicle')}
            </button>
          </div>
        </div>
      </div>

      {isEditMode && existingVehicle?.id && organizationId && isVehicleIdentityP2Enabled() ? (
        <MasterZb1RegistrationDialog
          open={zb1DialogOpen}
          onOpenChange={setZb1DialogOpen}
          isDarkMode={isDarkMode}
          organizationId={organizationId}
          vehicleId={existingVehicle.id}
          registrationFormCurrent={zb1RegistrationFormCurrent}
          onApplyToRegistrationForm={(patch) => {
            applyZb1PatchToRegistrationForm(patch);
            setZb1DialogOpen(false);
          }}
        />
      ) : null}

      {isEditMode && existingVehicle?.id && organizationId ? (
        <OneAutoServiceDialog
          open={oneAutoDialogOpen}
          onOpenChange={setOneAutoDialogOpen}
          organizationId={organizationId}
          organizationName={orgName}
          vehicleId={existingVehicle.id}
          vehicleLabel={`${vehicleIdentity.make} ${vehicleIdentity.model}`.trim() || existingVehicle.vehicleName}
          vin={vehicleIdentity.vin || existingVehicle.vin}
        />
      ) : null}
    </div>
  );
}
