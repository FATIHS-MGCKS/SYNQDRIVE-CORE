import { useCallback, useMemo, useState } from 'react';
import { ChevronDown, ChevronsDownUp, ChevronsUpDown, Search } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../../components/ui/collapsible';
import { Input } from '../../components/ui/input';
import { Button } from '../../components/ui/button';
import { useLanguage } from '../../i18n/LanguageContext';
import type { OneAutoJobResultResponse } from './oneauto-api.types';
import {
  parseServiceScheduleFromJobResult,
  type ParsedScheduleService,
} from './oneauto-service-schedule-result.util';

type Props = {
  result: OneAutoJobResultResponse;
  /** Vehicle display name from dialog context (optional). */
  vehicleLabel?: string;
};

function normalizeSearch(s: string): string {
  return s.trim().toLowerCase();
}

function serviceMatchesSearch(service: ParsedScheduleService, q: string): boolean {
  if (!q) return true;
  const hay = [service.description, service.serviceId, service.intervalLabel]
    .filter(Boolean)
    .map((x) => String(x).toLowerCase())
    .join(' ');
  return hay.includes(q);
}

function DetailRow({
  label,
  value,
  emptyLabel,
  showEmpty,
}: {
  label: string;
  value: string | null;
  emptyLabel: string;
  showEmpty?: boolean;
}) {
  const isEmpty = value == null || value === '';
  if (isEmpty && !showEmpty) return null;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,8rem)_1fr] gap-x-3 gap-y-1 text-xs border-b border-border/60 pb-2 last:border-0 last:pb-0">
      <dt className="text-muted-foreground shrink-0">{label}</dt>
      <dd className="text-foreground break-words min-w-0">{isEmpty ? <span className="text-muted-foreground">{emptyLabel}</span> : value}</dd>
    </div>
  );
}

