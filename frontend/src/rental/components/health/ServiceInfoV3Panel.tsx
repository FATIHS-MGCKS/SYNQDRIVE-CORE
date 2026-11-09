import { useId, useState, type HTMLAttributes, type ReactNode } from 'react';
import type { ServiceInfoStatus } from '../../../lib/api';
import { useLanguage, type TranslationKey } from '../../../i18n/LanguageContext';
import { ServiceMaintenanceForecastPanel } from './ServiceMaintenanceForecastPanel';
import { ServiceHistoryTimeline } from './ServiceHistoryTimeline';

export type ServiceInfoV3Tab = 'overview' | 'plan' | 'history';

const TAB_KEYS: Record<ServiceInfoV3Tab, TranslationKey> = {
  overview: 'health.serviceInfo.v3.nav.overview',
  plan: 'health.serviceInfo.v3.nav.plan',
  history: 'health.serviceInfo.v3.nav.history',
};

export interface ServiceInfoV3PanelProps {
  serviceInfo: ServiceInfoStatus | null | undefined;
  loading: boolean;
  error: boolean;
  vehicleId: string | null | undefined;
  orgId: string | null | undefined;
  onUploadProof?: () => void;
  onChanged?: () => void | Promise<void>;
  onRetryServiceInfo?: () => void;
  className?: string;
  defaultTab?: ServiceInfoV3Tab;
}

export function ServiceInfoV3Panel({
  serviceInfo,
  loading,
  error,
  vehicleId,
  orgId,
  onUploadProof,
  onChanged,
  onRetryServiceInfo,
  className = '',
  defaultTab = 'overview',
}: ServiceInfoV3PanelProps) {
  const { t } = useLanguage();
  const baseId = useId().replace(/:/g, '');
  const [tab, setTab] = useState<ServiceInfoV3Tab>(defaultTab);

  const tabs: ServiceInfoV3Tab[] = ['overview', 'plan', 'history'];

  return (
    <div className={`min-w-0 ${className}`} data-testid="service-info-v3-panel">
      <div className="mb-4 min-w-0 border-b border-border">
        <div
          role="tablist"
          aria-label={t('health.serviceInfo.v3.nav.label')}
          className="-mb-px flex min-w-0 flex-wrap gap-1"
        >
          {tabs.map((id) => {
            const selected = tab === id;
            return (
              <button
                key={id}
                type="button"
                role="tab"
                id={`${baseId}-tab-${id}`}
                aria-selected={selected}
                aria-controls={`${baseId}-panel-${id}`}
                tabIndex={selected ? 0 : -1}
                onClick={() => setTab(id)}
                className={`min-h-9 shrink-0 rounded-t-md border px-3 py-2 text-xs font-semibold transition-colors ${
                  selected
                    ? 'border-border border-b-background bg-background text-foreground'
                    : 'border-transparent text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                }`}
              >
                {t(TAB_KEYS[id])}
              </button>
            );
          })}
        </div>
      </div>

      <div
        role="tabpanel"
        id={`${baseId}-panel-${tab}`}
        aria-labelledby={`${baseId}-tab-${tab}`}
        className="min-w-0"
      >
        {tab === 'history' ? (
          <ServiceHistoryTimeline
            vehicleId={vehicleId}
            initialItems={serviceInfo?.serviceHistory ?? []}
            initialNextCursor={serviceInfo?.serviceHistoryNextCursor}
            initialHasMore={serviceInfo?.serviceHistoryHasMore}
            loading={loading}
            error={error}
            onRetry={onRetryServiceInfo}
          />
        ) : (
          <ServiceMaintenanceForecastPanel
            surface={tab === 'overview' ? 'overview' : 'plan'}
            serviceInfo={serviceInfo}
            loading={loading}
            error={error}
            vehicleId={vehicleId}
            orgId={orgId}
            onUploadProof={onUploadProof}
            onChanged={onChanged}
          />
        )}
      </div>
    </div>
  );
}
