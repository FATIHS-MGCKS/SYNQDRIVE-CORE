import type { VsiEngineRpmDualProvenanceView } from './vsi-engine-rpm-dual-provenance.utils';

type TranslateFn = (key: string, params?: Record<string, string | number>) => string;

type Props = {
  dual: VsiEngineRpmDualProvenanceView;
  formatTimestamp: (iso: string | null | undefined) => string;
  t: TranslateFn;
};

export function VsiEngineRpmDualProvenancePanel({ dual, formatTimestamp, t }: Props) {
  const { snapshot, cadence, profileEvaluatedAt, rpmApplicability, combinedEvidenceAvailabilityV1 } =
    dual;

  return (
    <div
      className="space-y-3 rounded-md border border-border/50 bg-muted/20 p-3 text-xs"
      data-testid="vsi-engine-rpm-dual-provenance"
    >
      <p className="text-muted-foreground">{t('master.intelligence.vsi.signals.rpmDual.intro')}</p>

      {combinedEvidenceAvailabilityV1 ? (
        <p className="font-medium" data-testid="vsi-rpm-combined-evidence">
          {t('master.intelligence.vsi.signals.rpmCombined.heading' as never)}:{' '}
          {t(
            `master.intelligence.vsi.signals.rpmCombined.${combinedEvidenceAvailabilityV1}` as never,
          )}
        </p>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2">
        <section aria-labelledby="vsi-rpm-snapshot-heading">
          <h4 id="vsi-rpm-snapshot-heading" className="font-medium">
            {t('master.intelligence.vsi.signals.rpmDual.snapshotHeading')}
          </h4>
          <p className="mt-1 text-[10px] text-muted-foreground">
            {t('master.intelligence.vsi.signals.rpmDual.snapshotWindow')}
          </p>
          <dl className="mt-2 space-y-1 font-mono text-[11px]">
            <div className="flex flex-wrap gap-x-2">
              <dt className="text-muted-foreground">{t('master.intelligence.vsi.signals.rpmDual.empirical')}</dt>
              <dd>{snapshot.empiricalObservation}</dd>
            </div>
            <div className="flex flex-wrap gap-x-2">
              <dt className="text-muted-foreground">{t('master.intelligence.vsi.signals.rpmDual.freshness')}</dt>
              <dd>{snapshot.freshnessClassification ?? '—'}</dd>
            </div>
            <div className="flex flex-wrap gap-x-2">
              <dt className="text-muted-foreground">{t('master.intelligence.vsi.signals.rpmDual.lastValid')}</dt>
              <dd className="tabular-nums">{formatTimestamp(snapshot.lastValidObservationAt)}</dd>
            </div>
            <div className="flex flex-wrap gap-x-2">
              <dt className="text-muted-foreground">{t('master.intelligence.vsi.signals.rpmDual.quality')}</dt>
              <dd>
                {snapshot.qualityClassification ?? '—'} / {snapshot.confidenceLevel ?? '—'}
              </dd>
            </div>
            <div className="flex flex-wrap gap-x-2">
              <dt className="text-muted-foreground">{t('master.intelligence.vsi.signals.rpmDual.provenance')}</dt>
              <dd>{snapshot.evidenceProvenance.length ? snapshot.evidenceProvenance.join(', ') : '—'}</dd>
            </div>
          </dl>
        </section>

        <section aria-labelledby="vsi-rpm-cadence-heading">
          <h4 id="vsi-rpm-cadence-heading" className="font-medium">
            {t('master.intelligence.vsi.signals.rpmDual.cadenceHeading')}
          </h4>
          {rpmApplicability === 'NOT_APPLICABLE' ? (
            <p className="mt-2 text-muted-foreground">
              {t('master.intelligence.vsi.signals.rpmDual.notApplicable')}
            </p>
          ) : !cadence.hasHfEvidence ? (
            <p className="mt-2 text-muted-foreground">
              {t('master.intelligence.vsi.signals.rpmDual.noHfEvidence')}
            </p>
          ) : (
            <>
              <p className="mt-1 text-[10px] text-muted-foreground">
                {t('master.intelligence.vsi.signals.rpmDual.cadenceWindow')}
              </p>
              <dl className="mt-2 space-y-1 font-mono text-[11px]">
                <div className="flex flex-wrap gap-x-2">
                  <dt className="text-muted-foreground">
                    {t('master.intelligence.vsi.signals.rpmDual.observedSamples')}
                  </dt>
                  <dd>{cadence.observedSampleCount ?? '—'}</dd>
                </div>
                <div className="flex flex-wrap gap-x-2">
                  <dt className="text-muted-foreground">
                    {t('master.intelligence.vsi.signals.rpmDual.activeProfile')}
                  </dt>
                  <dd>{cadence.activeRpmProfile ?? 'UNKNOWN'}</dd>
                </div>
                <div className="flex flex-wrap gap-x-2">
                  <dt className="text-muted-foreground">
                    {t('master.intelligence.vsi.signals.rpmDual.profileEvaluatedAt')}
                  </dt>
                  <dd className="tabular-nums">{formatTimestamp(profileEvaluatedAt)}</dd>
                </div>
                <div className="flex flex-wrap gap-x-2">
                  <dt className="text-muted-foreground">{t('master.intelligence.vsi.signals.rpmDual.provenance')}</dt>
                  <dd>{cadence.provenance.length ? cadence.provenance.join(', ') : '—'}</dd>
                </div>
                {cadence.finalizedTripCount != null ? (
                  <div className="flex flex-wrap gap-x-2">
                    <dt className="text-muted-foreground">
                      {t('master.intelligence.vsi.signals.rpmDual.finalizedTrips')}
                    </dt>
                    <dd>{cadence.finalizedTripCount}</dd>
                  </div>
                ) : null}
                {cadence.classificationDecisionCode ? (
                  <div className="flex flex-wrap gap-x-2">
                    <dt className="text-muted-foreground">{t('master.intelligence.vsi.signals.rpmDual.decision')}</dt>
                    <dd>{cadence.classificationDecisionCode}</dd>
                  </div>
                ) : null}
              </dl>
              {cadence.tripClassifications.length > 0 ? (
                <div className="mt-2">
                  <p className="text-[10px] font-medium text-muted-foreground">
                    {t('master.intelligence.vsi.signals.rpmDual.tripSupport')}
                  </p>
                  <ul className="mt-1 max-h-32 space-y-1 overflow-y-auto font-mono text-[10px]">
                    {cadence.tripClassifications.map((trip) => (
                      <li key={trip.tripId} className="rounded border border-border/40 px-2 py-1">
                        {trip.profile} · {trip.decisionCode}
                        {trip.rpmPointCount != null ? ` · n=${trip.rpmPointCount}` : ''}
                        <span className="ml-1 text-muted-foreground">{trip.tripId.slice(0, 8)}…</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