function ServiceAccordion({
  service,
  section,
  index,
  itemKey,
  open,
  onOpenChange,
}: {
  service: ParsedScheduleService;
  section: 'normal' | 'extra';
  index: number;
  itemKey: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useLanguage();
  const emptyStr = t('master.oneAuto.serviceSchedule.detail.notProvided');
  const headerId = `oneauto-schedule-${section}-${index}-header`;
  const contentId = `oneauto-schedule-${section}-${index}-content`;

  const title =
    service.description?.trim() ||
    service.serviceId ||
    t('master.oneAuto.serviceSchedule.fallbackItemTitle', { index: index + 1 });

  const intervalBits: string[] = [];
  if (service.serviceMonths != null) {
    intervalBits.push(`${t('master.oneAuto.serviceSchedule.detail.months')} ${service.serviceMonths}`);
  }
  if (service.serviceKms != null) {
    intervalBits.push(`${t('master.oneAuto.serviceSchedule.detail.km')} ${service.serviceKms}`);
  }
  if (service.serviceMiles != null) {
    intervalBits.push(`${t('master.oneAuto.serviceSchedule.detail.miles')} ${service.serviceMiles}`);
  }
  const intervalSummary = intervalBits.length > 0 ? intervalBits.join(' · ') : null;

  return (
    <Collapsible open={open} onOpenChange={onOpenChange} className="rounded-lg border border-border bg-card/30">
      <CollapsibleTrigger
        type="button"
        id={headerId}
        data-oneauto-schedule-trigger={itemKey}
        aria-controls={contentId}
        className="flex w-full items-start gap-2 px-3 py-3 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg"
      >
        <ChevronDown
          className={`mt-0.5 h-4 w-4 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden
        />
        <span className="min-w-0 flex-1 space-y-1">
          <span className="block font-medium break-words">{title}</span>
          {service.intervalLabel ? (
            <span className="block text-xs text-muted-foreground break-words">{service.intervalLabel}</span>
          ) : null}
          {intervalSummary ? (
            <span className="block text-[11px] text-muted-foreground break-words">{intervalSummary}</span>
          ) : null}
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent id={contentId} className="px-3 pb-3 pt-0 space-y-3" role="region" aria-labelledby={headerId}>
        <section className="space-y-2" aria-label={t('master.oneAuto.serviceSchedule.detail.intervalsHeading')}>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {t('master.oneAuto.serviceSchedule.detail.intervalsHeading')}
          </p>
          <dl className="space-y-2">
            <DetailRow
              label={t('master.oneAuto.serviceSchedule.columns.interval')}
              value={service.intervalLabel}
              emptyLabel={emptyStr}
              showEmpty
            />
            <DetailRow
              label={t('master.oneAuto.serviceSchedule.detail.months')}
              value={service.serviceMonths != null ? String(service.serviceMonths) : null}
              emptyLabel={emptyStr}
              showEmpty
            />
            <DetailRow
              label={t('master.oneAuto.serviceSchedule.detail.km')}
              value={service.serviceKms != null ? String(service.serviceKms) : null}
              emptyLabel={emptyStr}
              showEmpty
            />
            <DetailRow
              label={t('master.oneAuto.serviceSchedule.detail.miles')}
              value={service.serviceMiles != null ? String(service.serviceMiles) : null}
              emptyLabel={emptyStr}
              showEmpty
            />
          </dl>
        </section>

        <section className="space-y-2" aria-label={t('master.oneAuto.serviceSchedule.section.tasks')}>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {t('master.oneAuto.serviceSchedule.section.tasks')}
          </p>
          {service.tasks.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t('master.oneAuto.serviceSchedule.detail.noTasks')}</p>
          ) : (
            <ul className="space-y-2">
              {service.tasks.map((task, taskIndex) => (
                <li
                  key={`${task.taskId ?? taskIndex}`}
                  className="rounded-md border border-border/70 bg-muted/20 p-2 text-xs space-y-1"
                >
                  <DetailRow
                    label={t('master.oneAuto.serviceSchedule.detail.taskAction')}
                    value={task.action}
                    emptyLabel={emptyStr}
                    showEmpty
                  />
                  <DetailRow
                    label={t('master.oneAuto.serviceSchedule.detail.taskDescription')}
                    value={task.description}
                    emptyLabel={emptyStr}
                    showEmpty
                  />
                  <DetailRow
                    label={t('master.oneAuto.serviceSchedule.detail.vehiclePosition')}
                    value={task.vehiclePosition}
                    emptyLabel={emptyStr}
                    showEmpty
                  />
                  <DetailRow
                    label={t('master.oneAuto.serviceSchedule.detail.taskId')}
                    value={task.taskId}
                    emptyLabel={emptyStr}
                    showEmpty
                  />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-2" aria-label={t('master.oneAuto.serviceSchedule.section.parts')}>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {t('master.oneAuto.serviceSchedule.section.parts')}
          </p>
          {service.parts.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t('master.oneAuto.serviceSchedule.detail.noParts')}</p>
          ) : (
            <ul className="space-y-2">
              {service.parts.map((part, partIndex) => (
                <li
                  key={`${part.partNumber ?? part.oePartNumber ?? partIndex}`}
                  className="rounded-md border border-border/70 bg-muted/20 p-2 text-xs space-y-1"
                >
                  <DetailRow
                    label={t('master.oneAuto.serviceSchedule.detail.partDesc')}
                    value={part.description}
                    emptyLabel={emptyStr}
                    showEmpty
                  />
                  <DetailRow
                    label={t('master.oneAuto.serviceSchedule.detail.partNumber')}
                    value={part.partNumber}
                    emptyLabel={emptyStr}
                    showEmpty
                  />
                  <DetailRow
                    label={t('master.oneAuto.serviceSchedule.detail.oePartNumber')}
                    value={part.oePartNumber}
                    emptyLabel={emptyStr}
                    showEmpty
                  />
                  <DetailRow
                    label={t('master.oneAuto.serviceSchedule.detail.supplier')}
                    value={part.supplier}
                    emptyLabel={emptyStr}
                    showEmpty
                  />
                  <DetailRow
                    label={t('master.oneAuto.serviceSchedule.detail.partGrade')}
                    value={part.grade}
                    emptyLabel={emptyStr}
                    showEmpty
                  />
                  {part.attributes.length > 0 ? (
                    <div className="pt-1">
                      <p className="text-[11px] text-muted-foreground mb-1">
                        {t('master.oneAuto.serviceSchedule.detail.partAttributes')}
                      </p>
                      <ul className="list-disc pl-4 space-y-0.5">
                        {part.attributes.map((a) => (
                          <li key={`${a.name}-${a.value}`}>
                            <span className="font-mono text-[11px] break-all">{a.name}</span>
                            {': '}
                            <span className="break-words">{a.value}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>

        {service.workTimeHours != null ? (
          <p className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{t('master.oneAuto.serviceSchedule.section.workTime')}: </span>
            {service.workTimeHours}
            {t('master.oneAuto.serviceSchedule.hoursUnit')}
          </p>
        ) : null}

        <DetailRow label={t('master.oneAuto.serviceSchedule.detail.serviceId')} value={service.serviceId} emptyLabel={emptyStr} showEmpty />
      </CollapsibleContent>
    </Collapsible>
  );
}

function ServiceSection({
  title,
  countLabel,
  services,
  section,
  search,
  openMap,
  setOpenForKey,
}: {
  title: string;
  countLabel: string;
  services: ParsedScheduleService[];
  section: 'normal' | 'extra';
  search: string;
  openMap: Record<string, boolean>;
  setOpenForKey: (key: string, open: boolean) => void;
}) {
  const { t } = useLanguage();
  const q = normalizeSearch(search);
  const indexed = useMemo(() => {
    return services.map((service, index) => ({ service, index }));
  }, [services]);
  const filtered = useMemo(
    () => indexed.filter(({ service }) => serviceMatchesSearch(service, q)),
    [indexed, q],
  );

  return (
    <section className="space-y-2" aria-labelledby={`oneauto-schedule-section-${section}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold" id={`oneauto-schedule-section-${section}`}>
          {title}
        </h3>
        <p className="text-xs text-muted-foreground" data-testid={`oneauto-schedule-section-count-${section}`}>
          {countLabel}: {filtered.length}
          {q && filtered.length !== services.length
            ? ` ${t('master.oneAuto.serviceSchedule.search.ofTotal', { total: services.length })}`
            : null}
        </p>
      </div>
      {filtered.length === 0 ? (
        <p className="text-xs text-muted-foreground py-2">
          {q ? t('master.oneAuto.serviceSchedule.search.noMatch') : t('master.oneAuto.serviceSchedule.sectionEmpty')}
        </p>
      ) : (
        <ul className="space-y-2" data-testid={`oneauto-schedule-${section}-list`}>
          {filtered.map(({ service, index: origIndex }) => {
            const itemKey = `${section}-${origIndex}`;
            return (
              <li key={itemKey}>
                <ServiceAccordion
                  service={service}
                  section={section}
                  index={origIndex}
                  itemKey={itemKey}
                  open={openMap[itemKey] ?? false}
                  onOpenChange={(next) => setOpenForKey(itemKey, next)}
                />
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export function OneAutoServiceScheduleResultPanel({ result, vehicleLabel }: Props) {
  const { t } = useLanguage();
  const parsed = parseServiceScheduleFromJobResult(result);
  const [search, setSearch] = useState('');
  const [openMap, setOpenMap] = useState<Record<string, boolean>>({});

  const q = normalizeSearch(search);
  const visibleKeys = useMemo(() => {
    const keys: string[] = [];
    parsed.normalServices.forEach((service, i) => {
      if (serviceMatchesSearch(service, q)) keys.push(`normal-${i}`);
    });
    parsed.extraServices.forEach((service, i) => {
      if (serviceMatchesSearch(service, q)) keys.push(`extra-${i}`);
    });
    return keys;
  }, [parsed.normalServices, parsed.extraServices, q]);

  const setOpenForKey = useCallback((key: string, open: boolean) => {
    setOpenMap((prev) => ({ ...prev, [key]: open }));
  }, []);

  const expandAll = useCallback(() => {
    setOpenMap((prev) => {
      const next = { ...prev };
      for (const k of visibleKeys) next[k] = true;
      return next;
    });
  }, [visibleKeys]);

  const collapseAll = useCallback(() => {
    setOpenMap((prev) => {
      const next = { ...prev };
      for (const k of visibleKeys) next[k] = false;
      return next;
    });
  }, [visibleKeys]);

  const totalPositions =
    parsed.integrity === 'VALID_WITH_SERVICES'
      ? parsed.normalServices.length + parsed.extraServices.length
      : 0;

  const integrityMessage = (() => {
    switch (parsed.integrity) {
      case 'VIN_MISMATCH':
        return t('master.oneAuto.serviceSchedule.integrity.vinMismatch');
      case 'MALFORMED_OR_PARTIAL':
        return t('master.oneAuto.serviceSchedule.integrity.malformed');
      case 'RESPONSE_UNAVAILABLE':
        return t('master.oneAuto.serviceSchedule.integrity.unavailable');
      case 'VALID_EMPTY':
        return t('master.oneAuto.serviceSchedule.empty');
      default:
        return null;
    }
  })();

  return (
    <div className="space-y-4" data-testid="oneauto-service-schedule-panel">
      <div className="space-y-1">
        <p className="text-base font-semibold">{t('master.oneAuto.serviceSchedule.manualTitle')}</p>
        <p className="text-xs text-muted-foreground">{t('master.oneAuto.serviceSchedule.readOnlyReference')}</p>
      </div>

      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <div className="sm:col-span-2">
          <dt className="text-muted-foreground text-xs">{t('master.oneAuto.serviceSchedule.header.vehicle')}</dt>
          <dd className="font-medium break-words">{[vehicleLabel, result.job.vinSnapshot].filter(Boolean).join(' · ')}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-xs">{t('master.oneAuto.serviceSchedule.header.planType')}</dt>
          <dd>{t('master.oneAuto.serviceSchedule.header.manufacturerPlan')}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-xs">{t('master.oneAuto.serviceSchedule.header.provider')}</dt>
          <dd>{t('master.oneAuto.serviceSchedule.providerDisplayName')}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-xs">{t('master.oneAuto.serviceSchedule.header.retrieved')}</dt>
          <dd>
            {result.latestResponse?.fetchedAt ? new Date(result.latestResponse.fetchedAt).toLocaleString() : '—'}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-xs">{t('master.oneAuto.serviceSchedule.providerSource')}</dt>
          <dd>HTTP {parsed.providerStatus ?? '—'}</dd>
        </div>
      </dl>

      {parsed.integrity === 'VALID_WITH_SERVICES' ? (
        <>
          <div className="flex flex-wrap gap-3 text-sm">
            <div className="rounded-lg border border-border px-3 py-2 min-w-[10rem]">
              <p className="text-xs text-muted-foreground">{t('master.oneAuto.serviceSchedule.summary.normal')}</p>
              <p className="text-lg font-semibold tabular-nums" data-testid="oneauto-schedule-count-normal">
                {parsed.normalServices.length}
              </p>
            </div>
            <div className="rounded-lg border border-border px-3 py-2 min-w-[10rem]">
              <p className="text-xs text-muted-foreground">{t('master.oneAuto.serviceSchedule.summary.extra')}</p>
              <p className="text-lg font-semibold tabular-nums" data-testid="oneauto-schedule-count-extra">
                {parsed.extraServices.length}
              </p>
            </div>
            <div className="rounded-lg border border-border px-3 py-2 min-w-[10rem]">
              <p className="text-xs text-muted-foreground">{t('master.oneAuto.serviceSchedule.summary.total')}</p>
              <p className="text-lg font-semibold tabular-nums" data-testid="oneauto-schedule-count-total">
                {totalPositions}
              </p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
            <div className="relative flex-1 min-w-0">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('master.oneAuto.serviceSchedule.search.placeholder')}
                className="pl-9"
                data-testid="oneauto-schedule-search"
                aria-label={t('master.oneAuto.serviceSchedule.search.placeholder')}
              />
            </div>
            <div className="flex gap-2 shrink-0">
              <Button type="button" variant="outline" size="sm" onClick={expandAll} data-testid="oneauto-schedule-expand-all">
                <ChevronsDownUp className="h-4 w-4 mr-1" aria-hidden />
                {t('master.oneAuto.serviceSchedule.expandAll')}
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={collapseAll} data-testid="oneauto-schedule-collapse-all">
                <ChevronsUpDown className="h-4 w-4 mr-1" aria-hidden />
                {t('master.oneAuto.serviceSchedule.collapseAll')}
              </Button>
            </div>
          </div>

          <div className="space-y-6">
            <ServiceSection
              title={t('master.oneAuto.serviceSchedule.section.normal')}
              countLabel={t('master.oneAuto.serviceSchedule.entries')}
              services={parsed.normalServices}
              section="normal"
              search={search}
              openMap={openMap}
              setOpenForKey={setOpenForKey}
            />
            <ServiceSection
              title={t('master.oneAuto.serviceSchedule.section.extra')}
              countLabel={t('master.oneAuto.serviceSchedule.entries')}
              services={parsed.extraServices}
              section="extra"
              search={search}
              openMap={openMap}
              setOpenForKey={setOpenForKey}
            />
          </div>

          <p className="text-[11px] text-muted-foreground border-t border-border pt-3">
            {t('master.oneAuto.serviceSchedule.notCompletedHistory')}
          </p>
        </>
      ) : (
        <p className="text-sm text-muted-foreground" data-testid={`oneauto-service-schedule-integrity-${parsed.integrity}`}>
          {integrityMessage}
        </p>
      )}
    </div>
  );
}
