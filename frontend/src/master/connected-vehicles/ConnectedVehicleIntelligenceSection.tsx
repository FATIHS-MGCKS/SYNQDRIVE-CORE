import { useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { useLanguage } from '../../i18n/LanguageContext';
import { isMasterAdmin } from '../../lib/auth';
import {
  EvaluationBlockedBanner,
  EvidenceFreshnessHint,
  ShadowVsRealPollHint,
} from '../intelligence/EvidenceFreshnessHint';
import { SignalProfileBadge } from '../intelligence/SignalProfileBadge';
import { navigateMasterIntelligenceCrossLink } from '../intelligence/master-intelligence-url';
import {
  assessEngineRpmDeepLinkEligibility,
  buildVehicleDetailIntelligenceNavContext,
  resolveNavPhysicalDeviceIdForProviderContext,
} from '../intelligence/vehicle-detail-intelligence.utils';
import {
  evidenceKindFromSummary,
  mapSummaryToLvBadge,
  mapSummaryToRpmBadge,
} from '../intelligence/vsi-master-intelligence-ui.utils';
import { useVehicleDetailMasterIntelligence } from './useVehicleDetailMasterIntelligence';
import { VehicleDetailSourceLinkPicker } from './VehicleDetailSourceLinkPicker';

type Props = {
  organizationId: string;
  vehicleId: string;
};

export function ConnectedVehicleIntelligenceSection({ organizationId, vehicleId }: Props) {
  if (!isMasterAdmin()) return null;
  return (
    <ConnectedVehicleIntelligenceSectionBody
      key={`${organizationId}:${vehicleId}`}
      organizationId={organizationId}
      vehicleId={vehicleId}
    />
  );
}

function ConnectedVehicleIntelligenceSectionBody({ organizationId, vehicleId }: Props) {
  const { t } = useLanguage();
  const enabled = true;
  const [selectedLinkId, setSelectedLinkId] = useState<string | null>(null);

  const { profiles, linkPick, activeProfile, apdsOverview, physicalDevice, loading, error, refresh } =
    useVehicleDetailMasterIntelligence({
      enabled,
      organizationId,
      vehicleId,
      selectedProviderSourceLinkId: selectedLinkId,
    });

  const physicalDeviceId = physicalDevice?.id ?? null;
  const providerNavPhysicalDeviceId = resolveNavPhysicalDeviceIdForProviderContext({
    profileCount: profiles.length,
    navigationReady: linkPick.navigationReady,
    physicalDeviceId,
  });

  const navContext = (vsiTarget?: 'overview' | 'ledger' | 'engine_rpm_detail') =>
    buildVehicleDetailIntelligenceNavContext({
      organizationId,
      vehicleId,
      providerSourceLinkId: linkPick.linkId,
      physicalDeviceId: providerNavPhysicalDeviceId,
      vsiTarget,
    });

  const pdiNavContext = () =>
    buildVehicleDetailIntelligenceNavContext({
      organizationId,
      vehicleId,
      providerSourceLinkId: linkPick.linkId,
      physicalDeviceId,
    });

  const navigationBlocked = !linkPick.navigationReady;
  const rpmEligibility = assessEngineRpmDeepLinkEligibility(activeProfile);

  const openVsiOverview = () => {
    if (navigationBlocked) return;
    navigateMasterIntelligenceCrossLink('vsi-intelligence', navContext('overview'));
  };
  const openVsiLedger = () => {
    if (navigationBlocked) return;
    navigateMasterIntelligenceCrossLink('vsi-intelligence', navContext('ledger'), {
      hygiene: { preserveVsiLedgerState: true },
    });
  };
  const openEngineRpmDetail = () => {
    if (navigationBlocked || !rpmEligibility.eligible) return;
    navigateMasterIntelligenceCrossLink('vsi-intelligence', navContext('engine_rpm_detail'), {
      hygiene: { preserveVsiLedgerState: true },
    });
  };
  const openApds = () => {
    if (navigationBlocked) return;
    navigateMasterIntelligenceCrossLink('apds-intelligence', navContext());
  };
  const openPdi = () => {
    if (!physicalDeviceId || navigationBlocked) return;
    navigateMasterIntelligenceCrossLink('device-inventory', pdiNavContext(), {
      hygiene: { physicalDeviceIdProven: true },
    });
  };

  const lv = activeProfile ? mapSummaryToLvBadge(activeProfile) : null;
  const rpm = activeProfile ? mapSummaryToRpmBadge(activeProfile) : null;
  const pdiNotApplicable =
    !physicalDevice && activeProfile?.rpmApplicability === 'NOT_APPLICABLE';

  return (
    <section className="space-y-3" aria-labelledby="cv-intelligence-heading">
      <div className="flex items-center justify-between gap-2">
        <h3
          id="cv-intelligence-heading"
          className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
        >
          {t('master.intelligence.vehicleDetail.sectionTitle' as never)}
        </h3>
        <Button type="button" variant="ghost" size="sm" className="h-8 px-2" onClick={() => void refresh()}>
          <RefreshCw className="h-3.5 w-3.5" aria-hidden />
          <span className="sr-only">{t('master.intelligence.vsi.retry' as never)}</span>
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground">
        {t('master.intelligence.vehicleDetail.readOnlyNote' as never)}
      </p>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          {t('master.intelligence.vehicleDetail.loading' as never)}
        </div>
      ) : error ? (
        <div className="rounded-xl border border-border p-3 text-xs text-muted-foreground" role="alert">
          <p>{t('master.intelligence.vehicleDetail.error' as never)}</p>
          <p className="mt-1 font-mono">{error}</p>
        </div>
      ) : (
        <>
          <VehicleDetailSourceLinkPicker
            profiles={profiles}
            selectedLinkId={selectedLinkId}
            onSelectLinkId={setSelectedLinkId}
            staleSelection={linkPick.staleSelection}
          />

          {linkPick.ambiguous && !linkPick.navigationReady ? (
            <p className="text-[10px] text-muted-foreground" role="status">
              {t('master.intelligence.vehicleDetail.selectSourceLink.required' as never)}
            </p>
          ) : null}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-border p-3 space-y-2">
              <p className="text-xs font-medium">{t('master.intelligence.crossLink.vsi' as never)}</p>
              {activeProfile && lv && rpm && linkPick.navigationReady ? (
                <>
                  <div className="flex flex-wrap gap-1.5">
                    <SignalProfileBadge kind="lv" profile={lv.profile} limitationCode={lv.limitationCode} />
                    <SignalProfileBadge kind="rpm" profile={rpm.profile} applicability={rpm.applicability} />
                  </div>
                  {activeProfile.evaluationBlocked ? (
                    <EvaluationBlockedBanner limitationCode={activeProfile.evaluationBlockedCodes[0]} />
                  ) : null}
                  <EvidenceFreshnessHint
                    kind={evidenceKindFromSummary(activeProfile)}
                    evaluatedAt={activeProfile.evaluatedAt}
                    providerSourceTimestamp={activeProfile.lastMaterializedSourceTimestamp}
                    providerFetchedAt={activeProfile.lastMaterializedProviderFetchAt}
                    profileRevision={activeProfile.profileRevision}
                  />
                </>
              ) : profiles.length === 0 ? (
                <p className="text-[11px] text-muted-foreground">
                  {t('master.intelligence.vsi.noProfiles.body' as never)}
                </p>
              ) : (
                <p className="text-[11px] text-muted-foreground">
                  {t('master.intelligence.vehicleDetail.selectSourceLink.summaryPending' as never)}
                </p>
              )}

              <div className="flex flex-col gap-1 pt-1">
                <button
                  type="button"
                  className="text-left text-xs font-medium text-primary underline disabled:opacity-50 disabled:no-underline"
                  onClick={openVsiOverview}
                  disabled={navigationBlocked}
                >
                  {t('master.intelligence.vehicleDetail.openVsiOverview' as never)}
                </button>
                <button
                  type="button"
                  className="text-left text-xs font-medium text-primary underline disabled:opacity-50 disabled:no-underline"
                  onClick={openVsiLedger}
                  disabled={navigationBlocked}
                >
                  {t('master.intelligence.vehicleDetail.openVsiLedger' as never)}
                </button>
                {rpmEligibility.eligible ? (
                  <>
                    <button
                      type="button"
                      className="text-left text-xs font-medium text-primary underline disabled:opacity-50"
                      onClick={openEngineRpmDetail}
                      disabled={navigationBlocked}
                    >
                      {t('master.intelligence.vehicleDetail.openEngineRpmDetail' as never)}
                    </button>
                    <p className="text-[10px] text-muted-foreground">
                      {t('master.intelligence.vehicleDetail.engineRpmDeepLinkNote' as never)}
                    </p>
                  </>
                ) : linkPick.navigationReady && activeProfile ? (
                  <p className="text-[10px] text-muted-foreground">
                    {t(
                      `master.intelligence.vehicleDetail.engineRpmUnavailable.${rpmEligibility.reasonKey}` as never,
                    )}
                  </p>
                ) : null}
              </div>
            </div>

            <div className="rounded-xl border border-border p-3 space-y-2">
              <p className="text-xs font-medium">{t('master.intelligence.crossLink.apds' as never)}</p>
              {apdsOverview && linkPick.navigationReady ? (
                <>
                  <p className="text-[11px] font-medium">
                    {t(`master.intelligence.apds.availability.${apdsOverview.availability}` as never)}
                  </p>
                  {apdsOverview.latestDecision ? (
                    <p className="text-[10px] text-muted-foreground">
                      {t('master.intelligence.apds.latestDecision' as never)}:{' '}
                      {apdsOverview.latestDecision.decision} ·{' '}
                      {apdsOverview.latestDecision.opportunityIdPrefix}
                    </p>
                  ) : (
                    <p className="text-[10px] text-muted-foreground">
                      {t('master.intelligence.vehicleDetail.noApdsDecision' as never)}
                    </p>
                  )}
                  <ShadowVsRealPollHint className="text-[10px]" />
                </>
              ) : linkPick.ambiguous && !linkPick.navigationReady ? (
                <p className="text-[11px] text-muted-foreground">
                  {t('master.intelligence.vehicleDetail.selectSourceLink.apdsPending' as never)}
                </p>
              ) : (
                <p className="text-[11px] text-muted-foreground">—</p>
              )}
              <button
                type="button"
                className="text-xs font-medium text-primary underline disabled:opacity-50 disabled:no-underline"
                onClick={openApds}
                disabled={navigationBlocked}
              >
                {t('master.intelligence.vehicleDetail.openApds' as never)}
              </button>
            </div>

            <div className="rounded-xl border border-border p-3 space-y-2">
              <p className="text-xs font-medium">{t('master.intelligence.crossLink.device' as never)}</p>
              {physicalDevice ? (
                <>
                  <p className="text-[11px]">
                    {physicalDevice.modelCode} · {physicalDevice.identityStatus}
                  </p>
                  <p className="text-[10px] font-mono text-muted-foreground">
                    {physicalDevice.serialNumberMasked ?? '—'}
                  </p>
                </>
              ) : pdiNotApplicable ? (
                <p className="text-[11px] text-muted-foreground">
                  {t('master.intelligence.pdi.notApplicableR1' as never)}
                </p>
              ) : (
                <p className="text-[11px] text-muted-foreground">
                  {t('master.intelligence.vehicleDetail.noPhysicalDevice' as never)}
                </p>
              )}
              <button
                type="button"
                className="text-xs font-medium text-primary underline disabled:opacity-50"
                onClick={openPdi}
                disabled={!physicalDeviceId}
              >
                {t('master.intelligence.vehicleDetail.openPdi' as never)}
              </button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
