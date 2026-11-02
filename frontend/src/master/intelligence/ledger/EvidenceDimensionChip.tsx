import { cn } from '../../../components/ui/utils';
import { useLanguage } from '../../../i18n/LanguageContext';
import type { EvidenceDimensionKind } from './evidence-dimension.types';
import {
  dimensionLabelKey,
  dimensionValueKey,
  resolveEvidencePresentationTier,
} from './evidence-dimension.presentation';

export type EvidenceDimensionChipProps = {
  kind: EvidenceDimensionKind;
  value: string | null;
  attributionLimited?: boolean;
  className?: string;
  /** Optional tooltip override; defaults to dimension label + value text. */
  title?: string;
};

const TIER_CLASS: Record<
  ReturnType<typeof resolveEvidencePresentationTier>,
  string
> = {
  emphasis:
    'border-border/80 bg-muted/50 text-foreground font-medium',
  neutral:
    'border-border/60 bg-muted/20 text-foreground',
  muted:
    'border-dashed border-border/50 bg-transparent text-muted-foreground',
  amber:
    'border-amber-500/50 bg-amber-500/10 text-amber-950 dark:text-amber-100',
};

export function EvidenceDimensionChip({
  kind,
  value,
  attributionLimited,
  className,
  title,
}: EvidenceDimensionChipProps) {
  const { t } = useLanguage();
  const tier = resolveEvidencePresentationTier(kind, value, { attributionLimited });
  const dimensionLabel = t(dimensionLabelKey(kind) as never);

  let valueLabel: string;
  if (value == null || value === '') {
    valueLabel = '—';
  } else {
    const key = dimensionValueKey(kind, value);
    valueLabel = key ? t(key as never) : value;
  }

  const accessibleName = `${dimensionLabel}: ${valueLabel}`;
  const tooltip = title ?? accessibleName;

  return (
    <span
      className={cn(
        'inline-flex min-h-[44px] min-w-0 max-w-full flex-col justify-center rounded-md border px-2 py-1 text-left sm:min-h-0',
        TIER_CLASS[tier],
        className,
      )}
      title={tooltip}
    >
      <span className="text-[10px] leading-tight text-muted-foreground">{dimensionLabel}</span>
      <span className="text-[11px] leading-snug tabular-nums">{valueLabel}</span>
    </span>
  );
}
