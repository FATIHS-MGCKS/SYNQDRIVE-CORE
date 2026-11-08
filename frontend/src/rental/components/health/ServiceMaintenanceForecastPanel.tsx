import { useMemo, useState } from 'react';
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
  nextServicePanelClass,
  nextServiceToneClass,
  type NextServiceDisplay,
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
  className?: string;
}

type Translator = (key: TranslationKey, vars?: Record<string, string | number>) => string;

function dueStateChipClass(state: MaintenancePositionForecast['dueState']): string {
  switch (state) {
    case 'OVERDUE':
      return 'sq-chip-critical';
    case 'DUE_SOON':
      return 'sq-chip-watch';
    case 'OK':
      return 'sq-chip-positive';
    default:
      return 'bg-muted text-muted-foreground border-border';
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
          <Icon name="info" className="mt-px h-3 w-3 shrink-0" />
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

function PositionRow({ p, t, fmtLocale }: { p: MaintenancePositionForecast; t: Translator; fmtLocale: string }) {
  const interval = describeInterval(p, t, fmtLocale);
  const dueDate = formatServiceDate(p.dueAtDate, fmtLocale);
  const baselineDate = formatServiceDate(p.baseline?.date ?? null, fmtLocale);
  return (
    <li className="flex items-start justify-between gap-3 border-b border-border py-2 last:border-0">
      <div className="min-w-0">
        <p className="truncate text-xs font-semibold text-foreground" title={p.label}>
          {p.kind === 'OTHER' ? p.label : formatPositionKind(p.kind, t)}
        </p>
        <p className="text-[11px] text-muted-foreground">{describeRemaining(p, t, fmtLocale)}</p>
        <p className="text-[10px] text-muted-foreground/80">
          {[
            interval ? t('health.serviceInfo.v2.positions.interval', { value: interval }) : null,
            dueDate ? t('health.serviceInfo.v2.position.dueDate', { date: dueDate }) : null,
            p.dueAtKm != null ? t('health.serviceInfo.v2.position.dueKm', { km: formatServiceKm(p.dueAtKm, fmtLocale) }) : null,
            baselineDate ? t('health.serviceInfo.v2.position.baseline', { date: baselineDate }) : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
      </div>
      <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest ${dueStateChipClass(p.dueState)}`}>
        {t(`health.serviceInfo.v2.dueState.${p.dueState}` as TranslationKey)}
      </span>
    </li>
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
  className = '',
}: ServiceMaintenanceForecastPanelProps) {
  const { t, formattingLocale } = useLanguage();
  const [manualOpen, setManualOpen] = useState(false);
  const [intervalsOpen, setIntervalsOpen] = useState(false);

  const display: NextServiceDisplay = useMemo(
    () => buildNextServiceDisplay(serviceInfo, { loading, error, t, formattingLocale }),
    [serviceInfo, loading, error, t, formattingLocale],
  );

  const forecast = serviceInfo?.maintenanceForecast ?? null;
  const ns = serviceInfo?.nextService;
  const otherPositions = useMemo(() => {
    if (!forecast) return [];
    const headlineId = display.trackingStatus === 'TRACKED' ? (ns?.positionId ?? forecast.nextDue?.positionId ?? null) : null;
    return forecast.positions.filter((p) => p.positionId !== headlineId);
  }, [forecast, ns?.positionId, display.trackingStatus]);

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

  return (
    <div className={className}>
      <div className={`rounded-lg p-5 ${nextServicePanelClass(display.tone)}`}>
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <p className={`text-sm font-semibold ${nextServiceToneClass(display.tone)}`}>{display.title}</p>
          {display.positionLabel && (
            <span className="rounded-full border border-border bg-background/60 px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
              {display.positionLabel}
            </span>
          )}
          {display.badge && (
            <span
              className={`rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest ${
                display.tone === 'critical' ? 'sq-chip-critical' : display.tone === 'warning' ? 'sq-chip-watch' : 'bg-muted text-muted-foreground border-border'
              }`}
            >
              {display.badge}
            </span>
          )}
        </div>
        <p className="mb-2 text-sm font-bold text-foreground">{display.primaryLine}</p>
        {display.description && <p className="mb-2 text-xs text-muted-foreground">{display.description}</p>}
        {display.sourceLine && <p className="text-xs text-muted-foreground">{display.sourceLine}</p>}
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

        {canAct && (
          <div className="mt-4 flex flex-wrap gap-2">
            {onUploadProof && (
              <button
                type="button"
                onClick={onUploadProof}
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors sq-tone-info hover:opacity-90"
              >
                <Icon name="upload" className="h-3.5 w-3.5" />
                {t('health.serviceInfo.v2.actions.upload')}
              </button>
            )}
            <button
              type="button"
              onClick={() => setManualOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-muted"
            >
              <Icon name="plus" className="h-3.5 w-3.5" />
              {t('health.serviceInfo.v2.actions.manual')}
            </button>
            {orgId && !hasProviderSchedule && (
              <button
                type="button"
                onClick={() => setIntervalsOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-muted"
              >
                <Icon name="wrench" className="h-3.5 w-3.5" />
                {t('health.serviceInfo.v2.actions.intervals')}
              </button>
            )}
          </div>
        )}
      </div>

      {!compact && !loading && !error && (
        <div className="mt-4 space-y-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="rounded-lg border border-border bg-muted p-3">
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
            </div>
            <div className="rounded-lg border border-border bg-muted p-3">
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
            </div>
          </div>

          {(otherPositions.length > 0 || (forecast?.unscheduledPositions.length ?? 0) > 0) && (
            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {t('health.serviceInfo.v2.positions.title')}
              </p>
              {otherPositions.length > 0 ? (
                <ul>
                  {otherPositions.map((p) => (
                    <PositionRow key={p.positionId} p={p} t={t} fmtLocale={formattingLocale} />
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-muted-foreground/70">{t('health.serviceInfo.v2.positions.empty')}</p>
              )}
              {forecast && forecast.unscheduledPositions.length > 0 && (
                <p className="mt-2 text-[10px] text-muted-foreground/80">
                  {t('health.serviceInfo.v2.positions.unscheduled')}: {forecast.unscheduledPositions.map((u) => u.label).join(' · ')}
                </p>
              )}
            </div>
          )}

          <FlagList flags={flags} t={t} />
        </div>
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
