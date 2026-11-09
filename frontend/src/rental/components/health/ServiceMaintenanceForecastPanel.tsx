import { useId, useMemo, useState, type ReactNode } from 'react';
import type {
  MaintenanceConflict,
  MaintenanceDataQualityFlag,
  MaintenancePositionForecast,
  ServiceInfoStatus,
} from '../../../lib/api';
import { useLanguage, type TranslationKey } from '../../../i18n/LanguageContext';
import { Icon } from '../ui/Icon';
import {
  buildNextServiceDisplay,
  formatPositionKind,
  formatServiceDate,
  formatServiceDateTime,
  formatServiceKm,
  nextServiceToneClass,
  type NextServiceDisplay,
  type NextServiceUiTone,
} from '../../lib/service-info-display';
import { ManualServiceEntryDialog, ServiceIntervalsDialog } from './ManualServiceEntryDialog';

export interface ServiceMaintenanceForecastPanelProps {
  serviceInfo: ServiceInfoStatus | null | undefined;
  loading: boolean;
  error: boolean;
  vehicleId: string | null | undefined;
  orgId: string | null | undefined;
  onUploadProof?: () => void;
  /** Called after a manual entry / interval change so the host can reload `serviceInfoStatus`. */
  onChanged?: () => void | Promise<void>;
  /** Compact mode hides per-position detail and keeps only headline + actions. */
  compact?: boolean;
  /** When set with `compact=false`, splits overview vs plan for tabbed V3 navigation. */
  surface?: 'full' | 'overview' | 'plan';
  /** When false, suppresses the V3 page title (e.g. modal supplies a single header). */
  showPageTitle?: boolean;
  className?: string;
}

type Translator = (key: TranslationKey, vars?: Record<string, string | number>) => string;

type PlanGroupKey = 'overdue' | 'dueSoon' | 'onPlan' | 'notComputable';

const PLAN_GROUP_ORDER: PlanGroupKey[] = ['overdue', 'dueSoon', 'onPlan', 'notComputable'];

const PLAN_GROUP_TITLE: Record<PlanGroupKey, TranslationKey> = {
  overdue: 'health.serviceInfo.v3.groups.overdue',
  dueSoon: 'health.serviceInfo.v3.groups.dueSoon',
  onPlan: 'health.serviceInfo.v3.groups.onPlan',
  notComputable: 'health.serviceInfo.v3.groups.notComputable',
};

function planGroupForState(state: MaintenancePositionForecast['dueState']): PlanGroupKey {
  switch (state) {
    case 'OVERDUE':
      return 'overdue';
    case 'DUE_SOON':
      return 'dueSoon';
    case 'OK':
      return 'onPlan';
    default:
      return 'notComputable';
  }
}

function groupPositions(positions: MaintenancePositionForecast[]): Record<PlanGroupKey, MaintenancePositionForecast[]> {
  const groups: Record<PlanGroupKey, MaintenancePositionForecast[]> = {
    overdue: [],
    dueSoon: [],
    onPlan: [],
    notComputable: [],
  };
  for (const p of positions) {
    groups[planGroupForState(p.dueState)].push(p);
  }
  return groups;
}

function calmHeroShellClass(tone: NextServiceUiTone): string {
  const accent =
    tone === 'critical'
      ? 'border-l-red-500/60'
      : tone === 'warning'
        ? 'border-l-amber-500/60'
        : tone === 'good'
          ? 'border-l-emerald-500/50'
          : 'border-l-border';
  return `surface-premium min-w-0 rounded-xl border border-border border-l-4 p-4 ${accent}`;
}

function dueStateChipClass(state: MaintenancePositionForecast['dueState']): string {
  switch (state) {
    case 'OVERDUE':
      return 'border border-red-500/25 bg-red-500/5 text-red-800 dark:text-red-300';
    case 'DUE_SOON':
      return 'border border-amber-500/30 bg-amber-500/5 text-amber-900 dark:text-amber-200';
    case 'OK':
      return 'border border-emerald-500/25 bg-emerald-500/5 text-emerald-900 dark:text-emerald-200';
    default:
      return 'border border-border bg-muted/40 text-muted-foreground';
  }
}

