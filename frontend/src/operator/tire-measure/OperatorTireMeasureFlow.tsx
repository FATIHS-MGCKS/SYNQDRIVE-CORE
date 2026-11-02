import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Loader2, Sparkles, X } from 'lucide-react';
import { toast } from 'sonner';
import type { OperatorSheetAction } from '../lib/operatorTypes';
import { useOperatorShell } from '../context/OperatorShellContext';
import { useFleetVehicles } from '../../rental/FleetContext';
import { useRentalOrg } from '../../rental/RentalContext';
import { invalidateRentalHealthForVehicle } from '../../rental/lib/rental-health-query';
import { useOperatorTabletLayout } from '../hooks/useOperatorTabletLayout';
import { OperatorTireMeasureTreadGrid } from './OperatorTireMeasureTreadGrid';
import {
  defaultTireSetupSelection,
  dispatchTireMeasurementSaved,
  submitOperatorTireMeasurement,
} from './operatorTireMeasurePayload';
import {
  OPERATOR_TIRE_MEASURE_STEPS,
  type OperatorTireContextForm,
  type OperatorTireMeasureSource,
  type OperatorTireMeasureStep,
  type OperatorTireTreadForm,
} from './operatorTireMeasure.types';
import {
  defaultMeasuredAtLocal,
  deriveOperatorV3EvidenceWarnings,
  deriveTirePlausibilityWarnings,
  formatTreadInput,
  operatorTireMeasureV3BackendWarningKey,
  resolveOperatorOdometerSourceKey,
  SEASON_LABELS,
  validateTireMeasureStep,
} from './operatorTireMeasure.utils';
import { useOperatorTireMeasureData } from './useOperatorTireMeasureData';
import { useLanguage } from '../../i18n/LanguageContext';
import type { TranslationKey } from '../../i18n/translations/en';

type TireMeasureAction = Extract<OperatorSheetAction, { type: 'tire-measure' }>;

const STEP_LABELS: Record<OperatorTireMeasureStep, string> = {
  vehicle: 'Fahrzeug',
  set: 'Reifenset',
  tread: 'Profil',
  context: 'Kontext',
  review: 'Prüfen',
};

const SOURCE_OPTIONS: { value: OperatorTireMeasureSource; label: string }[] = [
  { value: 'manual', label: 'Manuell' },
  { value: 'workshop', label: 'Werkstattbericht' },
  { value: 'ai_confirmed', label: 'AI Upload / Dokument' },
];

function stepIndex(step: OperatorTireMeasureStep): number {
  return OPERATOR_TIRE_MEASURE_STEPS.indexOf(step);
}

interface Props {
  action: TireMeasureAction;
}

