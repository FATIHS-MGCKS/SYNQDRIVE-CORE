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
  buildEffectiveEvidenceStateV1,
  isEvidenceStateUnchangedV1,
  type FsdDiscoveryEvidenceWritePayloadV1,
} from './fsd-discovery-evidence-idempotency.v1';
import {
  assertFsdDiscoveryRunTransition,
  assertFsdDiscoveryStageTransition,
  buildFsdDimoConnectionIdentityFingerprint,
  FSD_DISCOVERY_RUN_EXECUTABLE_STATUSES,
  FsdDiscoveryPersistenceError,
  isFsdDiscoveryStageTerminal,
  type FsdDiscoveryRunIdentityV1,
  type FsdDiscoveryRunScopeV1,
  type FsdDiscoveryWriteAuthorizationV1,
} from './fsd-discovery-persistence.contract.v1';
import {
  catalogCheckpointToJson,
  createEmptyFsd3RequestLedger,
  parseFsd3CatalogStageCheckpoint,
  type Fsd3CatalogStageCheckpointV1,
} from '../orchestration/fsd3-request-ledger.v1';

type Tx = Prisma.TransactionClient;

export type AcquireFsdDiscoveryRunResultV1 =
  | { kind: 'CREATED'; runId: string; version: number; runRevision: number }
  | { kind: 'REPLAYED'; runId: string; version: number; runRevision: number; noOp: true };

export type TransitionFsdDiscoveryRunResultV1 =
  | { applied: true; version: number }
  | { applied: false; reason: 'STALE_RUN_VERSION' | 'INVALID_STATE_TRANSITION' };

export type FsdDiscoveryRunOrchestrationBundleV1 = {
  run: {
    id: string;
    status: FsdDiscoveryRunStatus;
    version: number;
    leaseOwner: string | null;
    leaseExpiresAt: Date | null;
  };
  stages: Array<{
    stageType: FsdDiscoveryStageType;
    id: string;
    status: FsdDiscoveryStageStatus;
    version: number;
    planFingerprint: string;
    checkpointJson: Prisma.JsonValue | null;
  }>;
};

export class FsdDiscoveryPersistenceRepository {
  constructor(private readonly prisma: PrismaService) {}

  private lockKey(scope: FsdDiscoveryRunScopeV1): string {
    return `fsd-discovery:${scope.organizationId}:${scope.vehicleId}:${scope.providerSourceLinkId}`;
  }

