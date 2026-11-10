import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useLanguage } from '../../../i18n/LanguageContext';
import { MasterPageSection } from '../../shell';
import { EvidenceFreshnessHint, EvaluationBlockedBanner } from '../EvidenceFreshnessHint';
import {
  ObservedDensityBadge,
  ProfileConfidenceIndicator,
  SignalProfileBadge,
} from '../SignalProfileBadge';
import type { MasterVsiProfileDetailDto } from '../vsi-master-intelligence-api.types';
import {
  evidenceKindFromSummary,
  mapConfidenceLevel,
  mapObservedDensity,
  mapSummaryToLvBadge,
  mapSummaryToRpmBadge,
} from '../vsi-master-intelligence-ui.utils';

type Props = {
  profile: MasterVsiProfileDetailDto | null;
  formatTimestamp: (iso: string | null | undefined) => string;
};

export function VsiProfilesCadenceTab({ profile, formatTimestamp }: Props) {
  const { t } = useLanguage();
  const [lvOpen, setLvOpen] = useState(true);
  const [rpmOpen, setRpmOpen] = useState(true);

  if (!profile) {
    return (
      <p className="text-xs text-muted-foreground" data-testid="vsi-tab-profiles">
        {t('master.intelligence.vsi.noProfiles.body' as never)}
      </p>
    );
  }

  const lv = mapSummaryToLvBadge(profile);
  const rpm = mapSummaryToRpmBadge(profile);

  return (
    <div className="space-y-4" data-testid="vsi-tab-profiles">
      <MasterPageSection title={t('master.intelligence.vsi.tabs.profiles' as never)}>
        <p className="text-xs text-muted-foreground">{t('master.intelligence.vsi.profiles.intro' as never)}</p>
      </MasterPageSection>

      <section className="rounded-lg border border-border/60 bg-card/20">
        <button
          type="button"
          className="flex w-full items-center justify-between px-3 py-2 text-left text-sm font-medium"
          aria-expanded={lvOpen}
          onClick={() => setLvOpen((v) => !v)}
        >
          {t('master.intelligence.vsi.profiles.lvSection' as never)}
          {lvOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
        {lvOpen ? (
          <div className="border-t border-border/40 px-3 pb-3 pt-2 text-xs">
            <SignalProfileBadge kind="lv" profile={lv.profile} limitationCode={lv.limitationCode} />
            <dl className="mt-3 grid gap-2 sm:grid-cols-2">
              <div>
                <dt className="text-muted-foreground">{t('master.intelligence.vsi.profiles.lvDecision' as never)}</dt>
                <dd className="font-mono">{profile.lvClassificationDecisionCode ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{t('master.intelligence.vsi.profiles.confidence' as never)}</dt>
                <dd>
                  {profile.lvEvidenceConfidence ? (
                    <ProfileConfidenceIndicator level={mapConfidenceLevel(profile.lvEvidenceConfidence)} />
                  ) : (
                    '—'
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{t('master.intelligence.vsi.profiles.profileEvaluated' as never)}</dt>
                <dd>{formatTimestamp(profile.evaluatedAt)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{t('master.intelligence.vsi.ledger.timestamp.providerFetch' as never)}</dt>
                <dd>{formatTimestamp(profile.lastMaterializedProviderFetchAt)}</dd>
              </div>
            </dl>
          </div>
        ) : null}
      </section>

      <section className="rounded-lg border border-border/60 bg-card/20">
        <button
          type="button"
          className="flex w-full items-center justify-between px-3 py-2 text-left text-sm font-medium"
          aria-expanded={rpmOpen}
          onClick={() => setRpmOpen((v) => !v)}
        >
          {t('master.intelligence.vsi.profiles.rpmSection' as never)}
          {rpmOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
        {rpmOpen ? (
          <div className="border-t border-border/40 px-3 pb-3 pt-2 text-xs">
            <div className="flex flex-wrap gap-2">
              <SignalProfileBadge kind="rpm" profile={rpm.profile} applicability={rpm.applicability} />
              {profile.observedDensityLabel ? (
                <ObservedDensityBadge density={mapObservedDensity(profile.observedDensityLabel)} />
              ) : null}
            </div>
            <dl className="mt-3 grid gap-2 sm:grid-cols-2">
              <div>
                <dt className="text-muted-foreground">{t('master.intelligence.vsi.profiles.rpmApplicability' as never)}</dt>
                <dd className="font-mono">{profile.rpmApplicability}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{t('master.intelligence.vsi.profiles.rpmDecision' as never)}</dt>
                <dd className="font-mono">{profile.rpmClassificationDecisionCode ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{t('master.intelligence.vsi.profiles.density' as never)}</dt>
                <dd className="font-mono">{profile.observedDensityLabel ?? '—'}</dd>
              </div>
            </dl>
            <p className="mt-2 text-[10px] text-muted-foreground">{t('master.intelligence.vsi.profiles.rpmFsdNote' as never)}</p>
          </div>
        ) : null}
      </section>

      {profile.evaluationBlocked ? (
        <EvaluationBlockedBanner limitationCode={profile.evaluationBlockedCodes[0]} />
      ) : null}
      <EvidenceFreshnessHint
        kind={evidenceKindFromSummary(profile)}
        evaluatedAt={profile.evaluatedAt}
        providerSourceTimestamp={profile.lastMaterializedSourceTimestamp}
        providerFetchedAt={profile.lastMaterializedProviderFetchAt}
        profileRevision={profile.profileRevision}
      />
    </div>
  );
}
