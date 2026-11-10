import { useCallback, useId, useRef, useState, type KeyboardEvent } from 'react';
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
  /** Invalidates paginated history when ServiceInfoStatus is re-fetched. */
  historySyncEpoch?: number;
  /** Modal hosts supply the primary page title externally. */
  presentation?: 'standalone' | 'modal';
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
  historySyncEpoch = 0,
  presentation = 'standalone',
  className = '',
  defaultTab = 'overview',
}: ServiceInfoV3PanelProps) {
  const showPageTitle = presentation !== 'modal';
  const { t } = useLanguage();
  const baseId = useId().replace(/:/g, '');
  const [tab, setTab] = useState<ServiceInfoV3Tab>(defaultTab);
  const tabRefs = useRef<Record<ServiceInfoV3Tab, HTMLButtonElement | null>>({
    overview: null,
    plan: null,
    history: null,
  });

  const tabs: ServiceInfoV3Tab[] = ['overview', 'plan', 'history'];

  const activateTab = useCallback((next: ServiceInfoV3Tab) => {
    setTab(next);
    queueMicrotask(() => tabRefs.current[next]?.focus());
  }, []);

  const onTabListKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      const currentIndex = tabs.indexOf(tab);
      if (currentIndex < 0) return;

      let nextIndex: number | null = null;
      switch (event.key) {
        case 'ArrowRight':
          nextIndex = (currentIndex + 1) % tabs.length;
          break;
        case 'ArrowLeft':
          nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
          break;
        case 'Home':
          nextIndex = 0;
          break;
        case 'End':
          nextIndex = tabs.length - 1;
          break;
        default:
          return;
      }
      event.preventDefault();
      activateTab(tabs[nextIndex]!);
    },
    [activateTab, tab, tabs],
  );

  return (
    <div className={`min-w-0 ${className}`} data-testid="service-info-v3-panel">
      <div className="mb-4 min-w-0 border-b border-border">
        <div
          role="tablist"
          aria-label={t('health.serviceInfo.v3.nav.label')}
          className="-mb-px flex min-w-0 flex-wrap gap-1"
          onKeyDown={onTabListKeyDown}
        >
          {tabs.map((id) => {
            const selected = tab === id;
            return (
              <button
                key={id}
                type="button"
                role="tab"
                ref={(el) => {
                  tabRefs.current[id] = el;
                }}
                id={`${baseId}-tab-${id}`}
                aria-selected={selected}
                aria-controls={`${baseId}-panel-${id}`}
                tabIndex={selected ? 0 : -1}
                onClick={() => activateTab(id)}
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

      {tabs.map((id) => (
        <div
          key={id}
          role="tabpanel"
          id={`${baseId}-panel-${id}`}
          aria-labelledby={`${baseId}-tab-${id}`}
          hidden={tab !== id}
          tabIndex={0}
          className={`min-w-0 outline-none ${tab === id ? '' : 'hidden'}`}
        >
          {id === 'history' ? (
            <ServiceHistoryTimeline
              vehicleId={vehicleId}
              initialItems={serviceInfo?.serviceHistory ?? []}
              initialNextCursor={serviceInfo?.serviceHistoryNextCursor}
              initialHasMore={serviceInfo?.serviceHistoryHasMore}
              loading={loading}
              error={error}
              onRetry={onRetryServiceInfo}
              historySyncEpoch={historySyncEpoch}
            />
          ) : (
            <ServiceMaintenanceForecastPanel
              surface={id === 'overview' ? 'overview' : 'plan'}
              showPageTitle={showPageTitle}
              serviceInfo={serviceInfo}
              loading={loading}
              error={error}
              vehicleId={vehicleId}
              orgId={orgId}
              onUploadProof={onUploadProof}
              onChanged={onChanged}
              onOpenPlanTab={id === 'overview' ? () => activateTab('plan') : undefined}
            />
          )}
        </div>
      ))}
    </div>
  );
}
