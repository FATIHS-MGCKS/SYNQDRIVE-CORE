import type {
  BatteryHealthSummary,
  BrakeHealthSummary,
  RentalHealthModule,
  RentalHealthState,
  ServiceInfoStatus,
  TireHealthSummaryResponse,
  VehicleHealthResponse,
  VehicleHealthTabSummaryDto,
} from '../../../lib/api';
import type { StatusTone } from '../../../components/patterns';
import { collectRentalHealthReasons } from '../../rental-health-ui';
import {
  rentalHealthStateLabel,
  rentalHealthStateToTone,
  toneToChipClass,
  toneToSurfaceClass,
} from '../../lib/rental-health-status';
import {
  buildBokraftComplianceDisplay,
  buildNextServiceDisplay,
  buildTuvComplianceDisplay,
  type ServiceDisplayOptions,
} from '../../lib/service-info-display';
import {
  dataQualityChipTone,
  dataQualityShortLabel,
  sortSummaryFindings,
} from '../../lib/health-tab-summary-ui';
import {
  estimatedBatteryHealthLabel,
  formatBatteryVoltage,
  hasBatteryStartProblemEvidence,
  resolveOverviewBatteryVoltage,
  restingVoltageStatusLabel,
} from '../../lib/battery-display.utils';
import {
  isCanonicalBatteryTracked,
  mapCanonicalBatteryUiSeverityToScore,
  resolveCanonicalBatteryUiSeverity,
  resolveCanonicalEstimatedHealthScore,
} from '../../lib/canonical-battery-ui.adapter';
import { batteryDataQualityDetailNoteDe } from '../../lib/battery-data-quality.utils';
import {
  segmentFromHealthState,
  type SegmentLevel,
  type SegmentTone,
} from '../../lib/health-segment-display';
import {
  tireHasTrackableData,
  tireRemainingKmLabel,
  tireStatusToSegment,
  tireUiStatus,
  tireUiStatusLabel,
} from '../../lib/tire-health-detail-ui';
import { resolveTireHealthBoxBarPercent } from '../../lib/tire-wear-read-model-ui';
import {
  brakeOverviewLabel,
  brakeRemainingKmLabel,
} from '../../lib/brake-health-evidence-ui';
import {
  mapDataCoverageDisplay,
  mapHealthSeverityDisplay,
  type HealthSeverityDisplay,
} from './vehicle-health-display.mapper';

export type VehicleHealthBoxOverallState =
  | 'loading'
  | 'unavailable'
  | 'insufficient'
  | 'good'
  | 'warning'
  | 'critical';

export type DtcLoadState = 'idle' | 'loading' | 'loaded' | 'error';

export interface ModuleRowStyle {
  label: string;
  labelColor: string;
  bar: string;
  barPct: number;
  accentRing: string;
}

export interface FaultsStatDisplay {
  displayValue: string;
  toneClass: string;
  sublabel?: string;
}

export interface VehicleHealthBoxViewModel {
  overallState: VehicleHealthBoxOverallState;
  overallStatusLabel: string;
  overallTitle?: string;
  overallDot: string;
  overallAccentRing: string;
  dataCoverageLabel: string | null;
  statCriticalCount: number;
  statWarningCount: number;
  faultsStat: FaultsStatDisplay;
  trackedCount: number;
  untrackedCount: number;
  findings: Array<{ title: string; severity: 'critical' | 'warning' | 'info' | 'unknown' }>;
  serviceTileTone: 'critical' | 'warning' | 'good' | 'neutral' | 'info';
  healthItems: Array<{
    key: 'brakes' | 'tires' | 'battery';
    label: string;
    value: number;
    detail: string;
    tracked: boolean;
    rowStyle: ModuleRowStyle;
    showBadge: boolean;
    isCalibrating: boolean;
    isStabilizing: boolean;
    isUntracked: boolean;
    showPercent: boolean;
    segmentLevel: SegmentLevel;
    segmentTone: SegmentTone;
    segmentLabel: string;
  }>;
  nsDisplay: ReturnType<typeof buildNextServiceDisplay>;
  tuvCompliance: ReturnType<typeof buildTuvComplianceDisplay>;
  bokCompliance: ReturnType<typeof buildBokraftComplianceDisplay>;
  dataBasis: {
    levelLabel: string;
    levelTone: StatusTone;
    qualityLabel: string;
    reasons: string[];
    degraded: Array<{ source: string; message: string }>;
  } | null;
}

