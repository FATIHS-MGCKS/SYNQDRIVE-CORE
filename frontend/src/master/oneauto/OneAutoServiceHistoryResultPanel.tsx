import { useLanguage } from '../../i18n/LanguageContext';
import type { OneAutoJobResultResponse } from './oneauto-api.types';
import { parseServiceHistoryFromJobResult } from './oneauto-service-history-result.util';

type Props = {
  result: OneAutoJobResultResponse;
};

export function OneAutoServiceHistoryResultPanel({ result }: Props) {
  const { t } = useLanguage();
  const parsed = parseServiceHistoryFromJobResult(result);

  return (
    <div className="space-y-3" data-testid="oneauto-service-history-panel">
      <p className="text-sm font-semibold">{t('master.oneAuto.serviceHistory.title' as never)}</p>
      <p className="text-xs text-muted-foreground">
        {t('master.oneAuto.serviceHistory.providerSource' as never)}: One Auto ·{' '}
        {parsed.providerStatus ?? '—'}
      </p>
      {parsed.verifiedEmptyHistory ? (
        <p className="text-sm text-muted-foreground" data-testid="oneauto-service-history-empty">
          {t('master.oneAuto.serviceHistory.empty' as never)}
        </p>
      ) : parsed.events.length === 0 ? (
        <p className="text-sm text-muted-foreground" data-testid="oneauto-service-history-unstructured">
          {t('master.oneAuto.resultFallback' as never)}
        </p>
      ) : (
        <ul className="space-y-3">
          {parsed.events.map((event, index) => (
            <li
              key={`${event.dateOfService ?? 'na'}-${index}`}
              className="rounded-lg border border-border p-3 text-sm space-y-1"
              data-testid="oneauto-service-history-event"
            >
              <p className="font-medium">
                {event.dateOfService ?? t('master.oneAuto.serviceHistory.unknownDate' as never)}
              </p>
              {event.mileageLabel ? (
                <p className="text-muted-foreground">
                  {t('master.oneAuto.serviceHistory.columns.mileage' as never)}: {event.mileageLabel}
                </p>
              ) : null}
              {event.workshop ? (
                <p className="text-muted-foreground">
                  {t('master.oneAuto.serviceHistory.columns.workshop' as never)}: {event.workshop}
                </p>
              ) : null}
              {event.serviceType ? (
                <p className="text-muted-foreground">
                  {t('master.oneAuto.serviceHistory.columns.type' as never)}: {event.serviceType}
                </p>
              ) : null}
              {event.serviceActions.length > 0 ? (
                <p className="text-muted-foreground">
                  {t('master.oneAuto.serviceHistory.columns.actions' as never)}:{' '}
                  {event.serviceActions.join(' · ')}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
