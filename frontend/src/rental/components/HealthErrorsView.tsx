
import { Activity, AlertTriangle, Gauge, Snowflake, Sun, Thermometer, Wind, Wrench, Zap } from 'lucide-react';
import { Icon } from './ui/Icon';
import tellTaleBatteryIcon from '../../assets/icons/telltale/battery.svg';
import { useState, useEffect, useCallback, useRef, useMemo, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { XAxis, YAxis, ResponsiveContainer, Tooltip, Line, LineChart, ReferenceArea } from 'recharts';
import { api, streamAiTireSpecs, type AgentStep, type AiTireSpecsStreamEvent, type DashboardWarningLightsResponse, type VehicleHealthTabSummaryDto, type TireWearAnalysis, type ServiceInfoStatus, type BatteryHealthSummary, type BatteryHealthDetail, type HvBatteryStatus, type BrakeHealthSummary as BrakeHealthSummaryType, type BrakeHealthDetail, type BrakeAlert, type TripProfile, type TireHealthSummaryResponse, type TireHealthDetailResponse, type TireAlert, type DtcKnowledgeDto, type BatteryHealthStatus, type BatteryRestingVoltageStatus, type VehicleTripAnalytics } from '../../lib/api';
import { unwrapTaskListPage } from '../../lib/tasks-pagination';
import { useRentalEntityNavigation } from '../context/RentalEntityNavigationContext';
import {
  buildBokraftComplianceDisplay,
  buildNextServiceDisplay,
  buildTuvComplianceDisplay,
  formatServiceEventTypeDe,
  nextServicePanelClass,
  nextServiceToneClass,
  serviceHistoryDisclaimer,
} from '../lib/service-info-display';
import { ComplianceTaskActions } from './ComplianceTaskActions';
import { DashboardWarningLightsPanel } from './DashboardWarningLightsPanel';
import { isBatteryTelltaleActive } from '../lib/dashboard-warning-lights-display';
import {
  RESTING_VOLTAGE_EXPLANATION,
  buildBatteryMeasurementRows,
  buildRestingVoltageTrendPoints,
  formatExteriorAmbientDisplay,
  resolveCanonicalRestingVoltage,
  resolveCurrentLiveVoltage,
  resolveExteriorAmbientTemperature,
  restingVoltageChartDomain,
  restingVoltageStatusLabelDe,
} from '../lib/battery-health-detail-ui';
import { TireWearV3CustomerPanel } from './tires/TireWearV3CustomerPanel';
import {
  TIRE_FORECAST_QUALITY_SUBTEXT,
  TIRE_MANUAL_MEASUREMENT_HINT,
  TIRE_TREAD_LIFE_SCORE_HINT,
  WHEEL_POSITIONS,
  formatLowestTreadLine,
  formatTireQuickNextMeasurementLabel,
  formatWheelLastMeasured,
  resolveWheelByPosition,
  tireDefaultAssumptionWarning,
  tireForecastBadgeLabel,
  tireHasTrackableData,
  tireLowestTreadLabel,
  tireModelEvidenceLine,
  tirePressureEvidenceLine,
  tireRemainingKmLabel,
  tireSpecEvidenceLine,
  tireStatusToSegment,
  tireStructuredActions,
  tireUiStatus,
  tireUiStatusLabel,
  treadMmColorClass,
  uiStatusAccentClass,
  wheelMeasurementBadge,
} from '../lib/tire-health-detail-ui';
import {
  formatV3AuthoritativeHeadline,
  isTireWearV3Authoritative,
  resolveLegacyTreadLifePercent,
  resolveV3WheelTreadFallback,
} from '../lib/tire-wear-read-model-ui';
import { segmentFromHealthState } from '../lib/health-segment-display';
import { SegmentedHealthIndicator } from './health/SegmentedHealthIndicator';
import { formatBatteryVoltage, normalizeLvBatteryVoltage } from '../lib/battery-display.utils';
import { ESTIMATED_LV_HEALTH_SCORE_LABEL_DE } from '../lib/battery-lv-semantics';
import { useRentalOrg } from '../RentalContext';
import { useEffectiveHealth } from '../FleetContext';
import {
  complianceDateStateLabel,
  formatComplianceDueDate,
  nextServiceSummaryTone,
  type HealthTabSummaryLoadState,
} from '../lib/health-tab-summary-ui';
import {
  dtcFaultCardTone,
  quickCardAccentFromRentalState,
  rentalStateLabelDe,
  rentalStatePillClasses,
  serviceCardBorderFromRentalState,
} from '../rental-health-ui';
import { BatteryConditionBars, RestingVoltageBadge } from './BatteryConditionBars';
import { BatteryDataQualityBadge } from './BatteryDataQualityBadge';
import { useLanguage } from '../../i18n/LanguageContext';
import { useHealthTabBatteryData } from '../hooks/useHealthTabBatteryData';
import { invalidateRentalHealthForVehicle } from '../lib/rental-health-query';
import type { HealthDetailTab } from '../lib/health-detail-utils';
import { BatteryHealthQueryErrorPanel } from './battery/BatteryHealthQueryErrorPanel';
import { BatteryLvSummaryCard } from './battery/BatteryLvSummaryCard';
import { BatteryHvSummaryCard } from './battery/BatteryHvSummaryCard';
import { BatteryLvDetailContent } from './battery/BatteryLvDetailContent';
import { BatteryHvDetailContent } from './battery/BatteryHvDetailContent';
import { buildBatteryLvDetailVm, buildBatteryLvSummaryVm } from '../lib/battery-lv-view-model';
import { buildBatteryHvDetailVm, buildBatteryHvSummaryVm } from '../lib/battery-hv-view-model';
import {
  SectionHeader,
  DataCard,
  MetricCard,
  EmptyState,
  SkeletonCard,
  PriorityBadge,
  StatusDot,
} from '../../components/patterns';
import { HealthServiceActions } from './health/HealthServiceActions';
import { TechnicalObservationsHealthModule } from './health/TechnicalObservationsHealthModule';
import { useFleetVehicles } from '../FleetContext';
import {
  brakeOverviewLabel,
  brakeRemainingKmLabel,
  BRAKE_SERVICE_KIND_OPTIONS,
  BRAKE_SERVICE_SCOPE_OPTIONS,
  brakeServiceScopeResetsComponent,
} from '../lib/brake-health-evidence-ui';
import { BrakeEvidencePanel } from './health/BrakeEvidencePanel';
import type { BrakeServiceKindInput, BrakeServiceScopeInput } from '../../lib/api';

interface HealthErrorsViewProps {
  vehicleId?: string;
  fuelType?: string;
  initialModuleTab?: HealthDetailTab;
  onConsumeInitialModuleTab?: () => void;
  onOpenServiceCenter?: () => void;
  onOpenExistingTask?: (taskId: string) => void;
  onOpenBooking?: (bookingId: string) => void;
  onOpenTrips?: (dateIso?: string) => void;
}

function openHealthDetailTabModal(
  tab: HealthDetailTab,
  openers: {
    openErrorCodes: () => void;
    openBattery: () => void;
    openService: () => void;
    openBrakes: () => void;
    openTires: () => void;
  },
): void {
  switch (tab) {
    case 'dtc':
      openers.openErrorCodes();
      break;
    case 'battery':
      openers.openBattery();
      break;
    case 'service':
      openers.openService();
      break;
    case 'brakes':
      openers.openBrakes();
      break;
    case 'tires':
      openers.openTires();
      break;
    default:
      break;
  }
}

function formatEnumLabel(value: unknown, fallback = '—'): string {
  if (typeof value !== 'string' || value.length === 0) return fallback;
  return value.replace(/_/g, ' ');
}

function formatMaxDecimals(value: number | null | undefined, maxDecimals = 2, fallback = '—'): string {
  if (value == null || !Number.isFinite(value)) return fallback;
  const rounded = Math.round(value * 10 ** maxDecimals) / 10 ** maxDecimals;
  return String(rounded);
}

/**
 * Canonical tire status → UI style. Mirrors the backend tire-status taxonomy
 * (GOOD | WATCH | WARNING | CRITICAL | UNKNOWN) so the quick box and detail
 * modal render the same single source of truth, not a re-derived % bucket.
 */
function tireStatusStyle(
  status: string | null | undefined,
): { dot: string; pill: string; label: string } {
  switch (status) {
    case 'GOOD':
      return { dot: 'sq-dot-success', pill: 'sq-chip-success', label: 'Good' };
    case 'WATCH':
      return { dot: 'sq-dot-watch', pill: 'sq-chip-watch', label: 'Watch' };
    case 'WARNING':
      return { dot: 'sq-dot-warning', pill: 'sq-chip-warning', label: 'Warning' };
    case 'CRITICAL':
      return { dot: 'sq-dot-critical', pill: 'sq-chip-critical', label: 'Critical' };
    case 'MEASUREMENT_REQUIRED':
      return { dot: 'sq-dot-warning', pill: 'sq-chip-warning', label: 'Measurement required' };
    case 'REVIEW_REQUIRED':
      return { dot: 'sq-dot-watch', pill: 'sq-chip-watch', label: 'Review required' };
    case 'LIMITED_DATA':
      return { dot: 'sq-dot-nodata', pill: 'sq-tone-ai', label: 'Limited data' };
    default:
      return { dot: 'sq-dot-nodata', pill: 'sq-chip-nodata', label: 'Unknown' };
  }
}

/** Canonical brake condition shares the same 5-state model as tires. */
const brakeConditionStyle = tireStatusStyle;

const BRAKE_BASIS_LABEL: Record<string, string> = {
  MEASURED: 'Measured',
  DOCUMENTED: 'Documented',
  SENSOR: 'Sensor',
  ESTIMATED: 'Estimated',
  UNKNOWN: 'Unknown',
};

const BRAKE_CONFIDENCE_LABEL: Record<string, string> = {
  HIGH: 'High',
  MEDIUM: 'Medium',
  LOW: 'Low',
  UNKNOWN: 'Unknown',
};

/** Render a remaining-life km band honestly — never false precision. */
function formatBrakeKmRange(
  min: number | null | undefined,
  max: number | null | undefined,
): string | null {
  if (min == null && max == null) return null;
  const fmt = (n: number) => Math.round(n).toLocaleString('de-DE');
  if (min != null && max != null) {
    return min === max ? `${fmt(min)} km` : `${fmt(min)}–${fmt(max)} km`;
  }
  const v = (min ?? max) as number;
  return `~${fmt(v)} km`;
}

/** Human "x days ago" for a measurement timestamp; honest about missing data. */
function formatMeasuredAgo(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const ts = new Date(iso).getTime();
  if (!Number.isFinite(ts)) return null;
  const days = Math.floor((Date.now() - ts) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return '1 day ago';
  if (days < 45) return `${days} days ago`;
  const months = Math.round(days / 30);
  return `${months} mo ago`;
}

export function HealthErrorsView({
  vehicleId,
  fuelType,
  initialModuleTab,
  onConsumeInitialModuleTab,
  onOpenServiceCenter,
  onOpenExistingTask,
  onOpenBooking,
  onOpenTrips,
}: HealthErrorsViewProps) {
  const isEv = fuelType === 'Electric' || fuelType === 'PHEV';
  const { orgId, userRole } = useRentalOrg();
  const { openDocumentIntake } = useRentalEntityNavigation();
  const openHealthDocumentIntake = useCallback(() => {
    if (!vehicleId) return;
    openDocumentIntake({
      optionalContextType: 'VEHICLE',
      optionalContextId: vehicleId,
      contextVehicleId: vehicleId,
      sourceSurface: 'health_page',
      returnView: 'health-errors',
      returnEntityId: vehicleId,
      documentTab: 'upload',
    });
  }, [openDocumentIntake, vehicleId]);
  const batteryQueryState = useHealthTabBatteryData({
    orgId,
    vehicleId,
    isEv,
    enabled: Boolean(vehicleId && orgId),
  });
  const {
    batterySummary,
    batteryDetail,
    batteryLatest,
    hvBatteryStatus,
    batteryError,
    batteryLoading,
    retryBattery,
  } = batteryQueryState;
  const { t, locale } = useLanguage();
  const { health: rentalHealth, loading: rentalHealthLoading } = useEffectiveHealth(vehicleId ?? null);
  const { reloadHealth } = useFleetVehicles();

  const invalidateHealthCache = useCallback(() => {
    if (orgId && vehicleId) {
      invalidateRentalHealthForVehicle(orgId, vehicleId);
    } else {
      void reloadHealth();
    }
  }, [orgId, vehicleId, reloadHealth]);
  const [showErrorCodes, setShowErrorCodes] = useState(false);
  const [showBattery, setShowBattery] = useState(false);
  const [showService, setShowService] = useState(false);
  const [showBrakes, setShowBrakes] = useState(false);
  const [showTires, setShowTires] = useState(false);
  const [showHvBattery, setShowHvBattery] = useState(false);
  // V4.7.59 — active auto-tasks (source INSIGHT_*) for this vehicle, shown as
  // a hint in the Service Info modal so operators see the materialized task.
  const [serviceAutoTasks, setServiceAutoTasks] = useState<Array<{ id: string; title: string; priority: string; category?: string | null }>>([]);
  const [batteryChartTab, setBatteryChartTab] = useState<'woche' | 'monat'>('woche');
  const [isModalAnimating, setIsModalAnimating] = useState(false);
  const [isModalClosing, setIsModalClosing] = useState(false);
  const [expandedErrorIndex, setExpandedErrorIndex] = useState<number | null>(null);
  const [dtcRetrying, setDtcRetrying] = useState<Record<string, boolean>>({});
  const dtcPollCountRef = useRef(0);

  const [healthTabSummary, setHealthTabSummary] = useState<VehicleHealthTabSummaryDto | null>(null);
  const [healthTabSummaryLoadState, setHealthTabSummaryLoadState] = useState<HealthTabSummaryLoadState>('idle');
  const telltalesSectionRef = useRef<HTMLDivElement>(null);
  const [aiHealthCare, setAiHealthCare] = useState<import('../../lib/api').AiHealthCareResponse | null>(null);
  const [aiHealthCareLoading, setAiHealthCareLoading] = useState(false);
  const [dashboardLights, setDashboardLights] = useState<DashboardWarningLightsResponse | null>(null);
  const [dashboardLightsLoading, setDashboardLightsLoading] = useState(false);

  const loadDashboardLights = useCallback(async () => {
    if (!vehicleId) return;
    setDashboardLightsLoading(true);
    try {
      const lights = await api.vehicleIntelligence.dashboardWarningLights(vehicleId);
      setDashboardLights(lights);
    } catch {
      setDashboardLights(null);
    } finally {
      setDashboardLightsLoading(false);
    }
  }, [vehicleId]);

  const canonicalDashboardLights = useMemo(
    () => dashboardLights ?? aiHealthCare?.dashboardWarningLights ?? null,
    [dashboardLights, aiHealthCare],
  );

  const loadHealthTabSummary = useCallback(async () => {
    if (!vehicleId) return;
    setHealthTabSummaryLoadState('loading');
    try {
      const summary = await api.vehicleIntelligence.healthTabSummary(vehicleId);
      setHealthTabSummary(summary);
      setHealthTabSummaryLoadState('loaded');
    } catch {
      setHealthTabSummary(null);
      setHealthTabSummaryLoadState('endpoint_error');
    }
  }, [vehicleId]);
  const [dtcList, setDtcList] = useState<any[]>([]);
  const [activeDtcCount, setActiveDtcCount] = useState(0);
  const [activeDtcList, setActiveDtcList] = useState<any[]>([]);
  const [lastDtcChecked, setLastDtcChecked] = useState<string | null>(null);
  const [dtcSummary, setDtcSummary] = useState<any>(null);
  const [dtcDetail, setDtcDetail] = useState<any>(null);
  const [dtcDetailLoading, setDtcDetailLoading] = useState(false);
  const [brakesData, setBrakesData] = useState<any>(null);
  const [brakeHealthSummary, setBrakeHealthSummary] = useState<BrakeHealthSummaryType | null>(null);
  const [brakeHealthDetail, setBrakeHealthDetail] = useState<BrakeHealthDetail | null>(null);
  const [showBrakeEntry, setShowBrakeEntry] = useState(false);
  const [brakeEntryMode, setBrakeEntryMode] = useState<'manual' | 'upload' | null>(null);
  const [brakeForm, setBrakeForm] = useState({
    date: '',
    odometerKm: '',
    workshopName: '',
    notes: '',
    kind: 'full_brake_service' as BrakeServiceKindInput,
    scope: ['front_pads', 'rear_pads', 'front_discs', 'rear_discs'] as BrakeServiceScopeInput[],
    frontPadMm: '',
    rearPadMm: '',
    frontRotorWidthMm: '',
    rearRotorWidthMm: '',
  });
  const [submittingBrake, setSubmittingBrake] = useState(false);
  const [tripProfile, setTripProfile] = useState<TripProfile | null>(null);
  const [batteryRecentTrips, setBatteryRecentTrips] = useState<VehicleTripAnalytics[]>([]);
  const [tiresData, setTiresData] = useState<any>(null);
  const [tireWear, setTireWear] = useState<TireWearAnalysis | null>(null);
  const [tireHealth, setTireHealth] = useState<TireHealthSummaryResponse | null>(null);
  const [tireDetail, setTireDetail] = useState<TireHealthDetailResponse | null>(null);
  const [tireDetailLoading, setTireDetailLoading] = useState(false);
  const [showMeasurement, setShowMeasurement] = useState(false);
  const [measurementMode, setMeasurementMode] = useState<'manual' | 'upload' | null>(null);
  const [manualMeasurement, setManualMeasurement] = useState({ fl: '', fr: '', rl: '', rr: '', odometer: '', workshop: '' });
  const [submittingMeasurement, setSubmittingMeasurement] = useState(false);
  const [showRotation, setShowRotation] = useState(false);
  const [rotationTemplate, setRotationTemplate] = useState('front_to_rear');
  const [rotationOdometer, setRotationOdometer] = useState('');
  const [rotationNotes, setRotationNotes] = useState('');
  const [submittingRotation, setSubmittingRotation] = useState(false);
  const [showTireChange, setShowTireChange] = useState(false);
  const [tireChangeScope, setTireChangeScope] = useState<'single' | 'axle' | 'full_set'>('full_set');
  const [tireChangePositions, setTireChangePositions] = useState<string[]>([]);
  const [tireChangeOdometer, setTireChangeOdometer] = useState('');
  const [tireChangeNotes, setTireChangeNotes] = useState('');
  const [submittingTireChange, setSubmittingTireChange] = useState(false);
  const [activatingStoredSetId, setActivatingStoredSetId] = useState<string | null>(null);
  const [storedActivationOdometer, setStoredActivationOdometer] = useState('');
  const [tireModalTab, setTireModalTab] = useState<'overview' | 'history' | 'factors'>('overview');
  const [showEditSetup, setShowEditSetup] = useState(false);
  const [editSetupForm, setEditSetupForm] = useState({ frontDimension: '', rearDimension: '', brandModelFront: '', brandModelRear: '', tireSeason: '', treadFL: '', treadFR: '', treadBL: '', treadBR: '', tireCondition: '' as '' | 'NEW_INSTALLED' | 'ALREADY_MOUNTED', loadIndex: '', speedIndex: '' });
  const [submittingEditSetup, setSubmittingEditSetup] = useState(false);

  // ── AI Tire Spec fetch state ──
  const [aiTireLoading, setAiTireLoading] = useState(false);
  const [aiTireSteps, setAiTireSteps] = useState<AgentStep[]>([]);
  const [aiTireLiveStep, setAiTireLiveStep] = useState('');
  const [aiTireResult, setAiTireResult] = useState<Record<string, unknown> | null>(null);
  const [aiTireError, setAiTireError] = useState('');
  const [aiTireDegraded, setAiTireDegraded] = useState(false);
  const [aiTireCountdown, setAiTireCountdown] = useState(0);
  const [aiTireApplying, setAiTireApplying] = useState(false);
  const aiTireAbortRef = useRef<AbortController | null>(null);
  const aiTireCountdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [vehicleYear, setVehicleYear] = useState<number | null>(null);

  const [serviceInfo, setServiceInfo] = useState<ServiceInfoStatus | null>(null);
  const [serviceInfoLoading, setServiceInfoLoading] = useState(true);
  const [serviceInfoError, setServiceInfoError] = useState(false);
  const [hmTirePressure, setHmTirePressure] = useState<import('../../lib/api').HmTirePressureSignals | null>(null);

  useEffect(() => {
    if (!vehicleId) return;
    void loadHealthTabSummary();
    void loadDashboardLights();
    setAiHealthCareLoading(true);
    api.vehicleIntelligence.aiHealthCare(vehicleId).then(setAiHealthCare).catch(() => null).finally(() => setAiHealthCareLoading(false));
    api.vehicleIntelligence.dtc(vehicleId).then(d => setDtcList(Array.isArray(d) ? d : [])).catch(() => []);
    api.vehicleIntelligence.dtcActive(vehicleId).then(d => {
      const list = Array.isArray(d) ? d : [];
      setActiveDtcList(list);
      setActiveDtcCount(list.length);
    }).catch(() => { setActiveDtcList([]); setActiveDtcCount(0); });
    api.vehicleIntelligence.dtcStats(vehicleId).then((s: any) => {
      if (s?.lastChecked) setLastDtcChecked(s.lastChecked);
    }).catch(() => null);
    api.vehicleIntelligence.dtcSummary(vehicleId).then(setDtcSummary).catch(() => null);
    api.vehicleIntelligence.brakes(vehicleId).then(setBrakesData).catch(() => null);
    api.vehicleIntelligence.brakeHealthSummary(vehicleId).then(setBrakeHealthSummary).catch(() => null);
    api.vehicleIntelligence.brakeHealthDetail(vehicleId).then(setBrakeHealthDetail).catch(() => null);
    api.vehicleIntelligence.tires(vehicleId).then(setTiresData).catch(() => null);
    api.vehicleIntelligence.tireWearAnalysis(vehicleId).then(setTireWear).catch(() => null);
    api.vehicleIntelligence.tireHealthSummary(vehicleId).then(setTireHealth).catch(() => null);
    setServiceInfoLoading(true);
    setServiceInfoError(false);
    api.vehicleIntelligence.serviceInfoStatus(vehicleId)
      .then(setServiceInfo)
      .catch(() => {
        setServiceInfo(null);
        setServiceInfoError(true);
      })
      .finally(() => setServiceInfoLoading(false));
    api.vehicleIntelligence.hmVehicleHealth(vehicleId).then(d => {
      if (d?.tirePressure) setHmTirePressure(d.tirePressure);
    }).catch(() => null);
    api.vehicleIntelligence.tripProfile(vehicleId).then(setTripProfile).catch(() => null);
    api.vehicles.get(vehicleId).then((v: any) => {
      if (v?.year) setVehicleYear(v.year);
    }).catch(() => null);
  }, [vehicleId, loadHealthTabSummary, loadDashboardLights]);

  useEffect(() => {
    if (!showBattery || !vehicleId) {
      setBatteryRecentTrips([]);
      return;
    }
    const from = new Date(Date.now() - 30 * 86_400_000).toISOString();
    api.vehicleIntelligence
      .trips(vehicleId, { from })
      .then((rows) => setBatteryRecentTrips(Array.isArray(rows) ? rows : []))
      .catch(() => setBatteryRecentTrips([]));
  }, [showBattery, vehicleId]);

  // Load active auto-tasks for this vehicle when the Service modal opens.
  // Filters to system-generated tasks (source INSIGHT_*) that are still open.
  useEffect(() => {
    if (!showService || !vehicleId || !orgId) {
      setServiceAutoTasks([]);
      return;
    }
    let cancelled = false;
    api.tasks
      .list(orgId)
      .then((page) => {
        if (cancelled) return;
        const rows = unwrapTaskListPage(page).data;
        const list = rows.filter(
          (t) =>
            t.vehicleId === vehicleId &&
            typeof t.source === 'string' &&
            t.source.startsWith('INSIGHT_') &&
            t.status !== 'DONE' &&
            t.status !== 'CANCELLED',
        );
        setServiceAutoTasks(list);
      })
      .catch(() => { if (!cancelled) setServiceAutoTasks([]); });
    return () => { cancelled = true; };
  }, [showService, vehicleId, orgId]);

  // Reusable DTC detail loader (used for the initial open + silent polling).
  const loadDtcDetail = useCallback(
    (opts?: { silent?: boolean }) => {
      if (!vehicleId) return Promise.resolve();
      if (!opts?.silent) setDtcDetailLoading(true);
      return api.vehicleIntelligence
        .dtcDetail(vehicleId)
        .then(setDtcDetail)
        .catch(() => null)
        .finally(() => {
          if (!opts?.silent) setDtcDetailLoading(false);
        });
    },
    [vehicleId],
  );

  // Load DTC detail lazily when the Error Codes modal opens
  useEffect(() => {
    if (!showErrorCodes || !vehicleId) return;
    dtcPollCountRef.current = 0;
    loadDtcDetail();
  }, [showErrorCodes, vehicleId, loadDtcDetail]);

  // Poll quietly in the background while any active fault's AI knowledge is
  // still being prepared (QUEUED/PROCESSING). Bounded so it never polls forever;
  // the DTC itself is always visible regardless of knowledge state.
  useEffect(() => {
    if (!showErrorCodes || !vehicleId || !dtcDetail) return;
    const faults: any[] = dtcDetail?.currentFaults?.activeFaults ?? [];
    const pending = faults.some(
      (f) =>
        f?.knowledge &&
        (f.knowledge.status === 'QUEUED' || f.knowledge.status === 'PROCESSING'),
    );
    if (!pending || dtcPollCountRef.current >= 40) return;
    const t = setTimeout(() => {
      dtcPollCountRef.current += 1;
      loadDtcDetail({ silent: true });
    }, 6000);
    return () => clearTimeout(t);
  }, [showErrorCodes, vehicleId, dtcDetail, loadDtcDetail]);

  // Admin-only manual retry of AI knowledge enrichment for a single DTC code.
  const handleRetryKnowledge = useCallback(
    async (code: string) => {
      if (!vehicleId || !code) return;
      setDtcRetrying((m) => ({ ...m, [code]: true }));
      try {
        await api.vehicleIntelligence.dtcKnowledgeRetry(vehicleId, code);
        dtcPollCountRef.current = 0;
        await loadDtcDetail({ silent: true });
      } catch {
        /* keep DTC visible; surface nothing destructive */
      } finally {
        setDtcRetrying((m) => ({ ...m, [code]: false }));
      }
    },
    [vehicleId, loadDtcDetail],
  );

  const isOrgAdmin = userRole === 'ORG_ADMIN';

  // Renders the AI knowledge panel under an active DTC card. Pure presentation —
  // the DTC itself always renders regardless of knowledge state.
  const renderDtcKnowledge = (dtc: any, index: number) => {
    const k = dtc?.knowledge as DtcKnowledgeDto | undefined;
    if (!k) return null;
    const isExpanded = expandedErrorIndex === index;

    const urgDe: Record<string, string> = { LOW: 'Niedrig', MEDIUM: 'Mittel', HIGH: 'Hoch', CRITICAL: 'Kritisch', UNKNOWN: 'Unbekannt' };
    const recDe: Record<string, string> = {
      RENTABLE: 'Vermietbar',
      CHECK_BEFORE_NEXT_RENTAL: 'Vor nächster Vermietung prüfen',
      BLOCK_UNTIL_INSPECTED: 'Sperren bis geprüft',
      DO_NOT_RENT: 'Nicht vermieten',
      UNKNOWN: 'Unbekannt',
    };
    const urgCls = (u?: string) =>
      ({
        CRITICAL: 'sq-chip-critical',
        HIGH: 'sq-chip-warning',
        MEDIUM: 'sq-chip-watch',
        LOW: 'sq-chip-info',
      }[u ?? 'UNKNOWN'] ?? ('sq-chip-neutral'));
    const recCls = (r?: string) =>
      ({
        DO_NOT_RENT: 'sq-chip-critical',
        BLOCK_UNTIL_INSPECTED: 'sq-chip-warning',
        CHECK_BEFORE_NEXT_RENTAL: 'sq-chip-watch',
        RENTABLE: 'sq-chip-success',
      }[r ?? 'UNKNOWN'] ?? ('sq-chip-neutral'));
    const label = (text: string) => (
      <p className={`text-[10px] uppercase tracking-wider mb-1 text-muted-foreground/70`}>{text}</p>
    );
    const wrap = (inner: ReactNode) => (
      <div className={`mt-3 ml-5 pt-3 border-t ${'border-border'}`}>
        <p className={`text-[9px] uppercase tracking-widest font-bold mb-2 ${'text-[color:var(--brand)]'}`}>
          AI-Einschätzung · DTC Knowledge
        </p>
        {inner}
      </div>
    );

    if (k.status === 'QUEUED' || k.status === 'PROCESSING') {
      return wrap(
        <div className="flex items-center gap-2">
          <Icon name="loader-2" className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
          <div>
            <p className="text-xs font-medium text-foreground/80">AI-Erklärung wird vorbereitet …</p>
            <p className="text-[11px] text-muted-foreground">Der Fehlercode bleibt sichtbar; die Erklärung wird im Hintergrund ergänzt.</p>
          </div>
        </div>,
      );
    }

    if (k.status === 'FAILED') {
      return wrap(
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className={`w-3.5 h-3.5 ${'text-[color:var(--status-watch)]'}`} />
            <p className="text-xs text-muted-foreground">Erklärung konnte noch nicht erstellt werden.</p>
          </div>
          {isOrgAdmin && (
            <button
              type="button"
              onClick={() => handleRetryKnowledge(dtc.code)}
              disabled={!!dtcRetrying[dtc.code]}
              className={`text-[11px] px-2 py-1 rounded-md font-medium ${'bg-muted text-foreground hover:bg-muted/80'} disabled:opacity-50`}
            >
              {dtcRetrying[dtc.code] ? 'Wird erneut versucht …' : 'Erneut versuchen'}
            </button>
          )}
        </div>,
      );
    }

    if (k.status === 'MISSING') {
      return wrap(<p className="text-xs text-muted-foreground">Noch keine Erklärung vorhanden.</p>);
    }

    // READY
    const causes = k.possibleCauses ?? [];
    const effects = k.possibleEffects ?? [];
    const sources = k.sources ?? [];
    return wrap(
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Wrench className={`w-3.5 h-3.5 ${'text-[color:var(--brand)]'}`} />
            <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">SynqDrive DTC Knowledge Base</span>
            {k.source === 'VEHICLE_SPECIFIC' && (
              <span className={`text-[9px] px-2 py-0.5 rounded-full font-semibold ${'sq-tone-brand'}`}>Fahrzeugspezifisch</span>
            )}
            {k.needsReview && (
              <span className={`text-[9px] px-2 py-0.5 rounded-full font-semibold ${'sq-chip-watch'}`}>Prüfung empfohlen</span>
            )}
          </div>
          <button
            type="button"
            onClick={() => setExpandedErrorIndex(isExpanded ? null : index)}
            className={`text-[11px] font-medium shrink-0 ${'text-[color:var(--brand)] hover:opacity-80'}`}
          >
            {isExpanded ? 'Weniger' : 'Mehr anzeigen'}
          </button>
        </div>

        {k.title && <p className="text-xs font-semibold text-foreground mb-1">{k.title}</p>}
        {k.shortDescription && <p className="text-xs text-foreground/80 mb-2 leading-relaxed">{k.shortDescription}</p>}

        <div className="flex flex-wrap items-center gap-2">
          <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${recCls(k.rentalRecommendation)}`}>
            Vermietung: {recDe[k.rentalRecommendation ?? 'UNKNOWN']}
          </span>
          <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${urgCls(k.technicalUrgency)}`}>
            AI technisch: {urgDe[k.technicalUrgency ?? 'UNKNOWN']}
          </span>
          <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${urgCls(k.rentalUrgency)}`}>
            AI Rental: {urgDe[k.rentalUrgency ?? 'UNKNOWN']}
          </span>
        </div>

        {isExpanded && (
          <div className="mt-3 space-y-3">
            {causes.length > 0 && (
              <div>
                {label('Mögliche Ursachen')}
                <ul className="list-disc list-inside space-y-0.5">
                  {causes.map((c, ci) => (
                    <li key={ci} className="text-xs text-foreground/80">{c}</li>
                  ))}
                </ul>
              </div>
            )}
            {effects.length > 0 && (
              <div>
                {label('Mögliche Folgen')}
                <ul className="list-disc list-inside space-y-0.5">
                  {effects.map((c, ci) => (
                    <li key={ci} className="text-xs text-foreground/80">{c}</li>
                  ))}
                </ul>
              </div>
            )}
            {k.recommendedAction && (
              <div>
                {label('Empfehlung für Vermietung')}
                <p className="text-xs text-foreground/80 leading-relaxed">{k.recommendedAction}</p>
              </div>
            )}
            {sources.length > 0 && (
              <div>
                {label('Quellen')}
                <ul className="space-y-0.5">
                  {sources.map((s, si) => (
                    <li key={si} className="text-xs">
                      {s.url ? (
                        <a href={s.url} target="_blank" rel="noopener noreferrer" className={`underline ${'text-[color:var(--brand)] hover:opacity-80'}`}>
                          {s.title || s.url}
                        </a>
                      ) : (
                        <span className="text-foreground/70">{s.title}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {k.lastVerifiedAt && (
              <p className="text-[10px] text-muted-foreground/70">
                Zuletzt geprüft: {new Date(k.lastVerifiedAt).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })}
              </p>
            )}
            {isOrgAdmin && (
              <button
                type="button"
                onClick={() => handleRetryKnowledge(dtc.code)}
                disabled={!!dtcRetrying[dtc.code]}
                className={`text-[11px] px-2 py-1 rounded-md font-medium ${'bg-muted text-foreground hover:bg-muted/80'} disabled:opacity-50`}
              >
                {dtcRetrying[dtc.code] ? 'Aktualisiere …' : 'Neu generieren'}
              </button>
            )}
          </div>
        )}
      </div>,
    );
  };

  const refreshTireWear = useCallback(() => {
    if (!vehicleId) return;
    api.vehicleIntelligence.tireWearAnalysis(vehicleId).then(setTireWear).catch(() => null);
    api.vehicleIntelligence.tires(vehicleId).then(setTiresData).catch(() => null);
    api.vehicleIntelligence.tireHealthSummary(vehicleId).then(setTireHealth).catch(() => null);
    if (tireDetail) {
      api.vehicleIntelligence.tireHealthDetail(vehicleId).then(setTireDetail).catch(() => null);
    }
  }, [vehicleId, tireDetail]);

  const loadTireDetail = useCallback(() => {
    if (!vehicleId) return;
    setTireDetailLoading(true);
    api.vehicleIntelligence.tireHealthDetail(vehicleId)
      .then(setTireDetail)
      .catch(() => null)
      .finally(() => setTireDetailLoading(false));
  }, [vehicleId]);

  const resolveActiveSetup = useCallback((setupsRaw: any): any | null => {
    const setups = Array.isArray(setupsRaw) ? setupsRaw : [];
    return (
      setups.find((s: any) => s?.status === 'ACTIVE' && !s?.removedAt) ??
      setups.find((s: any) => s?.status === 'ACTIVE') ??
      setups.find((s: any) => !s?.removedAt) ??
      setups[0] ??
      null
    );
  }, []);

  const handleRotateTires = async () => {
    if (!vehicleId) return;
    setTireActionError(null);
    setSubmittingRotation(true);
    try {
      await api.vehicleIntelligence.rotateTires(vehicleId, {
        template: rotationTemplate,
        odometerKm: rotationOdometer ? parseFloat(rotationOdometer) : undefined,
        notes: rotationNotes || undefined,
      });
      setShowRotation(false);
      setRotationTemplate('front_to_rear');
      setRotationOdometer('');
      setRotationNotes('');
      refreshTireWear();
      loadTireDetail();
      invalidateHealthCache();
    } catch (err: any) {
      setTireActionError(err?.message || 'Failed to rotate tires. Please try again.');
    }
    setSubmittingRotation(false);
  };

  const toggleTireChangePosition = useCallback((position: string) => {
    setTireChangePositions((prev) =>
      prev.includes(position)
        ? prev.filter((p) => p !== position)
        : [...prev, position],
    );
  }, []);

  const handleConfirmTireChange = useCallback(async () => {
    if (!vehicleId) return;
    setTireActionError(null);
    setSubmittingTireChange(true);
    try {
      await api.vehicleIntelligence.changeTires(vehicleId, {
        scope: tireChangeScope,
        positions: tireChangeScope === 'full_set' ? undefined : tireChangePositions,
        odometerKm: tireChangeOdometer ? parseFloat(tireChangeOdometer) : undefined,
        notes: tireChangeNotes || undefined,
      });
      setShowTireChange(false);
      setTireChangeScope('full_set');
      setTireChangePositions([]);
      setTireChangeOdometer('');
      setTireChangeNotes('');
      refreshTireWear();
      loadTireDetail();
      invalidateHealthCache();
    } catch (err: any) {
      setTireActionError(err?.message || 'Failed to change tires.');
    }
    setSubmittingTireChange(false);
  }, [
    vehicleId,
    tireChangeScope,
    tireChangePositions,
    tireChangeOdometer,
    tireChangeNotes,
    refreshTireWear,
    loadTireDetail,
    invalidateHealthCache,
  ]);

  const handleActivateStoredSet = useCallback(async () => {
    if (!vehicleId || !activatingStoredSetId) return;
    setTireActionError(null);
    setSubmittingTireChange(true);
    try {
      await api.vehicleIntelligence.activateStoredTireSet(vehicleId, {
        storedSetupId: activatingStoredSetId,
        odometerKm: storedActivationOdometer ? parseFloat(storedActivationOdometer) : undefined,
      });
      setActivatingStoredSetId(null);
      setStoredActivationOdometer('');
      refreshTireWear();
      loadTireDetail();
      invalidateHealthCache();
    } catch (err: any) {
      setTireActionError(err?.message || 'Failed to activate stored tire set.');
    }
    setSubmittingTireChange(false);
  }, [
    vehicleId,
    activatingStoredSetId,
    storedActivationOdometer,
    refreshTireWear,
    loadTireDetail,
    invalidateHealthCache,
  ]);

  const [tireActionError, setTireActionError] = useState<string | null>(null);
  const [tireActionWarning, setTireActionWarning] = useState<string | null>(null);
  const [aiTireGenerationBinding, setAiTireGenerationBinding] = useState<{
    tireSetupId: string;
    setupUpdatedAt: string;
    requestTireSize: string;
    requestLoadIndex: string;
    requestSpeedIndex: string;
  } | null>(null);

  const handleSubmitMeasurement = async () => {
    if (!vehicleId) return;
    setTireActionError(null);
    const activeSetup = resolveActiveSetup(tiresData);
    if (!activeSetup) {
      setTireActionError('No active tire setup found. Please add tire information first.');
      return;
    }
    const hasAnyValue = manualMeasurement.fl || manualMeasurement.fr || manualMeasurement.rl || manualMeasurement.rr;
    if (!hasAnyValue) {
      setTireActionError('Please enter at least one tread depth value.');
      return;
    }
    setSubmittingMeasurement(true);
    try {
      await api.vehicleIntelligence.addTireHealthMeasurement(vehicleId, {
        frontLeftMm: manualMeasurement.fl ? parseFloat(manualMeasurement.fl) : undefined,
        frontRightMm: manualMeasurement.fr ? parseFloat(manualMeasurement.fr) : undefined,
        rearLeftMm: manualMeasurement.rl ? parseFloat(manualMeasurement.rl) : undefined,
        rearRightMm: manualMeasurement.rr ? parseFloat(manualMeasurement.rr) : undefined,
        odometerKm: manualMeasurement.odometer ? parseFloat(manualMeasurement.odometer) : undefined,
        source: 'manual',
        workshopName: manualMeasurement.workshop || undefined,
      });
      setShowMeasurement(false);
      setMeasurementMode(null);
      setManualMeasurement({ fl: '', fr: '', rl: '', rr: '', odometer: '', workshop: '' });
      refreshTireWear();
      loadTireDetail();
      invalidateHealthCache();
    } catch (err: any) {
      setTireActionError(err?.message || 'Failed to save measurement. Please try again.');
    }
    setSubmittingMeasurement(false);
  };

  const handleOpenEditSetup = useCallback(() => {
    const active = resolveActiveSetup(tiresData);
    setEditSetupForm({
      frontDimension: active?.frontDimension ?? '',
      rearDimension: active?.rearDimension ?? '',
      brandModelFront: active?.brandModelFront ?? '',
      brandModelRear: active?.brandModelRear ?? '',
      tireSeason: active?.tireSeason ?? '',
      treadFL: '', treadFR: '', treadBL: '', treadBR: '',
      tireCondition: active?.tireCondition === 'NEW_INSTALLED' ? 'NEW_INSTALLED' : active?.tireCondition === 'ALREADY_MOUNTED' ? 'ALREADY_MOUNTED' : '',
      loadIndex: active?.loadIndex ?? '',
      speedIndex: active?.speedIndex ?? '',
    });
    handleDiscardAiTireSpec();
    setShowEditSetup(true);
  }, [tiresData, resolveActiveSetup]);

  const handleSaveEditSetup = async () => {
    if (!vehicleId || !orgId) return;
    setTireActionError(null);
    setSubmittingEditSetup(true);
    try {
      const parseOpt = (v: string) => { const n = parseFloat(v); return isNaN(n) ? undefined : n; };
      await api.vehicles.upsertTires(orgId, vehicleId, {
        frontDimension: editSetupForm.frontDimension.trim() || undefined,
        rearDimension: editSetupForm.rearDimension.trim() || undefined,
        brandModelFront: editSetupForm.brandModelFront.trim() || undefined,
        brandModelRear: editSetupForm.brandModelRear.trim() || undefined,
        tireSeason: editSetupForm.tireSeason || undefined,
        loadIndexFront: editSetupForm.loadIndex.trim() || undefined,
        speedIndexFront: editSetupForm.speedIndex.trim() || undefined,
        tireCondition: editSetupForm.tireCondition || undefined,
        treadFL: parseOpt(editSetupForm.treadFL),
        treadFR: parseOpt(editSetupForm.treadFR),
        treadBL: parseOpt(editSetupForm.treadBL),
        treadBR: parseOpt(editSetupForm.treadBR),
      });
      setShowEditSetup(false);
      refreshTireWear();
      loadTireDetail();
    } catch (err: any) {
      setTireActionError(err?.message || 'Failed to save tire setup. Please try again.');
    }
    setSubmittingEditSetup(false);
  };

  // ── AI Tire Spec fetch logic ────────────────────────────────────────────────

  const aiTireSpecFieldsReady = Boolean(
    editSetupForm.brandModelFront.trim() &&
    editSetupForm.frontDimension.trim() &&
    editSetupForm.loadIndex.trim() &&
    editSetupForm.speedIndex.trim() &&
    vehicleYear,
  );

  const mapAiTireApplyError = useCallback((code?: string, message?: string) => {
    switch (code) {
      case 'STALE_GENERATION_BINDING':
        return t('health.aiTireSpec.staleBinding');
      case 'MISSING_GENERATION_BINDING':
        return t('health.aiTireSpec.missingGenerationBinding');
      case 'PAYLOAD_GENERATION_IDENTITY_MISMATCH':
      case 'PAYLOAD_AXLE_IDENTITY_MISMATCH':
      case 'AMBIGUOUS_AXLE_BINDING':
      case 'INCOMPLETE_SPEC_IDENTITY':
        return t('health.aiTireSpec.identityMismatch');
      default:
        return message || t('health.aiTireSpec.applyFailed');
    }
  }, [t]);

  const handleFetchAiTireSpec = useCallback(() => {
    if (!aiTireSpecFieldsReady) return;

    const activeSetup = resolveActiveSetup(tiresData);
    if (!activeSetup?.id || !activeSetup?.updatedAt) {
      setTireActionError(t('health.aiTireSpec.missingActiveSetup'));
      return;
    }

    const generationSnapshot = {
      tireSetupId: String(activeSetup.id),
      setupUpdatedAt: new Date(activeSetup.updatedAt).toISOString(),
      requestTireSize: editSetupForm.frontDimension.trim(),
      requestLoadIndex: editSetupForm.loadIndex.trim(),
      requestSpeedIndex: editSetupForm.speedIndex.trim(),
    };

    // Abort previous
    if (aiTireAbortRef.current) aiTireAbortRef.current.abort();
    if (aiTireCountdownRef.current) clearInterval(aiTireCountdownRef.current);

    // Reset state
    setAiTireLoading(true);
    setAiTireSteps([]);
    setAiTireLiveStep('');
    setAiTireResult(null);
    setAiTireGenerationBinding(null);
    setAiTireError('');
    setAiTireDegraded(false);
    setAiTireCountdown(30);

    // Start countdown
    aiTireCountdownRef.current = setInterval(() => {
      setAiTireCountdown(prev => {
        if (prev <= 1) return 0;
        return prev - 1;
      });
    }, 1000);

    // Parse brand/model from combined field
    const parts = editSetupForm.brandModelFront.trim().split(/\s+/);
    const brand = parts[0] || '';
    const model = parts.slice(1).join(' ') || '';

    const controller = streamAiTireSpecs(
      {
        brand,
        model,
        year: vehicleYear ? String(vehicleYear) : undefined,
        tireSize: editSetupForm.frontDimension.trim(),
        loadIndex: editSetupForm.loadIndex.trim(),
        speedIndex: editSetupForm.speedIndex.trim(),
      },
      (evt: AiTireSpecsStreamEvent) => {
        if (evt.event === 'step') {
          setAiTireSteps(prev => {
            const existing = prev.findIndex(s => s.step === evt.data.step);
            if (existing >= 0) {
              const copy = [...prev];
              copy[existing] = evt.data;
              return copy;
            }
            return [...prev, evt.data];
          });
          if (evt.data.status === 'working') setAiTireLiveStep(evt.data.step);
        } else if (evt.event === 'progress') {
          if (evt.data.content) setAiTireLiveStep(evt.data.content);
        } else if (evt.event === 'result') {
          if (aiTireCountdownRef.current) clearInterval(aiTireCountdownRef.current);
          setAiTireCountdown(0);
          if (evt.data.degraded) {
            setAiTireDegraded(true);
          }
          setAiTireResult(evt.data.specs);
          setAiTireGenerationBinding(generationSnapshot);
          setAiTireLoading(false);
        } else if (evt.event === 'error') {
          if (aiTireCountdownRef.current) clearInterval(aiTireCountdownRef.current);
          setAiTireCountdown(0);
          setAiTireError(evt.data.message || 'AI Tire Spec fetch failed');
          setAiTireLoading(false);
        }
      },
      () => {
        if (aiTireCountdownRef.current) clearInterval(aiTireCountdownRef.current);
        setAiTireLoading(false);
      },
    );
    aiTireAbortRef.current = controller;
  }, [aiTireSpecFieldsReady, editSetupForm.brandModelFront, editSetupForm.frontDimension, editSetupForm.loadIndex, editSetupForm.speedIndex, vehicleYear, tiresData, resolveActiveSetup, t]);

  const handleApplyAiTireSpec = async () => {
    if (!vehicleId || !aiTireResult || !aiTireGenerationBinding) return;
    setAiTireApplying(true);
    setTireActionError(null);
    setTireActionWarning(null);
    try {
      const result = await api.vehicleIntelligence.applyAiTireSpec(vehicleId, {
        aiTireSpec: aiTireResult,
        generationBinding: aiTireGenerationBinding,
      });
      if (!result.success) {
        setTireActionError(mapAiTireApplyError(result.code, result.message));
        return;
      }
      if (result.setupSpecWarnings?.length) {
        setTireActionWarning(
          result.setupSpecWarnings.some((w) => w.code === 'SEASON_MISMATCH')
            ? t('health.aiTireSpec.seasonMismatchWarning')
            : result.setupSpecWarnings.map((w) => w.message).join(' · '),
        );
      }
      setAiTireResult(null);
      setAiTireGenerationBinding(null);
      refreshTireWear();
      loadTireDetail();
    } catch (err: any) {
      setTireActionError(err?.message || t('health.aiTireSpec.applyFailed'));
    }
    setAiTireApplying(false);
  };

  const handleDiscardAiTireSpec = () => {
    setAiTireResult(null);
    setAiTireGenerationBinding(null);
    setAiTireError('');
    setAiTireDegraded(false);
    setAiTireSteps([]);
    setAiTireLiveStep('');
  };

  const refreshBrakeHealth = useCallback(() => {
    if (!vehicleId) return;
    api.vehicleIntelligence.brakeHealthSummary(vehicleId).then(setBrakeHealthSummary).catch(() => null);
    api.vehicleIntelligence.brakeHealthDetail(vehicleId).then(setBrakeHealthDetail).catch(() => null);
  }, [vehicleId]);

  const handleLogBrakeChange = async () => {
    if (!vehicleId || !brakeForm.date) return;
    setSubmittingBrake(true);
    try {
      await api.vehicleIntelligence.recordBrakeService(vehicleId, {
        serviceDate: new Date(brakeForm.date).toISOString(),
        odometerKm: brakeForm.odometerKm ? parseInt(brakeForm.odometerKm, 10) : undefined,
        workshopName: brakeForm.workshopName || undefined,
        notes: brakeForm.notes || undefined,
        source: 'manual',
        kind: brakeForm.kind,
        scope: brakeForm.scope.length > 0 ? brakeForm.scope : undefined,
        measured: brakeServiceScopeResetsComponent(brakeForm.kind)
          ? {
              frontPadMm: brakeForm.scope.includes('front_pads') && brakeForm.frontPadMm
                ? parseFloat(brakeForm.frontPadMm)
                : undefined,
              rearPadMm: brakeForm.scope.includes('rear_pads') && brakeForm.rearPadMm
                ? parseFloat(brakeForm.rearPadMm)
                : undefined,
              frontDiscMm: brakeForm.scope.includes('front_discs') && brakeForm.frontRotorWidthMm
                ? parseFloat(brakeForm.frontRotorWidthMm)
                : undefined,
              rearDiscMm: brakeForm.scope.includes('rear_discs') && brakeForm.rearRotorWidthMm
                ? parseFloat(brakeForm.rearRotorWidthMm)
                : undefined,
            }
          : undefined,
        initializeIfPossible: brakeServiceScopeResetsComponent(brakeForm.kind),
      });
      setShowBrakeEntry(false);
      setBrakeEntryMode(null);
      setBrakeForm({
        date: '',
        odometerKm: '',
        workshopName: '',
        notes: '',
        kind: 'full_brake_service',
        scope: ['front_pads', 'rear_pads', 'front_discs', 'rear_discs'],
        frontPadMm: '',
        rearPadMm: '',
        frontRotorWidthMm: '',
        rearRotorWidthMm: '',
      });
      refreshBrakeHealth();
      invalidateHealthCache();
    } catch { /* error */ }
    setSubmittingBrake(false);
  };

  const openModal = (setter: (v: boolean) => void) => {
    setter(true);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setIsModalAnimating(true);
      });
    });
  };

  const closeModal = (setter: (v: boolean) => void) => {
    setIsModalAnimating(false);
    setIsModalClosing(true);
    setTimeout(() => {
      setter(false);
      setIsModalClosing(false);
    }, 400);
  };

  useEffect(() => {
    if (!initialModuleTab || initialModuleTab === 'overview') {
      onConsumeInitialModuleTab?.();
      return;
    }
    openHealthDetailTabModal(initialModuleTab, {
      openErrorCodes: () => openModal(setShowErrorCodes),
      openBattery: () => openModal(setShowBattery),
      openService: () => openModal(setShowService),
      openBrakes: () => {
        openModal(setShowBrakes);
        if (vehicleId) {
          api.vehicleIntelligence.brakeHealthDetail(vehicleId).then(setBrakeHealthDetail).catch(() => null);
        }
      },
      openTires: () => {
        setTireActionError(null);
        openModal(setShowTires);
        loadTireDetail();
      },
    });
    onConsumeInitialModuleTab?.();
  }, [initialModuleTab, onConsumeInitialModuleTab, vehicleId, loadTireDetail]);

  const anyModalOpen = showErrorCodes || showBattery || showService || showBrakes || showTires || showHvBattery;

  const formatRelativeTime = (iso: string | null | undefined): string => {
    if (!iso) return '—';
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `${days}d ago`;
    const weeks = Math.floor(days / 7);
    if (weeks < 5) return `${weeks}w ago`;
    const months = Math.floor(days / 30);
    return `${months}mo ago`;
  };

  const errorCodesHistory = dtcList.length > 0
    ? dtcList.map((d: any) => {
        const ts = d.firstSeenAt ?? d.lastSeenAt ?? d.createdAt;
        return {
          date: ts ? new Date(ts).toLocaleDateString('de-DE', { day: 'numeric', month: 'numeric', year: '2-digit' }) : '—',
          code: d.dtcCode ?? d.code ?? '',
          time: ts ? new Date(ts).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : '',
          severity: ((d.severity ?? 'WARNING').toLowerCase() === 'warning' ? 'medium' : (d.severity ?? 'medium').toLowerCase()) as 'low' | 'medium' | 'high' | 'critical',
          system: d.description ?? d.dtcCode ?? '',
          description: d.description ?? `DTC ${d.dtcCode ?? ''}`,
          mileage: '—',
          resolution: d.clearedAt ? 'Cleared' : '—',
          resolvedDate: d.clearedAt ? new Date(d.clearedAt).toLocaleDateString('de-DE', { day: 'numeric', month: 'numeric', year: '2-digit' }) : '—',
          technician: '—',
          workshop: '—',
          isActive: d.isActive ?? false,
          lastSeenAt: d.lastSeenAt,
        };
      })
    : [];

  const bSummary = batterySummary;
  const lvStartProxy = bSummary?.lv?.telemetry?.startProxy;
  const lvPubState = bSummary?.lv?.publicationState ?? bSummary?.currentState?.publicationState ?? 'INITIAL_CALIBRATION';
  const lvStatus = bSummary?.lv?.status ?? (lvPubState === 'INITIAL_CALIBRATION' ? 'calibrating' : lvPubState === 'STABILIZING' ? 'stabilizing' : 'ready');
  // Backend marks `status: 'estimate_unavailable'` when neither an LV voltage
  // reading nor a BatteryFeatures row exists — i.e. the vehicle has never
  // emitted a 12V/LV signal. We cross-check the telemetry fallbacks so the UI
  // never shows "No LV Battery detected" for a vehicle that actually reported
  // a voltage at some point (e.g. rare telemetry races).
  const lvNoBatteryDetected =
    lvStatus === 'estimate_unavailable'
    && (bSummary?.lv?.telemetry?.voltageV ?? null) == null
    && (bSummary?.currentState?.voltageV ?? null) == null
    && (bSummary?.currentTelemetry?.lvVoltageV ?? null) == null
    && (batteryLatest?.voltageV ?? null) == null;
  const lvIsCalibrating = !lvNoBatteryDetected && (lvStatus === 'calibrating' || lvPubState === 'INITIAL_CALIBRATION');
  const lvIsStabilizing = !lvNoBatteryDetected && (lvStatus === 'stabilizing' || lvPubState === 'STABILIZING');
  const voltageDisplay = (() => {
    const live = resolveCurrentLiveVoltage(bSummary, batteryLatest?.voltageV ?? null);
    return live != null ? live.toFixed(2) : null;
  })();
  const lvRestingValue: number | null = resolveCanonicalRestingVoltage(bSummary);
  const calibrationEstimate: number | null = lvIsCalibrating
    ? (bSummary?.lv?.estimatedHealthPercent ?? bSummary?.currentState?.estimatedLvHealthScore ?? null)
    : null;
  const batteryCondition = bSummary?.lv?.condition ?? bSummary?.condition ?? 'good';
  // LV "Estimated Battery Health" — behaviour-derived 3-bar indicator. The 12V
  // battery is never shown as a workshop-verified SOH %. We read the canonical
  // estimatedHealth block and fall back to the legacy condition only when the
  // (older) API shape is in play.
  const lvEstimatedHealth = bSummary?.lv?.estimatedHealth ?? null;
  const lvEstimatedStatus: BatteryHealthStatus =
    lvEstimatedHealth?.status ??
    (batteryCondition === 'good'
      ? 'GOOD'
      : batteryCondition === 'watch'
        ? 'WATCH'
        : batteryCondition === 'attention'
          ? 'WARNING'
          : 'UNKNOWN');
  const lvEstimatedBars: 0 | 1 | 2 | 3 =
    lvEstimatedHealth?.bars ??
    (lvEstimatedStatus === 'GOOD'
      ? 3
      : lvEstimatedStatus === 'WATCH'
        ? 2
        : lvEstimatedStatus === 'WARNING' || lvEstimatedStatus === 'CRITICAL'
          ? 1
          : 0);
  // LV resting voltage with battery-spec aware status (lead-acid / AGM / EFB;
  // lithium is UNSUPPORTED so no false lead-acid alert is shown).
  const lvResting = bSummary?.lv?.restingVoltage ?? null;
  const lvRestingStatus: BatteryRestingVoltageStatus = lvResting?.status ?? 'UNKNOWN';
  const lvBatteryTypeLabel = lvResting?.batteryType && lvResting.batteryType !== 'UNKNOWN'
    ? lvResting.batteryType.replace(/_/g, ' ')
    : bSummary?.specs?.batteryType ?? null;
  const lvEstimatedTooltip =
    'Aus Ruhespannung, Startdip, Erholung und Stabilität abgeleitet. Dies ist kein werkstattverifizierter SOH.';
  const batteryLastCheckedAgo = (() => {
    const lc = bSummary?.lv?.freshness?.observedAt ?? bSummary?.currentState?.lastChecked;
    if (!lc) return null;
    const ms = Date.now() - new Date(lc).getTime();
    if (ms < 60000) return 'just now';
    if (ms < 3600000) return `${Math.floor(ms / 60000)} min ago`;
    if (ms < 86400000) return `${Math.floor(ms / 3600000)} h ago`;
    return `${Math.floor(ms / 86400000)} d ago`;
  })();
  const lvCalibration = bSummary?.lv?.calibrationProgress ?? bSummary?.currentState?.calibrationProgress ?? null;
  const formatCalibrationDays = (days: number) => (days >= 1 ? `${Math.floor(days)}` : '<1');
  const calibrationPathLabel = lvCalibration?.measurementPath === 'rest_and_crank' ? 'Ruhe + Start' : 'Nur Ruhe';
  const calibrationStatusText = (() => {
    if (!lvIsCalibrating || !lvCalibration) return 'Ruhespannungsmessungen laufen';
    if (lvCalibration.daysRemainingForStabilizing > 0) {
      return `Wartet auf Mindestzeit: ${formatCalibrationDays(lvCalibration.daysSinceFirstMeasurement)}/${lvCalibration.minimumDaysForStabilizing} Tage`;
    }

    const blockers: string[] = [];
    if (lvCalibration.blockers.includes('qualified_events')) {
      blockers.push(`${lvCalibration.qualifiedEventCount}/${lvCalibration.minimumQualifiedEventsForStabilizing} Messereignisse`);
    }
    if (lvCalibration.blockers.includes('rest_observations')) {
      blockers.push(`${lvCalibration.restObservationCount}/${lvCalibration.minimumRestObservationsForStabilizing} Ruhespannungen`);
    }
    if (lvCalibration.blockers.includes('crank_observations') && lvCalibration.minimumCrankObservationsForStabilizing > 0) {
      blockers.push(`${lvCalibration.crankObservationCount}/${lvCalibration.minimumCrankObservationsForStabilizing} Startzyklen`);
    }
    if (blockers.length > 0) {
      return `5 Tage erreicht, aber noch zu wenig Daten: ${blockers.join(' · ')}`;
    }
    return 'Messwerte werden gerade verifiziert';
  })();
  const calibrationMetricsText = lvCalibration
    ? [
        `Pfad: ${calibrationPathLabel}`,
        `${lvCalibration.qualifiedEventCount}/${lvCalibration.minimumQualifiedEventsForStabilizing} Events`,
        `${lvCalibration.restObservationCount}/${lvCalibration.minimumRestObservationsForStabilizing} Ruhe`,
        ...(lvCalibration.minimumCrankObservationsForStabilizing > 0
          ? [`${lvCalibration.crankObservationCount}/${lvCalibration.minimumCrankObservationsForStabilizing} Starts`]
          : []),
      ].join(' · ')
    : null;
  const calibrationFreshnessText = (() => {
    if (!lvIsCalibrating) return null;
    if ((lvCalibration?.lastMeasurementAgeMs ?? null) != null && (lvCalibration?.lastMeasurementAgeMs ?? 0) >= 86400000 && batteryLastCheckedAgo) {
      return `Letzter frischer Messwert: ${batteryLastCheckedAgo}. Aktuell fehlen neue Messwerte.`;
    }
    if (voltageDisplay) {
      return `Aktuelle Spannung: ${voltageDisplay} V`;
    }
    return null;
  })();
  const exteriorAmbient = resolveExteriorAmbientTemperature(batteryRecentTrips, tripProfile);
  const exteriorAmbientDisplay = formatExteriorAmbientDisplay(exteriorAmbient);
  const batteryLvSummaryVm = useMemo(
    () => buildBatteryLvSummaryVm(bSummary, batteryLatest?.voltageV ?? null),
    [bSummary, batteryLatest?.voltageV],
  );
  const batteryLvDetailVm = useMemo(
    () =>
      buildBatteryLvDetailVm(batteryDetail, bSummary, {
        liveMapVoltage: batteryLatest?.voltageV ?? null,
        exteriorAmbient: exteriorAmbientDisplay,
      }),
    [batteryDetail, bSummary, batteryLatest?.voltageV, exteriorAmbientDisplay],
  );
  const batteryHvSummaryVm = useMemo(() => buildBatteryHvSummaryVm(bSummary), [bSummary]);
  const batteryHvDetailVm = useMemo(
    () => buildBatteryHvDetailVm(batteryDetail, bSummary),
    [batteryDetail, bSummary],
  );
  const batteryMeasurementRows = buildBatteryMeasurementRows(batteryDetail, bSummary);
  const batteryRestingChartPoints = buildRestingVoltageTrendPoints(
    batteryDetail?.detail?.lv?.evidence ?? [],
    batteryChartTab === 'monat' ? 30 : 7,
    lvResting?.batteryType ?? bSummary?.specs?.batteryType,
  );
  const batteryChartDomain = restingVoltageChartDomain(lvResting?.batteryType ?? bSummary?.specs?.batteryType);
  const batteryChartData = batteryRestingChartPoints;

  // Canonical Health-tab summary — only the service/compliance module is consumed
  // by the Next-Service quick card. The former aggregated meta-summary, findings
  // list and data-basis box were removed (V4.9.48): each fach-box owns its truth,
  // and warning lights now live in the dedicated "Tacho Warnleuchten" box.
  const serviceComplianceModule = healthTabSummary?.moduleStates?.service_compliance;

  const cardClass = 'surface-premium p-2.5 overflow-hidden';
  const quickCardClass = `${cardClass} flex flex-col cursor-pointer transition-all duration-300 ease-out hover:-translate-y-0.5 relative overflow-hidden group`;
  const quickCardHeaderClass = 'flex items-center justify-between mb-1 relative z-10';
  const quickCardTitleClass = 'text-[10px] font-bold tracking-tight text-foreground';
  const quickCardBodyClass = 'flex-1 flex flex-col justify-center relative z-10';
  const quickCardFooterClass = 'mt-1 pt-1 border-t border-border/50 relative z-10';

  return (
    <div className="relative">
      <div
        className="grid grid-cols-1 lg:grid-cols-[1.4fr_2.55fr] gap-3 transition-all duration-500 ease-out origin-center items-start"
        style={{
          transform: isModalAnimating ? 'scale(0.92)' : 'scale(1)',
          filter: isModalAnimating ? 'blur(12px)' : 'blur(0px)',
          opacity: isModalAnimating ? 0.4 : 1,
          pointerEvents: (anyModalOpen || isModalClosing) ? 'none' : 'auto',
        }}
      >
        {/* ─── Tacho Warnleuchten – col 1 ─── */}
        <div ref={telltalesSectionRef} className="min-w-0 self-start">
          <DashboardWarningLightsPanel
            telltales={canonicalDashboardLights}
            loading={dashboardLightsLoading && !canonicalDashboardLights}
            oilLevelDisplay={aiHealthCare?.oilLevelDisplay}
            vehicleId={vehicleId}
            onOpenBooking={onOpenBooking}
            onOpenTrips={onOpenTrips}
            syncErrorMessage={
              healthTabSummary?.sourceStatus.highMobility === 'sync_error'
                ? 'High Mobility synchronization failed'
                : aiHealthCare?.hmLastErrorAt && aiHealthCare?.hmLastErrorMessage
                  ? aiHealthCare.hmLastErrorMessage
                  : null
            }
          />
        </div>

        {/* ─── Right Column: Quick Cards ─── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 h-fit auto-rows-fr">
        {/* ─── Error Codes card ─── */}
        {(() => {
          const s = dtcSummary;
          const dtcStatus = s?.status ?? (activeDtcCount > 0 ? 'active_faults' : lastDtcChecked ? 'clean' : 'unavailable');
          const isStale = s?.isStale ?? false;
          const faultCount = s?.activeFaultCount ?? (dtcStatus === 'active_faults' ? activeDtcCount : 0);
          const checkedAt = s?.lastCheckedAt ?? lastDtcChecked;
          const accent = quickCardAccentFromRentalState(rentalHealth?.modules.error_codes.state);
          return (
            <div onClick={() => openModal(setShowErrorCodes)} className={`${quickCardClass} order-1`}>
              {/* Subtle gradient backdrop */}
              <div className={`absolute top-0 right-0 w-32 h-32 rounded-full blur-3xl pointer-events-none transition-opacity ${accent.backdrop}`} />
              <div className={quickCardHeaderClass}>
                <div className="flex items-center gap-2">
                  <div className={`p-1.5 rounded-lg ${accent.iconBox}`}>
                    <Icon name="alert-circle" className="w-3.5 h-3.5" />
                  </div>
                  <h3 className={quickCardTitleClass}>Error Codes</h3>
                </div>
                <Icon name="chevron-right" className={`w-4 h-4 text-muted-foreground transition-transform group-hover:translate-x-0.5`} />
              </div>
              <div className={`${quickCardBodyClass} items-center`}>
                {dtcStatus === 'unavailable' && (
                  <>
                    <span className={`text-3xl mb-1 text-muted-foreground/60`}>—</span>
                    <p className={`text-[10px] font-medium text-center text-muted-foreground`}>Noch nicht geprüft</p>
                  </>
                )}
                {dtcStatus === 'stale' && (
                  <>
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center mb-2 shadow-sm ${'sq-tone-watch ring-1 ring-border'}`}>
                      <Icon name="alert-triangle" className={`w-4 h-4 ${'text-[color:var(--status-watch)]'}`} />
                    </div>
                    <p className={`text-[10px] font-semibold text-center ${'text-[color:var(--status-watch)]'}`}>Datenstand verzögert / Abruf fehlgeschlagen</p>
                  </>
                )}
                {(dtcStatus === 'clean' || dtcStatus === 'active_faults') && (
                  <>
                    <div className={`text-[40px] font-black tracking-tighter leading-none ${faultCount > 0 ? accent.countText : 'text-foreground'}`}>{faultCount}</div>
                    {faultCount === 0 && (
                      <div className={`mt-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-widest ${'sq-chip-success'}`}>
                        <Icon name="check-circle" className="w-2.5 h-2.5" /> Keine Fehler
                      </div>
                    )}
                    {faultCount > 0 && (
                      <div className={`mt-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-widest ${accent.faultBadge}`}>
                        {faultCount} Fehlercode{faultCount > 1 ? 's' : ''}
                      </div>
                    )}
                  </>
                )}
              </div>
              <div className={`${quickCardFooterClass} flex items-center gap-1.5`}>
                {isStale && <Icon name="alert-triangle" className={`w-3 h-3 shrink-0 ${'text-[color:var(--status-watch)]'}`} />}
                <p className={`text-[10px] font-medium ${isStale ? ('text-[color:var(--status-watch)]') : 'text-muted-foreground'}`}>
                  {checkedAt ? formatRelativeTime(checkedAt) : '—'}
                </p>
              </div>
            </div>
          );
        })()}

        {/* ─── Battery card (12V) — canonical LV summary ─── */}
        <BatteryLvSummaryCard
          vm={batteryLvSummaryVm}
          onOpenDetail={() => openModal(setShowBattery)}
          quickCardClass={quickCardClass}
          quickCardHeaderClass={quickCardHeaderClass}
          quickCardTitleClass={quickCardTitleClass}
          quickCardBodyClass={quickCardBodyClass}
          quickCardFooterClass={quickCardFooterClass}
          accentBackdrop={quickCardAccentFromRentalState(rentalHealth?.modules.battery.state).backdrop}
          accentIconBox={quickCardAccentFromRentalState(rentalHealth?.modules.battery.state).iconBox}
          telltaleSlot={
            isBatteryTelltaleActive(
              canonicalDashboardLights,
              aiHealthCare?.indicators?.batteryWarningLight,
            ) ? (
              <span
                title="Dashboard-Warnleuchte leuchtet — Lichtmaschine und Ladezustand prüfen"
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-widest border animate-pulse sq-chip-watch border-border"
              >
                <img src={tellTaleBatteryIcon} alt="" aria-hidden="true" className="w-3 h-3 object-contain" />
                Warnleuchte
              </span>
            ) : undefined
          }
        />

        {/* ─── Nächster Service (HM/OEM) + TÜV/BOKraft ─── */}
        {(() => {
          const si = serviceInfo;
          const nsDisplay = buildNextServiceDisplay(si, {
            loading: serviceInfoLoading,
            error: serviceInfoError,
          });
          const useCanonicalService =
            healthTabSummaryLoadState === 'loaded' && serviceComplianceModule != null;
          const canonicalPrimaryLine = useCanonicalService
            ? serviceComplianceModule.label
            : nsDisplay.primaryLine;
          const canonicalTrackingStatus = useCanonicalService
            ? serviceComplianceModule.nextService
              ? 'TRACKED'
              : 'NO_TRACKING'
            : nsDisplay.trackingStatus;
          const canonicalTone = useCanonicalService
            ? nextServiceSummaryTone(serviceComplianceModule.state)
            : nsDisplay.tone;
          const tuv = useCanonicalService && serviceComplianceModule.tuev?.dueDate
            ? {
                validTill: formatComplianceDueDate(serviceComplianceModule.tuev.dueDate),
                tone: nextServiceSummaryTone(serviceComplianceModule.tuev.state),
                label: 'TÜV',
                status: serviceComplianceModule.tuev.state === 'unknown' ? 'no_data' as const : 'ok' as const,
                detail: complianceDateStateLabel(serviceComplianceModule.tuev.state),
                blocksRentalHint: serviceComplianceModule.tuev.state === 'critical',
              }
            : buildTuvComplianceDisplay(si);
          const bok = useCanonicalService && serviceComplianceModule.bokraft?.dueDate
            ? {
                validTill: formatComplianceDueDate(serviceComplianceModule.bokraft.dueDate),
                tone: nextServiceSummaryTone(serviceComplianceModule.bokraft.state),
                label: 'BOKraft',
                status: serviceComplianceModule.bokraft.state === 'unknown' ? 'no_data' as const : 'ok' as const,
                detail: complianceDateStateLabel(serviceComplianceModule.bokraft.state),
                blocksRentalHint: serviceComplianceModule.bokraft.state === 'critical',
              }
            : buildBokraftComplianceDisplay(si);
          const nextColor = nextServiceToneClass(canonicalTone);
          const barColor =
            canonicalTone === 'critical'
              ? 'bg-red-500'
              : canonicalTone === 'warning'
                ? 'bg-amber-500'
                : canonicalTone === 'good'
                  ? 'bg-emerald-500'
                  : 'bg-muted-foreground/40';

          const borderHighlight = serviceCardBorderFromRentalState(
            rentalHealth?.modules.service_compliance.state,
          );
          const serviceAccent = quickCardAccentFromRentalState(rentalHealth?.modules.service_compliance.state);

          return (
            <div onClick={() => openModal(setShowService)} className={`${quickCardClass} order-3 ${borderHighlight}`}>
              <div className={`absolute top-0 right-0 w-32 h-32 rounded-full blur-3xl pointer-events-none ${serviceAccent.backdrop}`} />
              <div className={quickCardHeaderClass}>
                <div className="flex items-center gap-2">
                  <div className={`p-1.5 rounded-lg ${serviceAccent.iconBox}`}>
                    <Icon name="wrench" className="w-3.5 h-3.5" />
                  </div>
                  <h3 className={quickCardTitleClass}>Nächster Service</h3>
                  {!useCanonicalService && nsDisplay.badge && (
                    <span className={`px-2 py-0.5 rounded-full text-[8px] font-bold uppercase tracking-widest border ${
                      nsDisplay.tone === 'critical'
                        ? 'bg-red-100 text-red-700 border-red-200 dark:bg-red-500/15 dark:text-red-400 dark:border-red-500/30'
                        : nsDisplay.tone === 'warning'
                          ? 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-500/15 dark:text-amber-400 dark:border-amber-500/30'
                          : 'bg-muted text-muted-foreground border-border'
                    }`}>
                      {nsDisplay.badge}
                    </span>
                  )}
                  {useCanonicalService && serviceComplianceModule.state === 'no_tracking' && (
                    <span className="px-2 py-0.5 rounded-full text-[8px] font-bold uppercase tracking-widest border bg-muted text-muted-foreground border-border">
                      No Tracking
                    </span>
                  )}
                </div>
                <Icon name="chevron-right" className={`w-4 h-4 text-muted-foreground transition-transform group-hover:translate-x-0.5`} />
              </div>
              {canonicalTrackingStatus === 'TRACKED' && (canonicalTone === 'critical' || canonicalTone === 'warning') && (
                <div className={`w-full h-2 rounded-full overflow-hidden mb-3 bg-muted shadow-inner relative z-10`}>
                  <div className={`h-full ${barColor} rounded-full transition-all`} style={{ width: '100%' }} />
                </div>
              )}
              <div className="flex flex-col justify-between flex-1 gap-3 relative z-10">
                <div>
                  <p className={`text-[9px] uppercase tracking-widest font-bold mb-1 text-muted-foreground/70`}>HM/OEM-Tracking</p>
                  <p className={`text-[10px] font-bold ${nextColor}`}>{canonicalPrimaryLine}</p>
                  {!useCanonicalService && nsDisplay.sourceLine && (
                    <p className="text-[9px] text-muted-foreground/80 mt-0.5">{nsDisplay.sourceLine}</p>
                  )}
                </div>
                <div>
                  <p className={`text-[9px] uppercase tracking-widest font-bold mb-1 text-muted-foreground/70`}>TÜV</p>
                  <p className={`text-[10px] font-bold ${nextServiceToneClass(tuv.tone)}`}>
                    {tuv.validTill ?? '—'}
                  </p>
                  <p className={`text-[10px] mt-0.5 font-medium ${nextServiceToneClass(tuv.tone)}`}>
                    {tuv.label}{tuv.status !== 'no_data' ? ` · ${tuv.detail}` : ''}
                  </p>
                  {tuv.blocksRentalHint && (
                    <p className="text-[10px] mt-1 font-bold text-red-600 dark:text-red-400">Nicht vermieten</p>
                  )}
                </div>
                <div>
                  <p className={`text-[9px] uppercase tracking-widest font-bold mb-1 text-muted-foreground/70`}>BOKraft</p>
                  <p className={`text-[10px] font-bold ${nextServiceToneClass(bok.tone)}`}>
                    {bok.validTill ?? '—'}
                  </p>
                  <p className={`text-[10px] mt-0.5 font-medium ${nextServiceToneClass(bok.tone)}`}>
                    {bok.label}{bok.status !== 'no_data' ? ` · ${bok.detail}` : ''}
                  </p>
                  {bok.blocksRentalHint && (
                    <p className="text-[10px] mt-1 font-bold text-red-600 dark:text-red-400">Nicht vermieten</p>
                  )}
                </div>
                {( !useCanonicalService && (nsDisplay.showHmOverdueHint || nsDisplay.showHmDueSoonHint)) && (
                  <div className={`rounded-lg px-2.5 py-2 text-[9px] leading-snug font-medium border ${
                    nsDisplay.showHmOverdueHint
                      ? 'bg-red-50 border-red-200 text-red-700 dark:bg-red-500/10 dark:border-red-500/30 dark:text-red-300'
                      : 'bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-500/10 dark:border-amber-500/30 dark:text-amber-300'
                  }`}>
                    {nsDisplay.description}
                  </div>
                )}
              </div>
            </div>
          );
        })()}

        {/* ─── Brakes Quick View — canonical condition (measured vs estimated honesty) ─── */}
        {(() => {
          const bhs = brakeHealthSummary;
          // Canonical condition is the single source of truth (estimates cap at
          // WARNING; CRITICAL only from a real measured/documented safety signal).
          const condition = bhs?.overallCondition ?? 'UNKNOWN';
          const style = brakeConditionStyle(condition);
          const hasData = condition !== 'UNKNOWN';
          const brakeAccent = quickCardAccentFromRentalState(rentalHealth?.modules.brakes.state);
          const basisLabel = bhs?.dataBasis ? BRAKE_BASIS_LABEL[bhs.dataBasis] : null;
          const confLabel = bhs?.confidenceLevel ? BRAKE_CONFIDENCE_LABEL[bhs.confidenceLevel] : null;
          const overview = brakeOverviewLabel(bhs, 'de');
          const remainingLabel = brakeRemainingKmLabel(bhs, 'de');
          const nextInspection = bhs?.nextInspectionRecommendedInKm ?? null;
          const openAlerts = bhs?.openAlerts ?? [];
          const tintBg = brakeAccent.backdrop;
          return (
            <div onClick={() => { openModal(setShowBrakes); if (vehicleId) api.vehicleIntelligence.brakeHealthDetail(vehicleId).then(setBrakeHealthDetail).catch(() => null); }} className={`${quickCardClass} order-6 ${!hasData ? 'opacity-60' : ''}`}>
              {/* Subtle gradient backdrop */}
              <div className={`absolute top-0 right-0 w-32 h-32 rounded-full blur-3xl pointer-events-none ${tintBg}`} />
              <div className={quickCardHeaderClass}>
                <div className="flex items-center gap-2">
                  <div className={`p-1.5 rounded-lg ${brakeAccent.iconBox}`}>
                    <Icon name="disc" className="w-3.5 h-3.5" />
                  </div>
                  <h3 className={quickCardTitleClass}>Brake Health</h3>
                  {openAlerts.length > 0 && <span className="w-2 h-2 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.8)] animate-pulse" />}
                </div>
                <Icon name="chevron-right" className={`w-4 h-4 text-muted-foreground transition-transform group-hover:translate-x-0.5`} />
              </div>
              <div className={quickCardBodyClass}>
                {/* Condition pill + data basis */}
                <div className="mb-2 flex items-center gap-2 flex-wrap">
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-widest ${style.pill}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
                    {style.label}
                  </span>
                  {basisLabel && (
                    <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">{basisLabel}{confLabel ? ` · ${confLabel}` : ''}</span>
                  )}
                </div>
                {hasData ? (
                  <div className="space-y-1">
                    <p className="text-[10px] font-medium text-foreground">{overview}</p>
                    <p className="text-[10px] font-medium text-muted-foreground">
                      Restlaufzeit:{' '}
                      <span className="font-bold text-foreground tabular-nums">{remainingLabel}</span>
                    </p>
                    {nextInspection != null && (
                      <p className="text-[10px] font-medium text-muted-foreground">
                        Inspection in: <span className="font-bold text-foreground tabular-nums">{Math.round(nextInspection).toLocaleString('de-DE')} km</span>
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-[10px] text-muted-foreground">
                    Bremszustand wird ermittelt, sobald eine Werkstatt-Messung, ein Dokument oder ein Brems-Signal verfügbar ist.
                  </p>
                )}
              </div>
            </div>
          );
        })()}

        {/* ─── Tires — health % + estimated lifetime km ─── */}
        {(() => {
          const th = tireHealth;
          const hasTireData = tireHasTrackableData(th);
          const activeSetup = resolveActiveSetup(tiresData);
          const uiStatus = tireUiStatus(th);
          const tireSeg = tireStatusToSegment(uiStatus);
          const nextMeasurementLabel = formatTireQuickNextMeasurementLabel(th);
          const lastMeasuredAt = th?.lastMeasurementAt ?? th?.lastActualMeasurementAt ?? null;
          const tireAccent = quickCardAccentFromRentalState(rentalHealth?.modules.tires.state);
          return (
            <div onClick={() => { setTireActionError(null); openModal(setShowTires); loadTireDetail(); }} className={`${quickCardClass} order-5 ${!hasTireData ? 'opacity-60' : ''}`}>
              {/* Subtle gradient backdrop */}
              <div className={`absolute top-0 right-0 w-32 h-32 rounded-full blur-3xl pointer-events-none ${tireAccent.backdrop}`} />
              <div className={quickCardHeaderClass}>
                <div className="flex items-center gap-2">
                  <div className={`p-1.5 rounded-lg ${!hasTireData ? ('bg-muted text-muted-foreground') : tireAccent.iconBox}`}>
                    <Icon name="circle" className="w-3.5 h-3.5" />
                  </div>
                  <h3 className={quickCardTitleClass}>Tires</h3>
                  {hasTireData && (
                    <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-widest shadow-sm ${uiStatusAccentClass(uiStatus)}`}>
                      {tireForecastBadgeLabel(th)}
                    </span>
                  )}
                  {(th?.alerts?.length ?? 0) > 0 && <span className="w-2 h-2 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.8)] animate-pulse" />}
                </div>
                <Icon name="chevron-right" className={`w-4 h-4 text-muted-foreground transition-transform group-hover:translate-x-0.5`} />
              </div>
              {hasTireData ? (
                <div className={quickCardBodyClass}>
                  <p className="text-[10px] uppercase tracking-wider font-semibold mb-1 text-muted-foreground">
                    {tireUiStatusLabel(th)}
                  </p>
                  <div className="mb-2 flex items-center gap-2">
                    <SegmentedHealthIndicator
                      level={tireSeg.level}
                      tone={tireSeg.tone}
                      label={tireUiStatusLabel(th)}
                      ariaLabel={`Tires: ${tireUiStatusLabel(th)}`}
                    />
                  </div>
                  <p className="text-[10px] font-medium text-muted-foreground">
                    Profiltiefe:{' '}
                    <span className="font-bold text-foreground">{tireLowestTreadLabel(th)}</span>
                  </p>
                  <p className="text-[10px] font-medium text-muted-foreground">
                    Restlaufzeit:{' '}
                    <span className="font-bold text-foreground tabular-nums">
                      {tireRemainingKmLabel(th)}
                    </span>
                  </p>
                  {tireDefaultAssumptionWarning(th) && (
                    <p className="text-[10px] mt-1 font-medium text-[color:var(--status-watch)]">
                      {tireDefaultAssumptionWarning(th)}
                    </p>
                  )}
                  <p className="text-[10px] mt-1 font-medium text-muted-foreground">
                    Nächste Messung:{' '}
                    <span className="font-semibold text-foreground">{nextMeasurementLabel}</span>
                  </p>
                </div>
              ) : (
                <div className={quickCardBodyClass}>
                  <div className="mb-1 flex items-center gap-1.5">
                    <span className={`text-sm font-bold tracking-tight text-foreground`}>
                      No active Tracking
                    </span>
                  </div>
                  {activeSetup && (
                    <p className={`text-[10px] mb-1 font-medium text-muted-foreground`}>{activeSetup.brandModelFront ?? activeSetup.frontDimension ?? 'Setup'}</p>
                  )}
                  <p className={`text-[10px] text-muted-foreground`}>
                    Bitte Reifeninformationen hinterlegen, um die Reifenüberwachung zu aktivieren.
                  </p>
                </div>
              )}
              {hasTireData && (
                <div className={`${quickCardFooterClass} flex items-center gap-1.5`}>
                  <p className="text-[10px] font-medium text-muted-foreground/70">
                    Last measured: {lastMeasuredAt ? (formatMeasuredAgo(lastMeasuredAt) ?? '—') : '—'}
                  </p>
                </div>
              )}
              {/* HM Tire Pressure indicator */}
              {hmTirePressure && (
                <div className={`${quickCardFooterClass} flex items-center justify-between gap-2`}>
                  <p className="text-[10px] text-muted-foreground/70 shrink-0 font-medium">
                    {hmTirePressure.lastUpdatedAt ? (() => {
                      const ms = Date.now() - new Date(hmTirePressure.lastUpdatedAt!).getTime();
                      const h = Math.floor(ms / 3600000);
                      return h < 1 ? 'gerade eben' : `vor ${h}h`;
                    })() : '—'}
                  </p>
                  <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[8px] font-bold uppercase tracking-widest ${
                    hmTirePressure.overallStatus === 'OK' ? ('sq-chip-success') :
                    hmTirePressure.overallStatus === 'ISSUE' ? ('sq-chip-watch') :
                    ('bg-muted text-muted-foreground')
                  }`}>
                    {hmTirePressure.overallStatus === 'OK' ? <><Icon name="check-circle" className="w-2.5 h-2.5" /> Pressure OK</> :
                     hmTirePressure.overallStatus === 'ISSUE' ? <><Icon name="alert-triangle" className="w-2.5 h-2.5" /> Pressure Warning</> :
                     'No data'}
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {/* ─── HV Battery (EV/PHEV) or Complaint List (ICE) ─── */}
        {isEv ? (
          <BatteryHvSummaryCard
            vm={batteryHvSummaryVm}
            onOpenDetail={() => openModal(setShowHvBattery)}
            cardClass={cardClass}
          />
        ) : (
          <TechnicalObservationsHealthModule
            vehicleId={vehicleId}
            orgId={orgId}
            complaintsModule={rentalHealth?.modules.complaints}
            rentalHealthLoading={rentalHealthLoading}
            onOpenExistingTask={onOpenExistingTask}
            onHealthRefetch={async () => {
              await Promise.all([invalidateHealthCache(), retryBattery()]);
            }}
            quickCardClass={quickCardClass}
            quickCardHeaderClass={quickCardHeaderClass}
            quickCardTitleClass={quickCardTitleClass}
            quickCardBodyClass={quickCardBodyClass}
            quickCardFooterClass={quickCardFooterClass}
          />
        )}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════
          MODALS
         ═══════════════════════════════════════════════════════════════ */}

      {/* ─── Error Codes Modal ─── */}
      {showErrorCodes && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => closeModal(setShowErrorCodes)}>
          <div className="absolute inset-0 overlay-scrim transition-opacity duration-500 ease-out" style={{ opacity: isModalAnimating ? 1 : 0 }} />
          <div onClick={(e) => e.stopPropagation()} className={`relative w-full max-w-4xl p-5 transition-all duration-500 ease-out max-h-[85vh] overflow-y-auto pb-[max(1.25rem,calc(env(safe-area-inset-bottom)+0.5rem))] surface-premium`} style={{ transform: isModalAnimating ? 'scale(1) translateY(0)' : 'scale(0.9) translateY(30px)', opacity: isModalAnimating ? 1 : 0 }}>
            <button onClick={() => closeModal(setShowErrorCodes)} className={`absolute top-6 right-6 p-1.5 rounded-full transition-colors ${'text-muted-foreground hover:text-foreground hover:bg-muted'}`}><Icon name="x" className="w-5 h-5" /></button>

            {/* Modal header — title + single last-check meta only */}
            <div className="mb-4 pr-10">
              <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
                <h2 className="text-base font-semibold text-foreground">Error Codes</h2>
                {(() => {
                  const lastCheck =
                    dtcDetail?.monitoring?.lastSuccessfulCheckAt ??
                    dtcSummary?.lastSuccessfulCheckAt;
                  if (!lastCheck) return null;
                  return (
                    <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">
                      Letzte Prüfung: {formatRelativeTime(lastCheck)}
                    </span>
                  );
                })()}
              </div>
            </div>

            {dtcDetailLoading && <SkeletonCard className="mb-4" />}

            {!dtcDetailLoading && (() => {
              const d = dtcDetail;
              const sevCls = (sev: string) => ({
                high: 'sq-chip-critical',
                medium: 'sq-chip-watch',
                low: 'sq-chip-info',
              }[sev] ?? ('sq-chip-neutral'));
              const activeCount =
                d?.currentFaults?.activeFaults?.length ?? dtcSummary?.activeFaultCount ?? 0;
              const pollStatusLabel = (() => {
                if (d?.monitoring?.isStale || d?.currentFaults?.status === 'stale') return 'stale';
                const raw = String(d?.monitoring?.pollStatus ?? '').toLowerCase();
                if (!raw) return '—';
                if (raw === 'success' || raw === 'ok') return 'success';
                if (raw === 'active' || raw === 'running') return 'active';
                return d?.monitoring?.pollStatus ?? '—';
              })();
              const pollStatusClass =
                pollStatusLabel === 'stale'
                  ? 'text-[color:var(--status-watch)]'
                  : pollStatusLabel === 'success' || pollStatusLabel === 'active'
                    ? 'text-[color:var(--status-positive)]'
                    : 'text-muted-foreground';

              return (
                <>
                  {/* Current Fault Status */}
                  <div className="mb-4">
                    <h3 className="text-xs font-bold uppercase tracking-widest mb-3 text-muted-foreground">
                      Current Fault Status
                    </h3>

                    {(!d || d.currentFaults.status === 'unavailable') && (
                      <EmptyState
                        compact
                        icon={<Icon name="clock" className="w-5 h-5" />}
                        title="No DTC data available"
                        description="The first DTC poll runs every 3 hours — no check has been performed yet"
                        className="rounded-lg border bg-muted border-border py-6"
                      />
                    )}

                    {d?.currentFaults.status === 'stale' && (
                      <div className="flex items-center gap-3 p-4 rounded-lg border sq-tone-watch border-border">
                        <Icon name="alert-triangle" className="w-5 h-5 shrink-0 text-[color:var(--status-watch)]" />
                        <div>
                          <p className="text-sm font-semibold text-[color:var(--status-watch)]">
                            Current DTC status is outdated
                          </p>
                          <p className="text-xs text-[color:var(--status-watch)]">
                            The displayed DTC state may not reflect the actual vehicle condition. Wait for the next successful check.
                          </p>
                        </div>
                      </div>
                    )}

                    {d?.currentFaults.status === 'clean' && (
                      <div className="flex items-center gap-3 p-4 rounded-lg border sq-tone-success border-border">
                        <Icon name="check-circle" className="w-5 h-5 shrink-0 text-[color:var(--status-positive)]" />
                        <div>
                          <p className="text-sm font-semibold text-[color:var(--status-positive)]">
                            No active fault codes
                          </p>
                          <p className="text-xs text-[color:var(--status-positive)]">
                            Vehicle diagnostics are clear as of the last successful check
                          </p>
                        </div>
                      </div>
                    )}

                    {d?.currentFaults.status === 'active_faults' && d.currentFaults.activeFaults.length > 0 && (
                      <div className="space-y-3">
                        <p className="text-sm font-semibold text-foreground">
                          {activeCount} active fault code{activeCount !== 1 ? 's' : ''} detected
                        </p>
                        <div className="space-y-2">
                        {d.currentFaults.activeFaults.map((dtc: any, i: number) => {
                          const faultTone = dtcFaultCardTone(dtc.severity);
                          return (
                          <div key={dtc.id ?? i} className={`p-4 rounded-lg border ${faultTone.card}`}>
                            <div className="flex items-center gap-3 mb-2 flex-wrap">
                              <div className={`w-2 h-2 rounded-full ${faultTone.dot} animate-pulse shrink-0`} />
                              <span className={`px-3 py-1 rounded-full text-xs font-bold ${faultTone.codePill}`}>{dtc.code}</span>
                              <span className={`text-xs flex-1 font-medium text-foreground min-w-[120px]`}>{dtc.label}</span>
                              <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${rentalStatePillClasses(
                                rentalHealth?.modules.error_codes.state,
                              )}`} title="Fleet Health Modulstatus">
                                Betrieb: {rentalStateLabelDe(rentalHealth?.modules.error_codes.state)}
                              </span>
                              <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold capitalize ${sevCls(dtc.severity)}`} title="Roh-Severity aus DTC-Poll">
                                DTC: {dtc.severity}
                              </span>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 ml-0 sm:ml-5">
                              <div>
                                <p className="text-[10px] uppercase tracking-wider mb-0.5 text-muted-foreground/70">Category</p>
                                <p className="text-xs text-foreground/80">{dtc.category}</p>
                              </div>
                              <div>
                                <p className="text-[10px] uppercase tracking-wider mb-0.5 text-muted-foreground/70">First Seen</p>
                                <p className="text-xs text-foreground/80">{dtc.firstSeenAt ? new Date(dtc.firstSeenAt).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}</p>
                              </div>
                              <div>
                                <p className="text-[10px] uppercase tracking-wider mb-0.5 text-muted-foreground/70">Last Seen</p>
                                <p className="text-xs text-foreground/80">{dtc.lastSeenAt ? new Date(dtc.lastSeenAt).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}</p>
                              </div>
                            </div>
                            {renderDtcKnowledge(dtc, i)}
                          </div>
                          );
                        })}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Historical Fault Codes */}
                  <div className="mb-4">
                    <h3 className="text-xs font-bold uppercase tracking-widest mb-3 text-muted-foreground">
                      Historical Fault Codes
                    </h3>

                    {(!d || d.history.length === 0) ? (
                      <p className="text-sm text-muted-foreground/70">No historical DTC records yet</p>
                    ) : (
                      <div className="rounded-lg border overflow-x-auto border-border">
                        {/* Table header */}
                        <div className="grid grid-cols-[auto_1fr_auto_auto_auto_auto] gap-3 px-4 py-2 text-[10px] font-semibold uppercase tracking-wider bg-muted text-muted-foreground min-w-[520px]">
                          <span>Code</span>
                          <span>Label</span>
                          <span>Category</span>
                          <span>First Seen</span>
                          <span>Last Seen</span>
                          <span>Status</span>
                        </div>
                        {/* Table rows */}
                        {d.history.map((item: any, idx: number) => (
                          <div key={item.id ?? idx} className="grid grid-cols-[auto_1fr_auto_auto_auto_auto] gap-3 px-4 py-3 items-center text-xs border-t border-border hover:bg-muted/50 transition-colors min-w-[520px]">
                            <span className="font-bold font-mono text-[11px] text-[color:var(--brand)]">{item.code}</span>
                            <span className="truncate text-foreground/80">{item.label}</span>
                            <span className="text-[10px] text-muted-foreground">{item.category}</span>
                            <span className="text-[10px] tabular-nums text-muted-foreground">{item.firstSeenAt ? new Date(item.firstSeenAt).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—'}</span>
                            <span className="text-[10px] tabular-nums text-muted-foreground">{item.lastSeenAt ? new Date(item.lastSeenAt).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—'}</span>
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${item.isActive ? ('sq-chip-critical') : item.clearedAt ? ('sq-chip-success') : ('sq-chip-neutral')}`}>
                              {item.isActive ? 'Active' : item.clearedAt ? 'Cleared' : 'Historical'}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Compact monitoring meta (replaces DTC Monitoring section) */}
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-muted-foreground border-t border-border pt-3">
                    <span>
                      Kontrollintervall: alle {d?.monitoring?.pollIntervalHours ?? 3} Stunden
                    </span>
                    <span className={pollStatusClass}>
                      Status: {pollStatusLabel}
                    </span>
                    {d?.monitoring?.pollError && (
                      <span className="text-[color:var(--status-critical)]" title={d.monitoring.pollError}>
                        Letzter Abruf fehlgeschlagen
                      </span>
                    )}
                  </div>
                </>
              );
            })()}
            {vehicleId && (
              <HealthServiceActions
                vehicleId={vehicleId}
                healthModule="error_codes"
                rentalModule={rentalHealth?.modules.error_codes}
                dtcCodes={(dtcDetail?.currentFaults?.activeFaults ?? []).map((c: { dtcCode?: string; code?: string }) =>
                  String(c.dtcCode ?? c.code ?? ''),
                ).filter(Boolean)}
                onOpenServiceCenter={onOpenServiceCenter}
                onOpenExistingTask={onOpenExistingTask}
                className="mt-4 pt-4 border-t border-border"
              />
            )}
          </div>
        </div>,
        document.body
      )}

      {/* ─── Battery Modal ─── */}
      {showBattery && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => closeModal(setShowBattery)}>
          <div className="absolute inset-0 overlay-scrim transition-opacity duration-500 ease-out" style={{ opacity: isModalAnimating ? 1 : 0 }} />
          <div onClick={(e) => e.stopPropagation()} className={`relative w-full max-w-4xl max-h-[90vh] overflow-y-auto p-5 transition-all duration-500 ease-out pb-[max(1.25rem,calc(env(safe-area-inset-bottom)+0.5rem))] surface-premium`} style={{ transform: isModalAnimating ? 'scale(1) translateY(0)' : 'scale(0.9) translateY(30px)', opacity: isModalAnimating ? 1 : 0 }}>
            <button onClick={() => closeModal(setShowBattery)} className={`absolute top-5 right-5 p-1 rounded-full transition-colors z-10 ${'text-muted-foreground hover:text-foreground hover:bg-muted'}`}><Icon name="x" className="w-5 h-5" /></button>

            {/* Header + condition badge */}
            <div className="flex items-center gap-3 mb-5">
              <h2 className={`text-sm font-semibold tracking-tight text-foreground`}>Battery Health</h2>
              {batteryError ? (
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider sq-chip-critical">
                  Fehler
                </span>
              ) : bSummary?.dataQuality?.status ? (
                <BatteryDataQualityBadge status={bSummary.dataQuality.status} />
              ) : null}
              {lvNoBatteryDetected ? (
                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${'sq-chip-neutral'}`}>Not detected</span>
              ) : lvIsCalibrating ? (
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-status-info-soft text-status-info">Calibrating</span>
              ) : lvIsStabilizing ? (
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-700">Estimated · Stabilizing</span>
              ) : (
                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                  batteryCondition === 'good' ? 'bg-green-100 text-green-700' : batteryCondition === 'watch' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'
                }`}>{batteryCondition === 'good' ? 'Healthy' : batteryCondition === 'watch' ? 'Monitor' : 'Attention'}</span>
              )}
              {!lvNoBatteryDetected && !lvIsCalibrating && bSummary?.trendDirection && bSummary.trendDirection !== 'unknown' && (
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                  bSummary.trendDirection === 'stable' ? ('sq-chip-neutral') :
                  bSummary.trendDirection === 'improving' ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'
                }`}>{bSummary.trendDirection === 'stable' ? 'Stable' : bSummary.trendDirection === 'improving' ? 'Improving' : 'Declining'}</span>
              )}
              {/* Maturity info in detail view */}
              {bSummary?.currentState?.maturityConfidence && (
                <span className={`px-2 py-0.5 rounded-full text-[9px] font-semibold ${'sq-chip-neutral'}`}>
                  Confidence: {bSummary.currentState.maturityConfidence}
                </span>
              )}
            </div>

            {batteryError && (
              <BatteryHealthQueryErrorPanel
                error={batteryError}
                onRetry={retryBattery}
                retrying={batteryLoading}
                className="mb-4"
              />
            )}

            <BatteryLvDetailContent
              vm={batteryLvDetailVm}
              measurementRows={batteryMeasurementRows}
            />

            {/* 12V-Ruhespannung Verlauf */}
            <div className={`rounded-lg p-4 mb-4 bg-muted`}>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <p className={`text-[10px] uppercase tracking-wider font-semibold text-muted-foreground`}>
                  12V-Ruhespannung Verlauf
                </p>
                <div className={`inline-flex rounded-full p-0.5 ${'bg-muted'}`}>
                  <button type="button" onClick={() => setBatteryChartTab('woche')} className={`px-4 py-1 rounded-full text-[10px] font-semibold transition-all ${batteryChartTab === 'woche' ? 'surface-premium text-foreground' : 'text-muted-foreground'}`}>Woche</button>
                  <button type="button" onClick={() => setBatteryChartTab('monat')} className={`px-4 py-1 rounded-full text-[10px] font-medium transition-all ${batteryChartTab === 'monat' ? 'surface-premium text-foreground' : 'text-muted-foreground'}`}>Monat</button>
                </div>
              </div>
              {batteryChartData.length >= 2 ? (
                <>
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={batteryChartData} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                      <ReferenceArea y1={batteryChartDomain[0]} y2={batteryChartDomain[1]} fill="#22c55e" fillOpacity={0.08} />
                      <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} />
                      <YAxis domain={batteryChartDomain} axisLine={false} tickLine={false} tick={{ fontSize: 9, fill: 'var(--muted-foreground)' }} />
                      <Tooltip
                        cursor={{ stroke: 'var(--border)', strokeWidth: 1, strokeDasharray: '4 4' }}
                        content={({ active, payload }) => {
                          if (!active || !payload?.length) return null;
                          const d = payload[0].payload as (typeof batteryChartData)[number];
                          const statusLabel = restingVoltageStatusLabelDe(d.status);
                          return (
                            <div className="rounded-lg px-3 py-2 shadow-lg border border-border bg-popover text-popover-foreground text-[11px]">
                              <div className="font-semibold text-foreground">12V-Ruhespannung</div>
                              <div className="text-muted-foreground">{d.day} · {d.time}</div>
                              <div className="font-bold tabular-nums mt-1">{d.voltageV.toFixed(2)} V</div>
                              <div className="text-muted-foreground mt-0.5">Status: {statusLabel}</div>
                            </div>
                          );
                        }}
                      />
                      <Line type="monotone" dataKey="voltageV" stroke="var(--foreground)" strokeWidth={2} dot={{ r: 3, fill: 'var(--foreground)' }} activeDot={{ r: 5, fill: 'var(--brand)' }} />
                    </LineChart>
                  </ResponsiveContainer>
                  <p className="text-[9px] text-center text-muted-foreground mt-2">
                    Nur qualifizierte Ruhespannungs-Messungen — keine Lade- oder Live-Spannung.
                  </p>
                </>
              ) : (
                <p className="text-xs text-muted-foreground text-center py-8 px-2">
                  Noch nicht genug Ruhespannungs-Messungen für einen Verlauf.
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3 mb-5">
              {/* Watchpoints */}
              {bSummary && bSummary.watchpoints.length > 0 && (
                <div className={`rounded-lg p-5 ${'sq-tone-watch border border-border'}`}>
                  <p className={`text-[10px] uppercase tracking-wider font-semibold mb-3 ${'text-[color:var(--status-watch)]'}`}>Watchpoints</p>
                  <div className="space-y-2">
                    {bSummary.watchpoints.map((w, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <Icon name="alert-triangle" className={`w-3 h-3 mt-0.5 shrink-0 ${'text-[color:var(--status-watch)]'}`} />
                        <p className={`text-xs leading-relaxed text-foreground/80`}>{w}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Recommendations */}
              {bSummary && bSummary.recommendations.length > 0 && (
                <div className={`rounded-lg p-5 ${'sq-tone-info border border-border'}`}>
                  <p className={`text-[10px] uppercase tracking-wider font-semibold mb-3 ${'text-[color:var(--status-info)]'}`}>Recommendations</p>
                  <div className="space-y-2">
                    {bSummary.recommendations.map((r, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <Icon name="check-circle" className={`w-3 h-3 mt-0.5 shrink-0 ${'text-[color:var(--status-info)]'}`} />
                        <p className={`text-xs leading-relaxed text-foreground/80`}>{r}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Factory Specification */}
            <div className={`rounded-lg p-5 mb-5 bg-muted`}>
              <p className={`text-[10px] uppercase tracking-wider font-semibold mb-3 text-muted-foreground`}>Specification</p>
              <div className={`divide-y divide-border`}>
                {[
                  { label: 'Battery Type', value: bSummary?.specs?.batteryType || '—' },
                  { label: 'Capacity', value: bSummary?.specs?.batteryAmpere ? `${bSummary.specs.batteryAmpere} Ah` : '—' },
                  { label: 'Nominal Voltage', value: bSummary?.specs?.batteryVolt ? `${bSummary.specs.batteryVolt} V` : '—' },
                  { label: 'Data Source', value: bSummary?.specs?.sourceType ? bSummary.specs.sourceType.toLowerCase() : '—' },
                ].map((spec) => (
                  <div key={spec.label} className="flex items-center justify-between py-2">
                    <span className={`text-xs ${'text-muted-foreground'}`}>{spec.label}</span>
                    <span className={`text-xs font-semibold capitalize text-foreground`}>{spec.value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Detailed Readings */}
            <div className={`rounded-lg p-4 mb-4 bg-muted`}>
              <p className={`text-[10px] uppercase tracking-wider font-semibold mb-3 text-muted-foreground`}>Detailed Readings</p>
              {lvStartProxy && lvStartProxy.availability !== 'SUPPORTED' && (
                <p className="text-xs text-muted-foreground mb-3">
                  {lvStartProxy.uiLabelDe}: {lvStartProxy.availabilityLabelDe}
                </p>
              )}
              <div className={`divide-y divide-border`}>
                {[
                  {
                    l: '12V-Ruhespannung',
                    v: lvRestingValue != null ? `${lvRestingValue.toFixed(2)} V` : 'Nicht verfügbar',
                  },
                  {
                    l: 'Aktuelle Spannung',
                    v: voltageDisplay != null ? `${voltageDisplay} V` : 'Nicht verfügbar',
                  },
                  ...(lvStartProxy?.availability === 'SUPPORTED'
                    ? lvStartProxy.measurements
                        .filter((m) => m.numericValue != null)
                        .map((m) => ({
                          l: m.displayLabelDe,
                          v: `${formatBatteryVoltage(m.numericValue as number)} ${m.unit ?? 'V'} · ${m.classification}${m.offsetFromTargetMs != null ? ` · Δ ${m.offsetFromTargetMs} ms` : ''}${m.measurementAgeMs != null ? ` · ${Math.round(m.measurementAgeMs / 1000)} s alt` : ''}`,
                        }))
                    : []),
                  (() => {
                    const crankV = normalizeLvBatteryVoltage(bSummary?.currentState?.crankingVoltage);
                    return !lvStartProxy && crankV != null
                      ? { l: 'Startspannung / Crank Drop', v: `${formatBatteryVoltage(crankV)} V` }
                      : null;
                  })(),
                  (() => {
                    const chargingV = normalizeLvBatteryVoltage(bSummary?.currentState?.chargingVoltage);
                    return chargingV != null
                      ? { l: 'Ladespannung', v: `${formatBatteryVoltage(chargingV)} V` }
                      : null;
                  })(),
                  exteriorAmbient.valueC != null
                    ? { l: 'Außentemperatur', v: `${Math.round(exteriorAmbient.valueC * 10) / 10} °C` }
                    : { l: 'Außentemperatur', v: 'Nicht verfügbar' },
                ].filter((r): r is { l: string; v: string } => r != null).map((r) => (
                  <div key={r.l} className="flex items-center justify-between gap-3 py-2">
                    <span className={`text-xs text-muted-foreground`}>{r.l}</span>
                    <span className={`text-xs font-semibold text-foreground tabular-nums text-right`}>{r.v}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Battery History / Measurements */}
            <div>
              <p className={`text-[10px] uppercase tracking-wider font-semibold mb-3 text-muted-foreground`}>Messungen</p>
              {batteryMeasurementRows.length > 0 ? (
                <div className="space-y-2">
                  {batteryMeasurementRows.map((row) => (
                    <div key={row.id} className="flex items-start gap-3 px-3 py-2.5 rounded-xl bg-muted">
                      <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 bg-status-info-soft">
                        <Icon name={row.kind === 'service' ? 'wrench' : 'activity'} className={`w-3 h-3 ${row.kind === 'service' ? 'text-brand' : 'text-status-info'}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-foreground">{row.label}</p>
                        <p className="text-[11px] text-foreground/90 tabular-nums mt-0.5">{row.valueText}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{row.metaText}</p>
                      </div>
                      <span className="text-[10px] shrink-0 text-muted-foreground/70 tabular-nums text-right">{row.dateText}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className={`text-xs text-muted-foreground/70`}>Noch keine Messungen verfügbar</p>
              )}
            </div>

            {vehicleId && (
              <HealthServiceActions
                vehicleId={vehicleId}
                healthModule="battery"
                rentalModule={rentalHealth?.modules.battery}
                onOpenServiceCenter={onOpenServiceCenter}
                onOpenExistingTask={onOpenExistingTask}
                className="mt-4 pt-4 border-t border-border"
              />
            )}

          </div>
        </div>,
        document.body
      )}

      {/* ─── Service Modal ─── */}
      {showService && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => closeModal(setShowService)}>
          <div className="absolute inset-0 overlay-scrim transition-opacity duration-500 ease-out" style={{ opacity: isModalAnimating ? 1 : 0 }} />
          <div onClick={(e) => e.stopPropagation()} className={`relative w-full max-w-4xl max-h-[90vh] overflow-y-auto p-5 transition-all duration-500 ease-out surface-premium`} style={{ transform: isModalAnimating ? 'scale(1) translateY(0)' : 'scale(0.9) translateY(30px)', opacity: isModalAnimating ? 1 : 0 }}>
            <button onClick={() => closeModal(setShowService)} className={`absolute top-5 right-5 p-1 rounded-full transition-colors z-10 ${'text-muted-foreground hover:text-foreground hover:bg-muted'}`}><Icon name="x" className="w-5 h-5" /></button>
            <h2 className={`text-sm font-semibold tracking-tight mb-5 text-foreground`}>Service & Compliance</h2>

            {(() => {
              const nsDisplay = buildNextServiceDisplay(serviceInfo, {
                loading: serviceInfoLoading,
                error: serviceInfoError,
              });
              return (
                <div className={`rounded-lg p-5 mb-5 ${nextServicePanelClass(nsDisplay.tone)}`}>
                  <p className={`text-sm font-semibold mb-1 ${nextServiceToneClass(nsDisplay.tone)}`}>
                    {nsDisplay.title}
                  </p>
                  <p className={`text-sm font-bold mb-2 text-foreground`}>{nsDisplay.primaryLine}</p>
                  <p className="text-xs text-muted-foreground mb-2">{nsDisplay.description}</p>
                  {nsDisplay.sourceLine && (
                    <p className="text-xs text-muted-foreground">{nsDisplay.sourceLine}</p>
                  )}
                  {nsDisplay.lastUpdatedLabel && (
                    <p className="text-[11px] mt-2 text-muted-foreground">{nsDisplay.lastUpdatedLabel}</p>
                  )}
                </div>
              );
            })()}

            {vehicleId && serviceInfo?.taskSignals && serviceInfo.taskSignals.length > 0 && (
              <div className="mb-5">
                <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-2">
                  Aufgaben & Vorschläge
                </p>
                <ComplianceTaskActions vehicleId={vehicleId} signals={serviceInfo.taskSignals} />
              </div>
            )}

            {/* Active auto-tasks (V4.7.59) — materialized by the Insight→Task bridge */}
            {serviceAutoTasks.length > 0 && (
              <div className="rounded-lg p-4 mb-5 border border-amber-300/50 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/10">
                <div className="flex items-center gap-2 mb-2.5">
                  <Icon name="list-todo" className="w-4 h-4 text-amber-600 dark:text-amber-300" />
                  <p className="text-xs font-semibold text-amber-800 dark:text-amber-200">
                    Automatisch erzeugte Tasks ({serviceAutoTasks.length})
                  </p>
                </div>
                <div className="space-y-1.5">
                  {serviceAutoTasks.map((t) => (
                    <div key={t.id} className="flex items-center justify-between gap-3">
                      <span className="text-xs text-amber-900 dark:text-amber-100 truncate">{t.title}</span>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${t.priority === 'URGENT' ? 'bg-red-500/15 text-red-600 dark:text-red-300' : 'bg-amber-500/20 text-amber-700 dark:text-amber-300'}`}>
                        {t.priority === 'URGENT' ? 'Überfällig' : 'Bald fällig'}
                      </span>
                    </div>
                  ))}
                </div>
                <p className="text-[10px] mt-2.5 text-amber-700/80 dark:text-amber-300/70">
                  Sichtbar unter Task Management — wird automatisch geschlossen, sobald der Termin erledigt ist.
                </p>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
              {(() => {
                const tuv = buildTuvComplianceDisplay(serviceInfo);
                return (
                  <div className={`rounded-lg p-4 border bg-muted border-border`}>
                    <h3 className="text-sm font-semibold mb-3 text-foreground">TÜV</h3>
                    <p className={`text-lg font-bold ${nextServiceToneClass(tuv.tone)}`}>{tuv.label}</p>
                    <p className="text-xs text-muted-foreground mt-1">Gültig bis: {tuv.validTill ?? '—'}</p>
                    <p className={`text-xs mt-1 font-medium ${nextServiceToneClass(tuv.tone)}`}>{tuv.detail}</p>
                    {tuv.blocksRentalHint && (
                      <p className="text-xs mt-2 font-bold text-red-600 dark:text-red-400">Nicht vermieten — TÜV abgelaufen</p>
                    )}
                  </div>
                );
              })()}
              {(() => {
                const bok = buildBokraftComplianceDisplay(serviceInfo);
                return (
                  <div className={`rounded-lg p-4 border bg-muted border-border`}>
                    <h3 className="text-sm font-semibold mb-3 text-foreground">BOKraft</h3>
                    <p className={`text-lg font-bold ${nextServiceToneClass(bok.tone)}`}>{bok.label}</p>
                    <p className="text-xs text-muted-foreground mt-1">Gültig bis: {bok.validTill ?? '—'}</p>
                    <p className={`text-xs mt-1 font-medium ${nextServiceToneClass(bok.tone)}`}>{bok.detail}</p>
                    {bok.blocksRentalHint && (
                      <p className="text-xs mt-2 font-bold text-red-600 dark:text-red-400">Nicht vermieten — BOKraft abgelaufen</p>
                    )}
                  </div>
                );
              })()}
            </div>

            <div className="mb-5">
              <h3 className={`text-sm font-semibold mb-2 text-foreground`}>Servicehistorie</h3>
              <p className="text-xs text-muted-foreground mb-4">{serviceHistoryDisclaimer()}</p>
              {serviceInfo && serviceInfo.serviceHistory.length > 0 ? (
                <div className="space-y-3">
                  {serviceInfo.serviceHistory.map((item) => (
                    <div key={item.id} className="flex items-center gap-3 py-2 border-b border-border last:border-0">
                      <div className="shrink-0 min-w-0 flex-1">
                        <p className={`text-sm font-semibold text-foreground`}>{formatServiceEventTypeDe(item.eventType)}</p>
                        <p className={`text-xs text-muted-foreground`}>
                          {new Date(item.date).toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' })}
                          {item.odometerKm != null ? ` · ${item.odometerKm.toLocaleString('de-DE')} km` : ''}
                          {item.workshopName ? ` · ${item.workshopName}` : ''}
                        </p>
                      </div>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-muted text-muted-foreground shrink-0">Dokumentiert</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className={`text-xs text-muted-foreground/70`}>Noch keine Serviceereignisse dokumentiert</p>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ─── Brakes Modal V2 ─── */}
      {showBrakes && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => { if (!showBrakeEntry) closeModal(setShowBrakes); }}>
          <div className="absolute inset-0 overlay-scrim transition-opacity duration-500 ease-out" style={{ opacity: isModalAnimating ? 1 : 0 }} />
          <div onClick={(e) => e.stopPropagation()} className={`relative w-full max-w-4xl max-h-[90vh] overflow-y-auto p-5 transition-all duration-500 ease-out surface-premium`} style={{ transform: isModalAnimating ? 'scale(1) translateY(0)' : 'scale(0.9) translateY(30px)', opacity: isModalAnimating ? 1 : 0 }}>
            <button onClick={() => closeModal(setShowBrakes)} className={`absolute top-5 right-5 p-1 rounded-full transition-colors z-10 ${'text-muted-foreground hover:text-foreground hover:bg-muted'}`}><Icon name="x" className="w-5 h-5" /></button>

            {(() => {
              const bhs = brakeHealthSummary;
              const bhd = brakeHealthDetail;
              const stateClass = bhs?.stateClass ?? 'NO_BASELINE';
              const v2 = stateClass === 'MEASURED' || stateClass === 'ESTIMATED';
              const cardBg = 'bg-muted';
              const hSec = 'text-xs font-bold uppercase tracking-wider mb-3 text-muted-foreground';
              const lbl = 'text-[10px] uppercase tracking-wider font-semibold text-muted-foreground';
              const val = 'text-sm font-bold text-foreground';
              const sub = 'text-[10px] text-muted-foreground';

              const statusBadgeCls =
                stateClass === 'MEASURED'
                  ? 'sq-chip-success'
                  : stateClass === 'ESTIMATED'
                    ? 'sq-chip-info'
                    : stateClass === 'WARNING_ONLY'
                      ? 'sq-chip-watch'
                      : 'sq-chip-nodata';
              const statusLabel =
                stateClass === 'MEASURED'
                  ? 'Measured'
                  : stateClass === 'ESTIMATED'
                    ? 'Estimated'
                    : stateClass === 'WARNING_ONLY'
                      ? 'Warning only'
                      : 'No baseline';

              return (
                <>
                  {/* ── A) Header ── */}
                  <div className="flex items-center gap-3 mb-1">
                    <h2 className={`text-sm font-semibold tracking-tight text-foreground`}>Brake Health</h2>
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${statusBadgeCls}`}>{statusLabel}</span>
                    {bhs?.confidence && (
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                        bhs.confidence.label === 'High' ? 'sq-chip-success'
                        : bhs.confidence.label === 'Medium' ? 'sq-chip-watch'
                        : 'sq-chip-nodata'
                      }`}>{bhs.confidence.label} confidence ({bhs.confidence.score})</span>
                    )}
                  </div>
                  <p className={`text-[10px] mb-4 text-muted-foreground/70`}>
                    {v2
                      ? 'Canonical V2 anchor-based brake wear model (pads + discs, limiting component aware).'
                      : stateClass === 'WARNING_ONLY'
                        ? 'No modeled baseline yet. Warning telemetry is shown as warning-only context.'
                        : 'Brake wear estimation starts after a documented baseline with odometer and thickness anchor.'}
                  </p>

                  {/* ── Canonical evidence panel (per-component honesty) ── */}
                  {bhs && (
                    <BrakeEvidencePanel
                      summary={bhs}
                      locale="de"
                      onAction={(code) => {
                        if (code === 'RECORD_SERVICE' || code === 'MEASURE_THICKNESS') {
                          setShowBrakeEntry(true);
                          setBrakeEntryMode('manual');
                        }
                      }}
                      className="mb-4"
                    />
                  )}

                  {/* ── NOT INITIALIZED STATE ── */}
                  {!v2 && (
                    <>
                      <div className={`rounded-xl p-4 mb-4 border 'sq-tone-watch border border-border'`}>
                        <h3 className={`text-sm font-bold mb-2 'text-[color:var(--status-watch)]'`}>Brake tracking not initialized</h3>
                        <p className={`text-xs leading-relaxed mb-3 'text-[color:var(--status-watch)]'`}>
                          Brake wear estimation starts after a documented brake service or confirmed workshop report. Without a known starting pad/disc thickness, no reliable estimation is possible. Pre-anchor driving data is being collected but will NOT be used retroactively — tracking starts clean from the service anchor odometer.
                        </p>
                        {(bhs?.baselineWarnings?.length ?? 0) > 0 && (
                          <div className="mb-3 space-y-1">
                            {bhs?.baselineWarnings?.slice(0, 3).map((w, idx) => (
                              <p key={idx} className={`text-[10px] 'text-[color:var(--status-watch)]'`}>- {w}</p>
                            ))}
                          </div>
                        )}
                        <div className="flex gap-2">
                          <button onClick={() => { setShowBrakeEntry(true); setBrakeEntryMode('manual'); }} className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-colors 'sq-tone-ai hover:opacity-90'`}><Icon name="plus" className="w-3.5 h-3.5" /> Add Brake Service</button>
                          <button onClick={openHealthDocumentIntake} className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-colors 'sq-tone-info hover:opacity-90'`}><Icon name="upload" className="w-3.5 h-3.5" /> AI Upload Report</button>
                        </div>
                      </div>
                      <p className={`text-[10px] mb-4 text-muted-foreground/70`}>Driving and braking behavior is already being collected via the Driving Impact Engine and will be available once brake tracking is initialized.</p>
                    </>
                  )}

                  {v2 && bhd?.distanceSinceAnchorKm != null && (
                    <p className={`text-[10px] mb-4 text-muted-foreground/70`}>{bhd.distanceSinceAnchorKm.toLocaleString('de-DE')} km since anchor service</p>
                  )}

                  {/* ── INITIALIZED: Alerts ── */}
                  {v2 && bhd?.alerts && bhd.alerts.length > 0 && (
                    <div className="mb-4 space-y-2">
                      {bhd.alerts.map((a, i) => (
                        <div key={i} className={`rounded-lg px-4 py-2.5 flex items-start gap-2 ${
                          a.severity === 'critical' ? 'sq-tone-critical border border-border'
                          : a.severity === 'warning' ? 'sq-tone-watch border border-border'
                          : 'sq-tone-info border border-border'
                        }`}>
                          {a.severity === 'critical' ? <Icon name="shield-alert" className="w-3.5 h-3.5 mt-0.5 shrink-0 text-[color:var(--status-critical)]" /> : <Icon name="alert-triangle" className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${a.severity === 'warning' ? 'text-[color:var(--status-watch)]' : 'text-[color:var(--status-info)]'}`} />}
                          <span className={`text-xs 'text-foreground'`}>{a.message}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* ── C) Brake System Information ── */}
                  {(bhd?.specs || bhd?.brakeBiasInfo) && (
                    <div className="mb-4">
                      <h3 className={hSec}>Brake System Information</h3>
                      <div className="grid grid-cols-2 gap-3">
                        <div className={`rounded-xl p-4 ${cardBg}`}>
                          <p className={`${lbl} mb-2.5`}>Front Axle</p>
                          <div className="space-y-2">
                            {[
                              { l: 'Rotor Diameter', v: bhd?.specs?.frontRotorDiameter },
                              { l: 'Rotor Width (NEW)', v: bhd?.specs?.frontRotorWidth },
                              { l: 'Pad Thickness', v: bhd?.specs?.frontPadThickness },
                            ].map(r => (
                              <div key={r.l} className="flex items-center justify-between">
                                <span className={`text-xs text-muted-foreground`}>{r.l}</span>
                                <span className={val}>{r.v != null ? `${r.v} mm` : '—'}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                        <div className={`rounded-xl p-4 ${cardBg}`}>
                          <p className={`${lbl} mb-2.5`}>Rear Axle</p>
                          <div className="space-y-2">
                            {[
                              { l: 'Rotor Diameter', v: bhd?.specs?.rearRotorDiameter },
                              { l: 'Rotor Width (NEW)', v: bhd?.specs?.rearRotorWidth },
                              { l: 'Pad Thickness', v: bhd?.specs?.rearPadThickness },
                            ].map(r => (
                              <div key={r.l} className="flex items-center justify-between">
                                <span className={`text-xs text-muted-foreground`}>{r.l}</span>
                                <span className={val}>{r.v != null ? `${r.v} mm` : '—'}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                      {bhd?.brakeBiasInfo && (
                        <div className={`rounded-xl p-3 mt-3 ${cardBg}`}>
                          <div className="flex items-center justify-between">
                            <span className={`text-xs text-muted-foreground`}>Brake Force Distribution</span>
                            <span className={val}>{bhd.brakeBiasInfo.front}% / {bhd.brakeBiasInfo.rear}%</span>
                          </div>
                          <p className={`text-[9px] mt-1 text-muted-foreground/70`}>{bhd.brakeBiasInfo.source}{bhd.brakeBiasInfo.source.includes('EBD') ? ' — actual distribution is managed by the vehicle EBD system; this is used as a modeling fallback' : ''}</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* ── D) Brake History ── */}
                  <div className="mb-4">
                    <h3 className={hSec}>Brake History</h3>
                    {(bhd?.history ?? []).length > 0 ? (
                      <div className={` overflow-hidden 'surface-premium'`}>
                        {(bhd?.history ?? []).map((item: any, i: number, arr: any[]) => (
                          <div key={item.id} className={`flex items-center px-4 py-3 ${i < arr.length - 1 ? 'border-b border-border' : ''}`}>
                            <div className={`w-7 h-7 rounded-full flex items-center justify-center mr-3 shrink-0 'sq-tone-success'`}>
                              <Icon name="wrench" className={`w-3 h-3 'text-[color:var(--status-positive)]'`} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className={`text-xs font-semibold text-foreground`}>{item.serviceKind ? String(item.serviceKind).replace(/_/g, ' ') : 'Brake Service'}</p>
                              <p className={`text-[10px] text-muted-foreground`}>{new Date(item.date).toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' })}{item.workshopName ? ` · ${item.workshopName}` : ''}</p>
                              {item.notes && <p className={`text-[9px] mt-0.5 'text-muted-foreground'`}>{item.notes}</p>}
                            </div>
                            {item.odometerKm != null && <span className={`text-[10px] font-medium mr-2 text-muted-foreground`}>{item.odometerKm.toLocaleString('de-DE')} km</span>}
                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-semibold 'sq-chip-success'`}>Serviced</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className={` p-5 text-center 'surface-premium'`}>
                        <p className={`text-xs text-muted-foreground`}>No brake service events recorded yet.</p>
                      </div>
                    )}
                  </div>

                  {/* ── E) Actions ── */}
                  <div className="mb-4">
                    <h3 className={hSec}>Actions</h3>
                    {!showBrakeEntry && (
                      <div className="flex gap-2 mb-3">
                        <button onClick={() => { setShowBrakeEntry(true); setBrakeEntryMode('manual'); }} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors 'sq-tone-ai hover:opacity-90'`}><Icon name="plus" className="w-3 h-3" /> Add Brake Service</button>
                        <button onClick={openHealthDocumentIntake} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors 'sq-tone-info hover:opacity-90'`}><Icon name="upload" className="w-3 h-3" /> AI Upload Report</button>
                      </div>
                    )}
                    {showBrakeEntry && brakeEntryMode === 'manual' && (
                      <div className={`rounded-xl p-4 ${cardBg}`}>
                        <div className="grid grid-cols-2 gap-3 mb-3">
                          <div>
                            <label className={`block ${lbl} mb-1`}>Service type</label>
                            <select
                              value={brakeForm.kind}
                              onChange={(e) => setBrakeForm((p) => ({
                                ...p,
                                kind: e.target.value as BrakeServiceKindInput,
                              }))}
                              className={`w-full px-3 py-2 rounded-lg text-xs border bg-background border-border text-foreground`}
                            >
                              {BRAKE_SERVICE_KIND_OPTIONS.map((opt) => (
                                <option key={opt.value} value={opt.value}>{opt.labelEn}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className={`block ${lbl} mb-1`}>Scope</label>
                            <div className="flex flex-wrap gap-1.5">
                              {BRAKE_SERVICE_SCOPE_OPTIONS.map((opt) => {
                                const checked = brakeForm.scope.includes(opt.value);
                                return (
                                  <label key={opt.value} className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] border ${checked ? 'border-violet-500 bg-violet-500/10' : 'border-border'}`}>
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      onChange={() => setBrakeForm((p) => ({
                                        ...p,
                                        scope: checked
                                          ? p.scope.filter((s) => s !== opt.value)
                                          : [...p.scope, opt.value],
                                      }))}
                                      className="sr-only"
                                    />
                                    {opt.labelEn}
                                  </label>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3 mb-3">
                          <div><label className={`block ${lbl} mb-1`}>Date *</label><input type="date" value={brakeForm.date} onChange={e => setBrakeForm(p => ({ ...p, date: e.target.value }))} className={`w-full px-3 py-2 rounded-lg text-xs border 'bg-background border border-border text-foreground'`} /></div>
                          <div><label className={`block ${lbl} mb-1`}>Odometer (km)</label><input type="number" value={brakeForm.odometerKm} onChange={e => setBrakeForm(p => ({ ...p, odometerKm: e.target.value }))} placeholder="Current mileage" className={`w-full px-3 py-2 rounded-lg text-xs border 'bg-background border border-border text-foreground placeholder:text-muted-foreground'`} /></div>
                          <div><label className={`block ${lbl} mb-1`}>Workshop</label><input type="text" value={brakeForm.workshopName} onChange={e => setBrakeForm(p => ({ ...p, workshopName: e.target.value }))} placeholder="Optional" className={`w-full px-3 py-2 rounded-lg text-xs border 'bg-background border border-border text-foreground placeholder:text-muted-foreground'`} /></div>
                          <div><label className={`block ${lbl} mb-1`}>Notes</label><input type="text" value={brakeForm.notes} onChange={e => setBrakeForm(p => ({ ...p, notes: e.target.value }))} placeholder="e.g. Front pads + discs" className={`w-full px-3 py-2 rounded-lg text-xs border 'bg-background border border-border text-foreground placeholder:text-muted-foreground'`} /></div>
                        </div>
                        <p className={`${lbl} mt-2 mb-2`}>
                          {brakeServiceScopeResetsComponent(brakeForm.kind)
                            ? 'Measured thickness (optional — per scoped component)'
                            : 'Inspection / fluid service — no component reset'}
                        </p>
                        {brakeServiceScopeResetsComponent(brakeForm.kind) && (
                        <div className="grid grid-cols-4 gap-3 mb-3">
                          <div><label className={`block ${lbl} mb-1`}>Front Pad mm</label><input type="number" step="0.1" value={brakeForm.frontPadMm} onChange={e => setBrakeForm(p => ({ ...p, frontPadMm: e.target.value }))} placeholder="12" className={`w-full px-3 py-2 rounded-lg text-xs border 'bg-background border border-border text-foreground placeholder:text-muted-foreground'`} /></div>
                          <div><label className={`block ${lbl} mb-1`}>Rear Pad mm</label><input type="number" step="0.1" value={brakeForm.rearPadMm} onChange={e => setBrakeForm(p => ({ ...p, rearPadMm: e.target.value }))} placeholder="10" className={`w-full px-3 py-2 rounded-lg text-xs border 'bg-background border border-border text-foreground placeholder:text-muted-foreground'`} /></div>
                          <div><label className={`block ${lbl} mb-1`}>Front Rotor W mm</label><input type="number" step="0.1" value={brakeForm.frontRotorWidthMm} onChange={e => setBrakeForm(p => ({ ...p, frontRotorWidthMm: e.target.value }))} placeholder="28" className={`w-full px-3 py-2 rounded-lg text-xs border 'bg-background border border-border text-foreground placeholder:text-muted-foreground'`} /></div>
                          <div><label className={`block ${lbl} mb-1`}>Rear Rotor W mm</label><input type="number" step="0.1" value={brakeForm.rearRotorWidthMm} onChange={e => setBrakeForm(p => ({ ...p, rearRotorWidthMm: e.target.value }))} placeholder="22" disabled={!brakeForm.scope.includes('rear_discs')} className={`w-full px-3 py-2 rounded-lg text-xs border 'bg-background border border-border text-foreground placeholder:text-muted-foreground disabled:opacity-50'`} /></div>
                        </div>
                        )}
                        <div className="flex items-center gap-2">
                          <button onClick={handleLogBrakeChange} disabled={submittingBrake || !brakeForm.date} className="px-4 py-2 rounded-lg text-xs font-semibold bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50 transition-colors">{submittingBrake ? 'Saving...' : 'Save Brake Service'}</button>
                          <button onClick={() => { setShowBrakeEntry(false); setBrakeEntryMode(null); }} className={`px-3 py-2 rounded-lg text-xs font-semibold transition-colors 'text-muted-foreground hover:text-foreground'`}>Cancel</button>
                        </div>
                      </div>
                    )}
                    {showBrakeEntry && brakeEntryMode === 'upload' && (
                      <div className={`rounded-xl p-5 text-center ${cardBg}`}>
                        <Icon name="upload" className={`w-6 h-6 mx-auto mb-2 'text-[color:var(--status-info)]'`} />
                        <p className={`text-xs font-semibold mb-1 text-foreground`}>Upload Brake Service Document</p>
                        <p className={`text-[10px] mb-3 text-muted-foreground`}>Go to the AI Upload page to upload a brake service invoice or workshop report. Extracted data will be reviewed and confirmed before being applied.</p>
                        <button onClick={() => { setShowBrakeEntry(false); setBrakeEntryMode(null); }} className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors 'text-muted-foreground hover:text-foreground'`}>Close</button>
                      </div>
                    )}
                  </div>

                  {/* ── F) Estimate Quality ── */}
                  {v2 && bhd && (
                    <div className="mb-2">
                      <h3 className={hSec}>Estimate Quality</h3>
                      <div className={`rounded-xl p-4 ${cardBg}`}>
                        <div className="grid grid-cols-3 gap-3">
                          <div>
                            <p className={lbl}>Confidence</p>
                            <p className={`text-lg font-bold mt-1 text-foreground`}>{bhs?.confidence?.score ?? 0}<span className={`text-xs font-normal text-muted-foreground`}>/100</span></p>
                          </div>
                          <div>
                            <p className={lbl}>DI Engine</p>
                            <p className={`text-xs font-semibold mt-1.5 ${bhd.drivingImpactAvailable ? 'text-[color:var(--status-positive)]' : 'text-muted-foreground'}`}>{bhd.drivingImpactAvailable ? 'Connected' : 'No data'}</p>
                          </div>
                          <div>
                            <p className={lbl}>Model</p>
                            <p className={`text-xs font-semibold mt-1.5 'text-muted-foreground'`}>Anchor-based V2</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              );
            })()}
            {vehicleId && (
              <HealthServiceActions
                vehicleId={vehicleId}
                healthModule="brakes"
                rentalModule={rentalHealth?.modules.brakes}
                contextLines={[
                  brakeHealthSummary?.overallCondition
                    ? `Zustand: ${brakeHealthSummary.overallCondition}`
                    : '',
                ].filter(Boolean)}
                onOpenServiceCenter={onOpenServiceCenter}
                onOpenExistingTask={onOpenExistingTask}
                className="mt-4 pt-4 border-t border-border"
              />
            )}
          </div>
        </div>,
        document.body
      )}

      {/* ─── Tires Modal ─── */}
      {showTires && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => { if (!showMeasurement && !showRotation && !showTireChange && !showEditSetup) closeModal(setShowTires); }}>
          <div className="absolute inset-0 overlay-scrim transition-opacity duration-500 ease-out" style={{ opacity: isModalAnimating ? 1 : 0 }} />
          <div onClick={(e) => e.stopPropagation()} className={`relative w-full max-w-5xl max-h-[90vh] overflow-y-auto p-5 transition-all duration-500 ease-out pb-[max(1.25rem,calc(env(safe-area-inset-bottom)+0.5rem))] surface-premium`} style={{ transform: isModalAnimating ? 'scale(1) translateY(0)' : 'scale(0.9) translateY(30px)', opacity: isModalAnimating ? 1 : 0 }}>
            <button onClick={() => closeModal(setShowTires)} className={`absolute top-5 right-5 p-1 rounded-full transition-colors z-10 ${'text-muted-foreground hover:text-foreground hover:bg-muted'}`}><Icon name="x" className="w-5 h-5" /></button>

            {/* Header */}
            <div className="flex items-center gap-3 mb-4">
              <h2 className={`text-sm font-semibold tracking-tight text-foreground`}>Tire Health</h2>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider sq-tone-ai">
                {tireForecastBadgeLabel(tireDetail?.summary ?? tireHealth)}
              </span>
              {tireDetail?.factors.regressionActive && <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${'sq-chip-info'}`}>Regression</span>}
              {tireDetail?.factors.isStaggered && <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${'sq-chip-watch'}`}>Staggered</span>}
              {tireDetail && tireDetail.factors.regenBrakingFactorFront < 1 && <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${'sq-chip-success'}`}><Icon name="zap" className="w-3 h-3 inline -mt-0.5 mr-0.5" />Regen{tireDetail.factors.driveType ? ` (${tireDetail.factors.driveType})` : ''}</span>}
              {(tireDetail?.factors?.calibrationCount ?? 0) > 0 && <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${'sq-tone-ai'}`}>{tireDetail?.factors?.calibrationCount}× calibrated</span>}
            </div>

            {/* Canonical Tire Status (single source of truth) */}
            {(() => {
              const cs = tireDetail?.summary ?? tireHealth;
              if (!cs) return null;
              const style = tireStatusStyle(tireUiStatus(cs));
              const defaultWarning = tireDefaultAssumptionWarning(cs);
              const actions = tireStructuredActions(cs);
              return (
                <div className={`rounded-xl p-3 mb-3 border ${'bg-muted/50 border border-border'}`}>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                    <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider ${style.pill}`}>
                      {tireUiStatusLabel(cs)}
                    </span>
                    <span className="text-xs text-foreground font-medium">{tireLowestTreadLabel(cs)}</span>
                    {cs.confidence && (
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${'sq-chip-neutral'}`}>
                        Confidence: {cs.confidence}
                      </span>
                    )}
                    <span className="text-[10px] text-muted-foreground ml-auto">
                      Restlaufzeit: {tireRemainingKmLabel(cs)}
                    </span>
                  </div>
                  {defaultWarning && (
                    <p className="text-[11px] mt-2 text-[color:var(--status-watch)]">{defaultWarning}</p>
                  )}
                  <div className="mt-2 grid gap-1 text-[10px] text-muted-foreground">
                    {tirePressureEvidenceLine(cs) && <p>{tirePressureEvidenceLine(cs)}</p>}
                    {tireModelEvidenceLine(cs) && <p>{tireModelEvidenceLine(cs)}</p>}
                    {tireSpecEvidenceLine(cs) && <p>Spec: {tireSpecEvidenceLine(cs)}</p>}
                  </div>
                  {(cs.lastMeasurementAt ?? cs.latestMeasurementAt) && (
                    <p className="text-[10px] mt-2 text-muted-foreground">
                      Letzte Profilmessung: {formatMeasuredAgo(cs.lastMeasurementAt ?? cs.latestMeasurementAt) ?? '—'}
                    </p>
                  )}
                  {actions.length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {actions.slice(0, 4).map((action) => (
                        <li key={action.code} className="text-[11px] flex items-start gap-2 text-muted-foreground">
                          <span className={`mt-1.5 w-1 h-1 rounded-full shrink-0 ${'bg-[color:var(--status-info)]'}`} />
                          {action.label}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })()}

            <TireWearV3CustomerPanel summary={tireDetail?.summary ?? tireHealth} />

            {/* Estimate Quality Badge */}
            {(() => {
              const conf = tireDetail?.summary ?? tireHealth;
              if (!conf) return null;
              const score = conf.confidenceScore ?? 0;
              const label = conf.confidenceLabel ?? 'Low';
              const bg = label === 'High' ? ('sq-tone-success border border-border') : label === 'Medium' ? ('sq-tone-watch border border-border') : ('sq-tone-critical border border-border');
              const tc = label === 'High' ? ('text-[color:var(--status-positive)]') : label === 'Medium' ? ('text-[color:var(--status-watch)]') : ('text-[color:var(--status-critical)]');
              return (
                <div className={`rounded-lg p-2.5 mb-4 border ${bg}`}>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <Icon name="shield-alert" className={`w-3.5 h-3.5 shrink-0 ${tc}`} />
                    <span className={`text-[11px] font-semibold ${tc}`}>Forecast Quality: {label} ({score}%)</span>
                  </div>
                  <p className={`text-[10px] mt-1 text-muted-foreground`}>{TIRE_FORECAST_QUALITY_SUBTEXT}</p>
                </div>
              );
            })()}

            {/* HM Tire Pressure Section */}
            {hmTirePressure && (
              <div className={`rounded-xl p-4 mb-5 border ${'sq-tone-ai border border-border'}`}>
                <div className="flex items-center gap-2 mb-3">
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-400">HM</span>
                  <h4 className="text-xs font-semibold text-foreground">Live Tire Pressure</h4>
                  {hmTirePressure.lastUpdatedAt && (
                    <span className="text-[10px] text-muted-foreground ml-auto">
                      {(() => {
                        const ms = Date.now() - new Date(hmTirePressure.lastUpdatedAt!).getTime();
                        const h = Math.floor(ms / 3600000);
                        return `aktualisiert vor ${h < 1 ? '<1h' : `${h}h`}`;
                      })()}
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: 'Vorne Links', pressure: hmTirePressure.frontLeft, status: hmTirePressure.statusFrontLeft },
                    { label: 'Vorne Rechts', pressure: hmTirePressure.frontRight, status: hmTirePressure.statusFrontRight },
                    { label: 'Hinten Links', pressure: hmTirePressure.rearLeft, status: hmTirePressure.statusRearLeft },
                    { label: 'Hinten Rechts', pressure: hmTirePressure.rearRight, status: hmTirePressure.statusRearRight },
                  ].map(({ label, pressure, status }) => {
                    const isIssue = status && (status.toLowerCase().includes('low') || status.toLowerCase().includes('warn') || status === 'ALERT');
                    return (
                      <div key={label} className={`rounded-lg p-2.5 border ${isIssue ? ('border-border sq-tone-watch') : ('border-border bg-muted/30')}`}>
                        <p className="text-[10px] font-semibold text-muted-foreground mb-1">{label}</p>
                        <div className="flex items-baseline gap-1">
                          <span className={`text-sm font-bold ${isIssue ? 'text-amber-600 dark:text-amber-400' : 'text-foreground'}`}>
                            {pressure != null ? pressure.toFixed(1) : '—'}
                          </span>
                          {pressure != null && <span className="text-[10px] text-muted-foreground">{hmTirePressure.unit}</span>}
                        </div>
                        {isIssue && <p className="text-[9px] text-amber-600 dark:text-amber-400 mt-0.5">{status}</p>}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Alerts */}
            {(tireDetail?.alerts ?? tireHealth?.alerts ?? []).filter((a: TireAlert) => a.severity !== 'info').length > 0 && (
              <div className="space-y-2 mb-5">
                {(tireDetail?.alerts ?? tireHealth?.alerts ?? []).filter((a: TireAlert) => a.severity !== 'info').map((alert: TireAlert, i: number) => (
                  <div key={i} className={`rounded-xl px-3 py-2.5 flex items-center gap-2 ${alert.severity === 'critical' ? ('sq-tone-critical border border-border') : ('sq-tone-watch border border-border')}`}>
                    <Icon name="alert-triangle" className={`w-3.5 h-3.5 shrink-0 ${alert.severity === 'critical' ? 'text-red-500' : 'text-amber-500'}`} />
                    <span className={`text-xs ${alert.severity === 'critical' ? ('text-[color:var(--status-critical)]') : ('text-[color:var(--status-watch)]')}`}>{alert.message}</span>
                  </div>
                ))}
              </div>
            )}

            {tireHealth?.actionState && (
              <div className={`rounded-xl px-4 py-3 mb-5 ${'bg-muted/50 border border-border'}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Operational Action</span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                    tireHealth.actionState === 'REPLACE'
                      ? 'sq-chip-critical'
                      : tireHealth.actionState === 'PLAN_SERVICE'
                      ? 'sq-chip-watch'
                      : tireHealth.actionState === 'CHECK_SOON'
                      ? 'sq-chip-info'
                      : 'sq-chip-success'
                  }`}>
                    {formatEnumLabel(tireHealth.actionState)}
                  </span>
                </div>
                {(tireHealth.actionReasons ?? []).length > 0 && (
                  <p className="text-[11px] mt-2 text-muted-foreground">{tireHealth.actionReasons?.[0]}</p>
                )}
                {(tireHealth.dataQualityWarnings ?? []).length > 0 && (
                  <p className={`text-[10px] mt-1 ${'text-[color:var(--status-watch)]'}`}>
                    Data warning: {tireHealth.dataQualityWarnings?.[0]}
                  </p>
                )}
              </div>
            )}

            {/* Tab navigation */}
            <div className={`flex gap-1 mb-5 p-1 rounded-xl ${'bg-muted/60'}`}>
              {(['overview', 'history', 'factors'] as const).map(tab => (
                <button key={tab} onClick={() => setTireModalTab(tab)} className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${tireModalTab === tab ? 'surface-premium text-foreground' : ('text-muted-foreground hover:text-foreground')}`}>
                  {tab === 'overview' ? 'Overview' : tab === 'history' ? 'Rotation History' : 'Wear Factors'}
                </button>
              ))}
            </div>

            {tireDetailLoading && <SkeletonCard className="my-4" />}

            {/* ── OVERVIEW TAB ── */}
            {tireModalTab === 'overview' && !tireDetailLoading && (
              <>
                {/* Tire Setup Info */}
                {(() => {
                  const active = resolveActiveSetup(tiresData);
                  const hasIncomplete = active && (!active.brandModelFront || !active.frontDimension || !active.tireSeason);
                  if (!active) return (
                    <div className={`rounded-lg p-4 text-center mb-5 border-2 border-dashed ${'sq-tone-watch border border-border'}`}>
                      <Icon name="circle" className={`w-8 h-8 mx-auto mb-2 ${'text-[color:var(--status-watch)]/60'}`} />
                      <p className={`text-sm font-semibold mb-1 ${'text-[color:var(--status-watch)]'}`}>No active Tracking</p>
                      <p className={`text-xs text-muted-foreground`}>please provide Tire Information</p>
                      <button onClick={handleOpenEditSetup} className={`mt-3 px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors ${'sq-tone-info hover:opacity-90'}`}>
                        <Icon name="pen-tool" className="w-3 h-3 inline -mt-0.5 mr-1" />Add Tire Setup
                      </button>
                    </div>
                  );
                  return (
                    <div className={`rounded-lg p-4 mb-5 border border-emerald-500/20 bg-muted`}>
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                        <div className="flex flex-wrap items-center gap-2 min-w-0">
                          <div className="w-5 h-5 rounded-full bg-emerald-500/15 flex items-center justify-center shrink-0">
                            <Icon name="check-circle" className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                          </div>
                          <h3 className={`text-xs font-bold uppercase tracking-wider text-foreground`}>Active Set</h3>
                          {active.tireSeason && <span className={`px-2 py-0.5 rounded-full text-[9px] font-semibold ${'sq-chip-info'}`}>{active.tireSeason.replace('_', ' ')}</span>}
                          {tireHealth?.totalKmOnSet ? <span className={`text-[10px] text-muted-foreground`}>{Math.round(tireHealth.totalKmOnSet).toLocaleString('de-DE')} km on set</span> : null}
                          {hasIncomplete && <span className={`px-2 py-0.5 rounded-full text-[9px] font-semibold ${'sq-chip-watch'}`}>Incomplete</span>}
                        </div>
                        <button onClick={handleOpenEditSetup} className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-semibold transition-colors ${'text-[color:var(--status-info)] hover:bg-muted'}`}>
                          <Icon name="pen-tool" className="w-3 h-3" />Edit
                        </button>
                      </div>
                      {!showEditSetup ? (
                        <>
                          <div className="grid grid-cols-2 gap-3">
                            <div><p className={`text-[10px] uppercase tracking-wider mb-0.5 text-muted-foreground`}>Front</p><p className={`text-xs font-semibold text-foreground`}>{active.brandModelFront || '—'}</p><p className={`text-[10px] text-muted-foreground`}>{active.frontDimension || '—'}</p></div>
                            <div><p className={`text-[10px] uppercase tracking-wider mb-0.5 text-muted-foreground`}>Rear</p><p className={`text-xs font-semibold text-foreground`}>{active.brandModelRear || active.brandModelFront || '—'}</p><p className={`text-[10px] text-muted-foreground`}>{active.rearDimension || active.frontDimension || '—'}</p></div>
                          </div>
                          {active.installedAt && <p className={`text-[10px] mt-2 text-muted-foreground/60`}>Installed {new Date(active.installedAt).toLocaleDateString('de-DE')}{active.installedOdometerKm ? ` at ${Math.round(active.installedOdometerKm).toLocaleString('de-DE')} km` : ''}</p>}
                        </>
                      ) : (
                        <div className="space-y-3 mt-1">
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className={`text-[10px] uppercase tracking-wider font-semibold block mb-1 text-muted-foreground`}>Front Brand / Model</label>
                              <input type="text" value={editSetupForm.brandModelFront} onChange={e => setEditSetupForm(p => ({ ...p, brandModelFront: e.target.value }))} className={`w-full px-3 py-2 rounded-lg text-xs font-medium border transition-colors outline-none ${'bg-background border border-border text-foreground focus:border-[color:var(--brand)]'}`} placeholder="e.g. Continental PremiumContact 6" />
                            </div>
                            <div>
                              <label className={`text-[10px] uppercase tracking-wider font-semibold block mb-1 text-muted-foreground`}>Rear Brand / Model</label>
                              <input type="text" value={editSetupForm.brandModelRear} onChange={e => setEditSetupForm(p => ({ ...p, brandModelRear: e.target.value }))} className={`w-full px-3 py-2 rounded-lg text-xs font-medium border transition-colors outline-none ${'bg-background border border-border text-foreground focus:border-[color:var(--brand)]'}`} placeholder="Same as front if identical" />
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className={`text-[10px] uppercase tracking-wider font-semibold block mb-1 text-muted-foreground`}>Front Dimension</label>
                              <input type="text" value={editSetupForm.frontDimension} onChange={e => setEditSetupForm(p => ({ ...p, frontDimension: e.target.value }))} className={`w-full px-3 py-2 rounded-lg text-xs font-medium border transition-colors outline-none ${'bg-background border border-border text-foreground focus:border-[color:var(--brand)]'}`} placeholder="e.g. 225/45 R17" />
                            </div>
                            <div>
                              <label className={`text-[10px] uppercase tracking-wider font-semibold block mb-1 text-muted-foreground`}>Rear Dimension</label>
                              <input type="text" value={editSetupForm.rearDimension} onChange={e => setEditSetupForm(p => ({ ...p, rearDimension: e.target.value }))} className={`w-full px-3 py-2 rounded-lg text-xs font-medium border transition-colors outline-none ${'bg-background border border-border text-foreground focus:border-[color:var(--brand)]'}`} placeholder="Same as front if identical" />
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className={`text-[10px] uppercase tracking-wider font-semibold block mb-1 text-muted-foreground`}>Load Index</label>
                              <input type="text" value={editSetupForm.loadIndex} onChange={e => setEditSetupForm(p => ({ ...p, loadIndex: e.target.value }))} className={`w-full px-3 py-2 rounded-lg text-xs font-medium border transition-colors outline-none ${'bg-background border border-border text-foreground focus:border-[color:var(--brand)]'}`} placeholder="e.g. 94" />
                            </div>
                            <div>
                              <label className={`text-[10px] uppercase tracking-wider font-semibold block mb-1 text-muted-foreground`}>Speed Index</label>
                              <input type="text" value={editSetupForm.speedIndex} onChange={e => setEditSetupForm(p => ({ ...p, speedIndex: e.target.value }))} className={`w-full px-3 py-2 rounded-lg text-xs font-medium border transition-colors outline-none ${'bg-background border border-border text-foreground focus:border-[color:var(--brand)]'}`} placeholder="e.g. V" />
                            </div>
                          </div>
                          <div>
                            <label className={`text-[10px] uppercase tracking-wider font-semibold block mb-1 text-muted-foreground`}>Season</label>
                            <div className="flex gap-2">
                              {[{ val: 'SUMMER', label: 'Summer', icon: Sun }, { val: 'WINTER', label: 'Winter', icon: Snowflake }, { val: 'ALL_SEASON', label: 'All Season', icon: Wind }].map(opt => (
                                <button key={opt.val} onClick={() => setEditSetupForm(p => ({ ...p, tireSeason: p.tireSeason === opt.val ? '' : opt.val }))} className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border-2 transition-all ${editSetupForm.tireSeason === opt.val ? 'border-[color:var(--brand)] sq-tone-brand' : 'border-border text-muted-foreground hover:border-border/80'}`}>
                                  <opt.icon className="w-3.5 h-3.5" />{opt.label}
                                </button>
                              ))}
                            </div>
                          </div>
                          <div>
                            <label className={`text-[10px] uppercase tracking-wider font-semibold block mb-1.5 text-muted-foreground`}>Tire Condition</label>
                            <div className="flex gap-2">
                              {[{ val: 'NEW_INSTALLED' as const, label: 'Newly Installed' }, { val: 'ALREADY_MOUNTED' as const, label: 'Already Mounted (Used)' }].map(opt => (
                                <button key={opt.val} onClick={() => setEditSetupForm(p => ({ ...p, tireCondition: p.tireCondition === opt.val ? '' : opt.val }))} className={`flex-1 px-3 py-2 rounded-lg text-xs font-semibold border-2 transition-all ${editSetupForm.tireCondition === opt.val ? 'border-[color:var(--brand)] sq-tone-brand' : 'border-border text-muted-foreground hover:border-border/80'}`}>
                                  {opt.label}
                                </button>
                              ))}
                            </div>
                            {editSetupForm.tireCondition === 'ALREADY_MOUNTED' && (
                              <p className={`text-[9px] mt-1 ${'text-[color:var(--status-watch)]'}`}>Used tires: please enter current per-wheel tread depths below for accurate estimates.</p>
                            )}
                          </div>
                          <div>
                            <label className={`text-[10px] uppercase tracking-wider font-semibold block mb-1.5 text-muted-foreground`}>Current Tread Depth (mm){editSetupForm.tireCondition === 'ALREADY_MOUNTED' ? ' — recommended' : ' — optional'}</label>
                            <div className="grid grid-cols-4 gap-2">
                              {[{ key: 'treadFL', label: 'FL' }, { key: 'treadFR', label: 'FR' }, { key: 'treadBL', label: 'RL' }, { key: 'treadBR', label: 'RR' }].map(f => (
                                <div key={f.key}>
                                  <span className={`text-[9px] font-semibold block mb-0.5 text-center text-muted-foreground/60`}>{f.label}</span>
                                  <input type="number" step="0.1" min="0" max="12" value={(editSetupForm as any)[f.key]} onChange={e => setEditSetupForm(p => ({ ...p, [f.key]: e.target.value }))} className={`w-full px-2 py-1.5 rounded-lg text-xs text-center font-medium border transition-colors outline-none ${'bg-background border border-border text-foreground focus:border-[color:var(--brand)]'}`} placeholder="mm" />
                                </div>
                              ))}
                            </div>
                          </div>
                          {/* ── AI Tire Spec Fetch ─────────────────────────────── */}
                          <div className={`rounded-xl p-3 border bg-muted border-border`}>
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <Icon name="bot" className={`w-4 h-4 ${'text-[color:var(--status-ai)]'}`} />
                                <span className={`text-[10px] font-bold uppercase tracking-wider text-muted-foreground`}>AI Tire Intelligence</span>
                              </div>
                              {!aiTireLoading && !aiTireResult && (
                                <div className="relative group">
                                  <button
                                    onClick={handleFetchAiTireSpec}
                                    disabled={!aiTireSpecFieldsReady || aiTireLoading}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-semibold transition-all ${
                                      aiTireSpecFieldsReady
                                        ? 'bg-purple-500 hover:bg-purple-600 text-white'
                                        : 'bg-muted text-muted-foreground cursor-not-allowed'
                                    }`}
                                  >
                                    <Icon name="sparkles" className="w-3 h-3" />Fetch AI Tire Spec
                                  </button>
                                  {!aiTireSpecFieldsReady && (
                                    <div className={`absolute bottom-full right-0 mb-1 px-2 py-1 rounded text-[9px] whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 ${'bg-popover text-popover-foreground'}`}>
                                      Fill Brand/Model, Dimension, Load &amp; Speed Index first
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>

                            {/* Status: Loading with countdown */}
                            {aiTireLoading && (
                              <div className={`rounded-lg p-3 bg-muted`}>
                                <div className="flex items-center gap-2 mb-2">
                                  <Icon name="loader-2" className="w-4 h-4 animate-spin text-purple-500" />
                                  <span className={`text-xs font-semibold ${'text-[color:var(--status-ai)]'}`}>
                                    {aiTireCountdown > 0 ? 'Fetching AI Tire Spec...' : 'Taking longer than expected...'}
                                  </span>
                                </div>
                                {aiTireCountdown > 0 && (
                                  <p className={`text-[10px] mb-2 text-muted-foreground`}>Estimated time remaining: {aiTireCountdown}s</p>
                                )}
                                {aiTireCountdown === 0 && aiTireLoading && (
                                  <p className={`text-[10px] mb-2 ${'text-[color:var(--status-watch)]'}`}>Still processing — please wait...</p>
                                )}
                                <div className={`w-full h-1.5 rounded-full overflow-hidden bg-muted`}>
                                  <div className="h-full bg-purple-500 rounded-full transition-all duration-1000" style={{ width: `${Math.max(5, aiTireCountdown > 0 ? ((30 - aiTireCountdown) / 30) * 90 : 95)}%` }} />
                                </div>
                                {aiTireLiveStep && <p className={`text-[9px] mt-1.5 text-muted-foreground/60`}>{aiTireLiveStep}</p>}
                                {aiTireSteps.length > 0 && (
                                  <div className="mt-2 space-y-1">
                                    {aiTireSteps.map((s, i) => (
                                      <div key={i} className="flex items-center gap-1.5">
                                        {s.status === 'done' ? <Icon name="check-circle" className="w-3 h-3 text-green-500" /> : s.status === 'error' ? <Icon name="alert-triangle" className="w-3 h-3 text-red-500" /> : <Icon name="loader-2" className="w-3 h-3 animate-spin text-purple-400" />}
                                        <span className={`text-[9px] text-muted-foreground`}>{s.step}</span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Error state */}
                            {!aiTireLoading && aiTireError && (
                              <div className={`rounded-lg p-3 ${'sq-tone-critical border border-border'}`}>
                                <div className="flex items-center gap-2 mb-1">
                                  <Icon name="alert-triangle" className="w-3.5 h-3.5 text-red-500" />
                                  <span className={`text-xs font-semibold ${'text-[color:var(--status-critical)]'}`}>Fetch failed</span>
                                </div>
                                <p className={`text-[10px] mb-2 ${'text-[color:var(--status-critical)]'}`}>{aiTireError}</p>
                                <div className="flex gap-2">
                                  <button onClick={handleFetchAiTireSpec} className="px-2.5 py-1 rounded-lg text-[10px] font-semibold bg-purple-500 hover:bg-purple-600 text-white transition-colors">Retry</button>
                                  <button onClick={handleDiscardAiTireSpec} className={`px-2.5 py-1 rounded-lg text-[10px] font-medium transition-colors ${'text-muted-foreground hover:bg-muted'}`}>Dismiss</button>
                                </div>
                              </div>
                            )}

                            {/* Result preview */}
                            {!aiTireLoading && aiTireResult && (
                              <div className={`rounded-lg p-3 bg-muted border border-border`}>
                                <div className="flex items-center justify-between mb-2">
                                  <div className="flex items-center gap-2">
                                    <Icon name="sparkles" className={`w-3.5 h-3.5 ${'text-[color:var(--status-ai)]'}`} />
                                    <span className={`text-xs font-semibold ${'text-[color:var(--status-ai)]'}`}>AI Tire Spec Result</span>
                                  </div>
                                  {(() => {
                                    const conf = typeof aiTireResult.confidenceScore === 'number' ? aiTireResult.confidenceScore : null;
                                    if (conf == null) return null;
                                    const isLow = conf < 50;
                                    return (
                                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${isLow ? 'sq-chip-watch' : 'sq-chip-success'}`}>
                                        {isLow ? 'Low Confidence' : 'Matched'} ({conf}%)
                                      </span>
                                    );
                                  })()}
                                </div>
                                {aiTireDegraded && (
                                  <p className={`text-[9px] mb-2 ${'text-[color:var(--status-watch)]'}`}>Partial result — some fields could not be determined.</p>
                                )}
                                {typeof aiTireResult.confidenceScore === 'number' && (aiTireResult.confidenceScore as number) < 50 && (
                                  <p className={`text-[9px] mb-2 ${'text-[color:var(--status-watch)]'}`}>Low confidence match — review carefully before applying.</p>
                                )}
                                <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                                  {[
                                    { key: 'matchedBrand', label: 'Brand' },
                                    { key: 'matchedModel', label: 'Model' },
                                    { key: 'matchedVariant', label: 'Variant' },
                                    { key: 'seasonType', label: 'Season' },
                                    { key: 'newTreadDepthMm', label: 'New Tread (mm)' },
                                    { key: 'recommendedReplacementDepthMm', label: 'Rec. Replace (mm)' },
                                    { key: 'operationalReplacementDepthMm', label: 'Op. Replace (mm)' },
                                    { key: 'intendedUse', label: 'Intended Use' },
                                    { key: 'aggressiveDrivingSensitivity', label: 'Aggr. Sensitivity' },
                                    { key: 'underinflationSensitivity', label: 'Underinfl. Sens.' },
                                    { key: 'heatSensitivity', label: 'Heat Sensitivity' },
                                    { key: 'confidenceScore', label: 'Confidence' },
                                  ].map(({ key, label }) => {
                                    const val = (aiTireResult as any)[key];
                                    return (
                                      <div key={key} className="flex justify-between py-0.5">
                                        <span className={`text-[9px] text-muted-foreground`}>{label}</span>
                                        <span className={`text-[9px] font-semibold text-foreground/80`}>{val != null ? String(val) : '—'}</span>
                                      </div>
                                    );
                                  })}
                                </div>
                                {Boolean(aiTireResult.manufacturerSourceUrl || aiTireResult.labelSourceUrl) && (
                                  <div className={`mt-2 pt-2 border-t border-border`}>
                                    {Boolean(aiTireResult.manufacturerSourceUrl) && <a href={String(aiTireResult.manufacturerSourceUrl)} target="_blank" rel="noopener noreferrer" className="text-[9px] text-status-info hover:underline block truncate">Manufacturer source</a>}
                                    {Boolean(aiTireResult.labelSourceUrl) && <a href={String(aiTireResult.labelSourceUrl)} target="_blank" rel="noopener noreferrer" className="text-[9px] text-status-info hover:underline block truncate">Label source</a>}
                                  </div>
                                )}
                                <div className="flex gap-2 mt-3">
                                  <button onClick={handleApplyAiTireSpec} disabled={aiTireApplying} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[10px] font-semibold bg-green-500 hover:bg-green-600 text-white transition-colors disabled:opacity-50">
                                    {aiTireApplying ? <Icon name="loader-2" className="w-3 h-3 animate-spin" /> : <Icon name="check-circle" className="w-3 h-3" />}Apply Spec
                                  </button>
                                  <button onClick={handleFetchAiTireSpec} disabled={aiTireLoading} className="px-3 py-1.5 rounded-lg text-[10px] font-semibold bg-purple-500 hover:bg-purple-600 text-white transition-colors">
                                    <Icon name="refresh-cw" className="w-3 h-3 inline -mt-0.5 mr-1" />Retry
                                  </button>
                                  <button onClick={handleDiscardAiTireSpec} className={`px-3 py-1.5 rounded-lg text-[10px] font-medium transition-colors ${'text-muted-foreground hover:bg-muted'}`}>Discard</button>
                                </div>
                              </div>
                            )}

                            {/* Idle hint when no action taken yet */}
                            {!aiTireLoading && !aiTireResult && !aiTireError && (
                              <p className={`text-[9px] text-muted-foreground/60`}>
                                Fetch model-specific tire intelligence for accurate wear modeling.
                              </p>
                            )}
                          </div>

                          <div className="flex gap-2 justify-end pt-1">
                            <button onClick={() => setShowEditSetup(false)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${'text-muted-foreground hover:bg-muted'}`}>Cancel</button>
                            <button onClick={handleSaveEditSetup} disabled={submittingEditSetup} className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-status-info hover:bg-brand text-brand-foreground transition-colors disabled:opacity-50 flex items-center gap-1.5">
                              {submittingEditSetup && <Icon name="loader-2" className="w-3.5 h-3.5 animate-spin" />}Save Setup
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Overall + Wheel Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-5">
                  {/* Overall */}
                  {(() => {
                    const sum = tireDetail?.summary;
                    if (sum && isTireWearV3Authoritative(sum)) {
                      return (
                        <div className="rounded-lg p-4 sq-tone-watch bg-muted/40">
                          <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-1">
                            {t('tire.wearV3.authoritativeCardTitle' as never)}
                          </p>
                          <p className="text-lg font-bold text-foreground leading-snug">
                            {formatV3AuthoritativeHeadline(sum, locale)}
                          </p>
                          <p className="text-[10px] mt-2 text-muted-foreground/80">
                            {t('tire.wearV3.legacyPercentHiddenHint' as never)}
                          </p>
                        </div>
                      );
                    }
                    const pct = resolveLegacyTreadLifePercent(sum, tireWear?.overallPercent ?? null);
                    const remKm = sum?.overallRemainingKm ?? tireWear?.estimatedRemainingKm ?? null;
                    const barBg = pct != null ? (pct >= 50 ? ('sq-tone-success') : pct >= 25 ? ('sq-tone-watch') : ('sq-tone-critical')) : ('bg-muted/60');
                    const barFg = pct != null ? (pct >= 50 ? 'bg-green-500' : pct >= 25 ? 'bg-amber-500' : 'bg-red-500') : 'bg-gray-300';
                    return (
                      <div className={`rounded-lg p-4 ${barBg}`}>
                        {pct != null ? (<>
                          <p className={`text-2xl font-bold mb-1 text-foreground tabular-nums`}>{pct}%</p>
                          <div className={`w-full h-2 rounded-full overflow-hidden mb-2 bg-muted`}><div className={`h-full ${barFg} rounded-full transition-all`} style={{ width: `${pct}%` }} /></div>
                          <p className={`text-xs font-semibold ${'text-muted-foreground'}`}>{t('tire.wearV3.estimatedTreadLifeV2' as never)}</p>
                          <p className={`text-[10px] mt-0.5 text-muted-foreground/70`}>{TIRE_TREAD_LIFE_SCORE_HINT}</p>
                          {remKm != null && <p className={`text-[11px] mt-1 text-muted-foreground tabular-nums`}>ca. {remKm.toLocaleString('de-DE')} km remaining</p>}
                          {sum?.wearRateMmPer1000km != null && <p className={`text-[10px] mt-1 text-muted-foreground/60`}>Wear: {sum.wearRateMmPer1000km.toFixed(2)} mm / 1000 km</p>}
                          {tireWear && <div className="mt-3 flex gap-3">
                            <div className="text-center flex-1"><p className={`text-lg font-bold text-foreground tabular-nums`}>{tireWear.frontPercent}%</p><p className={`text-[10px] uppercase tracking-wider text-muted-foreground`}>Front</p></div>
                            <div className={`w-px bg-muted`} />
                            <div className="text-center flex-1"><p className={`text-lg font-bold text-foreground tabular-nums`}>{tireWear.rearPercent}%</p><p className={`text-[10px] uppercase tracking-wider text-muted-foreground`}>Rear</p></div>
                          </div>}
                        </>) : (<div className="text-center py-3"><p className={`text-xs font-semibold text-muted-foreground`}>No wear analysis yet</p></div>)}
                      </div>
                    );
                  })()}

                  {/* Wheel position grid — 2×2 layout */}
                  {(() => {
                    const v3WearAuthority = isTireWearV3Authoritative(tireDetail?.summary);
                    const wearFallback =
                      resolveV3WheelTreadFallback(tireDetail?.summary) ??
                      (tireWear
                        ? { FL: tireWear.frontLeftMm, FR: tireWear.frontRightMm, RL: tireWear.rearLeftMm, RR: tireWear.rearRightMm }
                        : undefined);
                    return (
                      <div className={`rounded-lg p-4 bg-muted`}>
                        <p className={`text-[10px] uppercase tracking-wider font-semibold mb-3 text-muted-foreground`}>Tread Depth per Wheel</p>
                        <div className="grid grid-cols-2 gap-2">
                          {WHEEL_POSITIONS.map((pos) => {
                            const wheel = resolveWheelByPosition(tireDetail?.wheels, pos, wearFallback);
                            const mm = wheel?.treadMm ?? 0;
                            const hasData = wheel != null && mm > 0;
                            const measBadge = wheel ? wheelMeasurementBadge(wheel) : null;
                            const lastMeas = wheel ? formatWheelLastMeasured(wheel.lastMeasuredAt) : null;
                            return (
                              <div key={pos} className="rounded-lg p-2.5 border border-border bg-background/60 min-w-0">
                                <div className="flex items-center justify-between gap-1 mb-1">
                                  <span className="text-[10px] font-bold text-muted-foreground">{pos}</span>
                                  {measBadge && (
                                    <span className={`text-[8px] px-1 py-0.5 rounded font-semibold uppercase tracking-wide shrink-0 ${
                                      measBadge === 'Measured' ? 'sq-chip-info' : 'sq-tone-ai'
                                    }`}>
                                      {measBadge}
                                    </span>
                                  )}
                                </div>
                                {hasData ? (
                                  <>
                                    <p className={`text-sm font-bold tabular-nums ${treadMmColorClass(mm)}`}>{mm.toFixed(1)} mm</p>
                                    {!v3WearAuthority && wheel!.wearPercent > 0 && (
                                      <p className="text-[9px] text-muted-foreground tabular-nums">{wheel!.wearPercent}% worn</p>
                                    )}
                                    {wheel!.healthStatus && wheel!.healthStatus !== 'UNKNOWN' && wheel!.wearPercent <= 0 && (
                                      <p className="text-[9px] text-muted-foreground capitalize">{formatEnumLabel(wheel!.healthStatus)}</p>
                                    )}
                                    {lastMeas && (
                                      <p className="text-[8px] text-muted-foreground/60 mt-0.5">Measured {lastMeas}</p>
                                    )}
                                  </>
                                ) : (
                                  <p className="text-xs text-muted-foreground">No data</p>
                                )}
                              </div>
                            );
                          })}
                        </div>
                        <div className="flex flex-col sm:flex-row gap-2 mt-3 pt-3 border-t border-border">
                          <button
                            onClick={() => setShowRotation(true)}
                            className="flex-1 sm:flex-none px-4 py-2 rounded-lg bg-status-info hover:bg-brand text-brand-foreground text-xs font-semibold transition-colors text-center"
                          >
                            Rotate
                          </button>
                          <button
                            onClick={() => setShowTireChange(true)}
                            className="flex-1 sm:flex-none px-4 py-2 rounded-lg bg-red-500 hover:bg-red-600 text-white text-xs font-semibold transition-colors text-center"
                          >
                            Change
                          </button>
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {/* Usage Split */}
                {tireDetail && tireDetail.usageSplit && (tireDetail.usageSplit.city > 0 || tireDetail.usageSplit.highway > 0 || tireDetail.usageSplit.rural > 0) && (
                  <div className={`rounded-lg p-4 mb-5 bg-muted`}>
                    <p className={`text-[10px] uppercase tracking-wider font-semibold mb-1 text-muted-foreground`}>Usage Distribution</p>
                    {(tireHealth?.totalKmOnSet ?? tireDetail?.summary?.totalKmOnSet) ? (
                      <p className="text-[10px] text-muted-foreground/70 mb-3">Based on active set mileage</p>
                    ) : (
                      <div className="mb-3" />
                    )}
                    <div className="flex gap-1 mb-3 h-2 rounded-full overflow-hidden">
                      {tireDetail.usageSplit.city > 0 && <div className={`${'bg-[color:var(--status-watch)]'} rounded-full`} style={{ width: `${tireDetail.usageSplit.city}%` }} />}
                      {tireDetail.usageSplit.highway > 0 && <div className={`${'bg-[color:var(--status-info)]'} rounded-full`} style={{ width: `${tireDetail.usageSplit.highway}%` }} />}
                      {tireDetail.usageSplit.rural > 0 && <div className={`${'bg-[color:var(--status-positive)]'} rounded-full`} style={{ width: `${tireDetail.usageSplit.rural}%` }} />}
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div><p className={`text-sm font-bold ${'text-[color:var(--status-watch)]'}`}>{tireDetail.usageSplit.city}%</p><p className={`text-[10px] uppercase tracking-wider text-muted-foreground`}>City</p></div>
                      <div><p className={`text-sm font-bold ${'text-[color:var(--status-info)]'}`}>{tireDetail.usageSplit.highway}%</p><p className={`text-[10px] uppercase tracking-wider text-muted-foreground`}>Highway</p></div>
                      <div><p className={`text-sm font-bold ${'text-[color:var(--status-positive)]'}`}>{tireDetail.usageSplit.rural}%</p><p className={`text-[10px] uppercase tracking-wider text-muted-foreground`}>Rural</p></div>
                    </div>
                  </div>
                )}

                {/* Action Error Banner */}
                {tireActionError && (
                  <div className={`rounded-xl px-4 py-3 mb-4 flex items-center gap-2 ${'sq-tone-critical border border-border'}`}>
                    <Icon name="alert-triangle" className="w-4 h-4 text-red-500 shrink-0" />
                    <span className={`text-xs ${'text-[color:var(--status-critical)]'}`}>{tireActionError}</span>
                    <button onClick={() => setTireActionError(null)} className={`ml-auto p-0.5 rounded ${'text-muted-foreground hover:text-foreground'}`}><Icon name="x" className="w-3 h-3" /></button>
                  </div>
                )}
                {tireActionWarning && !tireActionError && (
                  <div className={`rounded-xl px-4 py-3 mb-4 flex items-center gap-2 border border-[color:var(--status-watch)]/40 bg-[color:var(--status-watch)]/10`}>
                    <Icon name="info" className="w-4 h-4 shrink-0 text-[color:var(--status-watch)]" />
                    <span className="text-xs text-[color:var(--status-watch)]">{tireActionWarning}</span>
                    <button onClick={() => setTireActionWarning(null)} className={`ml-auto p-0.5 rounded ${'text-muted-foreground hover:text-foreground'}`}><Icon name="x" className="w-3 h-3" /></button>
                  </div>
                )}

                {/* Actions: Measurement */}
                <div className={`rounded-lg p-5 mb-5 bg-muted`}>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className={`text-xs font-semibold uppercase tracking-wider text-muted-foreground`}>Manual Measurement</h3>
                    {!showMeasurement && <button onClick={() => { setShowMeasurement(true); setMeasurementMode(null); }} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-status-info hover:bg-brand text-brand-foreground transition-colors"><Icon name="plus" className="w-3.5 h-3.5" /> Record</button>}
                  </div>
                  {showMeasurement && !measurementMode && (
                    <div className="flex gap-3">
                      <button onClick={() => setMeasurementMode('manual')} className={`flex-1 flex flex-col items-center gap-2 p-4 rounded-xl border-2 border-dashed transition-all hover:scale-[1.02] ${'border-border hover:border-[color:var(--brand)] hover:bg-muted/50'}`}>
                        <Icon name="ruler" className={`w-6 h-6 ${'text-[color:var(--status-info)]'}`} /><p className={`text-xs font-semibold text-foreground`}>Manual Entry</p><p className={`text-[10px] text-center text-muted-foreground`}>Enter measured tread values</p>
                      </button>
                      <button onClick={openHealthDocumentIntake} className={`flex-1 flex flex-col items-center gap-2 p-4 rounded-xl border-2 border-dashed transition-all hover:scale-[1.02] ${'border-border hover:border-[color:var(--status-ai)] hover:bg-muted/50'}`}>
                        <Icon name="upload" className={`w-6 h-6 ${'text-[color:var(--status-ai)]'}`} /><p className={`text-xs font-semibold text-foreground`}>AI Upload</p><p className={`text-[10px] text-center text-muted-foreground`}>Upload checkup sheet</p>
                      </button>
                    </div>
                  )}
                  {showMeasurement && measurementMode === 'manual' && (
                    <div>
                      <div className="grid grid-cols-2 gap-3 mb-3">
                        {[{ key: 'fl', label: 'Front Left (mm)' }, { key: 'fr', label: 'Front Right (mm)' }, { key: 'rl', label: 'Rear Left (mm)' }, { key: 'rr', label: 'Rear Right (mm)' }].map(f => (
                          <div key={f.key}><label className={`text-[10px] uppercase tracking-wider font-semibold block mb-1 text-muted-foreground`}>{f.label}</label><input type="number" step="0.1" min="0" max="12" value={(manualMeasurement as any)[f.key]} onChange={e => setManualMeasurement(prev => ({ ...prev, [f.key]: e.target.value }))} className={`w-full px-3 py-2 rounded-lg text-xs font-medium border transition-colors ${'bg-background border border-border text-foreground focus:border-[color:var(--brand)]'} outline-none`} placeholder="e.g. 5.2" /></div>
                        ))}
                      </div>
                      <div className="grid grid-cols-2 gap-3 mb-4">
                        <div><label className={`text-[10px] uppercase tracking-wider font-semibold block mb-1 text-muted-foreground`}>Odometer (km)</label><input type="number" value={manualMeasurement.odometer} onChange={e => setManualMeasurement(prev => ({ ...prev, odometer: e.target.value }))} className={`w-full px-3 py-2 rounded-lg text-xs font-medium border transition-colors ${'bg-background border border-border text-foreground focus:border-[color:var(--brand)]'} outline-none`} placeholder="Current odometer" /></div>
                        <div><label className={`text-[10px] uppercase tracking-wider font-semibold block mb-1 text-muted-foreground`}>Workshop</label><input type="text" value={manualMeasurement.workshop} onChange={e => setManualMeasurement(prev => ({ ...prev, workshop: e.target.value }))} className={`w-full px-3 py-2 rounded-lg text-xs font-medium border transition-colors ${'bg-background border border-border text-foreground focus:border-[color:var(--brand)]'} outline-none`} placeholder="Workshop name (optional)" /></div>
                      </div>
                      <div className="flex gap-2 justify-end">
                        <button onClick={() => { setShowMeasurement(false); setMeasurementMode(null); }} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${'text-muted-foreground hover:bg-muted'}`}>Cancel</button>
                        <button onClick={handleSubmitMeasurement} disabled={submittingMeasurement} className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-status-info hover:bg-brand text-brand-foreground transition-colors disabled:opacity-50 flex items-center gap-1.5">{submittingMeasurement && <Icon name="loader-2" className="w-3.5 h-3.5 animate-spin" />}Confirm & Calibrate</button>
                      </div>
                    </div>
                  )}
                  {showMeasurement && measurementMode === 'upload' && (
                    <div className={`text-center py-6 border-2 border-dashed rounded-xl ${'border-border'}`}>
                      <Icon name="upload" className={`w-8 h-8 mx-auto mb-2 text-muted-foreground`} />
                      <p className={`text-xs font-semibold mb-1 text-foreground`}>Use Document Upload for AI extraction</p>
                      <p className={`text-[10px] mb-3 text-muted-foreground`}>This tire modal no longer performs direct file upload.</p>
                      <div className="flex gap-2 justify-center">
                        <button onClick={() => { setShowMeasurement(false); setMeasurementMode(null); }} className={`px-3 py-1.5 rounded-lg text-xs font-medium text-muted-foreground`}>Cancel</button>
                        <button onClick={() => setMeasurementMode('manual')} className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-purple-500 hover:bg-purple-600 text-white">Back to Manual</button>
                      </div>
                    </div>
                  )}
                  {!showMeasurement && <p className={`text-[10px] text-muted-foreground/60`}>{TIRE_MANUAL_MEASUREMENT_HINT}</p>}
                </div>

                {/* Rotation Dialog */}
                {showRotation && (
                  <div className={`rounded-lg p-5 mb-5 border-2 ${'surface-premium'}`}>
                    <h3 className={`text-xs font-semibold uppercase tracking-wider mb-4 ${'text-[color:var(--status-info)]'}`}>Rotate Tires</h3>
                    <div className="grid grid-cols-2 gap-3 mb-4">
                      {[
                        { val: 'front_to_rear', label: 'Front ↔ Rear', desc: 'Swap front and rear axles' },
                        { val: 'cross', label: 'Cross Rotation', desc: 'Diagonal swap pattern' },
                        { val: 'side_swap', label: 'Side Swap', desc: 'Left ↔ Right per axle' },
                        { val: 'full_rotation', label: 'Full Rotation', desc: 'Circular 4-position rotation' },
                      ].map(opt => (
                        <button key={opt.val} onClick={() => setRotationTemplate(opt.val)} className={`p-3 rounded-xl border-2 text-left transition-all ${rotationTemplate === opt.val ? ('border-[color:var(--brand)] sq-tone-brand') : ('border-border hover:border-border/80')}`}>
                          <p className={`text-xs font-semibold text-foreground`}>{opt.label}</p>
                          <p className={`text-[10px] text-muted-foreground`}>{opt.desc}</p>
                        </button>
                      ))}
                    </div>
                    <div className="grid grid-cols-2 gap-3 mb-4">
                      <div><label className={`text-[10px] uppercase tracking-wider font-semibold block mb-1 text-muted-foreground`}>Odometer (km)</label><input type="number" value={rotationOdometer} onChange={e => setRotationOdometer(e.target.value)} className={`w-full px-3 py-2 rounded-lg text-xs border ${'bg-background border border-border text-foreground'} outline-none`} placeholder="Current odometer" /></div>
                      <div><label className={`text-[10px] uppercase tracking-wider font-semibold block mb-1 text-muted-foreground`}>Notes</label><input type="text" value={rotationNotes} onChange={e => setRotationNotes(e.target.value)} className={`w-full px-3 py-2 rounded-lg text-xs border ${'bg-background border border-border text-foreground'} outline-none`} placeholder="Optional notes" /></div>
                    </div>
                    <div className="flex gap-2 justify-end">
                      <button onClick={() => setShowRotation(false)} className={`px-3 py-1.5 rounded-lg text-xs font-medium ${'text-muted-foreground hover:bg-muted'}`}>Cancel</button>
                      <button onClick={handleRotateTires} disabled={submittingRotation} className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-status-info hover:bg-brand text-brand-foreground disabled:opacity-50 flex items-center gap-1.5">{submittingRotation && <Icon name="loader-2" className="w-3.5 h-3.5 animate-spin" />}Confirm Rotation</button>
                    </div>
                  </div>
                )}

                {/* Tire Change Dialog */}
                {showTireChange && (
                  <div className={`rounded-lg p-5 mb-5 border-2 ${'surface-premium'}`}>
                    <h3 className={`text-xs font-semibold uppercase tracking-wider mb-4 ${'text-[color:var(--status-critical)]'}`}>Tire Replacement & Stored Sets</h3>

                    <div className="grid grid-cols-3 gap-2 mb-4">
                      {([
                        { key: 'single', label: 'Single', desc: 'One wheel' },
                        { key: 'axle', label: 'Axle', desc: 'Front or rear' },
                        { key: 'full_set', label: 'Full set', desc: 'All wheels' },
                      ] as const).map((opt) => (
                        <button
                          key={opt.key}
                          onClick={() => {
                            setTireChangeScope(opt.key);
                            setTireChangePositions([]);
                          }}
                          className={`p-2 rounded-lg border text-left ${
                            tireChangeScope === opt.key
                              ? 'border-red-400 bg-red-500/10'
                              : 'border-border hover:border-border/80'
                          }`}
                        >
                          <p className="text-[11px] font-semibold text-foreground">{opt.label}</p>
                          <p className="text-[10px] text-muted-foreground">{opt.desc}</p>
                        </button>
                      ))}
                    </div>

                    {tireChangeScope === 'single' && (
                      <div className="grid grid-cols-2 gap-2 mb-4">
                        {['FL', 'FR', 'RL', 'RR'].map((pos) => (
                          <button
                            key={pos}
                            onClick={() => {
                              setTireChangePositions([pos]);
                            }}
                            className={`px-3 py-2 rounded-lg text-xs font-semibold border ${
                              tireChangePositions.includes(pos)
                                ? 'border-red-400 bg-red-500/10 text-red-300'
                                : 'border-border text-foreground'
                            }`}
                          >
                            {pos}
                          </button>
                        ))}
                      </div>
                    )}

                    {tireChangeScope === 'axle' && (
                      <div className="grid grid-cols-2 gap-2 mb-4">
                        <button
                          onClick={() => setTireChangePositions(['FRONT_AXLE'])}
                          className={`px-3 py-2 rounded-lg text-xs font-semibold border ${
                            tireChangePositions.includes('FRONT_AXLE')
                              ? 'border-red-400 bg-red-500/10 text-red-300'
                              : 'border-border text-foreground'
                          }`}
                        >
                          Front axle
                        </button>
                        <button
                          onClick={() => setTireChangePositions(['REAR_AXLE'])}
                          className={`px-3 py-2 rounded-lg text-xs font-semibold border ${
                            tireChangePositions.includes('REAR_AXLE')
                              ? 'border-red-400 bg-red-500/10 text-red-300'
                              : 'border-border text-foreground'
                          }`}
                        >
                          Rear axle
                        </button>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-3 mb-4">
                      <div>
                        <label className={`text-[10px] uppercase tracking-wider font-semibold block mb-1 text-muted-foreground`}>Odometer (km)</label>
                        <input type="number" value={tireChangeOdometer} onChange={e => setTireChangeOdometer(e.target.value)} className={`w-full px-3 py-2 rounded-lg text-xs border ${'bg-background border border-border text-foreground'} outline-none`} placeholder="Current odometer" />
                      </div>
                      <div>
                        <label className={`text-[10px] uppercase tracking-wider font-semibold block mb-1 text-muted-foreground`}>Notes</label>
                        <input type="text" value={tireChangeNotes} onChange={e => setTireChangeNotes(e.target.value)} className={`w-full px-3 py-2 rounded-lg text-xs border ${'bg-background border border-border text-foreground'} outline-none`} placeholder="Optional workshop notes" />
                      </div>
                    </div>

                    <div className="flex gap-2 justify-end mb-5">
                      <button onClick={() => setShowTireChange(false)} className={`px-3 py-1.5 rounded-lg text-xs font-medium ${'text-muted-foreground hover:bg-muted'}`}>Cancel</button>
                      <button
                        onClick={handleConfirmTireChange}
                        disabled={
                          submittingTireChange ||
                          (tireChangeScope === 'single' && tireChangePositions.length !== 1) ||
                          (tireChangeScope === 'axle' && tireChangePositions.length !== 1)
                        }
                        className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-red-500 hover:bg-red-600 text-white disabled:opacity-50 flex items-center gap-1.5"
                      >
                        {submittingTireChange && <Icon name="loader-2" className="w-3.5 h-3.5 animate-spin" />}
                        Confirm Replacement
                      </button>
                    </div>

                    {(() => {
                      const setups = Array.isArray(tiresData) ? tiresData : [];
                      const storedSetups = setups.filter((s: any) => s?.status === 'STORED');
                      if (storedSetups.length === 0) return null;
                      return (
                        <div className={`pt-4 border-t ${'border-border'}`}>
                          <p className="text-[10px] uppercase tracking-wider font-semibold mb-2 text-muted-foreground">Activate Stored Set</p>
                          <div className="space-y-2 mb-3">
                            {storedSetups.map((s: any) => (
                              <button
                                key={s.id}
                                onClick={() => setActivatingStoredSetId(s.id)}
                                className={`w-full text-left px-3 py-2 rounded-lg border text-xs ${
                                  activatingStoredSetId === s.id
                                    ? 'border-brand bg-status-info/10'
                                    : 'border-border'
                                }`}
                              >
                                <p className="font-semibold text-foreground">{s.name ?? s.brandModelFront ?? 'Stored set'}</p>
                                <p className="text-[10px] text-muted-foreground">{s.tireSeason ?? 'Season n/a'} · {s.removedAt ? `stored since ${new Date(s.removedAt).toLocaleDateString('de-DE')}` : 'stored'}</p>
                              </button>
                            ))}
                          </div>
                          <div className="flex gap-2">
                            <input
                              type="number"
                              value={storedActivationOdometer}
                              onChange={(e) => setStoredActivationOdometer(e.target.value)}
                              className={`flex-1 px-3 py-2 rounded-lg text-xs border ${'bg-background border border-border text-foreground'} outline-none`}
                              placeholder="Odometer for activation"
                            />
                            <button
                              onClick={handleActivateStoredSet}
                              disabled={!activatingStoredSetId || submittingTireChange}
                              className="px-4 py-2 rounded-lg text-xs font-semibold bg-status-info hover:bg-brand text-brand-foreground disabled:opacity-50"
                            >
                              Activate
                            </button>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}
              </>
            )}

            {/* ── ROTATION HISTORY TAB ── */}
            {tireModalTab === 'history' && !tireDetailLoading && (
              <div className={`rounded-lg p-5 bg-muted`}>
                <h3 className={`text-xs font-semibold uppercase tracking-wider mb-5 text-muted-foreground`}>Tire Movement History</h3>
                {(tireDetail?.rotationHistory ?? []).length > 0 ? (
                  <div className="space-y-0">
                    {(tireDetail?.rotationHistory ?? []).map((entry: any, i: number) => (
                      <div key={entry.id} className="relative flex items-start gap-3 py-4">
                        {i < (tireDetail?.rotationHistory?.length ?? 0) - 1 && <div className={`absolute left-[9px] w-px bg-muted`} style={{ top: 'calc(50% + 4px)', height: '100%' }} />}
                        <div className="relative z-10 mt-1 shrink-0">
                          {entry.changeType === 'ROTATION' ? <Icon name="refresh-cw" className="w-[18px] h-[18px] text-status-info" /> : entry.changeType === 'TIRE_CHANGE' ? <Icon name="circle" className="w-[18px] h-[18px] text-red-500" /> : <Icon name="plus" className="w-[18px] h-[18px] text-green-500" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={`text-sm font-bold text-foreground`}>{new Date(entry.date).toLocaleDateString('de-DE', { day: 'numeric', month: 'numeric', year: '2-digit' })}</span>
                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-semibold ${entry.changeType === 'ROTATION' ? ('sq-chip-info') : entry.changeType === 'TIRE_CHANGE' ? ('sq-chip-critical') : ('sq-chip-success')}`}>{entry.changeType.replace('_', ' ')}</span>
                            {entry.odometerKm != null && <span className={`text-[10px] text-muted-foreground`}>{entry.odometerKm.toLocaleString()} km</span>}
                          </div>
                          {entry.rotationTemplate && <p className={`text-xs mt-0.5 text-muted-foreground`}>Pattern: {entry.rotationTemplate.replace(/_/g, ' ')}</p>}
                          {entry.notes && <p className={`text-[10px] mt-0.5 text-muted-foreground`}>{entry.notes}</p>}
                          {entry.createdBy && <p className={`text-[9px] mt-0.5 text-muted-foreground/60`}>by {entry.createdBy}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className={`flex flex-col items-center justify-center py-12 text-muted-foreground/70`}>
                    <Icon name="refresh-cw" className="w-8 h-8 mb-3 opacity-40" />
                    <p className="text-sm font-medium">No rotation or change events recorded</p>
                    <p className="text-xs mt-1 opacity-60">Use the Rotate or Change actions to log tire movements</p>
                  </div>
                )}

                {/* Measurement History */}
                {(tireDetail?.measurements ?? []).length > 0 && (
                  <div className={`mt-6 pt-5 border-t border-border`}>
                    <h4 className={`text-xs font-semibold uppercase tracking-wider mb-4 text-muted-foreground`}>Measurement History</h4>
                    <div className="space-y-3">
                      {(tireDetail?.measurements ?? []).map((m: any) => (
                        <div key={m.id} className={`rounded-xl p-3 bg-muted`}>
                          <div className="flex items-center gap-2 mb-2">
                            <Icon name="ruler" className={`w-3.5 h-3.5 ${'text-[color:var(--status-info)]'}`} />
                            <span className={`text-xs font-semibold text-foreground`}>{new Date(m.date).toLocaleDateString('de-DE')}</span>
                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-medium ${'sq-chip-neutral'}`}>{m.source}</span>
                            {m.odometerKm != null && <span className={`text-[10px] text-muted-foreground`}>{m.odometerKm.toLocaleString()} km</span>}
                            {m.workshopName && <span className={`text-[10px] text-muted-foreground`}>{m.workshopName}</span>}
                          </div>
                          <div className="flex gap-3">
                            {m.values.map((v: any) => (
                              <span key={v.position} className={`text-xs text-foreground/80`}><span className="font-semibold">{v.position}</span>: {v.mm.toFixed(1)} mm</span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── WEAR FACTORS TAB ── */}
            {tireModalTab === 'factors' && !tireDetailLoading && tireDetail && (
              <div className={`rounded-lg p-5 bg-muted`}>
                <h3 className={`text-xs font-semibold uppercase tracking-wider mb-4 text-muted-foreground`}>Wear Factor Analysis</h3>
                <div className="grid grid-cols-3 gap-x-6 gap-y-4">
                  {[
                    { icon: Activity, label: 'Axle (Front)', val: tireDetail.factors.axleFactorFront, desc: (v: number) => v <= 1.0 ? 'Low load' : v <= 1.1 ? 'Normal' : 'High load', warn: (v: number) => v > 1.15 },
                    { icon: Activity, label: 'Axle (Rear)', val: tireDetail.factors.axleFactorRear, desc: (v: number) => v <= 1.0 ? 'Low load' : v <= 1.1 ? 'Normal' : 'High load', warn: (v: number) => v > 1.15 },
                    { icon: Wind, label: 'Usage Mix', val: tireDetail.factors.usageFactor, desc: (v: number) => v < 0.97 ? 'Highway-heavy' : v > 1.08 ? 'City-heavy' : 'Balanced', warn: (v: number) => v > 1.10 },
                    { icon: Gauge, label: 'Behavior', val: tireDetail.factors.behaviorFactor, desc: (v: number) => v <= 1.0 ? 'Smooth' : v <= 1.08 ? 'Normal' : 'Aggressive', warn: (v: number) => v > 1.10 },
                    { icon: Thermometer, label: 'Heat Stress', val: tireDetail.factors.temperatureFactor, desc: (v: number) => v <= 1.0 ? 'Optimal' : v <= 1.03 ? 'Mild' : 'Elevated', warn: (v: number) => v > 1.03 },
                    ...(tireDetail.factors.pressureFactorFront != null ? [{ icon: Gauge, label: 'Pressure (F)', val: tireDetail.factors.pressureFactorFront, desc: (v: number) => v <= 1.01 ? 'Normal' : v <= 1.06 ? 'Mild deviation' : 'Significant', warn: (v: number) => v > 1.06 }] : []),
                    ...(tireDetail.factors.pressureFactorRear != null ? [{ icon: Gauge, label: 'Pressure (R)', val: tireDetail.factors.pressureFactorRear, desc: (v: number) => v <= 1.01 ? 'Normal' : v <= 1.06 ? 'Mild deviation' : 'Significant', warn: (v: number) => v > 1.06 }] : []),
                    ...(tireDetail.factors.loadFactor != null ? [{ icon: Activity, label: 'Load', val: tireDetail.factors.loadFactor, desc: (v: number) => v <= 1.01 ? 'Normal weight' : v <= 1.06 ? 'Above avg' : 'Heavy', warn: (v: number) => v > 1.06 }] : []),
                    ...(tireDetail.factors.seasonMismatchFactor != null && tireDetail.factors.seasonMismatchFactor > 1.01 ? [{ icon: AlertTriangle, label: 'Season Match', val: tireDetail.factors.seasonMismatchFactor, desc: () => 'Mismatch detected', warn: () => true }] : []),
                    ...(tireDetail.factors.interactionPenaltyFront != null && tireDetail.factors.interactionPenaltyFront > 1.01 ? [{ icon: AlertTriangle, label: 'Multi-Stress', val: tireDetail.factors.interactionPenaltyFront, desc: () => 'Combined stressors', warn: () => true }] : []),
                    { icon: Zap, label: 'Regen Front', val: tireDetail.factors.regenBrakingFactorFront, desc: (v: number) => v < 0.85 ? 'Strong regen' : v < 1 ? 'Moderate regen' : 'No regen', warn: () => false },
                    { icon: Zap, label: 'Regen Rear', val: tireDetail.factors.regenBrakingFactorRear, desc: (v: number) => v < 0.85 ? 'Strong regen' : v < 1 ? 'Moderate regen' : 'No regen', warn: () => false },
                  ].map(f => (
                    <div key={f.label} className="flex items-start gap-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${f.warn(f.val) ? ('sq-tone-watch') : ('sq-tone-info')}`}>
                        <f.icon className={`w-4 h-4 ${f.warn(f.val) ? 'text-amber-500' : 'text-status-info'}`} />
                      </div>
                      <div className="min-w-0">
                        <p className={`text-[10px] uppercase tracking-wider font-semibold text-muted-foreground`}>{f.label}</p>
                        <p className={`text-sm font-bold text-foreground`}>{f.val.toFixed(2)}x</p>
                        <p className={`text-[10px] text-muted-foreground`}>{f.desc(f.val)}</p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Staggered Life Adjustments */}
                {tireDetail.factors.isStaggered && (
                  <div className={`mt-4 pt-3 border-t border-border`}>
                    <p className={`text-[10px] uppercase tracking-wider font-semibold mb-2 text-muted-foreground`}>Staggered Setup Adjustments</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div><p className={`text-[10px] text-muted-foreground`}>Front Life Adj.</p><p className={`text-xs font-bold text-foreground`}>{tireDetail.factors.staggeredLifeAdjustmentFront.toFixed(3)}x</p></div>
                      <div><p className={`text-[10px] text-muted-foreground`}>Rear Life Adj.</p><p className={`text-xs font-bold text-foreground`}>{tireDetail.factors.staggeredLifeAdjustmentRear.toFixed(3)}x</p></div>
                    </div>
                  </div>
                )}

                <div className={`mt-4 pt-3 border-t border-border grid grid-cols-3 gap-3`}>
                  <div><p className={`text-[10px] uppercase tracking-wider font-semibold text-muted-foreground`}>k-Factor Front</p><p className={`text-xs font-bold text-foreground`}>{tireDetail.factors.kFactorFront.toFixed(3)}</p></div>
                  <div><p className={`text-[10px] uppercase tracking-wider font-semibold text-muted-foreground`}>k-Factor Rear</p><p className={`text-xs font-bold text-foreground`}>{tireDetail.factors.kFactorRear.toFixed(3)}</p></div>
                  <div><p className={`text-[10px] uppercase tracking-wider font-semibold text-muted-foreground`}>Wear Rate</p><p className={`text-xs font-bold text-foreground`}>{tireDetail.effectiveWearRate.front.toLocaleString()} / {tireDetail.effectiveWearRate.rear.toLocaleString()} km/mm</p></div>
                </div>

                {/* Regression & Calibration Status */}
                <div className={`mt-4 pt-3 border-t border-border grid grid-cols-3 gap-3`}>
                  <div>
                    <p className={`text-[10px] uppercase tracking-wider font-semibold text-muted-foreground`}>Model</p>
                    <p className={`text-xs font-bold ${tireDetail.factors.regressionActive ? ('text-[color:var(--status-info)]') : 'text-foreground'}`}>
                      {tireDetail.factors.regressionActive ? `Regression (R²: ${tireDetail.factors.regressionConfidence.toFixed(2)})` : 'Formula-based'}
                    </p>
                  </div>
                  <div>
                    <p className={`text-[10px] uppercase tracking-wider font-semibold text-muted-foreground`}>Calibrations</p>
                    <p className={`text-xs font-bold text-foreground`}>{tireDetail.factors.calibrationCount}</p>
                  </div>
                  {tireDetail.factors.driveType && (
                    <div>
                      <p className={`text-[10px] uppercase tracking-wider font-semibold text-muted-foreground`}>Drivetrain</p>
                      <p className={`text-xs font-bold text-foreground`}>{tireDetail.factors.driveType}</p>
                    </div>
                  )}
                  {tireDetail.factors.tireArchetype && (
                    <div>
                      <p className={`text-[10px] uppercase tracking-wider font-semibold text-muted-foreground`}>Tire Archetype</p>
                      <p className={`text-xs font-bold capitalize text-foreground`}>{(tireDetail.factors.tireArchetype as string).replace(/_/g, ' ')}</p>
                    </div>
                  )}
                </div>

                {/* Explainability / Source Transparency */}
                {tireDetail.explainability && (
                  <div className={`mt-4 pt-3 border-t border-border`}>
                    <p className={`text-[10px] uppercase tracking-wider font-semibold mb-3 text-muted-foreground`}>Data Sources & Intelligence</p>
                    <div className="grid grid-cols-3 gap-3 mb-3">
                      <div><p className={`text-[9px] uppercase text-muted-foreground/70`}>Tread Source</p><p className={`text-[10px] font-semibold capitalize text-foreground/80`}>{tireDetail.explainability.currentTreadSource.replace(/_/g, ' ')}</p></div>
                      <div><p className={`text-[9px] uppercase text-muted-foreground/70`}>Ref. New Tread</p><p className={`text-[10px] font-semibold capitalize text-foreground/80`}>{tireDetail.explainability.referenceNewTreadSource.replace(/_/g, ' ')}</p></div>
                      <div><p className={`text-[9px] uppercase text-muted-foreground/70`}>Replace Threshold</p><p className={`text-[10px] font-semibold capitalize text-foreground/80`}>{tireDetail.explainability.replacementThresholdSource.replace(/_/g, ' ')}</p></div>
                    </div>
                    {tireDetail.explainability.topWearDrivers.length > 0 && (
                      <div className="mb-2"><p className={`text-[9px] uppercase text-muted-foreground/70`}>Top Wear Drivers</p><p className={`text-[10px] font-semibold capitalize ${'text-[color:var(--status-watch)]'}`}>{tireDetail.explainability.topWearDrivers.join(', ')}</p></div>
                    )}
                    {tireDetail.explainability.possibleCauseHints.length > 0 && (
                      <div className={`rounded-lg p-2.5 mt-2 ${'sq-tone-watch'}`}>
                        {tireDetail.explainability.possibleCauseHints.map((h, i) => (
                          <p key={i} className={`text-[10px] ${'text-[color:var(--status-watch)]'}`}>• {h}</p>
                        ))}
                      </div>
                    )}
                    {tireDetail.factors.tireSpecMatched && (
                      <p className={`text-[9px] mt-2 ${'text-[color:var(--status-info)]'}`}>AI Tire Spec matched — model-aware intelligence active (confidence: {tireDetail.explainability.tireSpecConfidence}%)</p>
                    )}
                  </div>
                )}

                {/* Confidence Dimensions */}
                {(tireDetail.summary.tireSpecConfidence != null || tireDetail.summary.dataCompletenessConfidence != null || tireDetail.summary.modelConfidence != null) && (
                  <div className={`mt-4 pt-3 border-t border-border`}>
                    <p className={`text-[10px] uppercase tracking-wider font-semibold mb-2 text-muted-foreground`}>Confidence Breakdown</p>
                    <div className="grid grid-cols-3 gap-3">
                      {tireDetail.summary.tireSpecConfidence != null && (
                        <div>
                          <p className={`text-[9px] uppercase text-muted-foreground/70`}>Tire Spec</p>
                          <div className={`w-full h-1.5 rounded-full overflow-hidden mt-1 bg-muted`}>
                            <div className="h-full bg-status-info rounded-full" style={{ width: `${tireDetail.summary.tireSpecConfidence}%` }} />
                          </div>
                          <p className={`text-[9px] font-semibold mt-0.5 text-muted-foreground`}>{tireDetail.summary.tireSpecConfidence}%</p>
                        </div>
                      )}
                      {tireDetail.summary.dataCompletenessConfidence != null && (
                        <div>
                          <p className={`text-[9px] uppercase text-muted-foreground/70`}>Data Quality</p>
                          <div className={`w-full h-1.5 rounded-full overflow-hidden mt-1 bg-muted`}>
                            <div className="h-full bg-green-500 rounded-full" style={{ width: `${tireDetail.summary.dataCompletenessConfidence}%` }} />
                          </div>
                          <p className={`text-[9px] font-semibold mt-0.5 text-muted-foreground`}>{tireDetail.summary.dataCompletenessConfidence}%</p>
                        </div>
                      )}
                      {tireDetail.summary.modelConfidence != null && (
                        <div>
                          <p className={`text-[9px] uppercase text-muted-foreground/70`}>Model</p>
                          <div className={`w-full h-1.5 rounded-full overflow-hidden mt-1 bg-muted`}>
                            <div className="h-full bg-purple-500 rounded-full" style={{ width: `${tireDetail.summary.modelConfidence}%` }} />
                          </div>
                          <p className={`text-[9px] font-semibold mt-0.5 text-muted-foreground`}>{tireDetail.summary.modelConfidence}%</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
            {vehicleId && (
              <HealthServiceActions
                vehicleId={vehicleId}
                healthModule="tires"
                rentalModule={rentalHealth?.modules.tires}
                contextLines={[
                  tireHealth?.displayTreadMm != null
                    ? `Profiltiefe: ${tireHealth.displayTreadMm.toFixed(1)} mm`
                    : '',
                ].filter(Boolean)}
                onOpenServiceCenter={onOpenServiceCenter}
                onOpenExistingTask={onOpenExistingTask}
                className="mt-4 pt-4 border-t border-border"
              />
            )}
          </div>
        </div>,
        document.body
      )}

      {/* ═══════════ HV Battery Detail Modal (EV) ═══════════ */}
      {showHvBattery && isEv && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-6" onClick={() => closeModal(setShowHvBattery)}>
          <div className="absolute inset-0 overlay-scrim" />
          <div onClick={e => e.stopPropagation()} className={`relative w-full max-w-3xl max-h-[90vh] overflow-y-auto border surface-premium border-border`}>
            <div className={`sticky top-0 z-10 px-5 py-4 rounded-t-xl border-b bg-popover border-border`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-emerald-500/15 flex items-center justify-center">
                    <Icon name="battery-charging" className="w-5 h-5 text-emerald-500" />
                  </div>
                  <div>
                    <h2 className="text-base font-semibold text-foreground">HV Battery Health</h2>
                    <p className={`text-xs text-muted-foreground`}>Traction Battery Intelligence</p>
                  </div>
                </div>
                <button onClick={() => closeModal(setShowHvBattery)} className={`p-2 rounded-xl transition-colors ${'hover:bg-muted text-muted-foreground'}`}><Icon name="x" className="w-5 h-5" /></button>
              </div>
            </div>

            <div className="px-5 py-4">
              <BatteryHvDetailContent
                vm={batteryHvDetailVm}
                trendChartSlot={
                  (hvBatteryStatus?.recentTrend?.length ?? 0) > 0 ? (
                    <div className={`rounded-lg p-5 bg-muted`}>
                      <h3 className={`text-sm font-semibold mb-4 text-foreground`}>HV-Zustand Trend</h3>
                      <div className="h-40">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={hvBatteryStatus?.recentTrend?.map((t: any) => ({
                            date: new Date(t.date).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }),
                            soh: t.sohPercent,
                            soc: t.socPercent,
                          }))}>
                            <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke='var(--muted-foreground)' />
                            <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} stroke='var(--muted-foreground)' />
                            <Tooltip contentStyle={{ background: 'var(--card)', border: 'none', borderRadius: 12, fontSize: 11 }} />
                            <Line type="monotone" dataKey="soh" stroke="#10b981" strokeWidth={2} dot={false} name="Geschätzter HV-Zustand %" />
                            <Line type="monotone" dataKey="soc" stroke="#6366f1" strokeWidth={1.5} dot={false} name="SoC %" strokeDasharray="4 2" />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  ) : null
                }
              />
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
