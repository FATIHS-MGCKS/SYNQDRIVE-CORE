import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TireWearV3PriorService } from '../wear-v3-prior/tire-wear-v3-prior.service';
import { TireWearV3CalibrationEligibilityService } from './tire-wear-v3-calibration-eligibility.service';
import { buildTireWearV3CalibrationSnapshotIdempotencyKey } from './tire-wear-v3-calibration-snapshot.idempotency';
import { TireWearV3CalibrationSnapshotRepository } from './tire-wear-v3-calibration-snapshot.repository';
import {
  TIRE_WEAR_V3_CALIBRATION_SNAPSHOT_SCHEMA_VERSION,
  buildCalibrationSnapshotPayload,
  type TireWearV3CalibrationSnapshotInsertRow,
  type TireWearV3CalibrationWriterTickStats,
} from './tire-wear-v3-calibration-snapshot.types';

@Injectable()
export class TireWearV3CalibrationShadowWriterService {
  private readonly logger = new Logger(TireWearV3CalibrationShadowWriterService.name);
  private tickInProgress = false;
  private stats: TireWearV3CalibrationWriterTickStats = {
    lastTickAt: null,
    lastResult: 'IDLE',
    lastError: null,
    lastCandidateSetups: 0,
    lastSnapshotsInserted: 0,
    lastSnapshotsExisting: 0,
    lastSetupsSkipped: 0,
  };

  constructor(
    private readonly configService: ConfigService,
    private readonly priorService: TireWearV3PriorService,
    private readonly eligibilityService: TireWearV3CalibrationEligibilityService,
    private readonly snapshotRepository: TireWearV3CalibrationSnapshotRepository,
  ) {}

  isWriteEnabled(): boolean {
    return (
      this.configService.get<boolean>('tireWearV3CalibrationShadow.writeEnabled') ===
      true
    );
  }

  getWriterStats(): TireWearV3CalibrationWriterTickStats {
    return { ...this.stats };
  }

  async runBoundedSnapshotTick(): Promise<TireWearV3CalibrationWriterTickStats> {
    if (!this.isWriteEnabled()) {
      this.stats = {
        ...this.stats,
        lastTickAt: new Date().toISOString(),
        lastResult: 'FLAG_OFF',
        lastError: null,
        lastCandidateSetups: 0,
        lastSnapshotsInserted: 0,
        lastSnapshotsExisting: 0,
        lastSetupsSkipped: 0,
      };
      return this.getWriterStats();
    }

    if (this.tickInProgress) {
      this.stats = { ...this.stats, lastResult: 'OVERLAP' };
      return this.getWriterStats();
    }

    this.tickInProgress = true;
    const batchSize =
      this.configService.get<number>('tireWearV3CalibrationShadow.batchSize') ?? 25;

    let inserted = 0;
    let existing = 0;
    let skipped = 0;

    try {
      const candidates =
        await this.snapshotRepository.findSetupCandidatesForSnapshotBatch(batchSize);

      for (const candidate of candidates) {
        const outcome = await this.snapshotSetupIfChanged(
          candidate.tireSetupId,
          candidate.organizationId,
        );
        inserted += outcome.inserted;
        existing += outcome.existing;
        if (outcome.skipped) skipped += 1;
      }

      this.stats = {
        lastTickAt: new Date().toISOString(),
        lastResult: 'COMPLETED',
        lastError: null,
        lastCandidateSetups: candidates.length,
        lastSnapshotsInserted: inserted,
        lastSnapshotsExisting: existing,
        lastSetupsSkipped: skipped,
      };
    } catch (err) {
      this.stats = {
        ...this.stats,
        lastTickAt: new Date().toISOString(),
        lastResult: 'FAILED',
        lastError: err instanceof Error ? err.message : String(err),
      };
      this.logger.warn(
        `tire_wear_v3_calibration_shadow_tick_failed: ${this.stats.lastError}`,
      );
    } finally {
      this.tickInProgress = false;
    }

    return this.getWriterStats();
  }

