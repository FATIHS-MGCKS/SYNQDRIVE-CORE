import { Construction } from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext';
import { cn } from '../../components/ui/utils';

type IntelligenceEmptyStateProps = {
  titleKey: string;
  bodyKey: string;
  className?: string;
};

export function IntelligenceEmptyState({ titleKey, bodyKey, className }: IntelligenceEmptyStateProps) {
  const { t } = useLanguage();
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border/80 bg-muted/20 px-6 py-12 text-center',
        className,
      )}
    >
      <Construction className="h-10 w-10 text-muted-foreground" aria-hidden />
      <div className="max-w-md space-y-2">
        <h2 className="text-base font-semibold">{t(titleKey as never)}</h2>
        <p className="text-sm text-muted-foreground">{t(bodyKey as never)}</p>
      </div>
    </div>
  );
}
