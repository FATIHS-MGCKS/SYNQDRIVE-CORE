import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api';
import {
  buildOemSpecificationsView,
  type ConnectedVehicleOemSpecificationsView,
} from './connected-vehicle-oem-specifications.util';
import { saveMasterVehicleOemSpecificationField } from './master-vehicle-oem-specification';
import type { OemSpecificationFieldKey } from './connected-vehicle-oem-specifications.util';

export function useConnectedVehicleOemSpecifications(
  vehicleId: string | null,
  organizationId: string | null,
  enabled: boolean,
) {
  const [view, setView] = useState<ConnectedVehicleOemSpecificationsView | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savingFieldKey, setSavingFieldKey] = useState<OemSpecificationFieldKey | null>(null);

  const load = useCallback(async () => {
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

  useEffect(() => {
    void load();
  }, [load]);

  const saveField = useCallback(
    async (
      fieldKey: OemSpecificationFieldKey,
      value: string | null,
      userConfirmed: boolean,
    ): Promise<boolean> => {
      if (!organizationId || !vehicleId) return false;
      setSavingFieldKey(fieldKey);
      setError(null);
      try {
        await saveMasterVehicleOemSpecificationField({
          organizationId,
          vehicleId,
          fieldKey,
          value,
          userConfirmed,
        });
        await load();
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : 'SAVE_FAILED');
        return false;
      } finally {
        setSavingFieldKey(null);
      }
    },
    [load, organizationId, vehicleId],
  );

  return {
    view,
    loading,
    error,
    savingFieldKey,
    refresh: load,
    saveField,
  };
}
