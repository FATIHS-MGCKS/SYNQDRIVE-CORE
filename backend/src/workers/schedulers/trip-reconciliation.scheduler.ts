import { Injectable, Logger, Optional } from '@nestjs/common';
import { Cron, Interval } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@shared/database/prisma.service';
import { TripReconciliationService } from '../../modules/vehicle-intelligence/trips/reconciliation/trip-reconciliation.service';
import {
  applyFastReconciliationVehicleCap,
  buildFastReconciliationWhere,
  loadFastReconciliationCohortConfig,
} from './snapshot-polling/fast-reconciliation-cohort';
import { SchedulerLeaderGuardService } from '@shared/scheduler-leader/scheduler-leader-guard.service';
import {
  DEFAULT_RECOVERY_GLOBAL_MAX_PER_PASS,
  readTripDiBoundaryAdmissionRecoveryPolicyFromEnv,
} from '../../modules/vehicle-intelligence/trips/di-boundary-admission/trip-di-boundary-admission-recovery.policy';
import { TripDiBoundaryAdmissionRecoveryFleetBudget } from '../../modules/vehicle-intelligence/trips/di-boundary-admission/trip-di-boundary-admission-recovery.fleet-budget';

/**
 * TripReconciliationScheduler
 *
 * Tiered periodic reconciliation jobs. Replaces reliance on the manual
 * "Sync Trips" button as a primary operational safeguard.
 *
 * TIER STRATEGY:
 *  - Fast  (15 min):  last 45 minutes, only recently-active vehicles
 *  - Warm  (4 hours): last 12 hours, all vehicles with DIMO tokens
 *  - Cold  (daily):   last 7 days, all vehicles — comprehensive safety net
 */
@Injectable()
export class TripReconciliationScheduler {
  private readonly logger = new Logger(TripReconciliationScheduler.name);
  private readonly fastCohortConfig = loadFastReconciliationCohortConfig();

  constructor(
    private readonly prisma: PrismaService,
    private readonly reconciliation: TripReconciliationService,
    private readonly leaderGuard: SchedulerLeaderGuardService,
    @Optional() private readonly configService?: ConfigService,
  ) {}

  @Interval(30 * 60_000)
  async admissionRecoveryFleetPass(): Promise<void> {
    if (!this.leaderGuard.shouldRun('trip_di_boundary_admission_recovery_fleet')) return;
    const policy = readTripDiBoundaryAdmissionRecoveryPolicyFromEnv();
    if (policy.recoveryActivationHorizonUtc == null) return;
    try {
      const result = await this.reconciliation.runDurableAdmissionRecoveryFleetPass();
      if (result.vehiclesScanned > 0 || result.released > 0) {
        this.logger.log(
          `DI boundary admission recovery fleet pass: eligible=${result.vehiclesEligible} scanned=${result.vehiclesScanned} released=${result.released} writerAttempts=${result.writerAttempts} durationMs=${result.durationMs}`,
        );
      }
    } catch (err: unknown) {
      this.logger.warn(
        `DI boundary admission recovery fleet pass failed: ${(err as Error).message}`,
      );
    }
  }

  // ─── FAST REPAIR (every 15 minutes) ───────────────────────────────────────

