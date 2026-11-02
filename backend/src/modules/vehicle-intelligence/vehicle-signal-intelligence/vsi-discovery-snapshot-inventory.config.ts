/**
 * P1b — universal snapshot native discovery (default OFF until explicitly enabled).
 * Production without P1a migration must keep this disabled (no activation).
 */
export function isVsiDiscoverySnapshotInventoryEnabled(): boolean {
  const raw = process.env.VSI_DISCOVERY_SNAPSHOT_INVENTORY_ENABLED;
  if (raw == null || raw === '') {
    return false;
  }
  const normalized = raw.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes';
}
