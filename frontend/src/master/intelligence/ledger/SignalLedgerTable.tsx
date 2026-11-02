import { ChevronRight } from 'lucide-react';
import { useLanguage } from '../../../i18n/LanguageContext';
import { cn } from '../../../components/ui/utils';
import type { MasterVsiProfileDetailDto, MasterVsiSignalDetailDto } from '../vsi-master-intelligence-api.types';
import { ENGINE_RPM_CANONICAL_KEY } from '../vsi-engine-rpm-dual-provenance.utils';
import { countSignalLimitations, hasAttributableHfEvidence } from '../vsi-ledger-filter.util';
import { dedupeProvenanceTagsForDisplay } from './dedupe-provenance-display.util';
import { EvidenceDimensionChip } from './EvidenceDimensionChip';
import { EvidenceTimestamp } from './EvidenceTimestamp';

export type SignalLedgerTableProps = {
  profile: MasterVsiProfileDetailDto;
  signals: MasterVsiSignalDetailDto[];
  selectedSignalKey: string | null;
  onSelectSignal: (canonicalSignalKey: string) => void;
  formatTimestamp: (iso: string | null | undefined) => string;
  registerRowRef?: (canonicalSignalKey: string, el: HTMLButtonElement | null) => void;
};

export function SignalLedgerTable({
  signals,
  selectedSignalKey,
  onSelectSignal,
  registerRowRef,
}: SignalLedgerTableProps) {
  const { t } = useLanguage();

  if (signals.length === 0) {
    return (
      <p className="rounded-lg border border-border/60 bg-muted/20 p-4 text-sm text-muted-foreground">
        {t('master.intelligence.vsi.ledger.emptyFiltered' as never)}
      </p>
    );
  }

  return (
    <>
      <div className="hidden md:block overflow-x-auto rounded-lg border border-border/60">
        <table className="w-full min-w-[1100px] text-left text-xs">
          <caption className="sr-only">
            {t('master.intelligence.vsi.ledger.table.caption' as never)}
          </caption>
          <thead className="bg-muted/40 text-muted-foreground">
            <tr>
              <th scope="col" className="sticky left-0 z-[1] bg-muted/40 px-2 py-2">
                {t('master.intelligence.vsi.ledger.col.signal' as never)}
              </th>
              <th scope="col" className="px-2 py-2">
                {t('master.intelligence.vsi.ledger.dimension.applicability' as never)}
              </th>
              <th scope="col" className="px-2 py-2">
                {t('master.intelligence.vsi.ledger.dimension.declared' as never)}
              </th>
              <th scope="col" className="px-2 py-2">
                {t('master.intelligence.vsi.ledger.dimension.observation' as never)}
              </th>
              <th scope="col" className="px-2 py-2">
                {t('master.intelligence.vsi.ledger.dimension.freshness' as never)}
              </th>
              <th scope="col" className="px-2 py-2">
                {t('master.intelligence.vsi.ledger.col.qualityConfidence' as never)}
              </th>
              <th scope="col" className="px-2 py-2">
                {t('master.intelligence.vsi.ledger.dimension.combinedRpm' as never)}
              </th>
              <th scope="col" className="px-2 py-2">
                {t('master.intelligence.vsi.ledger.col.lastObservation' as never)}
              </th>
              <th scope="col" className="px-2 py-2">
                {t('master.intelligence.vsi.ledger.col.limitations' as never)}
              </th>
              <th scope="col" className="px-2 py-2">
                {t('master.intelligence.vsi.ledger.col.provenance' as never)}
              </th>
              <th scope="col" className="px-2 py-2 w-10">
                <span className="sr-only">{t('master.intelligence.vsi.ledger.col.action' as never)}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {signals.map((signal) => {
              const isSelected = selectedSignalKey === signal.canonicalSignalKey;
              const isEngineRpm = signal.canonicalSignalKey === ENGINE_RPM_CANONICAL_KEY;
              const limCount = countSignalLimitations(signal);
              const attributionLimited =
                (signal.rpmCombinedEvidenceLimitationsV1?.length ?? 0) > 0;

              return (
                <tr
                  key={signal.canonicalSignalKey}
                  className={cn('border-t border-border/40', isSelected && 'bg-muted/30')}
                >
                  <td className="sticky left-0 z-[1] bg-background px-2 py-1.5 align-top">
                    <button
                      type="button"
                      ref={(el) => registerRowRef?.(signal.canonicalSignalKey, el)}
                      className="w-full text-left outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
                      aria-selected={isSelected}
                      onClick={() => onSelectSignal(signal.canonicalSignalKey)}
                      aria-label={t('master.intelligence.vsi.ledger.selectSignal' as never, {
                        signal: signal.canonicalSignalKey,
                      })}
                    >
                      <span className="block font-mono text-[11px]">{signal.canonicalSignalKey}</span>
                      <span className="block text-[10px] text-muted-foreground">
                        {signal.providerNativeSignalName}
                      </span>
                    </button>
                  </td>
                  <td className="px-1 py-1 align-top">
                    <EvidenceDimensionChip
                      kind="applicability"
                      value={signal.powertrainApplicability ?? null}
                      className="min-h-0 py-0.5"
                    />
                  </td>
                  <td className="px-1 py-1 align-top">
                    <EvidenceDimensionChip
                      kind="declared"
                      value={signal.declaredSupport || null}
                      className="min-h-0 py-0.5"
                    />
                  </td>
                  <td className="px-1 py-1 align-top">
                    <EvidenceDimensionChip
                      kind="observation"
                      value={signal.empiricalObservation || null}
                      className="min-h-0 py-0.5"
                    />
                  </td>
                  <td className="px-1 py-1 align-top">
                    <EvidenceDimensionChip
                      kind="freshness"
                      value={signal.freshnessClassification}
                      className="min-h-0 py-0.5"
                    />
                  </td>
                  <td className="px-1 py-1 align-top">
                    <div className="flex flex-col gap-1">
                      <EvidenceDimensionChip
                        kind="quality"
                        value={signal.qualityClassification}
                        className="min-h-0 py-0.5"
                      />
                      <EvidenceDimensionChip
                        kind="confidence"
                        value={signal.confidenceLevel}
                        className="min-h-0 py-0.5"
                      />
                    </div>
                  </td>
                  <td className="px-1 py-1 align-top">
                    {isEngineRpm ? (
                      <EvidenceDimensionChip
                        kind="combinedRpm"
                        value={signal.rpmCombinedEvidenceAvailabilityV1 ?? null}
                        attributionLimited={attributionLimited}
                        className="min-h-0 py-0.5"
                      />
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-2 py-1 align-top">
                    <EvidenceTimestamp
                      kind="observation"
                      iso={signal.lastValidObservationAt}
                      showUtc={false}
                    />
                  </td>
                  <td className="px-2 py-1 tabular-nums align-top">{limCount || '—'}</td>
                  <td className="px-2 py-1 align-top">
                    <ProvenanceMarkers signal={signal} />
                  </td>
                  <td className="px-2 py-1 align-top">
                    <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <ul className="md:hidden m-0 flex list-none flex-col gap-2 p-0">
        {signals.map((signal) => {
          const isSelected = selectedSignalKey === signal.canonicalSignalKey;
          const isEngineRpm = signal.canonicalSignalKey === ENGINE_RPM_CANONICAL_KEY;
          return (
            <li key={signal.canonicalSignalKey}>
              <button
                type="button"
                ref={(el) => registerRowRef?.(signal.canonicalSignalKey, el)}
                className={cn(
                  'w-full rounded-lg border border-border/60 p-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  isSelected && 'border-border bg-muted/30',
                )}
                aria-selected={isSelected}
                onClick={() => onSelectSignal(signal.canonicalSignalKey)}
                aria-label={t('master.intelligence.vsi.ledger.selectSignal' as never, {
                  signal: signal.canonicalSignalKey,
                })}
              >
                <p className="font-mono text-xs">{signal.canonicalSignalKey}</p>
                <p className="text-[11px] text-muted-foreground">{signal.providerNativeSignalName}</p>
                <div className="mt-2 flex flex-wrap gap-1">
                  <EvidenceDimensionChip
                    kind="observation"
                    value={signal.empiricalObservation || null}
                    className="min-h-0"
                  />
                  <EvidenceDimensionChip
                    kind="freshness"
                    value={signal.freshnessClassification}
                    className="min-h-0"
                  />
                  {isEngineRpm ? (
                    <EvidenceDimensionChip
                      kind="combinedRpm"
                      value={signal.rpmCombinedEvidenceAvailabilityV1 ?? null}
                      attributionLimited={(signal.rpmCombinedEvidenceLimitationsV1?.length ?? 0) > 0}
                      className="min-h-0"
                    />
                  ) : null}
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}

function ProvenanceMarkers({ signal }: { signal: MasterVsiSignalDetailDto }) {
  const { t } = useLanguage();
  const snapshot = dedupeProvenanceTagsForDisplay(signal.evidenceProvenance).length > 0;
  const hf = hasAttributableHfEvidence(signal);
  if (!snapshot && !hf) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="inline-flex gap-1 font-mono text-[10px]">
      {snapshot ? (
        <span title={t('master.intelligence.vsi.ledger.provenance.laneSnapshot' as never)}>S</span>
      ) : null}
      {hf ? (
        <span title={t('master.intelligence.vsi.ledger.provenance.laneCadence' as never)}>HF</span>
      ) : null}
    </span>
  );
}
