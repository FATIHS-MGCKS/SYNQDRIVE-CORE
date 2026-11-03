/**
 * P3A — bounded native discovery inventory reconciliation (default OFF).
 * Separate from snapshot/HF discovery writers; enables sweep + outbox reconcile only.
 */
export function isVsiDiscoveryInventoryReconcileEnabled(): boolean {
  const raw = process.env.VSI_DISCOVERY_INVENTORY_RECONCILE_ENABLED;
  if (raw == null || raw.trim() === '') {
    return false;
  }
  const normalized = raw.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes';
}
