import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { useLanguage } from '../../i18n/LanguageContext';
import { api } from '../../lib/api';
import { cn } from '../../components/ui/utils';
import { MasterEmptyState, MasterErrorState, MasterLoadingState } from '../shell/MasterPageStates';
import { MasterPageHeader, MasterPageSection, MasterPageTabs } from '../shell';
import { MasterTableShell } from '../shell/MasterTableShell';
import type {
  TireCalibrationCenterTab,
  TireCalibrationGlobalSummaryDto,
  TireCalibrationSetupInspectionDto,
  TireCalibrationSetupListDto,
  TireCalibrationSnapshotDetailDto,
  TireCalibrationSnapshotListItemDto,
} from './tire-calibration-center-api.types';
import {
  patchTireCalibrationCenterUrl,
  readTireCalibrationCenterUrl,
  type TireCalibrationCenterUrlState,
} from './tire-calibration-center-url';
import { TireCalibrationSnapshotDrawer } from './TireCalibrationSnapshotDrawer';

type MasterOrgOption = { id: string; companyName: string };

type Props = {
  organizations: MasterOrgOption[];
};

function MetricTile({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div className="rounded-lg border border-border/60 bg-card/30 p-3">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-medium tabular-nums">{value ?? '—'}</p>
    </div>
  );
}

const WHEEL_POSITIONS = ['FL', 'FR', 'RL', 'RR'] as const;

