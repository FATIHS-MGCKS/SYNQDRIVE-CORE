import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TireBaselineStatus, TireEvidenceSource, TireOdometerAnchorStatus } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { AiTireSpec, parseAiTireSpec, resolveArchetype, resolveReplacementThreshold } from '../tire-health.config';
import type { WheelPos } from '../tire-evidence-provenance';
import {
  TIRE_WEAR_V3_PRIOR_CONFIG,
  TIRE_WEAR_V3_PRIOR_DYNAMIC_BETA,
  TIRE_WEAR_V3_PRIOR_MODEL_VERSION,
  computeTireWearV3PriorConfigHash,
} from './tire-wear-v3-prior.config';
import { resolveRateCalibrationSigmaMm } from './tire-wear-v3-prior.calibration';
import {
  roundDisplayRateIntervalMmPer1000,
  roundDisplayTreadInterval,
} from './tire-wear-v3-prior.display';
import { computeTireWearV3PriorInputFingerprint } from './tire-wear-v3-prior.fingerprint';
import {
  filterLedgerRowsForMountPeriod,
  filterMeasurementsForMountPeriod,
  hasRotationDuringMountPeriod,
  resolveActiveMountPeriod,
  selectRateCalibrationSegment,
  stableLedgerContentDigest,
  sumLedgerDistanceKm,
  validateOdometerContext,
} from './tire-wear-v3-prior.lifecycle';
import {
  classifyTreadEvidenceClass,
  computeEstimatedWearMmInterval,
  resolveDisplayTreadForEvidenceClass,
} from './tire-wear-v3-baseline.math';
import {
  applyDynamicFactorToRateInterval,
  boundedDynamicWearFactor,
  computeSetupDs4Severity,
  type TireWearV3Ds4LedgerShadowRow,
} from './tire-wear-v3-dynamic.math';
import {
  buildWearRateEstimate,
  deriveEvidenceLevel,
  fitWearRateFromMeasurements,
  listWheelPositions,
  projectTreadMm,
  remainingKmInterval,
  resolveArchetypeAndSeason,
  resolveReplacementMm,
  resolveWheelInitialTread,
} from './tire-wear-v3-prior.math';
import { TireWearV3PriorRepository } from './tire-wear-v3-prior.repository';
import {
  assessPosteriorCalibrationEligibleFromPrior,
  filterTrustedV3NumericalMeasurementRows,
} from './tire-wear-v3-numerical-evidence';
import { resolveV3VerificationStatus } from './tire-wear-v3-verification.resolver';
import type {
  TireWearV3MeasurementPoint,
  TireWearV3PriorSetupResult,
  TireWearV3WheelProjection,
} from './tire-wear-v3-prior.types';

