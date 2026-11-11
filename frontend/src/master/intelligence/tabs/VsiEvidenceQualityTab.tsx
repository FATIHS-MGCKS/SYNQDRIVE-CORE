import { useLanguage } from '../../../i18n/LanguageContext';
import { MasterPageSection } from '../../shell';
import type { MasterFsdRunInspectorDtoV1, MasterFsdSummaryDtoV1 } from '../vsi-master-fsd-read-api.types';
import type { MasterVsiProfileDetailDto } from '../vsi-master-intelligence-api.types';
import { fsdPresentationStateKey, fsdStageEvidenceKey } from '../vsi-fsd-display.utils';
import { vsiIntelligenceTabPanelProps } from '../vsi-tab-panel-a11y';

type Props = {
  fsdSummary: MasterFsdSummaryDtoV1 | null;
  profile: MasterVsiProfileDetailDto | null;
  inspector: MasterFsdRunInspectorDtoV1 | null;
};

const PRESENTATION_STATES = [
  'DECLARED_ONLY',
  'QUERY_PLANNED',
  'QUERY_ACCEPTED',
  'OBSERVED',
  'NULL_OBSERVED',
  'MISSING',
  'INVALID',
  'DEFERRED',
  'QUERY_FAILED',
  'NOT_EVALUABLE',
  'UNKNOWN',
] as const;

export function VsiEvidenceQualityTab({ fsdSummary, profile, inspector }: Props) {
  const { t } = useLanguage();

  const obs = inspector?.evidenceCoverage.observationCounts;

  return (
    <div className="space-y-4" data-testid="vsi-tab-evidence" {...vsiIntelligenceTabPanelProps('evidence')}>
      <MasterPageSection title={t('master.intelligence.vsi.tabs.evidence' as never)}>
        <p className="text-xs text-muted-foreground">{t('master.intelligence.vsi.evidence.intro' as never)}</p>
      </MasterPageSection>

      {fsdSummary ? (
        <MasterPageSection title={t('master.intelligence.vsi.evidence.fsdStages' as never)}>
          <ul className="grid gap-2 sm:grid-cols-2 text-xs">
            <li className="rounded border border-border/40 px-2 py-1.5">
              {t('master.intelligence.vsi.cockpit.snapshotEvidence' as never)}:{' '}
              {t(fsdStageEvidenceKey(fsdSummary.evidence.snapshot) as never)}
            </li>
            <li className="rounded border border-border/40 px-2 py-1.5">
              {t('master.intelligence.vsi.cockpit.historicalEvidence' as never)}:{' '}
              {t(fsdStageEvidenceKey(fsdSummary.evidence.historical) as never)}
            </li>
          </ul>
        </MasterPageSection>
      ) : null}

      <MasterPageSection title={t('master.intelligence.vsi.evidence.presentationLegend' as never)}>
        <ul className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3 text-[11px]">
          {PRESENTATION_STATES.map((state) => (
            <li key={state} className="rounded bg-muted/15 px-2 py-1">
              <span className="font-mono text-[10px] text-muted-foreground">{state}</span>
              <span className="ml-2">{t(fsdPresentationStateKey(state) as never)}</span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-[10px] text-muted-foreground">{t('master.intelligence.vsi.evidence.noMerge' as never)}</p>
      </MasterPageSection>

      {obs ? (
        <MasterPageSection title={t('master.intelligence.vsi.evidence.runCounts' as never)}>
          <dl className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
            {(
              [
                ['observed', obs.observed],
                ['nullObserved', obs.nullObserved],
                ['deferred', obs.deferred],
                ['queryFailed', obs.queryFailed],
                ['absent', obs.absent],
                ['other', obs.other],
              ] as const
            ).map(([key, val]) => (
              <div key={key} className="rounded border border-border/30 px-2 py-1">
                <dt className="text-[10px] text-muted-foreground">{t(`master.intelligence.vsi.evidence.count.${key}` as never)}</dt>
                <dd className="tabular-nums font-medium">{val}</dd>
              </div>
            ))}
          </dl>
        </MasterPageSection>
      ) : (
        <p className="text-xs text-muted-foreground">{t('master.intelligence.vsi.evidence.selectRun' as never)}</p>
      )}

      {profile ? (
        <MasterPageSection title={t('master.intelligence.vsi.evidence.vsiProfile' as never)}>
          <p className="text-xs">
            {t('master.intelligence.vsi.evidence.profileRevision' as never, { revision: profile.profileRevision })}
          </p>
          {profile.profileLimitations.length ? (
            <ul className="mt-2 list-disc pl-4 text-xs text-muted-foreground">
              {profile.profileLimitations.map((c) => (
                <li key={c} className="font-mono">
                  {c}
                </li>
              ))}
            </ul>
          ) : null}
        </MasterPageSection>
      ) : null}
    </div>
  );
}
