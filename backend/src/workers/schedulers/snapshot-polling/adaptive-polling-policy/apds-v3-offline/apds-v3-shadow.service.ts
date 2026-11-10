import { Injectable, Logger, Optional } from '@nestjs/common';
import { DimoPollStatus } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { evaluateApdsV3OfflinePolicy } from './apds-v3-offline-policy.evaluator';
import { validateCausalEvidenceAtDecision } from './apds-v3-causal-evidence.v1';
import { evaluateConsumerDemandGate } from './consumer-demand-gate.v1';
import {
  APDS_V3_SHADOW_ACTIVATION_VERSION,
  apdsV3ShadowMaxWritesPerMinute,
  isApdsV3ShadowRuntimeReady,
} from './apds-v3-shadow.config';
import { ApdsV3ShadowEligibilityService } from './apds-v3-shadow-eligibility.service';
import {
  mapApdsV3ShadowPollStartToOfflineInput,
  resolveBaselinePartialParitySnapshot,
  type ApdsV3ShadowPollStartContext,
} from './apds-v3-shadow-input.mapper';
import { ApdsV3ShadowRepository } from './apds-v3-shadow.repository';
import { ApdsV3ShadowMetricsService } from './apds-v3-shadow-metrics.service';
import { buildP25ApdProfileLvLoaderWhere } from '../p25-apd-profile-lv-loader';

export function buildApdsV3ShadowPhysicalRequestId(input: {
  organizationId: string;
  vehicleId: string;
  pollStartedAtMs: number;
  realPollId?: string | null;
}): string {
  if (input.realPollId) return input.realPollId;
  return `v3-phys:${input.organizationId}:${input.vehicleId}:${input.pollStartedAtMs}`;
}

@Injectable()
export class ApdsV3ShadowService {
  private readonly logger = new Logger(ApdsV3ShadowService.name);
  private readonly writeTimestampsMs: number[] = [];

  constructor(
    private readonly prisma: PrismaService,
    private readonly eligibility: ApdsV3ShadowEligibilityService,
    private readonly repository: ApdsV3ShadowRepository,
    @Optional() private readonly metrics?: ApdsV3ShadowMetricsService,
  ) {}

  isRuntimeReady(): boolean {
    return isApdsV3ShadowRuntimeReady();
  }

  private underWriteBudget(nowMs: number): boolean {
    const windowMs = 60_000;
    const cap = apdsV3ShadowMaxWritesPerMinute();
    while (this.writeTimestampsMs.length && this.writeTimestampsMs[0]! < nowMs - windowMs) {
      this.writeTimestampsMs.shift();
    }
    return this.writeTimestampsMs.length < cap;
  }

  private recordWrite(nowMs: number): void {
    this.writeTimestampsMs.push(nowMs);
  }

  private async loadRecentLvProviderTimestampsMs(
    vehicleId: string,
    decisionAtMs: number,
  ): Promise<number[]> {
    const rows = await this.prisma.batteryMeasurement.findMany({
      where: buildP25ApdProfileLvLoaderWhere(vehicleId, decisionAtMs),
      orderBy: { providerTimestamp: 'desc' },
      take: 24,
      select: { providerTimestamp: true },
    });
    return rows
      .map((r) => r.providerTimestamp?.getTime())
      .filter((t): t is number => t != null)
      .sort((a, b) => a - b);
  }

  private async resolveLastSuccessfulSnapshotPollMs(
    vehicleId: string,
    beforeMs: number,
  ): Promise<number | null> {
    const row = await this.prisma.dimoPollLog.findFirst({
      where: {
        vehicleId,
        status: DimoPollStatus.SUCCESS,
        startedAt: { lt: new Date(beforeMs) },
      },
      orderBy: { startedAt: 'desc' },
      select: { startedAt: true },
    });
    return row?.startedAt?.getTime() ?? null;
  }

