import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  api,
  getErrorMessage,
  type CreateVehicleServiceEventInput,
  type ServiceEventServiceKind,
  type ServiceEventType,
} from '../../../lib/api';
import { Button } from '../../../components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../../components/ui/dialog';
import { useLanguage } from '../../../i18n/LanguageContext';
import type { TranslationKey } from '../../../i18n/LanguageContext';
import { formatServiceEventType } from '../../lib/service-info-display';
import {
  buildPartialIntervalPatch,
  formValuesFromSnapshot,
  snapshotFromVehicle,
  type IntervalFormField,
  type IntervalFormValues,
  type VehicleIntervalSnapshot,
} from './service-intervals-dialog.util';

export const SERVICE_EVENT_DUPLICATE_MARKER = 'SERVICE_EVENT_DUPLICATE';

const MANUAL_EVENT_TYPES: ServiceEventType[] = [
  'FULL_SERVICE',
  'GENERAL_INSPECTION',
  'OIL_CHANGE',
  'REPAIR',
  'BRAKE_SERVICE',
  'TIRE_ROTATION',
  'BATTERY_REPLACEMENT',
  'TUV_INSPECTION',
  'BOKRAFT_INSPECTION',
  'OTHER',
];

const INSPECTION_TYPES: ReadonlySet<ServiceEventType> = new Set(['FULL_SERVICE', 'GENERAL_INSPECTION']);

const fieldClass =
  'mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/40';
const labelClass = 'text-[11px] font-semibold text-foreground';

export interface ManualServiceEntryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vehicleId: string;
  onCreated?: () => void | Promise<void>;
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export function isServiceEventDuplicateError(err: unknown): boolean {
  return getErrorMessage(err, '').includes(SERVICE_EVENT_DUPLICATE_MARKER);
}

export function parsePerformedWork(raw: string): string[] {
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .slice(0, 40)
    .map((line) => line.slice(0, 300));
}