function severityToBoxState(severity: HealthSeverityDisplay): VehicleHealthBoxOverallState {
  switch (severity) {
    case 'loading':
      return 'loading';
    case 'unavailable':
      return 'unavailable';
    case 'critical':
      return 'critical';
    case 'warning':
      return 'warning';
    case 'good':
      return 'good';
    case 'no_data':
    default:
      return 'insufficient';
  }
}

function overallVisual(state: VehicleHealthBoxOverallState): {
  dot: string;
  accentRing: string;
} {
  switch (state) {
    case 'loading':
    case 'unavailable':
    case 'insufficient':
      return {
        dot: 'bg-[color:var(--status-nodata)]',
        accentRing: 'sq-tone-nodata ring-[color:var(--status-nodata-soft)]',
      };
    case 'good':
      return {
        dot: 'bg-[color:var(--status-positive)]',
        accentRing: 'sq-tone-success ring-[color:var(--status-positive-soft)]',
      };
    case 'warning':
      return {
        dot: 'bg-[color:var(--status-watch)]',
        accentRing: 'sq-tone-watch ring-[color:var(--status-watch-soft)]',
      };
    case 'critical':
    default:
      return {
        dot: 'bg-[color:var(--status-critical)]',
        accentRing: 'sq-tone-critical ring-[color:var(--status-critical-soft)]',
      };
  }
}

export function mapOverallHealthBoxState(params: {
  rentalHealth: VehicleHealthResponse | null;
  rentalHealthLoading: boolean;
  healthError: string | null;
  trackedCount?: number;
  statCriticalCount?: number;
  statWarningCount?: number;
}): { state: VehicleHealthBoxOverallState; label: string; title?: string } {
  const mapped = mapHealthSeverityDisplay(params);
  return {
    state: severityToBoxState(mapped.severity),
    label: mapped.label,
    title: mapped.title,
  };
}

/** Service tile severity: RentalHealth service_compliance wins; detail text stays HM/OEM. */
export function resolveServiceComplianceTone(
  displayTone: 'critical' | 'warning' | 'good' | 'neutral' | 'info',
  serviceModule: RentalHealthModule | undefined,
): 'critical' | 'warning' | 'good' | 'neutral' | 'info' {
  if (!serviceModule) return displayTone;
  switch (serviceModule.state) {
    case 'critical':
      return 'critical';
    case 'warning':
      return 'warning';
    case 'good':
      return 'good';
    case 'unknown':
    case 'n_a':
      return displayTone === 'good' ? 'neutral' : displayTone;
    default:
      return displayTone;
  }
}

export function mapFaultsStat(
  rentalHealth: VehicleHealthResponse | null | undefined,
  dtcLoadState: DtcLoadState,
  dtcCount: number | null,
): FaultsStatDisplay {
  const mod = rentalHealth?.modules.error_codes;
  const neutralTone = 'border-border bg-muted/40 text-muted-foreground';
  const criticalTone = 'border-transparent sq-tone-critical';
  const watchTone = 'border-transparent sq-tone-watch';
  const noDataTone = 'border-transparent sq-tone-nodata';

  if (dtcLoadState === 'loading') {
    return { displayValue: '…', toneClass: neutralTone };
  }

  const reasonLower = (mod?.reason ?? '').toLowerCase();
  if (dtcLoadState === 'error' || reasonLower.includes('endpoint') || reasonLower.includes('unavailable')) {
    return { displayValue: '—', toneClass: noDataTone, sublabel: 'DTC unavailable' };
  }
  if (mod?.data_stale) {
    return { displayValue: '—', toneClass: watchTone, sublabel: 'Datenstand verzögert' };
  }
  if (mod?.state === 'unknown' && !mod.last_updated_at) {
    return { displayValue: '—', toneClass: noDataTone, sublabel: 'No DTC data' };
  }
  if (mod?.state === 'n_a') {
    return { displayValue: '—', toneClass: noDataTone, sublabel: 'No DTC data' };
  }

  const count = dtcCount ?? 0;
  if (count === 0) {
    return { displayValue: '0', toneClass: 'border-transparent sq-tone-success' };
  }
  return {
    displayValue: String(count),
    toneClass: mod?.state === 'critical' ? criticalTone : watchTone,
  };
}

