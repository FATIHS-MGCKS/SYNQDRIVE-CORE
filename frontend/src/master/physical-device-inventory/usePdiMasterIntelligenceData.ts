import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api';
import type { MasterPdiDeviceIntelligenceDto } from './pdi-master-intelligence-api.types';

export function usePdiMasterIntelligenceData(input: {
  physicalDeviceId: string | null;
  organizationId: string | null;
}) {
  const [data, setData] = useState<MasterPdiDeviceIntelligenceDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!input.physicalDeviceId) {
      setData(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await api.admin.masterIntelligencePdi.intelligence(
        input.physicalDeviceId,
        input.organizationId,
      );
      setData(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'PDI intelligence could not be loaded');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [input.physicalDeviceId, input.organizationId]);

  useEffect(() => {
    void load();
  }, [load]);

  return { data, loading, error, refresh: load };
}
