import type { ReactNode } from 'react';
import { Icon } from '../ui/Icon';
import { StatusChip } from '../../../components/patterns';
import { DashboardWarningLightsQuickView } from '../DashboardWarningLightsQuickView';
import type { DashboardWarningLightsResponse } from '../../../lib/api';
import vhBrakeIcon from '../../../assets/icons/vehicle-health/brake.svg';
import vhMotorFilterIcon from '../../../assets/icons/vehicle-health/motor-filter.svg';
import vhCarBatteryIcon from '../../../assets/icons/vehicle-health/car-battery.svg';
import {
  buildVehicleHealthBoxViewModel,
  complianceSurfaceClasses,
  complianceToneClass,
  statTileTone,
  type VehicleHealthBoxViewModel,
} from './vehicle-health-box.mapper';
import type { VehicleHealthBoxData } from './useVehicleHealthBoxData';
import type { VehicleHealthResponse } from '../../../lib/api';
import type { VehicleData } from '../../data/vehicles';
import { SegmentedHealthIndicator } from '../health/SegmentedHealthIndicator';
import { useLanguage } from '../../../i18n/LanguageContext';

export interface VehicleHealthBoxProps {
  selectedVehicle: VehicleData | null;
  isDarkMode: boolean;
  lvBatteryVoltage: number | null;
  rentalHealth: VehicleHealthResponse | null;
  rentalHealthLoading: boolean;
  healthError: string | null;
  boxData: VehicleHealthBoxData;
  onViewDetails?: () => void;
  /**
   * Show the technical "Data Basis" / data-quality section. Defaults to `true`.
   * The Vehicle Overview passes `false` to keep the box compact — data-quality
   * / degraded-dependency detail belongs in the Health tab / data analysis.
   */
  showDataBasis?: boolean;
}

function moduleIcon(key: 'brakes' | 'tires' | 'battery', isDarkMode: boolean): ReactNode {
  const invert = isDarkMode ? 'invert' : '';
  if (key === 'brakes') {
    return <img src={vhBrakeIcon} alt="" aria-hidden="true" className={`w-5 h-5 object-contain ${invert}`} />;
  }
  if (key === 'tires') {
    return (
      <img
        src={vhMotorFilterIcon}
        alt=""
        aria-hidden="true"
        className={`w-5 h-5 object-contain rotate-90 ${invert}`}
      />
    );
  }
  return <img src={vhCarBatteryIcon} alt="" aria-hidden="true" className={`w-5 h-5 object-contain ${invert}`} />;
}

