import { useLanguage } from '../../i18n/LanguageContext';
import { cn } from '../../components/ui/utils';
import type { MasterPdiDeviceIntelligenceDto } from './pdi-master-intelligence-api.types';
import {
  bindingAttributionVehicleOrgLabel,
  formatPdiLinkStatus,
  type PdiProviderBindingRow,
} from './pdi-provider-binding.utils';

type Props = {
  bindings: PdiProviderBindingRow[];
  identity: MasterPdiDeviceIntelligenceDto['identity'];
  selectedLinkId: string | null;
  onSelectLinkId: (linkId: string) => void;
  staleSelection: boolean;
  missingVehicleScope: boolean;
};

export function PdiProviderBindingsSection({
  bindings,
  identity,
  selectedLinkId,
  onSelectLinkId,
  staleSelection,
  missingVehicleScope,
}: Props) {
  const { t } = useLanguage();
  const attribution = bindingAttributionVehicleOrgLabel({ identity });

  if (missingVehicleScope && bindings.length === 0) {
    return (
      <p className="text-[11px] text-muted-foreground" role="status">
        {t('master.intelligence.pdi.bindings.noVehicleScope' as never)}
      </p>
    );
  }

  if (bindings.length === 0) {
    return (
      <p className="text-[11px] text-muted-foreground" role="status">
        {t('master.intelligence.pdi.bindings.noneForScope' as never)}
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{t('master.intelligence.pdi.section.bindings' as never)}</p>
      <p className="text-[10px] text-muted-foreground">
        {t('master.intelligence.pdi.bindings.attributionNote' as never)}
      </p>
      {bindings.length > 1 ? (
        <p className="text-[10px] text-muted-foreground">
          {t('master.intelligence.pdi.bindings.selectRequired' as never)}
        </p>
      ) : null}
      {staleSelection ? (
        <p className="text-[10px] text-amber-800 dark:text-amber-200" role="status">
          {t('master.intelligence.pdi.bindings.staleSelection' as never)}
        </p>
      ) : null}
      <ul
        className="space-y-1.5"
        role="listbox"
        aria-label={t('master.intelligence.pdi.section.bindings' as never)}
      >
        {bindings.map((binding) => {
          const selected = selectedLinkId === binding.providerSourceLinkId;
          const status = formatPdiLinkStatus(binding.linkStatus);
          return (
            <li key={binding.providerSourceLinkId}>
              <button
                type="button"
                role="option"
                aria-selected={selected}
                disabled={bindings.length === 1}
                className={cn(
                  'w-full rounded border px-2 py-1.5 text-left text-[10px] transition-colors',
                  bindings.length === 1 && 'cursor-default',
                  selected
                    ? 'border-primary/50 bg-primary/5'
                    : 'border-border/50 hover:bg-muted/40 disabled:hover:bg-transparent',
                )}
                onClick={() => onSelectLinkId(binding.providerSourceLinkId)}
              >
                <span className="font-medium">{binding.providerIdentity}</span>
                <span className="mt-0.5 block font-mono text-muted-foreground">
                  {binding.providerSourceLinkId}
                </span>
                <span className="mt-1 block text-muted-foreground">
                  {t('master.intelligence.pdi.bindings.linkStatus' as never)}:{' '}
                  {status === 'ACTIVE' || status === 'INACTIVE' || status === 'UNKNOWN'
                    ? t(`master.intelligence.pdi.bindings.status.${status}` as never)
                    : status}
                </span>
                {attribution.scopeKnown ? (
                  <>
                    <span className="mt-0.5 block font-mono text-muted-foreground">
                      {t('master.intelligence.pdi.bindings.vehicleScope' as never)}:{' '}
                      {attribution.vehicleId}
                    </span>
                    <span className="block font-mono text-muted-foreground">
                      {t('master.intelligence.pdi.bindings.orgScope' as never)}:{' '}
                      {attribution.organizationId}
                    </span>
                  </>
                ) : (
                  <span className="mt-0.5 block text-muted-foreground">
                    {t('master.intelligence.pdi.bindings.scopeUnknown' as never)}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
