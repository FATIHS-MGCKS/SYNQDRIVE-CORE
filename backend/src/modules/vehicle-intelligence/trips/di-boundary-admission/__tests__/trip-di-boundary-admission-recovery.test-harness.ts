import { randomUUID } from 'crypto';
import type { PrismaClient } from '@prisma/client';
import type { S4aTenant } from '../../../driving-intelligence/s4a-foundation/__tests__/di-v0-s4a-postgres-harness';
import { setKillState } from '../../../driving-intelligence/s4a-foundation/__tests__/di-v0-s4a-postgres-harness';

const R1_DIMO_RAW_JSON = {
  aftermarketDevice: { serial: 'R1-RECOVERY-TEST' },
};

/** Links a supported RUPTELA_R1 DIMO identity so recovery eligibility v1 passes provider checks. */
export async function seedRecoverySupportedDimoIdentityForTenant(
  prisma: PrismaClient,
  tenant: S4aTenant,
): Promise<void> {
  const dimoId = randomUUID();
  const externalId = `recovery-test-${dimoId}`;
  await prisma.$executeRawUnsafe(
    `INSERT INTO dimo_vehicles (id, external_id, token_id, raw_json, created_at, updated_at)
     VALUES ($1, $2, $3, $4::jsonb, NOW(), NOW())
     ON CONFLICT (id) DO UPDATE SET raw_json = EXCLUDED.raw_json`,
    dimoId,
    externalId,
    Math.floor(Math.random() * 1_000_000),
    JSON.stringify(R1_DIMO_RAW_JSON),
  );
  await prisma.$executeRawUnsafe(
    `UPDATE vehicles SET dimo_vehicle_id = $1, registry_lifecycle = 'ACTIVE'::"VehicleRegistryLifecycle", updated_at = NOW()
     WHERE id = $2`,
    dimoId,
    tenant.vehicleId,
  );
}

export async function ensureRecoveryPostgresHarness(prisma: PrismaClient): Promise<void> {
  await setKillState(prisma, 'NOT_KILLED');
}