export function ManualServiceEntryDialog({ open, onOpenChange, vehicleId, onCreated }: ManualServiceEntryDialogProps) {
  const { t } = useLanguage();
  const [eventType, setEventType] = useState<ServiceEventType>('GENERAL_INSPECTION');
  const [eventDate, setEventDate] = useState<string>(todayIsoDate);
  const [odometerKm, setOdometerKm] = useState('');
  const [workshopName, setWorkshopName] = useState('');
  const [serviceKind, setServiceKind] = useState<ServiceEventServiceKind | ''>('');
  const [performedWorkRaw, setPerformedWorkRaw] = useState('');
  const [notes, setNotes] = useState('');
  const [costEur, setCostEur] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [duplicatePending, setDuplicatePending] = useState(false);

  const reset = () => {
    setEventType('GENERAL_INSPECTION');
    setEventDate(todayIsoDate());
    setOdometerKm('');
    setWorkshopName('');
    setServiceKind('');
    setPerformedWorkRaw('');
    setNotes('');
    setCostEur('');
    setFormError(null);
    setDuplicatePending(false);
  };

  const close = () => {
    reset();
    onOpenChange(false);
  };

  const buildPayload = (allowDuplicate: boolean): CreateVehicleServiceEventInput | null => {
    const parsedDate = new Date(`${eventDate}T00:00:00.000Z`);
    if (!eventDate || Number.isNaN(parsedDate.getTime())) {
      setFormError(t('health.serviceInfo.v2.manual.validation.date'));
      return null;
    }
    const payload: CreateVehicleServiceEventInput = {
      eventType,
      eventDate: parsedDate.toISOString(),
      origin: 'MANUAL',
    };
    const km = odometerKm.trim() ? Number(odometerKm.replace(/[^\d]/g, '')) : null;
    if (km != null && Number.isFinite(km) && km >= 0) payload.odometerKm = Math.round(km);
    if (workshopName.trim()) payload.workshopName = workshopName.trim();
    if (notes.trim()) payload.notes = notes.trim();
    const cost = costEur.trim() ? Number(costEur.replace(',', '.')) : null;
    if (cost != null && Number.isFinite(cost) && cost >= 0) payload.costCents = Math.round(cost * 100);
    const work = parsePerformedWork(performedWorkRaw);
    if (work.length > 0) payload.performedWork = work;
    if (INSPECTION_TYPES.has(eventType) && serviceKind) payload.serviceKind = serviceKind;
    if (allowDuplicate) payload.allowDuplicate = true;
    return payload;
  };

  const submit = async (allowDuplicate: boolean) => {
    setFormError(null);
    const payload = buildPayload(allowDuplicate);
    if (!payload) return;
    setSubmitting(true);
    try {
      await api.vehicleIntelligence.createServiceEvent(vehicleId, payload);
      toast.success(t('health.serviceInfo.v2.manual.success'));
      await onCreated?.();
      close();
    } catch (err) {
      if (!allowDuplicate && isServiceEventDuplicateError(err)) {
        setDuplicatePending(true);
      } else {
        setFormError(getErrorMessage(err, t('health.serviceInfo.v2.manual.error')));
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) close();
        else onOpenChange(true);
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('health.serviceInfo.v2.manual.title')}</DialogTitle>
          <DialogDescription>{t('health.serviceInfo.v2.manual.description')}</DialogDescription>
        </DialogHeader>

        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void submit(false);
          }}
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block">
              <span className={labelClass}>{t('health.serviceInfo.v2.manual.field.eventType')}</span>
              <select
                className={fieldClass}
                value={eventType}
                onChange={(e) => {
                  const next = e.target.value as ServiceEventType;
                  setEventType(next);
                  if (!INSPECTION_TYPES.has(next)) setServiceKind('');
                }}
              >
                {MANUAL_EVENT_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {formatServiceEventType(type, t)}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className={labelClass}>{t('health.serviceInfo.v2.manual.field.eventDate')}</span>
              <input
                type="date"
                className={fieldClass}
                value={eventDate}
                max={todayIsoDate()}
                onChange={(e) => setEventDate(e.target.value)}
                required
              />
            </label>
            <label className="block">
              <span className={labelClass}>{t('health.serviceInfo.v2.manual.field.odometerKm')}</span>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
                className={fieldClass}
                value={odometerKm}
                onChange={(e) => setOdometerKm(e.target.value)}
              />
            </label>
            <label className="block">
              <span className={labelClass}>{t('health.serviceInfo.v2.manual.field.workshop')}</span>
              <input
                type="text"
                className={fieldClass}
                value={workshopName}
                maxLength={200}
                onChange={(e) => setWorkshopName(e.target.value)}
              />
            </label>
            {INSPECTION_TYPES.has(eventType) && (
              <label className="block">
                <span className={labelClass}>{t('health.serviceInfo.v2.manual.field.serviceKind')}</span>
                <select
                  className={fieldClass}
                  value={serviceKind}
                  onChange={(e) => setServiceKind(e.target.value as ServiceEventServiceKind | '')}
                >
                  <option value="">{t('health.serviceInfo.v2.manual.field.serviceKind.none')}</option>
                  <option value="INSPECTION_SMALL">{t('health.serviceInfo.v2.kind.INSPECTION_SMALL')}</option>
                  <option value="INSPECTION_LARGE">{t('health.serviceInfo.v2.kind.INSPECTION_LARGE')}</option>
                </select>
              </label>
            )}
            <label className="block">
              <span className={labelClass}>{t('health.serviceInfo.v2.manual.field.costEur')}</span>
              <input
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                className={fieldClass}
                value={costEur}
                onChange={(e) => setCostEur(e.target.value)}
              />
            </label>
          </div>

          <label className="block">
            <span className={labelClass}>{t('health.serviceInfo.v2.manual.field.performedWork')}</span>
            <textarea
              className={`${fieldClass} min-h-[84px]`}
              value={performedWorkRaw}
              placeholder={t('health.serviceInfo.v2.manual.field.performedWork.hint')}
              onChange={(e) => setPerformedWorkRaw(e.target.value)}
            />
          </label>

          <label className="block">
            <span className={labelClass}>{t('health.serviceInfo.v2.manual.field.notes')}</span>
            <textarea
              className={`${fieldClass} min-h-[56px]`}
              value={notes}
              maxLength={2000}
              onChange={(e) => setNotes(e.target.value)}
            />
          </label>

          {formError && (
            <p role="alert" className="text-xs font-medium text-red-600 dark:text-red-400">
              {formError}
            </p>
          )}

          {duplicatePending && (
            <div
              role="alert"
              className="rounded-lg border border-amber-300/60 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200"
            >
              <p className="font-semibold">{t('health.serviceInfo.v2.manual.duplicate.title')}</p>
              <p className="mt-0.5">{t('health.serviceInfo.v2.manual.duplicate.description')}</p>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-2">
            <Button type="button" variant="outline" size="sm" onClick={close} disabled={submitting}>
              {t('health.serviceInfo.v2.manual.cancel')}
            </Button>
            {duplicatePending ? (
              <Button type="button" size="sm" variant="secondary" disabled={submitting} onClick={() => void submit(true)}>
                {submitting && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                {t('health.serviceInfo.v2.manual.duplicate.confirm')}
              </Button>
            ) : (
              <Button type="submit" size="sm" disabled={submitting}>
                {submitting && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                {t('health.serviceInfo.v2.manual.submit')}
              </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export interface ServiceIntervalsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgId: string;
  vehicleId: string;
  onSaved?: () => void | Promise<void>;
}

const INTERVAL_FIELDS: Array<{
  key: IntervalFormField;
  labelKey: TranslationKey;
}> = [
  { key: 'serviceIntervalKm', labelKey: 'health.serviceInfo.v2.intervals.field.serviceKm' },
  { key: 'serviceIntervalMonths', labelKey: 'health.serviceInfo.v2.intervals.field.serviceMonths' },
  { key: 'oilChangeIntervalKm', labelKey: 'health.serviceInfo.v2.intervals.field.oilKm' },
  { key: 'oilChangeIntervalMonths', labelKey: 'health.serviceInfo.v2.intervals.field.oilMonths' },
];

export function ServiceIntervalsDialog({ open, onOpenChange, orgId, vehicleId, onSaved }: ServiceIntervalsDialogProps) {
  const { t } = useLanguage();
  const loadedRef = useRef<VehicleIntervalSnapshot | null>(null);
  const [values, setValues] = useState<IntervalFormValues>({
    serviceIntervalKm: '',
    serviceIntervalMonths: '',
    oilChangeIntervalKm: '',
    oilChangeIntervalMonths: '',
  });
  const [dirty, setDirty] = useState<Set<IntervalFormField>>(() => new Set());
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadingVehicle, setLoadingVehicle] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !orgId || !vehicleId) return;
    let cancelled = false;
    setLoadingVehicle(true);
    setLoadError(null);
    setDirty(new Set());
    api.vehicles
      .getByOrg(orgId, vehicleId)
      .then((vehicle) => {
        if (cancelled) return;
        const snapshot = snapshotFromVehicle(vehicle as Record<string, unknown>);
        loadedRef.current = snapshot;
        const form = formValuesFromSnapshot(snapshot);
        setValues(form);
      })
      .catch(() => {
        if (!cancelled) setLoadError(t('health.serviceInfo.v2.intervals.error'));
      })
      .finally(() => {
        if (!cancelled) setLoadingVehicle(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, orgId, vehicleId, t]);

  const markDirty = (key: IntervalFormField) => {
    setDirty((prev) => new Set(prev).add(key));
  };

  const submit = async () => {
    setFormError(null);
    const loaded = loadedRef.current;
    if (!loaded) {
      setFormError(t('health.serviceInfo.v2.intervals.error'));
      return;
    }
    if (dirty.size === 0) {
      onOpenChange(false);
      return;
    }
    const payload = buildPartialIntervalPatch(loaded, values, dirty);
    if (Object.keys(payload).length === 0) {
      setFormError(t('health.serviceInfo.v2.intervals.error'));
      return;
    }
    setSubmitting(true);
    try {
      await api.vehicles.update(orgId, vehicleId, payload);
      toast.success(t('health.serviceInfo.v2.intervals.success'));
      await onSaved?.();
      onOpenChange(false);
    } catch (err) {
      setFormError(getErrorMessage(err, t('health.serviceInfo.v2.intervals.error')));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('health.serviceInfo.v2.intervals.title')}</DialogTitle>
          <DialogDescription>{t('health.serviceInfo.v2.intervals.description')}</DialogDescription>
        </DialogHeader>
        {loadError ? (
          <p role="alert" className="text-xs font-medium text-red-600 dark:text-red-400">
            {loadError}
          </p>
        ) : null}
        {loadingVehicle ? (
          <p className="text-xs text-muted-foreground">{t('health.serviceInfo.v2.loading')}</p>
        ) : null}
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {INTERVAL_FIELDS.map((f) => (
              <label key={f.key} className="block">
                <span className={labelClass}>{t(f.labelKey)}</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  step={1}
                  className={fieldClass}
                  disabled={loadingVehicle || Boolean(loadError)}
                  value={values[f.key] ?? ''}
                  onChange={(e) => {
                    markDirty(f.key);
                    setValues((prev) => ({ ...prev, [f.key]: e.target.value }));
                  }}
                />
              </label>
            ))}
          </div>
          {formError && (
            <p role="alert" className="text-xs font-medium text-red-600 dark:text-red-400">
              {formError}
            </p>
          )}
          <DialogFooter className="gap-2 sm:gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={submitting}>
              {t('health.serviceInfo.v2.manual.cancel')}
            </Button>
            <Button type="submit" size="sm" disabled={submitting || loadingVehicle || Boolean(loadError)}>
              {submitting && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              {t('health.serviceInfo.v2.intervals.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
