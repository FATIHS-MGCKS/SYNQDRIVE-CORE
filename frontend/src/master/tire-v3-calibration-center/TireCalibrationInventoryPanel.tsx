import { useEffect, useState } from 'react';
import { useLanguage } from '../../i18n/LanguageContext';
import { api } from '../../lib/api';
import { MasterEmptyState, MasterErrorState, MasterLoadingState } from '../shell/MasterPageStates';
import { MasterPageSection } from '../shell';
import { MasterTableShell } from '../shell/MasterTableShell';
import type {
  TireInventoryGlobalSummaryDto,
  TireInventorySetupDetailDto,
  TireInventorySetupListDto,
} from './tire-calibration-center-api.types';
import type { TireCalibrationCenterUrlState } from './tire-calibration-center-url';

type MasterOrgOption = { id: string; companyName: string };

function MetricTile({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div className="rounded-lg border border-border/60 bg-card/30 p-3">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-medium tabular-nums">{value ?? '—'}</p>
    </div>
  );
}

type Props = {
  organizations: MasterOrgOption[];
  url: TireCalibrationCenterUrlState;
  syncUrl: (patch: Partial<TireCalibrationCenterUrlState>) => void;
  vehicleOptions: Array<{ id: string; label: string }>;
  loadingScope: boolean;
};

