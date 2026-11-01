import { useLanguage } from '../../i18n/LanguageContext';
import { SignalDetailSheet } from '../intelligence/ledger/SignalDetailSheet';
import type { TireCalibrationSnapshotDetailDto } from './tire-calibration-center-api.types';

function formatInterval(
  value: { lo: number; hi: number } | null | undefined,
): string {
  if (!value) return '—';
  return `${value.lo.toFixed(2)} – ${value.hi.toFixed(2)}`;
}

function Metric({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div className="rounded-lg border border-border/60 p-2.5 text-xs">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-medium tabular-nums">{value ?? '—'}</p>
    </div>
  );
}

function eligibilityNotes(
  detail: TireCalibrationSnapshotDetailDto,
  t: (key: never) => string,
): string[] {
  const pred = detail.payload?.prediction as Record<string, unknown> | undefined;
  const prov = detail.payload?.provenance as Record<string, unknown> | undefined;
  const notes: string[] = [];

  notes.push(
    detail.pairingEligible
      ? t('master.intelligence.tireCalibration.drawer.eligibility.pairingEligible' as never)
      : t('master.intelligence.tireCalibration.drawer.eligibility.observationalOnly' as never),
  );

  if (pred?.physicalIdentityAmbiguous === true) {
    notes.push(t('master.intelligence.tireCalibration.drawer.eligibility.identityAmbiguous' as never));
  }
  if (prov?.rotationDuringMountPeriod === true) {
    notes.push(t('master.intelligence.tireCalibration.drawer.eligibility.rotationDuringMount' as never));
  }

  return notes;
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  detail: TireCalibrationSnapshotDetailDto | null;
  loading: boolean;
};

