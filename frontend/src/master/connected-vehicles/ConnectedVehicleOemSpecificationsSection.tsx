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
import type {
  OemSuggestionsViewState,
  OemSuggestionSnapshotUi,
} from './connected-vehicle-oem-suggestions.types';
import {
  canApplyOemSuggestion,
  findSuggestionRow,
  oemSuggestionComparisonLabelKey,
  requiresUserConfirmedReplaceWarning,
} from './connected-vehicle-oem-suggestions.util';
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
  suggestionsLoading?: boolean;
  suggestions?: OemSuggestionsViewState;
  suggestionsSaveConflict?: boolean;
  applyingFieldKey?: OemSpecificationFieldKey | null;
  onApplySuggestedField?: (key: OemSpecificationFieldKey) => Promise<boolean>;
  onRetrySuggestions?: () => void;
  onDismissSaveConflict?: () => void;
};

function formatIso(iso: string, locale: string): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return iso;
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(ms));
}

export function ConnectedVehicleOemSpecificationsSection({
  view,
  loading,
  error,
  canEdit,
  savingFieldKey,
  onSaveField,
  onRetry,
  suggestionsLoading = false,
  suggestions = { featureEnabled: false, primary: null, loadError: null },
  suggestionsSaveConflict = false,
  applyingFieldKey = null,
  onApplySuggestedField,
  onRetrySuggestions,
  onDismissSaveConflict,
}: ConnectedVehicleOemSpecificationsSectionProps) {
  const { t, formattingLocale } = useLanguage();

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
                    suggestionRow={findSuggestionRow(suggestions.primary, fieldKey)}
                  />
                ))}
              </dl>
            </div>
          ))}
        </div>
      ) : null}

      <OemSuggestionsPanel
        loading={suggestionsLoading}
        suggestions={suggestions}
        saveConflict={suggestionsSaveConflict}
        canEdit={canEdit}
        applyingFieldKey={applyingFieldKey}
        onApply={onApplySuggestedField}
        onRetry={onRetrySuggestions}
        onDismissConflict={onDismissSaveConflict}
        locale={formattingLocale}
      />
    </section>
  );
}

function OemSuggestionsPanel({
  loading,
  suggestions,
  saveConflict,
  canEdit,
  applyingFieldKey,
  onApply,
  onRetry,
  onDismissConflict,
  locale,
}: {
  loading: boolean;
  suggestions: OemSuggestionsViewState;
  saveConflict: boolean;
  canEdit: boolean;
  applyingFieldKey: OemSpecificationFieldKey | null;
  onApply?: (key: OemSpecificationFieldKey) => Promise<boolean>;
  onRetry?: () => void;
  onDismissConflict?: () => void;
  locale: string;
}) {
  const { t } = useLanguage();

  return (
    <div
      className="rounded-xl border border-dashed border-border p-4 space-y-3"
      data-testid="cv-oem-suggestions-panel"
    >
      <div>
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t('master.cv.oemSpecs.suggestions.title')}
        </h4>
        <p className="text-xs text-muted-foreground mt-1">{t('master.cv.oemSpecs.suggestions.hint')}</p>
      </div>

      {saveConflict ? (
        <div
          className="rounded-lg border border-[color:var(--status-warning)]/40 bg-muted/30 p-3 text-sm space-y-2"
          role="alert"
          data-testid="cv-oem-suggestions-save-conflict"
        >
          <p>{t('master.cv.oemSpecs.suggestions.saveConflict')}</p>
          {onDismissConflict ? (
            <Button type="button" variant="outline" size="sm" onClick={onDismissConflict}>
              {t('master.cv.oemSpecs.suggestions.dismissConflict')}
            </Button>
          ) : null}
        </div>
      ) : null}

      {loading ? (
        <p className="text-sm text-muted-foreground flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          {t('master.cv.oemSpecs.suggestions.loading')}
        </p>
      ) : suggestions.loadError === 'MFA_REQUIRED' ? (
        <p className="text-sm text-muted-foreground" role="alert">
          {t('master.cv.oemSpecs.suggestions.mfaRequired')}
        </p>
      ) : suggestions.loadError === 'ACCESS_DENIED' ? (
        <p className="text-sm text-muted-foreground" role="alert">
          {t('master.cv.oemSpecs.suggestions.accessDenied')}
        </p>
      ) : suggestions.loadError === 'LOAD_FAILED' ? (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground" role="alert">
            {t('master.cv.oemSpecs.suggestions.loadError')}
          </p>
          {onRetry ? (
            <Button type="button" variant="outline" size="sm" onClick={onRetry}>
              {t('master.cv.oemSpecs.retry')}
            </Button>
          ) : null}
        </div>
      ) : !suggestions.featureEnabled ? (
        <p className="text-sm text-muted-foreground" data-testid="cv-oem-suggestions-disabled">
          {t('master.cv.oemSpecs.suggestions.featureDisabled')}
        </p>
      ) : !suggestions.primary ? (
        <p className="text-sm text-muted-foreground" data-testid="cv-oem-suggestions-empty">
          {t('master.cv.oemSpecs.suggestions.empty')}
        </p>
      ) : (
        <OemSuggestionSnapshotBlock
          snapshot={suggestions.primary}
          canEdit={canEdit}
          applyingFieldKey={applyingFieldKey}
          onApply={onApply}
          locale={locale}
        />
      )}
    </div>
  );
}

