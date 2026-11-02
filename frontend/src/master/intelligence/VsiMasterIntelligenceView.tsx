import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { MasterPageHeader, MasterPageSection, MasterPageTabs } from '../shell';
import { MasterIntelligenceContextProvider } from './MasterIntelligenceContextProvider';
import { useMasterIntelligenceContext } from './useMasterIntelligenceContext';
import { IntelligenceCrossLink } from './IntelligenceCrossLink';
import { IntelligenceEmptyState } from './IntelligenceEmptyState';
import {
  EvaluationBlockedBanner,
  EvidenceFreshnessHint,
} from './EvidenceFreshnessHint';
import {
  ObservedDensityBadge,
  ProfileConfidenceIndicator,
  SignalProfileBadge,
} from './SignalProfileBadge';
import { useLanguage } from '../../i18n/LanguageContext';
import { api } from '../../lib/api';
import { cn } from '../../components/ui/utils';
import { useVsiMasterIntelligenceData } from './useVsiMasterIntelligenceData';
import {
  evidenceKindFromSummary,
  mapConfidenceLevel,
  mapObservedDensity,
  mapSummaryToLvBadge,
  mapSummaryToRpmBadge,
} from './vsi-master-intelligence-ui.utils';
import type { MasterVsiProfileSummaryDto } from './vsi-master-intelligence-api.types';
import { VsiSignalLedgerTab } from './ledger/VsiSignalLedgerTab';
import {
  EMPTY_VSI_LEDGER_FILTERS,
  type VsiIntelligenceTab,
  type VsiLedgerFilterState,
} from './vsi-ledger-url.types';
import {
  ledgerContextForVehicleChange,
  pruneLedgerFiltersForSignals,
} from './vsi-ledger-url.util';
import { applyVerifiedProviderSourceLink } from './master-intelligence-context-hygiene.util';

function formatUtcProvenance(iso: string | null | undefined, locale: string): string {
  if (!iso) return '—';
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return '—';
  const d = new Date(ms);
  return `${d.toISOString()} (${d.toLocaleString(locale)})`;
}

function ProfileSummaryCard({ profile }: { profile: MasterVsiProfileSummaryDto }) {
  const { t } = useLanguage();
  const lv = mapSummaryToLvBadge(profile);
  const rpm = mapSummaryToRpmBadge(profile);

  return (
    <div className="rounded-lg border border-border/60 bg-card/30 p-3 text-xs">
      <p className="font-medium">{profile.provider ?? profile.providerIdentity}</p>
      <p className="mt-1 font-mono text-[10px] text-muted-foreground">{profile.providerSourceLinkId}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <SignalProfileBadge kind="lv" profile={lv.profile} limitationCode={lv.limitationCode} />
        <SignalProfileBadge kind="rpm" profile={rpm.profile} applicability={rpm.applicability} />
        {profile.observedDensityLabel ? (
          <ObservedDensityBadge density={mapObservedDensity(profile.observedDensityLabel)} />
        ) : null}
        {profile.lvEvidenceConfidence ? (
          <ProfileConfidenceIndicator level={mapConfidenceLevel(profile.lvEvidenceConfidence)} />
        ) : null}
      </div>
      {profile.evaluationBlocked ? (
        <EvaluationBlockedBanner
          limitationCode={profile.evaluationBlockedCodes[0]}
          className="mt-3"
        />
      ) : null}
      <EvidenceFreshnessHint
        className="mt-3"
        kind={evidenceKindFromSummary(profile)}
        evaluatedAt={profile.evaluatedAt}
        providerSourceTimestamp={profile.lastMaterializedSourceTimestamp}
        providerFetchedAt={profile.lastMaterializedProviderFetchAt}
        profileRevision={profile.profileRevision}
      />
      {profile.lvClassificationDecisionCode ? (
        <p className="mt-2 text-muted-foreground">
          {t('master.intelligence.vsi.decision.lv' as never, {
            code: profile.lvClassificationDecisionCode,
          })}
        </p>
      ) : null}
      {profile.rpmClassificationDecisionCode ? (
        <p className="text-muted-foreground">
          {t('master.intelligence.vsi.decision.rpm' as never, {
            code: profile.rpmClassificationDecisionCode,
          })}
        </p>
      ) : null}
    </div>
  );
}

