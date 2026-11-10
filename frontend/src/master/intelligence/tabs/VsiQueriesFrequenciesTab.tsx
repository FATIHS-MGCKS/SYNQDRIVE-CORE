import { useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { useLanguage } from '../../../i18n/LanguageContext';
import { MasterPageSection } from '../../shell';
import type { MasterFsdRunHistoryPageDtoV1, MasterFsdRunInspectorDtoV1 } from '../vsi-master-fsd-read-api.types';
import { fsdLedgerLifecycleKey } from '../vsi-fsd-display.utils';

type Props = {
  scopeKey: string | null;
  runs: MasterFsdRunHistoryPageDtoV1 | null;
  runsLoading: boolean;
  runsError: string | null;
  inspector: MasterFsdRunInspectorDtoV1 | null;
  inspectorLoading: boolean;
  inspectorError: string | null;
  selectedRunId: string | null;
  onLoadRuns: () => void;
  onSelectRun: (runId: string) => void;
  formatTimestamp: (iso: string | null | undefined) => string;
};

export function VsiQueriesFrequenciesTab({
  scopeKey,
  runs,
  runsLoading,
  runsError,
  inspector,
  inspectorLoading,
  inspectorError,
  selectedRunId,
  onLoadRuns,
  onSelectRun,
  formatTimestamp,
}: Props) {
  const { t } = useLanguage();

  useEffect(() => {
    if (!scopeKey) return;
    onLoadRuns();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeKey]);

  return (
    <div className="space-y-4" data-testid="vsi-tab-queries">
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
      </MasterPageSection>

      {selectedRunId ? (
        <MasterPageSection title={t('master.intelligence.vsi.queries.inspectorTitle' as never)}>
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
          {inspector ? (
            <div className="space-y-3 text-xs">
              <p className="text-muted-foreground">
                {t('master.intelligence.vsi.queries.pollingProven' as never)}:{' '}
                {inspector.cadence.nativePollingFrequencyProven
                  ? t('master.intelligence.vsi.common.yes' as never)
                  : t('master.intelligence.vsi.fsd.notProven' as never)}
              </p>
              <p className="text-[10px] text-muted-foreground">{inspector.cadence.note}</p>
              <p className="text-[10px] text-muted-foreground">{inspector.aggregationSemantics.note}</p>
              <p className="font-mono text-[10px]">{inspector.ledger.reconciliationNote}</p>
              {inspector.ledger.attempts.length ? (
                <div className="overflow-x-auto rounded border border-border/40">
                  <table className="w-full min-w-[36rem] text-left text-[10px]">
                    <thead className="bg-muted/20 text-muted-foreground">
                      <tr>
                        <th className="px-2 py-1">{t('master.intelligence.vsi.queries.col.stage' as never)}</th>
                        <th className="px-2 py-1">{t('master.intelligence.vsi.queries.col.lifecycle' as never)}</th>
                        <th className="px-2 py-1">{t('master.intelligence.vsi.queries.col.http' as never)}</th>
                        <th className="px-2 py-1">{t('master.intelligence.vsi.queries.col.reserved' as never)}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {inspector.ledger.attempts.map((a) => (
                        <tr key={a.attemptKey} className="border-t border-border/30">
                          <td className="px-2 py-1 font-mono">{a.stageType}</td>
                          <td className="px-2 py-1">{t(fsdLedgerLifecycleKey(a.lifecycle) as never)}</td>
                          <td className="px-2 py-1 tabular-nums">{a.httpStatus ?? '—'}</td>
                          <td className="px-2 py-1">{formatTimestamp(a.reservedAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-muted-foreground">{t('master.intelligence.vsi.queries.noAttempts' as never)}</p>
              )}
            </div>
          ) : null}
        </MasterPageSection>
      ) : null}
    </div>
  );
}