function OemSuggestionSnapshotBlock({
  snapshot,
  canEdit,
  applyingFieldKey,
  onApply,
  locale,
}: {
  snapshot: OemSuggestionSnapshotUi;
  canEdit: boolean;
  applyingFieldKey: OemSpecificationFieldKey | null;
  onApply?: (key: OemSpecificationFieldKey) => Promise<boolean>;
  locale: string;
}) {
  const { t } = useLanguage();
  const ts = snapshot.timestamps;

  return (
    <div className="space-y-3" data-testid="cv-oem-suggestion-snapshot">
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-muted-foreground">
        <div>
          <dt>{t('master.cv.oemSpecs.suggestions.vinPrefix')}</dt>
          <dd className="font-mono text-foreground">{snapshot.vinSha256Prefix}</dd>
        </div>
        {ts.providerDataUpdatedAt ? (
          <div>
            <dt>{t('master.cv.oemSpecs.suggestions.providerUpdatedAt')}</dt>
            <dd className="text-foreground">{ts.providerDataUpdatedAt}</dd>
          </div>
        ) : null}
        <div>
          <dt>{t('master.cv.oemSpecs.suggestions.fetchedAt')}</dt>
          <dd className="text-foreground">{formatIso(ts.fetchedAt, locale)}</dd>
        </div>
        <div>
          <dt>{t('master.cv.oemSpecs.suggestions.snapshotAt')}</dt>
          <dd className="text-foreground">{formatIso(ts.snapshotCreatedAt, locale)}</dd>
        </div>
      </dl>

      <div className="space-y-2">
        {snapshot.rows.map((row) => (
          <OemSuggestionCompareRow
            key={row.fieldKey}
            row={row}
            canEdit={canEdit}
            applying={applyingFieldKey === row.fieldKey}
            onApply={onApply}
          />
        ))}
      </div>
    </div>
  );
}

function OemSuggestionCompareRow({
  row,
  canEdit,
  applying,
  onApply,
}: {
  row: OemSuggestionSnapshotUi['rows'][number];
  canEdit: boolean;
  applying: boolean;
  onApply?: (key: OemSpecificationFieldKey) => Promise<boolean>;
}) {
  const { t } = useLanguage();
  const [confirmChecked, setConfirmChecked] = useState(false);
  const stateKey = oemSuggestionComparisonLabelKey(row.comparisonState);
  const tone =
    row.comparisonState === 'CONFLICT'
      ? 'warning'
      : row.comparisonState === 'MATCH'
        ? 'success'
        : row.comparisonState === 'MISSING'
          ? 'info'
          : 'neutral';

  const applyEligible = canApplyOemSuggestion(row);
  const showReplaceWarning = requiresUserConfirmedReplaceWarning(
    row.confirmationStatus,
    row.comparisonState,
  );

  return (
    <div
      className="rounded-lg border border-border p-3 space-y-2 text-sm"
      data-testid={`cv-oem-suggestion-row-${row.fieldKey}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium">{t(oemFieldLabelKey(row.fieldKey))}</span>
        <StatusChip tone={tone} dot>
          {t(stateKey)}
        </StatusChip>
        {row.confirmationStatus === 'USER_CONFIRMED' || row.confirmationStatus === 'PROTECTED' ? (
          <StatusChip tone="success" dot>
            {t('master.cv.oemSpecs.confirmation.userConfirmed')}
          </StatusChip>
        ) : null}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div>
          <p className="text-[10px] uppercase text-muted-foreground">
            {t('master.cv.oemSpecs.suggestions.canonicalColumn')}
          </p>
          <p className="font-medium break-words">{row.canonicalValue ?? '—'}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase text-muted-foreground">
            {t('master.cv.oemSpecs.suggestions.suggestedColumn')}
          </p>
          <p className="font-medium break-words">{row.suggestedValue ?? '—'}</p>
        </div>
      </div>
      {row.comparisonState === 'NOT_COMPARABLE' ? (
        <p className="text-xs text-muted-foreground">{t('master.cv.oemSpecs.suggestions.notApplicable')}</p>
      ) : null}
      {row.comparisonState === 'MATCH' ? (
        <p className="text-xs text-muted-foreground">{t('master.cv.oemSpecs.suggestions.alreadyMatches')}</p>
      ) : null}
      {applyEligible && canEdit && onApply ? (
        <div className="space-y-2 border-t border-border pt-2">
          {showReplaceWarning ? (
            <p className="text-xs text-[color:var(--status-warning)]" role="status">
              {t('master.cv.oemSpecs.suggestions.userConfirmedWarning')}
            </p>
          ) : null}
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <Checkbox
              checked={confirmChecked}
              onCheckedChange={(v) => setConfirmChecked(v === true)}
              data-testid={`cv-oem-suggestion-confirm-${row.fieldKey}`}
            />
            {t('master.cv.oemSpecs.suggestions.confirmApplyCheckbox')}
          </label>
          <Button
            type="button"
            size="sm"
            disabled={!confirmChecked || applying}
            onClick={() => void onApply(row.fieldKey)}
            data-testid={`cv-oem-suggestion-apply-${row.fieldKey}`}
          >
            {applying ? <Loader2 className="h-4 w-4 animate-spin mr-2" aria-hidden /> : null}
            {t('master.cv.oemSpecs.suggestions.applySuggestion')}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function OemFieldRow({
  fieldKey,
  view,
  canEdit,
  saving,
  onSave,
  suggestionRow,
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
  suggestionRow: ReturnType<typeof findSuggestionRow>;
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
        {suggestionRow && suggestionRow.comparisonState !== 'NOT_COMPARABLE' ? (
          <StatusChip tone="info" dot>
            {t(oemSuggestionComparisonLabelKey(suggestionRow.comparisonState))}
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
