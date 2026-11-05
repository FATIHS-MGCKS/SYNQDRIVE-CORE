import type {
  FsdDiscoveryFailureClass,
  FsdDiscoveryRunStatus,
  FsdDiscoverySignalEvidenceState,
  FsdDiscoveryStageStatus,
  FsdDiscoveryStageType,
  Prisma,
} from '@prisma/client';
import type { PrismaService } from '@shared/database/prisma.service';
import { acquirePgAdvisoryXactLock64 } from '@shared/database/pg-advisory-lock.util';
import {
  assertFsdDiscoveryRunTransition,
  assertFsdDiscoveryStageTransition,
  FsdDiscoveryPersistenceError,
  type FsdDiscoveryRunIdentityV1,
  type FsdDiscoveryRunScopeV1,
} from './fsd-discovery-persistence.contract.v1';

type Tx = Prisma.TransactionClient;

export type AcquireFsdDiscoveryRunResultV1 =
  | { kind: 'CREATED'; runId: string; version: number }
  | { kind: 'REPLAYED'; runId: string; version: number; noOp: true }
  | { kind: 'EXISTING'; runId: string; version: number };

export type TransitionFsdDiscoveryRunResultV1 =
  | { applied: true; version: number }
  | { applied: false; reason: 'STALE_RUN_VERSION' | 'INVALID_STATE_TRANSITION' };

export class FsdDiscoveryPersistenceRepository {
  constructor(private readonly prisma: PrismaService) {}

  private lockKey(scope: FsdDiscoveryRunScopeV1): string {
    return `fsd-discovery:${scope.organizationId}:${scope.vehicleId}:${scope.providerSourceLinkId}`;
  }

  async acquireRunWithIdempotency(
    identity: FsdDiscoveryRunIdentityV1,
  ): Promise<AcquireFsdDiscoveryRunResultV1> {
    return this.prisma.$transaction(async (tx) => {
      await acquirePgAdvisoryXactLock64(tx, this.lockKey(identity));
      const existing = await tx.fsdDiscoveryRun.findFirst({
        where: {
          organizationId: identity.organizationId,
          vehicleId: identity.vehicleId,
          providerSourceLinkId: identity.providerSourceLinkId,
          runKey: identity.runKey,
          invalidatedAt: null,
        },
      });
      if (existing) {
        const replay =
          existing.dimoTokenId === identity.dimoTokenId &&
          existing.connectionIdentityFingerprint === identity.connectionIdentityFingerprint &&
          existing.runRevision === identity.runRevision;
        if (replay) {
          return {
            kind: 'REPLAYED',
            runId: existing.id,
            version: existing.version,
            noOp: true as const,
          };
        }
        return {
          kind: 'EXISTING',
          runId: existing.id,
          version: existing.version,
        };
      }
      await tx.fsdDiscoveryRun.updateMany({
        where: {
          organizationId: identity.organizationId,
          vehicleId: identity.vehicleId,
          providerSourceLinkId: identity.providerSourceLinkId,
          invalidatedAt: null,
        },
        data: {
          status: 'INVALIDATED',
          invalidatedAt: new Date(),
          invalidationReason: 'SOURCE_LINK_SUPERSESSION',
          version: { increment: 1 },
        },
      });
      const created = await tx.fsdDiscoveryRun.create({
        data: {
          organizationId: identity.organizationId,
          vehicleId: identity.vehicleId,
          providerSourceLinkId: identity.providerSourceLinkId,
          runKey: identity.runKey,
          runRevision: identity.runRevision,
          dimoTokenId: identity.dimoTokenId,
          connectionIdentityFingerprint: identity.connectionIdentityFingerprint,
          status: 'PENDING',
        },
      });
      return { kind: 'CREATED', runId: created.id, version: created.version };
    });
  }

