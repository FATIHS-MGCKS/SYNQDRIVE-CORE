import { cn } from '../../../components/ui/utils';
import { useLanguage } from '../../../i18n/LanguageContext';

export type EvidenceTimestampKind = 'observation' | 'source' | 'providerFetch';

export type EvidenceTimestampProps = {
  kind: EvidenceTimestampKind;
  iso: string | null | undefined;
  /** When true, show UTC line beneath local (dual presentation). */
  showUtc?: boolean;
  className?: string;
};

const KIND_LABEL_KEY: Record<EvidenceTimestampKind, string> = {
  observation: 'master.intelligence.vsi.ledger.timestamp.observation',
  source: 'master.intelligence.vsi.ledger.timestamp.source',
  providerFetch: 'master.intelligence.vsi.ledger.timestamp.providerFetch',
};

function parseIso(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return null;
  return new Date(ms);
}

export function EvidenceTimestamp({ kind, iso, showUtc = true, className }: EvidenceTimestampProps) {
  const { t, locale } = useLanguage();
  const date = parseIso(iso);
  const label = t(KIND_LABEL_KEY[kind] as never);

  if (!date) {
    return (
      <div className={cn('text-xs', className)}>
        <span className="text-muted-foreground">{label}</span>
        <span className="ml-1 tabular-nums text-foreground">—</span>
      </div>
    );
  }

  const localText = date.toLocaleString(locale);
  const utcText = date.toLocaleString('en-GB', { timeZone: 'UTC', hour12: false });

  return (
    <div className={cn('space-y-0.5 text-xs', className)}>
      <div>
        <span className="text-muted-foreground">{label}</span>{' '}
        <time dateTime={iso!} className="tabular-nums text-foreground">
          {localText}
        </time>
      </div>
      {showUtc ? (
        <div className="text-[11px] text-muted-foreground">
          <span>{t('master.intelligence.vsi.ledger.timestamp.utc' as never)}</span>{' '}
          <time dateTime={iso!} className="tabular-nums">
            {utcText}
          </time>
        </div>
      ) : null}
      {kind === 'providerFetch' ? (
        <p className="text-[10px] text-muted-foreground leading-snug">
          {t('master.intelligence.vsi.ledger.timestamp.fetchNotObservation' as never)}
        </p>
      ) : null}
    </div>
  );
}