function describeInterval(p: MaintenancePositionForecast, t: Translator, fmtLocale: string): string | null {
  if (p.intervalKm != null && p.intervalMonths != null) {
    return t('health.serviceInfo.v2.positions.intervalBoth', {
      km: formatServiceKm(p.intervalKm, fmtLocale),
      months: p.intervalMonths,
    });
  }
  if (p.intervalKm != null) return t('health.serviceInfo.v2.positions.intervalKm', { km: formatServiceKm(p.intervalKm, fmtLocale) });
  if (p.intervalMonths != null) return t('health.serviceInfo.v2.positions.intervalMonths', { months: p.intervalMonths });
  return null;
}

function describeRemaining(p: MaintenancePositionForecast, t: Translator, fmtLocale: string): string {
  if (p.dueState === 'NO_BASELINE') return t('health.serviceInfo.v2.dueState.NO_BASELINE');
  if (p.dueState === 'NO_INTERVAL') return t('health.serviceInfo.v2.dueState.NO_INTERVAL');
  const overdue = p.dueState === 'OVERDUE';
  const days = p.remainingDays;
  const km = p.remainingKm;
  if (overdue) {
    const parts: string[] = [];
    if (days != null && days < 0) parts.push(t('health.serviceInfo.v2.overdue.daysPart', { days: Math.abs(days) }));
    if (km != null && km < 0) parts.push(t('health.serviceInfo.v2.overdue.kmPart', { km: formatServiceKm(Math.abs(km), fmtLocale) }));
    return parts.length ? t('health.serviceInfo.v2.overdue.since', { parts: parts.join(' / ') }) : t('health.serviceInfo.v2.overdue.plain');
  }
  const hasDays = days != null && days >= 0;
  const hasKm = km != null && km >= 0;
  if (hasDays && hasKm) return t('health.serviceInfo.v2.remaining.both', { days, km: formatServiceKm(km, fmtLocale) });
  if (hasDays) return t('health.serviceInfo.v2.remaining.days', { days });
  if (hasKm) return t('health.serviceInfo.v2.remaining.km', { km: formatServiceKm(km, fmtLocale) });
  return t('health.serviceInfo.v2.dueState.OK');
}

function valueOrUnknown(km: number | null, days: number | null, t: Translator, fmtLocale: string): string {
  const parts: string[] = [];
  if (km != null) parts.push(t('health.serviceInfo.v2.value.km', { km: formatServiceKm(km, fmtLocale) }));
  if (days != null) parts.push(t('health.serviceInfo.v2.value.days', { days }));
  return parts.length ? parts.join(' / ') : t('health.serviceInfo.v2.value.unknown');
}

function FlagList({ flags, t }: { flags: MaintenanceDataQualityFlag[]; t: Translator }) {
  if (flags.length === 0) return null;
  const unique = [...new Set(flags)];
  return (
    <ul className="space-y-1">
      {unique.map((flag) => (
        <li key={flag} className="flex items-start gap-1.5 text-[11px] leading-snug text-muted-foreground">
          <Icon name="info" className="mt-px h-3 w-3 shrink-0" aria-hidden />
          <span>{t(`health.serviceInfo.v2.flag.${flag}` as TranslationKey)}</span>
        </li>
      ))}
    </ul>
  );
}

