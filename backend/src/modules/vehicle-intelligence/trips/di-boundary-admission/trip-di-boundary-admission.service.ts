import { Injectable, Logger, Optional } from '@nestjs/common';
import { TripMetricsService } from '@modules/observability/trip-metrics.service';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import {
  buildTripDiBoundaryAdmissionPatch,
  buildTripDiBoundaryRevisionKey,
  canReleaseTripDiBoundaryAdmission,
  readTripDiBoundaryAdmissionV1,
  type TripDiBoundaryAdmissionScope,
  type TripDiBoundaryAdmissionV1,
} from './trip-di-boundary-admission';
import {
  evaluateLiveFsmSplitAdmissionEligibility,
  listLiveFsmSplitAdmissionCandidateTripIdsInReconciliationWindow,
  resolveVerifiedLiveFsmSplitSettlementTripIds,
  type LiveFsmSplitAdmissionEligibility,
} from './trip-di-boundary-admission-live-fsm-split.util';
import {
  isAutomaticLiveFsmAdmissionCohort,
  LIVE_FSM_AUTO_RECONCILIATION_MAX_TRIPS_PER_VEHICLE,
  readLiveFsmAutomaticAdmissionPolicyFromEnv,
} from './trip-di-boundary-admission-live-fsm-auto.policy';
import {
  committedBoundaryRepairMatchesTripRow,
  hasCommittedPartialTripBoundaryExtension,
  partialExtensionAllowsAdmissionDuringRetryableRefresh,
} from '../boundary-repair.state.util';
import {
  computeTripDiBoundaryAdmissionRecoveryEligibleFrom,
  isTripDiBoundaryAdmissionRecoveryEnabled,
  readTripDiBoundaryAdmissionRecoveryPolicyFromEnv,
  type TripDiBoundaryAdmissionRecoveryPolicy,
} from './trip-di-boundary-admission-recovery.policy';
import {
  evaluateTripDiBoundaryAdmissionRecoveryVehicleEligibilityV1,
  type TripDiBoundaryAdmissionRecoveryVehicleContextV1,
} from './trip-di-boundary-admission-recovery.eligibility.v1';
import {
  loadTripDiBoundaryAdmissionRecoveryDs4FleetMotionPolicyFromEnv,
  loadTripDiBoundaryAdmissionRecoveryVehicleContextV1,
  listTripDiBoundaryAdmissionRecoveryFleetVehiclesV1,
  readDiV0S4KillEvaluationForRecovery,
} from './trip-di-boundary-admission-recovery.fleet-cohort.v1';
import type { DiV0Ds4FleetMotionAdmissionPolicySnapshotV1 } from '../../driving-intelligence/fleet-motion-admission/di-v0-ds4-fleet-motion-admission-policy.v1';
import type { DiV0S4KillEvaluation } from '../../driving-intelligence/s4a-foundation/di-v0-s4a-control-plane';
import { TripDiBoundaryAdmissionRecoveryFleetBudget } from './trip-di-boundary-admission-recovery.fleet-budget';
import {
  classifyTripDiBoundaryAdmissionRecoveryCandidate,
  computeMissingAdmissionScanCap,
  listKeysetRecoveryCandidateTripIds,
  listMissingAdmissionRecoveryCandidateTripIds,
} from './trip-di-boundary-admission-recovery.util';
import {
  readTripDiBoundaryAdmissionRecoveryScanCursor,
  writeTripDiBoundaryAdmissionRecoveryScanCursor,
  type TripDiBoundaryAdmissionRecoveryScanCursor,
} from './trip-di-boundary-admission-recovery.cursor';
import {
  getTripDiBoundaryAdmissionRecoveryMetrics,
  type TripDiBoundaryAdmissionRecoveryMetricsHandles,
} from './trip-di-boundary-admission-recovery.metrics';

export type TryReleaseAfterPartialTripBoundaryExtensionResult =
  | { released: true }
  | {
      released: false;
      reason:
        | 'TRIP_NOT_FOUND'
        | 'VEHICLE_MISMATCH'
        | 'BOUNDARY_REPAIR_NOT_COMMITTED'
        | 'BOUNDARY_ROW_MISMATCH'
        | 'REFRESH_GENERATION_MISMATCH'
        | 'RELEASE_GUARDS';
    };

