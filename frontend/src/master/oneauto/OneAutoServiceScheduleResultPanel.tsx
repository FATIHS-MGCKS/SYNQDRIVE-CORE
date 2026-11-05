import { useLanguage } from '../../i18n/LanguageContext';
import type { OneAutoJobResultResponse } from './oneauto-api.types';
import {
  parseServiceScheduleFromJobResult,
  type ParsedScheduleService,
} from './oneauto-service-schedule-result.util';

type Props = {
  result: OneAutoJobResultResponse;
};

function ServiceBlock({ service, index }: { service: ParsedScheduleService; index: number }) {
  const { t } = useLanguage();
  return (
    <li
      className="rounded-lg border border-border p-3 text-sm space-y-2"
      data-testid="oneauto-service-schedule-item"
    >
      <p className="font-medium">
        {service.description ?? service.serviceId ?? `#${index + 1}`}
      </p>
      {service.intervalLabel ? (
        <p className="text-muted-foreground">
          {t('master.oneAuto.serviceSchedule.columns.interval' as never)}: {service.intervalLabel}
        </p>
      ) : null}
      {service.workTimeHours != null ? (
        <p className="text-muted-foreground">
          {t('master.oneAuto.serviceSchedule.section.workTime' as never)}: {service.workTimeHours}
          {t('master.oneAuto.serviceSchedule.hoursUnit' as never)}
        </p>
      ) : null}
      {service.tasks.length > 0 ? (
        <div>
          <p className="text-xs font-semibold text-muted-foreground">
            {t('master.oneAuto.serviceSchedule.section.tasks' as never)}
          </p>
          <ul className="list-disc pl-4 space-y-1">
            {service.tasks.map((task, taskIndex) => (
              <li key={`${task.taskId ?? taskIndex}`}>
                {[task.action, task.description, task.vehiclePosition].filter(Boolean).join(' · ')}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {service.parts.length > 0 ? (
        <div>
          <p className="text-xs font-semibold text-muted-foreground">
            {t('master.oneAuto.serviceSchedule.section.parts' as never)}
          </p>
          <ul className="list-disc pl-4 space-y-1">
            {service.parts.map((part, partIndex) => (
              <li key={`${part.partNumber ?? partIndex}`}>
                {[part.description, part.oePartNumber, part.supplier, part.grade]
                  .filter(Boolean)
                  .join(' · ')}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </li>
  );
}

export function OneAutoServiceScheduleResultPanel({ result }: Props) {
  const { t } = useLanguage();
  const parsed = parseServiceScheduleFromJobResult(result);

  const integrityMessage = (() => {
    switch (parsed.integrity) {
      case 'VIN_MISMATCH':
        return t('master.oneAuto.serviceSchedule.integrity.vinMismatch' as never);
      case 'MALFORMED_OR_PARTIAL':
        return t('master.oneAuto.serviceSchedule.integrity.malformed' as never);
      case 'RESPONSE_UNAVAILABLE':
        return t('master.oneAuto.serviceSchedule.integrity.unavailable' as never);
      case 'VALID_EMPTY':
        return t('master.oneAuto.serviceSchedule.empty' as never);
      default:
        return null;
    }
  })();

  return (
    <div className="space-y-3" data-testid="oneauto-service-schedule-panel">
      <p className="text-sm font-semibold">{t('master.oneAuto.serviceSchedule.title' as never)}</p>
      <p className="text-xs text-muted-foreground">
        {t('master.oneAuto.serviceSchedule.providerSource' as never)}: One Auto ·{' '}
        {parsed.providerStatus ?? '—'}
      </p>
      {parsed.integrity !== 'VALID_WITH_SERVICES' ? (
        <p
          className="text-sm text-muted-foreground"
          data-testid={`oneauto-service-schedule-integrity-${parsed.integrity}`}
        >
          {integrityMessage}
        </p>
      ) : (
        <div className="space-y-4">
          {parsed.normalServices.length > 0 ? (
            <section>
              <p className="text-xs font-semibold mb-2">
                {t('master.oneAuto.serviceSchedule.section.normal' as never)}
              </p>
              <ul className="space-y-3">
                {parsed.normalServices.map((service, index) => (
                  <ServiceBlock key={`n-${service.serviceId ?? index}`} service={service} index={index} />
                ))}
              </ul>
            </section>
          ) : null}
          {parsed.extraServices.length > 0 ? (
            <section>
              <p className="text-xs font-semibold mb-2">
                {t('master.oneAuto.serviceSchedule.section.extra' as never)}
              </p>
              <ul className="space-y-3">
                {parsed.extraServices.map((service, index) => (
                  <ServiceBlock key={`e-${service.serviceId ?? index}`} service={service} index={index} />
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      )}
    </div>
  );
}
