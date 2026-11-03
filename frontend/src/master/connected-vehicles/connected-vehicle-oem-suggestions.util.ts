import {
  OEM_SPECIFICATION_FIELD_KEYS as OEM_KEYS,
  type OemSpecificationFieldKey,
} from './connected-vehicle-oem-specifications.util';
import type {
  OemSuggestionsViewState,
  OneAutoOemSuggestionListDtoWire,
  OemSuggestionSnapshotUi,
} from './connected-vehicle-oem-suggestions.types';

export function parseHttpErrorCode(message: string): string | null {
  const match = message.match(/\[([A-Z0-9_]+)\]/);
  return match?.[1] ?? null;
}

export function classifyOemSuggestionsLoadError(err: unknown): OemSuggestionsViewState['loadError'] {
  const message = err instanceof Error ? err.message : String(err);
  const code = parseHttpErrorCode(message);
  if (code === 'STEP_UP_REQUIRED') return 'MFA_REQUIRED';
  if (message.includes('403') || code === 'FORBIDDEN') return 'ACCESS_DENIED';
  return 'LOAD_FAILED';
}

export function isOemSaveConflictError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return (
    parseHttpErrorCode(message) === 'VEHICLE_OEM_SPEC_SAVE_CONFLICT' ||
    message.includes('VEHICLE_OEM_SPEC_SAVE_CONFLICT')
  );
}

export function mapOemSuggestionListDto(dto: OneAutoOemSuggestionListDtoWire): OemSuggestionsViewState {
  if (!dto.featureEnabled) {
    return { featureEnabled: false, primary: null, loadError: null };
  }
  const first = dto.suggestions[0];
  if (!first) {
    return { featureEnabled: true, primary: null, loadError: null };
  }
  const rows = first.comparison.fields.map((row) => ({
    fieldKey: row.canonicalFieldKey,
    comparisonState: row.comparisonState,
    canonicalValue: row.canonicalValue,
    suggestedValue: row.suggestedValue,
    providerFieldPath: row.providerFieldPath,
    confirmationStatus: row.confirmationStatus,
  }));
  const primary: OemSuggestionSnapshotUi = {
    snapshotId: first.snapshotId,
    providerJobId: first.providerJobId,
    serviceSku: first.serviceSku,
    vinSha256Prefix: first.vinSha256Prefix,
    timestamps: first.timestamps,
    rows,
  };
  return { featureEnabled: true, primary, loadError: null };
}

export function findSuggestionRow(
  snapshot: OemSuggestionSnapshotUi | null,
  fieldKey: OemSpecificationFieldKey,
) {
  return snapshot?.rows.find((r) => r.fieldKey === fieldKey) ?? null;
}

/** Suggestion may be applied only for mapped desc fields with a provider value. */
export function canApplyOemSuggestion(row: {
  comparisonState: string;
  suggestedValue: string | null;
}): boolean {
  if (row.comparisonState === 'NOT_COMPARABLE' || row.comparisonState === 'MATCH') {
    return false;
  }
  if (row.suggestedValue == null || row.suggestedValue.trim() === '') return false;
  return row.comparisonState === 'MISSING' || row.comparisonState === 'CONFLICT';
}

export function requiresUserConfirmedReplaceWarning(
  confirmationStatus: string | null,
  comparisonState: string,
): boolean {
  return (
    (confirmationStatus === 'USER_CONFIRMED' || confirmationStatus === 'PROTECTED') &&
    comparisonState === 'CONFLICT'
  );
}

export function oemSuggestionComparisonLabelKey(
  state: string,
): `master.cv.oemSpecs.suggestions.state.${'match' | 'missing' | 'conflict' | 'notComparable'}` {
  switch (state) {
    case 'MATCH':
      return 'master.cv.oemSpecs.suggestions.state.match';
    case 'MISSING':
      return 'master.cv.oemSpecs.suggestions.state.missing';
    case 'CONFLICT':
      return 'master.cv.oemSpecs.suggestions.state.conflict';
    default:
      return 'master.cv.oemSpecs.suggestions.state.notComparable';
  }
}

export function assertSuggestionDtoFieldKeys(dto: OneAutoOemSuggestionListDtoWire): void {
  for (const item of dto.suggestions) {
    for (const row of item.comparison.fields) {
      if (!OEM_KEYS.includes(row.canonicalFieldKey as OemSpecificationFieldKey)) {
        throw new Error(`Unknown OEM suggestion field ${row.canonicalFieldKey}`);
      }
    }
  }
}