function rentalModuleToRowStyle(state: RentalHealthState | undefined): ModuleRowStyle {
  const tone = rentalHealthStateToTone(state);
  const label = rentalHealthStateLabel(state);
  const accentRing = `${toneToSurfaceClass(tone)} ring-1 ring-border`;

  switch (tone) {
    case 'success':
      return {
        label,
        labelColor: 'text-[color:var(--status-positive)]',
        bar: 'bg-[color:var(--status-positive)]',
        barPct: 85,
        accentRing,
      };
    case 'warning':
    case 'watch':
      return {
        label,
        labelColor: 'text-[color:var(--status-watch)]',
        bar: 'bg-[color:var(--status-watch)]',
        barPct: 45,
        accentRing,
      };
    case 'critical':
      return {
        label,
        labelColor: 'text-[color:var(--status-critical)]',
        bar: 'bg-[color:var(--status-critical)]',
        barPct: 15,
        accentRing,
      };
    default:
      return {
        label: state === 'unknown' ? 'Limited data' : 'No Data',
        labelColor: 'text-muted-foreground',
        bar: 'bg-muted',
        barPct: 0,
        accentRing: 'sq-tone-neutral ring-1 ring-border',
      };
  }
}

function getWearStatus(v: number, tracked: boolean): ModuleRowStyle {
  if (!tracked) return rentalModuleToRowStyle('unknown');
  if (v >= 80) {
    return {
      label: 'Excellent',
      labelColor: 'text-[color:var(--status-positive)]',
      bar: 'bg-[color:var(--status-positive)]',
      barPct: v,
      accentRing: 'sq-tone-success ring-1 ring-border',
    };
  }
  if (v >= 60) {
    return {
      label: 'Monitor',
      labelColor: 'text-[color:var(--status-watch)]',
      bar: 'bg-[color:var(--status-watch)]',
      barPct: v,
      accentRing: 'sq-tone-watch ring-1 ring-border',
    };
  }
  if (v >= 30) {
    return {
      label: 'Due soon',
      labelColor: 'text-[color:var(--status-warning)]',
      bar: 'bg-[color:var(--status-warning)]',
      barPct: v,
      accentRing: 'sq-tone-warning ring-1 ring-border',
    };
  }
  return {
    label: 'Critical',
    labelColor: 'text-[color:var(--status-critical)]',
    bar: 'bg-[color:var(--status-critical)]',
    barPct: v,
    accentRing: 'sq-tone-critical ring-1 ring-border',
  };
}

function getBatteryLocalStyle(
  v: number,
  tracked: boolean,
  severity: 'good' | 'watch' | 'warning' | 'critical' | 'unknown',
): ModuleRowStyle {
  if (!tracked) return rentalModuleToRowStyle('unknown');
  if (severity === 'critical') return rentalModuleToRowStyle('critical');
  if (severity === 'warning' || severity === 'watch') {
    return {
      label: severity === 'watch' ? 'Monitor' : 'Warning',
      labelColor: 'text-[color:var(--status-watch)]',
      bar: 'bg-[color:var(--status-watch)]',
      barPct: 45,
      accentRing: 'sq-tone-watch ring-1 ring-border',
    };
  }
  if (severity === 'good') return rentalModuleToRowStyle('good');
  if (v < 50) return rentalModuleToRowStyle('critical');
  if (v < 75) return rentalModuleToRowStyle('warning');
  return rentalModuleToRowStyle('good');
}