function wheelField(position: WheelPos): 'frontLeftMm' | 'frontRightMm' | 'rearLeftMm' | 'rearRightMm' {
  switch (position) {
    case 'FL':
      return 'frontLeftMm';
    case 'FR':
      return 'frontRightMm';
    case 'RL':
      return 'rearLeftMm';
    case 'RR':
      return 'rearRightMm';
    default:
      return 'frontLeftMm';
  }
}
@Injectable()
export class TireWearV3PriorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repository: TireWearV3PriorRepository,
    private readonly configService: ConfigService,
  ) {}

  isShadowWriteEnabled(): boolean {
    return this.configService.get<boolean>('tireWearV3PriorShadow.writeEnabled') === true;
  }

  async computeForSetup(
    tireSetupId: string,
    opts?: { asOf?: Date; dataCutoff?: Date; persistShadow?: boolean },
  ): Promise<TireWearV3PriorSetupResult | null> {
    const asOf = opts?.asOf ?? new Date();
    const setup = await this.prisma.vehicleTireSetup.findUnique({
      where: { id: tireSetupId },
      include: {
        vehicle: {
          select: {
            organizationId: true,
            latestState: { select: { odometerKm: true } },
          },
        },
        mountPeriods: {
          select: {
            id: true,
            installedAt: true,
            removedAt: true,
            installedOdometerKm: true,
            odometerAnchorStatus: true,
          },
          orderBy: { installedAt: 'asc' },
        },
      },
    });
    if (!setup) return null;

    const spec = parseAiTireSpec(setup.aiTireSpec);
    const { archetype, season } = resolveArchetypeAndSeason(spec, setup.tireSeason);
    const replacementMm = resolveReplacementMm(spec, archetype, season);

    const activePeriod = resolveActiveMountPeriod(
      setup.mountPeriods,
      asOf,
      {
        installedAt: setup.installedAt,
        removedAt: setup.removedAt,
        installedOdometerKm: setup.installedOdometerKm,
        odometerAnchorStatus: setup.odometerAnchorStatus,
      },
    );

    const ledgerRowsAll = await this.prisma.tireTripUsageLedger.findMany({
      where: { tireSetupId, invalidatedAt: null },
      select: {
        id: true,
        tripId: true,
        distanceKm: true,
        revisionNumber: true,
        sourceFingerprint: true,
        tripStartedAt: true,
      },
      orderBy: { tripStartedAt: 'asc' },
    });

    const ledgerRows = filterLedgerRowsForMountPeriod(ledgerRowsAll, activePeriod);
    const ledgerDistanceKm = sumLedgerDistanceKm(ledgerRows);
    const ledgerDigest = stableLedgerContentDigest(ledgerRows);

    const measurementsRawAll = await this.prisma.vehicleTireTreadMeasurement.findMany({
      where: { tireSetupId },
      orderBy: { measuredAt: 'asc' },
      select: {
        id: true,
        measuredAt: true,
        odometerAtMeasurement: true,
        frontLeftMm: true,
        frontRightMm: true,
        rearLeftMm: true,
        rearRightMm: true,
        source: true,
        isCalibrationPoint: true,
        evidenceSource: true,
      },
    });
    const measurementsRaw = filterMeasurementsForMountPeriod(
      measurementsRawAll,
      activePeriod,
    );
    const trustedNumericalMeasurements = filterTrustedV3NumericalMeasurementRows(
      measurementsRaw,
    );

    const rotationEvents = await this.prisma.tirePositionHistory.findMany({
      where: { tireSetId: tireSetupId },
      select: { changedAt: true, changeType: true },
    });

    const periodAnchorOdometer =
      activePeriod?.installedOdometerKm ?? setup.installedOdometerKm;
    const anchorStatus =
      activePeriod?.odometerAnchorStatus ?? setup.odometerAnchorStatus;

    const latestStateOdometer = setup.vehicle.latestState?.odometerKm ?? null;
    let currentOdometerKm = latestStateOdometer;
    if (
      anchorStatus === TireOdometerAnchorStatus.ANCHORED &&
      periodAnchorOdometer != null &&
      currentOdometerKm == null
    ) {
      currentOdometerKm = periodAnchorOdometer + ledgerDistanceKm;
    }

    const setupFlags: string[] = [];
    if (!activePeriod) {
      setupFlags.push('NO_ACTIVE_MOUNT_PERIOD');
    }
    if (anchorStatus !== TireOdometerAnchorStatus.ANCHORED) {
      setupFlags.push('ODOMETER_ANCHOR_NOT_CONFIRMED');
    }
    if (measurementsRawAll.length > measurementsRaw.length) {
      setupFlags.push('MEASUREMENTS_EXCLUDED_OUTSIDE_MOUNT_PERIOD');
    }
    if (measurementsRaw.length > trustedNumericalMeasurements.length) {
      setupFlags.push('MEASUREMENTS_EXCLUDED_UNTRUSTED_NUMERICAL_SOURCE');
    }
    if (ledgerRowsAll.length > ledgerRows.length) {
      setupFlags.push('LEDGER_ROWS_EXCLUDED_OUTSIDE_MOUNT_PERIOD');
    }
    if (
      activePeriod &&
      hasRotationDuringMountPeriod(rotationEvents, activePeriod)
    ) {
      setupFlags.push('ROTATION_DURING_MOUNT_PERIOD');
    }
    if (TIRE_WEAR_V3_PRIOR_DYNAMIC_BETA !== 0) {
      setupFlags.push('UNEXPECTED_DYNAMIC_BETA');
    }

    const odometerValidation = validateOdometerContext({
      anchorOdometerKm: periodAnchorOdometer,
      currentOdometerKm,
      ledgerDistanceKm,
      measurementOdometers: trustedNumericalMeasurements
        .map((m) => m.odometerAtMeasurement)
        .filter((o): o is number => o != null && Number.isFinite(o)),
    });
    setupFlags.push(...odometerValidation.flags);

    const widenedBaseline =
      setup.initialTreadEvidenceSource === TireEvidenceSource.DEFAULT_ASSUMPTION ||
      setup.baselineStatus === TireBaselineStatus.INCOMPLETE;

    const rotationBlocksRate =
      activePeriod != null &&
      hasRotationDuringMountPeriod(rotationEvents, activePeriod);

    const ledgerDistanceById = new Map(
      ledgerRows.map((row) => [row.id, row.distanceKm]),
    );
    const ds4ShadowBase = await this.repository.findLatestDs4ShadowEvidenceByLedgerIds(
      ledgerRows.map((row) => row.id),
    );
    const ds4RowsForSeverity: TireWearV3Ds4LedgerShadowRow[] = ds4ShadowBase.map(
      (row) => ({
        ...row,
        distanceKm: ledgerDistanceById.get(row.ledgerId) ?? 0,
      }),
    );
    const ds4Severity = computeSetupDs4Severity(ds4RowsForSeverity, ledgerDistanceKm);
    setupFlags.push(...ds4Severity.flags);
    const setupDynamic = boundedDynamicWearFactor(
      ds4Severity.sRel,
      ds4Severity.coverage,
    );
    if (setupDynamic.flags.length > 0) {
      setupFlags.push(...setupDynamic.flags);
    }

    const wheels: TireWearV3WheelProjection[] = [];
    for (const position of listWheelPositions()) {
      const initial = resolveWheelInitialTread(
        position,
        setup,
        spec,
        archetype,
        season,
      );
      const field = wheelField(position);
      const measurementPoints: TireWearV3MeasurementPoint[] = [];
      for (const m of trustedNumericalMeasurements) {
        const tread = m[field];
        if (tread == null || !Number.isFinite(tread)) continue;
        measurementPoints.push({
          measuredAt: m.measuredAt,
          odometerKm: m.odometerAtMeasurement,
          treadMm: tread,
          source: m.source,
          isCalibrationPoint: m.isCalibrationPoint ?? false,
        });
      }

      const { segment: rateSegment, flags: segmentFlags } =
        selectRateCalibrationSegment(measurementPoints);
      const { sigmaMm: sigmaMeasMm, flags: calibrationSigmaFlags } =
        resolveRateCalibrationSigmaMm(rateSegment);

      const wearRateRaw = buildWearRateEstimate({
        initialTreadMm: initial.treadMm,
        replacementMm,
        spec,
        archetype,
        season,
        setupExpectedLifeKm: setup.expectedLifeKm,
        expectedLifeKmFront: setup.expectedLifeKmFront,
        expectedLifeKmRear: setup.expectedLifeKmRear,
        position,
        widenedBaseline: widenedBaseline || initial.usedDefaultFallback,
        measurements: rotationBlocksRate ? [] : rateSegment,
        sigmaMeasMm,
      });

      const empiricalFit = fitWearRateFromMeasurements(
        rotationBlocksRate ? [] : rateSegment,
        sigmaMeasMm,
      );

      const rateRejected =
        rotationBlocksRate ||
        wearRateRaw.flags.some((f) =>
          ['RATE_NEGATIVE_WEAR_REJECTED', 'RATE_IMPLAUSIBLY_HIGH'].includes(f),
        );

      const meets3Sigma =
        empiricalFit.rateMmPerKm != null &&
        !empiricalFit.flags.includes('RATE_SPAN_BELOW_3SIGMA_THRESHOLD');

      const spanKm = empiricalFit.spanKm;
      const priorOnlyForRate =
        wearRateRaw.source !== 'measurement_fused' || rateRejected;

      const evidenceLevel = deriveEvidenceLevel({
        anchorStatus,
        measurementCount: measurementPoints.length,
        ratePointCount: rateSegment.length,
        empiricalRateMmPerKm: empiricalFit.rateMmPerKm,
        empiricalRateSigmaMmPerKm: empiricalFit.rateSigmaMmPerKm,
        measurementSpanKm: spanKm,
        meets3SigmaSpacing: meets3Sigma,
        rateRejected,
        priorOnlyForRate,
      });

      const wheelFlags: string[] = [
        ...wearRateRaw.flags,
        ...segmentFlags,
        ...calibrationSigmaFlags,
      ];
      if (rotationBlocksRate) {
        wheelFlags.push('RATE_ROTATION_UNVERIFIED');
      }

      let rated =
        activePeriod != null &&
        odometerValidation.valid &&
        anchorStatus === TireOdometerAnchorStatus.ANCHORED &&
        periodAnchorOdometer != null &&
        currentOdometerKm != null;

      if (!rated) {
        wheelFlags.push('UNRATED_NO_ODOMETER_CONTEXT');
      }

      let estimatedTreadMm = { lo: initial.treadMm, hi: initial.treadMm };
      let estimatedWearMm = { lo: 0, hi: 0 };
      let distanceSinceAnchorKm = 0;
      let kmSinceLatestMeasurement: number | null = null;
      let latestMeasTreadMm: number | null = null;

      const rateMmPerKmForProjection = applyDynamicFactorToRateInterval(
        wearRateRaw.mmPerKm,
        setupDynamic,
      );

      if (rated) {
        distanceSinceAnchorKm = Math.max(0, currentOdometerKm! - periodAnchorOdometer!);
        const withOdometer = measurementPoints.filter((p) => p.odometerKm != null);
        const latestMeas = [...withOdometer].sort(
          (a, b) => b.measuredAt.getTime() - a.measuredAt.getTime(),
        )[0];

        if (latestMeas?.odometerKm != null) {
          latestMeasTreadMm = latestMeas.treadMm;
          kmSinceLatestMeasurement = Math.max(
            0,
            currentOdometerKm! - latestMeas.odometerKm,
          );
        }

        const wearDistanceKm =
          latestMeas?.odometerKm != null
            ? kmSinceLatestMeasurement ?? 0
            : distanceSinceAnchorKm;

        estimatedWearMm = roundDisplayTreadInterval(
          computeEstimatedWearMmInterval(rateMmPerKmForProjection, wearDistanceKm),
        );

        const projected = latestMeas?.odometerKm != null
          ? projectTreadMm({
              anchorTreadMm: latestMeas.treadMm,
              anchorOdometerKm: latestMeas.odometerKm,
              currentOdometerKm: currentOdometerKm!,
              rateMmPerKm: rateMmPerKmForProjection,
              anchorUncertaintyMm: sigmaMeasMm,
            })
          : projectTreadMm({
              anchorTreadMm: initial.treadMm,
              anchorOdometerKm: periodAnchorOdometer!,
              currentOdometerKm: currentOdometerKm!,
              rateMmPerKm: rateMmPerKmForProjection,
            });
        estimatedTreadMm = roundDisplayTreadInterval(projected);
      } else {
        wheelFlags.push('PRIOR_ONLY_INTERVAL');
        const usable = initial.treadMm - replacementMm;
        const pessimisticWear =
          usable > 0 && ledgerDistanceKm > 0
            ? (usable / TIRE_WEAR_V3_PRIOR_CONFIG.unknownLifeKmSpan.hi) *
              ledgerDistanceKm
            : 0;
        estimatedTreadMm = roundDisplayTreadInterval({
          lo: Math.max(replacementMm, initial.treadMm - pessimisticWear * 1.25),
          hi: initial.treadMm,
        });
      }

      const remainingKm = remainingKmInterval(
        estimatedTreadMm,
        replacementMm,
        rateMmPerKmForProjection,
      );

      const wearRate = {
        ...wearRateRaw,
        mmPerKm: rateMmPerKmForProjection,
        mmPer1000km: roundDisplayRateIntervalMmPer1000({
          lo: rateMmPerKmForProjection.lo * 1000,
          hi: rateMmPerKmForProjection.hi * 1000,
        }),
      };

      const treadEvidenceClass = classifyTreadEvidenceClass({
        rated,
        evidenceLevel: rated ? evidenceLevel : 'UNRATED',
        kmSinceLatestMeasurement,
        measuredFreshKmThreshold: TIRE_WEAR_V3_PRIOR_CONFIG.measuredFreshKm,
        hasMeasurement: latestMeasTreadMm != null,
      });

      const { displayTreadMm, pointEstimateTreadMm } = resolveDisplayTreadForEvidenceClass({
        treadEvidenceClass,
        projectedTreadMm: estimatedTreadMm,
        latestMeasuredTreadMm: latestMeasTreadMm,
        measurementSigmaMm: sigmaMeasMm,
      });

      if (initial.usedDefaultFallback && treadEvidenceClass === 'BASELINE_ESTIMATE') {
        wheelFlags.push('INITIAL_TREAD_DEFAULT_ASSUMPTION');
      }

      wheels.push({
        position,
        initialTreadMm: initial.treadMm,
        initialTreadUsedDefaultFallback: initial.usedDefaultFallback,
        replacementThresholdMm: replacementMm,
        distanceSinceAnchorKm,
        estimatedTreadMm,
        estimatedWearMm,
        displayTreadMm,
        pointEstimateTreadMm,
        treadEvidenceClass,
        remainingKm,
        wearRate,
        evidenceLevel: rated ? evidenceLevel : 'UNRATED',
        dynamicFactor: {
          factor: setupDynamic.factor,
          coverage: setupDynamic.coverage,
          sRel: setupDynamic.sRel,
          applied: setupDynamic.applied,
          appliedToRateLo: setupDynamic.appliedToRateLo,
        },
        flags: wheelFlags,
      });
    }

    const fingerprint = computeTireWearV3PriorInputFingerprint({
      tireSetupId: setup.id,
      vehicleId: setup.vehicleId,
      organizationId: setup.organizationId,
      setupRevision: {
        installedOdometerKm: setup.installedOdometerKm,
        odometerAnchorStatus: setup.odometerAnchorStatus,
        initialTreadFrontMm: setup.initialTreadFrontMm,
        initialTreadRearMm: setup.initialTreadRearMm,
        initialTreadDepthMm: setup.initialTreadDepthMm,
        expectedLifeKm: setup.expectedLifeKm,
        tireSeason: setup.tireSeason,
      },
      mountPeriod: {
        id: activePeriod?.id ?? null,
        installedAtIso: activePeriod?.installedAt.toISOString() ?? null,
        removedAtIso: activePeriod?.removedAt?.toISOString() ?? null,
        installedOdometerKm: activePeriod?.installedOdometerKm ?? null,
      },
      ledger: {
        activeRowCount: ledgerRows.length,
        totalDistanceKm: ledgerDistanceKm,
        contentDigest: ledgerDigest,
      },
      measurements: measurementsRaw.map((m) => ({
        id: m.id,
        measuredAt: m.measuredAt.toISOString(),
        odometerAtMeasurement: m.odometerAtMeasurement,
        frontLeftMm: m.frontLeftMm,
        frontRightMm: m.frontRightMm,
        rearLeftMm: m.rearLeftMm,
        rearRightMm: m.rearRightMm,
      })),
      currentOdometerKm,
      dataCutoffIso: opts?.dataCutoff?.toISOString() ?? null,
    });

    const rotationDuringMount =
      activePeriod != null &&
      hasRotationDuringMountPeriod(rotationEvents, activePeriod);

    const verification = resolveV3VerificationStatus({
      asOf,
      currentOdometerKm,
      mountPeriod: activePeriod,
      measurements: measurementsRawAll.map((m) => ({
        id: m.id,
        measuredAt: m.measuredAt,
        odometerAtMeasurement: m.odometerAtMeasurement,
        frontLeftMm: m.frontLeftMm,
        frontRightMm: m.frontRightMm,
        rearLeftMm: m.rearLeftMm,
        rearRightMm: m.rearRightMm,
        source: m.source,
        evidenceSource: m.evidenceSource,
      })),
      setupOdometerQualityFlags: odometerValidation.flags,
      rotationDuringMountPeriod: rotationDuringMount,
    });

    const result: TireWearV3PriorSetupResult = {
      tireSetupId: setup.id,
      vehicleId: setup.vehicleId,
      organizationId: setup.organizationId,
      modelVersion: TIRE_WEAR_V3_PRIOR_MODEL_VERSION,
      modelConfigHash: computeTireWearV3PriorConfigHash(),
      inputFingerprint: fingerprint,
      computedAt: asOf.toISOString(),
      odometerAnchorKm: periodAnchorOdometer,
      odometerAnchorStatus: anchorStatus,
      currentOdometerKm,
      ledgerDistanceKm,
      ledgerRowCount: ledgerRows.length,
      dynamicBeta: TIRE_WEAR_V3_PRIOR_DYNAMIC_BETA,
      ds4SeverityCoverage: ds4Severity.coverage,
      ds4SeveritySRel: ds4Severity.sRel,
      rated:
        activePeriod != null &&
        odometerValidation.valid &&
        anchorStatus === TireOdometerAnchorStatus.ANCHORED &&
        periodAnchorOdometer != null &&
        currentOdometerKm != null,
      wheels,
      setupFlags,
      verification,
    };

    const shadowWriteEnabled = this.isShadowWriteEnabled();
    const persistShadowOpt = opts?.persistShadow;
    if (persistShadowOpt === true && !shadowWriteEnabled) {
      setupFlags.push('SHADOW_WRITE_BLOCKED_BY_CONFIG');
    }

    const mayPersistShadow =
      persistShadowOpt !== false && shadowWriteEnabled && setup.organizationId;

    if (mayPersistShadow && setup.organizationId) {
      await this.repository.insertShadowRowIdempotent({
        organizationId: setup.organizationId,
        vehicleId: setup.vehicleId,
        tireSetupId: setup.id,
        modelVersion: TIRE_WEAR_V3_PRIOR_MODEL_VERSION,
        modelConfigHash: result.modelConfigHash,
        inputFingerprint: fingerprint,
        resultPayload: result,
      });
    }

    return result;
  }
}
