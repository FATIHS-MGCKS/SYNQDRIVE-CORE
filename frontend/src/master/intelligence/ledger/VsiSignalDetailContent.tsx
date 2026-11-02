import { useMemo, type ReactNode } from 'react';
import { useLanguage } from '../../../i18n/LanguageContext';
import type { MasterVsiProfileDetailDto, MasterVsiSignalDetailDto } from '../vsi-master-intelligence-api.types';
import {
  buildEngineRpmDualProvenanceView,
  ENGINE_RPM_CANONICAL_KEY,
} from '../vsi-engine-rpm-dual-provenance.utils';
import { VsiEngineRpmDualProvenancePanel } from '../VsiEngineRpmDualProvenancePanel';
import { buildEvidenceSummaryFromSignal } from './evidence-summary.utils';
import { EvidenceSummaryStrip } from './EvidenceSummaryStrip';
import { EvidenceTimestamp } from './EvidenceTimestamp';
import { LimitationTagList } from './LimitationTagList';
import { limitationCodesGrouped } from './limitation-group.util';
import { parseLvCadenceEvidence } from './parse-lv-cadence-evidence.util';
import { parseRpmCadenceDetail } from './parse-rpm-cadence-detail.util';
import { ProvenanceList } from './ProvenanceList';
import { readCadenceProvenanceTags } from './dedupe-provenance-display.util';
import { EvidenceDimensionChip } from './EvidenceDimensionChip';

export type VsiSignalDetailContentProps = {
  profile: MasterVsiProfileDetailDto;
  signal: MasterVsiSignalDetailDto;
  formatTimestamp: (iso: string | null | undefined) => string;
};

function DetailSection({
  title,
  children,
  id,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="min-w-0 space-y-2">
      <h3 id={id} className="text-xs font-medium text-foreground">
        {title}
      </h3>
      {children}
    </section>
  );
}

