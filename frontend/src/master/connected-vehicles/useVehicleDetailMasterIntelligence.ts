import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';
import type { MasterApdsOverviewDto } from '../intelligence/apds-master-intelligence-api.types';
import type { MasterVsiFleetOverviewDto } from '../intelligence/vsi-master-intelligence-api.types';
import {
  pickPrimaryProviderSourceLink,
  profileForProviderSourceLink,
} from '../intelligence/vehicle-detail-intelligence.utils';
import { resolvePhysicalDeviceIdForVehicle } from '../intelligence/resolve-vehicle-physical-device';
import type { PhysicalDeviceListItemDto } from '../../lib/physical-device-inventory.types';

export function useVehicleDetailMasterIntelligence(input: {
  enabled: boolean;
  organizationId: string | null;
  vehicleId: string | null;
  selectedProviderSourceLinkId: string | null;
}) {
  const { enabled, organizationId, vehicleId, selectedProviderSourceLinkId } = input;
  const [vsiOverview, setVsiOverview] = useState<MasterVsiFleetOverviewDto | null>(null);
  const [apdsOverview, setApdsOverview] = useState<MasterApdsOverviewDto | null>(null);
  const [physicalDevice, setPhysicalDevice] = useState<PhysicalDeviceListItemDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const profiles = useMemo(() => vsiOverview?.profiles ?? [], [vsiOverview]);

  const linkPick = useMemo(
    () => pickPrimaryProviderSourceLink(profiles, selectedProviderSourceLinkId),
    [profiles, selectedProviderSourceLinkId],
  );

  const load = useCallback(async () => {
    if (!organizationId || !vehicleId) {
      setVsiOverview(null);
      setApdsOverview(null);
      setPhysicalDevice(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [vsiRes, deviceId] = await Promise.all([
        api.admin.masterIntelligenceVsi.overview(organizationId, vehicleId),
        resolvePhysicalDeviceIdForVehicle(organizationId, vehicleId),
      ]);
      setVsiOverview(vsiRes);

      const apdsLinkScope =
        vsiRes.profiles.length === 1 ? vsiRes.profiles[0]!.providerSourceLinkId : null;
      const apdsRes = await api.admin.masterIntelligenceApds.overview(
        organizationId,
        vehicleId,
        apdsLinkScope,
      );
      setApdsOverview(apdsRes);

      if (deviceId) {
        try {
          const detail = await api.admin.physicalDeviceInventory.getDevice(deviceId);
          setPhysicalDevice(detail);
        } catch {
          setPhysicalDevice(null);
        }
      } else {
        setPhysicalDevice(null);
      }
    } catch (e) {
      setVsiOverview(null);
      setApdsOverview(null);
      setPhysicalDevice(null);
      setError(e instanceof Error ? e.message : 'Failed to load intelligence');
    } finally {
      setLoading(false);
    }
  }, [organizationId, vehicleId]);

  useEffect(() => {
    if (!enabled) return;
    void load();
  }, [enabled, load]);

  useEffect(() => {
    if (!enabled || !organizationId || !vehicleId) return;
    if (profiles.length <= 1) return;
    if (!selectedProviderSourceLinkId) return;
    if (!profiles.some((p) => p.providerSourceLinkId === selectedProviderSourceLinkId)) return;

    let cancelled = false;
    void (async () => {
      try {
        const apdsRes = await api.admin.masterIntelligenceApds.overview(
          organizationId,
          vehicleId,
          selectedProviderSourceLinkId,
        );
        if (!cancelled) setApdsOverview(apdsRes);
      } catch {
        /* keep prior overview */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, organizationId, vehicleId, profiles, selectedProviderSourceLinkId]);

  const activeProfile = useMemo(
    () => profileForProviderSourceLink(profiles, linkPick.linkId),
    [profiles, linkPick.linkId],
  );

  return {
    vsiOverview,
    apdsOverview,
    physicalDevice,
    profiles,
    linkPick,
    activeProfile,
    loading,
    error,
    refresh: load,
  };
}
