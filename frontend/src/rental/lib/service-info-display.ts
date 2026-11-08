import type {
  MaintenanceConflict,
  MaintenanceDataQualityFlag,
  MaintenanceForecastResult,
  MaintenancePositionKind,
  NextServiceCompliance,
  ServiceInfoStatus,
  ServiceNextSource,
  ServiceTrackingStatus,
} from '../../lib/api';
import { translateKey, type TranslationKey } from '../../i18n/LanguageContext';
import { DEFAULT_PRODUCT_LOCALE, getFormattingLocale } from '../../i18n/locales';

export type NextServiceUiTone = 'neutral' | 'good' | 'warning' | 'critical' | 'info';
export type ComplianceUiStatus = 'no_data' | 'valid' | 'due_soon' | 'overdue';

/** Translator contract shared by the display builders (matches `useLanguage().t`). */
export type ServiceDisplayTranslator = (key: TranslationKey, vars?: Record<string, string | number>) => string;

export interface ServiceDisplayOptions {
  loading?: boolean;
  error?: boolean;
  /** Locale-aware translator; defaults to the product default locale (pure fallback for mappers). */
  t?: ServiceDisplayTranslator;
  /** BCP-47 formatting locale for dates/numbers; defaults to the product default locale. */
  formattingLocale?: string;
}

export type NextServiceNoBasisReason = 'NONE' | 'SCHEDULE_ONLY' | 'HISTORY_ONLY';

export interface NextServiceDisplay {
  trackingStatus: ServiceTrackingStatus | 'LOADING' | 'ERROR';
  title: string;
  primaryLine: string;
  description: string;
  sourceLine: string | null;
  badge: string | null;
  tone: NextServiceUiTone;
  showHmOverdueHint: boolean;
  showHmDueSoonHint: boolean;
  lastUpdatedLabel: string | null;
  daysKm: { days: number | null; km: number | null };
  /** Service Info V2 — provenance of the headline value (null when no basis). */
  source: ServiceNextSource;
  /** True when the headline comes from a SYNQDRIVE computation (schedule + proven history), not from OEM. */
  isComputed: boolean;
  positionKind: MaintenancePositionKind | null;
  positionLabel: string | null;
  noBasisReason: NextServiceNoBasisReason;
  dataQuality: MaintenanceDataQualityFlag[];
  conflicts: MaintenanceConflict[];
}

const defaultTranslator: ServiceDisplayTranslator = (key, vars) =>
  translateKey(DEFAULT_PRODUCT_LOCALE, key, vars).text;

function resolveTranslator(opts?: ServiceDisplayOptions): ServiceDisplayTranslator {
  return opts?.t ?? defaultTranslator;
}

function resolveFormattingLocale(opts?: ServiceDisplayOptions): string {
  return opts?.formattingLocale ?? getFormattingLocale(DEFAULT_PRODUCT_LOCALE);
}

export function formatServiceKm(km: number, formattingLocale?: string): string {
  return Math.round(km).toLocaleString(formattingLocale ?? getFormattingLocale(DEFAULT_PRODUCT_LOCALE));
}

/**
 * Remaining km of the headline next-service value when tracking is active.
 * Since Service Info V2 the value may come from OEM (HM) or from the deterministic
 * SYNQDRIVE computation — check `nextService.source` when the distinction matters.
 */
export function hmTrackedServiceKm(si: ServiceInfoStatus | null | undefined): number | null {
  if (si?.nextService?.trackingStatus !== 'TRACKED') return null;
  return si.nextService.distanceToNextServiceKm ?? si.serviceRemainingKm ?? null;
}

export function hmTrackedServiceDays(si: ServiceInfoStatus | null | undefined): number | null {
  if (si?.nextService?.trackingStatus !== 'TRACKED') return null;
  return si.nextService.timeToNextServiceDays ?? si.serviceRemainingDays ?? null;
}