function resolveBatteryRowStyle(
  rentalMod: RentalHealthModule | undefined,
  localStyle: ModuleRowStyle,
  hasHardEvidence: boolean,
): ModuleRowStyle {
  if (!rentalMod) return localStyle;
  if (rentalMod.state === 'critical') return rentalModuleToRowStyle('critical');
  if (rentalMod.state === 'warning' && hasHardEvidence) {
    return rentalModuleToRowStyle(rentalMod.state);
  }
  return localStyle;
}

function getBrakeLocalStyle(cond: string | undefined, tracked: boolean): ModuleRowStyle {
  if (!tracked) return rentalModuleToRowStyle('unknown');
  switch (cond) {
    case 'GOOD':
      return rentalModuleToRowStyle('good');
    case 'WATCH':
    case 'WARNING':
      return rentalModuleToRowStyle('warning');
    case 'CRITICAL':
      return rentalModuleToRowStyle('critical');
    default:
      return rentalModuleToRowStyle('unknown');
  }
}

function resolveModuleRowStyle(
  rentalMod: RentalHealthModule | undefined,
  localStyle: ModuleRowStyle,
): ModuleRowStyle {
  if (rentalMod) return rentalModuleToRowStyle(rentalMod.state);
  return localStyle;
}

function moduleShowBadge(
  rentalMod: RentalHealthModule | undefined,
  localShow: boolean,
): boolean {
  if (rentalMod) {
    return rentalMod.state === 'critical' || rentalMod.state === 'warning';
  }
  return localShow;
}