  /**
   * Observe-only: runs P1B0 offline evaluator at baseline poll start. Never blocks DIMO fetch.
   */
  async observeActualBaselinePollStart(
    ctx: Omit<ApdsV3ShadowPollStartContext, 'providerSourceLinkId' | 'vehicleFuelType'> & {
      realPollId?: string | null;
      vehicleFuelType?: string | null;
    },
  ): Promise<void> {
    if (!this.isRuntimeReady()) return;

    const nowMs = ctx.pollStartedAtMs;
    if (!this.underWriteBudget(nowMs)) {
      this.metrics?.recordWriteSuppressed('RATE_LIMIT');
      return;
    }

    let eligible;
    try {
      eligible = await this.eligibility.resolveForVehicle(
        ctx.organizationId,
        ctx.vehicleId,
      );
    } catch (err) {
      this.logger.warn(
        `APDS V3 shadow eligibility failed (non-blocking): ${err instanceof Error ? err.message : err}`,
      );
      return;
    }

    if (!eligible.eligible) {
      this.metrics?.recordEligibilityBlocked(eligible.reason);
      return;
    }

    if (eligible.organizationId !== ctx.organizationId) {
      this.metrics?.recordEligibilityBlocked('TENANT_ISOLATION_VIOLATION');
      return;
    }

    try {
      const [lastPhysicalPollMs, lvTimestamps, vehicleFuel] = await Promise.all([
        this.resolveLastSuccessfulSnapshotPollMs(ctx.vehicleId, ctx.pollStartedAtMs),
        this.loadRecentLvProviderTimestampsMs(ctx.vehicleId, ctx.pollStartedAtMs),
        ctx.vehicleFuelType == null
          ? this.prisma.vehicle.findUnique({
              where: { id: ctx.vehicleId },
              select: { fuelType: true },
            })
          : Promise.resolve({ fuelType: ctx.vehicleFuelType }),
      ]);
      const mapped = mapApdsV3ShadowPollStartToOfflineInput({
        ...ctx,
        providerSourceLinkId: eligible.providerSourceLinkId,
        lvProviderTimestampsMs: lvTimestamps,
        vehicleFuelType:
          ctx.vehicleFuelType ?? vehicleFuel?.fuelType ?? null,
      });
      mapped.input.lastPhysicalPollMs = lastPhysicalPollMs;

      const causal = validateCausalEvidenceAtDecision(mapped.input);
      const gate = evaluateConsumerDemandGate(mapped.input.consumerDemandRevision, {
        decisionAtMs: mapped.input.decisionAtMs,
        strictLvProviderSourceMs: mapped.input.lastLvProviderSourceMs,
        topLevelProviderSourceMs: mapped.input.lastTopLevelProviderSourceMs,
        tripFsmState: mapped.input.tripFsmState,
      });

      let v3 = evaluateApdsV3OfflinePolicy(mapped.input);
      if (!causal.ok) {
        v3 = {
          policyVersion: v3.policyVersion,
          decision: causal.kind,
          reason: causal.reason,
          expectedInformationGain: null,
          heuristic: false,
          hardSafetyTriggered: false,
        };
      }

      const baseline = resolveBaselinePartialParitySnapshot(mapped.input);
      const physicalRequestId = buildApdsV3ShadowPhysicalRequestId({
        organizationId: ctx.organizationId,
        vehicleId: ctx.vehicleId,
        pollStartedAtMs: ctx.pollStartedAtMs,
        realPollId: ctx.realPollId,
      });

      await this.repository.upsertPollStartDecision({
        organizationId: ctx.organizationId,
        vehicleId: ctx.vehicleId,
        providerSourceLinkId: eligible.providerSourceLinkId,
        physicalRequestId,
        decisionAt: new Date(ctx.pollStartedAtMs),
        activationVersion: APDS_V3_SHADOW_ACTIVATION_VERSION,
        policyVersion: ApdsV3ShadowRepository.defaultPolicyVersion(),
        baselineCanonicalDue: baseline.baselineCanonicalDue,
        baselineAuthority: baseline.baselineAuthority,
        baselineAssessable: baseline.baselineAssessable,
        v3Decision: v3.decision,
        v3Reason: v3.reason,
        expectedInformationGain: v3.expectedInformationGain,
        informationGainHeuristic: v3.heuristic,
        consumerDemandFailClosed: gate.blocksAuthoritativeSafeSkip,
        observationQuality: causal.ok ? causal.observationQuality : null,
        observationScope: 'BASELINE_PHYSICAL_POLL_START_ONLY',
      });

      this.recordWrite(nowMs);
      this.metrics?.recordDecision(v3.decision);
    } catch (err) {
      this.logger.warn(
        `APDS V3 shadow evaluate/persist failed (non-blocking): ${err instanceof Error ? err.message : err}`,
      );
    }
  }
}