  async snapshotSetupIfChanged(
    tireSetupId: string,
    organizationId: string,
  ): Promise<{
    inserted: number;
    existing: number;
    skipped: boolean;
  }> {
    const predictionCreatedAt = new Date();
    const eligibility = await this.eligibilityService.resolveForSetup({
      tireSetupId,
      organizationId,
      asOf: predictionCreatedAt,
    });

    if (!eligibility) {
      return { inserted: 0, existing: 0, skipped: true };
    }

    const latestDigest =
      await this.snapshotRepository.findLatestCalibrationEligibilityDigest(
        tireSetupId,
        organizationId,
      );
    if (latestDigest === eligibility.calibrationEligibilityDigest) {
      return { inserted: 0, existing: 0, skipped: true };
    }

    const result = await this.priorService.computeForSetup(tireSetupId, {
      persistShadow: false,
      asOf: predictionCreatedAt,
    });

    if (!result?.organizationId || result.organizationId !== organizationId) {
      return { inserted: 0, existing: 0, skipped: true };
    }

    if (!result.rated || result.wheels.length === 0) {
      return { inserted: 0, existing: 0, skipped: true };
    }

    const pairingEligibleBase =
      !eligibility.rotationDuringMountPeriod &&
      !eligibility.physicalIdentityAmbiguous &&
      eligibility.activePeriod.id != null;

    let inserted = 0;
    let existing = 0;

    for (const wheel of result.wheels) {
      const physicalTireId = eligibility.physicalTireIdByWheel[wheel.position];
      const pairingEligible =
        pairingEligibleBase && physicalTireId != null;

      const idempotencyKey = buildTireWearV3CalibrationSnapshotIdempotencyKey({
        organizationId: result.organizationId,
        tireSetupId: result.tireSetupId,
        mountPeriodId: eligibility.activePeriod.id,
        wheelPosition: wheel.position,
        modelVersion: result.modelVersion,
        calibrationEligibilityDigest: eligibility.calibrationEligibilityDigest,
      });

      const payload = buildCalibrationSnapshotPayload({
        result,
        wheel,
        mountPeriodId: eligibility.activePeriod.id,
        physicalTireId,
        predictionCreatedAt,
        rotationDuringMountPeriod: eligibility.rotationDuringMountPeriod,
        calibrationEligibilityDigest: eligibility.calibrationEligibilityDigest,
        latestSourceMeasurementAt: eligibility.latestSourceMeasurementAt,
        sourceDataCutoffAt: eligibility.sourceDataCutoffAt,
        measurementIdsUsed: eligibility.measurementIdsUsed,
        pairingEligible,
        physicalIdentityAmbiguous: eligibility.physicalIdentityAmbiguous,
      });

      const row: TireWearV3CalibrationSnapshotInsertRow = {
        organizationId: result.organizationId,
        vehicleId: result.vehicleId,
        tireSetupId: result.tireSetupId,
        mountPeriodId: eligibility.activePeriod.id,
        wheelPosition: wheel.position,
        physicalTireId,
        predictionCreatedAt,
        sourceComputedAt: new Date(result.computedAt),
        sourceOdometerKm: result.currentOdometerKm,
        modelVersion: result.modelVersion,
        modelConfigHash: result.modelConfigHash,
        inputFingerprint: result.inputFingerprint,
        calibrationEligibilityDigest: eligibility.calibrationEligibilityDigest,
        snapshotSchemaVersion: TIRE_WEAR_V3_CALIBRATION_SNAPSHOT_SCHEMA_VERSION,
        idempotencyKey,
        latestSourceMeasurementAt: eligibility.latestSourceMeasurementAt,
        sourceDataCutoffAt: eligibility.sourceDataCutoffAt,
        pairingEligible,
        measurementIdsUsed: eligibility.measurementIdsUsed,
        snapshotPayload: payload,
      };

      const writeOutcome =
        await this.snapshotRepository.insertSnapshotIdempotent(row);
      if (writeOutcome.created) inserted += 1;
      else existing += 1;
    }

    return { inserted, existing, skipped: false };
  }
}