export function buildVehicleHealthBoxViewModel(params: {
  rentalHealth: VehicleHealthResponse | null;
  rentalHealthLoading: boolean;
  healthError: string | null;
  tires: TireHealthSummaryResponse | null;
  brakes: BrakeHealthSummary | null;
  battery: BatteryHealthSummary | null;
  service: ServiceInfoStatus | null;
  dtcLoadState: DtcLoadState;
  dtcCount: number | null;
  healthTabSummary: VehicleHealthTabSummaryDto | null;
  vehicleTiresFallback: number;
  lvBatteryVoltage: number | null;
  serviceDisplay?: ServiceDisplayOptions;
}): VehicleHealthBoxViewModel {
  const {
    rentalHealth,
    rentalHealthLoading,
    healthError,
    tires,
    brakes,
    battery,
    service,
    dtcLoadState,
    dtcCount,
    healthTabSummary,
    vehicleTiresFallback,
    lvBatteryVoltage,
    serviceDisplay,
  } = params;

  const rentalReasons = collectRentalHealthReasons(rentalHealth);
  const rentalCriticalCount = rentalReasons.filter((r) => r.state === 'critical').length;
  const rentalWarningCount = rentalReasons.filter((r) => r.state === 'warning').length;

  const tiresTracked = tireHasTrackableData(tires);
  const tireUi = tireUiStatus(tires);
  const tiresVal = tires?.displayTreadMm ?? 0;
  const batteryPubState = battery?.lv?.publicationState ?? battery?.currentState?.publicationState ?? 'INITIAL_CALIBRATION';
  const lvHealthScore = resolveCanonicalEstimatedHealthScore(battery);
  const batteryVoltage = resolveOverviewBatteryVoltage(battery, lvBatteryVoltage);
  const hasBackendCriticalBattery = rentalHealth?.modules.battery?.state === 'critical';
  const batterySeverity = resolveCanonicalBatteryUiSeverity(
    battery,
    rentalHealth?.modules.battery?.state,
  );
  const batteryScore = lvHealthScore;
  const batteryVal = mapCanonicalBatteryUiSeverityToScore(batterySeverity, batteryScore);

  const brakesTracked = brakes?.overallCondition != null && brakes.overallCondition !== 'UNKNOWN';
  const batteryTracked = isCanonicalBatteryTracked(battery);
  const trackedFlags = [brakesTracked, tiresTracked, batteryTracked];
  const untrackedCount = 3 - trackedFlags.filter(Boolean).length;
  const trackedCount = trackedFlags.filter(Boolean).length;

  const tireCanon = tires?.overallStatus ?? null;
  const brakeCond = brakes?.overallCondition;

  const localCriticalCount = [
    brakeCond === 'CRITICAL',
    tiresTracked && (tireUi === 'CRITICAL' || tireUi === 'REVIEW_REQUIRED'),
    batteryTracked && batterySeverity === 'critical',
  ].filter(Boolean).length;
  const localDueSoonCount = [
    brakeCond === 'WARNING' || brakeCond === 'WATCH',
    tiresTracked && (tireUi === 'WARNING' || tireUi === 'MEASUREMENT_REQUIRED' || tireUi === 'LIMITED_DATA'),
    batteryTracked && (batterySeverity === 'warning' || batterySeverity === 'watch'),
  ].filter(Boolean).length;

  const statCriticalCount = rentalHealth ? rentalCriticalCount : localCriticalCount;
  const statWarningCount = rentalHealth ? rentalWarningCount : localDueSoonCount;

  const overall = mapOverallHealthBoxState({
    rentalHealth,
    rentalHealthLoading,
    healthError,
    trackedCount,
    statCriticalCount,
    statWarningCount,
  });
  const { dot, accentRing } = overallVisual(overall.state);
  const dataCoverage = mapDataCoverageDisplay({ rentalHealth, trackedCount, untrackedCount });

  const brakesDetail = (() => {
    const overview = brakeOverviewLabel(brakes, 'en');
    const rem = brakeRemainingKmLabel(brakes, 'en');
    if (rem !== '—') return `${overview} · ${rem}`;
    if (brakes?.stateClass === 'WARNING_ONLY') return 'Warning-only telemetry';
    if (brakes?.stateClass === 'NO_BASELINE') return overview;
    if (brakeCond === 'GOOD') return overview;
    if (brakeCond === 'WATCH' || brakeCond === 'WARNING') return `${overview} · Check soon`;
    return brakesTracked ? overview : 'No tracking';
  })();

  const tiresDetail = (() => {
    if (!tiresTracked) return 'No tracking';
    const rem = tireRemainingKmLabel(tires, 'en');
    if (rem !== '—') return rem;
    if (tires?.actionState === 'REPLACE') return 'Replace now';
    if (tires?.actionState === 'PLAN_SERVICE') return 'Plan service';
    if (tires?.actionState === 'CHECK_SOON') return 'Check soon';
    return tireUiStatusLabel(tires, 'en');
  })();

  const batteryDetail = (() => {
    if (batteryPubState === 'INITIAL_CALIBRATION') return 'Calibrating (estimate unavailable)';
    if (batteryPubState === 'STABILIZING') {
      return batteryVoltage.valueV != null
        ? `${formatBatteryVoltage(batteryVoltage.valueV, batteryVoltage.kind === 'resting' ? 2 : 1)} · Stabilizing`
        : 'Stabilizing';
    }

    const parts: string[] = [];
    if (batteryVoltage.kind === 'resting' && batteryVoltage.valueV != null) {
      parts.push(formatBatteryVoltage(batteryVoltage.valueV, 2));
      parts.push(restingVoltageStatusLabel(batteryVoltage.status));
    } else if (batteryVoltage.kind === 'current' && batteryVoltage.valueV != null) {
      parts.push(`Aktuelle Spannung ${formatBatteryVoltage(batteryVoltage.valueV, 1)}`);
    } else {
      parts.push('Ruhespannung nicht verfügbar');
    }

    const estimatedLabel = estimatedBatteryHealthLabel(battery);
    if (estimatedLabel) parts.push(estimatedLabel);
    const qualityNote = batteryDataQualityDetailNoteDe(battery?.dataQuality?.status);
    if (qualityNote) parts.push(qualityNote);
    if (hasBatteryStartProblemEvidence(battery)) parts.push('Startschwierigkeiten möglich');

    return parts.join(' · ');
  })();

  const brakeSegment = segmentFromHealthState(brakesTracked ? brakeCond : 'UNKNOWN');
  const tireSeg = tireStatusToSegment(tireUi);
  const tireSegment = {
    level: tireSeg.level,
    tone: tireSeg.tone,
    label: tireUiStatusLabel(tires, 'en'),
  };
  const batterySegment = segmentFromHealthState(batteryTracked ? batterySeverity : 'UNKNOWN');

  const healthItems: VehicleHealthBoxViewModel['healthItems'] = [
    {
      key: 'brakes',
      label: 'Brakes',
      value: 0,
      detail: brakesDetail,
      tracked: brakesTracked,
      rowStyle: resolveModuleRowStyle(
        rentalHealth?.modules.brakes,
        getBrakeLocalStyle(brakeCond, brakesTracked),
      ),
      showBadge: moduleShowBadge(
        rentalHealth?.modules.brakes,
        brakeCond === 'WARNING' || brakeCond === 'CRITICAL' || brakeCond === 'WATCH',
      ),
      isCalibrating: false,
      isStabilizing: false,
      isUntracked: !brakesTracked,
      showPercent: false,
      segmentLevel: brakeSegment.level,
      segmentTone: brakeSegment.tone,
      segmentLabel: brakeSegment.label,
    },
    {
      key: 'tires',
      label: 'Tires',
      value: tiresVal,
      detail: tiresDetail,
      tracked: tiresTracked,
      rowStyle: resolveModuleRowStyle(
        rentalHealth?.modules.tires,
        tiresTracked
          ? {
              label: tireUiStatusLabel(tires, 'en'),
              labelColor: tireUi === 'CRITICAL' ? 'text-[color:var(--status-critical)]' : 'text-foreground',
              bar: tireUi === 'CRITICAL' ? 'bg-[color:var(--status-critical)]' : tireUi === 'WARNING' ? 'bg-[color:var(--status-watch)]' : 'bg-[color:var(--status-positive)]',
              barPct: resolveTireHealthBoxBarPercent(tires),
              accentRing: '',
            }
          : getWearStatus(0, false),
      ),
      showBadge: moduleShowBadge(
        rentalHealth?.modules.tires,
        tiresTracked && tireUi !== 'GOOD' && tireUi !== 'UNKNOWN',
      ),
      isCalibrating: false,
      isStabilizing: false,
      isUntracked: !tiresTracked,
      showPercent: false,
      segmentLevel: tireSegment.level,
      segmentTone: tireSegment.tone,
      segmentLabel: tireSegment.label,
    },
    {
      key: 'battery',
      label: 'Battery',
      value: batteryVal,
      detail: batteryDetail,
      tracked: batteryTracked,
      rowStyle: resolveBatteryRowStyle(
        rentalHealth?.modules.battery,
        getBatteryLocalStyle(batteryVal, batteryTracked, batterySeverity),
        batterySeverity === 'warning' || batterySeverity === 'critical',
      ),
      showBadge: batterySeverity === 'critical' || batterySeverity === 'warning' || batterySeverity === 'watch',
      isCalibrating: batteryPubState === 'INITIAL_CALIBRATION',
      isStabilizing: batteryPubState === 'STABILIZING',
      isUntracked: !batteryTracked && batteryPubState !== 'INITIAL_CALIBRATION' && batteryPubState !== 'STABILIZING',
      showPercent: false,
      segmentLevel: batterySegment.level,
      segmentTone: batterySegment.tone,
      segmentLabel: batterySegment.label,
    },
  ];

  const dataBasis = healthTabSummary?.dataQuality
    ? {
        levelLabel: dataQualityShortLabel(healthTabSummary.dataQuality.level),
        levelTone: dataQualityChipTone(healthTabSummary.dataQuality.level),
        qualityLabel: healthTabSummary.dataQuality.label,
        reasons: healthTabSummary.dataQuality.reasons.slice(0, 4),
        degraded: (healthTabSummary.degradedDependencies ?? []).slice(0, 4).map((d) => ({
          source: d.source,
          message: d.message,
        })),
      }
    : null;

  const findings = (() => {
    if (healthTabSummary?.findings?.length) {
      return sortSummaryFindings(healthTabSummary.findings)
        .slice(0, 3)
        .map((f) => ({
          title: f.title,
          severity: (f.severity as 'critical' | 'warning' | 'info' | 'unknown') ?? 'unknown',
        }));
    }
    return rentalReasons
      .filter((r) => r.state === 'critical' || r.state === 'warning')
      .slice(0, 3)
      .map((r) => ({
        title: `${r.label}: ${r.reason}`,
        severity: r.state === 'critical' ? ('critical' as const) : ('warning' as const),
      }));
  })();

  const nsDisplay = buildNextServiceDisplay(service ?? null, serviceDisplay);

  return {
    overallState: overall.state,
    overallStatusLabel: overall.label,
    overallTitle: overall.title,
    overallDot: dot,
    overallAccentRing: accentRing,
    dataCoverageLabel: dataCoverage?.label ?? null,
    statCriticalCount,
    statWarningCount,
    faultsStat: mapFaultsStat(rentalHealth, dtcLoadState, dtcCount),
    trackedCount,
    untrackedCount,
    findings,
    serviceTileTone: resolveServiceComplianceTone(
      nsDisplay.tone,
      rentalHealth?.modules.service_compliance,
    ),
    healthItems,
    nsDisplay,
    tuvCompliance: buildTuvComplianceDisplay(service ?? null),
    bokCompliance: buildBokraftComplianceDisplay(service ?? null),
    dataBasis,
  };
}