  @Interval(15 * 60_000)
  async fastRepair(): Promise<void> {
    if (!this.leaderGuard.shouldRun('trip_reconciliation_fast')) return;
    const to = new Date();
    const from = new Date(to.getTime() - 45 * 60_000);

    const recencyMs =
      this.configService?.get<number>('worker.fastReconciliationRecencyMs') ??
      this.fastCohortConfig.recencyMs;
    const maxVehiclesPerRun =
      this.configService?.get<number>('worker.fastReconciliationMaxVehiclesPerRun') ??
      this.fastCohortConfig.maxVehiclesPerRun;

    const recencyThreshold = new Date(to.getTime() - recencyMs);
    const recentActive = await this.prisma.vehicleLatestState.findMany({
      where: buildFastReconciliationWhere(recencyThreshold),
      select: { vehicleId: true, lastSeenAt: true },
      orderBy: { lastSeenAt: 'desc' },
    });

    const vehicleIds = applyFastReconciliationVehicleCap(
      recentActive.map((r) => r.vehicleId),
      maxVehiclesPerRun,
    );

    if (vehicleIds.length < recentActive.length) {
      this.logger.debug(
        `Fast repair cohort capped: selected=${vehicleIds.length} eligible=${recentActive.length}`,
      );
    }

    const recoveryPolicy = readTripDiBoundaryAdmissionRecoveryPolicyFromEnv();
    const recoveryFleetBudget = new TripDiBoundaryAdmissionRecoveryFleetBudget(
      recoveryPolicy.globalMaxPerPass,
    );

    for (const vehicleId of vehicleIds) {
      try {
        const result = await this.reconciliation.reconcileWindow(
          vehicleId,
          from,
          to,
          'fast',
          { useDimoSegmentFallback: true, recoveryFleetBudget },
        );
        if (result.repairsApplied > 0 || result.repairsProposed > 0) {
          this.logger.log(
            `Fast repair [${vehicleId}]: proposed=${result.repairsProposed} applied=${result.repairsApplied}`,
          );
        }
      } catch (err: unknown) {
        this.logger.warn(`Fast repair failed for ${vehicleId}: ${(err as Error).message}`);
      }
    }
  }

  // ─── WARM REPAIR (every 4 hours) ──────────────────────────────────────────

  @Interval(4 * 3600_000)
  async warmRepair(): Promise<void> {
    if (!this.leaderGuard.shouldRun('trip_reconciliation_warm')) return;
    this.logger.log('Warm reconciliation starting…');
    const to = new Date();
    const from = new Date(to.getTime() - 12 * 3600_000);

    const vehicles = await this.getVehiclesWithDimoTokens();
    let repaired = 0;
    const recoveryFleetBudget = new TripDiBoundaryAdmissionRecoveryFleetBudget(
      readTripDiBoundaryAdmissionRecoveryPolicyFromEnv().globalMaxPerPass ??
        DEFAULT_RECOVERY_GLOBAL_MAX_PER_PASS,
    );

    for (const vehicleId of vehicles) {
      try {
        const result = await this.reconciliation.reconcileWindow(
          vehicleId,
          from,
          to,
          'warm',
          { useDimoSegmentFallback: true, recoveryFleetBudget },
        );
        repaired += result.repairsApplied;
      } catch (err: unknown) {
        this.logger.warn(`Warm repair failed for ${vehicleId}: ${(err as Error).message}`);
      }
    }

    this.logger.log(`Warm reconciliation complete — ${repaired} trip(s) repaired across ${vehicles.length} vehicles.`);
  }

  // ─── COLD REPAIR (daily at 03:00) ─────────────────────────────────────────

  @Cron('0 3 * * *')
  async coldRepair(): Promise<void> {
    if (!this.leaderGuard.shouldRun('trip_reconciliation_cold')) return;
    this.logger.log('Cold reconciliation starting…');
    const to = new Date();
    const from = new Date(to.getTime() - 7 * 24 * 3600_000);

    const vehicles = await this.getVehiclesWithDimoTokens();
    let repaired = 0;
    const recoveryFleetBudget = new TripDiBoundaryAdmissionRecoveryFleetBudget(
      readTripDiBoundaryAdmissionRecoveryPolicyFromEnv().globalMaxPerPass ??
        DEFAULT_RECOVERY_GLOBAL_MAX_PER_PASS,
    );

    for (const vehicleId of vehicles) {
      try {
        const result = await this.reconciliation.reconcileWindow(
          vehicleId,
          from,
          to,
          'cold',
          { useDimoSegmentFallback: true, recoveryFleetBudget },
        );
        repaired += result.repairsApplied;
      } catch (err: unknown) {
        this.logger.warn(`Cold repair failed for ${vehicleId}: ${(err as Error).message}`);
      }
    }

    this.logger.log(`Cold reconciliation complete — ${repaired} trip(s) repaired across ${vehicles.length} vehicles.`);
  }

  // ─── HELPERS ──────────────────────────────────────────────────────────────

  private async getVehiclesWithDimoTokens(): Promise<string[]> {
    const rows = await this.prisma.vehicleLatestState.findMany({
      where: { dimoTokenId: { not: null } },
      select: { vehicleId: true },
    });
    return rows.map((r) => r.vehicleId);
  }
}