function ConflictList({ conflicts, t, fmtLocale }: { conflicts: MaintenanceConflict[]; t: Translator; fmtLocale: string }) {
  if (conflicts.length === 0) return null;
  return (
    <div
      role="status"
      className="rounded-lg border border-amber-300/60 bg-amber-50 px-3 py-2 text-[11px] text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200"
    >
      <p className="font-semibold">{t('health.serviceInfo.v2.conflict.title')}</p>
      <ul className="mt-1 space-y-0.5">
        {conflicts.map((c, idx) => (
          <li key={`${c.code}-${c.positionId ?? idx}`}>
            {c.code === 'CONFLICT_HM_VS_COMPUTED'
              ? t('health.serviceInfo.v2.conflict.hmVsComputed', {
                  hm: valueOrUnknown(c.hmRemainingKm, c.hmRemainingDays, t, fmtLocale),
                  computed: valueOrUnknown(c.computedRemainingKm, c.computedRemainingDays, t, fmtLocale),
                })
              : t('health.serviceInfo.v2.conflict.odometerBelowBaseline')}
          </li>
        ))}
      </ul>
    </div>
  );
}

function PositionDetails({
  p,
  t,
  fmtLocale,
  detailsId,
}: {
  p: MaintenancePositionForecast;
  t: Translator;
  fmtLocale: string;
  detailsId: string;
}) {
  const scheduleLabel = t(`health.serviceInfo.v3.scheduleSource.${p.provenance.scheduleSource}` as TranslationKey);
  const methodLabel = t(`health.serviceInfo.v3.calculationMethod.${p.provenance.calculationMethod}` as TranslationKey);
  const eventSourceLabel = t(`health.serviceInfo.v2.eventSource.${p.provenance.eventSource}` as TranslationKey);
  const odometerSourceLabel = t(`health.serviceInfo.v2.odometerSource.${p.provenance.odometerSource}` as TranslationKey);
  const baselineDate = formatServiceDate(p.baseline?.date ?? null, fmtLocale);
  const hasFlags = p.dataQuality.length > 0;
  const hasRaw = Boolean(p.rawIntervalDescription);
  const showBaselineMissing = !baselineDate && (p.dueState === 'NO_BASELINE' || p.baseline == null);

  return (
    <details id={detailsId} className="mt-1.5 text-[10px] text-muted-foreground">
      <summary className="inline-flex min-h-9 cursor-pointer select-none items-center font-medium text-foreground/80 hover:text-foreground">
        {t('health.serviceInfo.v3.details.toggle')}
      </summary>
      <div className="mt-1 space-y-1 pl-0.5">
        <p className="break-words">{t('health.serviceInfo.v3.details.scheduleSource', { source: scheduleLabel })}</p>
        <p className="break-words">{t('health.serviceInfo.v3.details.calculation', { method: methodLabel })}</p>
        <p className="break-words">{t('health.serviceInfo.v3.details.eventSource', { source: eventSourceLabel })}</p>
        <p className="break-words">{t('health.serviceInfo.v3.details.odometerSource', { source: odometerSourceLabel })}</p>
        {baselineDate ? (
          <p className="break-words">{t('health.serviceInfo.v2.position.baseline', { date: baselineDate })}</p>
        ) : showBaselineMissing ? (
          <p className="break-words">{t('health.serviceInfo.v3.details.baselineMissing')}</p>
        ) : null}
        {hasRaw && p.rawIntervalDescription && (
          <p className="break-words">{t('health.serviceInfo.v3.details.rawInterval', { value: p.rawIntervalDescription })}</p>
        )}
        {hasFlags && (
          <ul className="mt-0.5 space-y-0.5">
            {p.dataQuality.map((flag) => (
              <li key={flag} className="break-words">
                {t(`health.serviceInfo.v2.flag.${flag}` as TranslationKey)}
              </li>
            ))}
          </ul>
        )}
      </div>
    </details>
  );
}