@Injectable()
export class TripDiBoundaryAdmissionService {
  private readonly logger = new Logger(TripDiBoundaryAdmissionService.name);
  private recoveryMetricsHandles: TripDiBoundaryAdmissionRecoveryMetricsHandles | null = null;

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly tripMetrics?: TripMetricsService,
  ) {}

  /** Authoritative Prometheus registry (same as GET /api/v1/metrics). */
  private recoveryMetrics(): TripDiBoundaryAdmissionRecoveryMetricsHandles {
    if (this.recoveryMetricsHandles == null) {
      const registry = this.tripMetrics?.registry;
      if (registry == null) {
        throw new Error(
          'TripDiBoundaryAdmissionService recovery metrics require TripMetricsService.registry',
        );
      }
      this.recoveryMetricsHandles = getTripDiBoundaryAdmissionRecoveryMetrics(registry);
    }
    return this.recoveryMetricsHandles;
  }

  async loadScope(tripId: string): Promise<TripDiBoundaryAdmissionScope | null> {
    const rows = await this.prisma.$queryRaw<
      Array<{
        organization_id: string;
        vehicle_id: string;
        trip_id: string;
        trip_status: string;
        start_time: Date;
        end_time: Date | null;
        dimo_segment_id: string | null;
        merge_parent_trip_id: string | null;
        raw_detection_meta: unknown;
        detection_state: string | null;
        active_trip_id: string | null;
        proposed_repairs: bigint;
      }>
    >`
      SELECT v.organization_id, t.vehicle_id, t.id AS trip_id, t.trip_status::text AS trip_status,
             t.start_time AT TIME ZONE 'UTC' AS start_time, t.end_time AT TIME ZONE 'UTC' AS end_time,
             t.dimo_segment_id, t.merge_parent_trip_id, t.raw_detection_meta,
             d.state::text AS detection_state, d.active_trip_id::text AS active_trip_id,
             (SELECT count(*)::bigint FROM trip_repairs r
              WHERE r.trip_id = t.id AND r.status = 'PROPOSED') AS proposed_repairs
      FROM vehicle_trips t
      JOIN vehicles v ON v.id = t.vehicle_id
      LEFT JOIN vehicle_trip_detection_states d ON d.vehicle_id = t.vehicle_id
      WHERE t.id = ${tripId}
      LIMIT 1`;
    const row = rows[0];
    if (!row) return null;
    return this.rowToScope(row);
  }

  /**
   * After RESTING finalization: admit only the finalized trip and its verified LIVE_FSM split pair.
   */
  async releaseLiveFsmSplitSegmentsAfterFinalization(
    organizationId: string,
    vehicleId: string,
    finalizedTripId: string,
  ): Promise<{ released: number; skipped: number; tripIds: string[] }> {
    const policy = readLiveFsmAutomaticAdmissionPolicyFromEnv();
    if (
      !isAutomaticLiveFsmAdmissionCohort(policy, {
        organizationId,
        vehicleId,
        vehicleOrganizationId: organizationId,
      })
    ) {
      return { released: 0, skipped: 0, tripIds: [] };
    }
    const tripIds = await resolveVerifiedLiveFsmSplitSettlementTripIds(this.prisma, finalizedTripId);
    return this.releaseLiveFsmSettlementTripIds(tripIds);
  }

  /**
   * After reconciliation: bounded window + explicit activation horizon; S4 allowlisted cohort only.
   */
  async releaseLiveFsmSplitSegmentsInReconciliationWindow(
    organizationId: string,
    vehicleId: string,
    windowFrom: Date,
    windowTo: Date,
  ): Promise<{ released: number; skipped: number; tripIds: string[] }> {
    const policy = readLiveFsmAutomaticAdmissionPolicyFromEnv();
    if (
      !isAutomaticLiveFsmAdmissionCohort(policy, {
        organizationId,
        vehicleId,
        vehicleOrganizationId: organizationId,
      })
    ) {
      return { released: 0, skipped: 0, tripIds: [] };
    }
    const horizon = policy.reconciliationActivationHorizonUtc;
    if (horizon == null) {
      return { released: 0, skipped: 0, tripIds: [] };
    }
    const tripIds = await listLiveFsmSplitAdmissionCandidateTripIdsInReconciliationWindow(
      this.prisma,
      vehicleId,
      windowFrom,
      windowTo,
      horizon,
      LIVE_FSM_AUTO_RECONCILIATION_MAX_TRIPS_PER_VEHICLE,
    );
    return this.releaseLiveFsmSettlementTripIds(tripIds);
  }

  private async releaseLiveFsmSettlementTripIds(
    tripIds: readonly string[],
  ): Promise<{ released: number; skipped: number; tripIds: string[] }> {
    let released = 0;
    let skipped = 0;
    const unique = [...new Set(tripIds)];
    for (const tripId of unique) {
      try {
        const ok = await this.tryReleaseForTripTransactional(tripId, 'LIVE_FSM_SETTLEMENT');
        if (ok) released += 1;
        else skipped += 1;
      } catch (err) {
        skipped += 1;
        this.logger.warn(
          `DI boundary admission LIVE_FSM settlement release failed trip=${tripId}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    return { released, skipped, tripIds: unique };
  }

  evaluateLiveFsmSplitAdmissionEligibility(
    tripId: string,
    expectedVehicleId: string,
  ): Promise<LiveFsmSplitAdmissionEligibility> {
    return evaluateLiveFsmSplitAdmissionEligibility(this.prisma, tripId, expectedVehicleId);
  }

  /**
   * Ops recovery: release admission for exactly one trip after canonical LIVE_FSM split eligibility checks.
   * Still uses tryReleaseForTripTransactional (FSM / repair guards).
   */
  async tryReleaseLiveFsmSplitTripScoped(
    tripId: string,
    expectedVehicleId: string,
  ): Promise<{ ok: boolean; eligibility: LiveFsmSplitAdmissionEligibility }> {
    const eligibility = await this.evaluateLiveFsmSplitAdmissionEligibility(tripId, expectedVehicleId);
    if (!eligibility.eligible) {
      return { ok: false, eligibility };
    }
    const ok = await this.tryReleaseForTripTransactional(tripId, 'LIVE_FSM_SETTLEMENT');
    return { ok, eligibility };
  }

  /**
   * After successful PARTIAL_TRIP_BOUNDARY_EXTENSION on the trip row (post-repair transaction).
   * Idempotent via tryReleaseForTripTransactional; does not enqueue S4 work items.
   */
  async tryReleaseAfterPartialTripBoundaryExtension(
    tripId: string,
    expectedVehicleId: string,
  ): Promise<TryReleaseAfterPartialTripBoundaryExtensionResult> {
    const scope = await this.loadScope(tripId);
    if (!scope) return { released: false, reason: 'TRIP_NOT_FOUND' };
    if (scope.vehicleId !== expectedVehicleId) {
      return { released: false, reason: 'VEHICLE_MISMATCH' };
    }
    if (!hasCommittedPartialTripBoundaryExtension(scope.rawDetectionMeta)) {
      return { released: false, reason: 'BOUNDARY_REPAIR_NOT_COMMITTED' };
    }
    if (
      !committedBoundaryRepairMatchesTripRow(
        scope.rawDetectionMeta,
        scope.startTime,
        scope.endTime,
      )
    ) {
      return { released: false, reason: 'BOUNDARY_ROW_MISMATCH' };
    }
    if (!partialExtensionAllowsAdmissionDuringRetryableRefresh(scope.rawDetectionMeta)) {
      return { released: false, reason: 'REFRESH_GENERATION_MISMATCH' };
    }
    const ok = await this.tryReleaseForTripTransactional(tripId, 'RECONCILIATION');
    return ok ? { released: true } : { released: false, reason: 'RELEASE_GUARDS' };
  }

  /**
   * Bounded durable recovery fallback: idempotent admission for eligible COMPLETED trips when direct hooks fail.
   * Defaults OFF until TRIP_DI_BOUNDARY_ADMISSION_RECOVERY_ACTIVATED_AT_UTC is set; writer defaults OFF (shadow observe).
   */
  async runDurableAdmissionRecoveryPass(
    organizationId: string,
    vehicleId: string,
    options?: {
      now?: Date;
      policy?: TripDiBoundaryAdmissionRecoveryPolicy;
      fleetBudget?: TripDiBoundaryAdmissionRecoveryFleetBudget;
      fleetPolicy?: DiV0Ds4FleetMotionAdmissionPolicySnapshotV1;
      ds4FleetMotionPolicy?: DiV0Ds4FleetMotionAdmissionPolicySnapshotV1;
      kill?: DiV0S4KillEvaluation;
      vehicleContext?: TripDiBoundaryAdmissionRecoveryVehicleContextV1;
    },
  ): Promise<{
    mode: 'DISABLED' | 'SHADOW' | 'WRITER';
    scanOutcome:
      | 'disabled'
      | 'none_in_window'
      | 'zero_unadmitted_in_batch'
      | 'cap_truncated'
      | 'unadmitted_observed';
    scanned: number;
    needsRelease: number;
    released: number;
    skipped: number;
    guarded: number;
    alreadyCurrent: number;
    capTruncated: boolean;
    durationMs: number;
  }> {
    const emptyDisabled = (durationMs: number) => ({
      mode: 'DISABLED' as const,
      scanOutcome: 'disabled' as const,
      scanned: 0,
      needsRelease: 0,
      released: 0,
      skipped: 0,
      guarded: 0,
      alreadyCurrent: 0,
      capTruncated: false,
      durationMs,
    });
    const startedMs = Date.now();
    const now = options?.now ?? new Date();
    const policy = options?.policy ?? readTripDiBoundaryAdmissionRecoveryPolicyFromEnv();
    const metrics = this.recoveryMetrics();

    const setGaugeOutcome = (
      outcome: 'none_in_window' | 'zero_unadmitted_in_batch' | 'cap_truncated' | 'unadmitted_observed',
      ageSec: number,
    ) => {
      if (!writerActive) return;
      for (const label of [
        'none_in_window',
        'zero_unadmitted_in_batch',
        'cap_truncated',
        'unadmitted_observed',
      ] as const) {
        metrics.oldestUnadmittedEligibleAgeSeconds.set(
          { outcome: label, vehicle_id: vehicleId, coverage: 'batch' },
          label === outcome ? ageSec : 0,
        );
      }
    };

    const persistScanCursor = async (next: TripDiBoundaryAdmissionRecoveryScanCursor | null) => {
      if (!writerActive) return;
      await writeTripDiBoundaryAdmissionRecoveryScanCursor(this.prisma, vehicleId, next);
    };

    if (!isTripDiBoundaryAdmissionRecoveryEnabled(policy)) {
      return emptyDisabled(Date.now() - startedMs);
    }
    const ds4FleetMotionPolicy =
      options?.ds4FleetMotionPolicy ??
      options?.fleetPolicy ??
      loadTripDiBoundaryAdmissionRecoveryDs4FleetMotionPolicyFromEnv();
    const kill = options?.kill ?? (await readDiV0S4KillEvaluationForRecovery(this.prisma));
    const vehicleContext =
      options?.vehicleContext ??
      (await loadTripDiBoundaryAdmissionRecoveryVehicleContextV1(this.prisma, vehicleId));
    if (vehicleContext == null) {
      return emptyDisabled(Date.now() - startedMs);
    }
    if (organizationId !== vehicleContext.organizationId) {
      return emptyDisabled(Date.now() - startedMs);
    }
    const eligibility = evaluateTripDiBoundaryAdmissionRecoveryVehicleEligibilityV1({
      policy,
      ds4FleetMotionPolicy,
      kill,
      vehicle: vehicleContext,
    });
    if (!eligibility.eligible) {
      return emptyDisabled(Date.now() - startedMs);
    }
    if (
      policy.recoveryGlobalAuthorized &&
      !eligibility.s4DiscoveryPipelineAligned &&
      eligibility.s4DiscoveryPipelineFailedTerms.length > 0
    ) {
      this.logger.warn(
        `DI boundary admission recovery S4 discovery pipeline mismatch vehicle=${vehicleId} org=${vehicleContext.organizationId} terms=${eligibility.s4DiscoveryPipelineFailedTerms.join(',')}`,
      );
    }
    const eligibleFrom = computeTripDiBoundaryAdmissionRecoveryEligibleFrom(policy, now);
    if (eligibleFrom == null) {
      return emptyDisabled(Date.now() - startedMs);
    }

    const writerActive = policy.writerEnabled;
    const mode: 'SHADOW' | 'WRITER' = writerActive ? 'WRITER' : 'SHADOW';
    if (!writerActive && !policy.shadowObserveEnabled) {
      return emptyDisabled(Date.now() - startedMs);
    }

    metrics.passTotal.inc({ mode });

    const scanLimit = policy.maxTripsPerVehicle;
    const cursor = await readTripDiBoundaryAdmissionRecoveryScanCursor(this.prisma, vehicleId);
    const missingCap = computeMissingAdmissionScanCap(scanLimit);
    const missingIds = await listMissingAdmissionRecoveryCandidateTripIds(this.prisma, {
      vehicleId,
      eligibleFrom,
      now,
      limit: missingCap,
    });
    const keysetLimit = Math.max(0, scanLimit - missingIds.length);
    const keysetIds =
      keysetLimit > 0
        ? await listKeysetRecoveryCandidateTripIds(this.prisma, {
            vehicleId,
            eligibleFrom,
            now,
            cursor,
            limit: keysetLimit,
          })
        : [];
    const keysetIdSet = new Set(keysetIds);
    const tripIds = [...missingIds, ...keysetIds.filter((id) => !missingIds.includes(id))];

    const capTruncated =
      missingIds.length >= scanLimit ||
      (keysetLimit > 0 && keysetIds.length >= keysetLimit && tripIds.length >= scanLimit);
    if (capTruncated) {
      metrics.scanCapTruncatedTotal.inc();
    }

    if (tripIds.length === 0) {
      setGaugeOutcome('none_in_window', 0);
      await persistScanCursor(null);
      const durationMs = Date.now() - startedMs;
      metrics.passDurationMs.observe({ mode }, durationMs);
      return {
        mode,
        scanOutcome: 'none_in_window',
        scanned: 0,
        needsRelease: 0,
        released: 0,
        skipped: 0,
        guarded: 0,
        alreadyCurrent: 0,
        capTruncated: false,
        durationMs,
      };
    }

    let needsRelease = 0;
    let released = 0;
    let skipped = 0;
    let guarded = 0;
    let alreadyCurrent = 0;
    let oldestUnadmittedAgeSec = 0;
    let lastKeysetScannedScope: TripDiBoundaryAdmissionScope | null = null;

    let writerAttempts = 0;

    for (const tripId of tripIds) {
      metrics.candidatesScannedTotal.inc();
      const scope = await this.loadScope(tripId);
      if (!scope) {
        skipped += 1;
        continue;
      }
      if (keysetIdSet.has(tripId)) {
        lastKeysetScannedScope = scope;
      }
      const outcome = classifyTripDiBoundaryAdmissionRecoveryCandidate(scope);
      if (outcome.kind === 'ALREADY_CURRENT') {
        alreadyCurrent += 1;
        continue;
      }
      if (outcome.kind === 'GUARDED') {
        guarded += 1;
        metrics.guardRejectedTotal.inc({ code: outcome.code });
        if (outcome.code === 'BOUNDARY_REFRESH_IN_FLIGHT') {
          metrics.revisionMismatchObservedTotal.inc();
        }
        continue;
      }

      needsRelease += 1;
      const existing = readTripDiBoundaryAdmissionV1(scope.rawDetectionMeta);
      if (existing != null) {
        metrics.revisionMismatchObservedTotal.inc();
      }
      const endMs = scope.endTime?.getTime() ?? now.getTime();
      const ageSec = Math.max(0, Math.floor((now.getTime() - endMs) / 1000));
      oldestUnadmittedAgeSec = Math.max(oldestUnadmittedAgeSec, ageSec);

      if (!writerActive) {
        this.logger.log(
          `DI boundary admission recovery SHADOW would release trip=${tripId} vehicle=${vehicleId}`,
        );
        continue;
      }

      const canAttemptWriter =
        options?.fleetBudget != null
          ? options.fleetBudget.consume(1) >= 1
          : writerAttempts < policy.globalMaxPerPass;
      if (!canAttemptWriter) {
        break;
      }
      writerAttempts += 1;

      metrics.admissionAttemptsTotal.inc({ mode: 'WRITER' });
      try {
        const scopeBefore = await this.loadScope(tripId);
        const blockBefore = scopeBefore ? canReleaseTripDiBoundaryAdmission(scopeBefore) : 'TRIP_NOT_COMPLETED';
        const ok = await this.tryReleaseForTripTransactional(tripId, 'RECONCILIATION');
        if (ok) {
          released += 1;
          metrics.admissionsSucceededTotal.inc({ mode: 'WRITER' });
        } else {
          skipped += 1;
          metrics.guardRejectedTotal.inc({ code: blockBefore ?? 'TRIP_NOT_COMPLETED' });
        }
      } catch (err) {
        skipped += 1;
        metrics.transientErrorsTotal.inc();
        this.logger.warn(
          `DI boundary admission recovery release failed trip=${tripId}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    if (writerActive && lastKeysetScannedScope?.endTime && lastKeysetScannedScope.tripId) {
      const nextCursor: TripDiBoundaryAdmissionRecoveryScanCursor = {
        endTimeUtc: lastKeysetScannedScope.endTime.toISOString(),
        tripId: lastKeysetScannedScope.tripId,
      };
      if (keysetIds.length < keysetLimit) {
        await persistScanCursor(null);
      } else {
        await persistScanCursor(nextCursor);
      }
    }

    let scanOutcome: 'zero_unadmitted_in_batch' | 'cap_truncated' | 'unadmitted_observed' =
      'zero_unadmitted_in_batch';
    if (needsRelease > 0) {
      scanOutcome = capTruncated ? 'cap_truncated' : 'unadmitted_observed';
    } else if (capTruncated) {
      scanOutcome = 'cap_truncated';
    }
    setGaugeOutcome(scanOutcome, oldestUnadmittedAgeSec);

    const durationMs = Date.now() - startedMs;
    metrics.passDurationMs.observe({ mode }, durationMs);
    return {
      mode,
      scanOutcome,
      scanned: tripIds.length,
      needsRelease,
      released,
      skipped,
      guarded,
      alreadyCurrent,
      capTruncated,
      durationMs,
    };
  }

  /**
   * Activity-independent fleet sweep: eligible ACTIVE vehicles get a bounded recovery pass
   * without running full trip reconciliation / DIMO repair.
   */
  async runDurableAdmissionRecoveryFleetPass(options?: {
    now?: Date;
    policy?: TripDiBoundaryAdmissionRecoveryPolicy;
    fleetPolicy?: DiV0Ds4FleetMotionAdmissionPolicySnapshotV1;
    ds4FleetMotionPolicy?: DiV0Ds4FleetMotionAdmissionPolicySnapshotV1;
  }): Promise<{
    vehiclesEligible: number;
    vehiclesScanned: number;
    writerAttempts: number;
    released: number;
    durationMs: number;
  }> {
    const startedMs = Date.now();
    const policy = options?.policy ?? readTripDiBoundaryAdmissionRecoveryPolicyFromEnv();
    if (!isTripDiBoundaryAdmissionRecoveryEnabled(policy)) {
      return {
        vehiclesEligible: 0,
        vehiclesScanned: 0,
        writerAttempts: 0,
        released: 0,
        durationMs: Date.now() - startedMs,
      };
    }
    const ds4FleetMotionPolicy =
      options?.ds4FleetMotionPolicy ??
      options?.fleetPolicy ??
      loadTripDiBoundaryAdmissionRecoveryDs4FleetMotionPolicyFromEnv();
    const kill = await readDiV0S4KillEvaluationForRecovery(this.prisma);
    const now = options?.now ?? new Date();
    const vehicles = await listTripDiBoundaryAdmissionRecoveryFleetVehiclesV1(this.prisma, {
      policy,
      ds4FleetMotionPolicy,
      kill,
      now,
    });
    const fleetBudget = new TripDiBoundaryAdmissionRecoveryFleetBudget(policy.globalMaxPerPass);
    let vehiclesScanned = 0;
    let writerAttempts = 0;
    let released = 0;
    for (const { organizationId, vehicleId } of vehicles) {
      if (fleetBudget.remainingAttempts <= 0) break;
      const beforeRemaining = fleetBudget.remainingAttempts;
      const result = await this.runDurableAdmissionRecoveryPass(organizationId, vehicleId, {
        now,
        policy,
        ds4FleetMotionPolicy,
        kill,
        fleetBudget,
      });
      if (result.mode === 'DISABLED') continue;
      vehiclesScanned += 1;
      writerAttempts += beforeRemaining - fleetBudget.remainingAttempts;
      released += result.released;
    }
    return {
      vehiclesEligible: vehicles.length,
      vehiclesScanned,
      writerAttempts,
      released,
      durationMs: Date.now() - startedMs,
    };
  }

  async releaseForBoundaryScannedTripIds(tripIds: readonly string[]): Promise<{ released: number; skipped: number }> {
    const unique = [...new Set(tripIds.filter((id) => id.length > 0))];
    let released = 0;
    let skipped = 0;
    for (const tripId of unique) {
      try {
        const ok = await this.tryReleaseForTripTransactional(tripId, 'RECONCILIATION');
        if (ok) released += 1;
        else skipped += 1;
      } catch (err) {
        skipped += 1;
        this.logger.warn(
          `DI boundary admission release failed trip=${tripId}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    return { released, skipped };
  }

  /**
   * Idempotent transactional release: row lock, re-validate preconditions, jsonb_set admission only.
   */
  async tryReleaseForTripTransactional(
    tripId: string,
    releasedBy: TripDiBoundaryAdmissionV1['releasedBy'] = 'RECONCILIATION',
  ): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<
        Array<{
          organization_id: string;
          vehicle_id: string;
          trip_id: string;
          trip_status: string;
          start_time: Date;
          end_time: Date | null;
          dimo_segment_id: string | null;
          merge_parent_trip_id: string | null;
          raw_detection_meta: unknown;
          detection_state: string | null;
          active_trip_id: string | null;
          proposed_repairs: bigint;
        }>
      >`
        SELECT v.organization_id, t.vehicle_id, t.id AS trip_id, t.trip_status::text AS trip_status,
               t.start_time AT TIME ZONE 'UTC' AS start_time, t.end_time AT TIME ZONE 'UTC' AS end_time,
               t.dimo_segment_id, t.merge_parent_trip_id, t.raw_detection_meta,
               d.state::text AS detection_state, d.active_trip_id::text AS active_trip_id,
               (SELECT count(*)::bigint FROM trip_repairs r
                WHERE r.trip_id = t.id AND r.status = 'PROPOSED') AS proposed_repairs
        FROM vehicle_trips t
        JOIN vehicles v ON v.id = t.vehicle_id
        LEFT JOIN vehicle_trip_detection_states d ON d.vehicle_id = t.vehicle_id
        WHERE t.id = ${tripId}
        FOR UPDATE OF t
        LIMIT 1`;
      const row = rows[0];
      if (!row) return false;
      const scope = this.rowToScope(row);
      const block = canReleaseTripDiBoundaryAdmission(scope);
      if (block != null) return false;

      const revisionKey = buildTripDiBoundaryRevisionKey({
        organizationId: scope.organizationId,
        vehicleId: scope.vehicleId,
        tripId: scope.tripId,
        tripStatus: scope.tripStatus,
        startTime: scope.startTime,
        endTime: scope.endTime,
        dimoSegmentId: scope.dimoSegmentId,
        mergeParentTripId: scope.mergeParentTripId,
        rawDetectionMeta: scope.rawDetectionMeta,
      });
      const existing = readTripDiBoundaryAdmissionV1(scope.rawDetectionMeta);
      if (existing?.revisionKey === revisionKey) return true;

      const patch = buildTripDiBoundaryAdmissionPatch(revisionKey, releasedBy);
      const updated = await tx.$executeRaw`
        UPDATE vehicle_trips t
        SET raw_detection_meta = COALESCE(t.raw_detection_meta, '{}'::jsonb) || ${JSON.stringify(patch)}::jsonb
        WHERE t.id = ${tripId}
          AND t.trip_status::text = 'COMPLETED'
          AND t.end_time IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM trip_repairs r
            WHERE r.trip_id = t.id AND r.status = 'PROPOSED'
          )`;
      return updated === 1;
    });
  }

  /** @deprecated Use releaseForBoundaryScannedTripIds — window batch release is not reconciliation-proven. */
  async releaseCompletedTripsInWindow(_vehicleId: string, _from: Date, _to: Date): Promise<number> {
    return 0;
  }

  private rowToScope(row: {
    organization_id: string;
    vehicle_id: string;
    trip_id: string;
    trip_status: string;
    start_time: Date;
    end_time: Date | null;
    dimo_segment_id: string | null;
    merge_parent_trip_id: string | null;
    raw_detection_meta: unknown;
    detection_state: string | null;
    active_trip_id: string | null;
    proposed_repairs: bigint;
  }): TripDiBoundaryAdmissionScope {
    return {
      organizationId: row.organization_id,
      vehicleId: row.vehicle_id,
      tripId: row.trip_id,
      tripStatus: row.trip_status,
      startTime: row.start_time,
      endTime: row.end_time,
      dimoSegmentId: row.dimo_segment_id,
      mergeParentTripId: row.merge_parent_trip_id,
      rawDetectionMeta: row.raw_detection_meta,
      detectionState: row.detection_state,
      activeTripId: row.active_trip_id,
      proposedBoundaryRepairCount: Number(row.proposed_repairs),
    };
  }
}
