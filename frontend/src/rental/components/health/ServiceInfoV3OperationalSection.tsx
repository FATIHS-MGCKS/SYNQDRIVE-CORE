import { useLanguage, type TranslationKey } from '../../../i18n/LanguageContext';
import { Icon } from '../ui/Icon';
import type { ServiceInfoStatus } from '../../../lib/api';
import { ComplianceTaskActions } from '../ComplianceTaskActions';

export type ServiceAutoTaskRow = {
  id: string;
  title: string;
  priority: string;
};

export function ServiceInfoV3OperationalSection({
  vehicleId,
  taskSignals,
  autoTasks,
  className = '',
}: {
  vehicleId: string | null | undefined;
  taskSignals?: ServiceInfoStatus['taskSignals'];
  autoTasks: ServiceAutoTaskRow[];
  className?: string;
}) {
  const { t } = useLanguage();
  const hasSignals = Boolean(vehicleId && taskSignals && taskSignals.length > 0);
  const hasAuto = autoTasks.length > 0;
  if (!hasSignals && !hasAuto) return null;

  return (
    <section className={`min-w-0 space-y-3 ${className}`} data-testid="service-info-v3-operational">
      {hasSignals ? (
        <div className="surface-solid min-w-0 rounded-xl border border-border p-3.5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {t('health.tasksAndSuggestions' as TranslationKey)}
          </p>
          <div className="mt-2">
            <ComplianceTaskActions vehicleId={vehicleId!} signals={taskSignals!} />
          </div>
        </div>
      ) : null}

      {hasAuto ? (
        <div className="surface-solid min-w-0 rounded-xl border border-border p-3.5">
          <div className="mb-2 flex items-center gap-2">
            <Icon name="list-todo" className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
            <p className="text-xs font-semibold text-foreground">
              {t('health.serviceInfo.v3.autoTasks.title', { count: autoTasks.length })}
            </p>
          </div>
          <ul className="space-y-1.5">
            {autoTasks.map((row) => (
              <li key={row.id} className="flex min-w-0 items-center justify-between gap-3">
                <span className="truncate text-xs text-foreground">{row.title}</span>
                <span
                  className={`shrink-0 rounded-md border px-1.5 py-0.5 text-[9px] font-semibold ${
                    row.priority === 'URGENT'
                      ? 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300'
                      : 'border-border bg-muted/50 text-muted-foreground'
                  }`}
                >
                  {row.priority === 'URGENT'
                    ? t('health.serviceInfo.v3.autoTasks.priorityUrgent')
                    : t('health.serviceInfo.v3.autoTasks.prioritySoon')}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2.5 text-[10px] leading-relaxed text-muted-foreground">
            {t('health.taskManagementHint' as TranslationKey)}
          </p>
        </div>
      ) : null}
    </section>
  );
}
