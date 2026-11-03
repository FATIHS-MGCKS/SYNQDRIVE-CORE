import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api';
import {
  buildOemSpecificationsView,
  type ConnectedVehicleOemSpecificationsView,
  type OemSpecificationFieldKey,
} from './connected-vehicle-oem-specifications.util';
import { saveMasterVehicleOemSpecificationField } from './master-vehicle-oem-specification';
import type {
  OemSuggestionsLoadError,
  OemSuggestionsViewState,
  OneAutoOemSuggestionListDtoWire,
} from './connected-vehicle-oem-suggestions.types';
import {
  canApplyOemSuggestion,
  classifyOemSuggestionsLoadError,
  findSuggestionRow,
  isOemSaveConflictError,
  mapOemSuggestionListDto,
} from './connected-vehicle-oem-suggestions.util';

export function useConnectedVehicleOemSpecifications(
  vehicleId: string | null,
  organizationId: string | null,
  enabled: boolean,
) {
  const [view, setView] = useState<ConnectedVehicleOemSpecificationsView | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savingFieldKey, setSavingFieldKey] = useState<OemSpecificationFieldKey | null>(null);

  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<OemSuggestionsViewState>({
    featureEnabled: false,
    primary: null,
    loadError: null,
  });
  const [suggestionsSaveConflict, setSuggestionsSaveConflict] = useState(false);
  const [applyingFieldKey, setApplyingFieldKey] = useState<OemSpecificationFieldKey | null>(null);

  const loadCanonical = useCallback(async () => {
    if (!enabled || !vehicleId || !organizationId) {
      setView(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const vehicleDto = await api.vehicles.get(vehicleId);
      setView(buildOemSpecificationsView((vehicleDto ?? {}) as Record<string, unknown>));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'LOAD_FAILED');
      setView(null);
    } finally {
      setLoading(false);
    }
  }, [enabled, organizationId, vehicleId]);

  const loadSuggestions = useCallback(async () => {
    if (!enabled || !vehicleId || !organizationId) {
      setSuggestions({ featureEnabled: false, primary: null, loadError: null });
      return;
    }
    setSuggestionsLoading(true);
    setSuggestions((prev) => ({ ...prev, loadError: null }));
    try {
      const raw = await api.vehicles.getOemSpecificationSuggestions(organizationId, vehicleId);
      const dto = raw as unknown as OneAutoOemSuggestionListDtoWire;
      setSuggestions(mapOemSuggestionListDto(dto));
    } catch (e) {
      const loadError: OemSuggestionsLoadError = classifyOemSuggestionsLoadError(e);
      setSuggestions({ featureEnabled: false, primary: null, loadError });
    } finally {
      setSuggestionsLoading(false);
    }
  }, [enabled, organizationId, vehicleId]);

  const refresh = useCallback(async () => {
    await Promise.all([loadCanonical(), loadSuggestions()]);
  }, [loadCanonical, loadSuggestions]);

  useEffect(() => {
    void loadCanonical();
  }, [loadCanonical]);

  useEffect(() => {
    void loadSuggestions();
  }, [loadSuggestions]);

  const saveField = useCallback(
    async (
      fieldKey: OemSpecificationFieldKey,
      value: string | null,
      userConfirmed: boolean,
    ): Promise<boolean> => {
      if (!organizationId || !vehicleId) return false;
      setSavingFieldKey(fieldKey);
      setError(null);
      setSuggestionsSaveConflict(false);
      try {
        await saveMasterVehicleOemSpecificationField({
          organizationId,
          vehicleId,
          fieldKey,
          value,
          userConfirmed,
        });
        await refresh();
        return true;
      } catch (e) {
        if (isOemSaveConflictError(e)) {
          setSuggestionsSaveConflict(true);
          await refresh();
        }
        setError(e instanceof Error ? e.message : 'SAVE_FAILED');
        return false;
      } finally {
        setSavingFieldKey(null);
      }
    },
    [organizationId, refresh, vehicleId],
  );

  const applySuggestedField = useCallback(
    async (fieldKey: OemSpecificationFieldKey): Promise<boolean> => {
      const row = findSuggestionRow(suggestions.primary, fieldKey);
      if (!row || !canApplyOemSuggestion(row)) return false;
      setApplyingFieldKey(fieldKey);
      const ok = await saveField(fieldKey, row.suggestedValue, true);
      setApplyingFieldKey(null);
      return ok;
    },
    [saveField, suggestions.primary],
  );

  return {
    view,
    loading,
    error,
    savingFieldKey,
    refresh,
    saveField,
    suggestionsLoading,
    suggestions,
    suggestionsSaveConflict,
    applyingFieldKey,
    applySuggestedField,
    clearSuggestionsSaveConflict: () => setSuggestionsSaveConflict(false),
    refreshSuggestions: loadSuggestions,
  };
}