export function isHmServiceTracked(si: ServiceInfoStatus | null | undefined): boolean {
  return si?.nextService?.trackingStatus === 'TRACKED';
}

export function isComputedServiceSource(source: ServiceNextSource | undefined): boolean {
  return source === 'COMPUTED_ONEAUTO_SCHEDULE' || source === 'COMPUTED_MANUAL_INTERVAL';
}

export function serviceHistoryDisclaimer(t: ServiceDisplayTranslator = defaultTranslator): string {
  return t('health.serviceInfo.v2.disclaimer.history');
}

const SERVICE_EVENT_TYPE_KEYS: Record<string, TranslationKey> = {
  FULL_SERVICE: 'health.serviceInfo.v2.eventType.FULL_SERVICE',
  GENERAL_INSPECTION: 'health.serviceInfo.v2.eventType.GENERAL_INSPECTION',
  OIL_CHANGE: 'health.serviceInfo.v2.eventType.OIL_CHANGE',
  REPAIR: 'health.serviceInfo.v2.eventType.REPAIR',
  BRAKE_SERVICE: 'health.serviceInfo.v2.eventType.BRAKE_SERVICE',
  TIRE_ROTATION: 'health.serviceInfo.v2.eventType.TIRE_ROTATION',
  BATTERY_REPLACEMENT: 'health.serviceInfo.v2.eventType.BATTERY_REPLACEMENT',
  TUV_INSPECTION: 'health.serviceInfo.v2.eventType.TUV_INSPECTION',
  BOKRAFT_INSPECTION: 'health.serviceInfo.v2.eventType.BOKRAFT_INSPECTION',
  OTHER: 'health.serviceInfo.v2.eventType.OTHER',
};

export function formatServiceEventType(eventType: string, t: ServiceDisplayTranslator = defaultTranslator): string {
  const key = SERVICE_EVENT_TYPE_KEYS[eventType];
  return key ? t(key) : eventType.replace(/_/g, ' ');
}

/** @deprecated Use `formatServiceEventType(eventType, t)`; kept for callers without a translator. */
export function formatServiceEventTypeDe(eventType: string): string {
  return formatServiceEventType(eventType, (key, vars) => translateKey('de', key, vars).text);
}

export function formatPositionKind(kind: MaintenancePositionKind, t: ServiceDisplayTranslator = defaultTranslator): string {
  return t(`health.serviceInfo.v2.kind.${kind}` as TranslationKey);
}

