import { cn } from '../../../components/ui/utils';
import { useLanguage } from '../../../i18n/LanguageContext';

const KNOWN_LIMITATION_CODES = new Set([
  'RPM_HF_SOURCE_LINK_ATTRIBUTION_UNPROVEN',
  'ICE_RPM_SNAPSHOT_ONLY_NOT_HISTORICAL_CADENCE',
  'OPEN_TRIP_BLOCKS_STANDBY_CLASSIFICATION',
  'MULTI_ACTIVE_SOURCE_LINK_DECLARED_CATALOG_AMBIGUOUS',
  'LATEST_STATE_NOT_ATTRIBUTED_TO_SOURCE_LINK',
  'PROVIDER_IDENTITY_MISMATCH_DECLARED_CATALOG_DIMO_ONLY',
]);

function limitationDescriptionKey(code: string): string {
  return `master.intelligence.vsi.ledger.limitation.${code}`;
}

export type LimitationTagListProps = {
  codes: readonly string[] | null | undefined;
  className?: string;
  /** When true, attribution-related codes render with amber styling. */
  highlightAttribution?: boolean;
};

function isAttributionCode(code: string): boolean {
  return code.includes('ATTRIBUTION') || code.startsWith('RPM_HF_');
}

export function LimitationTagList({
  codes,
  className,
  highlightAttribution = true,
}: LimitationTagListProps) {
  const { t } = useLanguage();
  const unique = [...new Set((codes ?? []).map((c) => c.trim()).filter(Boolean))];

  if (unique.length === 0) {
    return null;
  }

  return (
    <ul className={cn('m-0 flex flex-col gap-2 p-0 list-none', className)} aria-label={t('master.intelligence.vsi.signals.limitations' as never)}>
      {unique.map((code) => {
        const known = KNOWN_LIMITATION_CODES.has(code);
        const description = known
          ? t(limitationDescriptionKey(code) as never)
          : t('master.intelligence.vsi.ledger.limitation.unknownCodeHint' as never);
        const amber = highlightAttribution && isAttributionCode(code);

        return (
          <li key={code}>
            <span
              tabIndex={0}
              className={cn(
                'inline-flex max-w-full flex-col gap-0.5 rounded-md border px-2 py-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                amber
                  ? 'border-amber-500/40 bg-amber-500/10 text-amber-950 dark:text-amber-100'
                  : 'border-border/60 bg-muted/20 text-foreground',
              )}
              title={description}
              aria-describedby={`limitation-desc-${code}`}
            >
              <code className="text-[10px] font-mono">{code}</code>
              <span id={`limitation-desc-${code}`} className="text-[10px] text-muted-foreground leading-snug">
                {description}
              </span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
