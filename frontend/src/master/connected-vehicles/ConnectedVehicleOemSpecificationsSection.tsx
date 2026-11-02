import { Loader2 } from 'lucide-react';
import { useState } from 'react';
import { StatusChip } from '../../components/patterns';
import { Button } from '../../components/ui/button';
import { Checkbox } from '../../components/ui/checkbox';
import { Input } from '../../components/ui/input';
import { useLanguage } from '../../i18n/LanguageContext';
import {
  OEM_SPEC_FIELD_GROUPS,
  oemConfirmationStatusLabelKey,
  oemFieldLabelKey,
  type ConnectedVehicleOemSpecificationsView,
  type OemSpecificationFieldKey,
} from './connected-vehicle-oem-specifications.util';
import {
  provenanceLabelKey,
  type SpecProvenanceUi,
} from './connected-vehicle-technical-specs.util';

type ConnectedVehicleOemSpecificationsSectionProps = {
  view: ConnectedVehicleOemSpecificationsView | null;
  loading: boolean;
  error: string | null;
  canEdit: boolean;
  savingFieldKey: OemSpecificationFieldKey | null;
  onSaveField: (
    key: OemSpecificationFieldKey,
    value: string | null,
    userConfirmed: boolean,
  ) => Promise<boolean>;
  onRetry?: () => void;
};

export function ConnectedVehicleOemSpecificationsSection({
  view,
  loading,
  error,
  canEdit,
  savingFieldKey,
  onSaveField,
  onRetry,
}: ConnectedVehicleOemSpecificationsSectionProps) {
  const { t } = useLanguage();

  return (
    <section className="space-y-3" data-testid="cv-oem-specifications-section">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t('master.cv.oemSpecs.sectionTitle')}
        </h3>
      </div>
      <p className="text-xs text-muted-foreground">{t('master.cv.oemSpecs.hint')}</p>

      {loading ? (
        <p className="text-sm text-muted-foreground flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          {t('master.cv.oemSpecs.loading')}
        </p>
      ) : error ? (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground" role="alert">
            {t('master.cv.oemSpecs.loadError')}
          </p>
          {onRetry ? (
            <Button type="button" variant="outline" size="sm" onClick={onRetry}>
              {t('master.cv.oemSpecs.retry')}
            </Button>
          ) : null}
        </div>
      ) : view ? (
        <div className="space-y-6">
          {OEM_SPEC_FIELD_GROUPS.map((group) => (
            <div key={group.titleKey} className="space-y-2" data-testid="cv-oem-spec-group">
              <h4 className="text-xs font-semibold text-foreground">{t(group.titleKey)}</h4>
              <dl className="grid grid-cols-1 gap-3 text-sm">
                {group.fields.map((fieldKey) => (
                  <OemFieldRow
                    key={fieldKey}
                    fieldKey={fieldKey}
                    view={view}
                    canEdit={canEdit}
                    saving={savingFieldKey === fieldKey}
                    onSave={onSaveField}
                  />
                ))}
              </dl>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function OemFieldRow({
  fieldKey,
  view,
  canEdit,
  saving,
  onSave,
}: {
  fieldKey: OemSpecificationFieldKey;
  view: ConnectedVehicleOemSpecificationsView;
  canEdit: boolean;
  saving: boolean;
  onSave: (
    key: OemSpecificationFieldKey,
    value: string | null,
    userConfirmed: boolean,
  ) => Promise<boolean>;
}) {
  const { t } = useLanguage();
  const stored = view.fields[fieldKey];
  const provenance = view.fieldProvenance[fieldKey];
  const confirmation = view.confirmationStatus[fieldKey] ?? null;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [confirmChecked, setConfirmChecked] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const displayValue = stored ?? '—';
  const provKey = provenance ? provenanceLabelKey(provenance) : null;
  const confirmKey = oemConfirmationStatusLabelKey(confirmation);

  const startEdit = () => {
    setDraft(stored ?? '');
    setConfirmChecked(false);
    setLocalError(null);
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditing(false);
    setConfirmChecked(false);
    setLocalError(null);
  };

  const submit = async () => {
    if (!confirmChecked) {
      setLocalError(t('master.cv.oemSpecs.confirmationRequired'));
      return;
    }
    const next = draft.trim() === '' ? null : draft.trim();
    const ok = await onSave(fieldKey, next, true);
    if (ok) {
      setEditing(false);
      setConfirmChecked(false);
      setLocalError(null);
    }
  };

  return (
    <div
      className="rounded-xl border border-border p-3 space-y-2"
      data-testid={`cv-oem-field-${fieldKey}`}
    >
      <dt className="text-xs text-muted-foreground flex flex-wrap items-center gap-2">
        <span>{t(oemFieldLabelKey(fieldKey))}</span>
        {provKey ? (
          <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground/80">
            {t(provKey)}
          </span>
        ) : null}
        {confirmKey ? (
          <StatusChip tone={confirmation === 'USER_CONFIRMED' ? 'success' : 'neutral'} dot>
            {t(confirmKey)}
          </StatusChip>
        ) : null}
      </dt>
      {!editing ? (
        <>
          <dd className="font-medium break-words">{displayValue}</dd>
          {canEdit ? (
            <Button type="button" variant="outline" size="sm" onClick={startEdit}>
              {t('master.cv.oemSpecs.editField')}
            </Button>
          ) : null}
        </>
      ) : (
        <div className="space-y-2">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            aria-label={t(oemFieldLabelKey(fieldKey))}
            data-testid={`cv-oem-field-input-${fieldKey}`}
          />
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <Checkbox
              checked={confirmChecked}
              onCheckedChange={(v) => setConfirmChecked(v === true)}
              data-testid={`cv-oem-field-confirm-${fieldKey}`}
            />
            {t('master.cv.oemSpecs.confirmCheckbox')}
          </label>
          {localError ? (
            <p className="text-xs text-[color:var(--status-critical)]" role="alert">
              {localError}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" disabled={saving} onClick={() => void submit()}>
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" aria-hidden />
              ) : null}
              {t('master.cv.oemSpecs.saveField')}
            </Button>
            <Button type="button" variant="ghost" size="sm" disabled={saving} onClick={cancelEdit}>
              {t('master.cv.oemSpecs.cancelEdit')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export type { SpecProvenanceUi };
