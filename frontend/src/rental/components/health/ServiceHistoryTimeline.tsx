import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { api } from '../../../lib/api';
import { useLanguage, type TranslationKey } from '../../../i18n/LanguageContext';
import { Icon } from '../ui/Icon';
import {
  formatServiceDate,
  formatServiceEventType,
  formatServiceKm,
  serviceHistoryDisclaimer,
} from '../../lib/service-info-display';
import {
  groupServiceHistoryByYear,
  mergeServiceHistoryPages,
  resolveServiceHistoryOriginKey,
  shouldShowExternalEvidenceLimitation,
  type ServiceHistoryItem,
} from './service-history-timeline.utils';

export interface ServiceHistoryTimelineProps {
  vehicleId: string | null | undefined;
  initialItems: ServiceHistoryItem[];
  initialNextCursor?: string | null;
  initialHasMore?: boolean;
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
  className?: string;
}

function formatOdometerLine(
  odometerKm: number | null,
  fmtLocale: string,
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string,
): string | null {
  if (odometerKm == null) return null;
  return t('health.serviceInfo.v2.value.km', { km: formatServiceKm(odometerKm, fmtLocale) });
}

function HistoryRowBody({
  item,
  fmtLocale,
  t,
  rowId,
  hasExpanded,
}: {
  item: ServiceHistoryItem;
  fmtLocale: string;
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
  rowId: string;
  hasExpanded: boolean;
}) {
  const originKey = resolveServiceHistoryOriginKey(item);
  const dateLabel = formatServiceDate(item.date, fmtLocale);
  const odometerLabel = formatOdometerLine(item.odometerKm, fmtLocale, t);
  const workshop = item.workshopName?.trim() ? item.workshopName.trim() : null;
  const metaParts = [dateLabel, odometerLabel, workshop].filter(Boolean);

  const summaryInner = (
    <>
      <div className="min-w-0 flex-1">
        <p className="break-words text-xs font-semibold text-foreground">{formatServiceEventType(item.eventType, t)}</p>
        {metaParts.length > 0 ? (
          <p className="mt-0.5 break-words text-[11px] leading-snug text-muted-foreground">{metaParts.join(' · ')}</p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-start gap-1.5">
        <span className="max-w-[7.5rem] truncate rounded-md border border-border bg-muted/30 px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground sm:max-w-[9rem]">
          {t(originKey)}
        </span>
        {hasExpanded ? (
          <Icon
            name="chevron-down"
            className="mt-0.5 h-3.5 w-3.5 text-muted-foreground transition-transform group-open:rotate-180"
            aria-hidden
          />
        ) : null}
      </div>
    </>
  );

  const detailBlock = (
    <div
      id={`${rowId}-detail`}
      className="space-y-1.5 border-t border-border px-3 pb-3 pt-2 text-[11px] leading-relaxed text-muted-foreground"
    >
      {item.performedActions && item.performedActions.length > 0 ? (
        <p className="break-words">
          <span className="font-medium text-foreground/90">
            {t('health.serviceInfo.v3.history.details.performedActions')}:
          </span>{' '}
          {item.performedActions.join(' · ')}
        </p>
      ) : null}
      {item.providerServiceType?.trim() ? (
        <p className="break-words">
          <span className="font-medium text-foreground/90">
            {t('health.serviceInfo.v3.history.details.providerType')}:
          </span>{' '}
          <span className="break-all">{item.providerServiceType}</span>
        </p>
      ) : null}
      {item.notes?.trim() ? (
        <p className="break-words">
          <span className="font-medium text-foreground/90">{t('health.serviceInfo.v3.history.details.notes')}:</span>{' '}
          {item.notes}
        </p>
      ) : null}
      {item.provider?.trim() ? (
        <p className="break-words">
          <span className="font-medium text-foreground/90">{t('health.serviceInfo.v3.history.details.provider')}:</span>{' '}
          <span className="break-all">{item.provider}</span>
        </p>
      ) : null}
      {shouldShowExternalEvidenceLimitation(item) ? (
        <p className="break-words text-muted-foreground/90">{t('health.serviceInfo.v3.history.details.externalLimitation')}</p>
      ) : null}
    </div>
  );

  if (!hasExpanded) {
    return (
      <div
        className="surface-solid flex min-h-11 items-start justify-between gap-2 rounded-lg border border-border bg-background/40 px-3 py-2.5"
        data-service-history-id={item.id}
      >
        {summaryInner}
      </div>
    );
  }

  return (
    <details
      className="group surface-solid min-w-0 rounded-lg border border-border bg-background/40 open:bg-background/70"
      data-service-history-id={item.id}
    >
      <summary className="flex min-h-11 cursor-pointer list-none items-start justify-between gap-2 px-3 py-2.5 marker:content-none [&::-webkit-details-marker]:hidden">
        {summaryInner}
      </summary>
      {detailBlock}
    </details>
  );
}

function HistoryRow(props: {
  item: ServiceHistoryItem;
  fmtLocale: string;
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
  rowId: string;
}) {
  const hasExpanded =
    (props.item.performedActions?.length ?? 0) > 0 ||
    Boolean(props.item.providerServiceType?.trim()) ||
    Boolean(props.item.notes?.trim()) ||
    Boolean(props.item.provider?.trim()) ||
    shouldShowExternalEvidenceLimitation(props.item);

  return <HistoryRowBody {...props} hasExpanded={hasExpanded} />;
}

export function ServiceHistoryTimeline({
  vehicleId,
  initialItems,
  initialNextCursor = null,
  initialHasMore = false,
  loading = false,
  error = false,
  onRetry,
  className = '',
}: ServiceHistoryTimelineProps) {
  const { t, formattingLocale } = useLanguage();
  const scopeId = useId().replace(/:/g, '');
  const loadGenerationRef = useRef(0);
  const [extraItems, setExtraItems] = useState<ServiceHistoryItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(initialNextCursor);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState(false);

  const resetToken = useMemo(
    () => `${vehicleId ?? ''}:${initialItems.map((i) => i.id).join(',')}:${initialNextCursor ?? ''}`,
    [vehicleId, initialItems, initialNextCursor],
  );

  useEffect(() => {
    loadGenerationRef.current += 1;
    setExtraItems([]);
    setNextCursor(initialNextCursor ?? null);
    setHasMore(Boolean(initialHasMore));
    setLoadMoreError(false);
    setLoadingMore(false);
    return () => {
      loadGenerationRef.current += 1;
    };
  }, [resetToken, initialHasMore, initialNextCursor]);

  const displayed = useMemo(
    () => mergeServiceHistoryPages(initialItems, extraItems),
    [initialItems, extraItems],
  );
  const yearGroups = useMemo(() => groupServiceHistoryByYear(displayed), [displayed]);

  const loadMore = useCallback(() => {
    if (!vehicleId || !nextCursor || loadingMore) return;
    const generationAtStart = loadGenerationRef.current;
    const vehicleAtStart = vehicleId;
    const cursorAtStart = nextCursor;
    setLoadingMore(true);
    setLoadMoreError(false);
    void api.vehicleIntelligence
      .serviceHistoryPage(vehicleAtStart, { cursor: cursorAtStart })
      .then((page) => {
        if (generationAtStart !== loadGenerationRef.current) return;
        if (vehicleAtStart !== vehicleId) return;
        setExtraItems((prev) => {
          const seen = new Set([...initialItems, ...prev].map((x) => x.id));
          const next = [...prev];
          for (const item of page.items) {
            if (seen.has(item.id)) continue;
            seen.add(item.id);
            next.push(item);
          }
          return next;
        });
        setNextCursor(page.nextCursor);
        setHasMore(page.hasMore);
      })
      .catch(() => {
        if (generationAtStart !== loadGenerationRef.current) return;
        setLoadMoreError(true);
      })
      .finally(() => {
        if (generationAtStart !== loadGenerationRef.current) return;
        setLoadingMore(false);
      });
  }, [vehicleId, nextCursor, loadingMore, initialItems]);

  const showPartialHint = hasMore && displayed.length > 0;

  return (
    <div className={`min-w-0 space-y-4 ${className}`} data-testid="service-history-timeline">
      <p className="text-[11px] leading-relaxed text-muted-foreground">{serviceHistoryDisclaimer(t)}</p>

      {loading ? (
        <p className="text-xs text-muted-foreground" role="status">
          {t('health.serviceInfo.v3.history.loading')}
        </p>
      ) : error ? (
        <div className="rounded-lg border border-border px-3 py-2 text-xs text-muted-foreground" role="alert">
          <p>{t('health.serviceInfo.v3.history.error')}</p>
          {onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              className="mt-2 inline-flex min-h-9 items-center font-semibold text-primary hover:underline"
            >
              {t('health.serviceInfo.v3.history.retry')}
            </button>
          ) : null}
        </div>
      ) : displayed.length === 0 ? (
        <p className="text-xs text-muted-foreground/80">{t('health.serviceInfo.v3.history.empty')}</p>
      ) : (
        <div className="space-y-5">
          {showPartialHint ? (
            <p className="text-[10px] text-muted-foreground" role="status">
              {t('health.serviceInfo.v3.history.partialListHint', { count: displayed.length })}
            </p>
          ) : null}
          {yearGroups.map((group) => (
            <section key={group.year === 'unknown' ? 'unknown' : String(group.year)} className="min-w-0 space-y-2">
              <div className="flex items-center gap-2">
                <h3
                  className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground"
                  id={`${scopeId}-year-${group.year}`}
                >
                  {group.year === 'unknown'
                    ? t('health.serviceInfo.v3.history.yearUnknown')
                    : t('health.serviceInfo.v3.history.yearLabel', { year: group.year })}
                </h3>
                <div aria-hidden className="h-px min-w-0 flex-1 bg-border" />
              </div>
              <ul className="space-y-2" aria-labelledby={`${scopeId}-year-${group.year}`}>
                {group.items.map((item) => (
                  <li key={item.id}>
                    <HistoryRow item={item} fmtLocale={formattingLocale} t={t} rowId={`${scopeId}-${item.id}`} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {!loading && !error && hasMore && nextCursor ? (
        <div className="space-y-2">
          {loadMoreError ? (
            <p className="text-[11px] text-muted-foreground" role="alert">
              {t('health.serviceInfo.v3.history.loadMoreError')}
            </p>
          ) : null}
          <button
            type="button"
            disabled={loadingMore || !vehicleId}
            onClick={loadMore}
            className="inline-flex min-h-9 items-center text-xs font-semibold text-primary hover:underline disabled:opacity-50"
          >
            {loadingMore ? (
              <span className="inline-flex items-center gap-1">
                <Icon name="loader" className="h-3.5 w-3.5 animate-spin" aria-hidden />
                {t('health.serviceInfo.v3.history.loading')}
              </span>
            ) : loadMoreError ? (
              t('health.serviceInfo.v3.history.loadMoreRetry')
            ) : (
              t('health.serviceInfo.v3.history.loadMore')
            )}
          </button>
        </div>
      ) : null}
    </div>
  );
}
