import { useLanguage } from '../../i18n/LanguageContext';
import { cn } from '../../components/ui/utils';
import type { MasterVsiProfileSummaryDto } from '../intelligence/vsi-master-intelligence-api.types';
import { formatProviderLinkLabel } from '../intelligence/vehicle-detail-intelligence.utils';

type Props = {
  profiles: MasterVsiProfileSummaryDto[];
  selectedLinkId: string | null;
  onSelectLinkId: (linkId: string) => void;
  staleSelection: boolean;
  className?: string;
};

export function VehicleDetailSourceLinkPicker({
  profiles,
  selectedLinkId,
  onSelectLinkId,
  staleSelection,
  className,
}: Props) {
  const { t } = useLanguage();

  if (profiles.length <= 1) return null;

  return (
    <div className={cn('space-y-2 rounded-md border border-border/60 bg-muted/20 p-2', className)}>
      <p className="text-[10px] font-medium text-muted-foreground">
        {t('master.intelligence.vehicleDetail.selectSourceLink.title' as never)}
      </p>
      <p className="text-[10px] text-muted-foreground">
        {t('master.intelligence.vehicleDetail.selectSourceLink.hint' as never)}
      </p>
      {staleSelection ? (
        <p className="text-[10px] text-amber-800 dark:text-amber-200" role="status">
          {t('master.intelligence.vehicleDetail.selectSourceLink.stale' as never)}
        </p>
      ) : null}
      <ul className="space-y-1.5" role="listbox" aria-label={t('master.intelligence.vehicleDetail.selectSourceLink.title' as never)}>
        {profiles.map((profile) => {
          const id = profile.providerSourceLinkId;
          const selected = selectedLinkId === id;
          return (
            <li key={id}>
              <button
                type="button"
                role="option"
                aria-selected={selected}
                className={cn(
                  'w-full rounded border px-2 py-1.5 text-left text-[10px] transition-colors',
                  selected
                    ? 'border-primary/50 bg-primary/5'
                    : 'border-border/50 hover:bg-muted/40',
                )}
                onClick={() => onSelectLinkId(id)}
              >
                <span className="font-medium">{formatProviderLinkLabel(profile)}</span>
                <span className="mt-0.5 block font-mono text-muted-foreground">{id}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
