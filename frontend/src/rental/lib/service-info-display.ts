import type { NextServiceCompliance, ServiceInfoStatus, ServiceTrackingStatus } from '../../lib/api';

export type NextServiceUiTone = 'neutral' | 'good' | 'warning' | 'critical' | 'info';
export type ComplianceUiStatus = 'no_data' | 'valid' | 'due_soon' | 'overdue';

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
}

const NO_TRACKING_DESCRIPTION =
  'Für dieses Fahrzeug liefert HM/OEM aktuell keine Serviceinformationen. SynqDrive zeigt deshalb keinen geschätzten nächsten Service an.';

const HISTORY_DISCLAIMER =
  'Die Servicehistorie dient nur der Dokumentation. Ereignisse wie Reparatur oder Ölwechsel setzen den nächsten Service nicht zurück — Next Service kommt ausschließlich von HM/OEM. Externe OneAuto-Einträge sind keine Hersteller-Zertifizierung und können unvollständig sein.';

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

export function serviceHistoryDisclaimer(): string {
  return HISTORY_DISCLAIMER;
}

export function formatServiceEventTypeDe(eventType: string): string {
  const map: Record<string, string> = {
    FULL_SERVICE: 'Vollservice',
    GENERAL_INSPECTION: 'Inspektion',
    OIL_CHANGE: 'Ölwechsel',
    REPAIR: 'Reparatur',
    BRAKE_SERVICE: 'Bremsenservice',
    TIRE_ROTATION: 'Reifenrotation',
    BATTERY_REPLACEMENT: 'Batteriewechsel',
    TUV_INSPECTION: 'TÜV',
    BOKRAFT_INSPECTION: 'BOKraft',
    OTHER: 'Sonstiges',
  };
  return map[eventType] ?? eventType.replace(/_/g, ' ');
}

export function formatLastUpdatedDe(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function trackedDaysKm(ns: NextServiceCompliance, si: ServiceInfoStatus | null | undefined) {
  const days = ns.timeToNextServiceDays ?? (si?.serviceRemainingDays ?? null);
  const km = ns.distanceToNextServiceKm ?? (si?.serviceRemainingKm ?? null);
  return { days, km };
}

function formatTrackedRemaining(days: number | null, km: number | null, overdue: boolean): string {
  if (overdue) {
    const parts: string[] = [];
    if (days != null && days < 0) {
      parts.push(`${Math.abs(days)} Tage`);
    }
    if (km != null && km < 0) {
      parts.push(`${Math.abs(km).toLocaleString('de-DE')} km`);
    }
    if (parts.length > 0) {
      return `Service laut HM/OEM überfällig (seit ${parts.join(' / ')})`;
    }
    return 'Service laut HM/OEM überfällig';
  }

  const hasDays = days != null && days >= 0;
  const hasKm = km != null && km >= 0;
  if (hasDays && hasKm) {
    return `Noch ${days} Tage / ${km.toLocaleString('de-DE')} km bis zum nächsten Service`;
  }
  if (hasDays) {
    return `Noch ${days} Tage bis zum nächsten Service`;
  }
  if (hasKm) {
    return `Noch ${km.toLocaleString('de-DE')} km bis zum nächsten Service`;
  }
  return 'Next Service aktiv (HM/OEM)';
}

export function buildNextServiceDisplay(
  si: ServiceInfoStatus | null | undefined,
  opts?: { loading?: boolean; error?: boolean },
): NextServiceDisplay {
  if (opts?.loading) {
    return {
      trackingStatus: 'LOADING',
      title: 'Nächster Service',
      primaryLine: 'Wird geladen…',
      description: '',
      sourceLine: null,
      badge: null,
      tone: 'neutral',
      showHmOverdueHint: false,
      showHmDueSoonHint: false,
      lastUpdatedLabel: null,
      daysKm: { days: null, km: null },
    };
  }

  if (opts?.error) {
    return {
      trackingStatus: 'ERROR',
      title: 'Nächster Service',
      primaryLine: 'Serviceinformationen nicht verfügbar',
      description: 'Die HM/OEM-Serviceinformationen konnten nicht geladen werden. Bitte später erneut versuchen.',
      sourceLine: null,
      badge: 'Fehler',
      tone: 'warning',
      showHmOverdueHint: false,
      showHmDueSoonHint: false,
      lastUpdatedLabel: null,
      daysKm: { days: null, km: null },
    };
  }

  const ns = si?.nextService;
  const status = ns?.trackingStatus ?? 'NO_TRACKING';

  if (!ns || status === 'NO_TRACKING') {
    return {
      trackingStatus: 'NO_TRACKING',
      title: 'Keine Serviceverfolgung',
      primaryLine: 'Kein HM/OEM-Tracking',
      description: NO_TRACKING_DESCRIPTION,
      sourceLine: null,
      badge: 'Kein Tracking',
      tone: 'info',
      showHmOverdueHint: false,
      showHmDueSoonHint: false,
      lastUpdatedLabel: null,
      daysKm: { days: null, km: null },
    };
  }

  if (status === 'STALE') {
    const updated = formatLastUpdatedDe(ns.lastUpdatedAt);
    return {
      trackingStatus: 'STALE',
      title: 'Tracking veraltet',
      primaryLine: 'HM/OEM-Daten sind veraltet',
      description: updated
        ? `Die letzten HM/OEM-Servicewerte stammen vom ${updated} und werden nicht als aktive Wahrheit genutzt.`
        : 'Die HM/OEM-Servicewerte sind älter als 7 Tage und werden nicht als aktive Wahrheit genutzt.',
      sourceLine: 'Quelle: HM/OEM (veraltet)',
      badge: 'Veraltet',
      tone: 'info',
      showHmOverdueHint: false,
      showHmDueSoonHint: false,
      lastUpdatedLabel: updated ? `Letzte Aktualisierung: ${updated}` : null,
      daysKm: { days: null, km: null },
    };
  }

  const { days, km } = trackedDaysKm(ns, si);
  const overdue = ns.severity === 'CRITICAL' || si?.serviceOverdue === true;
  const dueSoon = !overdue && (ns.severity === 'WARNING' || si?.serviceDueImminently === true);
  const updated = formatLastUpdatedDe(ns.lastUpdatedAt);

  return {
    trackingStatus: 'TRACKED',
    title: overdue
      ? 'Service überfällig'
      : dueSoon
        ? 'Service bald fällig'
        : 'Nächster Service',
    primaryLine: formatTrackedRemaining(days, km, overdue),
    description: overdue
      ? 'Service laut HM/OEM überfällig — Werkstatttermin vereinbaren.'
      : dueSoon
        ? 'Service laut HM/OEM bald fällig — Termin planen.'
        : 'Von HM/OEM geliefert. SynqDrive berechnet den nächsten Service nicht selbst.',
    sourceLine: 'Quelle: Von HM/OEM geliefert',
    badge: overdue ? 'Überfällig' : dueSoon ? 'Bald fällig' : 'Aktiv',
    tone: overdue ? 'critical' : dueSoon ? 'warning' : 'good',
    showHmOverdueHint: overdue,
    showHmDueSoonHint: dueSoon,
    lastUpdatedLabel: updated ? `Letzte Aktualisierung: ${updated}` : null,
    daysKm: { days, km },
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
