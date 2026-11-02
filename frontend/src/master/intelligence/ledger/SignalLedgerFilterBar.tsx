import { useLanguage } from '../../../i18n/LanguageContext';
import { cn } from '../../../components/ui/utils';
import type { VsiLedgerFilterState } from '../vsi-ledger-url.types';
import {
  VSI_LEDGER_APPLICABILITY_VALUES,
  VSI_LEDGER_FRESHNESS_VALUES,
  VSI_LEDGER_OBSERVATION_VALUES,
  VSI_LEDGER_RPM_COMBINED_VALUES,
} from '../vsi-ledger-url.types';

export type SignalLedgerFilterBarProps = {
  filters: VsiLedgerFilterState;
  onChange: (patch: Partial<VsiLedgerFilterState>) => void;
  onClear: () => void;
  resultCount: number;
  totalCount: number;
  className?: string;
};

function toggleCsvValue(values: string[], value: string): string[] {
  return values.includes(value) ? values.filter((v) => v !== value) : [...values, value];
}

export function SignalLedgerFilterBar({
  filters,
  onChange,
  onClear,
  resultCount,
  totalCount,
  className,
}: SignalLedgerFilterBarProps) {
  const { t } = useLanguage();

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs">
          <span className="text-muted-foreground">
            {t('master.intelligence.vsi.ledger.filters.search' as never)}
          </span>
          <input
            type="search"
            className="rounded-md border border-border bg-background px-2 py-1.5 font-mono text-[11px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
            value={filters.q ?? ''}
            onChange={(e) =>
              onChange({ q: e.target.value.trim() ? e.target.value : null })
            }
            aria-label={t('master.intelligence.vsi.ledger.filters.search' as never)}
          />
        </label>
        <button
          type="button"
          className="h-9 shrink-0 rounded-md border border-border px-3 text-xs hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring"
          onClick={onClear}
        >
          {t('master.intelligence.vsi.ledger.filters.clear' as never)}
        </button>
      </div>

      <div className="flex flex-wrap gap-2 text-[10px]" role="group" aria-label={t('master.intelligence.vsi.ledger.filters.group' as never)}>
        {VSI_LEDGER_APPLICABILITY_VALUES.map((value) => (
          <FilterToggle
            key={`appl-${value}`}
            pressed={filters.appl.includes(value)}
            label={t(`master.intelligence.vsi.ledger.applicability.${value}` as never)}
            onClick={() => onChange({ appl: toggleCsvValue(filters.appl, value) })}
          />
        ))}
        <span className="mx-1 w-px self-stretch bg-border/60" aria-hidden />
        {VSI_LEDGER_OBSERVATION_VALUES.map((value) => (
          <FilterToggle
            key={`obs-${value}`}
            pressed={filters.obs.includes(value)}
            label={t(`master.intelligence.vsi.signals.empirical.${value}` as never)}
            onClick={() => onChange({ obs: toggleCsvValue(filters.obs, value) })}
          />
        ))}
        <span className="mx-1 w-px self-stretch bg-border/60" aria-hidden />
        {VSI_LEDGER_FRESHNESS_VALUES.map((value) => (
          <FilterToggle
            key={`fresh-${value}`}
            pressed={filters.fresh.includes(value)}
            label={t(`master.intelligence.vsi.ledger.freshness.${value}` as never)}
            onClick={() => onChange({ fresh: toggleCsvValue(filters.fresh, value) })}
          />
        ))}
        <span className="mx-1 w-px self-stretch bg-border/60" aria-hidden />
        {VSI_LEDGER_RPM_COMBINED_VALUES.map((value) => (
          <FilterToggle
            key={`rpm-${value}`}
            pressed={filters.rpm.includes(value)}
            label={t(`master.intelligence.vsi.signals.rpmCombined.${value}` as never)}
            onClick={() => onChange({ rpm: toggleCsvValue(filters.rpm, value) })}
          />
        ))}
        <span className="mx-1 w-px self-stretch bg-border/60" aria-hidden />
        <FilterToggle
          pressed={filters.lim}
          label={t('master.intelligence.vsi.ledger.filters.hasLimitations' as never)}
          onClick={() => onChange({ lim: !filters.lim })}
        />
        <FilterToggle
          pressed={filters.hf}
          label={t('master.intelligence.vsi.ledger.filters.hasHf' as never)}
          onClick={() => onChange({ hf: !filters.hf })}
        />
        <FilterToggle
          pressed={filters.hideNA}
          label={t('master.intelligence.vsi.ledger.filters.hideNA' as never)}
          onClick={() => onChange({ hideNA: !filters.hideNA })}
        />
      </div>

      <p className="text-[11px] text-muted-foreground tabular-nums" aria-live="polite">
        {t('master.intelligence.vsi.ledger.filters.resultCount' as never, {
          shown: resultCount,
          total: totalCount,
        })}
      </p>
    </div>
  );
}

function FilterToggle({
  pressed,
  label,
  onClick,
}: {
  pressed: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        'min-h-[44px] rounded-md border px-2 py-1 sm:min-h-0',
        pressed
          ? 'border-border bg-muted/50 text-foreground'
          : 'border-border/50 bg-transparent text-muted-foreground hover:bg-muted/20',
      )}
    >
      {label}
    </button>
  );
}