function PositionRow({
  p,
  t,
  fmtLocale,
  isHeadline,
  detailsId,
}: {
  p: MaintenancePositionForecast;
  t: Translator;
  fmtLocale: string;
  isHeadline: boolean;
  detailsId: string;
}) {
  const interval = describeInterval(p, t, fmtLocale);
  const dueDate = formatServiceDate(p.dueAtDate, fmtLocale);
  const label = p.kind === 'OTHER' ? p.label : formatPositionKind(p.kind, t);
  return (
    <li className="flex flex-col gap-2 border-b border-border py-2.5 last:border-0 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <p className="break-words text-xs font-semibold text-foreground">{label}</p>
          {isHeadline && (
            <span className="rounded-md border border-primary/25 bg-primary/5 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-primary">
              {t('health.serviceInfo.v3.headline.badge')}
            </span>
          )}
        </div>
        <p className="mt-0.5 text-[11px] text-muted-foreground">{describeRemaining(p, t, fmtLocale)}</p>
        <p className="mt-0.5 break-words text-[10px] text-muted-foreground/80">
          {[
            interval ? t('health.serviceInfo.v2.positions.interval', { value: interval }) : null,
            dueDate ? t('health.serviceInfo.v2.position.dueDate', { date: dueDate }) : null,
            p.dueAtKm != null ? t('health.serviceInfo.v2.position.dueKm', { km: formatServiceKm(p.dueAtKm, fmtLocale) }) : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
        <PositionDetails p={p} t={t} fmtLocale={fmtLocale} detailsId={detailsId} />
      </div>
      <span
        className={`max-w-full self-start rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest sm:shrink-0 ${dueStateChipClass(p.dueState)}`}
      >
        {t(`health.serviceInfo.v2.dueState.${p.dueState}` as TranslationKey)}
      </span>
    </li>
  );
}

function UnscheduledRow({
  label,
  t,
}: {
  label: string;
  t: Translator;
}) {
  return (
    <li className="flex items-start justify-between gap-3 border-b border-border py-2.5 last:border-0">
      <div className="min-w-0 flex-1">
        <p className="break-words text-xs font-semibold text-foreground">{label}</p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">{t('health.serviceInfo.v2.positions.unscheduled')}</p>
      </div>
    </li>
  );
}

function PlanGroupHeading({
  groupKey,
  count,
  t,
}: {
  groupKey: PlanGroupKey;
  count: number;
  t: Translator;
}) {
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <span>{t(PLAN_GROUP_TITLE[groupKey])}</span>
      <span className="tabular-nums text-muted-foreground" aria-hidden>
        ({t('health.serviceInfo.v3.groups.count', { count })})
      </span>
    </span>
  );
}

function PlanGroupSection({
  groupKey,
  positions,
  unscheduled,
  t,
  fmtLocale,
  scopeId,
  headlineId,
}: {
  groupKey: PlanGroupKey;
  positions: MaintenancePositionForecast[];
  unscheduled: Array<{ positionId: string; label: string }>;
  t: Translator;
  fmtLocale: string;
  scopeId: string;
  headlineId: string | null;
}) {
  const showUnscheduled = groupKey === 'notComputable' && unscheduled.length > 0;
  const count = positions.length + (showUnscheduled ? unscheduled.length : 0);
  if (count === 0) return null;

  const sectionId = `${scopeId}-plan-${groupKey}`;
  const list = (
    <ul className="min-w-0 divide-y divide-border">
      {positions.map((p) => (
        <PositionRow
          key={p.positionId}
          p={p}
          t={t}
          fmtLocale={fmtLocale}
          isHeadline={headlineId != null && p.positionId === headlineId}
          detailsId={`${scopeId}-pos-${p.positionId}-details`}
        />
      ))}
      {showUnscheduled && unscheduled.map((u) => <UnscheduledRow key={u.positionId} label={u.label} t={t} />)}
    </ul>
  );

  if (groupKey === 'notComputable') {
    return (
      <details data-service-plan-group={groupKey} className="surface-solid min-w-0 rounded-lg border border-border">
        <summary
          id={sectionId}
          className="cursor-pointer px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground [&::-webkit-details-marker]:hidden"
        >
          <PlanGroupHeading groupKey={groupKey} count={count} t={t} />
        </summary>
        <div className="border-t border-border px-3 pb-1">{list}</div>
      </details>
    );
  }

  const emphasis =
    groupKey === 'overdue'
      ? 'text-red-800/90 dark:text-red-300'
      : groupKey === 'dueSoon'
        ? 'text-amber-900/90 dark:text-amber-200'
        : 'text-muted-foreground';

  return (
    <section aria-labelledby={sectionId} className="min-w-0">
      <h4 id={sectionId} className={`mb-1 text-xs font-semibold uppercase tracking-wide ${emphasis}`}>
        <PlanGroupHeading groupKey={groupKey} count={count} t={t} />
      </h4>
      <div className="surface-solid min-w-0 rounded-lg border border-border px-3">{list}</div>
    </section>
  );
}

function ServiceActions({
  t,
  canAct,
  onUploadProof,
  onManual,
  onIntervals,
  showIntervals,
}: {
  t: Translator;
  canAct: boolean;
  onUploadProof?: () => void;
  onManual: () => void;
  onIntervals: () => void;
  showIntervals: boolean;
}) {
  if (!canAct) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {onUploadProof && (
        <button
          type="button"
          onClick={onUploadProof}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-colors sq-tone-info hover:opacity-90"
        >
          <Icon name="upload" className="h-3.5 w-3.5" aria-hidden />
          {t('health.serviceInfo.v2.actions.upload')}
        </button>
      )}
      <button
        type="button"
        onClick={onManual}
        className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-muted"
      >
        <Icon name="plus" className="h-3.5 w-3.5" aria-hidden />
        {t('health.serviceInfo.v2.actions.manual')}
      </button>
      {showIntervals && (
        <button
          type="button"
          onClick={onIntervals}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-muted"
        >
          <Icon name="wrench" className="h-3.5 w-3.5" aria-hidden />
          {t('health.serviceInfo.v2.actions.intervals')}
        </button>
      )}
    </div>
  );
}