export function TireCalibrationInventoryPanel({
  organizations,
  url,
  syncUrl,
  vehicleOptions,
  loadingScope,
}: Props) {
  const { t, locale } = useLanguage();
  const [summary, setSummary] = useState<TireInventoryGlobalSummaryDto | null>(null);
  const [setupList, setSetupList] = useState<TireInventorySetupListDto | null>(null);
  const [detail, setDetail] = useState<TireInventorySetupDetailDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasScope = Boolean(url.orgId && url.vehicleId && url.tireSetupId);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const invSummary = await api.admin.masterIntelligenceTireCalibration.inventorySummary();
        if (cancelled) return;
        setSummary(invSummary);
        if (url.orgId && url.vehicleId) {
          const list = await api.admin.masterIntelligenceTireCalibration.inventorySetups(
            url.orgId,
            url.vehicleId,
          );
          if (cancelled) return;
          setSetupList(list);
        } else {
          setSetupList(null);
        }
        if (hasScope && url.orgId && url.vehicleId && url.tireSetupId) {
          const d = await api.admin.masterIntelligenceTireCalibration.inventorySetupDetail(
            url.orgId,
            url.vehicleId,
            url.tireSetupId,
          );
          if (cancelled) return;
          setDetail(d);
        } else {
          setDetail(null);
        }
      } catch {
        if (!cancelled) setError(t('master.intelligence.tireCalibration.error' as never));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hasScope, t, url.orgId, url.vehicleId, url.tireSetupId]);

  const identityLabel = (status: string) =>
    t(`master.intelligence.tireCalibration.inventory.identity.${status}` as never, {
      defaultValue: status,
    });

  return (
    <>
      {error ? (
        <MasterErrorState title={t('master.intelligence.tireCalibration.error' as never)} />
      ) : null}

      <MasterPageSection title={t('master.intelligence.tireCalibration.inventory.globalTitle' as never)}>
        {loading && !summary ? (
          <MasterLoadingState variant="card" />
        ) : summary ? (
          <>
            <p className="mb-3 text-xs text-muted-foreground">
              {t('master.intelligence.tireCalibration.inventory.disclaimer' as never)}
            </p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <MetricTile
                label={t('master.intelligence.tireCalibration.inventory.metric.orgs' as never)}
                value={summary.organizationCountWithSetups}
              />
              <MetricTile
                label={t('master.intelligence.tireCalibration.inventory.metric.vehicles' as never)}
                value={summary.vehicleCountWithSetups}
              />
              <MetricTile
                label={t('master.intelligence.tireCalibration.inventory.metric.setups' as never)}
                value={summary.registeredSetupCount}
              />
              <MetricTile
                label={t('master.intelligence.tireCalibration.inventory.metric.withMeasurements' as never)}
                value={summary.setupsWithTreadMeasurements}
              />
              <MetricTile
                label={t('master.intelligence.tireCalibration.inventory.metric.withPriorShadow' as never)}
                value={summary.setupsWithPriorShadowRows}
              />
              <MetricTile
                label={t('master.intelligence.tireCalibration.inventory.metric.withSnapshots' as never)}
                value={summary.setupsWithCalibrationSnapshots}
              />
              <MetricTile
                label={t('master.intelligence.tireCalibration.inventory.metric.identityConfirmed' as never)}
                value={summary.confirmedPhysicalWheelSlots}
              />
              <MetricTile
                label={t('master.intelligence.tireCalibration.inventory.metric.identityUnconfirmed' as never)}
                value={summary.unconfirmedPhysicalWheelSlots}
              />
            </div>
          </>
        ) : null}
      </MasterPageSection>

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
              disabled={!url.orgId || loadingScope}
              onChange={(e) =>
                syncUrl({
                  vehicleId: e.target.value || null,
                  tireSetupId: null,
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
              onChange={(e) => syncUrl({ tireSetupId: e.target.value || null, snapshotId: null })}
            >
              <option value="">—</option>
              {(setupList?.items ?? []).map((s) => (
                <option key={s.tireSetupId} value={s.tireSetupId}>
                  {s.name ?? s.tireSetupId.slice(0, 8)} · {s.status} · snap={s.snapshotCount}
                </option>
              ))}
            </select>
          </label>
        </div>
      </MasterPageSection>

      {!hasScope ? (
        <MasterEmptyState
          title={t('master.intelligence.tireCalibration.inventory.selectSetup.title' as never)}
          description={t('master.intelligence.tireCalibration.inventory.selectSetup.body' as never)}
        />
      ) : loading && !detail ? (
        <MasterLoadingState variant="card" />
      ) : detail ? (
        <MasterPageSection title={t('master.intelligence.tireCalibration.inventory.setupDetail' as never)}>
          <p className="mb-3 text-xs text-muted-foreground">
            {t('master.intelligence.tireCalibration.inventory.notValidatedPair' as never)}
          </p>
          <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <MetricTile label={t('master.intelligence.tireCalibration.inventory.field.status' as never)} value={detail.status} />
            <MetricTile
              label={t('master.intelligence.tireCalibration.inventory.field.snapshots' as never)}
              value={detail.snapshotCount}
            />
            <MetricTile
              label={t('master.intelligence.tireCalibration.inventory.field.measurements' as never)}
              value={detail.measurementCount}
            />
            <MetricTile
              label={t('master.intelligence.tireCalibration.inventory.field.specFront' as never)}
              value={detail.frontDimension ?? detail.brandModelFront}
            />
          </div>

          <MasterTableShell>
            <div className="overflow-x-auto rounded-lg border border-border/60">
              <table className="w-full min-w-[720px] text-left text-xs">
                <thead className="border-b border-border/60 bg-muted/30 text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">{t('master.intelligence.tireCalibration.col.wheel' as never)}</th>
                    <th className="px-3 py-2">{t('master.intelligence.tireCalibration.col.physicalTire' as never)}</th>
                    <th className="px-3 py-2">{t('master.intelligence.tireCalibration.inventory.col.tread' as never)}</th>
                    <th className="px-3 py-2">{t('master.intelligence.tireCalibration.inventory.col.measuredAt' as never)}</th>
                    <th className="px-3 py-2">{t('master.intelligence.tireCalibration.inventory.col.provenance' as never)}</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.wheels.map((w) => (
                    <tr key={w.wheelPosition} className="border-b border-border/40">
                      <td className="px-3 py-2 font-mono">{w.wheelPosition}</td>
                      <td className="px-3 py-2">
                        <span className="block font-mono text-[10px]">{w.physicalTireId ?? '—'}</span>
                        <span className="text-muted-foreground">{identityLabel(w.physicalIdentityStatus)}</span>
                      </td>
                      <td className="px-3 py-2 tabular-nums">
                        {w.latestMeasurement.treadDepthMm != null
                          ? w.latestMeasurement.treadDepthMm.toFixed(2)
                          : t('master.intelligence.tireCalibration.inventory.measurement.none' as never)}
                      </td>
                      <td className="px-3 py-2 tabular-nums">
                        {w.latestMeasurement.measuredAt
                          ? new Date(w.latestMeasurement.measuredAt).toLocaleString(locale)
                          : '—'}
                      </td>
                      <td className="px-3 py-2 font-mono text-[10px]">
                        {[w.latestMeasurement.evidenceSource, w.latestMeasurement.source]
                          .filter(Boolean)
                          .join(' · ') || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </MasterTableShell>

          <div className="mt-4 grid gap-3 lg:grid-cols-3">
            <div className="rounded-lg border border-border/60 p-3 text-xs">
              <p className="mb-2 font-medium">{t('master.intelligence.tireCalibration.inventory.block.priorShadow' as never)}</p>
              {detail.priorShadow.availability === 'NOT_PERSISTED' ? (
                <p className="text-muted-foreground">
                  {t('master.intelligence.tireCalibration.inventory.prior.notPersisted' as never)}
                </p>
              ) : (
                <ul className="space-y-1 tabular-nums">
                  <li>{detail.priorShadow.modelVersion}</li>
                  <li>
                    {detail.priorShadow.computedAt
                      ? new Date(detail.priorShadow.computedAt).toLocaleString(locale)
                      : '—'}
                  </li>
                </ul>
              )}
            </div>
            <div className="rounded-lg border border-border/60 p-3 text-xs">
              <p className="mb-2 font-medium">{t('master.intelligence.tireCalibration.inventory.block.ds4' as never)}</p>
              {detail.ds4.availability === 'NOT_PERSISTED' ? (
                <p className="text-muted-foreground">
                  {t('master.intelligence.tireCalibration.inventory.ds4.notPersisted' as never)}
                </p>
              ) : (
                <ul className="space-y-1">
                  <li>{detail.ds4.latestDs4ReadStatus}</li>
                  <li>{detail.ds4.latestEventQualityCoverage}</li>
                  <li className="tabular-nums">{detail.ds4.persistedRowCount}</li>
                </ul>
              )}
            </div>
            <div className="rounded-lg border border-border/60 p-3 text-xs">
              <p className="mb-2 font-medium">
                {t('master.intelligence.tireCalibration.inventory.block.eligibility' as never)}
              </p>
              {!detail.calibrationEligibility.evaluable ? (
                <p className="text-muted-foreground">{detail.calibrationEligibility.reason ?? '—'}</p>
              ) : (
                <ul className="space-y-1 font-mono text-[10px]">
                  <li>{detail.calibrationEligibility.calibrationEligibilityDigestPrefix}</li>
                  <li>
                    {t('master.intelligence.tireCalibration.inventory.eligibility.rotation' as never, {
                      value: detail.calibrationEligibility.rotationDuringMountPeriod ? 'yes' : 'no',
                    })}
                  </li>
                </ul>
              )}
            </div>
          </div>
        </MasterPageSection>
      ) : null}
    </>
  );
}
