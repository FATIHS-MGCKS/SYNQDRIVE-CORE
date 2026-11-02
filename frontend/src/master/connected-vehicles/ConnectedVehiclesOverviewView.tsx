import { AlertTriangle } from 'lucide-react';
import { MetricCard, StatusChip } from '../../components/patterns';
import { Button } from '../../components/ui/button';
import { ErrorState, SkeletonCard } from '../../components/patterns/states';
import { useLanguage } from '../../i18n/LanguageContext';
import { attentionSeverityTone } from './cv.utils';
import { CvTelemetryChip } from './ConnectedVehicleStatusChips';
import type { VehiclesOperationalOverviewDto } from './types';

interface ConnectedVehiclesOverviewViewProps {
  overview: VehiclesOperationalOverviewDto | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onGoVehicles: (filters?: Record<string, string>) => void;
  onOpenVehicle: (vehicleId: string | null, dimoVehicleId: string | null) => void;
  onGoPlatformHealth: () => void;
}

const TELEMETRY_ORDER = ['live', 'standby', 'signal_delayed', 'offline', 'no_signal'] as const;

export function ConnectedVehiclesOverviewView({
  overview,
  loading,
  error,
  onRetry,
  onGoVehicles,
  onOpenVehicle,
  onGoPlatformHealth,
}: ConnectedVehiclesOverviewViewProps) {
  const { t } = useLanguage();

  const TELEMETRY_LABELS: Record<string, string> = {
    live: 'Live',
    standby: 'Standby',
    signal_delayed: t('master.cv.overview.telemetrySignalDelayed'),
    offline: 'Offline',
    no_signal: t('master.cv.overview.telemetryNoSignal'),
  };

  if (loading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3" data-testid="cv-overview-loading">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    );
  }

  if (error || !overview) {
    return (
      <ErrorState
        title={t('master.cv.overview.unavailableTitle')}
        description={error ?? undefined}
        onRetry={onRetry}
      />
    );
  }

  const lifecycleHint =
    overview.counts.registeredAll > overview.counts.registered
      ? t('master.cv.overview.registeredAllHint', {
          total: overview.counts.registeredAll,
          offboarded: overview.counts.registeredOffboarded,
          archived: overview.counts.registeredArchived,
        })
      : null;

  return (
    <div className="space-y-5" data-testid="cv-overview">
      {overview.platformDimoDegraded ? (
        <div
          className="surface-premium border border-[color:var(--status-critical)]/30 p-4 flex flex-col sm:flex-row sm:items-center gap-3"
          role="alert"
        >
          <div className="flex items-start gap-3 min-w-0">
            <AlertTriangle className="h-5 w-5 text-[color:var(--status-critical)] shrink-0 mt-0.5" aria-hidden />
            <div>
              <p className="font-semibold text-foreground">
                {t('master.cv.overview.platformDimoDegradedTitle')}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                {overview.platformDimoMessage ?? t('master.cv.overview.platformDimoDegradedBody')}
              </p>
            </div>
          </div>
          <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={onGoPlatformHealth}>
            {t('master.cv.overview.openPlatformHealth')}
          </Button>
        </div>
      ) : null}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <button
          type="button"
          className="text-left"
          onClick={() => onGoVehicles({ cvRegistrationState: 'registered', cvRegistryLifecycle: 'ACTIVE' })}
        >
          <MetricCard
            label={t('master.cv.overview.registeredActive')}
            value={String(overview.counts.registered)}
            valueSize="compact"
            hint={lifecycleHint ?? undefined}
          />
        </button>
        <button type="button" className="text-left" onClick={() => onGoVehicles({ cvRegistrationState: 'unregistered' })}>
          <MetricCard
            label={t('master.cv.overview.unregistered')}
            value={String(overview.counts.unregistered)}
            valueSize="compact"
          />
        </button>
        <button type="button" className="text-left" onClick={() => onGoVehicles({ cvAttention: 'true' })}>
          <MetricCard
            label={t('master.cv.overview.withAttention')}
            value={String(overview.counts.withAttention)}
            status={overview.counts.withAttention > 0 ? 'warning' : undefined}
            valueSize="compact"
          />
        </button>
        <MetricCard
          label={t('master.cv.overview.dimoLinked')}
          value={String(overview.counts.dimoLinked)}
          valueSize="compact"
        />
      </div>

      <div className="surface-premium p-5 space-y-4">
        <h3 className="text-sm font-semibold text-foreground">
          {t('master.cv.overview.telemetryDistribution')}
        </h3>
        <div className="flex flex-wrap gap-2">
          {TELEMETRY_ORDER.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => onGoVehicles({ cvTelemetry: key })}
              className="inline-flex"
            >
              <CvTelemetryChip
                label={`${TELEMETRY_LABELS[key]} (${overview.freshness[key] ?? 0})`}
                freshness={key}
              />
            </button>
          ))}
        </div>
      </div>

      <div className="surface-premium p-5 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-foreground">{t('master.cv.overview.attentionQueue')}</h3>
          <Button type="button" variant="ghost" size="sm" onClick={() => onGoVehicles({ cvAttention: 'true' })}>
            {t('master.cv.overview.showAll')}
          </Button>
        </div>
        {overview.attentionQueue.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('master.cv.overview.noAttention')}</p>
        ) : (
          <ul className="space-y-2">
            {overview.attentionQueue.map((item) => (
              <li key={item.code}>
                <button
                  type="button"
                  className="w-full text-left rounded-xl border border-border p-3 hover:bg-muted/40 transition-colors"
                  onClick={() => {
                    if (item.sampleVehicleId || item.sampleDimoVehicleId) {
                      onOpenVehicle(item.sampleVehicleId, item.sampleDimoVehicleId);
                    } else {
                      onGoVehicles({ cvAttention: 'true' });
                    }
                  }}
                >
                  <div className="flex flex-wrap items-center gap-2 justify-between">
                    <StatusChip tone={attentionSeverityTone(item.severity)} dot>
                      {item.reason}
                    </StatusChip>
                    <span className="text-xs text-muted-foreground">{item.vehicleCount}</span>
                  </div>
                  {item.sampleOrganizationName ? (
                    <p className="text-xs text-muted-foreground mt-1">{item.sampleOrganizationName}</p>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
