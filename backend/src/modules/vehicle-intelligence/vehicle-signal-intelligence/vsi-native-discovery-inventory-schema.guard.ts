import type { PrismaClient } from '@prisma/client';

export const VSI_NATIVE_DISCOVERY_INVENTORY_SCHEMA_UNAVAILABLE_LIMITATION =
  'NATIVE_DISCOVERY_INVENTORY_SCHEMA_UNAVAILABLE';

export type VsiNativeDiscoveryInventorySchemaProbeClient = Pick<
  PrismaClient,
  '$queryRaw'
>;

export async function probeNativeDiscoveryInventoryColumnAvailable(
  prisma: VsiNativeDiscoveryInventorySchemaProbeClient,
): Promise<boolean> {
  const rows = await prisma.$queryRaw<{ exists: boolean }[]>`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'vehicle_signal_capability_profiles'
        AND column_name = 'native_signal_discovery_inventory'
    ) AS "exists"
  `;
  return rows[0]?.exists === true;
}

export function isNativeDiscoveryInventorySchemaPrismaError(err: unknown): boolean {
  const code = (err as { code?: string })?.code;
  if (code === 'P2022') {
    return true;
  }
  const message = err instanceof Error ? err.message : String(err);
  return (
    message.includes('native_signal_discovery_inventory') ||
    message.includes('NativeSignalDiscoveryInventory')
  );
}
