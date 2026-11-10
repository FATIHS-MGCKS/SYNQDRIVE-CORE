import { Loader2 } from 'lucide-react';
import { useLanguage } from '../../../i18n/LanguageContext';
import { MasterPageSection } from '../../shell';
import type {
  MasterFsdRunHistoryPageDtoV1,
  MasterFsdRunInspectorDtoV1,
} from '../vsi-master-fsd-read-api.types';
import type {
  MasterVsiRevisionAsOfDto,
  MasterVsiRevisionHistoryPageDto,
} from '../vsi-master-intelligence-api.types';
import { cn } from '../../../components/ui/utils';

type Props = {
  runs: MasterFsdRunHistoryPageDtoV1 | null;
  runsLoading: boolean;
  runsError: string | null;
  onLoadRuns: () => void;
  onSelectRun: (runId: string) => void;
  selectedRunId: string | null;
  inspector: MasterFsdRunInspectorDtoV1 | null;
  inspectorLoading: boolean;
  revisions: MasterVsiRevisionHistoryPageDto | null;
  revisionsLoading: boolean;
  revisionsError: string | null;
  revisionAsOf: MasterVsiRevisionAsOfDto | null;
  asOf: string | null;
  capabilityExplanation: unknown | null;
  formatTimestamp: (iso: string | null | undefined) => string;
  onRefreshRevisions: () => void;
  legacyRevisionsUrl: boolean;
};

export function VsiRunsRevisionsTab({
  runs,
  runsLoading,
  runsError,
  onLoadRuns,
  onSelectRun,
  selectedRunId,
  inspector,
  inspectorLoading,
  revisions,
  revisionsLoading,
  revisionsError,
  revisionAsOf,
  asOf,
  capabilityExplanation,
  formatTimestamp,
  onRefreshRevisions,
  legacyRevisionsUrl,
}: Props) {
  const { t } = useLanguage();

  return (
    <div className="space-y-4" data-testid="vsi-tab-runs">
      {legacyRevisionsUrl ? (
        <p className="text-xs text-muted-foreground" role="status">
          {t('master.intelligence.vsi.runs.legacyRevisions' as never)}
        </p>
      ) : null}

      <MasterPageSection title={t('master.intelligence.vsi.runs.fsdTitle' as never)}>
        <button type="button" className="mb-2 text-xs underline" onClick={() => onLoadRuns()}>
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
        {runs?.items.map((run) => (
          <button
            key={run.runId}
            type="button"
            className={cn(
              'mb-2 w-full rounded border px-2 py-1.5 text-left text-xs font-mono',
              selectedRunId === run.runId ? 'border-primary bg-primary/5' : 'border-border/50',
            )}
            onClick={() => onSelectRun(run.runId)}
          >
            {run.runId} · {run.status}
            <span className="ml-2 text-muted-foreground">{formatTimestamp(run.completedAt ?? run.createdAt)}</span>
          </button>
        ))}
        {inspectorLoading ? (
          <p className="text-xs text-muted-foreground">{t('master.intelligence.vsi.fsd.loading' as never)}</p>
        ) : null}
        {inspector ? (
          <pre className="mt-2 max-h-48 overflow-auto rounded border bg-muted/10 p-2 text-[10px]">
            {JSON.stringify(
              {
                runId: inspector.runId,
                stages: inspector.stages,
                catalogProvenance: inspector.catalogProvenance,
              },
              null,
              2,
            )}
          </pre>
        ) : null}
      </MasterPageSection>

      {revisionsError ? (
        <MasterPageSection title={t('master.intelligence.section.revisions' as never)}>
          <div className="rounded border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive" role="alert">
            <p>{t('master.intelligence.vsi.revision.loadError' as never)}</p>
            <p className="mt-1 font-mono">{revisionsError}</p>
            <button type="button" className="mt-2 underline" onClick={() => void onRefreshRevisions()}>
              {t('master.intelligence.vsi.revision.retry' as never)}
            </button>
          </div>
        </MasterPageSection>
      ) : null}

      {revisionsLoading ? (
        <MasterPageSection title={t('master.intelligence.section.revisions' as never)}>
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            {t('master.intelligence.vsi.revision.loading' as never)}
          </p>
        </MasterPageSection>
      ) : null}

      {revisions ? (
        <MasterPageSection title={t('master.intelligence.section.revisions' as never)}>
          {revisions.captureStatus === 'NOT_CAPTURED' ? (
            <div className="rounded border border-amber-500/30 bg-amber-500/5 p-3 text-xs" role="status">
              <p className="font-medium">{t('master.intelligence.vsi.revision.notCaptured' as never)}</p>
              <p className="mt-1 text-muted-foreground">{t('master.intelligence.vsi.revision.notCapturedExplain' as never)}</p>
            </div>
          ) : (
            <>
              <ul className="space-y-2 text-xs">
                {revisions.items.map((item) => (
                  <li key={item.profileRevision} className="rounded border border-border/50 px-2 py-1.5 font-mono">
                    rev {item.profileRevision} · LV {item.lvStandbyProfile} · RPM {item.rpmActiveProfile}
                    <span className="ml-2 text-muted-foreground">{formatTimestamp(item.evaluatedAt)}</span>
                  </li>
                ))}
              </ul>
              {revisions.page.hasMore ? (
                <p className="mt-2 text-muted-foreground">{t('master.intelligence.vsi.revision.moreAvailable' as never)}</p>
              ) : null}
            </>
          )}
        </MasterPageSection>
      ) : null}

      {revisionAsOf && asOf ? (
        <MasterPageSection title={t('master.intelligence.vsi.asOf.title' as never)}>
          <p className="text-xs text-muted-foreground">
            {t('master.intelligence.vsi.asOf.decisionAt' as never)}: {formatTimestamp(revisionAsOf.decisionAt)}
          </p>
          <p className="mt-1 text-xs">
            {t('master.intelligence.vsi.asOf.authority' as never)}: {revisionAsOf.authority}
          </p>
        </MasterPageSection>
      ) : null}

      {capabilityExplanation ? (
        <MasterPageSection title={t('master.intelligence.section.capability' as never)}>
          <pre className={cn('max-h-64 overflow-auto rounded border border-border/50 bg-muted/20 p-2 text-[10px]')}>
            {JSON.stringify(capabilityExplanation, null, 2)}
          </pre>
        </MasterPageSection>
      ) : null}
    </div>
  );
}
