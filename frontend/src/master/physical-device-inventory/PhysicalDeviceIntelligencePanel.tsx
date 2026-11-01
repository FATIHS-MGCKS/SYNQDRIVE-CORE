import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext';
import { Button } from '../../components/ui/button';
import { navigateMasterIntelligenceCrossLink } from '../intelligence/master-intelligence-url';
import { usePdiMasterIntelligenceData } from './usePdiMasterIntelligenceData';
import { PdiProviderBindingsSection } from './PdiProviderBindingsSection';
import {
  buildPdiIntelligenceNavContext,
  pickPdiProviderSourceLink,
  resolvePdiCrossNavScope,
} from './pdi-provider-binding.utils';

type Props = {
  physicalDeviceId: string;
  organizationId?: string | null;
};

function PhysicalDeviceIntelligencePanelBody({ physicalDeviceId, organizationId }: Props) {
  const { t, locale } = useLanguage();
  const [selectedLinkId, setSelectedLinkId] = useState<string | null>(null);
  const { data, loading, error, refresh } = usePdiMasterIntelligenceData({
    physicalDeviceId,
    organizationId: organizationId ?? null,
  });

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        {t('master.intelligence.pdi.loading' as never)}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded border border-destructive/40 p-3 text-xs">
        <p>{t('master.intelligence.pdi.error' as never)}</p>
        <Button type="button" size="sm" variant="outline" className="mt-2" onClick={() => void refresh()}>
          {t('master.intelligence.vsi.retry' as never)}
        </Button>
      </div>
    );
  }

  if (!data) return null;

  const formatTime = (iso: string | null) => {
    if (!iso) return '—';
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString(locale);
  };

  const bindingPick = pickPdiProviderSourceLink(data.providerBindings, selectedLinkId);
  const navScope = resolvePdiCrossNavScope({
    identity: data.identity,
    panelOrganizationId: organizationId ?? null,
    bindingPick,
    bindings: data.providerBindings,
    bindingCount: data.providerBindings.length,
  });

  const navBlocked = !navScope.navigationReady;

  const openVsiOverview = () => {
    const ctx = buildPdiIntelligenceNavContext({ scope: navScope, vsiTarget: 'overview' });
    if (!ctx) return;
    navigateMasterIntelligenceCrossLink('vsi-intelligence', ctx);
  };

  const openVsiLedger = () => {
    const ctx = buildPdiIntelligenceNavContext({ scope: navScope, vsiTarget: 'ledger' });
    if (!ctx) return;
    navigateMasterIntelligenceCrossLink('vsi-intelligence', ctx, {
      hygiene: { preserveVsiLedgerState: true },
    });
  };

  const openApds = () => {
    const ctx = buildPdiIntelligenceNavContext({ scope: navScope });
    if (!ctx) return;
    navigateMasterIntelligenceCrossLink('apds-intelligence', ctx);
  };

  const openVehicle = () => {
    const ctx = buildPdiIntelligenceNavContext({
      scope: navScope,
      includePhysicalDeviceForDestination: true,
    });
    if (!ctx) return;
    navigateMasterIntelligenceCrossLink('vehicles', ctx);
  };

  return (
    <div className="space-y-4 rounded-lg border border-border/60 p-4">
      <p className="text-sm font-medium">{t('master.intelligence.pdi.section.identity' as never)}</p>
      <p className="text-xs text-muted-foreground">{t('master.intelligence.pdi.snapshotNotHistory' as never)}</p>
      <div className="grid gap-1 text-xs">
        <div>
          {t('master.physicalDeviceInventory.col.serial' as never)}: {data.identity.serialNumberMasked ?? '—'}
        </div>
        <div>IMEI: {data.identity.imeiMasked ?? '—'}</div>
        <div>
          {t('master.intelligence.pdi.evaluatedAt' as never)}: {formatTime(data.identity.identityEvaluatedAt)}
        </div>
        {data.identity.physicalR1Applicability === 'NOT_APPLICABLE' ? (
          <p className="text-amber-800 dark:text-amber-200">
            {t('master.intelligence.pdi.notApplicableR1' as never)}
          </p>
        ) : null}
      </div>

      <PdiProviderBindingsSection
        bindings={data.providerBindings}
        identity={data.identity}
        selectedLinkId={selectedLinkId}
        onSelectLinkId={setSelectedLinkId}
        staleSelection={bindingPick.staleSelection}
        missingVehicleScope={navScope.missingVehicleScope}
      />

      {navScope.crossOrgMismatch ? (
        <p className="text-[11px] text-amber-800 dark:text-amber-200" role="status">
          {t('master.intelligence.pdi.bindings.crossOrgBlocked' as never)}
        </p>
      ) : null}

      {bindingPick.ambiguous && !bindingPick.navigationReady ? (
        <p className="text-[10px] text-muted-foreground" role="status">
          {t('master.intelligence.pdi.bindings.navPending' as never)}
        </p>
      ) : null}

      <div>
        <p className="text-sm font-medium">{t('master.intelligence.pdi.section.timeline' as never)}</p>
        <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-xs text-muted-foreground">
          {data.timeline.length === 0 ? (
            <li>{t('master.intelligence.pdi.emptyTimeline' as never)}</li>
          ) : (
            data.timeline.map((item) => (
              <li key={`${item.kind}-${item.at}-${item.label}`}>
                {formatTime(item.at)} · {item.label}
              </li>
            ))
          )}
        </ul>
      </div>

      <div>
        <p className="text-sm font-medium">{t('master.intelligence.pdi.section.episodes' as never)}</p>
        <p className="text-xs text-muted-foreground">{t('master.intelligence.pdi.episodeNotPoll' as never)}</p>
        {data.connectionEpisodes.items.length === 0 ? (
          <p className="mt-1 text-xs text-muted-foreground">{t('master.intelligence.pdi.noEpisodes' as never)}</p>
        ) : (
          <ul className="mt-2 space-y-1 text-xs">
            {data.connectionEpisodes.items.map((ep) => (
              <li key={ep.idPrefix}>
                {formatTime(ep.openedAt)} · {ep.status} · {ep.openedReason}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <p className="text-sm font-medium">{t('master.intelligence.pdi.section.drift' as never)}</p>
        <p className="text-xs text-muted-foreground">{t('master.intelligence.pdi.noDriftHistory' as never)}</p>
        {data.driftHistory.liveObservation ? (
          <div className="mt-2 text-xs">
            {data.driftHistory.liveObservation.driftReasonCode} ·{' '}
            {data.driftHistory.liveObservation.confidence}
          </div>
        ) : null}
      </div>

      <div className="space-y-1 pt-2">
        <p className="text-[10px] font-medium text-muted-foreground">
          {t('master.intelligence.pdi.section.crossNav' as never)}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" onClick={openVehicle} disabled={navBlocked}>
            {t('master.intelligence.crossLink.vehicle' as never)}
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={openVsiOverview} disabled={navBlocked}>
            {t('master.intelligence.vehicleDetail.openVsiOverview' as never)}
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={openVsiLedger} disabled={navBlocked}>
            {t('master.intelligence.vehicleDetail.openVsiLedger' as never)}
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={openApds} disabled={navBlocked}>
            {t('master.intelligence.crossLink.apds' as never)}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function PhysicalDeviceIntelligencePanel({ physicalDeviceId, organizationId }: Props) {
  return (
    <PhysicalDeviceIntelligencePanelBody
      key={physicalDeviceId}
      physicalDeviceId={physicalDeviceId}
      organizationId={organizationId}
    />
  );
}