export function VsiSignalDetailContent({
  profile,
  signal,
  formatTimestamp,
}: VsiSignalDetailContentProps) {
  const { t } = useLanguage();

  const summaryItems = useMemo(() => buildEvidenceSummaryFromSignal(signal), [signal]);
  const showRpmNote =
    signal.canonicalSignalKey === ENGINE_RPM_CANONICAL_KEY &&
    signal.empiricalObservation === 'NEVER_OBSERVED' &&
    signal.rpmCombinedEvidenceAvailabilityV1 === 'PROVEN_HISTORICAL_ONLY';

  const cadenceTags = readCadenceProvenanceTags(signal.cadenceIntelligence);
  const isEngineRpm = signal.canonicalSignalKey === ENGINE_RPM_CANONICAL_KEY;
  const dual = isEngineRpm ? buildEngineRpmDualProvenanceView(profile, signal) : null;
  const rpmCadenceDetail = isEngineRpm ? parseRpmCadenceDetail(signal) : null;
  const lvCadence = parseLvCadenceEvidence(signal.cadenceIntelligence);

  const allLimitationCodes = useMemo(() => {
    const merged = [
      ...(signal.limitations ?? []),
      ...(signal.rpmCombinedEvidenceLimitationsV1 ?? []),
      ...(rpmCadenceDetail?.cadenceLimitations ?? []),
      ...(lvCadence?.limitations ?? []),
    ];
    return [...new Set(merged.map((c) => c.trim()).filter(Boolean))];
  }, [signal, rpmCadenceDetail, lvCadence]);

  const grouped = limitationCodesGrouped(allLimitationCodes);

  return (
    <div className="flex min-w-0 flex-col gap-6 pb-4">
      <DetailSection
        id="vsi-detail-summary"
        title={t('master.intelligence.vsi.ledger.detail.section.summary' as never)}
      >
        <EvidenceSummaryStrip items={summaryItems} showRpmCompatibilityNote={showRpmNote} />
      </DetailSection>

      <DetailSection
        id="vsi-detail-timeline"
        title={t('master.intelligence.vsi.ledger.detail.section.timeline' as never)}
      >
        <div className="space-y-3 rounded-lg border border-border/60 bg-card/30 p-3">
          <EvidenceTimestamp kind="observation" iso={signal.lastValidObservationAt} />
          <EvidenceTimestamp kind="source" iso={signal.lastSourceTimestamp} />
          <EvidenceTimestamp kind="providerFetch" iso={signal.lastProviderFetchAt} />
          <div className="border-t border-border/40 pt-2">
            <span className="text-xs text-muted-foreground">
              {t('master.intelligence.vsi.ledger.detail.timeline.evaluatedAt' as never)}
            </span>{' '}
            <time dateTime={profile.evaluatedAt} className="text-xs tabular-nums text-foreground">
              {formatTimestamp(profile.evaluatedAt)}
            </time>
          </div>
        </div>
      </DetailSection>

      <DetailSection
        id="vsi-detail-provenance"
        title={t('master.intelligence.vsi.ledger.detail.section.provenance' as never)}
      >
        <ProvenanceList snapshotTags={signal.evidenceProvenance} cadenceTags={cadenceTags} />
      </DetailSection>

      {isEngineRpm && dual ? (
        <DetailSection
          id="vsi-detail-rpm"
          title={t('master.intelligence.vsi.ledger.detail.section.rpm' as never)}
        >
          <div className="space-y-3">
            {signal.rpmCombinedEvidenceAvailabilityV1 ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] text-muted-foreground">
                  {t('master.intelligence.vsi.signals.rpmCombined.heading' as never)}
                </span>
                <EvidenceDimensionChip
                  kind="combinedRpm"
                  value={signal.rpmCombinedEvidenceAvailabilityV1}
                  attributionLimited={(signal.rpmCombinedEvidenceLimitationsV1?.length ?? 0) > 0}
                />
              </div>
            ) : null}
            {(signal.rpmCombinedEvidenceLimitationsV1?.length ?? 0) > 0 ? (
              <LimitationTagList codes={signal.rpmCombinedEvidenceLimitationsV1} />
            ) : null}
            <VsiEngineRpmDualProvenancePanel
              dual={dual}
              formatTimestamp={formatTimestamp}
              t={(key, params) => t(key as never, params as never)}
            />
            {rpmCadenceDetail ? (
              <div className="rounded-lg border border-border/60 bg-muted/10 p-3 text-xs space-y-2">
                {profile.observedDensityLabel ? (
                  <p>
                    <span className="text-muted-foreground">
                      {t('master.intelligence.vsi.ledger.detail.rpm.density' as never)}:{' '}
                    </span>
                    <span className="font-mono tabular-nums">{profile.observedDensityLabel}</span>
                  </p>
                ) : null}
                {rpmCadenceDetail.contractVersion ? (
                  <p className="font-mono text-[10px] text-muted-foreground">
                    {rpmCadenceDetail.contractVersion}
                  </p>
                ) : null}
                {rpmCadenceDetail.regimes.length > 0 ? (
                  <div>
                    <p className="text-[11px] font-medium">
                      {t('master.intelligence.vsi.ledger.detail.rpm.regimes' as never)}
                    </p>
                    <ul className="mt-1 space-y-1 font-mono text-[10px]">
                      {rpmCadenceDetail.regimes.map((r, idx) => (
                        <li key={`${r.kind}-${idx}`} className="rounded border border-border/40 px-2 py-1">
                          {r.kind}
                          {r.sampleCount != null ? ` · n=${r.sampleCount}` : ''}
                          {r.confidence ? ` · ${r.confidence}` : ''}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {rpmCadenceDetail.tierResolution ? (
                  <div>
                    <p className="text-[11px] font-medium">
                      {t('master.intelligence.vsi.ledger.detail.rpm.tierResolution' as never)}
                    </p>
                    <dl className="mt-1 space-y-1 font-mono text-[10px]">
                      <div>
                        <dt className="inline text-muted-foreground">tier </dt>
                        <dd className="inline">{rpmCadenceDetail.tierResolution.tier ?? '—'}</dd>
                      </div>
                      <div>
                        <dt className="inline text-muted-foreground">decision </dt>
                        <dd className="inline">{rpmCadenceDetail.tierResolution.decisionCode ?? '—'}</dd>
                      </div>
                      {rpmCadenceDetail.tierResolution.provenance.length > 0 ? (
                        <div>
                          <dt className="text-muted-foreground">provenance</dt>
                          <dd>{rpmCadenceDetail.tierResolution.provenance.join(', ')}</dd>
                        </div>
                      ) : null}
                    </dl>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </DetailSection>
      ) : null}

      {lvCadence ? (
        <DetailSection
          id="vsi-detail-lv"
          title={t('master.intelligence.vsi.ledger.detail.section.lv' as never)}
        >
          <dl className="space-y-2 rounded-lg border border-border/60 bg-card/30 p-3 text-xs">
            <div>
              <dt className="text-muted-foreground">
                {t('master.intelligence.vsi.ledger.detail.lv.standbyProfile' as never)}
              </dt>
              <dd className="font-mono">{lvCadence.standbyProfile ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">
                {t('master.intelligence.vsi.ledger.detail.lv.classification' as never)}
              </dt>
              <dd className="font-mono">{lvCadence.classificationDecisionCode ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">
                {t('master.intelligence.vsi.ledger.detail.lv.confidence' as never)}
              </dt>
              <dd className="font-mono">{lvCadence.evidenceConfidence ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">
                {t('master.intelligence.vsi.ledger.detail.lv.sampleCount' as never)}
              </dt>
              <dd className="font-mono tabular-nums">{lvCadence.observedSampleCount ?? '—'}</dd>
            </div>
            {lvCadence.provenance.length > 0 ? (
              <div>
                <dt className="text-muted-foreground">provenance</dt>
                <dd className="font-mono text-[10px]">{lvCadence.provenance.join(', ')}</dd>
              </div>
            ) : null}
          </dl>
        </DetailSection>
      ) : signal.canonicalSignalKey === 'lv_voltage' ? (
        <p className="text-xs text-muted-foreground">
          {t('master.intelligence.vsi.ledger.detail.lv.empty' as never)}
        </p>
      ) : null}

      {allLimitationCodes.length > 0 ? (
        <DetailSection
          id="vsi-detail-limitations"
          title={t('master.intelligence.vsi.ledger.detail.section.limitations' as never)}
        >
          {grouped.attribution.length > 0 ? (
            <div className="space-y-2">
              <p className="text-[11px] font-medium text-muted-foreground">
                {t('master.intelligence.vsi.ledger.detail.limitations.attributionGroup' as never)}
              </p>
              <LimitationTagList codes={grouped.attribution} />
            </div>
          ) : null}
          {grouped.other.length > 0 ? (
            <div className="space-y-2">
              <p className="text-[11px] font-medium text-muted-foreground">
                {t('master.intelligence.vsi.ledger.detail.limitations.otherGroup' as never)}
              </p>
              <LimitationTagList codes={grouped.other} highlightAttribution={false} />
            </div>
          ) : null}
        </DetailSection>
      ) : null}

      <footer className="border-t border-border/40 pt-3 text-[10px] text-muted-foreground">
        <p>
          {t('master.intelligence.vsi.ledger.detail.context.revision' as never, {
            revision: profile.profileRevision,
          })}
        </p>
        <p className="mt-1 font-mono">{profile.contentFingerprintPrefix}</p>
      </footer>
    </div>
  );
}
