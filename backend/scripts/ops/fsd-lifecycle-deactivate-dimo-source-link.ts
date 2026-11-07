/**
 * FSD P5B — audited operator DIMO source-link deactivation (minimal ops Nest bootstrap).
 *
 * Usage:
 *   cd backend && npx tsx scripts/ops/fsd-lifecycle-deactivate-dimo-source-link.ts \
 *     --organization-id=<uuid> --vehicle-id=<uuid> --link-id=<uuid> \
 *     --actor-user-id=<uuid> --idempotency-key=<key> \
 *     [--reason=OPS_MANUAL_DEACTIVATE] [--note=...] [--dry-run]
 *     [--recover-invalidate-only]  (inactive link — FSD run invalidation only)
 *
 * Not vehicle offboarding. Does not revoke vehicle provider consent. Requires DATABASE_URL.
 */
import * as fs from 'fs';
import * as path from 'path';
import { NestFactory } from '@nestjs/core';
import { DimoSourceLinkOpsModule } from '../../src/modules/vehicle-onboarding/ops/dimo-source-link-ops.module';
import { DimoSourceLinkAuditedDeactivationService } from '../../src/modules/vehicle-onboarding/services/dimo-source-link-audited-deactivation.service';
import { DimoSourceLinkOperatorAuthorizationService } from '../../src/modules/vehicle-onboarding/services/dimo-source-link-operator-authorization.service';
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
    recoverInvalidateOnly: process.argv.includes('--recover-invalidate-only'),
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

  if (args.dryRun) {
    const plan = {
      dryRun: true,
      recoverInvalidateOnly: args.recoverInvalidateOnly,
      organizationId: args.organizationId,
      vehicleId: args.vehicleId,
      providerSourceLinkId: args.linkId,
      actorUserId: args.actorUserId,
      idempotencyKey: args.idempotencyKey,
    };
    console.log(JSON.stringify(plan, null, 2));
    return;
  }

  const app = await NestFactory.createApplicationContext(DimoSourceLinkOpsModule, {
    logger: ['error', 'warn'],
  });

  try {
    const prisma = app.get(PrismaService);
    const authSvc = app.get(DimoSourceLinkOperatorAuthorizationService);
    const svc = app.get(DimoSourceLinkAuditedDeactivationService);

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

    const authorizationEvidence = await authSvc.assertAuthorizedDimoSourceLinkOperator({
      organizationId: args.organizationId!,
      vehicleId: args.vehicleId!,
      providerSourceLinkId: args.linkId!,
      actorUserId: args.actorUserId!,
    });

    if (args.recoverInvalidateOnly) {
      const result = await svc.recoverFsdRunsForInactiveLinkAudited({
        organizationId: args.organizationId!,
        vehicleId: args.vehicleId!,
        providerSourceLinkId: args.linkId!,
        actorUserId: args.actorUserId!,
        idempotencyKey: args.idempotencyKey!,
        recoveryReason: args.reason!,
        note: args.note,
        authorizationEvidence,
      });
      console.log(
        JSON.stringify({
          status: 'OK',
          mode: 'RECOVER_INVALIDATE_ONLY',
          invalidatedCount: result.invalidatedCount,
          idempotentReplay: result.idempotentReplay,
        }),
      );
      return;
    }

    const result = await svc.deactivateAudited({
      organizationId: args.organizationId!,
      vehicleId: args.vehicleId!,
      providerSourceLinkId: args.linkId!,
      actorUserId: args.actorUserId!,
      deactivationReason: args.reason!,
      idempotencyKey: args.idempotencyKey!,
      note: args.note,
      authorizationEvidence,
    });
    console.log(
      JSON.stringify({
        status: 'OK',
        deactivatedAt: result.deactivatedAt.toISOString(),
        idempotentReplay: result.idempotentReplay,
      }),
    );
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
