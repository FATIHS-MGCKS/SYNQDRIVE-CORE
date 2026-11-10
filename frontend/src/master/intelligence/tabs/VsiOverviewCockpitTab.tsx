import { Loader2 } from 'lucide-react';
import { useLanguage } from '../../../i18n/LanguageContext';
import { MasterPageSection } from '../../shell';
import {
  EvaluationBlockedBanner,
  EvidenceFreshnessHint,
} from '../EvidenceFreshnessHint';
import {
  ObservedDensityBadge,
  ProfileConfidenceIndicator,
  SignalProfileBadge,
} from '../SignalProfileBadge';
import type { MasterFsdSummaryDtoV1 } from '../vsi-master-fsd-read-api.types';
import type { MasterVsiProfileSummaryDto } from '../vsi-master-intelligence-api.types';
import {
  evidenceKindFromSummary,
  mapConfidenceLevel,
  mapObservedDensity,
  mapSummaryToLvBadge,
  mapSummaryToRpmBadge,
} from '../vsi-master-intelligence-ui.utils';
import { fsdCatalogAvailabilityKey, fsdStageEvidenceKey } from '../vsi-fsd-display.utils';
import { VsiIntelligenceScopeBanner } from './VsiIntelligenceScopeBanner';

type Props = {
  orgLabel: string | null;
  vehicleLabel: string | null;
  linkLabel: string | null;
  providerSourceLinkId: string | null;
  selectedProfile: MasterVsiProfileSummaryDto | null;
  allProfiles: MasterVsiProfileSummaryDto[];
  fsdSummary: MasterFsdSummaryDtoV1 | null;
  fsdSummaryLoading: boolean;
  fsdSummaryError: string | null;
  formatTimestamp: (iso: string | null | undefined) => string;
  onOpenCanonicalLedger: () => void;
  onOpenFsdSignals: () => void;
};

function MetricTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-md border border-border/50 bg-card/40 px-2.5 py-2">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm font-medium tabular-nums">{value}</p>
      {hint ? <p className="mt-1 text-[10px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function VsiOverviewCockpitTab({
  orgLabel,
  vehicleLabel,
  linkLabel,
  providerSourceLinkId,
  selectedProfile,
  allProfiles,
  fsdSummary,
  fsdSummaryLoading,
  fsdSummaryError,
  formatTimestamp,
  onOpenCanonicalLedger,
  onOpenFsdSignals,
}: Props) {
  const { t } = useLanguage();

  const lv = selectedProfile ? mapSummaryToLvBadge(selectedProfile) : null;
  const rpm = selectedProfile ? mapSummaryToRpmBadge(selectedProfile) : null;

  const catalogCount =
    fsdSummary?.catalog.declaredSignalCount != null
      ? String(fsdSummary.catalog.declaredSignalCount)
      : t('master.intelligence.vsi.fsd.notProven' as never);

  return (
    <div className="space-y-4" data-testid="vsi-tab-overview">
      <VsiIntelligenceScopeBanner
        orgLabel={orgLabel}
        vehicleLabel={vehicleLabel}
        linkLabel={linkLabel}
        providerSourceLinkId={providerSourceLinkId}
      />

      <MasterPageSection title={t('master.intelligence.vsi.cockpit.fsdTitle' as never)}>
        {fsdSummaryLoading ? (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            {t('master.intelligence.vsi.fsd.loading' as never)}
          </p>
        ) : null}
        {fsdSummaryError ? (
          <div className="rounded border border-amber-500/40 bg-amber-500/5 p-3 text-xs" role="status">
            <p className="font-medium">{t('master.intelligence.vsi.fsd.partialTitle' as never)}</p>
            <p className="mt-1 font-mono text-muted-foreground">{fsdSummaryError}</p>
            <p className="mt-2 text-muted-foreground">{t('master.intelligence.vsi.fsd.profileUnaffected' as never)}</p>
          </div>
        ) : null}
        {fsdSummary ? (
          <div className="space-y-3">
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4" data-testid="vsi-cockpit-metrics">
              <MetricTile
                label={t('master.intelligence.vsi.cockpit.catalogStatus' as never)}
                value={t(fsdCatalogAvailabilityKey(fsdSummary.catalog.availability) as never)}
              />
              <MetricTile
                label={t('master.intelligence.vsi.cockpit.catalogSignals' as never)}
                value={catalogCount}
              />
              <MetricTile
                label={t('master.intelligence.vsi.cockpit.snapshotEvidence' as never)}
                value={t(fsdStageEvidenceKey(fsdSummary.evidence.snapshot) as never)}
              />
              <MetricTile
                label={t('master.intelligence.vsi.cockpit.historicalEvidence' as never)}
                value={t(fsdStageEvidenceKey(fsdSummary.evidence.historical) as never)}
              />
            </div>
            {fsdSummary.catalog.availability === 'SEARCH_INCOMPLETE' ? (
              <p className="text-xs text-amber-800 dark:text-amber-200" role="status">
                {t('master.intelligence.vsi.fsd.searchIncomplete' as never)}
              </p>
            ) : null}
            {fsdSummary.execution.fsd4.historicalCrossStreamLink === 'UNVERIFIED_LINK' ? (
              <p className="text-xs text-amber-800 dark:text-amber-200" role="status">
                {t('master.intelligence.vsi.fsd.unverifiedLink' as never)}
              </p>
            ) : null}
            {fsdSummary.catalog.selectionLimitation ? (
              <p className="text-xs text-muted-foreground">
                {t('master.intelligence.vsi.cockpit.catalogLimitation' as never)}:{' '}
                <span className="font-mono">{fsdSummary.catalog.selectionLimitation}</span>
              </p>
            ) : null}
            <p className="text-[10px] text-muted-foreground">
              {t('master.intelligence.vsi.cockpit.fsd3Activity' as never)}:{' '}
              {formatTimestamp(fsdSummary.execution.fsd3.lastCompletedAt)}
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded border border-border bg-background px-2 py-1 text-xs hover:bg-muted/40"
                onClick={onOpenFsdSignals}
              >
                {t('master.intelligence.vsi.cockpit.openFsdSignals' as never)}
              </button>
            </div>
          </div>
        ) : !fsdSummaryLoading && !fsdSummaryError ? (
          <p className="text-xs text-muted-foreground">{t('master.intelligence.vsi.fsd.emptyScope' as never)}</p>
        ) : null}
      </MasterPageSection>

      <MasterPageSection title={t('master.intelligence.vsi.cockpit.profileTitle' as never)}>
        {selectedProfile && lv && rpm ? (
          <div className="grid gap-3 lg:grid-cols-2">
            <div className="rounded-lg border border-border/60 bg-card/30 p-3">
              <p className="text-xs font-medium">{t('master.intelligence.vsi.cockpit.lvCard' as never)}</p>
              <div className="mt-2">
                <SignalProfileBadge kind="lv" profile={lv.profile} limitationCode={lv.limitationCode} />
              </div>
              {selectedProfile.lvClassificationDecisionCode ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  {t('master.intelligence.vsi.decision.lv' as never, {
                    code: selectedProfile.lvClassificationDecisionCode,
                  })}
                </p>
              ) : null}
              {selectedProfile.lvEvidenceConfidence ? (
                <div className="mt-2">
                  <ProfileConfidenceIndicator level={mapConfidenceLevel(selectedProfile.lvEvidenceConfidence)} />
                </div>
              ) : null}
            </div>
            <div className="rounded-lg border border-border/60 bg-card/30 p-3">
              <p className="text-xs font-medium">{t('master.intelligence.vsi.cockpit.rpmCard' as never)}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <SignalProfileBadge kind="rpm" profile={rpm.profile} applicability={rpm.applicability} />
                {selectedProfile.observedDensityLabel ? (
                  <ObservedDensityBadge density={mapObservedDensity(selectedProfile.observedDensityLabel)} />
                ) : null}
              </div>
              {selectedProfile.rpmClassificationDecisionCode ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  {t('master.intelligence.vsi.decision.rpm' as never, {
                    code: selectedProfile.rpmClassificationDecisionCode,
                  })}
                </p>
              ) : null}
            </div>
            {selectedProfile.evaluationBlocked ? (
              <EvaluationBlockedBanner
                limitationCode={selectedProfile.evaluationBlockedCodes[0]}
                className="lg:col-span-2"
              />
            ) : null}
            <EvidenceFreshnessHint
              className="lg:col-span-2"
              kind={evidenceKindFromSummary(selectedProfile)}
              evaluatedAt={selectedProfile.evaluatedAt}
              providerSourceTimestamp={selectedProfile.lastMaterializedSourceTimestamp}
              providerFetchedAt={selectedProfile.lastMaterializedProviderFetchAt}
              profileRevision={selectedProfile.profileRevision}
            />
            {selectedProfile.profileLimitations.length ? (
              <ul className="lg:col-span-2 list-disc pl-4 text-xs text-muted-foreground">
                {selectedProfile.profileLimitations.map((code) => (
                  <li key={code} className="font-mono">
                    {code}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">{t('master.intelligence.vsi.noProfiles.body' as never)}</p>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded border border-border bg-background px-2 py-1 text-xs hover:bg-muted/40"
            onClick={onOpenCanonicalLedger}
          >
            {t('master.intelligence.vsi.cockpit.openCanonicalLedger' as never)}
          </button>
        </div>
      </MasterPageSection>

      {allProfiles.length > 1 ? (
        <MasterPageSection title={t('master.intelligence.section.fleetOverview' as never)}>
          <p className="mb-2 text-xs text-muted-foreground">
            {t('master.intelligence.vsi.cockpit.multiLink' as never, { count: allProfiles.length })}
          </p>
          <ul className="grid gap-2 sm:grid-cols-2">
            {allProfiles.map((p) => (
              <li key={p.providerSourceLinkId} className="rounded border border-border/40 px-2 py-1.5 text-xs font-mono">
                {p.provider ?? p.providerIdentity} · rev {p.profileRevision}
              </li>
            ))}
          </ul>
        </MasterPageSection>
      ) : null}
    </div>
  );
}