export function statTileTone(
  label: 'Critical' | 'Warning',
  count: number,
): string {
  if (label === 'Critical') {
    return count > 0 ? 'border-transparent sq-tone-critical' : 'border-transparent sq-tone-success';
  }
  return count > 0 ? 'border-transparent sq-tone-watch' : 'border-transparent sq-tone-success';
}

export function complianceToneClass(
  tone: 'critical' | 'warning' | 'good' | 'neutral' | 'info',
): 'critical' | 'imminent' | 'normal' | 'muted' {
  if (tone === 'critical') return 'critical';
  if (tone === 'warning') return 'imminent';
  if (tone === 'good') return 'normal';
  return 'muted';
}

export function complianceSurfaceClasses(tone: 'critical' | 'imminent' | 'normal' | 'muted'): {
  ring: string;
  icon: string;
  title: string;
  value: string;
} {
  if (tone === 'critical') {
    return {
      ring: 'border-transparent bg-[color:var(--status-critical-soft)]',
      icon: 'text-[color:var(--status-critical)]',
      title: 'text-[color:var(--status-critical)]',
      value: 'text-[color:var(--status-critical)]',
    };
  }
  if (tone === 'imminent') {
    return {
      ring: 'border-transparent bg-[color:var(--status-watch-soft)]',
      icon: 'text-[color:var(--status-watch)]',
      title: 'text-[color:var(--status-watch)]',
      value: 'text-[color:var(--status-watch)]',
    };
  }
  if (tone === 'muted') {
    return {
      ring: 'border-border bg-muted/40',
      icon: 'text-muted-foreground',
      title: 'text-muted-foreground',
      value: 'text-muted-foreground',
    };
  }
  return {
    ring: 'border-border surface-premium',
    icon: 'text-[color:var(--brand)]',
    title: 'text-foreground',
    value: 'text-foreground/90',
  };
}

export function chipClassForTone(tone: StatusTone): string {
  return toneToChipClass(tone);
}