export function TireCalibrationSnapshotDrawer({ open, onOpenChange, detail, loading }: Props) {
  const { t, locale } = useLanguage();

  const pred = detail?.payload?.prediction as Record<string, unknown> | undefined;
  const dq = detail?.payload?.dataQuality as Record<string, unknown> | undefined;
  const prov = detail?.payload?.provenance as Record<string, unknown> | undefined;
  const predictedTread = pred?.predictedTreadMm as { lo: number; hi: number } | null | undefined;
  const displayTread = pred?.displayTreadMm as { lo: number; hi: number } | null | undefined;
  const remainingKm = pred?.remainingKm as { lo: number; hi: number } | null | undefined;

  const physicalLabel =
    detail?.physicalIdentityStatus === 'CONFIRMED' && detail.physicalTireId
      ? detail.physicalTireId
      : t('master.intelligence.tireCalibration.physical.unconfirmed' as never);

  const pairingModeLabel = detail?.pairingEligible
    ? t('master.intelligence.tireCalibration.drawer.pairingMode.pairingEligible' as never)
    : t('master.intelligence.tireCalibration.drawer.pairingMode.observationalOnly' as never);

  return (
    <SignalDetailSheet
      open={open}
      onOpenChange={onOpenChange}
      title={t('master.intelligence.tireCalibration.drawer.title' as never)}
      description={
        detail
          ? `${detail.wheelPosition} · ${new Date(detail.predictionCreatedAt).toLocaleString(locale)}`
          : undefined
      }
    >
      {loading ? (
        <p className="p-4 text-sm text-muted-foreground">{t('master.intelligence.tireCalibration.loading' as never)}</p>
      ) : !detail ? null : (
        <div className="flex flex-col gap-4 overflow-y-auto p-4 text-xs">
          <section>
            <h3 className="mb-2 font-medium">{t('master.intelligence.tireCalibration.drawer.section.prediction' as never)}</h3>
            <div className="grid grid-cols-2 gap-2">
              <Metric label={t('master.intelligence.tireCalibration.col.wheel' as never)} value={detail.wheelPosition} />
              <Metric
                label={t('master.intelligence.tireCalibration.col.physicalTire' as never)}
                value={physicalLabel}
              />
              <Metric label={t('master.intelligence.tireCalibration.picker.mountPeriod' as never)} value={detail.mountPeriodId} />
              <Metric label={t('master.intelligence.tireCalibration.drawer.predictedTread' as never)} value={formatInterval(predictedTread ?? displayTread)} />
              <Metric label={t('master.intelligence.tireCalibration.drawer.remainingKm' as never)} value={formatInterval(remainingKm)} />
              <Metric
                label={t('master.intelligence.tireCalibration.drawer.modelVersion' as never)}
                value={`${detail.modelVersion} / ${detail.snapshotSchemaVersion}`}
              />
              <Metric
                label={t('master.intelligence.tireCalibration.drawer.sourceOdometerKm' as never)}
                value={detail.sourceOdometerKm}
              />
            </div>
          </section>

          <section>
            <h3 className="mb-2 font-medium">{t('master.intelligence.tireCalibration.drawer.section.eligibility' as never)}</h3>
            <Metric label={t('master.intelligence.tireCalibration.drawer.pairingMode' as never)} value={pairingModeLabel} />
            <ul className="mt-2 list-disc space-y-1 pl-4 text-[11px] text-muted-foreground">
              {eligibilityNotes(detail, t).map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          </section>

          <section>
            <h3 className="mb-2 font-medium">{t('master.intelligence.tireCalibration.drawer.section.temporal' as never)}</h3>
            <div className="grid grid-cols-2 gap-2">
              <Metric
                label={t('master.intelligence.tireCalibration.drawer.ds4Coverage' as never)}
                value={dq?.ds4SeverityCoverage as number | undefined}
              />
              <Metric
                label={t('master.intelligence.tireCalibration.drawer.temporalQuality' as never)}
                value={dq?.temporalQuality as string | undefined}
              />
              <Metric
                label={t('master.intelligence.tireCalibration.drawer.dynamicBeta' as never)}
                value={dq?.dynamicBeta as number | undefined}
              />
              <Metric
                label={t('master.intelligence.tireCalibration.drawer.effectiveFactor' as never)}
                value={dq?.dynamicFactor as number | undefined}
              />
              <Metric
                label={t('master.intelligence.tireCalibration.drawer.sourceComputedAt' as never)}
                value={detail.sourceComputedAt}
              />
              <Metric
                label={t('master.intelligence.tireCalibration.drawer.latestMeasurementAt' as never)}
                value={detail.latestSourceMeasurementAt}
              />
            </div>
          </section>

          <section>
            <h3 className="mb-2 font-medium">{t('master.intelligence.tireCalibration.drawer.section.provenance' as never)}</h3>
            <div className="grid grid-cols-1 gap-2">
              <Metric
                label={t('master.intelligence.tireCalibration.drawer.sourceCutoffUtc' as never)}
                value={detail.sourceDataCutoffAt}
              />
              <Metric
                label={t('master.intelligence.tireCalibration.drawer.rotationDuringMount' as never)}
                value={
                  prov?.rotationDuringMountPeriod === true
                    ? t('master.intelligence.tireCalibration.value.yes' as never)
                    : prov?.rotationDuringMountPeriod === false
                      ? t('master.intelligence.tireCalibration.value.no' as never)
                      : null
                }
              />
              <Metric
                label={t('master.intelligence.tireCalibration.drawer.ledgerRowCount' as never)}
                value={prov?.ledgerRowCount as number | undefined}
              />
              <Metric
                label={t('master.intelligence.tireCalibration.drawer.ledgerDistanceKm' as never)}
                value={prov?.ledgerDistanceKm as number | undefined}
              />
              <Metric
                label={t('master.intelligence.tireCalibration.drawer.odometerAnchorStatus' as never)}
                value={prov?.odometerAnchorStatus as string | null | undefined}
              />
              <Metric
                label={t('master.intelligence.tireCalibration.drawer.eligibilityDigest' as never)}
                value={detail.calibrationEligibilityDigestPrefix}
              />
              <Metric
                label={t('master.intelligence.tireCalibration.drawer.inputFingerprint' as never)}
                value={detail.inputFingerprintPrefix}
              />
              <Metric
                label={t('master.intelligence.tireCalibration.drawer.measurementIdsUsed' as never)}
                value={detail.measurementIdsUsed.length}
              />
            </div>
          </section>
        </div>
      )}
    </SignalDetailSheet>
  );
}