export function ServiceMaintenanceForecastPanel({
  serviceInfo,
  loading,
  error,
  vehicleId,
  orgId,
  onUploadProof,
  onChanged,
  compact = false,
  surface = 'full',
  showPageTitle = true,
  className = '',
}: ServiceMaintenanceForecastPanelProps) {
  const { t, formattingLocale } = useLanguage();
  const [manualOpen, setManualOpen] = useState(false);
  const [intervalsOpen, setIntervalsOpen] = useState(false);
  const scopeId = useId().replace(/:/g, '');

  const display: NextServiceDisplay = useMemo(
    () => buildNextServiceDisplay(serviceInfo, { loading, error, t, formattingLocale }),
    [serviceInfo, loading, error, t, formattingLocale],
  );

  const forecast = serviceInfo?.maintenanceForecast ?? null;
  const ns = serviceInfo?.nextService;

  const headlineId = useMemo(() => {
    if (display.trackingStatus !== 'TRACKED') return null;
    return ns?.positionId ?? forecast?.nextDue?.positionId ?? null;
  }, [display.trackingStatus, ns?.positionId, forecast?.nextDue?.positionId]);

  const planPositions = forecast?.positions ?? [];
  const grouped = useMemo(() => groupPositions(planPositions), [planPositions]);

  const flags = useMemo(() => {
    const merged = [...display.dataQuality, ...(forecast?.dataQuality ?? [])];
    return [...new Set(merged)];
  }, [display.dataQuality, forecast?.dataQuality]);

  const conflicts = display.conflicts.length > 0 ? display.conflicts : (forecast?.conflicts ?? []);
  const hasProviderSchedule = (forecast?.scheduleSources ?? []).some((s) => s === 'ONEAUTO_SCHEDULE' || s === 'HM_OEM');

  const lastMaint = forecast?.lastRelevantMaintenance ?? null;
  const lastMaintDate = formatServiceDate(lastMaint?.date ?? null, formattingLocale);
  const odometer = forecast?.odometer ?? null;
  const odometerObserved = formatServiceDateTime(odometer?.observedAt ?? null, formattingLocale);

  const canAct = Boolean(vehicleId);
  const unscheduled = forecast?.unscheduledPositions ?? [];
  const totalPlanRows = planPositions.length + unscheduled.length;

  const showHero = !compact && (surface === 'full' || surface === 'overview');
  const showInfoCards = showHero;
  const showPlanSections =
    !compact && !loading && !error && forecast != null && (surface === 'full' || surface === 'plan');
  const showFlagsAndActions = !compact && (surface === 'full' || surface === 'overview');

  const emptyPlanHint = useMemo(() => {
    if (!forecast || totalPlanRows > 0) return null;
    if (flags.includes('SCHEDULE_MISSING') && !flags.includes('HISTORY_MISSING')) {
      return t('health.serviceInfo.v2.noBasis.historyOnly');
    }
    if (flags.includes('HISTORY_MISSING') && !flags.includes('SCHEDULE_MISSING')) {
      return t('health.serviceInfo.v2.noBasis.scheduleOnly');
    }
    return t('health.serviceInfo.v3.plan.empty');
  }, [forecast, totalPlanRows, flags, t]);

  const heroHeadingId = `${scopeId}-hero`;
  const pageTitleId = `${scopeId}-page-title`;

  return (
    <div className={`min-w-0 space-y-4 ${className}`}>
      {!compact && showPageTitle && surface !== 'plan' && (
        <h2 id={pageTitleId} className="text-base font-semibold tracking-tight text-foreground">
          {t('health.serviceInfo.v3.pageTitle')}
        </h2>
      )}

      {showHero && (
      <section aria-labelledby={heroHeadingId} className={calmHeroShellClass(display.tone)}>
        <div className="flex flex-wrap items-center gap-2">
          <p id={heroHeadingId} className={`text-sm font-semibold ${nextServiceToneClass(display.tone)}`}>
            {display.title}
          </p>
          {display.positionLabel && (
            <span className="max-w-full break-words rounded-full border border-border bg-background/60 px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
              {display.positionLabel}
            </span>
          )}
          {display.badge && (
            <span className="rounded-full border border-border bg-muted/50 px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
              {display.badge}
            </span>
          )}
        </div>

        <div className="mt-2 flex flex-wrap gap-2">
          {display.isComputed && display.source !== 'HM_OEM' && (
            <span className="rounded-md border border-border bg-muted/40 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              {t('health.serviceInfo.v3.advisory.computed')}
            </span>
          )}
          {display.source === 'HM_OEM' && display.trackingStatus === 'TRACKED' && (
            <span className="rounded-md border border-border bg-muted/40 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              {t('health.serviceInfo.v3.advisory.hmOem')}
            </span>
          )}
        </div>

        <p className="mt-2 text-sm font-semibold text-foreground">{display.primaryLine}</p>
        {display.description && <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{display.description}</p>}
        {display.sourceLine && <p className="mt-1 text-xs text-muted-foreground">{display.sourceLine}</p>}
        {display.lastUpdatedLabel && <p className="mt-1 text-[11px] text-muted-foreground">{display.lastUpdatedLabel}</p>}

        {ns?.computedComparison && display.source === 'HM_OEM' && (
          <p className="mt-2 text-[11px] text-muted-foreground">
            {t('health.serviceInfo.v2.comparison.label', {
              source:
                ns.computedComparison.source === 'COMPUTED_ONEAUTO_SCHEDULE'
                  ? t('health.serviceInfo.v2.comparison.oneauto')
                  : t('health.serviceInfo.v2.comparison.manual'),
            })}
            {': '}
            {valueOrUnknown(ns.computedComparison.remainingKm, ns.computedComparison.remainingDays, t, formattingLocale)}
          </p>
        )}

        {conflicts.length > 0 && (
          <div className="mt-3">
            <ConflictList conflicts={conflicts} t={t} fmtLocale={formattingLocale} />
          </div>
        )}

        {compact && (
          <div className="mt-4">
            <ServiceActions
              t={t}
              canAct={canAct}
              onUploadProof={onUploadProof}
              onManual={() => setManualOpen(true)}
              onIntervals={() => setIntervalsOpen(true)}
              showIntervals={Boolean(orgId && !hasProviderSchedule)}
            />
          </div>
        )}
      </section>
      )}

      {showInfoCards && !loading && !error && (
        <>
          <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
            <InfoCard>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {t('health.serviceInfo.v2.lastMaintenance.label')}
              </p>
              <p className="mt-1 text-xs font-semibold text-foreground">
                {lastMaint && lastMaintDate
                  ? lastMaint.odometerKm != null
                    ? t('health.serviceInfo.v2.lastMaintenance.value', {
                        date: lastMaintDate,
                        km: formatServiceKm(lastMaint.odometerKm, formattingLocale),
                      })
                    : t('health.serviceInfo.v2.lastMaintenance.valueNoKm', { date: lastMaintDate })
                  : t('health.serviceInfo.v2.lastMaintenance.none')}
              </p>
              {lastMaint && (
                <p className="mt-0.5 text-[10px] text-muted-foreground">
                  {t(`health.serviceInfo.v2.eventSource.${lastMaint.eventSource}` as TranslationKey)}
                </p>
              )}
            </InfoCard>
            <InfoCard>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {t('health.serviceInfo.v2.freshness.odometerLabel')}
              </p>
              <p className="mt-1 text-xs font-semibold text-foreground">
                {odometer
                  ? t('health.serviceInfo.v2.freshness.odometer', {
                      km: formatServiceKm(odometer.km, formattingLocale),
                      source: t(`health.serviceInfo.v2.odometerSource.${odometer.source}` as TranslationKey),
                    })
                  : t('health.serviceInfo.v2.freshness.odometerMissing')}
              </p>
              {odometerObserved && (
                <p className="mt-0.5 text-[10px] text-muted-foreground">
                  {t('health.serviceInfo.v2.freshness.updated', { date: odometerObserved })}
                </p>
              )}
            </InfoCard>
          </div>

        </>
      )}

      {surface === 'plan' && !loading && !error && !forecast && (
        <p className="text-xs leading-relaxed text-muted-foreground">{t('health.serviceInfo.v3.plan.empty')}</p>
      )}

      {showPlanSections && (
        <div className="min-w-0 space-y-3">
          <h3 className="text-sm font-semibold text-foreground">{t('health.serviceInfo.v3.plan.title')}</h3>
          {PLAN_GROUP_ORDER.map((groupKey) => (
            <PlanGroupSection
              key={groupKey}
              groupKey={groupKey}
              positions={grouped[groupKey]}
              unscheduled={unscheduled}
              t={t}
              fmtLocale={formattingLocale}
              scopeId={scopeId}
              headlineId={headlineId}
            />
          ))}
          {emptyPlanHint && <p className="text-xs leading-relaxed text-muted-foreground">{emptyPlanHint}</p>}
        </div>
      )}

      {showFlagsAndActions && !loading && !error && (
        <>
          <FlagList flags={flags} t={t} />

          <div className="border-t border-border pt-4">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {t('health.serviceInfo.v3.actions.title')}
            </p>
            <ServiceActions
              t={t}
              canAct={canAct}
              onUploadProof={onUploadProof}
              onManual={() => setManualOpen(true)}
              onIntervals={() => setIntervalsOpen(true)}
              showIntervals={Boolean(orgId && !hasProviderSchedule)}
            />
          </div>
        </>
      )}

      {vehicleId && (
        <ManualServiceEntryDialog
          open={manualOpen}
          onOpenChange={setManualOpen}
          vehicleId={vehicleId}
          onCreated={onChanged}
        />
      )}
      {vehicleId && orgId && intervalsOpen && (
        <ServiceIntervalsDialog
          open={intervalsOpen}
          onOpenChange={setIntervalsOpen}
          orgId={orgId}
          vehicleId={vehicleId}
          onSaved={onChanged}
        />
      )}
    </div>
  );
}

function InfoCard({ children }: { children: ReactNode }) {
  return <div className="surface-solid min-w-0 rounded-lg border border-border p-3">{children}</div>;
}