function VsiMasterIntelligenceContent() {
  const { t, locale } = useLanguage();
  const { context, setContextInUrl } = useMasterIntelligenceContext();
  const [orgOptions, setOrgOptions] = useState<Array<{ id: string; label: string }>>([]);
  const [vehicleOptions, setVehicleOptions] = useState<Array<{ id: string; label: string }>>([]);
  const [scopeLoading, setScopeLoading] = useState(false);

  const {
    overview,
    profile,
    revisions,
    revisionAsOf,
    capabilityExplanation,
    loading,
    error,
    revisionsError,
    revisionsLoading,
    refresh,
    refreshRevisions,
  } = useVsiMasterIntelligenceData({
    orgId: context.orgId,
    vehicleId: context.vehicleId,
    providerSourceLinkId: context.providerSourceLinkId,
    asOf: context.asOf,
  });

  const formatTimestamp = useCallback(
    (iso: string | null | undefined) => formatUtcProvenance(iso, locale),
    [locale],
  );

  useEffect(() => {
    if (!overview?.profiles.length || !context.providerSourceLinkId) return;
    const ids = overview.profiles.map((p) => p.providerSourceLinkId);
    if (ids.includes(context.providerSourceLinkId)) return;
    const reconciled = applyVerifiedProviderSourceLink(context, ids);
    setContextInUrl(
      {
        providerSourceLinkId: reconciled.providerSourceLinkId,
        vsiTab: reconciled.vsiTab,
        signalKey: reconciled.signalKey,
        ledgerFilters: reconciled.ledgerFilters,
      },
      { replace: true },
    );
  }, [overview, context.providerSourceLinkId, setContextInUrl]);

  useEffect(() => {
    if (!profile) return;
    if (context.signalKey && !profile.signals.some((s) => s.canonicalSignalKey === context.signalKey)) {
      setContextInUrl({ signalKey: null }, { replace: true });
    }
  }, [context.signalKey, profile, setContextInUrl]);

  useEffect(() => {
    if (!profile) return;
    const pruned = pruneLedgerFiltersForSignals(context.ledgerFilters, profile.signals);
    const same =
      JSON.stringify(pruned) === JSON.stringify(context.ledgerFilters);
    if (!same) {
      setContextInUrl({ ledgerFilters: pruned }, { replace: true });
    }
  }, [profile, context.ledgerFilters, setContextInUrl]);

  const linkOptions = useMemo(
    () =>
      (overview?.profiles ?? []).map((p) => ({
        id: p.providerSourceLinkId,
        label: `${p.provider ?? p.providerIdentity} · rev ${p.profileRevision}`,
      })),
    [overview],
  );

  const selectedLinkId = context.providerSourceLinkId;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setScopeLoading(true);
      try {
        const res = await api.organizations.listOperational({ limit: 100, page: 1 });
        if (cancelled) return;
        setOrgOptions(
          res.data.map((o) => ({
            id: o.id,
            label: o.companyName ?? o.id,
          })),
        );
      } catch {
        if (!cancelled) setOrgOptions([]);
      } finally {
        if (!cancelled) setScopeLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!context.orgId) {
      setVehicleOptions([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await api.vehicles.listByOrg(context.orgId!, { limit: 200 });
        if (cancelled) return;
        setVehicleOptions(
          res.data.map((v: { id: string; make?: string; model?: string; licensePlate?: string }) => ({
            id: v.id,
            label: [v.make, v.model, v.licensePlate].filter(Boolean).join(' · ') || v.id,
          })),
        );
      } catch {
        if (!cancelled) setVehicleOptions([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [context.orgId]);

  const onOrgChange = useCallback(
    (orgId: string) => {
      setContextInUrl(
        ledgerContextForVehicleChange({
          orgId: orgId || null,
          vehicleId: null,
          providerSourceLinkId: null,
        }),
      );
    },
    [setContextInUrl],
  );

  const onVehicleChange = useCallback(
    (vehicleId: string) => {
      setContextInUrl(
        ledgerContextForVehicleChange({
          vehicleId: vehicleId || null,
          providerSourceLinkId: null,
        }),
      );
    },
    [setContextInUrl],
  );

  const onLinkChange = useCallback(
    (providerSourceLinkId: string) => {
      setContextInUrl({ providerSourceLinkId: providerSourceLinkId || null, signalKey: null });
    },
    [setContextInUrl],
  );

  const onTabChange = useCallback(
    (tab: VsiIntelligenceTab) => {
      setContextInUrl({ vsiTab: tab }, { replace: true });
    },
    [setContextInUrl],
  );

  const ledgerFilters = context.ledgerFilters;
  const onFiltersChange = useCallback(
    (patch: Partial<VsiLedgerFilterState>) => {
      setContextInUrl({ ledgerFilters: { ...ledgerFilters, ...patch } }, { replace: true });
    },
    [ledgerFilters, setContextInUrl],
  );

  const onFiltersClear = useCallback(() => {
    setContextInUrl({ ledgerFilters: { ...EMPTY_VSI_LEDGER_FILTERS } }, { replace: true });
  }, [setContextInUrl]);

  const onOpenSignal = useCallback(
    (canonicalSignalKey: string) => {
      setContextInUrl({ signalKey: canonicalSignalKey, vsiTab: 'ledger' });
    },
    [setContextInUrl],
  );

  const onCloseSignal = useCallback(() => {
    setContextInUrl({ signalKey: null }, { replace: true });
  }, [setContextInUrl]);

  const onNavigateSignal = useCallback(
    (canonicalSignalKey: string) => {
      setContextInUrl({ signalKey: canonicalSignalKey, vsiTab: 'ledger' }, { replace: true });
    },
    [setContextInUrl],
  );

  const vehicleContextLabel = useMemo(() => {
    const v = vehicleOptions.find((o) => o.id === context.vehicleId);
    return v?.label ?? context.vehicleId;
  }, [vehicleOptions, context.vehicleId]);

  const linkContextLabel = useMemo(() => {
    const link = linkOptions.find((l) => l.id === selectedLinkId);
    return link?.label ?? selectedLinkId;
  }, [linkOptions, selectedLinkId]);

  const hasScope = Boolean(context.orgId && context.vehicleId);
  const activeTab = context.vsiTab;

  const tabs = useMemo(
    () => [
      {
        id: 'overview' as const,
        label: t('master.intelligence.vsi.tabs.overview' as never),
      },
      {
        id: 'ledger' as const,
        label: t('master.intelligence.vsi.tabs.ledger' as never),
        disabled: !profile,
      },
      {
        id: 'revisions' as const,
        label: t('master.intelligence.vsi.tabs.revisions' as never),
      },
    ],
    [t, profile],
  );

  return (
    <>
      <MasterPageHeader
        title={t('master.intelligence.vsi.title' as never)}
        description={t('master.intelligence.vsi.description' as never)}
      />

      {context.rejectedParams.length > 0 ? (
        <p className="text-xs text-amber-800 dark:text-amber-200" role="status">
          {t('master.intelligence.url.invalidParams' as never, {
            params: context.rejectedParams.join(', '),
          })}
        </p>
      ) : null}

      <MasterPageSection title={t('master.intelligence.section.fleetOverview' as never)}>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-muted-foreground">{t('master.intelligence.vsi.picker.org' as never)}</span>
            <select
              className="rounded border border-border bg-background px-2 py-1.5 font-mono text-[11px]"
              value={context.orgId ?? ''}
              onChange={(e) => onOrgChange(e.target.value)}
              disabled={scopeLoading}
            >
              <option value="">—</option>
              {orgOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-muted-foreground">
              {t('master.intelligence.vsi.picker.vehicle' as never)}
            </span>
            <select
              className="rounded border border-border bg-background px-2 py-1.5 font-mono text-[11px]"
              value={context.vehicleId ?? ''}
              onChange={(e) => onVehicleChange(e.target.value)}
              disabled={!context.orgId}
            >
              <option value="">—</option>
              {vehicleOptions.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-muted-foreground">{t('master.intelligence.vsi.picker.link' as never)}</span>
            <select
              className="rounded border border-border bg-background px-2 py-1.5 font-mono text-[11px]"
              value={selectedLinkId ?? ''}
              onChange={(e) => onLinkChange(e.target.value)}
              disabled={!hasScope || linkOptions.length === 0}
            >
              <option value="">—</option>
              {linkOptions.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {loading ? (
          <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            {t('master.intelligence.vsi.loading' as never)}
          </p>
        ) : null}
        {error ? (
          <div className="mt-3 rounded border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive" role="alert">
            <p>{t('master.intelligence.vsi.error' as never)}</p>
            <p className="mt-1 font-mono">{error}</p>
            <button type="button" className="mt-2 underline" onClick={() => void refresh()}>
              {t('master.intelligence.vsi.retry' as never)}
            </button>
          </div>
        ) : null}

        {!hasScope ? (
          <IntelligenceEmptyState
            titleKey="master.intelligence.vsi.empty.selectScope.title"
            bodyKey="master.intelligence.vsi.empty.selectScope.body"
            className="mt-4"
          />
        ) : null}

        {hasScope && !loading && !error && overview && overview.profiles.length === 0 ? (
          <IntelligenceEmptyState
            titleKey="master.intelligence.vsi.noProfiles.title"
            bodyKey="master.intelligence.vsi.noProfiles.body"
            className="mt-4"
          />
        ) : null}
      </MasterPageSection>

      {hasScope ? (
        <MasterPageTabs
          tabs={tabs}
          activeId={activeTab}
          onChange={onTabChange}
          ariaLabel={t('master.intelligence.vsi.tabs.ariaLabel' as never)}
          testIdPrefix="vsi-intelligence"
        />
      ) : null}

      {hasScope && activeTab === 'overview' ? (
        <MasterPageSection title={t('master.intelligence.vsi.tabs.overview' as never)}>
          {overview && overview.profiles.length > 0 ? (
            <div className="grid gap-3 lg:grid-cols-2">
              {overview.profiles.map((p) => (
                <ProfileSummaryCard key={p.providerSourceLinkId} profile={p} />
              ))}
            </div>
          ) : null}
        </MasterPageSection>
      ) : null}

      {hasScope && activeTab === 'ledger' ? (
        <MasterPageSection title={t('master.intelligence.vsi.tabs.ledger' as never)}>
          {!profile && loading ? (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              {t('master.intelligence.vsi.loading' as never)}
            </p>
          ) : null}
          {profile ? (
            <VsiSignalLedgerTab
              profile={profile}
              multiLinkCount={overview?.profiles.length ?? 0}
              filters={context.ledgerFilters}
              onFiltersChange={onFiltersChange}
              onFiltersClear={onFiltersClear}
              selectedSignalKey={context.signalKey}
              onOpenSignal={onOpenSignal}
              onCloseSignal={onCloseSignal}
              onNavigateSignal={onNavigateSignal}
              vehicleContextLabel={vehicleContextLabel ?? null}
              linkContextLabel={linkContextLabel ?? null}
              formatTimestamp={formatTimestamp}
            />
          ) : !loading && !error ? (
            <IntelligenceEmptyState
              titleKey="master.intelligence.vsi.noProfiles.title"
              bodyKey="master.intelligence.vsi.noProfiles.body"
            />
          ) : null}
        </MasterPageSection>
      ) : null}

      {hasScope && activeTab === 'revisions' ? (
        <>
          {revisionsError ? (
            <MasterPageSection title={t('master.intelligence.section.revisions' as never)}>
              <div className="rounded border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive" role="alert">
                <p>{t('master.intelligence.vsi.revision.loadError' as never)}</p>
                <p className="mt-1 font-mono">{revisionsError}</p>
                <button type="button" className="mt-2 underline" onClick={() => void refreshRevisions()}>
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
                  <p className="mt-1 text-muted-foreground">
                    {t('master.intelligence.vsi.revision.notCapturedExplain' as never)}
                  </p>
                </div>
              ) : (
                <>
                  <ul className="space-y-2 text-xs">
                    {revisions.items.map((item) => (
                      <li
                        key={item.profileRevision}
                        className="rounded border border-border/50 px-2 py-1.5 font-mono"
                      >
                        rev {item.profileRevision} · LV {item.lvStandbyProfile} · RPM {item.rpmActiveProfile}
                        <span className="ml-2 text-muted-foreground">
                          {formatTimestamp(item.evaluatedAt)}
                        </span>
                      </li>
                    ))}
                  </ul>
                  {revisions.page.hasMore ? (
                    <p className="mt-2 text-muted-foreground">
                      {t('master.intelligence.vsi.revision.moreAvailable' as never)}
                    </p>
                  ) : null}
                </>
              )}
            </MasterPageSection>
          ) : null}

          {revisionAsOf && context.asOf ? (
            <MasterPageSection title={t('master.intelligence.vsi.asOf.title' as never)}>
              <p className="text-xs text-muted-foreground">
                {t('master.intelligence.vsi.asOf.decisionAt' as never)}:{' '}
                {formatTimestamp(revisionAsOf.decisionAt)}
              </p>
              <p className="mt-1 text-xs">
                {t('master.intelligence.vsi.asOf.authority' as never)}: {revisionAsOf.authority}
              </p>
              {revisionAsOf.selectedRevision ? (
                <p className="mt-1 font-mono text-xs">
                  rev {revisionAsOf.selectedRevision.profileRevision} · LV{' '}
                  {revisionAsOf.selectedRevision.lvStandbyProfile}
                </p>
              ) : null}
            </MasterPageSection>
          ) : null}

          {capabilityExplanation ? (
            <MasterPageSection title={t('master.intelligence.section.capability' as never)}>
              <pre
                className={cn(
                  'max-h-64 overflow-auto rounded border border-border/50 bg-muted/20 p-2 text-[10px]',
                )}
              >
                {JSON.stringify(capabilityExplanation, null, 2)}
              </pre>
            </MasterPageSection>
          ) : null}
        </>
      ) : null}

      <MasterPageSection title={t('master.intelligence.section.crossLinks' as never)}>
        <div className="flex flex-wrap gap-2">
          <IntelligenceCrossLink target="vehicles" />
          <IntelligenceCrossLink target="device-inventory" />
          <IntelligenceCrossLink target="apds-intelligence" />
        </div>
      </MasterPageSection>
    </>
  );
}

export function VsiMasterIntelligenceView() {
  return (
    <MasterIntelligenceContextProvider view="vsi-intelligence">
      <VsiMasterIntelligenceContent />
    </MasterIntelligenceContextProvider>
  );
}
