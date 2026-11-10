import type { MaintenancePositionForecast } from '../../lib/api';
import type { TranslationKey } from '../../i18n/LanguageContext';
import { formatServiceDate, formatServiceKm } from './service-info-display';

type Translator = (key: TranslationKey, vars?: Record<string, string | number>) => string;

/** Independent calendar vs odometer due lines; uses signed remainingDays/remainingKm only. */
export function formatPositionDueLines(
  p: MaintenancePositionForecast,
  t: Translator,
  fmtLocale: string,
): string[] {
  const lines: string[] = [];
  const dueDate = formatServiceDate(p.dueAtDate, fmtLocale);
  if (dueDate) {
    const timeOverdue = p.remainingDays != null && p.remainingDays < 0;
    const dateLabelKey = timeOverdue
      ? 'health.serviceInfo.v3.ux32.plan.dueSinceLabel'
      : 'health.serviceInfo.v3.ux32.plan.dueOnLabel';
    lines.push(`${t(dateLabelKey as TranslationKey)} ${dueDate}`);
  }
  if (p.dueAtKm != null) {
    const kmFormatted = formatServiceKm(p.dueAtKm, fmtLocale);
    const kmOverdue = p.remainingKm != null && p.remainingKm < 0;
    const kmLabelKey = kmOverdue
      ? 'health.serviceInfo.v3.ux32.plan.dueSinceKmLabel'
      : 'health.serviceInfo.v3.ux32.plan.dueAtKmLabel';
    lines.push(`${t(kmLabelKey as TranslationKey)} ${t('health.serviceInfo.v2.value.km', { km: kmFormatted })}`);
  }
  return lines;
}