  async transitionRunStatus(input: {
    scope: FsdDiscoveryRunScopeV1;
    runId: string;
    expectedVersion: number;
    fromStatus: FsdDiscoveryRunStatus;
    toStatus: FsdDiscoveryRunStatus;
    failureClass?: FsdDiscoveryFailureClass | null;
    failureReasonRedacted?: string | null;
  }): Promise<TransitionFsdDiscoveryRunResultV1> {
    try {
      assertFsdDiscoveryRunTransition(input.fromStatus, input.toStatus);
    } catch {
      return { applied: false, reason: 'INVALID_STATE_TRANSITION' };
    }
    await this.requireRunInScope(input.scope, input.runId);
    const result = await this.prisma.fsdDiscoveryRun.updateMany({
      where: {
        id: input.runId,
        organizationId: input.scope.organizationId,
        vehicleId: input.scope.vehicleId,
        providerSourceLinkId: input.scope.providerSourceLinkId,
        version: input.expectedVersion,
        status: input.fromStatus,
        invalidatedAt: null,
      },
      data: {
        status: input.toStatus,
        version: { increment: 1 },
        failureClass: input.failureClass ?? null,
        failureReasonRedacted: input.failureReasonRedacted ?? null,
        completedAt: input.toStatus === 'COMPLETED' ? new Date() : undefined,
      },
    });
    if (result.count !== 1) {
      return { applied: false, reason: 'STALE_RUN_VERSION' };
    }
    return { applied: true, version: input.expectedVersion + 1 };
  }

  async upsertStagePlan(input: {
    scope: FsdDiscoveryRunScopeV1;
    runId: string;
    stageType: FsdDiscoveryStageType;
    planFingerprint: string;
    checkpointJson?: Prisma.InputJsonValue;
  }): Promise<{ stageId: string; created: boolean; noOp: boolean }> {
    const run = await this.requireRunInScope(input.scope, input.runId);
    if (run.invalidatedAt) {
      throw new FsdDiscoveryPersistenceError('STALE_SOURCE_LINK', 'Run invalidated');
    }
    const existing = await this.prisma.fsdDiscoveryStage.findUnique({
      where: { runId_stageType: { runId: input.runId, stageType: input.stageType } },
    });
    if (!existing) {
      const created = await this.prisma.fsdDiscoveryStage.create({
        data: {
          runId: input.runId,
          stageType: input.stageType,
          planFingerprint: input.planFingerprint,
          checkpointJson: input.checkpointJson ?? {},
          status: 'PLANNED',
        },
      });
      return { stageId: created.id, created: true, noOp: false };
    }
    if (existing.planFingerprint === input.planFingerprint && existing.status === 'PLANNED') {
      return { stageId: existing.id, created: false, noOp: true };
    }
    const updated = await this.prisma.fsdDiscoveryStage.update({
      where: { id: existing.id },
      data: {
        planFingerprint: input.planFingerprint,
        checkpointJson: (input.checkpointJson ??
          existing.checkpointJson) as Prisma.InputJsonValue,
        version: { increment: 1 },
      },
    });
    return { stageId: updated.id, created: false, noOp: false };
  }

  async transitionStageStatus(input: {
    scope: FsdDiscoveryRunScopeV1;
    runId: string;
    stageType: FsdDiscoveryStageType;
    expectedVersion: number;
    fromStatus: FsdDiscoveryStageStatus;
    toStatus: FsdDiscoveryStageStatus;
    lastOutcome?: string | null;
    lastErrorCode?: string | null;
    lastHttpStatus?: number | null;
    incrementAttempt?: boolean;
    checkpointJson?: Prisma.InputJsonValue;
  }): Promise<TransitionFsdDiscoveryRunResultV1> {
    try {
      assertFsdDiscoveryStageTransition(input.fromStatus, input.toStatus);
    } catch {
      return { applied: false, reason: 'INVALID_STATE_TRANSITION' };
    }
    await this.requireRunInScope(input.scope, input.runId);
    const result = await this.prisma.fsdDiscoveryStage.updateMany({
      where: {
        runId: input.runId,
        stageType: input.stageType,
        version: input.expectedVersion,
        status: input.fromStatus,
      },
      data: {
        status: input.toStatus,
        version: { increment: 1 },
        lastOutcome: input.lastOutcome ?? undefined,
        lastErrorCode: input.lastErrorCode ?? undefined,
        lastHttpStatus: input.lastHttpStatus ?? undefined,
        attemptCount: input.incrementAttempt ? { increment: 1 } : undefined,
        checkpointJson: input.checkpointJson,
        startedAt: input.toStatus === 'IN_PROGRESS' ? new Date() : undefined,
        completedAt:
          input.toStatus === 'SUCCEEDED' ||
          input.toStatus === 'FAILED' ||
          input.toStatus === 'UNKNOWN_OUTCOME'
            ? new Date()
            : undefined,
      },
    });
    if (result.count !== 1) {
      return { applied: false, reason: 'STALE_RUN_VERSION' };
    }
    return { applied: true, version: input.expectedVersion + 1 };
  }