function HealthModuleRows({
  vm,
  isDarkMode,
}: {
  vm: VehicleHealthBoxViewModel;
  isDarkMode: boolean;
}) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {vm.healthItems.map((item) => {
        const st = item.rowStyle;
        return (
          <div
            key={item.key}
            className={`min-w-0 rounded-[13px] border border-border bg-muted/40 px-2 py-2 transition-colors ${item.isUntracked ? 'opacity-70' : ''}`}
          >
            <div className="flex min-w-0 flex-col items-center gap-1.5 text-center">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[9px] surface-premium">
                {moduleIcon(item.key, isDarkMode)}
              </div>
              <span className="max-w-full truncate text-[10px] font-bold tracking-[-0.01em] text-foreground">
                {item.label}
              </span>
              <SegmentedHealthIndicator
                level={item.segmentLevel}
                tone={item.segmentTone}
                compact
                ariaLabel={`${item.label}: ${item.segmentLabel}`}
              />
              <span className={`max-w-full truncate text-[9.5px] font-semibold ${st.labelColor}`}>
                {item.isCalibrating ? 'Calibrating' : item.isStabilizing ? 'Estimated' : item.isUntracked ? 'No Data' : item.segmentLabel}
              </span>
              <span className="line-clamp-1 max-w-full text-[9px] leading-snug text-muted-foreground" title={item.detail}>
                {item.isCalibrating
                  ? 'Initial calibration'
                  : item.isUntracked
                    ? 'No tracking'
                    : item.detail}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ReportsSection({ vm }: { vm: VehicleHealthBoxViewModel }) {
  if (vm.findings.length === 0) return null;
  const toneClass = (severity: string) => {
    if (severity === 'critical') return 'sq-tone-critical';
    if (severity === 'warning') return 'sq-tone-watch';
    return 'sq-tone-neutral';
  };
  return (
    <div className="mb-2 space-y-1">
      <span className="text-[10px] font-semibold text-foreground">Reports</span>
      <ul className="space-y-1">
        {vm.findings.map((f) => (
          <li
            key={f.title}
            className={`rounded-[8px] border border-border px-2 py-1 text-[9px] leading-snug ${toneClass(f.severity)}`}
          >
            {f.title}
          </li>
        ))}
      </ul>
    </div>
  );
}

function UntrackedModulesInfo({ untrackedCount }: { untrackedCount: number }) {
  if (untrackedCount <= 0) return null;
  return (
    <div className="mt-2 mb-2 flex items-start gap-1.5 rounded-[10px] border border-transparent px-2 py-1.5 sq-tone-info">
      <svg
        width="11"
        height="11"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="mt-px shrink-0"
      >
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="16" x2="12" y2="12" />
        <line x1="12" y1="8" x2="12.01" y2="8" />
      </svg>
      <span className="text-[9.5px] leading-snug">
        {untrackedCount} of 3 health modules untracked — enable tracking for accurate results.
      </span>
    </div>
  );
}

function ComplianceGrid({ vm, t, formattingLocale }: { vm: VehicleHealthBoxViewModel; t: (key: import('../../../i18n/LanguageContext').TranslationKey, vars?: Record<string, string | number>) => string; formattingLocale: string }) {
  const nsDisplay = vm.nsDisplay;
  const tuvCompliance = vm.tuvCompliance;
  const bokCompliance = vm.bokCompliance;

  const svcTone = complianceToneClass(vm.serviceTileTone);
  const tuvTone = complianceToneClass(tuvCompliance.tone);
  const bokraftTone = complianceToneClass(bokCompliance.tone);

  const svcStatusText = (() => {
    if (nsDisplay.trackingStatus === 'LOADING' || nsDisplay.trackingStatus === 'ERROR') {
      return nsDisplay.primaryLine;
    }
    if (nsDisplay.trackingStatus === 'NO_TRACKING') return nsDisplay.badge ?? t('health.serviceInfo.v2.badge.noBasis');
    if (nsDisplay.trackingStatus === 'STALE') return nsDisplay.badge ?? t('health.serviceInfo.v2.badge.stale');
    if (nsDisplay.showHmOverdueHint) return nsDisplay.badge ?? t('health.serviceInfo.v2.badge.overdue');
    const { days, km } = nsDisplay.daysKm;
    if (days != null && days >= 0 && days <= 90) return t('health.serviceInfo.v2.remaining.days', { days });
    if (days != null && days > 90) return t('health.serviceInfo.v2.remaining.months', { months: Math.round(days / 30) });
    if (km != null && km >= 0) return t('health.serviceInfo.v2.remaining.km', { km: Math.round(km).toLocaleString(formattingLocale) });
    return nsDisplay.badge ?? '—';
  })();

  const svcSubText = (() => {
    if (nsDisplay.sourceLine) return nsDisplay.sourceLine;
    return nsDisplay.primaryLine;
  })();

  const items = [
    {
      key: 'service',
      label: 'Service',
      icon: <Icon name="wrench" className={`w-3 h-3 ${complianceSurfaceClasses(svcTone).icon}`} />,
      tone: svcTone,
      status: svcStatusText,
      sub: svcSubText,
    },
    {
      key: 'tuv',
      label: 'TÜV',
      icon: <Icon name="clipboard-list" className={`w-3 h-3 ${complianceSurfaceClasses(tuvTone).icon}`} />,
      tone: tuvTone,
      status: tuvCompliance.validTill ?? tuvCompliance.label,
      sub: tuvCompliance.blocksRentalHint ? 'Nicht vermieten' : tuvCompliance.detail,
    },
    {
      key: 'bokraft',
      label: 'BOKraft',
      icon: <Icon name="file-text" className={`w-3 h-3 ${complianceSurfaceClasses(bokraftTone).icon}`} />,
      tone: bokraftTone,
      status: bokCompliance.validTill ?? bokCompliance.label,
      sub: bokCompliance.blocksRentalHint ? 'Nicht vermieten' : bokCompliance.detail,
    },
  ];

  return (
    <div className="grid grid-cols-3 gap-1.5">
      {items.map((it) => {
        const surf = complianceSurfaceClasses(it.tone);
        return (
          <div
            key={it.key}
            className={`rounded-[10px] border px-2 py-1.5 transition-colors ${surf.ring} ${it.tone === 'muted' ? 'opacity-80' : ''}`}
          >
            <div className="mb-1 flex items-center gap-1">
              {it.icon}
              <span className={`text-[10px] font-bold tracking-[-0.01em] ${surf.title}`}>{it.label}</span>
            </div>
            <div className={`text-[10.5px] font-bold leading-none tabular-nums ${surf.value}`}>{it.status}</div>
            <div className="mt-0.5 truncate text-[9px] leading-none text-muted-foreground" title={it.sub}>
              {it.sub}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DataBasisSection({ vm }: { vm: VehicleHealthBoxViewModel }) {
  if (!vm.dataBasis) return null;
  const { dataBasis } = vm;
  return (
    <div className="rounded-[10px] border border-border bg-muted/30 px-2 py-2">
      <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
        <span className="text-[10px] font-semibold text-foreground">Data Basis</span>
        <StatusChip tone={dataBasis.levelTone} className="!text-[9px] !py-0 !px-1.5">
          {dataBasis.qualityLabel}
        </StatusChip>
      </div>
      <p className="text-[9px] text-muted-foreground mb-1">{dataBasis.levelLabel}</p>
      {dataBasis.reasons.length > 0 && (
        <ul className="space-y-0.5">
          {dataBasis.reasons.map((reason) => (
            <li key={reason} className="text-[9px] text-muted-foreground leading-snug flex gap-1">
              <span className="text-muted-foreground/60">·</span>
              <span>{reason}</span>
            </li>
          ))}
        </ul>
      )}
      {dataBasis.degraded.length > 0 && (
        <ul className="mt-1.5 space-y-0.5 border-t border-border pt-1.5">
          {dataBasis.degraded.map((dep) => (
            <li key={`${dep.source}-${dep.message}`} className="text-[9px] text-muted-foreground leading-snug">
              <span className="font-medium">{dep.source}:</span> {dep.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function VehicleHealthBox({
  selectedVehicle,
  isDarkMode,
  lvBatteryVoltage,
  rentalHealth,
  rentalHealthLoading,
  healthError,
  boxData,
  onViewDetails,
  showDataBasis = true,
}: VehicleHealthBoxProps) {
  const { t, formattingLocale } = useLanguage();
  const vm = buildVehicleHealthBoxViewModel({
    rentalHealth,
    rentalHealthLoading,
    healthError,
    tires: boxData.tires,
    brakes: boxData.brakes,
    battery: boxData.battery,
    service: boxData.service,
    dtcLoadState: boxData.dtcLoadState,
    dtcCount: boxData.dtcCount,
    healthTabSummary: boxData.healthTabSummary,
    vehicleTiresFallback: selectedVehicle?.tires ?? 0,
    lvBatteryVoltage,
    serviceDisplay: { t, formattingLocale },
  });

  const divider = <div className="border-t my-3 border-border" />;
  const telltales: DashboardWarningLightsResponse | null = boxData.dashboardLights;
  const compactOverview = !showDataBasis;

  return (
    <div className="surface-premium group relative flex h-full flex-col p-3 text-foreground">
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <h3 className="text-[11px] font-bold tracking-[-0.01em] text-foreground">Vehicle Health</h3>
          <span
            title={vm.overallTitle}
            className={`inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[9.5px] font-bold ring-1 ${vm.overallAccentRing}`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${vm.overallDot}`} />
            {vm.overallStatusLabel}
          </span>
          {vm.dataCoverageLabel ? (
            <span
              className="inline-flex shrink-0 items-center rounded-full px-1.5 py-0.5 text-[8.5px] font-semibold text-muted-foreground ring-1 ring-border bg-muted/30"
              title="Data coverage — not a health severity"
            >
              {vm.dataCoverageLabel}
            </span>
          ) : null}
        </div>
        {!compactOverview && (
          <span className="shrink-0 text-[10px] font-semibold text-muted-foreground">
            {vm.trackedCount}/3 tracked
          </span>
        )}
      </div>

      <div className="mb-2.5 grid grid-cols-3 gap-1.5">
        {(
          [
            { label: 'Critical' as const, tileKey: 'critical' as const, value: vm.statCriticalCount },
            { label: 'Warning' as const, tileKey: 'warning' as const, value: vm.statWarningCount },
            {
              label: 'Error Codes' as const,
              tileKey: 'errorCodes' as const,
              value: vm.faultsStat.displayValue,
              tone: vm.faultsStat.toneClass,
            },
          ] as const
        ).map((stat) => (
          <div
            key={stat.tileKey}
            className={`rounded-[10px] border px-1.5 py-1.5 text-center ${
              stat.tileKey === 'errorCodes'
                ? stat.tone
                : statTileTone(stat.label, stat.value as number)
            }`}
          >
            <div className="font-mono text-[15px] font-bold leading-none tabular-nums">{stat.value}</div>
            <div className="mt-0.5 truncate text-[9px] font-semibold leading-none tracking-[-0.01em]">
              {stat.label}
            </div>
            {stat.tileKey === 'errorCodes' && vm.faultsStat.sublabel && (
              <div className="mt-0.5 truncate text-[8px] leading-none text-muted-foreground">{vm.faultsStat.sublabel}</div>
            )}
          </div>
        ))}
      </div>

      <HealthModuleRows vm={vm} isDarkMode={isDarkMode} />
      <UntrackedModulesInfo untrackedCount={vm.untrackedCount} />
      <div className={vm.untrackedCount <= 0 ? 'mt-2' : undefined}>
        <ComplianceGrid vm={vm} t={t} formattingLocale={formattingLocale} />
      </div>

      {vm.findings.length > 0 && (
        <>
          {divider}
          <ReportsSection vm={vm} />
        </>
      )}

      {divider}
      <DashboardWarningLightsQuickView
        telltales={telltales}
        loading={boxData.dashboardLightsLoading && !telltales}
        onViewDetails={onViewDetails}
      />

      {showDataBasis && vm.dataBasis && (
        <>
          {divider}
          <DataBasisSection vm={vm} />
        </>
      )}

      {divider}

      <div className="pt-1">
        <button
          type="button"
          onClick={onViewDetails}
          className="group flex w-full items-center justify-between rounded-[12px] px-2.5 py-2 text-[11px] font-bold transition-[background-color,color,transform] duration-300 ease-[var(--ease-out-soft)] active:scale-[0.99] sq-tone-brand hover:opacity-90"
        >
          <span>View Health Details</span>
          <span className="flex h-5 w-5 items-center justify-center rounded-full transition-transform duration-300 ease-[var(--ease-out-soft)] group-hover:translate-x-0.5 bg-[color:var(--card)]/70">
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </span>
        </button>
      </div>
    </div>
  );
}
