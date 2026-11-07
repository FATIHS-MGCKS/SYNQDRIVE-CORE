/**
 * Audited transactional DIMO source-link deactivation with FSD P5B invalidation.
 *
 * Usage:
 *   cd backend && npx tsx scripts/ops/fsd-lifecycle-deactivate-dimo-source-link.ts --link-id=<uuid> [--reason=OPS_MANUAL] [--dry-run]
 *
 * Requires DATABASE_URL. Does not perform live DIMO calls.
 */
import { PrismaClient } from '@prisma/client';
import { FsdDiscoveryPersistenceRepository } from '../../src/modules/vehicle-intelligence/full-signal-discovery/persistence/fsd-discovery-persistence.repository';
import { FsdSourceLinkLifecycleService } from '../../src/modules/vehicle-intelligence/fsd-integration/fsd-source-link-lifecycle.service';
import { FSD_LIFECYCLE_REASON_OFFBOARD } from '../../src/modules/vehicle-intelligence/fsd-integration/fsd-source-link-lifecycle.service';

function parseArgs(): { linkId: string | undefined; reason: string; dryRun: boolean } {
  const linkId = process.argv.find((a) => a.startsWith('--link-id='))?.slice('--link-id='.length);
  const reasonArg = process.argv.find((a) => a.startsWith('--reason='))?.slice('--reason='.length);
  const dryRun = process.argv.includes('--dry-run');
  return { linkId, reason: reasonArg ?? 'OPS_MANUAL_DEACTIVATE', dryRun };
}

async function main(): Promise<void> {
  const { linkId, reason, dryRun } = parseArgs();
  if (!linkId?.trim()) {
    console.error('Missing --link-id=<uuid>');
    process.exit(2);
  }
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is required');
    process.exit(2);
  }

  const prisma = new PrismaClient();
  const persistence = new FsdDiscoveryPersistenceRepository(prisma as never);
  const lifecycle = new FsdSourceLinkLifecycleService(persistence);

  try {
    const link = await prisma.vehicleDataSourceLink.findUnique({
      where: { id: linkId },
      include: {
        vehicle: { select: { id: true, organizationId: true } },
      },
    });
    if (!link?.vehicle) {
      console.error('Source link not found');
      process.exit(1);
    }
    if (link.provider !== 'DIMO' || link.sourceType !== 'DIMO') {
      console.error('Link is not a DIMO source link');
      process.exit(1);
    }

    console.log(
      JSON.stringify(
        {
          dryRun,
          linkId,
          vehicleId: link.vehicle.id,
          organizationId: link.vehicle.organizationId,
          reason,
        },
        null,
        2,
      ),
    );

    if (dryRun) {
      return;
    }

    const deactivatedAt = new Date();
    await prisma.$transaction(async (tx) => {
      await lifecycle.invalidateSingleDimoSourceLinkForLifecycle(tx, {
        organizationId: link.vehicle!.organizationId,
        vehicleId: link.vehicle!.id,
        providerSourceLinkId: link.id,
        invalidationReason: FSD_LIFECYCLE_REASON_OFFBOARD,
      });
      await tx.vehicleDataSourceLink.update({
        where: { id: link.id },
        data: {
          isActive: false,
          deactivatedAt,
          deactivationReason: reason,
        },
      });
    });

    console.log('OK: link deactivated and FSD runs invalidated');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
