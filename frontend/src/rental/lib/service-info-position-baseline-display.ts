import type { MaintenancePositionForecast } from '../../lib/api';
import type { TranslationKey } from '../../i18n/LanguageContext';
import { formatServiceDate, formatServiceKm } from './service-info-display';
import { classifyPositionBaseline } from './service-info-position-baseline';

type Translator = (key: TranslationKey, vars?: Record<string, string | number>) => string;

export type PositionBaselineDisplay =
  | { kind: 'labeled'; label: string; value: string }
  | { kind: 'standalone'; text: string };

export function formatPositionBaselineDisplay(
  p: MaintenancePositionForecast,
  t: Translator,
  fmtLocale: string,
): PositionBaselineDisplay {
  const classification = classifyPositionBaseline(p.baseline, p.dataQuality);
  const date = formatServiceDate(p.baseline?.date ?? null, fmtLocale);
  const km =
    p.baseline?.odometerKm != null ? formatServiceKm(p.baseline.odometerKm, fmtLocale) : null;

  const documentedBlock = (labelKey: TranslationKey) => {
    if (date && km) {
      return {
        kind: 'labeled' as const,
        label: t(labelKey),
        value: t('health.serviceInfo.v3.ux32.baseline.verifiedValue', { date, km }),
      };
    }
    if (date) {
      return {
        kind: 'labeled' as const,
        label: t(labelKey),
        value: t('health.serviceInfo.v3.ux32.baseline.verifiedDateOnly', { date }),
      };
    }
    if (km) {
      return {
        kind: 'labeled' as const,
        label: t(labelKey),
        value: t('health.serviceInfo.v3.ux32.baseline.verifiedKmOnly', { km }),
      };
    }
    return {
      kind: 'labeled' as const,
      label: t(labelKey),
      value: t('health.serviceInfo.v3.ux32.baseline.odometerUndocumented'),
    };
  };

  if (classification.evidenceClass === 'documented_service') {
    return documentedBlock('health.serviceInfo.v3.ux32.baseline.documentedLabel');
  }

  if (classification.evidenceClass === 'user_declared') {
    return documentedBlock('health.serviceInfo.v3.ux32.baseline.userDeclaredLabel');
  }

  if (classification.evidenceClass === 'calculation_basis') {
    if (date && km) {
      return {
        kind: 'labeled',
        label: t('health.serviceInfo.v3.ux32.baseline.calculationBasisLabel'),
        value: t('health.serviceInfo.v3.ux32.baseline.calculationBasisBoth', { date, km }),
      };
    }
    if (date) {
      return {
        kind: 'labeled',
        label: t('health.serviceInfo.v3.ux32.baseline.calculationBasisLabel'),
        value: t('health.serviceInfo.v3.ux32.baseline.calculationBasisDate', { date }),
      };
    }
    if (km) {
      return {
        kind: 'labeled',
        label: t('health.serviceInfo.v3.ux32.baseline.calculationBasisLabel'),
        value: t('health.serviceInfo.v3.ux32.baseline.calculationBasisKm', { km }),
      };
    }
    return {
      kind: 'standalone',
      text: t('health.serviceInfo.v3.ux32.baseline.notProven'),
    };
  }

  return {
    kind: 'standalone',
    text: t('health.serviceInfo.v3.ux32.baseline.notProven'),
  };
}