export function formatServiceDateTime(iso: string | null | undefined, formattingLocale?: string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString(formattingLocale ?? getFormattingLocale(DEFAULT_PRODUCT_LOCALE), {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatServiceDate(iso: string | null | undefined, formattingLocale?: string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(formattingLocale ?? getFormattingLocale(DEFAULT_PRODUCT_LOCALE), {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

/** @deprecated Use `formatServiceDateTime(iso, formattingLocale)`. */
export function formatLastUpdatedDe(iso: string | null | undefined): string | null {
  return formatServiceDateTime(iso, 'de-DE');
}

export function sourceLineFor(source: ServiceNextSource | undefined, t: ServiceDisplayTranslator = defaultTranslator): string {
  switch (source) {
    case 'HM_OEM':
      return t('health.serviceInfo.v2.source.hmOem');
    case 'COMPUTED_ONEAUTO_SCHEDULE':
      return t('health.serviceInfo.v2.source.oneauto');
    case 'COMPUTED_MANUAL_INTERVAL':
      return t('health.serviceInfo.v2.source.manual');
    default:
      return t('health.serviceInfo.v2.source.unknown');
  }
}

function trackedDaysKm(ns: NextServiceCompliance, si: ServiceInfoStatus | null | undefined) {
  const days = ns.timeToNextServiceDays ?? (si?.serviceRemainingDays ?? null);
  const km = ns.distanceToNextServiceKm ?? (si?.serviceRemainingKm ?? null);
  return { days, km };
}

export function formatTrackedRemaining(
  days: number | null,
  km: number | null,
  overdue: boolean,
  t: ServiceDisplayTranslator = defaultTranslator,
  formattingLocale?: string,
): string {
  if (overdue) {
    const parts: string[] = [];
    if (days != null && days < 0) {
      parts.push(t('health.serviceInfo.v2.overdue.daysPart', { days: Math.abs(days) }));
    }
    if (km != null && km < 0) {
      parts.push(t('health.serviceInfo.v2.overdue.kmPart', { km: formatServiceKm(Math.abs(km), formattingLocale) }));
    }
    if (parts.length > 0) {
      return t('health.serviceInfo.v2.overdue.since', { parts: parts.join(' / ') });
    }
    return t('health.serviceInfo.v2.overdue.plain');
  }

  const hasDays = days != null && days >= 0;
  const hasKm = km != null && km >= 0;
  if (hasDays && hasKm) {
    return t('health.serviceInfo.v2.remaining.both', { days, km: formatServiceKm(km, formattingLocale) });
  }
  if (hasDays) {
    return t('health.serviceInfo.v2.remaining.days', { days });
  }
  if (hasKm) {
    return t('health.serviceInfo.v2.remaining.km', { km: formatServiceKm(km, formattingLocale) });
  }
  return t('health.serviceInfo.v2.remaining.none');
}

function noBasisReason(forecast: MaintenanceForecastResult | null | undefined, si: ServiceInfoStatus | null | undefined): NextServiceNoBasisReason {
  const hasSchedule = (forecast?.positions.length ?? 0) > 0;
  const hasHistory =
    si?.hasServiceHistory === true ||
    (forecast?.eventSources.some((s) => s !== 'NONE' && s !== 'VEHICLE_MASTER_DATA') ?? false);
  if (hasSchedule && !hasHistory) return 'SCHEDULE_ONLY';
  if (!hasSchedule && hasHistory) return 'HISTORY_ONLY';
  return 'NONE';
}

function emptyMeta() {
  return {
    source: null as ServiceNextSource,
    isComputed: false,
    positionKind: null,
    positionLabel: null,
    noBasisReason: 'NONE' as const,
    dataQuality: [] as MaintenanceDataQualityFlag[],
    conflicts: [] as MaintenanceConflict[],
  };
}

export function buildNextServiceDisplay(
  si: ServiceInfoStatus | null | undefined,
  opts?: ServiceDisplayOptions,
): NextServiceDisplay {
  const t = resolveTranslator(opts);
  const fmtLocale = resolveFormattingLocale(opts);

  if (opts?.loading) {
    return {
      trackingStatus: 'LOADING',
      title: t('health.serviceInfo.v2.title'),
      primaryLine: t('health.serviceInfo.v2.loading'),
      description: '',
      sourceLine: null,
      badge: null,
      tone: 'neutral',
      showHmOverdueHint: false,
      showHmDueSoonHint: false,
      lastUpdatedLabel: null,
      daysKm: { days: null, km: null },
      ...emptyMeta(),
    };
  }

  if (opts?.error) {
    return {
      trackingStatus: 'ERROR',
      title: t('health.serviceInfo.v2.title'),
      primaryLine: t('health.serviceInfo.v2.error.primary'),
      description: t('health.serviceInfo.v2.error.description'),
      sourceLine: null,
      badge: t('health.serviceInfo.v2.badge.error'),
      tone: 'warning',
      showHmOverdueHint: false,
      showHmDueSoonHint: false,
      lastUpdatedLabel: null,
      daysKm: { days: null, km: null },
      ...emptyMeta(),
    };
  }

  const ns = si?.nextService;
  const status = ns?.trackingStatus ?? 'NO_TRACKING';
  const forecast = si?.maintenanceForecast ?? null;

  if (!ns || status === 'NO_TRACKING') {
    const reason = noBasisReason(forecast, si);
    const description =
      reason === 'SCHEDULE_ONLY'
        ? t('health.serviceInfo.v2.noBasis.scheduleOnly')
        : reason === 'HISTORY_ONLY'
          ? t('health.serviceInfo.v2.noBasis.historyOnly')
          : t('health.serviceInfo.v2.noBasis.description');
    return {
      trackingStatus: 'NO_TRACKING',
      title: t('health.serviceInfo.v2.noBasis.title'),
      primaryLine: t('health.serviceInfo.v2.noBasis.primary'),
      description,
      sourceLine: null,
      badge: t('health.serviceInfo.v2.badge.noBasis'),
      tone: 'info',
      showHmOverdueHint: false,
      showHmDueSoonHint: false,
      lastUpdatedLabel: null,
      daysKm: { days: null, km: null },
      ...emptyMeta(),
      noBasisReason: reason,
      dataQuality: ns?.dataQuality ?? forecast?.dataQuality ?? [],
      conflicts: ns?.conflicts ?? forecast?.conflicts ?? [],
    };
  }

  if (status === 'STALE') {
    const updated = formatServiceDateTime(ns.lastUpdatedAt, fmtLocale);
    return {
      trackingStatus: 'STALE',
      title: t('health.serviceInfo.v2.stale.title'),
      primaryLine: t('health.serviceInfo.v2.stale.primary'),
      description: updated
        ? t('health.serviceInfo.v2.stale.description', { date: updated })
        : t('health.serviceInfo.v2.stale.descriptionNoDate'),
      sourceLine: t('health.serviceInfo.v2.source.hmOem'),
      badge: t('health.serviceInfo.v2.badge.stale'),
      tone: 'info',
      showHmOverdueHint: false,
      showHmDueSoonHint: false,
      lastUpdatedLabel: updated ? t('health.serviceInfo.v2.freshness.updated', { date: updated }) : null,
      daysKm: { days: null, km: null },
      ...emptyMeta(),
      source: 'HM_OEM',
      dataQuality: ns.dataQuality ?? [],
      conflicts: ns.conflicts ?? [],
    };
  }

  const { days, km } = trackedDaysKm(ns, si);
  const overdue = ns.severity === 'CRITICAL' || si?.serviceOverdue === true;
  const dueSoon = !overdue && (ns.severity === 'WARNING' || si?.serviceDueImminently === true);
  const updated = formatServiceDateTime(ns.lastUpdatedAt, fmtLocale);
  const source: ServiceNextSource = ns.source ?? 'HM_OEM';
  const positionKind = ns.positionKind ?? null;

  return {
    trackingStatus: 'TRACKED',
    title: overdue
      ? t('health.serviceInfo.v2.tracked.title.overdue')
      : dueSoon
        ? t('health.serviceInfo.v2.tracked.title.dueSoon')
        : t('health.serviceInfo.v2.tracked.title.ok'),
    primaryLine: formatTrackedRemaining(days, km, overdue, t, fmtLocale),
    description: ns.description,
    sourceLine: sourceLineFor(source, t),
    badge: overdue
      ? t('health.serviceInfo.v2.badge.overdue')
      : dueSoon
        ? t('health.serviceInfo.v2.badge.dueSoon')
        : t('health.serviceInfo.v2.badge.active'),
    tone: overdue ? 'critical' : dueSoon ? 'warning' : 'good',
    showHmOverdueHint: overdue,
    showHmDueSoonHint: dueSoon,
    lastUpdatedLabel: updated ? t('health.serviceInfo.v2.freshness.updated', { date: updated }) : null,
    daysKm: { days, km },
    source,
    isComputed: isComputedServiceSource(source),
    positionKind,
    positionLabel: positionKind ? formatPositionKind(positionKind, t) : null,
    noBasisReason: 'NONE',
    dataQuality: ns.dataQuality ?? [],
    conflicts: ns.conflicts ?? [],
  };
}

export interface ComplianceDisplay {
  status: ComplianceUiStatus;
  label: string;
  detail: string;
  blocksRentalHint: boolean;
  tone: NextServiceUiTone;
  validTill: string | null;
}

export function buildTuvComplianceDisplay(si: ServiceInfoStatus | null | undefined): ComplianceDisplay {
  const days = si?.tuvRemainingDays ?? null;
  const overdue = si?.tuvOverdue === true;
  const validTill = si?.tuvValidTill
    ? new Date(si.tuvValidTill).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : null;

  if (!si?.tuvValidTill || days == null) {
    return {
      status: 'no_data',
      label: 'Kein Datum',
      detail: 'Kein TÜV-Termin hinterlegt',
      blocksRentalHint: false,
      tone: 'neutral',
      validTill,
    };
  }
  if (overdue) {
    return {
      status: 'overdue',
      label: 'Überfällig',
      detail: `Abgelaufen seit ${Math.abs(days)} Tag${Math.abs(days) === 1 ? '' : 'en'}`,
      blocksRentalHint: true,
      tone: 'critical',
      validTill,
    };
  }
  if (days <= 30) {
    return {
      status: 'due_soon',
      label: 'Bald fällig',
      detail: `Noch ${days} Tag${days === 1 ? '' : 'e'}`,
      blocksRentalHint: false,
      tone: 'warning',
      validTill,
    };
  }
  return {
    status: 'valid',
    label: 'Gültig',
    detail: `Noch ${days} Tag${days === 1 ? '' : 'e'}`,
    blocksRentalHint: false,
    tone: 'good',
    validTill,
  };
}

export function buildBokraftComplianceDisplay(si: ServiceInfoStatus | null | undefined): ComplianceDisplay {
  const days = si?.bokraftRemainingDays ?? null;
  const overdue = si?.bokraftOverdue === true;
  const validTill = si?.bokraftValidTill
    ? new Date(si.bokraftValidTill).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : null;

  if (!si?.bokraftValidTill || days == null) {
    return {
      status: 'no_data',
      label: 'Kein Datum',
      detail: 'Kein BOKraft-Termin hinterlegt',
      blocksRentalHint: false,
      tone: 'neutral',
      validTill,
    };
  }
  if (overdue) {
    return {
      status: 'overdue',
      label: 'Überfällig',
      detail: `Abgelaufen seit ${Math.abs(days)} Tag${Math.abs(days) === 1 ? '' : 'en'}`,
      blocksRentalHint: true,
      tone: 'critical',
      validTill,
    };
  }
  if (days <= 30) {
    return {
      status: 'due_soon',
      label: 'Bald fällig',
      detail: `Noch ${days} Tag${days === 1 ? '' : 'e'}`,
      blocksRentalHint: false,
      tone: 'warning',
      validTill,
    };
  }
  return {
    status: 'valid',
    label: 'Gültig',
    detail: `Noch ${days} Tag${days === 1 ? '' : 'e'}`,
    blocksRentalHint: false,
    tone: 'good',
    validTill,
  };
}

export function nextServiceToneClass(tone: NextServiceUiTone): string {
  switch (tone) {
    case 'critical':
      return 'text-red-600 dark:text-red-400';
    case 'warning':
      return 'text-amber-600 dark:text-amber-400';
    case 'good':
      return 'text-emerald-600 dark:text-emerald-400';
    case 'info':
      return 'text-muted-foreground';
    default:
      return 'text-foreground';
  }
}

export function nextServicePanelClass(tone: NextServiceUiTone): string {
  switch (tone) {
    case 'critical':
      return 'sq-tone-critical';
    case 'warning':
      return 'sq-tone-watch';
    case 'good':
      return 'sq-tone-positive';
    default:
      return 'sq-tone-info';
  }
}