export function TireCalibrationCenterView({ organizations }: Props) {
  const { t, locale } = useLanguage();
  const [url, setUrl] = useState<TireCalibrationCenterUrlState>(() =>
    typeof window !== 'undefined'
      ? readTireCalibrationCenterUrl(window.location.search)
      : { tab: 'overview', orgId: null, vehicleId: null, tireSetupId: null, wheelPosition: null, mountPeriodId: null, snapshotId: null },
  );

  const [summary, setSummary] = useState<TireCalibrationGlobalSummaryDto | null>(null);
  const [setups, setSetups] = useState<TireCalibrationSetupListDto | null>(null);
  const [quality, setQuality] = useState<TireCalibrationSetupInspectionDto | null>(null);
  const [snapshots, setSnapshots] = useState<TireCalibrationSnapshotListItemDto[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [vehicleOptions, setVehicleOptions] = useState<Array<{ id: string; label: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drawerDetail, setDrawerDetail] = useState<TireCalibrationSnapshotDetailDto | null>(null);
  const [drawerLoading, setDrawerLoading] = useState(false);

  const syncUrl = useCallback((patch: Partial<TireCalibrationCenterUrlState>) => {
    const next = patchTireCalibrationCenterUrl(patch, true);
    setUrl(next);
  }, []);

  const hasScope = Boolean(url.orgId && url.vehicleId && url.tireSetupId);

  const loadSummary = useCallback(async () => {
    const data = await api.admin.masterIntelligenceTireCalibration.summary();
    setSummary(data);
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await loadSummary();
      if (url.orgId && url.vehicleId) {
        const setupList = await api.admin.masterIntelligenceTireCalibration.listSetups(
          url.orgId,
          url.vehicleId,
        );
        setSetups(setupList);
      } else {
        setSetups(null);
      }
      if (hasScope && url.orgId && url.vehicleId && url.tireSetupId) {
        const [page, q] = await Promise.all([
          api.admin.masterIntelligenceTireCalibration.listSnapshots(
            url.orgId,
            url.vehicleId,
            url.tireSetupId,
            {
              wheelPosition: url.wheelPosition ?? undefined,
              mountPeriodId: url.mountPeriodId ?? undefined,
              limit: 25,
            },
          ),
          api.admin.masterIntelligenceTireCalibration.setupQuality(
            url.orgId,
            url.vehicleId,
            url.tireSetupId,
          ),
        ]);
        setSnapshots(page.items);
        setNextCursor(page.nextCursor);
        setQuality(q);
      } else {
        setSnapshots([]);
        setNextCursor(null);
        setQuality(null);
      }
    } catch {
      setError(t('master.intelligence.tireCalibration.error' as never));
    } finally {
      setLoading(false);
    }
  }, [hasScope, loadSummary, t, url.orgId, url.vehicleId, url.tireSetupId, url.wheelPosition, url.mountPeriodId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!url.orgId) {
      setVehicleOptions([]);
      return;
    }
    void (async () => {
      try {
        const res = await api.vehicles.listByOrg(url.orgId!, { limit: 200 });
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
  }, [url.orgId]);

  useEffect(() => {
    if (!url.snapshotId || !hasScope || !url.orgId || !url.vehicleId || !url.tireSetupId) {
      setDrawerDetail(null);
      return;
    }
    setDrawerLoading(true);
    void api.admin.masterIntelligenceTireCalibration
      .snapshotDetail(url.orgId, url.vehicleId, url.tireSetupId, url.snapshotId)
      .then(setDrawerDetail)
      .catch(() => setDrawerDetail(null))
      .finally(() => setDrawerLoading(false));
  }, [hasScope, url.orgId, url.vehicleId, url.tireSetupId, url.snapshotId]);

  const tabs = useMemo(
    () =>
      [
        { id: 'overview' as const, label: t('master.intelligence.tireCalibration.tab.overview' as never) },
        { id: 'snapshots' as const, label: t('master.intelligence.tireCalibration.tab.snapshots' as never) },
        { id: 'accuracy' as const, label: t('master.intelligence.tireCalibration.tab.accuracy' as never) },
        { id: 'quality' as const, label: t('master.intelligence.tireCalibration.tab.quality' as never) },
      ] satisfies Array<{ id: TireCalibrationCenterTab; label: string }>,
    [t],
  );

  const loadMoreSnapshots = async () => {
    if (!nextCursor || !url.orgId || !url.vehicleId || !url.tireSetupId) return;
    const page = await api.admin.masterIntelligenceTireCalibration.listSnapshots(
      url.orgId,
      url.vehicleId,
      url.tireSetupId,
      {
        wheelPosition: url.wheelPosition ?? undefined,
        mountPeriodId: url.mountPeriodId ?? undefined,
        limit: 25,
        cursor: nextCursor,
      },
    );
    setSnapshots((prev) => [...prev, ...page.items]);
    setNextCursor(page.nextCursor);
  };

  const rejectionEntries = Object.entries(quality?.pairing.rejectionCounts ?? {}).sort(
    (a, b) => b[1] - a[1],
  );

  const selectedSetup = setups?.items.find((s) => s.tireSetupId === url.tireSetupId);
  const wheelFilterOptions =
    selectedSetup?.wheelPositions?.length ? selectedSetup.wheelPositions : [...WHEEL_POSITIONS];
  const mountFilterOptions = selectedSetup?.mountPeriodIds ?? [];

  return (
    <>
      <MasterPageHeader
        title={t('master.intelligence.tireCalibration.title' as never)}
        description={t('master.intelligence.tireCalibration.description' as never)}
        actions={
          <Button type="button" variant="outline" size="sm" onClick={() => void refresh()} disabled={loading}>
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <RefreshCw className="h-4 w-4 shrink-0" aria-hidden />
            )}
            <span className="ml-1.5">{t('master.intelligence.tireCalibration.action.refresh' as never)}</span>
          </Button>
        }
      />

      <MasterPageTabs
        tabs={tabs}
        activeId={url.tab}
        onChange={(tab) => syncUrl({ tab })}
        ariaLabel={t('master.intelligence.tireCalibration.title' as never)}
        testIdPrefix="tire-calibration"
      />

      {error ? (
        <MasterErrorState
          title={t('master.intelligence.tireCalibration.error' as never)}
          onRetry={() => void refresh()}
        />
      ) : null}

      {url.tab === 'overview' && (
        <MasterPageSection title={t('master.intelligence.tireCalibration.tab.overview' as never)}>
          {loading && !summary ? (
            <MasterLoadingState variant="card" />
          ) : (
            <>
              <p className="mb-3 rounded border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-900 dark:text-amber-100">
                {t('master.intelligence.tireCalibration.writer.replicaLocal' as never)}
              </p>
              {summary && summary.snapshotRowCount === 0 ? (
                <MasterEmptyState
                  title={t('master.intelligence.tireCalibration.empty.noSnapshots.title' as never)}
                  description={t('master.intelligence.tireCalibration.empty.noSnapshots.body' as never)}
                />
              ) : null}
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <MetricTile
                  label={t('master.intelligence.tireCalibration.metric.snapshotRows' as never)}
                  value={summary?.snapshotRowCount}
                />
                <MetricTile
                  label={t('master.intelligence.tireCalibration.metric.setupsWithSnapshots' as never)}
                  value={summary?.setupCountWithSnapshots}
                />
                <MetricTile
                  label={t('master.intelligence.tireCalibration.metric.latestSnapshot' as never)}
                  value={
                    summary?.latestSnapshotAt
                      ? new Date(summary.latestSnapshotAt).toLocaleString(locale)
                      : null
                  }
                />
                <MetricTile
                  label={t('master.intelligence.tireCalibration.writer.enabled' as never)}
                  value={
                    summary?.writer.writeEnabled
                      ? t('master.intelligence.tireCalibration.writer.enabled' as never)
                      : t('master.intelligence.tireCalibration.writer.disabled' as never)
                  }
                />
                <MetricTile
                  label={t('master.intelligence.tireCalibration.metric.lastTick' as never)}
                  value={summary?.writer.lastTickAt}
                />
                <MetricTile
                  label={t('master.intelligence.tireCalibration.metric.lastResult' as never)}
                  value={summary?.writer.lastResult}
                />
                <MetricTile
                  label={t('master.intelligence.tireCalibration.metric.inserted' as never)}
                  value={summary?.writer.lastSnapshotsInserted}
                />
                <MetricTile
                  label={t('master.intelligence.tireCalibration.metric.existing' as never)}
                  value={summary?.writer.lastSnapshotsExisting}
                />
                <MetricTile
                  label={t('master.intelligence.tireCalibration.metric.skipped' as never)}
                  value={summary?.writer.lastSetupsSkipped}
                />
              </div>
            </>
          )}
        </MasterPageSection>
      )}

      {(url.tab === 'snapshots' || url.tab === 'quality' || url.tab === 'accuracy') && (
        <MasterPageSection title={t('master.intelligence.tireCalibration.picker.org' as never)}>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="flex flex-col gap-1 text-xs">
              <span className="text-muted-foreground">{t('master.intelligence.tireCalibration.picker.org' as never)}</span>
              <select
                className="rounded border border-border bg-background px-2 py-1.5 font-mono text-[11px]"
                value={url.orgId ?? ''}
                onChange={(e) =>
                  syncUrl({
                    orgId: e.target.value || null,
                    vehicleId: null,
                    tireSetupId: null,
                    wheelPosition: null,
                    mountPeriodId: null,
                    snapshotId: null,
                  })
                }
              >
                <option value="">—</option>
                {organizations.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.companyName}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs">
              <span className="text-muted-foreground">{t('master.intelligence.tireCalibration.picker.vehicle' as never)}</span>
              <select
                className="rounded border border-border bg-background px-2 py-1.5 font-mono text-[11px]"
                value={url.vehicleId ?? ''}
                disabled={!url.orgId}
                onChange={(e) =>
                  syncUrl({
                    vehicleId: e.target.value || null,
                    tireSetupId: null,
                    wheelPosition: null,
                    mountPeriodId: null,
                    snapshotId: null,
                  })
                }
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
              <span className="text-muted-foreground">{t('master.intelligence.tireCalibration.picker.setup' as never)}</span>
              <select
                className="rounded border border-border bg-background px-2 py-1.5 font-mono text-[11px]"
                value={url.tireSetupId ?? ''}
                disabled={!url.vehicleId}
                onChange={(e) =>
                  syncUrl({
                    tireSetupId: e.target.value || null,
                    wheelPosition: null,
                    mountPeriodId: null,
                    snapshotId: null,
                  })
                }
              >
                <option value="">—</option>
                {(setups?.items ?? []).map((s) => (
                  <option key={s.tireSetupId} value={s.tireSetupId}>
                    {s.tireSetupId.slice(0, 8)}… ({s.snapshotCount})
                  </option>
                ))}
              </select>
            </label>
          </div>
          {hasScope && url.tab === 'snapshots' ? (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-xs">
                <span className="text-muted-foreground">{t('master.intelligence.tireCalibration.picker.wheel' as never)}</span>
                <select
                  className="rounded border border-border bg-background px-2 py-1.5 font-mono text-[11px]"
                  value={url.wheelPosition ?? ''}
                  onChange={(e) =>
                    syncUrl({
                      wheelPosition: e.target.value || null,
                      snapshotId: null,
                    })
                  }
                >
                  <option value="">{t('master.intelligence.tireCalibration.filter.allWheels' as never)}</option>
                  {wheelFilterOptions.map((w) => (
                    <option key={w} value={w}>
                      {w}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs">
                <span className="text-muted-foreground">{t('master.intelligence.tireCalibration.picker.mountPeriod' as never)}</span>
                <select
                  className="rounded border border-border bg-background px-2 py-1.5 font-mono text-[11px]"
                  value={url.mountPeriodId ?? ''}
                  onChange={(e) =>
                    syncUrl({
                      mountPeriodId: e.target.value || null,
                      snapshotId: null,
                    })
                  }
                >
                  <option value="">{t('master.intelligence.tireCalibration.filter.allMountPeriods' as never)}</option>
                  {mountFilterOptions.map((mp) => (
                    <option key={mp} value={mp}>
                      {mp.slice(0, 8)}…
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ) : null}
        </MasterPageSection>
      )}

      {url.tab === 'snapshots' && (
        <MasterPageSection title={t('master.intelligence.tireCalibration.tab.snapshots' as never)}>
          {!hasScope ? (
            <MasterEmptyState
              title={t('master.intelligence.tireCalibration.picker.setup' as never)}
              description={t('master.intelligence.apds.empty.selectScope.body' as never)}
            />
          ) : (
            <MasterTableShell
              footer={
                nextCursor ? (
                  <Button type="button" variant="outline" size="sm" onClick={() => void loadMoreSnapshots()}>
                    {t('master.intelligence.tireCalibration.drawer.loadMore' as never)}
                  </Button>
                ) : null
              }
            >
              <div className="overflow-x-auto rounded-lg border border-border/60">
                <table className="w-full min-w-[640px] text-left text-xs">
                  <thead className="border-b border-border/60 bg-muted/30 text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2">{t('master.intelligence.tireCalibration.col.wheel' as never)}</th>
                      <th className="px-3 py-2">{t('master.intelligence.tireCalibration.col.created' as never)}</th>
                      <th className="px-3 py-2">{t('master.intelligence.tireCalibration.col.pairingEligible' as never)}</th>
                      <th className="px-3 py-2">{t('master.intelligence.tireCalibration.col.physicalTire' as never)}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {snapshots.map((row) => (
                      <tr
                        key={row.id}
                        className={cn(
                          'cursor-pointer border-b border-border/40 hover:bg-muted/20',
                          url.snapshotId === row.id && 'bg-muted/30',
                        )}
                        onClick={() => syncUrl({ snapshotId: row.id })}
                      >
                        <td className="px-3 py-2 font-mono">{row.wheelPosition}</td>
                        <td className="px-3 py-2 tabular-nums">
                          {new Date(row.predictionCreatedAt).toLocaleString(locale)}
                        </td>
                        <td className="px-3 py-2">
                          <span className="sr-only">
                            {row.pairingEligible
                              ? t('master.intelligence.tireCalibration.col.pairingEligible.yes' as never)
                              : t('master.intelligence.tireCalibration.col.pairingEligible.no' as never)}
                          </span>
                          <span aria-hidden>{row.pairingEligible ? '✓' : '—'}</span>
                        </td>
                        <td className="px-3 py-2 font-mono text-[10px]">
                          {row.physicalTireId ??
                            t('master.intelligence.tireCalibration.physical.unconfirmed' as never)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </MasterTableShell>
          )}
        </MasterPageSection>
      )}

      {url.tab === 'accuracy' && (
        <MasterPageSection title={t('master.intelligence.tireCalibration.tab.accuracy' as never)}>
          <MasterEmptyState
            title={t('master.intelligence.tireCalibration.accuracy.notEvaluable.title' as never)}
            description={t('master.intelligence.tireCalibration.accuracy.notEvaluable.body' as never)}
          />
          {hasScope && quality ? (
            <p className="mt-3 text-xs text-muted-foreground">
              {t('master.intelligence.tireCalibration.accuracy.policyOpportunities' as never, {
                count: quality.pairing.pairableCount,
              })}
            </p>
          ) : null}
        </MasterPageSection>
      )}

      {url.tab === 'quality' && (
        <MasterPageSection title={t('master.intelligence.tireCalibration.tab.quality' as never)}>
          {!hasScope || !quality ? (
            <MasterEmptyState
              title={t('master.intelligence.tireCalibration.picker.setup' as never)}
              description={t('master.intelligence.tireCalibration.quality.sampledScope' as never)}
            />
          ) : (
            <>
              <p className="mb-3 text-xs text-muted-foreground">
                {t('master.intelligence.tireCalibration.quality.sampledScope' as never)}
              </p>
              <div className="mb-4 grid gap-2 sm:grid-cols-2">
                <MetricTile
                  label={t('master.intelligence.tireCalibration.quality.pairableCount' as never)}
                  value={quality.pairing.pairableCount}
                />
                <MetricTile
                  label={t('master.intelligence.tireCalibration.quality.sampledMeasurements' as never)}
                  value={quality.pairing.sampledMeasurements}
                />
              </div>
              <ul className="space-y-2 text-xs">
                {rejectionEntries.map(([code, count]) => (
                  <li key={code} className="flex justify-between rounded border border-border/60 px-3 py-2">
                    <span>
                      {t(`master.intelligence.tireCalibration.rejection.${code}` as never, {
                        defaultValue: code,
                      })}
                    </span>
                    <span className="tabular-nums font-medium">{count}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </MasterPageSection>
      )}

      <TireCalibrationSnapshotDrawer
        open={Boolean(url.snapshotId)}
        onOpenChange={(open) => {
          if (!open) syncUrl({ snapshotId: null });
        }}
        detail={drawerDetail}
        loading={drawerLoading}
      />
    </>
  );
}

export default TireCalibrationCenterView;
