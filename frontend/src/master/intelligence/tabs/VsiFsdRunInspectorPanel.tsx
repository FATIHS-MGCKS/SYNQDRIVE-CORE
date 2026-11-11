import { useLanguage } from '../../../i18n/LanguageContext';
import type { MasterFsdRunInspectorDtoV1 } from '../vsi-master-fsd-read-api.types';
import { fsdLedgerLifecycleKey } from '../vsi-fsd-display.utils';

type Props = {
  inspector: MasterFsdRunInspectorDtoV1;
  formatTimestamp: (iso: string | null | undefined) => string;
};

export function VsiFsdRunInspectorPanel({ inspector, formatTimestamp }: Props) {
  const { t } = useLanguage();

  return (
    <div className="space-y-3 text-xs" data-testid="vsi-fsd-inspector-panel">
      <dl className="grid gap-2 sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground">{t('master.intelligence.vsi.inspector.runId' as never)}</dt>
          <dd className="font-mono break-all">{inspector.runId}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{t('master.intelligence.vsi.inspector.stream' as never)}</dt>
          <dd className="font-mono">{inspector.discoveryStream}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{t('master.intelligence.vsi.inspector.status' as never)}</dt>
          <dd className="font-mono">{inspector.status}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{t('master.intelligence.vsi.queries.attemptCount' as never)}</dt>
          <dd className="tabular-nums">
            {inspector.ledger.persistedAttemptCount ?? t('master.intelligence.vsi.fsd.notProven' as never)}
          </dd>
        </div>
      </dl>

      <div>
        <p className="font-medium">{t('master.intelligence.vsi.inspector.stages' as never)}</p>
        <ul className="mt-1 space-y-1 font-mono text-[10px]">
          {inspector.stages.map((s) => (
            <li key={`${s.stageType}-${s.version}`}>
              {s.stageType} v{s.version} · {s.status}
              {s.lastHttpStatus != null ? ` · HTTP ${s.lastHttpStatus}` : ''}
            </li>
          ))}
        </ul>
      </div>

      {Object.keys(inspector.ledger.budgetByStage).length ? (
        <div>
          <p className="font-medium">{t('master.intelligence.vsi.inspector.budgetByStage' as never)}</p>
          <ul className="mt-1 font-mono text-[10px]">
            {Object.entries(inspector.ledger.budgetByStage).map(([stage, budget]) => (
              <li key={stage}>
                {stage}: {budget ?? '—'}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="text-[10px] text-muted-foreground">{inspector.ledger.reconciliationNote}</p>
      <p className="text-[10px] text-muted-foreground">{inspector.cadence.note}</p>
      <p className="text-[10px] text-muted-foreground">
        {t('master.intelligence.vsi.queries.pollingProven' as never)}:{' '}
        {inspector.cadence.nativePollingFrequencyProven
          ? t('master.intelligence.vsi.common.yes' as never)
          : t('master.intelligence.vsi.fsd.notProven' as never)}
      </p>
      <p className="text-[10px] text-muted-foreground">{inspector.aggregationSemantics.note}</p>

      {inspector.ledger.attempts.length ? (
        <div className="overflow-x-auto rounded border border-border/40">
          <table className="w-full min-w-[44rem] text-left text-[10px]">
            <thead className="bg-muted/20 text-muted-foreground">
              <tr>
                <th className="px-2 py-1">{t('master.intelligence.vsi.queries.col.stage' as never)}</th>
                <th className="px-2 py-1">{t('master.intelligence.vsi.queries.col.lifecycle' as never)}</th>
                <th className="px-2 py-1">{t('master.intelligence.vsi.inspector.col.outcome' as never)}</th>
                <th className="px-2 py-1">{t('master.intelligence.vsi.queries.col.http' as never)}</th>
                <th className="px-2 py-1">{t('master.intelligence.vsi.queries.col.reserved' as never)}</th>
                <th className="px-2 py-1">{t('master.intelligence.vsi.inspector.col.finished' as never)}</th>
                <th className="px-2 py-1">{t('master.intelligence.vsi.inspector.col.fingerprint' as never)}</th>
              </tr>
            </thead>
            <tbody>
              {inspector.ledger.attempts.map((a) => (
                <tr key={a.attemptKey} className="border-t border-border/30">
                  <td className="px-2 py-1 font-mono">{a.stageType}</td>
                  <td className="px-2 py-1">{t(fsdLedgerLifecycleKey(a.lifecycle) as never)}</td>
                  <td className="px-2 py-1 font-mono">{a.outcome}</td>
                  <td className="px-2 py-1 tabular-nums">{a.httpStatus ?? '—'}</td>
                  <td className="px-2 py-1">{formatTimestamp(a.reservedAt)}</td>
                  <td className="px-2 py-1">{formatTimestamp(a.finishedAt)}</td>
                  <td className="px-2 py-1 font-mono break-all">{a.queryFingerprint}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-muted-foreground">{t('master.intelligence.vsi.queries.noAttempts' as never)}</p>
      )}
    </div>
  );
}
