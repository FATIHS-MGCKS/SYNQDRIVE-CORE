import { useCallback, useEffect, useMemo, useRef } from 'react';
import { MasterTableShell } from '../../shell/MasterTableShell';
import { useLanguage } from '../../../i18n/LanguageContext';
import type { MasterVsiProfileDetailDto } from '../vsi-master-intelligence-api.types';
import { filterSignalsForLedger } from '../vsi-ledger-filter.util';
import type { VsiLedgerFilterState } from '../vsi-ledger-url.types';
import { SignalLedgerFilterBar } from './SignalLedgerFilterBar';
import { SignalLedgerTable } from './SignalLedgerTable';
import { SignalDetailSheet } from './SignalDetailSheet';
import { VsiSignalDetailContent } from './VsiSignalDetailContent';

export type VsiSignalLedgerTabProps = {
  profile: MasterVsiProfileDetailDto;
  multiLinkCount: number;
  filters: VsiLedgerFilterState;
  onFiltersChange: (patch: Partial<VsiLedgerFilterState>) => void;
  onFiltersClear: () => void;
  selectedSignalKey: string | null;
  onOpenSignal: (canonicalSignalKey: string) => void;
  onCloseSignal: () => void;
  onNavigateSignal: (canonicalSignalKey: string) => void;
  vehicleContextLabel: string | null;
  linkContextLabel: string | null;
  formatTimestamp: (iso: string | null | undefined) => string;
};

export function VsiSignalLedgerTab({
  profile,
  multiLinkCount,
  filters,
  onFiltersChange,
  onFiltersClear,
  selectedSignalKey,
  onOpenSignal,
  onCloseSignal,
  onNavigateSignal,
  vehicleContextLabel,
  linkContextLabel,
  formatTimestamp,
}: VsiSignalLedgerTabProps) {
  const { t } = useLanguage();
  const rowRefs = useRef(new Map<string, HTMLButtonElement>());
  const lastOpenedKeyRef = useRef<string | null>(null);

  const filtered = useMemo(
    () => filterSignalsForLedger(profile.signals, filters),
    [profile.signals, filters],
  );

  const selectedInFilter = selectedSignalKey
    ? filtered.find((s) => s.canonicalSignalKey === selectedSignalKey)
    : undefined;

  const selectedSignal =
    selectedInFilter ??
    (selectedSignalKey
      ? profile.signals.find((s) => s.canonicalSignalKey === selectedSignalKey)
      : undefined);

  const sheetOpen = Boolean(selectedInFilter);

  const registerRowRef = useCallback((key: string, el: HTMLButtonElement | null) => {
    if (el) rowRefs.current.set(key, el);
    else rowRefs.current.delete(key);
  }, []);

  useEffect(() => {
    if (sheetOpen && selectedSignalKey) {
      lastOpenedKeyRef.current = selectedSignalKey;
    }
  }, [sheetOpen, selectedSignalKey]);

  const restoreLedgerRowFocus = useCallback(
    (event: Event) => {
      const key = lastOpenedKeyRef.current;
      if (!key) return;
      const rowStillVisible = filtered.some((s) => s.canonicalSignalKey === key);
      const row = rowStillVisible ? rowRefs.current.get(key) : null;
      if (!row) return;
      event.preventDefault();
      row.focus({ preventScroll: true });
    },
    [filtered],
  );

  const handleSheetOpenChange = useCallback(
    (open: boolean) => {
      if (!open && selectedSignalKey) {
        onCloseSignal();
      }
    },
    [onCloseSignal, selectedSignalKey],
  );

  const filteredIndex = selectedInFilter
    ? filtered.findIndex((s) => s.canonicalSignalKey === selectedInFilter.canonicalSignalKey)
    : -1;

  const hasPrevious = filteredIndex > 0;
  const hasNext = filteredIndex >= 0 && filteredIndex < filtered.length - 1;

  const onPrevious = useCallback(() => {
    if (filteredIndex <= 0) return;
    onNavigateSignal(filtered[filteredIndex - 1]!.canonicalSignalKey);
  }, [filtered, filteredIndex, onNavigateSignal]);

  const onNext = useCallback(() => {
    if (filteredIndex < 0 || filteredIndex >= filtered.length - 1) return;
    onNavigateSignal(filtered[filteredIndex + 1]!.canonicalSignalKey);
  }, [filtered, filteredIndex, onNavigateSignal]);

  const effectiveHighlightKey = selectedInFilter?.canonicalSignalKey ?? null;

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">{t('master.intelligence.vsi.signals.intro' as never)}</p>
      {multiLinkCount > 1 ? (
        <p className="text-[11px] text-muted-foreground" role="status">
          {t('master.intelligence.vsi.ledger.multiLinkNotice' as never, { count: multiLinkCount })}
        </p>
      ) : null}
      <MasterTableShell
        toolbar={
          <SignalLedgerFilterBar
            filters={filters}
            onChange={onFiltersChange}
            onClear={onFiltersClear}
            resultCount={filtered.length}
            totalCount={profile.signals.length}
          />
        }
      >
        <SignalLedgerTable
          profile={profile}
          signals={filtered}
          selectedSignalKey={effectiveHighlightKey}
          onSelectSignal={onOpenSignal}
          formatTimestamp={formatTimestamp}
          registerRowRef={registerRowRef}
        />
      </MasterTableShell>
      <p className="text-[11px] text-muted-foreground tabular-nums">
        {t('master.intelligence.vsi.ledger.footerMeta' as never, {
          count: profile.signals.length,
          revision: profile.profileRevision,
        })}
      </p>

      {selectedSignal && sheetOpen ? (
        <SignalDetailSheet
          open={sheetOpen}
          onOpenChange={handleSheetOpenChange}
          title={selectedSignal.canonicalSignalKey}
          description={
            <>
              <span className="block">{selectedSignal.providerNativeSignalName}</span>
              {vehicleContextLabel ? (
                <span className="mt-1 block text-muted-foreground">
                  {t('master.intelligence.vsi.ledger.detail.context.vehicle' as never)}:{' '}
                  {vehicleContextLabel}
                </span>
              ) : null}
              {linkContextLabel ? (
                <span className="block text-muted-foreground">
                  {t('master.intelligence.vsi.ledger.detail.context.link' as never)}: {linkContextLabel}
                </span>
              ) : null}
              <span className="mt-1 block tabular-nums text-muted-foreground">
                {t('master.intelligence.vsi.ledger.detail.context.revision' as never, {
                  revision: profile.profileRevision,
                })}{' '}
                · {formatTimestamp(profile.evaluatedAt)}
              </span>
            </>
          }
          hasPrevious={hasPrevious}
          hasNext={hasNext}
          onPrevious={onPrevious}
          onNext={onNext}
          onCloseAutoFocus={restoreLedgerRowFocus}
        >
          <VsiSignalDetailContent
            profile={profile}
            signal={selectedSignal}
            formatTimestamp={formatTimestamp}
          />
        </SignalDetailSheet>
      ) : null}

      {selectedSignalKey && !selectedInFilter && profile.signals.some((s) => s.canonicalSignalKey === selectedSignalKey) ? (
        <p className="text-xs text-muted-foreground" role="status">
          {t('master.intelligence.vsi.ledger.detail.hiddenByFilters' as never)}
        </p>
      ) : null}
    </div>
  );
}
