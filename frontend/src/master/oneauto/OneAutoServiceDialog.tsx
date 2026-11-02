import { useCallback, useEffect, useRef, useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { AppDialog } from '../../components/patterns/app-dialog';
import { Button } from '../../components/ui/button';
import { MfaStepUpDialog } from '../../components/mfa/MfaStepUpDialog';
import { useLanguage } from '../../i18n/LanguageContext';
import { getErrorMessage } from '../../lib/api';
import { oneAutoMasterApi } from './oneauto-api.client';
import type {
  OneAutoCatalogService,
  OneAutoJobDto,
  OneAutoJobResultResponse,
  OneAutoQuoteResponse,
} from './oneauto-api.types';
import {
  ONEAUTO_MAX_POLL_ATTEMPTS,
  ONEAUTO_POLL_INTERVAL_MS,
  clearStoredIdempotencyKey,
  formatMinorAmount,
  isTerminalJobStatus,
  maskVin,
  parseApiErrorCode,
  resolveExecuteIdempotencyKey,
  safeJsonPreview,
  serviceSkuTranslationBase,
} from './oneauto-ui.util';

type DialogPhase = 'catalog' | 'quote' | 'job' | 'result';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  organizationName: string;
  vehicleId: string;
  vehicleLabel: string;
  vin: string | null | undefined;
};

const MFA_ACTION = 'MASTER_ONEAUTO_PROVIDER_EXECUTE';

