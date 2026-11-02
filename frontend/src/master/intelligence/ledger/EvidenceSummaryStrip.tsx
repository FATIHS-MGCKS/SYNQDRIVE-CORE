import { cn } from '../../../components/ui/utils';
import { useLanguage } from '../../../i18n/LanguageContext';
import type { EvidenceSummaryItem } from './evidence-dimension.types';
import { EvidenceDimensionChip } from './EvidenceDimensionChip';

export type EvidenceSummaryStripProps = {
  items: EvidenceSummaryItem[];
  className?: string;
  /** Shown when observation NEVER_OBSERVED and combined PROVEN_HISTORICAL_ONLY coexist. */
  showRpmCompatibilityNote?: boolean;
};

export function EvidenceSummaryStrip({
  items,
  className,
  showRpmCompatibilityNote,
}: EvidenceSummaryStripProps) {
  const { t } = useLanguage();

  return (
    <div
      className={cn('min-w-0 space-y-2', className)}
      role="group"
      aria-label={t('master.intelligence.vsi.ledger.summary.ariaLabel' as never)}
    >
      <ul className="flex min-w-0 flex-wrap gap-2 p-0 m-0 list-none">
        {items.map((item) => (
          <li key={item.kind} className="min-w-0 max-w-full">
            <EvidenceDimensionChip
              kind={item.kind}
              value={item.value}
              attributionLimited={item.attributionLimited}
            />
          </li>
        ))}
      </ul>
      {showRpmCompatibilityNote ? (
        <p className="text-[11px] text-muted-foreground leading-snug">
          {t('master.intelligence.vsi.ledger.compatibility.neverObservedWithHistoricalRpm' as never)}
        </p>
      ) : null}
    </div>
  );
}
