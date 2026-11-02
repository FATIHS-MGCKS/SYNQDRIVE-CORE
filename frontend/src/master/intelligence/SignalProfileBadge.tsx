import { cn } from '../../components/ui/utils';
import { useLanguage } from '../../i18n/LanguageContext';
import type {
  ActiveRpmProfileLabel,
  IceRpmApplicability,
  LvStandbyProfileLabel,
  ObservedRpmDensityLabel,
  ProfileConfidenceLevel,
} from './master-intelligence.types';

type SignalProfileBadgeProps = {
  className?: string;
  limitationCode?: string | null;
} & (
  | { kind: 'lv'; profile: LvStandbyProfileLabel; applicability?: never }
  | { kind: 'rpm'; profile: ActiveRpmProfileLabel; applicability?: IceRpmApplicability }
);

function lvLabelKey(profile: LvStandbyProfileLabel): string {
  return `master.intelligence.badge.lv.${profile}`;
}

function rpmLabelKey(profile: ActiveRpmProfileLabel): string {
  return `master.intelligence.badge.rpm.${profile}`;
}

export function SignalProfileBadge({
  kind,
  profile,
  applicability,
  limitationCode,
  className,
}: SignalProfileBadgeProps) {
  const { t } = useLanguage();
  const labelKey = kind === 'lv' ? lvLabelKey(profile) : rpmLabelKey(profile);
  const titleKey =
    kind === 'lv'
      ? `master.intelligence.badge.lv.explain.${profile}`
      : `master.intelligence.badge.rpm.explain.${profile}`;

  const applicabilityNote =
    kind === 'rpm' && applicability === 'NOT_APPLICABLE'
      ? t('master.intelligence.badge.rpm.notApplicableNote' as never)
      : null;

  const limitationNote =
    limitationCode && profile === 'UNKNOWN'
      ? t('master.intelligence.badge.limitation' as never, { code: limitationCode })
      : null;

  return (
    <span
      className={cn(
        'inline-flex max-w-full flex-col gap-0.5 rounded-md border border-border/70 bg-muted/30 px-2 py-1 text-left',
        className,
      )}
      title={t(titleKey as never)}
    >
      <span className="text-[11px] font-medium leading-tight">{t(labelKey as never)}</span>
      <span className="text-[10px] text-muted-foreground leading-snug">{t(titleKey as never)}</span>
      {applicabilityNote ? (
        <span className="text-[10px] text-amber-800 dark:text-amber-200">{applicabilityNote}</span>
      ) : null}
      {limitationNote ? (
        <span className="text-[10px] text-muted-foreground">{limitationNote}</span>
      ) : null}
    </span>
  );
}

export function ProfileConfidenceIndicator({
  level,
  className,
}: {
  level: ProfileConfidenceLevel;
  className?: string;
}) {
  const { t } = useLanguage();
  return (
    <span
      className={cn(
        'inline-flex items-center rounded border border-border/60 px-1.5 py-0.5 text-[10px] font-medium tabular-nums',
        className,
      )}
    >
      {t(`master.intelligence.confidence.${level}` as never)}
    </span>
  );
}

export function ObservedDensityBadge({
  density,
  className,
}: {
  density: ObservedRpmDensityLabel;
  className?: string;
}) {
  const { t } = useLanguage();
  return (
    <span className={cn('text-[11px] text-muted-foreground', className)}>
      {t(`master.intelligence.density.${density}` as never)}
    </span>
  );
}
