import type { Prisma } from '@prisma/client';

/**
 * Locks a DIMO source link for lifecycle mutation (deactivate / FSD invalidation ordering).
 * `FOR NO KEY UPDATE` allows concurrent `KEY SHARE` from `fsd_discovery_runs` FK inserts
 * while this transaction still updates `is_active` / `deactivated_at`.
 */
export async function lockDimoSourceLinkRowForLifecycleMutation(
  tx: Prisma.TransactionClient,
  input: {
    organizationId: string;
    vehicleId: string;
    providerSourceLinkId: string;
  },
): Promise<void> {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT l.id
    FROM vehicle_data_source_links l
    INNER JOIN vehicles v ON v.id = l.vehicle_id
    WHERE l.id = ${input.providerSourceLinkId}
      AND l.vehicle_id = ${input.vehicleId}
      AND l.provider = 'DIMO'
      AND l.source_type = 'DIMO'
      AND v.organization_id = ${input.organizationId}
    FOR NO KEY UPDATE OF l
  `;
  if (rows.length === 0) {
    throw new Error('DIMO_SOURCE_LINK_SCOPE_NOT_FOUND');
  }
}
