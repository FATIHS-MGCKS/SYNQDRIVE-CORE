import { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { MasterPageHeader, MasterPageSection } from '../shell';
import { MasterIntelligenceContextProvider } from './MasterIntelligenceContextProvider';
import { useMasterIntelligenceContext } from './useMasterIntelligenceContext';
import { IntelligenceCrossLink } from './IntelligenceCrossLink';
import { IntelligenceEmptyState } from './IntelligenceEmptyState';
import { ShadowVsRealPollHint } from './EvidenceFreshnessHint';
import { useLanguage } from '../../i18n/LanguageContext';
import { api } from '../../lib/api';
import { cn } from '../../components/ui/utils';
import { useApdsMasterIntelligenceData } from './useApdsMasterIntelligenceData';
import type { MasterApdsDecisionSummaryDto } from './apds-master-intelligence-api.types';
import { ledgerContextForVehicleChange } from './vsi-ledger-url.util';

function formatTime(iso: string | null | undefined, locale: string): string {
  if (!iso) return '—';
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return '—';
  const d = new Date(ms);
  return `${d.toISOString()} (${d.toLocaleString(locale)})`;
}

function AvailabilityBanner({ code, explanations }: { code: string; explanations: string[] }) {
  const { t } = useLanguage();
  return (
    <div className="rounded border border-border/60 bg-muted/20 p-3 text-xs" role="status">
      <p className="font-medium">{t(`master.intelligence.apds.availability.${code}` as never)}</p>
      {explanations.length > 0 ? (
        <ul className="mt-1 list-inside list-disc text-muted-foreground">
          {explanations.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function ApdsMasterIntelligenceContent() {
  const { t, locale } = useLanguage();
  const { context, setContextInUrl, navigateCrossLink } = useMasterIntelligenceContext();
  const [orgOptions, setOrgOptions] = useState<Array<{ id: string; label: string }>>([]);
  const [vehicleOptions, setVehicleOptions] = useState<Array<{ id: string; label: string }>>([]);
  const [linkOptions, setLinkOptions] = useState<Array<{ id: string; label: string }>>([]);

  const { overview, epochs, decisions, detail, vsiCorrelation, loading, error, refresh } =
    useApdsMasterIntelligenceData({
      orgId: context.orgId,
      vehicleId: context.vehicleId,
      providerSourceLinkId: context.providerSourceLinkId,
      apdOpportunityId: context.apdOpportunityId,
      policyVersion: context.policyVersion,
    });

  useEffect(() => {
    void (async () => {
      try {
        const res = await api.organizations.listOperational({ limit: 100, page: 1 });
        setOrgOptions(res.data.map((o) => ({ id: o.id, label: o.companyName ?? o.id })));
      } catch {
        setOrgOptions([]);
      }
    })();
  }, []);

  useEffect(() => {
    if (!context.orgId) {
      setVehicleOptions([]);
      return;
    }
    void (async () => {
      try {
        const res = await api.vehicles.listByOrg(context.orgId!, { limit: 200 });
        setVehicleOptions(
          res.data.map((v: { id: string; make?: string; model?: string; licensePlate?: string }) => ({
            id: v.id,
            label: [v.make, v.model, v.licensePlate].filter(Boolean).join(' · ') || v.id,
          })),
        );
      } catch {
        setVehicleOptions([]);
      }
    })();
  }, [context.orgId]);

  useEffect(() => {
    if (!context.orgId || !context.vehicleId) {
      setLinkOptions([]);
      return;
    }
    void (async () => {
      try {
        const res = await api.admin.masterIntelligenceVsi.overview(context.orgId!, context.vehicleId!);
        setLinkOptions(
          res.profiles.map((p) => ({
            id: p.providerSourceLinkId,
            label: `${p.provider ?? p.providerIdentity}`,
          })),
        );
      } catch {
        setLinkOptions([]);
      }
    })();
  }, [context.orgId, context.vehicleId]);

  useEffect(() => {
    if (!context.providerSourceLinkId || linkOptions.length === 0) return;
    const ids = linkOptions.map((l) => l.id);
    if (!ids.includes(context.providerSourceLinkId)) {
      setContextInUrl(
        {
          providerSourceLinkId: null,
          apdOpportunityId: null,
          ...ledgerContextForVehicleChange({}),
        },
        { replace: true },
      );
    }
  }, [linkOptions, context.providerSourceLinkId, setContextInUrl]);

  const selectDecision = useCallback(
    (row: MasterApdsDecisionSummaryDto) => {
      setContextInUrl({
        apdOpportunityId: row.opportunityId,
        policyVersion: row.policyVersion,
        asOf: row.decisionAt,
      });
    },
    [setContextInUrl],
  );

  const openVsiAtDecision = useCallback(() => {
    if (!detail) return;
    navigateCrossLink('vsi-intelligence', {
      asOf: detail.summary.decisionAt,
    });
  }, [detail, navigateCrossLink]);

  const hasScope = Boolean(context.orgId && context.vehicleId);

  return (
    <>
      <MasterPageHeader
        title={t('master.intelligence.apds.title' as never)}
        description={t('master.intelligence.apds.description' as never)}
      />

      <MasterPageSection title={t('master.intelligence.section.fleetOverview' as never)}>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-muted-foreground">{t('master.intelligence.vsi.picker.org' as never)}</span>
            <select
              className="rounded border border-border bg-background px-2 py-1.5 font-mono text-[11px]"
              value={context.orgId ?? ''}
              onChange={(e) =>
                setContextInUrl({
                  orgId: e.target.value || null,
                  vehicleId: null,
                  providerSourceLinkId: null,
                  apdOpportunityId: null,
                  ...ledgerContextForVehicleChange({}),
                })
              }
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
            <span className="text-muted-foreground">{t('master.intelligence.vsi.picker.vehicle' as never)}</span>
            <select
              className="rounded border border-border bg-background px-2 py-1.5 font-mono text-[11px]"
              value={context.vehicleId ?? ''}
              onChange={(e) =>
                setContextInUrl({
                  vehicleId: e.target.value || null,
                  providerSourceLinkId: null,
                  apdOpportunityId: null,
                  ...ledgerContextForVehicleChange({}),
                })
              }
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
              value={context.providerSourceLinkId ?? ''}
              onChange={(e) => setContextInUrl({ providerSourceLinkId: e.target.value || null })}
              disabled={!hasScope}
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
            {t('master.intelligence.apds.loading' as never)}
          </p>
        ) : null}
        {error ? (
          <div className="mt-3 rounded border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
            <p>{t('master.intelligence.apds.error' as never)}</p>
            <p className="mt-1 font-mono">{error}</p>
            <button type="button" className="mt-2 underline" onClick={() => void refresh()}>
              {t('master.intelligence.vsi.retry' as never)}
            </button>
          </div>
        ) : null}

        {!hasScope ? (
          <IntelligenceEmptyState
            titleKey="master.intelligence.apds.empty.selectScope.title"
            bodyKey="master.intelligence.apds.empty.selectScope.body"
            className="mt-4"
          />
        ) : null}

        {overview ? (
          <div className="mt-4 space-y-3">
            <AvailabilityBanner code={overview.availability} explanations={overview.availabilityExplanation} />
            {overview.latestDecision ? (
              <div className="rounded border border-border/50 p-3 text-xs">
                <p className="font-medium">{t('master.intelligence.apds.latestDecision' as never)}</p>
                <p className="mt-1 font-mono">{overview.latestDecision.opportunityIdPrefix}</p>
                <p className="text-muted-foreground">
                  {overview.latestDecision.policyVersion} · {overview.latestDecision.reason}
                </p>
                <p className="tabular-nums">{formatTime(overview.latestDecision.decisionAt, locale)}</p>
              </div>
            ) : null}
            {overview.activeEpoch ? (
              <p className="text-xs text-muted-foreground">
                {t('master.intelligence.apds.activeEpoch' as never)}: {overview.activeEpoch.lifecycleState} (
                {overview.activeEpoch.b2PolicyVersion})
              </p>
            ) : null}
          </div>
        ) : null}
      </MasterPageSection>

      {epochs && epochs.items.length > 0 ? (
        <MasterPageSection title={t('master.intelligence.apds.section.epochs' as never)}>
          <ul className="space-y-2 text-xs">
            {epochs.items.map((ep) => (
              <li key={ep.idPrefix} className="rounded border border-border/40 px-2 py-1.5">
                <span className="font-medium">{ep.lifecycleState}</span> · {ep.b2PolicyVersion}
                <span className="ml-2 text-muted-foreground">{formatTime(ep.preparedAt, locale)}</span>
                {ep.vehicleDecisionCount != null ? (
                  <span className="ml-2 text-muted-foreground">
                    ({ep.vehicleDecisionCount} {t('master.intelligence.apds.decisionsForVehicle' as never)})
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </MasterPageSection>
      ) : null}

      {decisions && decisions.items.length > 0 ? (
        <MasterPageSection title={t('master.intelligence.apds.section.decisions' as never)}>
          <div className="overflow-x-auto rounded border border-border/60">
            <table className="w-full min-w-[720px] text-left text-xs">
              <thead className="bg-muted/40 text-muted-foreground">
                <tr>
                  <th className="px-2 py-1.5">{t('master.intelligence.apds.col.time' as never)}</th>
                  <th className="px-2 py-1.5">{t('master.intelligence.apds.col.reason' as never)}</th>
                  <th className="px-2 py-1.5">{t('master.intelligence.apds.col.policy' as never)}</th>
                  <th className="px-2 py-1.5">{t('master.intelligence.apds.col.realPoll' as never)}</th>
                </tr>
              </thead>
              <tbody>
                {decisions.items.map((row) => (
                  <tr
                    key={row.id}
                    className={cn(
                      'cursor-pointer border-t border-border/40 hover:bg-muted/30',
                      context.apdOpportunityId &&
                        detail?.summary.id === row.id &&
                        'bg-primary/5',
                    )}
                    onClick={() => selectDecision(row)}
                  >
                    <td className="px-2 py-1.5 tabular-nums">{formatTime(row.decisionAt, locale)}</td>
                    <td className="px-2 py-1.5">{row.reason}</td>
                    <td className="px-2 py-1.5 font-mono">{row.policyVersion}</td>
                    <td className="px-2 py-1.5">
                      {t(`master.intelligence.apds.realPoll.${row.realPollLinkStatus}` as never)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            {t('master.intelligence.apds.shadowNotReal' as never)}
          </p>
        </MasterPageSection>
      ) : null}

      {detail ? (
        <MasterPageSection title={t('master.intelligence.apds.section.detail' as never)}>
          <ShadowVsRealPollHint className="mb-3" />
          <div className="grid gap-3 lg:grid-cols-2">
            <div className="rounded border border-border/50 p-3 text-xs">
              <p className="font-medium">{t('master.intelligence.apds.detail.shadow' as never)}</p>
              <pre className="mt-2 max-h-48 overflow-auto text-[10px]">
                {JSON.stringify(detail.persistedOutputs, null, 2)}
              </pre>
            </div>
            <div className="rounded border border-border/50 p-3 text-xs">
              <p className="font-medium">{t('master.intelligence.apds.detail.realPoll' as never)}</p>
              {detail.realPollEvidence ? (
                <pre className="mt-2 max-h-48 overflow-auto text-[10px]">
                  {JSON.stringify(detail.realPollEvidence, null, 2)}
                </pre>
              ) : (
                <p className="mt-2 text-muted-foreground">
                  {t('master.intelligence.apds.realPoll.NOT_LINKED' as never)}
                </p>
              )}
            </div>
          </div>
          {detail.missingEvidence.length > 0 ? (
            <p className="mt-2 text-xs text-amber-800 dark:text-amber-200">
              {detail.missingEvidence.join(', ')}
            </p>
          ) : null}
          {vsiCorrelation ? (
            <div className="mt-3 rounded border border-border/50 p-3 text-xs">
              <p className="font-medium">{t('master.intelligence.apds.detail.vsiCorrelation' as never)}</p>
              <p className="text-muted-foreground">{vsiCorrelation.offlineCorrelationNote}</p>
              <p className="mt-1">
                {t('master.intelligence.apds.vsiNotRuntimeDriver' as never)}
              </p>
            </div>
          ) : null}
          <button
            type="button"
            className="mt-3 text-xs font-medium text-primary underline"
            onClick={openVsiAtDecision}
            disabled={!context.providerSourceLinkId}
          >
            {t('master.intelligence.apds.openVsiAsOf' as never)}
          </button>
        </MasterPageSection>
      ) : null}

      <MasterPageSection title={t('master.intelligence.section.crossLinks' as never)}>
        <div className="flex flex-wrap gap-2">
          <IntelligenceCrossLink target="vsi-intelligence" />
          <IntelligenceCrossLink target="vehicles" />
          <IntelligenceCrossLink target="device-inventory" />
        </div>
      </MasterPageSection>
    </>
  );
}

export function ApdsMasterIntelligenceView() {
  return (
    <MasterIntelligenceContextProvider view="apds-intelligence">
      <ApdsMasterIntelligenceContent />
    </MasterIntelligenceContextProvider>
  );
}
