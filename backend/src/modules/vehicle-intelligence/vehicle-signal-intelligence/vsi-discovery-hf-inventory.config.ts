/** P2: HF historical native discovery inventory (default OFF — no production activation). */
export function isVsiDiscoveryHfInventoryEnabled(): boolean {
  const raw = process.env.VSI_DISCOVERY_HF_INVENTORY_ENABLED;
  if (raw == null || raw.trim() === '') {
    return false;
  }
  const normalized = raw.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes';
}