export function OperatorTireMeasureFlow({ action }: Props) {
  const { t } = useLanguage();
  const isTablet = useOperatorTabletLayout();
  const { closeSheet, openSheet, triggerRefresh } = useOperatorShell();
  const { orgId } = useRentalOrg();
  const { reloadHealth } = useFleetVehicles();
  const data = useOperatorTireMeasureData(action.vehicleId);

  const [step, setStep] = useState<OperatorTireMeasureStep>('vehicle');
  const [selectedSetupId, setSelectedSetupId] = useState<string>('__unknown__');
  const [tread, setTread] = useState<OperatorTireTreadForm>({ fl: '', fr: '', rl: '', rr: '' });
  const [context, setContext] = useState<OperatorTireContextForm>({
    measuredAt: defaultMeasuredAtLocal(),
    odometerKm: '',
    confirmOdometerKm: false,
    source: 'manual',
    workshopName: '',
    note: '',
  });
  const [stepError, setStepError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const plausibilityWarnings = useMemo(() => deriveTirePlausibilityWarnings(tread), [tread]);
  const v3EvidenceWarnings = useMemo(
    () => deriveOperatorV3EvidenceWarnings(tread, context),
    [tread, context],
  );
  const odometerSourceKey = useMemo(
    () => resolveOperatorOdometerSourceKey(context, data.odometerKm),
    [context, data.odometerKm],
  );
  const odometerSourceLabel = useMemo(
    () =>
      t(`operator.tireMeasure.odometerSource.${odometerSourceKey}` as TranslationKey),
    [t, odometerSourceKey],
  );
  const formatStepError = useCallback(
    (err: string | null) => {
      if (!err) return null;
      if (err.startsWith('operator.tireMeasure.')) return t(err as TranslationKey);
      return err;
    },
    [t],
  );

  useEffect(() => {
    setStep('vehicle');
    setStepError(null);
    setSubmitError(null);
    setSubmitting(false);
    setTread({
      fl: formatTreadInput(action.prefilledTread?.fl),
      fr: formatTreadInput(action.prefilledTread?.fr),
      rl: formatTreadInput(action.prefilledTread?.rl),
      rr: formatTreadInput(action.prefilledTread?.rr),
    });
    setContext((prev) => ({
      ...prev,
      measuredAt: defaultMeasuredAtLocal(),
      odometerKm:
        action.initialOdometerKm != null
          ? String(action.initialOdometerKm)
          : data.odometerKm != null
            ? String(Math.round(data.odometerKm))
            : '',
      confirmOdometerKm: false,
      source: action.sourceHint ?? 'manual',
      workshopName: '',
      note: action.bookingId ? `Handover Buchung ${action.bookingId.slice(0, 8)}…` : '',
    }));
  }, [
    action.vehicleId,
    action.prefilledTread,
    action.initialOdometerKm,
    action.sourceHint,
    action.bookingId,
    data.odometerKm,
  ]);

  useEffect(() => {
    if (data.setupOptions.length > 0) {
      setSelectedSetupId(defaultTireSetupSelection(data.setupOptions));
    }
  }, [data.setupOptions]);

  const vehicleLabel = useMemo(() => {
    const v = data.vehicle;
    if (!v) return action.vehicleLabel;
    return `${v.model ?? 'Fahrzeug'} · ${v.license ?? '—'}`;
  }, [data.vehicle, action.vehicleLabel]);

  const plate = data.vehicle?.license ?? action.vehicleLabel.split('·').pop()?.trim() ?? '—';

  const goNext = useCallback(() => {
    const err = validateTireMeasureStep(step, tread, context);
    if (err) {
      setStepError(err);
      return;
    }
    setStepError(null);
    const idx = stepIndex(step);
    if (idx < OPERATOR_TIRE_MEASURE_STEPS.length - 1) {
      setStep(OPERATOR_TIRE_MEASURE_STEPS[idx + 1]!);
    }
  }, [step, tread, context]);

  const goBack = useCallback(() => {
    setStepError(null);
    const idx = stepIndex(step);
    if (idx > 0) {
      setStep(OPERATOR_TIRE_MEASURE_STEPS[idx - 1]!);
    } else {
      closeSheet();
    }
  }, [step, closeSheet]);

  const openAiUpload = () => {
    openSheet({
      type: 'ai-upload',
      vehicleId: action.vehicleId,
      vehicleLabel: action.vehicleLabel,
      bookingId: action.bookingId,
      initialDocType: 'TIRE',
      contextMode: 'tire',
    });
  };

  const handleSave = async () => {
    const err = validateTireMeasureStep('tread', tread, context);
    if (err) {
      setStepError(err);
      setStep('tread');
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const setupId =
        selectedSetupId === '__unknown__' ? null : selectedSetupId;
      const result = await submitOperatorTireMeasurement({
        vehicleId: action.vehicleId,
        tireSetupId: setupId,
        tread,
        context,
      });
      toast.success(t('operator.tireMeasure.toast.success'));
      const backendWarnings = result?.v3Ingestion?.warnings ?? [];
      if (backendWarnings.length > 0) {
        const lines = backendWarnings
          .map((w) => {
            const key = operatorTireMeasureV3BackendWarningKey(String(w.code ?? ''));
            return key ? t(key as TranslationKey) : String(w.code ?? '');
          })
          .filter(Boolean);
        if (lines.length > 0) {
          toast.message(t('operator.tireMeasure.toast.v3EvidenceNotice'), {
            description: lines.join(' · '),
          });
        }
      }
      dispatchTireMeasurementSaved(action.vehicleId, action.bookingId);
      triggerRefresh();
      if (orgId) {
        invalidateRentalHealthForVehicle(orgId, action.vehicleId);
      } else {
        reloadHealth();
      }
      void data.reload();
      action.onSuccess?.();
      closeSheet();
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : 'Speichern fehlgeschlagen');
    } finally {
      setSubmitting(false);
    }
  };

  const progress = ((stepIndex(step) + 1) / OPERATOR_TIRE_MEASURE_STEPS.length) * 100;
  const isReview = step === 'review';

  const selectedSetup = data.setupOptions.find((o) => o.id === selectedSetupId);

  return (
    <div
      className="fixed inset-0 z-[135] flex flex-col bg-background"
      style={{
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
      role="dialog"
      aria-modal
      aria-labelledby="operator-tire-measure-title"
    >
      <header className="shrink-0 border-b border-border/50 px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Reifenprofil messen
            </p>
            <h2 id="operator-tire-measure-title" className="truncate text-base font-bold text-foreground">
              {vehicleLabel}
            </h2>
          </div>
          <button
            type="button"
            onClick={closeSheet}
            className="sq-press flex h-11 w-11 items-center justify-center rounded-xl border border-border/60"
            aria-label="Schließen"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-3">
          <div className="mb-1 flex justify-between text-[10px] font-semibold uppercase text-muted-foreground">
            <span>
              Schritt {stepIndex(step) + 1}/{OPERATOR_TIRE_MEASURE_STEPS.length} — {STEP_LABELS[step]}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-[color:var(--brand)] transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </header>

      <div
        className={`min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 ${
          isTablet ? 'mx-auto w-full max-w-xl' : ''
        }`}
      >
        {data.loading && step === 'vehicle' ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {step === 'vehicle' && (
              <div className="space-y-4">
                <div className=" surface-premium p-4 space-y-3">
                  <div>
                    <p className="text-[10px] font-semibold uppercase text-muted-foreground">Kennzeichen</p>
                    <p className="text-2xl font-bold tracking-wide text-foreground">{plate}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold uppercase text-muted-foreground">Fahrzeug</p>
                    <p className="text-sm font-medium text-foreground">
                      {data.vehicle?.model ?? action.vehicleLabel}
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-[10px] font-semibold uppercase text-muted-foreground">Kilometerstand</p>
                      <p className="font-semibold tabular-nums">
                        {data.odometerKm != null ? `${Math.round(data.odometerKm).toLocaleString('de-DE')} km` : '—'}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold uppercase text-muted-foreground">Reifenset</p>
                      <p className="font-semibold">
                        {selectedSetup?.label ??
                          (data.activeSetup
                            ? String((data.activeSetup as Record<string, unknown>).name ?? 'Aktiv')
                            : 'Unbekannt')}
                      </p>
                    </div>
                  </div>
                  {data.tireSummary && (
                    <div className="rounded-xl border border-border/50 bg-muted/30 px-3 py-2 text-xs">
                      <p className="text-muted-foreground">
                        Letzte Messung:{' '}
                        <span className="font-semibold text-foreground">
                          {data.tireSummary.lastMeasurementAt ?? data.tireSummary.latestMeasurementAt ?? '—'}
                        </span>
                      </p>
                    </div>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">
                  Messung wird als Evidence in die kanonische Tire-Health-Pipeline geschrieben — keine separate
                  Berechnung im Operator.
                </p>
              </div>
            )}

            {step === 'set' && (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Welches Reifenset wurde gemessen? Standard ist das aktuell montierte Set.
                </p>
                <div className="space-y-2">
                  {data.setupOptions.map((opt) => {
                    const active = selectedSetupId === opt.id;
                    const seasonLabel = opt.season ? (SEASON_LABELS[opt.season] ?? opt.season) : 'Unbekannt';
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setSelectedSetupId(opt.id)}
                        className={`sq-press w-full rounded-md border px-4 py-3 text-left ${
                          active
                            ? 'border-[color:var(--brand)]/35 bg-[color:var(--brand-soft)]'
                            : 'border-border surface-premium'
                        }`}
                      >
                        <p className="text-sm font-semibold text-foreground">{opt.label}</p>
                        <p className="text-xs text-muted-foreground">{seasonLabel}</p>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {step === 'tread' && (
              <OperatorTireMeasureTreadGrid
                tread={tread}
                onChange={setTread}
                warnings={plausibilityWarnings}
              />
            )}

            {step === 'context' && (
              <div className="space-y-4">
                <label className="block">
                  <span className="text-[10px] font-semibold uppercase text-muted-foreground">Messdatum</span>
                  <input
                    type="datetime-local"
                    className="mt-1 h-12 w-full surface-premium px-3 text-sm"
                    value={context.measuredAt}
                    onChange={(e) => setContext((c) => ({ ...c, measuredAt: e.target.value }))}
                  />
                </label>
                <label className="block">
                  <span className="text-[10px] font-semibold uppercase text-muted-foreground">
                    {t('operator.tireMeasure.fields.odometerAtMeasurement')}
                  </span>
                  <input
                    type="text"
                    inputMode="decimal"
                    className="mt-1 h-12 w-full surface-premium px-3 text-base tabular-nums"
                    value={context.odometerKm}
                    onChange={(e) =>
                      setContext((c) => ({
                        ...c,
                        odometerKm: e.target.value,
                        confirmOdometerKm: false,
                      }))
                    }
                    placeholder={
                      context.source === 'manual' || context.source === 'workshop'
                        ? t('operator.tireMeasure.placeholders.odometerV3Required')
                        : t('operator.tireMeasure.placeholders.optional')
                    }
                  />
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {t('operator.tireMeasure.fields.odometerSource', { source: odometerSourceLabel })}
                  </p>
                </label>
                {context.source === 'manual' && context.odometerKm.trim() && (
                  <label className="flex min-h-[48px] cursor-pointer items-start gap-3 rounded-xl border border-border/60 px-3 py-3">
                    <input
                      type="checkbox"
                      className="mt-1 h-4 w-4"
                      checked={context.confirmOdometerKm}
                      onChange={(e) =>
                        setContext((c) => ({ ...c, confirmOdometerKm: e.target.checked }))
                      }
                    />
                    <span className="text-sm">
                      <span className="font-semibold text-foreground">
                        {t('operator.tireMeasure.context.confirmOdometer.title')}
                      </span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {t('operator.tireMeasure.context.confirmOdometer.hint')}
                      </span>
                    </span>
                  </label>
                )}
                <div>
                  <p className="mb-2 text-[10px] font-semibold uppercase text-muted-foreground">Messmethode</p>
                  <div className="flex flex-wrap gap-2">
                    {SOURCE_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setContext((c) => ({ ...c, source: opt.value }))}
                        className={`sq-press min-h-[44px] rounded-xl border px-3 py-2 text-sm font-semibold ${
                          context.source === opt.value
                            ? 'border-[color:var(--brand)]/35 bg-[color:var(--brand-soft)] text-[color:var(--brand-ink)]'
                            : 'border-border surface-premium'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
                {context.source === 'workshop' && (
                  <label className="block">
                    <span className="text-[10px] font-semibold uppercase text-muted-foreground">Werkstatt</span>
                    <input
                      type="text"
                      className="mt-1 h-12 w-full surface-premium px-3 text-base"
                      value={context.workshopName}
                      onChange={(e) => setContext((c) => ({ ...c, workshopName: e.target.value }))}
                      placeholder="Name der Werkstatt"
                    />
                  </label>
                )}
                <label className="block">
                  <span className="text-[10px] font-semibold uppercase text-muted-foreground">Notiz</span>
                  <textarea
                    className="mt-1 min-h-[80px] w-full surface-premium px-3 py-2 text-sm"
                    value={context.note}
                    onChange={(e) => setContext((c) => ({ ...c, note: e.target.value }))}
                    placeholder="Optional — nur lokal im Review, nicht in Tire-Health-API"
                  />
                </label>
                <button
                  type="button"
                  className="sq-press flex min-h-[48px] w-full items-center gap-3 rounded-xl border border-dashed border-border/70 px-4 text-left"
                  onClick={openAiUpload}
                >
                  <Sparkles className="h-5 w-5 shrink-0 text-[color:var(--brand-ink)]" />
                  <span>
                    <span className="block text-sm font-semibold">Reifenbericht per AI Upload auslesen</span>
                    <span className="text-[11px] text-muted-foreground">
                      Extrahierte Werte erst nach Bestätigung übernehmen
                    </span>
                  </span>
                </button>
              </div>
            )}

            {step === 'review' && (
              <div className="space-y-4">
                <div className=" surface-premium p-4 space-y-2 text-sm">
                  <p>
                    <span className="text-muted-foreground">Fahrzeug:</span>{' '}
                    <span className="font-semibold">{vehicleLabel}</span>
                  </p>
                  <p>
                    <span className="text-muted-foreground">Reifenset:</span>{' '}
                    <span className="font-semibold">{selectedSetup?.label ?? 'Unbekannt'}</span>
                  </p>
                  <div className="grid grid-cols-2 gap-2 pt-2">
                    {(['fl', 'fr', 'rl', 'rr'] as const).map((k) => {
                      const labels = { fl: 'VL', fr: 'VR', rl: 'HL', rr: 'HR' };
                      return (
                        <div key={k} className="rounded-xl border border-border/50 px-3 py-2">
                          <p className="text-[10px] uppercase text-muted-foreground">{labels[k]}</p>
                          <p className="text-lg font-bold tabular-nums">{tread[k] || '—'} mm</p>
                        </div>
                      );
                    })}
                  </div>
                  <p>
                    <span className="text-muted-foreground">Datum:</span>{' '}
                    <span className="font-semibold">{context.measuredAt || 'Jetzt'}</span>
                  </p>
                  <p>
                    <span className="text-muted-foreground">Km:</span>{' '}
                    <span className="font-semibold">{context.odometerKm || '—'}</span>
                    <span className="block text-xs font-normal text-muted-foreground">
                      {odometerSourceLabel}
                    </span>
                  </p>
                  <p>
                    <span className="text-muted-foreground">Methode:</span>{' '}
                    <span className="font-semibold">
                      {SOURCE_OPTIONS.find((s) => s.value === context.source)?.label}
                    </span>
                  </p>
                  {context.note.trim() && (
                    <p>
                      <span className="text-muted-foreground">Notiz:</span> {context.note}
                    </p>
                  )}
                </div>
                {v3EvidenceWarnings.length > 0 && (
                  <div className="space-y-2 rounded-xl border border-[color:var(--status-watch)]/30 bg-[color:var(--status-watch)]/5 px-3 py-2">
                    <p className="text-xs font-semibold uppercase text-muted-foreground">
                      {t('operator.tireMeasure.review.v3EvidenceTitle')}
                    </p>
                    {v3EvidenceWarnings.map((w) => (
                      <p key={w.id} className="text-xs text-[color:var(--status-watch)]">
                        {t(w.message as TranslationKey)}
                      </p>
                    ))}
                  </div>
                )}
                {plausibilityWarnings.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase text-muted-foreground">Hinweise (nur UI)</p>
                    {plausibilityWarnings.map((w) => (
                      <p key={w.id} className="text-xs text-[color:var(--status-watch)]">
                        {w.message}
                      </p>
                    ))}
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  Nach Speichern lädt Tire Health / Rental Health neu — Status und Rest-km kommen ausschließlich vom
                  Backend.
                </p>
                {submitError && (
                  <p className="text-sm text-[color:var(--status-critical)]">{submitError}</p>
                )}
              </div>
            )}

            {stepError && (
              <p className="mt-2 text-sm text-[color:var(--status-critical)]">{formatStepError(stepError)}</p>
            )}
          </>
        )}
      </div>

      <footer className="shrink-0 border-t border-border/50 surface-frosted px-4 py-3">
        <div className={`flex gap-2 ${isTablet ? 'mx-auto max-w-xl' : ''}`}>
          <button
            type="button"
            onClick={goBack}
            disabled={submitting}
            className="sq-press flex min-h-[52px] flex-1 items-center justify-center gap-1 rounded-lg border border-border text-sm font-semibold disabled:opacity-50"
          >
            <ChevronLeft className="h-4 w-4" />
            {stepIndex(step) === 0 ? 'Abbrechen' : 'Zurück'}
          </button>
          {isReview ? (
            <button
              type="button"
              disabled={submitting}
              onClick={() => void handleSave()}
              className="sq-press flex min-h-[52px] flex-[2] items-center justify-center gap-2 rounded-lg bg-[color:var(--brand)] text-sm font-bold text-white disabled:opacity-60"
            >
              {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Messung speichern'}
            </button>
          ) : (
            <button
              type="button"
              onClick={goNext}
              className="sq-press flex min-h-[52px] flex-[2] items-center justify-center gap-1 rounded-lg bg-[color:var(--brand)] text-sm font-bold text-white"
            >
              Weiter
              <ChevronRight className="h-4 w-4" />
            </button>
          )}
        </div>
      </footer>
    </div>
  );
}
