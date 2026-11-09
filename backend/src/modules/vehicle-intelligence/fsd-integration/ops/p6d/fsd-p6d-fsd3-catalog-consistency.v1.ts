import type { PrismaService } from '@shared/database/prisma.service';
import {
  assertFsdP6dAuthoritativePersistedCatalogV1,
  parsePersistedCatalogCheckpointV1,
} from './fsd-p6d-catalog-provenance-authority.v1';
import type { FsdP6dVerifiedCatalogEvidenceV1 } from './fsd-p6d-catalog-provenance.v1';

export async function assertFsdP6dFsd3RunCatalogConsistencyV1(input: {
  prisma: PrismaService;
  env?: NodeJS.ProcessEnv;
  label: string;
  approvedEvidence: FsdP6dVerifiedCatalogEvidenceV1;
  fsd3RunId: string;
}): Promise<void> {
  const run = await input.prisma.fsdDiscoveryRun.findUnique({
    where: { id: input.fsd3RunId },
    include: {
      stages: { where: { stageType: 'CATALOG', status: 'SUCCEEDED' }, take: 1 },
    },
  });
  if (!run?.stages[0]) {
    throw new Error(`FSD_P6D_FSD3_CATALOG_STAGE_MISSING_${input.label}`);
  }

  const checkpoint = parsePersistedCatalogCheckpointV1(run.stages[0].checkpointJson);
  if (!checkpoint) {
    throw new Error(`FSD_P6D_FSD3_CATALOG_CHECKPOINT_MISSING_${input.label}`);
  }

  const authoritative = assertFsdP6dAuthoritativePersistedCatalogV1({
    env: input.env,
    context: {
      runId: run.id,
      runKey: run.runKey,
      organizationId: run.organizationId,
      vehicleId: run.vehicleId,
      providerSourceLinkId: run.providerSourceLinkId,
      dimoTokenId: run.dimoTokenId ?? input.approvedEvidence.dimoTokenId,
      connectionIdentityFingerprint:
        run.connectionIdentityFingerprint ?? input.approvedEvidence.connectionIdentityFingerprint,
      invalidatedAt: run.invalidatedAt,
      checkpoint,
      stageHttpStatus: run.stages[0].lastHttpStatus,
    },
  });

  if (authoritative.declaredCatalogFingerprint !== input.approvedEvidence.declaredCatalogFingerprint) {
    throw new Error(`FSD_P6D_FSD3_CATALOG_DRIFT_${input.label}`);
  }
}