  private async withSourceLinkLock<T>(
    scope: FsdDiscoveryRunScopeV1,
    fn: (tx: Tx) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      await acquirePgAdvisoryXactLock64(tx, this.lockKey(scope));
      return fn(tx);
    });
  }

  private async validateDimoSourceLink(tx: Tx, identity: FsdDiscoveryRunIdentityV1) {
    const link = await tx.vehicleDataSourceLink.findFirst({
      where: {
        id: identity.providerSourceLinkId,
        vehicleId: identity.vehicleId,
        isActive: true,
        supersededByLinkId: null,
        deactivatedAt: null,
        provider: 'DIMO',
        sourceType: 'DIMO',
        vehicle: { organizationId: identity.organizationId },
      },
      include: { dimoVehicle: true },
    });
    if (!link) {
      throw new FsdDiscoveryPersistenceError(
        'SOURCE_LINK_INVALID',
        'Active DIMO source link not found for org/vehicle scope',
      );
    }
    const tokenId = link.dimoVehicle?.tokenId ?? null;
    if (identity.dimoTokenId != null && tokenId !== identity.dimoTokenId) {
      throw new FsdDiscoveryPersistenceError(
        'SOURCE_LINK_INVALID',
        'DIMO token id does not match source link',
      );
    }
    if (identity.connectionIdentityFingerprint && link.dimoVehicleId && link.dimoVehicle) {
      const computed = buildFsdDimoConnectionIdentityFingerprint({
        dimoVehicleId: link.dimoVehicleId,
        tokenId: link.dimoVehicle.tokenId,
      });
      if (identity.connectionIdentityFingerprint !== computed) {
        throw new FsdDiscoveryPersistenceError(
          'SOURCE_LINK_INVALID',
          'DIMO connection identity fingerprint mismatch',
        );
      }
    }
    return link;
  }

  private async assertActiveDimoSourceLinkForWrites(
    tx: Tx,
    scope: FsdDiscoveryRunScopeV1,
    run: { dimoTokenId: number | null; connectionIdentityFingerprint: string | null },
  ): Promise<void> {
    const link = await tx.vehicleDataSourceLink.findFirst({
      where: {
        id: scope.providerSourceLinkId,
        vehicleId: scope.vehicleId,
        isActive: true,
        supersededByLinkId: null,
        deactivatedAt: null,
        provider: 'DIMO',
        sourceType: 'DIMO',
        vehicle: { organizationId: scope.organizationId },
      },
      include: { dimoVehicle: true },
    });
    if (!link) {
      throw new FsdDiscoveryPersistenceError(
        'STALE_SOURCE_LINK',
        'Source link is no longer active for discovery writes',
      );
    }
    const tokenId = link.dimoVehicle?.tokenId ?? null;
    if (run.dimoTokenId != null && tokenId !== run.dimoTokenId) {
      throw new FsdDiscoveryPersistenceError(
        'STALE_SOURCE_LINK',
        'Source link DIMO token no longer matches run binding',
      );
    }
    if (run.connectionIdentityFingerprint && link.dimoVehicleId && link.dimoVehicle) {
      const computed = buildFsdDimoConnectionIdentityFingerprint({
        dimoVehicleId: link.dimoVehicleId,
        tokenId: link.dimoVehicle.tokenId,
      });
      if (run.connectionIdentityFingerprint !== computed) {
        throw new FsdDiscoveryPersistenceError(
          'STALE_SOURCE_LINK',
          'Source link connection identity no longer matches run binding',
        );
      }
    }
  }

  private connectionIdentityMatches(
    active: { dimoTokenId: number | null; connectionIdentityFingerprint: string | null },
    identity: FsdDiscoveryRunIdentityV1,
  ): boolean {
    return (
      active.dimoTokenId === identity.dimoTokenId &&
      active.connectionIdentityFingerprint === identity.connectionIdentityFingerprint
    );
  }

  private async allocateNextRunRevision(tx: Tx, providerSourceLinkId: string): Promise<number> {
    const agg = await tx.fsdDiscoveryRun.aggregate({
      where: { providerSourceLinkId },
      _max: { runRevision: true },
    });
    return (agg._max.runRevision ?? 0) + 1;
  }

  async acquireRunWithIdempotency(
    identity: FsdDiscoveryRunIdentityV1,
  ): Promise<AcquireFsdDiscoveryRunResultV1> {
    return this.withSourceLinkLock(identity, async (tx) => {
      await this.validateDimoSourceLink(tx, identity);

      const active = await tx.fsdDiscoveryRun.findFirst({
        where: {
          organizationId: identity.organizationId,
          vehicleId: identity.vehicleId,
          providerSourceLinkId: identity.providerSourceLinkId,
          runKey: identity.runKey,
          invalidatedAt: null,
        },
      });
      if (active) {
        if (this.connectionIdentityMatches(active, identity)) {
          return {
            kind: 'REPLAYED',
            runId: active.id,
            version: active.version,
            runRevision: active.runRevision,
            noOp: true as const,
          };
        }
        throw new FsdDiscoveryPersistenceError(
          'RUN_IDENTITY_CONFLICT',
          'Active run exists for runKey with different connection identity',
        );
      }

      await tx.fsdDiscoveryRun.updateMany({
        where: {
          organizationId: identity.organizationId,
          vehicleId: identity.vehicleId,
          providerSourceLinkId: identity.providerSourceLinkId,
          invalidatedAt: null,
          status: { in: [...FSD_DISCOVERY_RUN_EXECUTABLE_STATUSES] },
        },
        data: {
          status: 'INVALIDATED',
          invalidatedAt: new Date(),
          invalidationReason: 'SOURCE_LINK_SUPERSESSION',
          version: { increment: 1 },
        },
      });

      const runRevision = await this.allocateNextRunRevision(tx, identity.providerSourceLinkId);
      const created = await tx.fsdDiscoveryRun.create({
        data: {
          organizationId: identity.organizationId,
          vehicleId: identity.vehicleId,
          providerSourceLinkId: identity.providerSourceLinkId,
          runKey: identity.runKey,
          runRevision,
          dimoTokenId: identity.dimoTokenId,
          connectionIdentityFingerprint: identity.connectionIdentityFingerprint,
          status: 'PENDING',
        },
      });
      return {
        kind: 'CREATED',
        runId: created.id,
        version: created.version,
        runRevision: created.runRevision,
      };
    });
  }

  private async fenceRunnableRun(
    tx: Tx,
    auth: FsdDiscoveryWriteAuthorizationV1,
  ): Promise<{ runVersion: number }> {
    const now = new Date();
    const run = await tx.fsdDiscoveryRun.findFirst({
      where: {
        id: auth.runId,
        organizationId: auth.organizationId,
        vehicleId: auth.vehicleId,
        providerSourceLinkId: auth.providerSourceLinkId,
        version: auth.expectedRunVersion,
        invalidatedAt: null,
        status: { in: [...FSD_DISCOVERY_RUN_EXECUTABLE_STATUSES] },
        leaseOwner: auth.leaseOwner,
        leaseExpiresAt: { gt: now },
      },
    });
    if (!run) {
      throw new FsdDiscoveryPersistenceError(
        'LEASE_LOST',
        'Run is not executable under the supplied lease/version fence',
      );
    }
    await this.assertActiveDimoSourceLinkForWrites(tx, auth, run);
    return { runVersion: run.version };
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
    return this.withSourceLinkLock(input.scope, async (tx) => {
      const result = await tx.fsdDiscoveryRun.updateMany({
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
          leaseOwner: input.toStatus === 'COMPLETED' || input.toStatus === 'FAILED' ? null : undefined,
          leaseExpiresAt:
            input.toStatus === 'COMPLETED' || input.toStatus === 'FAILED' ? null : undefined,
        },
      });
      if (result.count !== 1) {
        const exists = await tx.fsdDiscoveryRun.findFirst({
          where: {
            id: input.runId,
            organizationId: input.scope.organizationId,
            vehicleId: input.scope.vehicleId,
            providerSourceLinkId: input.scope.providerSourceLinkId,
          },
        });
        if (!exists) {
          throw new FsdDiscoveryPersistenceError('RUN_NOT_FOUND', `Run ${input.runId} not found in scope`);
        }
        return { applied: false, reason: 'STALE_RUN_VERSION' };
      }
      return { applied: true, version: input.expectedVersion + 1 };
    });
  }

  async upsertStagePlan(input: {
    auth: FsdDiscoveryWriteAuthorizationV1;
    stageType: FsdDiscoveryStageType;
    planFingerprint: string;
  }): Promise<{ stageId: string; created: boolean; noOp: boolean }> {
    return this.withSourceLinkLock(input.auth, async (tx) => {
      await this.fenceRunnableRun(tx, input.auth);
      const existing = await tx.fsdDiscoveryStage.findUnique({
        where: {
          runId_stageType: { runId: input.auth.runId, stageType: input.stageType },
        },
      });
      if (!existing) {
        const created = await tx.fsdDiscoveryStage.create({
          data: {
            runId: input.auth.runId,
            stageType: input.stageType,
            planFingerprint: input.planFingerprint,
            status: 'PLANNED',
          },
        });
        return { stageId: created.id, created: true, noOp: false };
      }
      if (isFsdDiscoveryStageTerminal(existing.status)) {
        throw new FsdDiscoveryPersistenceError(
          'STAGE_IMMUTABLE',
          `Stage ${input.stageType} is terminal (${existing.status})`,
        );
      }
      if (existing.planFingerprint === input.planFingerprint) {
        return { stageId: existing.id, created: false, noOp: true };
      }
      throw new FsdDiscoveryPersistenceError(
        'PLAN_FINGERPRINT_CONFLICT',
        `Stage ${input.stageType} plan fingerprint mismatch`,
      );
    });
  }

  async advanceStageCheckpoint(input: {
    auth: FsdDiscoveryWriteAuthorizationV1;
    stageType: FsdDiscoveryStageType;
    expectedStageVersion: number;
    planFingerprint: string;
    checkpointJson: Prisma.InputJsonValue;
  }): Promise<{ applied: boolean; stageVersion: number }> {
    return this.withSourceLinkLock(input.auth, async (tx) => {
      await this.fenceRunnableRun(tx, input.auth);
      const result = await tx.fsdDiscoveryStage.updateMany({
        where: {
          runId: input.auth.runId,
          stageType: input.stageType,
          version: input.expectedStageVersion,
          planFingerprint: input.planFingerprint,
          status: { in: ['PLANNED', 'IN_PROGRESS'] },
        },
        data: {
          checkpointJson: input.checkpointJson,
          version: { increment: 1 },
        },
      });
      if (result.count !== 1) {
        const stage = await tx.fsdDiscoveryStage.findUnique({
          where: {
            runId_stageType: { runId: input.auth.runId, stageType: input.stageType },
          },
        });
        if (!stage) {
          throw new FsdDiscoveryPersistenceError('STAGE_NOT_FOUND', 'Stage not found for checkpoint');
        }
        if (isFsdDiscoveryStageTerminal(stage.status)) {
          throw new FsdDiscoveryPersistenceError('STAGE_IMMUTABLE', 'Terminal stage checkpoint rejected');
        }
        return { applied: false, stageVersion: stage.version };
      }
      return { applied: true, stageVersion: input.expectedStageVersion + 1 };
    });
  }

  async transitionStageStatus(input: {
    auth: FsdDiscoveryWriteAuthorizationV1;
    stageType: FsdDiscoveryStageType;
    expectedStageVersion: number;
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
    return this.withSourceLinkLock(input.auth, async (tx) => {
      await this.fenceRunnableRun(tx, input.auth);
      const result = await tx.fsdDiscoveryStage.updateMany({
        where: {
          runId: input.auth.runId,
          stageType: input.stageType,
          version: input.expectedStageVersion,
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
      return { applied: true, version: input.expectedStageVersion + 1 };
    });
  }

  private async resolveEvidenceStage(
    tx: Tx,
    input: {
      runId: string;
      stageId: string | null;
      stageType: FsdDiscoveryStageType;
    },
  ) {
    if (!input.stageId) {
      return null;
    }
    const stage = await tx.fsdDiscoveryStage.findFirst({
      where: {
        id: input.stageId,
        runId: input.runId,
        stageType: input.stageType,
      },
    });
    if (!stage) {
      throw new FsdDiscoveryPersistenceError(
        'EVIDENCE_SCOPE_VIOLATION',
        'Evidence stageId does not match run/stageType scope',
      );
    }
    return stage;
  }

  async recordSignalEvidence(
    input: FsdDiscoveryWriteAuthorizationV1 & {
      stageId?: string | null;
      stageType: FsdDiscoveryStageType;
      signalName: string;
      expectedEvidenceVersion?: number;
    } & FsdDiscoveryEvidenceWritePayloadV1,
  ): Promise<{ evidenceId: string; created: boolean; noOp: boolean }> {
    return this.withSourceLinkLock(input, async (tx) => {
      await this.fenceRunnableRun(tx, input);
      await this.resolveEvidenceStage(tx, {
        runId: input.runId,
        stageId: input.stageId ?? null,
        stageType: input.stageType,
      });

      const createDefaults = {
        stageId: input.stageId ?? null,
        evidenceState: input.evidenceState,
        declaredByProvider: true,
        schemaShape: null as string | null,
        queryPlanned: false,
        queryAccepted: null as boolean | null,
        observedValue: null as boolean | null,
        provenanceJson: {} as Prisma.JsonValue,
        qualityJson: {} as Prisma.JsonValue,
      };

      const existing = await tx.fsdDiscoverySignalEvidence.findUnique({
        where: {
          runId_stageType_signalName: {
            runId: input.runId,
            stageType: input.stageType,
            signalName: input.signalName,
          },
        },
      });

      if (existing) {
        if (
          input.expectedEvidenceVersion != null &&
          existing.version !== input.expectedEvidenceVersion
        ) {
          throw new FsdDiscoveryPersistenceError(
            'STALE_RUN_VERSION',
            'Evidence version CAS conflict',
          );
        }
        const existingSnapshot = {
          stageId: existing.stageId,
          evidenceState: existing.evidenceState,
          declaredByProvider: existing.declaredByProvider,
          schemaShape: existing.schemaShape,
          queryPlanned: existing.queryPlanned,
          queryAccepted: existing.queryAccepted,
          observedValue: existing.observedValue,
          provenanceJson: existing.provenanceJson as Prisma.JsonValue,
          qualityJson: existing.qualityJson as Prisma.JsonValue,
        };
        const effective = buildEffectiveEvidenceStateV1(existingSnapshot, input, createDefaults);
        if (isEvidenceStateUnchangedV1(existingSnapshot, effective)) {
          return { evidenceId: existing.id, created: false, noOp: true };
        }
        const updated = await tx.fsdDiscoverySignalEvidence.updateMany({
          where: {
            id: existing.id,
            runId: input.runId,
            version: existing.version,
          },
          data: {
            stageId: effective.stageId,
            evidenceState: effective.evidenceState,
            declaredByProvider: effective.declaredByProvider,
            schemaShape: effective.schemaShape,
            queryPlanned: effective.queryPlanned,
            queryAccepted: effective.queryAccepted,
            observedValue: effective.observedValue,
            provenanceJson: effective.provenanceJson as Prisma.InputJsonValue,
            qualityJson: effective.qualityJson as Prisma.InputJsonValue,
            version: { increment: 1 },
          },
        });
        if (updated.count !== 1) {
          throw new FsdDiscoveryPersistenceError(
            'STALE_RUN_VERSION',
            'Concurrent evidence update lost CAS race',
          );
        }
        return { evidenceId: existing.id, created: false, noOp: false };
      }

      const effective = buildEffectiveEvidenceStateV1(null, input, createDefaults);
      const created = await tx.fsdDiscoverySignalEvidence.create({
        data: {
          runId: input.runId,
          stageId: effective.stageId,
          stageType: input.stageType,
          signalName: input.signalName,
          evidenceState: effective.evidenceState,
          declaredByProvider: effective.declaredByProvider,
          schemaShape: effective.schemaShape,
          queryPlanned: effective.queryPlanned,
          queryAccepted: effective.queryAccepted,
          observedValue: effective.observedValue,
          provenanceJson: effective.provenanceJson as Prisma.InputJsonValue,
          qualityJson: effective.qualityJson as Prisma.InputJsonValue,
        },
      });
      return { evidenceId: created.id, created: true, noOp: false };
    });
  }

  async supersedeActiveRunsForSourceLink(input: {
    scope: FsdDiscoveryRunScopeV1;
    supersededByRunId: string;
    reason: string;
  }): Promise<number> {
    return this.withSourceLinkLock(input.scope, async (tx) => {
      const successor = await tx.fsdDiscoveryRun.findFirst({
        where: {
          id: input.supersededByRunId,
          organizationId: input.scope.organizationId,
          vehicleId: input.scope.vehicleId,
          providerSourceLinkId: input.scope.providerSourceLinkId,
          invalidatedAt: null,
          status: { in: [...FSD_DISCOVERY_RUN_EXECUTABLE_STATUSES] },
        },
      });
      if (!successor) {
        throw new FsdDiscoveryPersistenceError(
          'RUN_NOT_FOUND',
          'Successor run missing or not executable in scope',
        );
      }
      const result = await tx.fsdDiscoveryRun.updateMany({
        where: {
          organizationId: input.scope.organizationId,
          vehicleId: input.scope.vehicleId,
          providerSourceLinkId: input.scope.providerSourceLinkId,
          invalidatedAt: null,
          status: { in: [...FSD_DISCOVERY_RUN_EXECUTABLE_STATUSES] },
          id: { not: input.supersededByRunId },
        },
        data: {
          status: 'INVALIDATED',
          invalidatedAt: new Date(),
          invalidationReason: input.reason,
          supersededByRunId: input.supersededByRunId,
          version: { increment: 1 },
          leaseOwner: null,
          leaseExpiresAt: null,
        },
      });
      return result.count;
    });
  }

  async claimRunLease(input: {
    scope: FsdDiscoveryRunScopeV1;
    runId: string;
    expectedVersion: number;
    leaseOwner: string;
    leaseExpiresAt: Date;
  }): Promise<boolean> {
    const now = new Date();
    if (input.leaseExpiresAt.getTime() <= now.getTime()) {
      return false;
    }
    return this.withSourceLinkLock(input.scope, async (tx) => {
      const result = await tx.fsdDiscoveryRun.updateMany({
        where: {
          id: input.runId,
          organizationId: input.scope.organizationId,
          vehicleId: input.scope.vehicleId,
          providerSourceLinkId: input.scope.providerSourceLinkId,
          version: input.expectedVersion,
          invalidatedAt: null,
          status: { in: [...FSD_DISCOVERY_RUN_EXECUTABLE_STATUSES] },
          OR: [
            { leaseExpiresAt: null },
            { leaseExpiresAt: { lt: now } },
            { leaseOwner: input.leaseOwner, leaseExpiresAt: { gt: now } },
          ],
        },
        data: {
          leaseOwner: input.leaseOwner,
          leaseExpiresAt: input.leaseExpiresAt,
          version: { increment: 1 },
        },
      });
      return result.count === 1;
    });
  }

  async assertActiveSourceLinkForDispatch(scope: FsdDiscoveryRunScopeV1): Promise<void> {
    await this.withSourceLinkLock(scope, async (tx) => {
      const link = await tx.vehicleDataSourceLink.findFirst({
        where: {
          id: scope.providerSourceLinkId,
          vehicle: { organizationId: scope.organizationId, id: scope.vehicleId },
        },
      });
      if (!link?.isActive) {
        throw new FsdDiscoveryPersistenceError('SOURCE_LINK_INVALID', 'Source link inactive or missing');
      }
    });
  }

  async loadRunOrchestrationBundle(input: {
    scope: FsdDiscoveryRunScopeV1;
    runId: string;
  }): Promise<FsdDiscoveryRunOrchestrationBundleV1 | null> {
    const run = await this.prisma.fsdDiscoveryRun.findFirst({
      where: {
        id: input.runId,
        organizationId: input.scope.organizationId,
        vehicleId: input.scope.vehicleId,
        providerSourceLinkId: input.scope.providerSourceLinkId,
      },
      include: { stages: true },
    });
    if (!run) {
      return null;
    }
    return {
      run: {
        id: run.id,
        status: run.status,
        version: run.version,
        leaseOwner: run.leaseOwner,
        leaseExpiresAt: run.leaseExpiresAt,
      },
      stages: run.stages.map((s) => ({
        stageType: s.stageType,
        id: s.id,
        status: s.status,
        version: s.version,
        planFingerprint: s.planFingerprint ?? '',
        checkpointJson: s.checkpointJson,
      })),
    };
  }

  async summarizeRunEvidenceForOrchestration(runId: string): Promise<{
    catalogSignalCount: number;
    observedSignalCount: number;
    deferredSignalCount: number;
    rejectedDocumentEvidenceCount: number;
  }> {
    const catalogSignalCount = await this.prisma.fsdDiscoverySignalEvidence.count({
      where: {
        runId,
        stageType: 'CATALOG',
        signalName: { not: { startsWith: '__fsd3_' } },
      },
    });
    const observedSignalCount = await this.prisma.fsdDiscoverySignalEvidence.count({
      where: { runId, stageType: 'SNAPSHOT', observedValue: true },
    });
    const deferredSignalCount = await this.prisma.fsdDiscoverySignalEvidence.count({
      where: { runId, stageType: 'SNAPSHOT', evidenceState: 'DEFERRED' },
    });
    const rejectedDocumentEvidenceCount = await this.prisma.fsdDiscoverySignalEvidence.count({
      where: {
        runId,
        stageType: 'SNAPSHOT',
        signalName: { startsWith: '__fsd3_rejected_document__:' },
      },
    });
    return {
      catalogSignalCount,
      observedSignalCount,
      deferredSignalCount,
      rejectedDocumentEvidenceCount,
    };
  }

  async mutateCatalogStageCheckpoint(input: {
    auth: FsdDiscoveryWriteAuthorizationV1;
    expectedStageVersion: number;
    planFingerprint: string;
    budgetTotal: number;
    mutate: (checkpoint: Fsd3CatalogStageCheckpointV1) => Fsd3CatalogStageCheckpointV1;
  }): Promise<{ applied: boolean; stageVersion: number; checkpoint: Fsd3CatalogStageCheckpointV1 | null }> {
    return this.withSourceLinkLock(input.auth, async (tx) => {
      await this.fenceRunnableRun(tx, input.auth);
      const stage = await tx.fsdDiscoveryStage.findUnique({
        where: {
          runId_stageType: { runId: input.auth.runId, stageType: 'CATALOG' },
        },
      });
      if (!stage || stage.planFingerprint !== input.planFingerprint) {
        throw new FsdDiscoveryPersistenceError('STAGE_NOT_FOUND', 'Catalog stage missing or plan mismatch');
      }
      if (isFsdDiscoveryStageTerminal(stage.status) && stage.status !== 'SUCCEEDED') {
        throw new FsdDiscoveryPersistenceError('STAGE_IMMUTABLE', 'Catalog stage terminal');
      }
      const parsed =
        parseFsd3CatalogStageCheckpoint(stage.checkpointJson) ??
        ({
          requestLedger: createEmptyFsd3RequestLedger(input.budgetTotal),
        } satisfies Fsd3CatalogStageCheckpointV1);
      const nextCheckpoint = input.mutate(parsed);
      const result = await tx.fsdDiscoveryStage.updateMany({
        where: {
          runId: input.auth.runId,
          stageType: 'CATALOG',
          version: input.expectedStageVersion,
          planFingerprint: input.planFingerprint,
          status: stage.status === 'SUCCEEDED' ? 'SUCCEEDED' : { in: ['PLANNED', 'IN_PROGRESS'] },
        },
        data: {
          checkpointJson: catalogCheckpointToJson(nextCheckpoint),
          version: { increment: 1 },
        },
      });
      if (result.count !== 1) {
        return { applied: false, stageVersion: stage.version, checkpoint: parsed };
      }
      return {
        applied: true,
        stageVersion: input.expectedStageVersion + 1,
        checkpoint: nextCheckpoint,
      };
    });
  }
}
