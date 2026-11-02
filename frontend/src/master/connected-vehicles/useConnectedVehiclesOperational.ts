import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api';
import type { ConnectivityAdminDiagnosticsResponse } from '../../lib/api';
import type {
  PaginatedVehiclesOperationalResponse,
  VehicleOperationalDetailDto,
  VehiclesOperationalOverviewDto,
  VehiclesOperationalQuery,
} from './types';
import { readCvListStateFromUrl, urlToCvQuery, writeCvListStateToUrl, queryToCvUrlState } from './cv.utils';

export const CONNECTED_VEHICLES_REFRESH_EVENT = 'synqdrive:connected-vehicles-refresh';
export const CONNECTED_VEHICLES_OVERVIEW_RESYNC_EVENT = 'synqdrive:cv-overview-resync';

export function emitConnectedVehiclesRefresh(): void {
  window.dispatchEvent(new CustomEvent(CONNECTED_VEHICLES_REFRESH_EVENT));
}

export function useConnectedVehiclesOverview() {
  const [overview, setOverview] = useState<VehiclesOperationalOverviewDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const orgId = readCvListStateFromUrl().organizationId?.trim() || undefined;
      const res = await api.vehicles.operationalOverview(orgId);
      setOverview(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Übersicht konnte nicht geladen werden');
      setOverview(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const onRefresh = () => void load();
    const onPop = () => void load();
    const onResync = () => void load();
    window.addEventListener(CONNECTED_VEHICLES_REFRESH_EVENT, onRefresh);
    window.addEventListener(CONNECTED_VEHICLES_OVERVIEW_RESYNC_EVENT, onResync);
    window.addEventListener('popstate', onPop);
    return () => {
      window.removeEventListener(CONNECTED_VEHICLES_REFRESH_EVENT, onRefresh);
      window.removeEventListener(CONNECTED_VEHICLES_OVERVIEW_RESYNC_EVENT, onResync);
      window.removeEventListener('popstate', onPop);
    };
  }, [load]);

  return { overview, loading, error, refresh: load };
}

export function useConnectedVehiclesList() {
  const [query, setQueryState] = useState<VehiclesOperationalQuery>(() =>
    urlToCvQuery(readCvListStateFromUrl()),
  );
  const [data, setData] = useState<PaginatedVehiclesOperationalResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const setQuery = useCallback((next: VehiclesOperationalQuery, replace = false) => {
    const scopeChanged =
      next.organizationId !== query.organizationId ||
      next.registryLifecycle !== query.registryLifecycle;
    setQueryState(next);
    writeCvListStateToUrl(queryToCvUrlState(next), replace);
    if (scopeChanged) {
      window.dispatchEvent(new CustomEvent(CONNECTED_VEHICLES_OVERVIEW_RESYNC_EVENT));
    }
  }, [query.organizationId, query.registryLifecycle]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.vehicles.operationalList(query as Record<string, string | number | undefined>);
      setData(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fahrzeuge konnten nicht geladen werden');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const onPop = () => setQueryState(urlToCvQuery(readCvListStateFromUrl()));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    const onRefresh = () => void load();
    window.addEventListener(CONNECTED_VEHICLES_REFRESH_EVENT, onRefresh);
    return () => window.removeEventListener(CONNECTED_VEHICLES_REFRESH_EVENT, onRefresh);
  }, [load]);

  return { data, loading, error, query, setQuery, refresh: load };
}

export function useConnectedVehicleDetail(vehicleId: string | null, dimoVehicleId: string | null) {
  const [detail, setDetail] = useState<VehicleOperationalDetailDto | null>(null);
  const [diagnostics, setDiagnostics] =
    useState<ConnectivityAdminDiagnosticsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [diagnosticsLoading, setDiagnosticsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [diagnosticsError, setDiagnosticsError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!vehicleId && !dimoVehicleId) {
      setDetail(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = vehicleId
        ? await api.vehicles.operationalDetail(vehicleId)
        : await api.vehicles.operationalUnregisteredDetail(dimoVehicleId!);
      setDetail(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fahrzeugdetails konnten nicht geladen werden');
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [vehicleId, dimoVehicleId]);

  const loadDiagnostics = useCallback(async () => {
    if (!vehicleId || !detail?.organizationId) return;
    setDiagnosticsLoading(true);
    setDiagnosticsError(null);
    try {
      const res = await api.vehicles.operationalDiagnostics(vehicleId, detail.organizationId);
      setDiagnostics(res);
    } catch (e) {
      setDiagnosticsError(e instanceof Error ? e.message : 'Diagnostik nicht verfügbar');
      setDiagnostics(null);
    } finally {
      setDiagnosticsLoading(false);
    }
  }, [vehicleId, detail?.organizationId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setDiagnostics(null);
    setDiagnosticsError(null);
  }, [vehicleId, dimoVehicleId]);

  return {
    detail,
    diagnostics,
    loading,
    diagnosticsLoading,
    error,
    diagnosticsError,
    refresh: load,
    loadDiagnostics,
  };
}
