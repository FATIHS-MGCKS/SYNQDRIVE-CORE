import { AlertTriangle, Info } from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext';
import { cn } from '../../components/ui/utils';
import type { EvidencePresentationKind } from './master-intelligence.types';

type EvidenceFreshnessHintProps = {
  evaluatedAt?: string | null;
  providerSourceTimestamp?: string | null;
  providerFetchedAt?: string | null;
  profileRevision?: number | null;
  kind?: EvidencePresentationKind;
  className?: string;
};

function formatUserTime(iso: string | null | undefined, locale: string): string | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return null;
  return new Date(ms).toLocaleString(locale);
}

export function EvidenceFreshnessHint({
  evaluatedAt,
  providerSourceTimestamp,
  providerFetchedAt,
  profileRevision,
  kind = 'observed',
  className,
}: EvidenceFreshnessHintProps) {
  const { t, locale } = useLanguage();

  return (
    <div className={cn('space-y-1 rounded-lg border border-border/60 bg-card/40 p-3 text-xs', className)}>
      <p className="font-medium text-foreground">{t('master.intelligence.evidence.title' as never)}</p>
      <p className="text-muted-foreground">{t(`master.intelligence.evidence.kind.${kind}` as never)}</p>
      <dl className="grid gap-1 sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground">{t('master.intelligence.evidence.evaluatedAt' as never)}</dt>
          <dd className="tabular-nums">{formatUserTime(evaluatedAt, locale) ?? '—'}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">
            {t('master.intelligence.evidence.providerSourceTimestamp' as never)}
          </dt>
          <dd className="tabular-nums">{formatUserTime(providerSourceTimestamp, locale) ?? '—'}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">
            {t('master.intelligence.evidence.providerFetchedAt' as never)}
          </dt>
          <dd className="tabular-nums">{formatUserTime(providerFetchedAt, locale) ?? '—'}</dd>
        </div>
        {profileRevision != null ? (
          <div>
            <dt className="text-muted-foreground">{t('master.intelligence.evidence.profileRevision' as never)}</dt>
            <dd className="tabular-nums">{profileRevision}</dd>
          </div>
        ) : null}
      </dl>
      <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        {t('master.intelligence.evidence.fetchNotSignalProof' as never)}
      </p>
    </div>
  );
}

export function EvaluationBlockedBanner({
  limitationCode,
  className,
}: {
  limitationCode?: string | null;
  className?: string;
}) {
  const { t } = useLanguage();
  const code = limitationCode ?? 'OPEN_TRIP_BLOCKS_STANDBY_CLASSIFICATION';
  return (
    <div
      role="status"
      className={cn(
        'flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-950 dark:text-amber-100',
        className,
      )}
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div>
        <p className="font-medium">{t('master.intelligence.blocked.title' as never)}</p>
        <p className="text-xs opacity-90">
          {t('master.intelligence.blocked.body' as never, { code })}
        </p>
      </div>
    </div>
  );
}

export function ShadowVsRealPollHint({ className }: { className?: string }) {
  const { t } = useLanguage();
  return (
    <p className={cn('text-xs text-muted-foreground', className)}>
      {t('master.intelligence.evidence.shadowNotExecutedPoll' as never)}
    </p>
  );
}
