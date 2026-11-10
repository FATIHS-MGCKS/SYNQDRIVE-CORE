import { useCallback, useEffect, useState } from 'react';
import { Loader2, Search, X } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '../../../components/ui/sheet';
import { useLanguage } from '../../../i18n/LanguageContext';
import { MasterPageSection } from '../../shell';
import type {
  MasterFsdSignalExplorerItemV1,
  MasterFsdSignalExplorerPageDtoV1,
} from '../vsi-master-fsd-read-api.types';
import {
  fsdHistoricalColumnKey,
  fsdPresentationStateKey,
  fsdStageEvidenceKey,
} from '../vsi-fsd-display.utils';

type Props = {
  scopeKey: string | null;
  signals: MasterFsdSignalExplorerPageDtoV1 | null;
  signalsLoading: boolean;
  signalsError: string | null;
  onLoad: (params?: { cursor?: string | null; q?: string | null; append?: boolean }) => void;
  catalogAuthoritative: boolean;
  historicalLink: string;
};

export function VsiFsdSignalsTab({
  scopeKey,
  signals,
  signalsLoading,
  signalsError,
  onLoad,
  catalogAuthoritative,
  historicalLink,
}: Props) {
  const { t } = useLanguage();
  const [query, setQuery] = useState('');
  const [detail, setDetail] = useState<MasterFsdSignalExplorerItemV1 | null>(null);

  useEffect(() => {
    if (!scopeKey) return;
    setQuery('');
    setDetail(null);
    onLoad({ q: null, cursor: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload only when scope changes
  }, [scopeKey]);

  const submitSearch = useCallback(() => {
    onLoad({ q: query.trim() || null, cursor: null });
  }, [onLoad, query]);

  const loadMore = useCallback(() => {
    if (!signals?.page.nextCursor) return;
    onLoad({ cursor: signals.page.nextCursor, q: query.trim() || null, append: true });
  }, [onLoad, query, signals?.page.nextCursor]);

  return (
    <div className="space-y-3" data-testid="vsi-tab-signals">
      <MasterPageSection title={t('master.intelligence.vsi.tabs.signals' as never)}>
        <p className="mb-2 text-xs text-muted-foreground">{t('master.intelligence.vsi.fsd.signals.disclaimer' as never)}</p>
        {!catalogAuthoritative ? (
          <p className="mb-2 text-xs text-amber-800 dark:text-amber-200" role="status">
            {t('master.intelligence.vsi.fsd.signals.notAuthoritative' as never)}
          </p>
        ) : null}
        {historicalLink === 'UNVERIFIED_LINK' ? (
          <p className="mb-2 text-xs text-amber-800 dark:text-amber-200" role="status">
            {t('master.intelligence.vsi.fsd.unverifiedLink' as never)}
          </p>
        ) : null}
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-1 min-w-[12rem] flex-col gap-1 text-xs">
            <span className="text-muted-foreground">{t('master.intelligence.vsi.fsd.signals.search' as never)}</span>
            <span className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                className="w-full rounded border border-border bg-background py-1.5 pl-8 pr-2 font-mono text-[11px]"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submitSearch();
                }}
                aria-label={t('master.intelligence.vsi.fsd.signals.search' as never)}
              />
            </span>
          </label>
          <button
            type="button"
            className="rounded border border-border bg-background px-3 py-1.5 text-xs"
            onClick={submitSearch}
            disabled={signalsLoading}
          >
            {t('master.intelligence.vsi.fsd.signals.searchAction' as never)}
          </button>
        </div>
        {signalsError ? (
          <div className="mt-2 rounded border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive" role="alert">
            {signalsError}
          </div>
        ) : null}
        {signalsLoading && !signals ? (
          <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {t('master.intelligence.vsi.fsd.loading' as never)}
          </p>
        ) : null}
        {signals ? (
          <>
            <p className="mt-2 text-[10px] text-muted-foreground">
              {t('master.intelligence.vsi.fsd.signals.resultMeta' as never, {
                count: signals.aggregates.logicalSignalsReturned,
                declared: signals.aggregates.declaredSignalCount ?? '—',
              })}
            </p>
            <div className="mt-2 overflow-x-auto rounded border border-border/50">
              <table className="w-full min-w-[40rem] text-left text-[11px]">
                <caption className="sr-only">{t('master.intelligence.vsi.fsd.signals.tableCaption' as never)}</caption>
                <thead className="border-b border-border/50 bg-muted/20 text-[10px] uppercase text-muted-foreground">
                  <tr>
                    <th className="px-2 py-1.5">{t('master.intelligence.vsi.fsd.signals.col.name' as never)}</th>
                    <th className="px-2 py-1.5">{t('master.intelligence.vsi.fsd.signals.col.state' as never)}</th>
                    <th className="px-2 py-1.5">{t('master.intelligence.vsi.fsd.signals.col.snapshot' as never)}</th>
                    <th className="px-2 py-1.5">{t('master.intelligence.vsi.fsd.signals.col.historical' as never)}</th>
                    <th className="px-2 py-1.5">{t('master.intelligence.vsi.fsd.signals.col.query' as never)}</th>
                    <th className="px-2 py-1.5" />
                  </tr>
                </thead>
                <tbody>
                  {signals.items.map((row) => (
                    <tr key={row.providerNativeSignalName} className="border-b border-border/30 hover:bg-muted/10">
                      <td className="px-2 py-1.5 font-mono">{row.providerNativeSignalName}</td>
                      <td className="px-2 py-1.5">{t(fsdPresentationStateKey(row.presentationState) as never)}</td>
                      <td className="px-2 py-1.5">
                        {row.snapshotEvidence === 'PARTIAL' || row.snapshotEvidence === 'NOT_AVAILABLE' || row.snapshotEvidence === 'NOT_EXECUTED'
                          ? t(fsdStageEvidenceKey(row.snapshotEvidence) as never)
                          : t(fsdPresentationStateKey(row.snapshotEvidence as never) as never)}
                      </td>
                      <td className="px-2 py-1.5">{t(fsdHistoricalColumnKey(row.historicalEvidence) as never)}</td>
                      <td className="px-2 py-1.5">
                        {row.catalogQuery.queryPlanned
                          ? t('master.intelligence.vsi.fsd.signals.queryPlanned' as never)
                          : t('master.intelligence.vsi.fsd.signals.queryNotPlanned' as never)}
                      </td>
                      <td className="px-2 py-1.5">
                        <button
                          type="button"
                          className="underline"
                          onClick={() => setDetail(row)}
                        >
                          {t('master.intelligence.vsi.fsd.signals.openDetail' as never)}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {signals.page.hasMore ? (
              <button
                type="button"
                className="mt-2 text-xs underline"
                disabled={signalsLoading}
                onClick={loadMore}
              >
                {signalsLoading ? t('master.intelligence.vsi.fsd.loading' as never) : t('master.intelligence.vsi.fsd.signals.loadMore' as never)}
              </button>
            ) : null}
          </>
        ) : null}
      </MasterPageSection>

      <Sheet open={detail != null} onOpenChange={(open) => !open && setDetail(null)}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="font-mono text-sm">{detail?.providerNativeSignalName}</SheetTitle>
          </SheetHeader>
          {detail ? (
            <dl className="mt-4 space-y-2 text-xs">
              <div>
                <dt className="text-muted-foreground">{t('master.intelligence.vsi.fsd.signals.col.state' as never)}</dt>
                <dd>{t(fsdPresentationStateKey(detail.presentationState) as never)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{t('master.intelligence.vsi.fsd.signals.detail.declared' as never)}</dt>
                <dd>{detail.declaredByProvider ? t('master.intelligence.vsi.common.yes' as never) : t('master.intelligence.vsi.common.no' as never)}</dd>
              </div>
              {detail.sourceRunId ? (
                <div>
                  <dt className="text-muted-foreground">{t('master.intelligence.vsi.fsd.signals.detail.runId' as never)}</dt>
                  <dd className="font-mono break-all">{detail.sourceRunId}</dd>
                </div>
              ) : null}
              {detail.provenanceReference ? (
                <div>
                  <dt className="text-muted-foreground">{t('master.intelligence.vsi.fsd.signals.detail.provenance' as never)}</dt>
                  <dd className="font-mono break-all">{detail.provenanceReference}</dd>
                </div>
              ) : null}
              {detail.coverageAggregate?.note ? (
                <div>
                  <dt className="text-muted-foreground">{t('master.intelligence.vsi.fsd.signals.detail.coverageNote' as never)}</dt>
                  <dd>{detail.coverageAggregate.note}</dd>
                </div>
              ) : null}
            </dl>
          ) : null}
          <button
            type="button"
            className="mt-4 flex items-center gap-1 text-xs underline"
            onClick={() => setDetail(null)}
          >
            <X className="h-3 w-3" aria-hidden />
            {t('master.intelligence.vsi.fsd.signals.closeDetail' as never)}
          </button>
        </SheetContent>
      </Sheet>
    </div>
  );
}
