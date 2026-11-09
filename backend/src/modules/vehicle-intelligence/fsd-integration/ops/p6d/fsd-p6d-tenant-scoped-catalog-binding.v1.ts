import type { PrismaService } from '@shared/database/prisma.service';
import {
  assertFsdP6dAuthoritativePersistedCatalogV1,
  parsePersistedCatalogCheckpointV1,
} from './fsd-p6d-catalog-provenance-authority.v1';
import type { FsdP6dFleetPrepareVehicleBindingV1 } from './fsd-p6d-fleet-prepare-artifact.v1';

export async function assertFsdP6dTenantScopedCatalogBindingV1(input: {
  prisma: PrismaService;
  organizationId: string;
  binding: FsdP6dFleetPrepareVehicleBindingV1;
  env?: NodeJS.ProcessEnv;
}): Promise<void> {
  if (!input.binding.catalogPersistedRunId) {
    throw new Error(`FSD_P6D_TENANT_CATALOG_RUN_MISSING_${input.binding.label}`);
  }

  const run = await input.prisma.fsdDiscoveryRun.findFirst({
    where: {
      id: input.binding.catalogPersistedRunId,
      organizationId: input.organizationId,
      vehicleId: input.binding.vehicleId,
      providerSourceLinkId: input.binding.providerSourceLinkId,
      status: 'COMPLETED',
      invalidatedAt: null,
      dimoTokenId: input.binding.dimoTokenId,
      connectionIdentityFingerprint: input.binding.connectionIdentityFingerprint,
    },
    include: { stages: { where: { stageType: 'CATALOG', status: 'SUCCEEDED' }, take: 1 } },
  });

  if (!run?.stages[0]) {
    throw new Error(`FSD_P6D_TENANT_CATALOG_RUN_NOT_AUTHORITATIVE_${input.binding.label}`);
  }

  const checkpoint = parsePersistedCatalogCheckpointV1(run.stages[0].checkpointJson);
  if (!checkpoint) {
    throw new Error(`FSD_P6D_TENANT_CATALOG_CHECKPOINT_MISSING_${input.binding.label}`);
  }

  const authoritative = assertFsdP6dAuthoritativePersistedCatalogV1({
    env: input.env,
    context: {
      runId: run.id,
      runKey: run.runKey,
      organizationId: run.organizationId,
      vehicleId: run.vehicleId,
      providerSourceLinkId: run.providerSourceLinkId,
      dimoTokenId: run.dimoTokenId!,
      connectionIdentityFingerprint: run.connectionIdentityFingerprint!,
      invalidatedAt: run.invalidatedAt,
      checkpoint,
      stageHttpStatus: run.stages[0].lastHttpStatus,
    },
  });

  if (authoritative.declaredCatalogFingerprint !== input.binding.declaredCatalogFingerprint) {
    throw new Error(`FSD_P6D_TENANT_CATALOG_FINGERPRINT_MISMATCH_${input.binding.label}`);
  }
}