export function OneAutoServiceDialog({
  open,
  onOpenChange,
  organizationId,
  organizationName,
  vehicleId,
  vehicleLabel,
  vin,
}: Props) {
  const { t } = useLanguage();
  const [phase, setPhase] = useState<DialogPhase>('catalog');
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [services, setServices] = useState<OneAutoCatalogService[]>([]);
  const [selectedSku, setSelectedSku] = useState<string | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quote, setQuote] = useState<OneAutoQuoteResponse | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [ackIndicative, setAckIndicative] = useState(false);
  const [executeLoading, setExecuteLoading] = useState(false);
  const [executeError, setExecuteError] = useState<string | null>(null);
  const [job, setJob] = useState<OneAutoJobDto | null>(null);
  const [result, setResult] = useState<OneAutoJobResultResponse | null>(null);
  const [mfaOpen, setMfaOpen] = useState(false);
  const idempotencyKeyRef = useRef<string | null>(null);
  const pollAttemptRef = useRef(0);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const contextKeyRef = useRef(`${organizationId}:${vehicleId}`);

  const resetFlow = useCallback(() => {
    setPhase('catalog');
    setSelectedSku(null);
    setQuote(null);
    setQuoteError(null);
    setAckIndicative(false);
    setExecuteError(null);
    setJob(null);
    setResult(null);
    idempotencyKeyRef.current = null;
    pollAttemptRef.current = 0;
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  const stopPolling = useCallback(() => {
    pollAttemptRef.current = 0;
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  const loadCatalog = useCallback(async () => {
    setCatalogLoading(true);
    setCatalogError(null);
    try {
      const res = await oneAutoMasterApi.getCatalog(organizationId);
      setServices(res.services ?? []);
    } catch (err) {
      setCatalogError(getErrorMessage(err, t('master.oneAuto.catalogError' as never)));
      setServices([]);
    } finally {
      setCatalogLoading(false);
    }
  }, [organizationId, t]);

  useEffect(() => {
    const ctx = `${organizationId}:${vehicleId}`;
    if (contextKeyRef.current !== ctx) {
      contextKeyRef.current = ctx;
      resetFlow();
    }
  }, [organizationId, vehicleId, resetFlow]);

  useEffect(() => {
    if (!open) {
      stopPolling();
      return;
    }
    void loadCatalog();
  }, [open, loadCatalog, stopPolling]);

  useEffect(() => {
    if (!open) resetFlow();
  }, [open, resetFlow]);

  const translateSku = (sku: string, field: 'name' | 'description'): string => {
    const key = `${serviceSkuTranslationBase(sku)}.${field}` as never;
    const translated = t(key);
    if (translated !== key) return translated;
    const entry = services.find((s) => s.serviceSku === sku);
    if (field === 'name') return entry?.displayName ?? sku;
    return entry?.description ?? '';
  };

  const availabilityLabel = (status: OneAutoCatalogService['availabilityStatus']) => {
    const key = `master.oneAuto.availability.${status}` as never;
    const label = t(key);
    return label === key ? status : label;
  };

  const errorLabel = (code: string | undefined, fallback: string) => {
    if (!code) return fallback;
    const key = `master.oneAuto.error.${code}` as never;
    const label = t(key);
    return label === key ? fallback : label;
  };

  const canSelectForQuote = (entry: OneAutoCatalogService): boolean => {
    if (entry.availabilityStatus === 'DISABLED_FLAG') return false;
    if (entry.availabilityStatus === 'CONTRACT_UNVERIFIED') return false;
    return entry.executable === true && entry.availabilityStatus === 'AVAILABLE';
  };

  const handleSelectService = async (entry: OneAutoCatalogService) => {
    setSelectedSku(entry.serviceSku);
    setQuote(null);
    setQuoteError(null);
    setAckIndicative(false);
    if (!canSelectForQuote(entry)) return;
    setPhase('quote');
    setQuoteLoading(true);
    try {
      const q = await oneAutoMasterApi.quote(organizationId, vehicleId, entry.serviceSku);
      if (q.organizationId !== organizationId || q.vehicleId !== vehicleId) {
        throw new Error(t('master.oneAuto.error.ONEAUTO_BINDING_MISMATCH' as never));
      }
      setQuote(q);
    } catch (err) {
      const msg = getErrorMessage(err);
      setQuoteError(errorLabel(parseApiErrorCode(msg), msg));
      setPhase('catalog');
      setSelectedSku(null);
    } finally {
      setQuoteLoading(false);
    }
  };

  const pollJob = useCallback(
    async (jobId: string) => {
      stopPolling();
      const tick = async () => {
        if (!open) return;
        pollAttemptRef.current += 1;
        if (pollAttemptRef.current > ONEAUTO_MAX_POLL_ATTEMPTS) {
          setExecuteError(t('master.oneAuto.error.ONEAUTO_JOB_POLL_TIMEOUT' as never));
          return;
        }
        try {
          const next = await oneAutoMasterApi.getJob(organizationId, jobId);
          if (next.organizationId !== organizationId || next.vehicleId !== vehicleId) {
            setExecuteError(t('master.oneAuto.error.ONEAUTO_BINDING_MISMATCH' as never));
            stopPolling();
            return;
          }
          setJob(next);
          if (isTerminalJobStatus(next.status)) {
            stopPolling();
            if (next.status === 'SUCCEEDED' && selectedSku) {
              clearStoredIdempotencyKey(organizationId, vehicleId, selectedSku);
            }
            if (next.status === 'SUCCEEDED') {
              try {
                const res = await oneAutoMasterApi.getJobResult(organizationId, jobId);
                setResult(res);
                setPhase('result');
              } catch {
                setPhase('job');
              }
            }
            return;
          }
          pollTimerRef.current = setTimeout(() => {
            void tick();
          }, ONEAUTO_POLL_INTERVAL_MS);
        } catch (err) {
          setExecuteError(getErrorMessage(err));
          stopPolling();
        }
      };
      void tick();
    },
    [open, organizationId, vehicleId, selectedSku, stopPolling, t],
  );

  const runExecute = useCallback(async () => {
    if (!quote || !selectedSku || quote.estimatedPriceMinor == null) return;
    setExecuteLoading(true);
    setExecuteError(null);
    const idempotencyKey = resolveExecuteIdempotencyKey(
      organizationId,
      vehicleId,
      selectedSku,
      idempotencyKeyRef.current,
    );
    idempotencyKeyRef.current = idempotencyKey;

    const resultExecute = await oneAutoMasterApi.execute(
      organizationId,
      vehicleId,
      {
        serviceSku: selectedSku,
        idempotencyKey,
        confirmedPriceMinor: quote.estimatedPriceMinor,
        pricingSourceVersion: quote.pricingSourceVersion,
        quoteIssuedAt: quote.quoteIssuedAt,
        acknowledgeIndicativeNotGuaranteed: true,
      },
      { suppressStepUpDispatch: true },
    );

    if (!resultExecute.ok) {
      if (resultExecute.errorBody?.code === 'STEP_UP_REQUIRED') {
        setMfaOpen(true);
        setExecuteLoading(false);
        return;
      }
      const code = resultExecute.errorBody?.code ?? parseApiErrorCode(resultExecute.errorMessage ?? '');
      setExecuteError(
        errorLabel(code, resultExecute.errorMessage ?? t('master.oneAuto.executeFailed' as never)),
      );
      setExecuteLoading(false);
      return;
    }

    const created = resultExecute.data!;
    if (created.organizationId !== organizationId || created.vehicleId !== vehicleId) {
      setExecuteError(t('master.oneAuto.error.ONEAUTO_BINDING_MISMATCH' as never));
      setExecuteLoading(false);
      return;
    }
    setJob(created);
    setPhase('job');
    setExecuteLoading(false);
    void pollJob(created.id);
  }, [organizationId, vehicleId, quote, selectedSku, pollJob, t]);

  const handleConfirmExecute = () => {
    if (!ackIndicative || executeLoading) return;
    void runExecute();
  };

  const handleMfaSuccess = () => {
    void runExecute();
  };

  const statusLabel = (status: OneAutoJobDto['status']) => {
    const key = `master.oneAuto.status.${status}` as never;
    const label = t(key);
    return label === key ? status : label;
  };

  return (
    <>
      <AppDialog open={open} onOpenChange={onOpenChange} maxWidthClassName="sm:max-w-2xl">
        <div className="flex flex-col max-h-[min(90vh,100dvh)]">
          <div className="border-b border-border px-6 py-4 pr-12">
            <DialogPrimitive.Title className="text-lg font-semibold">
              {t('master.oneAuto.dialogTitle' as never)}
            </DialogPrimitive.Title>
            <DialogPrimitive.Description className="text-sm text-muted-foreground mt-1">
              {t('master.oneAuto.dialogDescription' as never)}
            </DialogPrimitive.Description>
            <p className="text-xs text-muted-foreground mt-2" data-testid="oneauto-context-binding">
              {organizationName} · {vehicleLabel} · {t('master.oneAuto.vinLabel' as never)}{' '}
              {maskVin(vin)}
            </p>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
            {phase === 'catalog' && (
              <>
                {catalogLoading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {t('master.oneAuto.loadingCatalog' as never)}
                  </div>
                ) : null}
                {catalogError ? (
                  <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
                    <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                    <span>{catalogError}</span>
                  </div>
                ) : null}
                {!catalogLoading && !catalogError ? (
                  <ul className="space-y-3" data-testid="oneauto-service-catalog">
                    {services.map((entry) => {
                      const selectable = canSelectForQuote(entry);
                      return (
                        <li
                          key={entry.serviceSku}
                          className="rounded-xl border border-border p-4 space-y-2"
                          data-testid={`oneauto-service-${entry.serviceSku}`}
                          data-executable={selectable ? 'true' : 'false'}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="font-semibold text-sm">
                                {translateSku(entry.serviceSku, 'name')}
                              </p>
                              <p className="text-xs text-muted-foreground mt-1">
                                {translateSku(entry.serviceSku, 'description')}
                              </p>
                            </div>
                            <span className="text-[10px] uppercase tracking-wide font-bold px-2 py-0.5 rounded-full bg-muted text-muted-foreground shrink-0">
                              {availabilityLabel(entry.availabilityStatus)}
                            </span>
                          </div>
                          <div className="text-xs text-muted-foreground flex flex-wrap gap-x-4 gap-y-1">
                            <span>
                              {t('master.oneAuto.priceIndicativeLabel' as never)}:{' '}
                              {entry.indicativePriceMinor != null
                                ? formatMinorAmount(entry.indicativePriceMinor, entry.currency)
                                : t('master.oneAuto.priceNotConfigured' as never)}
                            </span>
                            {entry.availabilityStatus === 'CONTRACT_UNVERIFIED' ? (
                              <span className="text-amber-600 dark:text-amber-400">
                                {t('master.oneAuto.error.CONTRACT_UNVERIFIED' as never)}
                              </span>
                            ) : null}
                            {entry.availabilityStatus === 'DISABLED_FLAG' ? (
                              <span>{t('master.oneAuto.error.ONEAUTO_DISABLED' as never)}</span>
                            ) : null}
                          </div>
                          <Button
                            type="button"
                            size="sm"
                            variant={selectable ? 'default' : 'secondary'}
                            disabled={!selectable || quoteLoading}
                            data-testid={`oneauto-select-${entry.serviceSku}`}
                            onClick={() => void handleSelectService(entry)}
                          >
                            {selectable
                              ? t('master.oneAuto.selectAction' as never)
                              : t('master.oneAuto.unavailableAction' as never)}
                          </Button>
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
              </>
            )}

            {phase === 'quote' && quote ? (
              <div className="space-y-4" data-testid="oneauto-quote-panel">
                <Button type="button" variant="ghost" size="sm" onClick={() => setPhase('catalog')}>
                  {t('master.oneAuto.backToCatalog' as never)}
                </Button>
                <div className="rounded-xl border border-border p-4 space-y-2 text-sm">
                  <p className="font-semibold">{translateSku(quote.serviceSku, 'name')}</p>
                  <p>
                    <span className="text-muted-foreground">
                      {t('master.oneAuto.organizationLabel' as never)}:{' '}
                    </span>
                    {organizationName}
                  </p>
                  <p>
                    <span className="text-muted-foreground">
                      {t('master.oneAuto.vehicleLabel' as never)}:{' '}
                    </span>
                    {vehicleLabel}
                  </p>
                  <p>
                    <span className="text-muted-foreground">
                      {t('master.oneAuto.vinLabel' as never)}:{' '}
                    </span>
                    {maskVin(quote.vinSnapshot)}
                  </p>
                  <p>
                    <span className="text-muted-foreground">
                      {t('master.oneAuto.estimatedCost' as never)}:{' '}
                    </span>
                    {formatMinorAmount(quote.estimatedPriceMinor, quote.currency)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t('master.oneAuto.quoteExpires' as never)}:{' '}
                    {new Date(quote.quoteExpiresAt).toLocaleString()}
                  </p>
                  <p className="text-xs text-amber-700 dark:text-amber-300">
                    {t('master.oneAuto.indicativeDisclaimer' as never)}
                  </p>
                </div>
                <label className="flex items-start gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={ackIndicative}
                    onChange={(e) => setAckIndicative(e.target.checked)}
                    data-testid="oneauto-confirm-checkbox"
                    className="mt-1"
                  />
                  <span>{t('master.oneAuto.confirmCheckbox' as never)}</span>
                </label>
                {quoteError ? <p className="text-sm text-destructive">{quoteError}</p> : null}
                {executeError ? (
                  <p className="text-sm text-destructive" data-testid="oneauto-execute-error">
                    {executeError}
                  </p>
                ) : null}
                <Button
                  type="button"
                  disabled={!ackIndicative || executeLoading}
                  data-testid="oneauto-confirm-execute"
                  onClick={handleConfirmExecute}
                >
                  {executeLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      {t('master.oneAuto.executing' as never)}
                    </>
                  ) : (
                    t('master.oneAuto.confirmExecute' as never)
                  )}
                </Button>
              </div>
            ) : null}

            {phase === 'job' && job ? (
              <div className="space-y-3" data-testid="oneauto-job-status">
                <div className="flex items-center gap-2">
                  {isTerminalJobStatus(job.status) && job.status === 'SUCCEEDED' ? (
                    <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                  ) : (
                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  )}
                  <span className="font-semibold">{statusLabel(job.status)}</span>
                </div>
                <dl className="text-sm space-y-1">
                  <div>
                    <dt className="text-muted-foreground inline">
                      {t('master.oneAuto.jobSubmitted' as never)}:{' '}
                    </dt>
                    <dd className="inline">{new Date(job.createdAt).toLocaleString()}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground inline">
                      {t('master.oneAuto.jobLastUpdate' as never)}:{' '}
                    </dt>
                    <dd className="inline">{new Date(job.updatedAt).toLocaleString()}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground inline">
                      {t('master.oneAuto.jobRequestRef' as never)}:{' '}
                    </dt>
                    <dd className="inline font-mono text-xs">{job.providerRequestId ?? job.id}</dd>
                  </div>
                  {job.lastErrorCode ? (
                    <div>
                      <dt className="text-muted-foreground inline">
                        {t('master.oneAuto.safeError' as never)}:{' '}
                      </dt>
                      <dd className="inline">{errorLabel(job.lastErrorCode, job.lastErrorCode)}</dd>
                    </div>
                  ) : null}
                  <div>
                    <dt className="text-muted-foreground inline">
                      {t('master.oneAuto.billingStatus' as never)}:{' '}
                    </dt>
                    <dd className="inline">
                      {job.actualChargeKnown
                        ? t('master.oneAuto.billingKnown' as never)
                        : t('master.oneAuto.billingUnknown' as never)}
                    </dd>
                  </div>
                </dl>
                {executeError ? (
                  <p className="text-sm text-destructive" data-testid="oneauto-execute-error">
                    {executeError}
                  </p>
                ) : null}
              </div>
            ) : null}

            {phase === 'result' && result?.job ? (
              <div className="space-y-3" data-testid="oneauto-result-viewer">
                <p className="text-sm font-semibold">{t('master.oneAuto.resultTitle' as never)}</p>
                <p className="text-xs text-muted-foreground">
                  {t('master.oneAuto.resultReadOnlyNotice' as never)}
                </p>
                <dl className="text-sm space-y-1">
                  <div>
                    <dt className="text-muted-foreground inline">
                      {t('master.oneAuto.resultProvenance' as never)}:{' '}
                    </dt>
                    <dd className="inline">{t('master.oneAuto.resultProvenanceValue' as never)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground inline">
                      {t('master.oneAuto.resultSku' as never)}:{' '}
                    </dt>
                    <dd className="inline">{result.job.serviceSku}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground inline">
                      {t('master.oneAuto.resultRetrieved' as never)}:{' '}
                    </dt>
                    <dd className="inline">
                      {result.latestResponse?.fetchedAt
                        ? new Date(result.latestResponse.fetchedAt).toLocaleString()
                        : '—'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground inline">
                      {t('master.oneAuto.resultVehicleBinding' as never)}:{' '}
                    </dt>
                    <dd className="inline">{maskVin(result.job.vinSnapshot)}</dd>
                  </div>
                </dl>
                <pre
                  className="text-xs rounded-lg border border-border bg-muted/40 p-3 overflow-auto max-h-64 font-mono"
                  data-testid="oneauto-result-body"
                >
                  {result.latestResponse?.responseBodyJson != null
                    ? safeJsonPreview(result.latestResponse.responseBodyJson)
                    : t('master.oneAuto.resultFallback' as never)}
                </pre>
              </div>
            ) : null}
          </div>

          <div className="border-t border-border px-6 py-3 flex justify-end">
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              {t('master.oneAuto.close' as never)}
            </Button>
          </div>
        </div>
      </AppDialog>

      <MfaStepUpDialog
        open={mfaOpen}
        action={MFA_ACTION}
        onClose={() => setMfaOpen(false)}
        onSuccess={handleMfaSuccess}
      />
    </>
  );
}
