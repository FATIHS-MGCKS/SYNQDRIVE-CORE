/**
 * FSD P5B — audited operator DIMO source-link deactivation (Nest transaction path).
 *
 * Usage:
 *   cd backend && npx tsx scripts/ops/fsd-lifecycle-deactivate-dimo-source-link.ts \
 *     --organization-id=<uuid> --vehicle-id=<uuid> --link-id=<uuid> \
 *     --actor-user-id=<uuid> --idempotency-key=<key> \
 *     [--reason=OPS_MANUAL_DEACTIVATE] [--note=...] [--dry-run]
 *
 * Not vehicle offboarding. Does not revoke vehicle provider consent. Requires DATABASE_URL.
 */
import * as fs from 'fs';
import * as path from 'path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../src/app.module';
import { DimoSourceLinkAuditedDeactivationService } from '../../src/modules/vehicle-onboarding/services/dimo-source-link-audited-deactivation.service';
import { PrismaService } from '../../src/shared/database/prisma.service';

{
  const envPath =
    process.env.SYNQDRIVE_BACKEND_ENV ?? path.resolve(__dirname, '..', '..', '.env');
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) {
        process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
      }
    }
  }
}

function parseArgs() {
  const get = (prefix: string) =>
    process.argv.find((a) => a.startsWith(prefix))?.slice(prefix.length);
  return {
    organizationId: get('--organization-id='),
    vehicleId: get('--vehicle-id='),
    linkId: get('--link-id='),
    actorUserId: get('--actor-user-id='),
    idempotencyKey: get('--idempotency-key='),
    reason: get('--reason=') ?? 'OPS_MANUAL_DEACTIVATE',
    note: get('--note='),
    dryRun: process.argv.includes('--dry-run'),
  };
}

async function main(): Promise<void> {
  const args = parseArgs();
  const missing = [
    ['--organization-id', args.organizationId],
    ['--vehicle-id', args.vehicleId],
    ['--link-id', args.linkId],
    ['--actor-user-id', args.actorUserId],
    ['--idempotency-key', args.idempotencyKey],
  ].filter(([, v]) => !v?.trim());
  if (missing.length) {
    console.error(`Missing: ${missing.map(([k]) => k).join(', ')}`);
    process.exit(2);
  }
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is required');
    process.exit(2);
  }

  const appModule = await AppModule.forRootAsync();
  const app = await NestFactory.createApplicationContext(appModule, {
    logger: ['error', 'warn'],
  });

  try {
    const prisma = app.get(PrismaService);
    const scoped = await prisma.vehicleDataSourceLink.findFirst({
      where: {
        id: args.linkId,
        vehicleId: args.vehicleId,
        vehicle: { organizationId: args.organizationId, id: args.vehicleId },
        provider: 'DIMO',
        sourceType: 'DIMO',
      },
      select: { id: true, isActive: true },
    });
    if (!scoped) {
      console.error('Link not found for org/vehicle scope');
      process.exit(1);
    }

    const plan = {
      dryRun: args.dryRun,
      organizationId: args.organizationId,
      vehicleId: args.vehicleId,
      providerSourceLinkId: args.linkId,
      actorUserId: args.actorUserId,
      deactivationReason: args.reason,
      idempotencyKey: args.idempotencyKey,
      note: args.note ?? null,
      isActiveBefore: scoped.isActive,
    };
    console.log(JSON.stringify(plan, null, 2));
    if (args.dryRun) {
      return;
    }

    const svc = app.get(DimoSourceLinkAuditedDeactivationService);
    const result = await svc.deactivateAudited({
      organizationId: args.organizationId!,
      vehicleId: args.vehicleId!,
      providerSourceLinkId: args.linkId!,
      actorUserId: args.actorUserId!,
      deactivationReason: args.reason!,
      idempotencyKey: args.idempotencyKey!,
      note: args.note,
    });
    console.log(JSON.stringify({ status: 'OK', deactivatedAt: result.deactivatedAt.toISOString() }));
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
