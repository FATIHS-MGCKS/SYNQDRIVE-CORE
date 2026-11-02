import { ArrowRight } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { useLanguage } from '../../i18n/LanguageContext';
import { cn } from '../../components/ui/utils';
import { useMasterIntelligenceContext } from './useMasterIntelligenceContext';
import { contextHasMinimumForCrossLink } from './master-intelligence-url';
import type { MasterIntelligenceCrossLinkTarget } from './master-intelligence.types';

const TARGET_LABEL_KEY: Record<MasterIntelligenceCrossLinkTarget, string> = {
  vehicles: 'master.intelligence.crossLink.vehicle',
  'device-inventory': 'master.intelligence.crossLink.device',
  'vsi-intelligence': 'master.intelligence.crossLink.vsi',
  'apds-intelligence': 'master.intelligence.crossLink.apds',
};

type IntelligenceCrossLinkProps = {
  target: MasterIntelligenceCrossLinkTarget;
  className?: string;
  variant?: 'button' | 'text';
};

export function IntelligenceCrossLink({
  target,
  className,
  variant = 'button',
}: IntelligenceCrossLinkProps) {
  const { t } = useLanguage();
  const { context, navigateCrossLink } = useMasterIntelligenceContext();
  const enabled = contextHasMinimumForCrossLink(target, context);
  const label = t(TARGET_LABEL_KEY[target] as never);

  if (!enabled) {
    return (
      <span className={cn('text-[11px] text-muted-foreground', className)}>
        {t('master.intelligence.crossLink.contextMissing' as never, { target: label })}
      </span>
    );
  }

  if (variant === 'text') {
    return (
      <button
        type="button"
        className={cn(
          'inline-flex items-center gap-1 text-xs font-medium text-primary underline-offset-2 hover:underline',
          className,
        )}
        onClick={() => navigateCrossLink(target)}
      >
        {label}
        <ArrowRight className="h-3 w-3" aria-hidden />
      </button>
    );
  }

  return (
    <Button type="button" variant="outline" size="sm" className={className} onClick={() => navigateCrossLink(target)}>
      {label}
      <ArrowRight className="ml-1 h-3.5 w-3.5" aria-hidden />
    </Button>
  );
}