  async recordSignalEvidence(input: {
    scope: FsdDiscoveryRunScopeV1;
    runId: string;
    stageId: string | null;
    stageType: FsdDiscoveryStageType;
    signalName: string;
    evidenceState: FsdDiscoverySignalEvidenceState;
    declaredByProvider?: boolean;
    schemaShape?: string | null;
    queryPlanned?: boolean;
    queryAccepted?: boolean | null;
    observedValue?: boolean | null;
    provenanceJson?: Prisma.InputJsonValue;
    qualityJson?: Prisma.InputJsonValue;
  }): Promise<{ evidenceId: string; created: boolean }> {
    await this.requireRunInScope(input.scope, input.runId);
    const existing = await this.prisma.fsdDiscoverySignalEvidence.findUnique({
      where: {
        runId_stageType_signalName: {
          runId: input.runId,
          stageType: input.stageType,
          signalName: input.signalName,
        },
      },
    });
    if (existing) {
      const updated = await this.prisma.fsdDiscoverySignalEvidence.update({
        where: { id: existing.id },
        data: {
          stageId: input.stageId,
          evidenceState: input.evidenceState,
          declaredByProvider: input.declaredByProvider ?? existing.declaredByProvider,
          schemaShape: input.schemaShape ?? existing.schemaShape,
          queryPlanned: input.queryPlanned ?? existing.queryPlanned,
          queryAccepted: input.queryAccepted ?? existing.queryAccepted,
          observedValue: input.observedValue ?? existing.observedValue,
          provenanceJson: (input.provenanceJson ??
            existing.provenanceJson) as Prisma.InputJsonValue,
          qualityJson: (input.qualityJson ?? existing.qualityJson) as Prisma.InputJsonValue,
          version: { increment: 1 },
        },
      });
      return { evidenceId: updated.id, created: false };
    }
    const created = await this.prisma.fsdDiscoverySignalEvidence.create({
      data: {
        runId: input.runId,
        stageId: input.stageId,
        stageType: input.stageType,
        signalName: input.signalName,
        evidenceState: input.evidenceState,
        declaredByProvider: input.declaredByProvider ?? true,
        schemaShape: input.schemaShape ?? null,
        queryPlanned: input.queryPlanned ?? false,
        queryAccepted: input.queryAccepted ?? null,
        observedValue: input.observedValue ?? null,
        provenanceJson: input.provenanceJson ?? {},
        qualityJson: input.qualityJson ?? {},
      },
    });
    return { evidenceId: created.id, created: true };
  }

  async supersedeActiveRunsForSourceLink(input: {
    scope: FsdDiscoveryRunScopeV1;
    supersededByRunId: string;
    reason: string;
  }): Promise<number> {
    const result = await this.prisma.fsdDiscoveryRun.updateMany({
      where: {
        organizationId: input.scope.organizationId,
        vehicleId: input.scope.vehicleId,
        providerSourceLinkId: input.scope.providerSourceLinkId,
        invalidatedAt: null,
        id: { not: input.supersededByRunId },
      },
      data: {
        status: 'INVALIDATED',
        invalidatedAt: new Date(),
        invalidationReason: input.reason,
        supersededByRunId: input.supersededByRunId,
        version: { increment: 1 },
      },
    });
    return result.count;
  }

  async claimRunLease(input: {
    scope: FsdDiscoveryRunScopeV1;
    runId: string;
    expectedVersion: number;
    leaseOwner: string;
    leaseExpiresAt: Date;
  }): Promise<boolean> {
    const now = new Date();
    const result = await this.prisma.fsdDiscoveryRun.updateMany({
      where: {
        id: input.runId,
        organizationId: input.scope.organizationId,
        vehicleId: input.scope.vehicleId,
        providerSourceLinkId: input.scope.providerSourceLinkId,
        version: input.expectedVersion,
        invalidatedAt: null,
        OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lt: now } }],
      },
      data: {
        leaseOwner: input.leaseOwner,
        leaseExpiresAt: input.leaseExpiresAt,
        version: { increment: 1 },
      },
    });
    return result.count === 1;
  }

  private async requireRunInScope(scope: FsdDiscoveryRunScopeV1, runId: string) {
    const run = await this.prisma.fsdDiscoveryRun.findFirst({
      where: {
        id: runId,
        organizationId: scope.organizationId,
        vehicleId: scope.vehicleId,
        providerSourceLinkId: scope.providerSourceLinkId,
      },
    });
    if (!run) {
      throw new FsdDiscoveryPersistenceError('RUN_NOT_FOUND', `Run ${runId} not found in scope`);
    }
    return run;
  }
}
