import type { ServiceInfoStatus } from '../../../lib/api';
import { useLanguage } from '../../../i18n/LanguageContext';
import {
  buildBokraftComplianceDisplay,
  buildTuvComplianceDisplay,
  nextServiceToneClass,
} from '../../lib/service-info-display';

export function ServiceInfoV3ComplianceCards({
  serviceInfo,
  idPrefix = 'service-info-v3',
  className = '',
}: {
  serviceInfo: ServiceInfoStatus | null | undefined;
  /** Prefix for section heading ids when multiple compliance blocks could coexist in tests. */
  idPrefix?: string;
  className?: string;
}) {
  const { t } = useLanguage();
  const tuv = buildTuvComplianceDisplay(serviceInfo);
  const bok = buildBokraftComplianceDisplay(serviceInfo);
  const sectionHeadingId = `${idPrefix}-compliance-heading`;

  return (
    <section
      className={`min-w-0 space-y-3 ${className}`}
      data-testid="service-info-v3-compliance"
      aria-labelledby={sectionHeadingId}
    >
      <h3 id={sectionHeadingId} className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {t('health.serviceInfo.v3.compliance.sectionTitle')}
      </h3>
      <div className="grid min-w-0 grid-cols-1 gap-3 md:grid-cols-2">
        <ComplianceCard
          title={t('health.serviceInfo.v3.compliance.tuvTitle')}
          label={tuv.label}
          toneClass={nextServiceToneClass(tuv.tone)}
          validTill={tuv.validTill}
          detail={tuv.detail}
          blocksRental={tuv.blocksRentalHint}
          blocksRentalLabel={t('health.serviceInfo.v3.compliance.blocksRentalTuv')}
          testId="compliance-tuv"
        />
        <ComplianceCard
          title={t('health.serviceInfo.v3.compliance.bokraftTitle')}
          label={bok.label}
          toneClass={nextServiceToneClass(bok.tone)}
          validTill={bok.validTill}
          detail={bok.detail}
          blocksRental={bok.blocksRentalHint}
          blocksRentalLabel={t('health.serviceInfo.v3.compliance.blocksRentalBokraft')}
          testId="compliance-bokraft"
        />
      </div>
    </section>
  );
}

function ComplianceCard({
  title,
  label,
  toneClass,
  validTill,
  detail,
  blocksRental,
  blocksRentalLabel,
  testId,
}: {
  title: string;
  label: string;
  toneClass: string;
  validTill: string | null;
  detail: string;
  blocksRental: boolean;
  blocksRentalLabel: string;
  testId: string;
}) {
  const { t } = useLanguage();
  const shellClass = blocksRental
    ? 'border-l-4 border-l-red-500/70 bg-red-500/5'
    : 'border-border bg-background/50';

  return (
    <article
      data-testid={testId}
      className={`surface-solid min-w-0 rounded-xl border p-3.5 ${shellClass}`}
    >
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</p>
      <p className={`mt-1.5 text-base font-semibold leading-tight ${toneClass}`}>{label}</p>
      <p className="mt-1 text-[11px] text-muted-foreground">
        {t('health.serviceInfo.v3.compliance.validUntil', { date: validTill ?? '—' })}
      </p>
      <p className={`mt-1 text-[11px] font-medium ${toneClass}`}>{detail}</p>
      {blocksRental ? (
        <p className="mt-2 text-[11px] font-semibold text-red-600 dark:text-red-400" role="status">
          {blocksRentalLabel}
        </p>
      ) : null}
    </article>
  );
}
