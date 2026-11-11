import { Loader2 } from 'lucide-react';
import { useLanguage } from '../../../i18n/LanguageContext';
import { MasterPageSection } from '../../shell';
import type { MasterFsdRunHistoryPageDtoV1, MasterFsdRunInspectorDtoV1 } from '../vsi-master-fsd-read-api.types';
import { vsiIntelligenceTabPanelProps } from '../vsi-tab-panel-a11y';
import { VsiFsdRunInspectorPanel } from './VsiFsdRunInspectorPanel';

type Props = {
  runs: MasterFsdRunHistoryPageDtoV1 | null;
  runsLoading: boolean;
  runsError: string | null;
  inspector: MasterFsdRunInspectorDtoV1 | null;
  inspectorLoading: boolean;
  inspectorError: string | null;
  selectedRunId: string | null;
  onLoadRuns: () => void;
  onLoadMoreRuns: () => void;
  onSelectRun: (runId: string) => void;
  formatTimestamp: (iso: string | null | undefined) => string;
};

export function VsiQueriesFrequenciesTab({
  runs,
  runsLoading,
  runsError,
  inspector,
  inspectorLoading,
  inspectorError,
  selectedRunId,
  onLoadRuns,
  onLoadMoreRuns,
  onSelectRun,
  formatTimestamp,
}: Props) {
  const { t } = useLanguage();

  return (
    <div className="space-y-4" data-testid="vsi-tab-queries" {...vsiIntelligenceTabPanelProps('queries')}>
      <MasterPageSection title={t('master.intelligence.vsi.tabs.queries' as never)}>
        <p className="text-xs text-muted-foreground">{t('master.intelligence.vsi.queries.semantics' as never)}</p>
        <ul className="mt-2 list-disc space-y-1 pl-4 text-[11px] text-muted-foreground">
          <li>{t('master.intelligence.vsi.queries.conceptA' as never)}</li>
          <li>{t('master.intelligence.vsi.queries.conceptB' as never)}</li>
          <li>{t('master.intelligence.vsi.queries.conceptC' as never)}</li>
          <li>{t('master.intelligence.vsi.queries.conceptD' as never)}</li>
        </ul>
      </MasterPageSection>

      <MasterPageSection title={t('master.intelligence.vsi.queries.runsTitle' as never)}>
        <button type="button" className="mb-2 text-xs underline" onClick={onLoadRuns}>
          {t('master.intelligence.vsi.runs.refresh' as never)}
        </button>
        {runsLoading && !runs ? (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {t('master.intelligence.vsi.fsd.loading' as never)}
          </p>
        ) : null}
        {runsError ? (
          <p className="text-xs text-destructive" role="alert">
            {runsError}
          </p>
        ) : null}
        {runs?.items.length ? (
          <ul className="space-y-2 text-xs">
            {runs.items.map((run) => (
              <li key={run.runId} className="rounded border border-border/50 p-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono">{run.runId}</span>
                  <span>
                    {run.discoveryStream} · {run.status}
                  </span>
                  <button
                    type="button"
                    className="underline"
                    onClick={() => onSelectRun(run.runId)}
                    aria-pressed={selectedRunId === run.runId}
                  >
                    {t('master.intelligence.vsi.queries.inspectRun' as never)}
                  </button>
                </div>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  {t('master.intelligence.vsi.queries.attemptCount' as never)}:{' '}
                  {run.ledgerSummary.persistedAttemptCount ?? t('master.intelligence.vsi.fsd.notProven' as never)}
                </p>
                <p className="text-[10px] text-muted-foreground">{formatTimestamp(run.completedAt ?? run.createdAt)}</p>
              </li>
            ))}
          </ul>
        ) : runs && !runsLoading ? (
          <p className="text-xs text-muted-foreground">{t('master.intelligence.vsi.queries.noRuns' as never)}</p>
        ) : null}
        {runs?.page.hasMore ? (
          <button
            type="button"
            className="mt-2 text-xs underline"
            disabled={runsLoading}
            onClick={onLoadMoreRuns}
          >
            {runsLoading ? t('master.intelligence.vsi.fsd.loading' as never) : t('master.intelligence.vsi.runs.loadMore' as never)}
          </button>
        ) : null}
      </MasterPageSection>

      {selectedRunId ? (
        <MasterPageSection title={t('master.intelligence.vsi.queries.inspectorTitle' as never)}>
          <p className="mb-2 font-mono text-[10px] text-muted-foreground">{selectedRunId}</p>
          {inspectorLoading ? (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {t('master.intelligence.vsi.fsd.loading' as never)}
            </p>
          ) : null}
          {inspectorError ? (
            <p className="text-xs text-destructive" role="alert">
              {inspectorError}
            </p>
          ) : null}
          {inspector && inspector.runId === selectedRunId ? (
            <VsiFsdRunInspectorPanel inspector={inspector} formatTimestamp={formatTimestamp} />
          ) : null}
        </MasterPageSection>
      ) : null}
    </div>
  );
}
