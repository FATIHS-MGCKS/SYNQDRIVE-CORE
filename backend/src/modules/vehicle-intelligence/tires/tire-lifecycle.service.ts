import { BadRequestException, ConflictException, Injectable, Logger, Optional } from '@nestjs/common';
import {
  Prisma,
  TireChangeType,
  TireEventType,
  TireEvidenceSource,
  TireSeason,
  TireSetupStatus,
  TireSetupCondition,
  TireHealthAlertResolutionReason,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { TireWearModelService } from './tire-wear-model.service';
import { TireHealthService } from './tire-health.service';
import { TireHealthAlertService } from './tire-health-alert.service';
import { TireHealthObservabilityService } from './tire-health-observability.service';
import {
  TireIdentityService,
  dbPosToWheel,
} from './tire-identity.service';
import { isStaggeredSetup } from './tire-health.config';
import {
  buildSetupBaselineFields,
  resolveEvidenceFromLegacySource,
  resolveInitialTreadEvidence,
  type WheelPos,
} from './tire-evidence-provenance';
import {
  assertHealthEligibleSetup,
  assertSetupStatusTransition,
  mapArchiveStatus,
  rethrowLifecycleInvariantViolation,
} from './tire-lifecycle-state';
import {
  buildMountPeriodCreateData,
  buildSetupOdometerAnchorFields,
  assessOdometerPlausibility,
  resolveOdometerAnchor,
  toFiniteOdometerKm,
  type ResolvedOdometerAnchor,
  type VehicleOdometerContext,
} from './tire-odometer-anchor';
import {
  buildRecommendedPressurePersistData,
  normalizeTirePressureSpecSource,
  type TirePressureSpecSource,
} from './tire-recommended-pressure';
import {
  assessV3Ingestion,
  isGroundTruthMeasurementCommand,
  isOdometerExplicitlyConfirmed,
  isRegistrationBaselineLegacySource,
  resolveExplicitMeasurementOdometerKm,
  resolveInferredMeasurementOdometerKm,
  resolvePersistedMeasurementOdometerKm,
  validateTreadMmValues,
  type TireMeasurementV3IngestionAssessment,
  type TireMeasurementV3RecomputeResult,
} from './tire-measurement-v3-ingestion';
import { resolveActiveMountPeriod } from './wear-v3-prior/tire-wear-v3-prior.lifecycle';
import { TireWearV3PriorService } from './wear-v3-prior/tire-wear-v3-prior.service';
import { isVerificationExcludedLegacySource } from './wear-v3-prior/tire-wear-v3-verification.accepted';

export type TireMeasurementSource =
  | 'manual'
  | 'manual_registration'
  | 'workshop'
  | 'ai_confirmed'
  | 'calibration';

export type TireReplacementScope = 'single' | 'axle' | 'full_set';

export interface RecordTireMeasurementCommand {
  vehicleId: string;
  tireSetupId?: string;
  frontLeftMm?: number;
  frontRightMm?: number;
  rearLeftMm?: number;
  rearRightMm?: number;
  odometerKm?: number;
  /** When true (or workshop source), client odometer is stored for ground-truth V3 evidence — not inferred telemetry. */
  manualConfirmOdometer?: boolean;
  measuredAt?: Date | string;
  source?: string;
  workshopName?: string;
  userId?: string;
  documentExtractionId?: string;
  /** @deprecated Prefer documentExtractionId */
  linkedExtractionId?: string;
  linkedDocumentUrl?: string;
  notes?: string;
  quality?: 'measured' | 'estimated' | 'mixed';
  shouldCalibrate?: boolean;
  triggerRecalculate?: boolean;
}

export interface ReplaceTiresCommand {
  vehicleId: string;
  scope: TireReplacementScope;
  positions?: string[];
  odometerKm?: number;
  manualConfirmOdometer?: boolean;
  notes?: string;
  userId?: string;
  workshopName?: string;
  newSetup?: {
    name?: string;
    brandModelFront?: string;
    brandModelRear?: string;
    frontDimension?: string;
    rearDimension?: string;
    tireSeason?: string;
    initialTreadDepthMm?: number;
    initialTreadFrontMm?: number;
    initialTreadRearMm?: number;
    tireCondition?: string;
  };
}

export interface ActivateStoredSetCommand {
  vehicleId: string;
  organizationId?: string;
  storedSetupId?: string;
  odometerKm?: number;
  manualConfirmOdometer?: boolean;
  notes?: string;
  userId?: string;
}

export interface StoreTireSetCommand {
  vehicleId: string;
  organizationId?: string;
  tireSetupId?: string;
  odometerKm?: number;
  manualConfirmOdometer?: boolean;
  notes?: string;
  userId?: string;
}

export interface RemoveTireSetCommand {
  vehicleId: string;
  organizationId?: string;
  tireSetupId?: string;
  odometerKm?: number;
  manualConfirmOdometer?: boolean;
  notes?: string;
  userId?: string;
}

export interface RetireTireCommand {
  vehicleId: string;
  organizationId?: string;
  position: string;
  odometerKm?: number;
  manualConfirmOdometer?: boolean;
  notes?: string;
  userId?: string;
}

export interface UpsertVehicleTireInput {
  vehicleId: string;
  organizationId: string;
  frontDimension?: string | null;
  rearDimension?: string | null;
  brandModelFront?: string | null;
  brandModelRear?: string | null;
  tireSeason?: string | null;
  loadIndexFront?: string | null;
  speedIndexFront?: string | null;
  loadIndexRear?: string | null;
  speedIndexRear?: string | null;
  dotCodeFront?: string | null;
  dotCodeRear?: string | null;
  treadFL?: number | null;
  treadFR?: number | null;
  treadBL?: number | null;
  treadBR?: number | null;
  tireCondition?: string | null;
  source?: string;
}

const SOURCE_MAP: Record<string, TireMeasurementSource> = {
  manual: 'manual',
  manual_edit: 'manual',
  manual_registration: 'manual_registration',
  documented_registration: 'manual_registration',
  registration: 'manual_registration',
  workshop: 'workshop',
  ai_upload: 'ai_confirmed',
  ai_confirmed: 'ai_confirmed',
  calibration: 'calibration',
};

function trimOrNull(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function normalizeMeasurementSource(source?: string | null): TireMeasurementSource {
  const key = String(source ?? 'manual').trim().toLowerCase();
  return SOURCE_MAP[key] ?? 'manual';
}

export function normalizeWheelPosition(pos?: string | null): WheelPos | null {
  if (!pos) return null;
  const key = String(pos).trim().toUpperCase();
  if (key === 'FL' || key === 'FR' || key === 'RL' || key === 'RR') return key as WheelPos;
  if (key === 'FRONT_LEFT') return 'FL';
  if (key === 'FRONT_RIGHT') return 'FR';
  if (key === 'REAR_LEFT' || key === 'BACK_LEFT') return 'RL';
  if (key === 'REAR_RIGHT' || key === 'BACK_RIGHT') return 'RR';
  return null;
}

export function resolveReplacementPositions(
  scope: TireReplacementScope,
  positions?: string[],
): WheelPos[] {
  if (scope === 'full_set') return ['FL', 'FR', 'RL', 'RR'];

  const normalized = (positions ?? [])
    .map((p) => normalizeWheelPosition(p))
    .filter((p): p is WheelPos => p != null);

  if (scope === 'single') {
    if (normalized.length !== 1) {
      throw new BadRequestException('Single tire replacement requires exactly one wheel position.');
    }
    return normalized;
  }

  // axle replacement
  const raw = (positions ?? []).map((p) => String(p).trim().toUpperCase());
  if (raw.includes('FRONT') || raw.includes('FRONT_AXLE')) return ['FL', 'FR'];
  if (raw.includes('REAR') || raw.includes('REAR_AXLE')) return ['RL', 'RR'];

  const unique = Array.from(new Set(normalized));
  if (unique.length === 2 && unique.every((p) => p.startsWith('F'))) return ['FL', 'FR'];
  if (unique.length === 2 && unique.every((p) => p.startsWith('R'))) return ['RL', 'RR'];

  throw new BadRequestException(
    'Axle replacement requires FRONT_AXLE/REAR_AXLE or two wheel positions on the same axle.',
  );
}

function toDbPosition(pos: WheelPos): 'FRONT_LEFT' | 'FRONT_RIGHT' | 'REAR_LEFT' | 'REAR_RIGHT' {
  if (pos === 'FL') return 'FRONT_LEFT';
  if (pos === 'FR') return 'FRONT_RIGHT';
  if (pos === 'RL') return 'REAR_LEFT';
  return 'REAR_RIGHT';
}

function fromDbPosition(pos: string): WheelPos {
  if (pos === 'FRONT_LEFT') return 'FL';
  if (pos === 'FRONT_RIGHT') return 'FR';
  if (pos === 'REAR_LEFT') return 'RL';
  return 'RR';
}

@Injectable()
export class TireLifecycleService {
  private readonly logger = new Logger(TireLifecycleService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly wearModel: TireWearModelService,
    private readonly tireHealthService: TireHealthService,
    private readonly tireHealthAlertService: TireHealthAlertService,
    private readonly tireIdentity: TireIdentityService,
    @Optional() private readonly observability?: TireHealthObservabilityService,
    @Optional() private readonly tireWearV3PriorService?: TireWearV3PriorService,
  ) {}

  async recordMeasurement(command: RecordTireMeasurementCommand) {
    const setup = await this.resolveSetupForMeasurement(command.vehicleId, command.tireSetupId);
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: command.vehicleId },
      select: { organizationId: true },
    });
    if (!vehicle) throw new BadRequestException('Vehicle not found.');

    const values = this.extractMeasurementValues(command);
    if (values.count === 0) {
      throw new BadRequestException('At least one wheel measurement is required.');
    }

    const treadError = validateTreadMmValues(values);
    if (treadError) {
      throw new BadRequestException(treadError);
    }

    const source = normalizeMeasurementSource(command.source);
    const measuredAt = command.measuredAt ? new Date(command.measuredAt) : new Date();
    const shouldCalibrate = command.shouldCalibrate ?? true;
    const triggerRecalculate = command.triggerRecalculate ?? true;
    const evidenceSource = resolveEvidenceFromLegacySource(command.source ?? source, {
      linkedDocumentUrl: command.linkedDocumentUrl,
      workshopName: command.workshopName,
      modelProjected: source === 'calibration',
    });

    const odometerContext = await this.fetchVehicleOdometerContext(command.vehicleId);
    const inferredAnchor = resolveInferredMeasurementOdometerKm(command, odometerContext);
    const explicitOdometerKm = resolveExplicitMeasurementOdometerKm(command);
    const groundTruth = isGroundTruthMeasurementCommand(source, evidenceSource);
    if (
      groundTruth &&
      explicitOdometerKm != null &&
      isOdometerExplicitlyConfirmed(command)
    ) {
      const plausibility = assessOdometerPlausibility(
        explicitOdometerKm,
        odometerContext.lastKnownOdometerKm,
      );
      if (!plausibility.plausible) {
        throw new BadRequestException(
          `Odometer at measurement time is not plausible (${plausibility.issue ?? 'UNKNOWN'}). Correct the reading or save tread without odometer confirmation for V3.`,
        );
      }
    }
    const blockInferredOdometer =
      isVerificationExcludedLegacySource(source) ||
      isRegistrationBaselineLegacySource(source);
    const resolvedOdometer = resolvePersistedMeasurementOdometerKm({
      groundTruth,
      explicitOdometerKm,
      inferredOdometerKm: blockInferredOdometer ? null : inferredAnchor.odometerKm,
    });

    const mountPeriod = await this.resolveActiveMountPeriodForSetup(setup.id, measuredAt, setup);

    const measurement = await this.prisma.vehicleTireTreadMeasurement.create({
      data: {
        vehicleId: command.vehicleId,
        tireSetupId: setup.id,
        documentExtractionId: command.documentExtractionId ?? command.linkedExtractionId ?? null,
        frontLeftMm: values.frontLeftMm,
        frontRightMm: values.frontRightMm,
        rearLeftMm: values.rearLeftMm,
        rearRightMm: values.rearRightMm,
        odometerAtMeasurement: resolvedOdometer,
        source,
        workshopName: command.workshopName ?? null,
        isCalibrationPoint: shouldCalibrate,
        measuredAt,
        evidenceSource,
      },
    });

    const baselineFields = buildSetupBaselineFields({
      treadByPosition: {
        FL: values.frontLeftMm,
        FR: values.frontRightMm,
        RL: values.rearLeftMm,
        RR: values.rearRightMm,
      },
      legacySource: command.source ?? source,
      linkedDocumentUrl: command.linkedDocumentUrl,
      workshopName: command.workshopName,
      measuredAt,
      evidenceId: measurement.id,
      modelProjected: source === 'calibration',
    });
    await this.prisma.vehicleTireSetup.update({
      where: { id: setup.id },
      data: {
        ...baselineFields,
        initialTreadEvidenceId: measurement.id,
      },
    });

    const kFactors = shouldCalibrate
      ? await this.wearModel.calibrateFromMeasurement(setup.id, {
          frontLeftMm: values.frontLeftMm ?? undefined,
          frontRightMm: values.frontRightMm ?? undefined,
          rearLeftMm: values.rearLeftMm ?? undefined,
          rearRightMm: values.rearRightMm ?? undefined,
        })
      : null;

    await this.prisma.tireEvent.create({
      data: {
        organizationId: vehicle.organizationId,
        vehicleId: command.vehicleId,
        tireSetId: setup.id,
        type: TireEventType.MEASUREMENT,
        payload: {
          command: 'recordMeasurement',
          source,
          quality: command.quality ?? (source === 'calibration' ? 'mixed' : 'measured'),
          measuredAt: measuredAt.toISOString(),
          odometerKm: resolvedOdometer,
          values: {
            FL: values.frontLeftMm,
            FR: values.frontRightMm,
            RL: values.rearLeftMm,
            RR: values.rearRightMm,
          },
          workshopName: command.workshopName ?? null,
          linkedExtractionId:
            command.documentExtractionId ?? command.linkedExtractionId ?? null,
          documentExtractionId: command.documentExtractionId ?? command.linkedExtractionId ?? null,
          linkedDocumentUrl: command.linkedDocumentUrl ?? null,
          notes: command.notes ?? null,
          calibrationApplied: shouldCalibrate,
          kFactors,
        },
        createdBy: command.userId ?? null,
      },
    });

    if (triggerRecalculate) {
      await this.tireHealthService.recalculate(command.vehicleId);
    }

    let v3Ingestion: TireMeasurementV3IngestionAssessment | null = null;
    let v3Recompute: TireMeasurementV3RecomputeResult = { status: 'skipped' };
    if (this.tireWearV3PriorService) {
      try {
        const priorResult = await this.tireWearV3PriorService.computeForSetup(setup.id, {
          persistShadow: false,
        });
        v3Ingestion = assessV3Ingestion({
          legacySource: source,
          evidenceSource,
          measuredAt,
          mountPeriod,
          explicitOdometerKm,
          inferredAnchor,
          treadValues: values,
          priorResult,
          workshopName: command.workshopName ?? null,
        });
        v3Recompute = { status: 'ok' };
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        this.logger.error({
          event: 'tire_measurement_v3_recompute_failed',
          vehicleId: command.vehicleId,
          tireSetupId: setup.id,
          measurementId: measurement.id,
          organizationId: vehicle.organizationId,
          errorMessage,
        });
        v3Recompute = {
          status: 'failed',
          code: 'V3_RECOMPUTE_FAILED',
          message:
            'Measurement was saved; Tire V3 reassessment failed and verification eligibility could not be updated.',
        };
        v3Ingestion = {
          verificationEligible: false,
          posteriorCalibrationEligible: false,
          evidenceClass: 'EXCLUDED_SOURCE',
          verificationStatus: null,
          warnings: [
            {
              code: 'V3_RECOMPUTE_FAILED',
              message: v3Recompute.message!,
            },
          ],
        };
      }
    }

    this.observability?.recordMeasurement({ source });

    return { measurement, kFactors, source, v3Ingestion, v3Recompute };
  }

  async findMeasurementByDocumentExtractionId(vehicleId: string, documentExtractionId: string) {
    return this.prisma.vehicleTireTreadMeasurement.findUnique({
      where: {
        vehicleId_documentExtractionId: {
          vehicleId,
          documentExtractionId,
        },
      },
    });
  }

  async applyMeasurementFromDocumentExtraction(input: {
    vehicleId: string;
    documentExtractionId: string;
    documentActionIdempotencyKey?: string | null;
    measurementDate: Date;
    treadDepthUnit: 'mm';
    pressureUnit?: string | null;
    odometerKm?: number | null;
    workshopName?: string | null;
    frontLeftMm?: number | null;
    frontRightMm?: number | null;
    rearLeftMm?: number | null;
    rearRightMm?: number | null;
    documentUrl?: string | null;
  }) {
    if (!input.documentExtractionId) {
      throw new BadRequestException('documentExtractionId is required for extraction apply');
    }

    const existing = await this.findMeasurementByDocumentExtractionId(
      input.vehicleId,
      input.documentExtractionId,
    );
    if (existing) {
      return { measurementId: existing.id, reused: true as const };
    }

    try {
      const result = await this.recordMeasurement({
        vehicleId: input.vehicleId,
        frontLeftMm: input.frontLeftMm ?? undefined,
        frontRightMm: input.frontRightMm ?? undefined,
        rearLeftMm: input.rearLeftMm ?? undefined,
        rearRightMm: input.rearRightMm ?? undefined,
        odometerKm: input.odometerKm ?? undefined,
        measuredAt: input.measurementDate,
        workshopName: input.workshopName ?? undefined,
        source: 'ai_confirmed',
        documentExtractionId: input.documentExtractionId,
        linkedDocumentUrl: input.documentUrl ?? undefined,
        quality: 'measured',
        shouldCalibrate: true,
        triggerRecalculate: true,
      });

      return {
        measurementId: result.measurement.id,
        reused: false as const,
        treadDepthUnit: input.treadDepthUnit,
        pressureUnit: input.pressureUnit ?? null,
      };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const raced = await this.findMeasurementByDocumentExtractionId(
          input.vehicleId,
          input.documentExtractionId,
        );
        if (raced) {
          return { measurementId: raced.id, reused: true as const };
        }
      }
      throw error;
    }
  }

  async installTireSet(
    vehicleId: string,
    data: ReplaceTiresCommand['newSetup'] & {
      odometerKm?: number;
      manualConfirmOdometer?: boolean;
      documentEvidenceId?: string;
      notes?: string;
      userId?: string;
      archiveCurrent?: boolean;
      archiveStatus?: TireSetupStatus;
      recommendedPressureFrontBar?: number;
      recommendedPressureRearBar?: number;
      recommendedPressureLoadedFrontBar?: number;
      recommendedPressureLoadedRearBar?: number;
      pressureSpecSource?: string;
      confirmPressureSpec?: boolean;
    },
  ) {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
      select: { id: true, organizationId: true, fuelType: true, driveType: true },
    });
    if (!vehicle) throw new BadRequestException('Vehicle not found.');

    const anchor = await this.resolveSetupOdometerAnchor(vehicleId, {
      clientOdometerKm: data.odometerKm,
      manualConfirmed: data.manualConfirmOdometer,
      documentEvidenceId: data.documentEvidenceId,
    });
    const now = new Date();
    const archiveStatus = mapArchiveStatus(data.archiveStatus);

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const currentSetup = await tx.vehicleTireSetup.findFirst({
          where: {
            vehicleId,
            status: TireSetupStatus.ACTIVE,
            removedAt: null,
          },
          orderBy: { createdAt: 'desc' },
        });

        if (data.archiveCurrent !== false && currentSetup) {
          assertSetupStatusTransition(currentSetup.status, archiveStatus, 'archive on install');
          await this.tireIdentity.dismountAllForSetup(currentSetup.id, now, tx);
          await this.closeOpenMountPeriod(tx, currentSetup.id, now, anchor.odometerKm);
          await tx.vehicleTireSetup.update({
            where: { id: currentSetup.id },
            data: {
              removedAt: now,
              removedOdometerKm: anchor.odometerKm,
              status: archiveStatus,
              updatedBy: data.userId ?? null,
            },
          });
        }

        const fallback = currentSetup ?? null;
        const frontDimension = trimOrNull(data.frontDimension) ?? fallback?.frontDimension ?? null;
        const rearDimension = trimOrNull(data.rearDimension) ?? fallback?.rearDimension ?? frontDimension;
        const staggered = isStaggeredSetup({ frontDimension, rearDimension });
        const regen = this.wearModel.computePositionalRegenFactors(
          vehicle.fuelType ?? null,
          vehicle.driveType ?? null,
        );

        let pressurePersist: ReturnType<typeof buildRecommendedPressurePersistData> | null =
          null;
        if (data.pressureSpecSource) {
          try {
            pressurePersist = buildRecommendedPressurePersistData({
              recommendedPressureFrontBar: data.recommendedPressureFrontBar,
              recommendedPressureRearBar: data.recommendedPressureRearBar,
              recommendedPressureLoadedFrontBar: data.recommendedPressureLoadedFrontBar,
              recommendedPressureLoadedRearBar: data.recommendedPressureLoadedRearBar,
              pressureSpecSource: normalizeTirePressureSpecSource(
                data.pressureSpecSource,
              ) as TirePressureSpecSource,
              confirmPressureSpec: data.confirmPressureSpec,
            });
          } catch (err: any) {
            throw new BadRequestException(err?.message ?? 'Invalid pressure spec');
          }
        }

        const newSetup = await tx.vehicleTireSetup.create({
          data: {
            organizationId: vehicle.organizationId,
            vehicleId,
            name: trimOrNull(data.name) ?? fallback?.name ?? null,
            brandModelFront: trimOrNull(data.brandModelFront) ?? fallback?.brandModelFront ?? null,
            brandModelRear: trimOrNull(data.brandModelRear) ?? fallback?.brandModelRear ?? null,
            frontDimension,
            rearDimension,
            tireSeason: this.parseSeason(data.tireSeason, fallback?.tireSeason ?? TireSeason.ALL_SEASON),
            initialTreadDepthMm: data.initialTreadDepthMm ?? fallback?.initialTreadDepthMm ?? null,
            initialTreadFrontMm: data.initialTreadFrontMm ?? fallback?.initialTreadFrontMm ?? null,
            initialTreadRearMm: data.initialTreadRearMm ?? fallback?.initialTreadRearMm ?? null,
            isStaggered: staggered,
            regenBrakingFactor: regen.overall,
            regenBrakingFactorFront: regen.front,
            regenBrakingFactorRear: regen.rear,
            frontTireWidthMm: this.parseTireWidth(frontDimension),
            rearTireWidthMm: this.parseTireWidth(rearDimension),
            installedAt: now,
            status: TireSetupStatus.ACTIVE,
            createdBy: data.userId ?? null,
            tireCondition: this.parseCondition(data.tireCondition, fallback?.tireCondition ?? TireSetupCondition.UNKNOWN),
            ...buildSetupOdometerAnchorFields(anchor),
            loadIndexFront: fallback?.loadIndexFront ?? null,
            speedIndexFront: fallback?.speedIndexFront ?? null,
            loadIndexRear: fallback?.loadIndexRear ?? null,
            speedIndexRear: fallback?.speedIndexRear ?? null,
            dotCodeFront: fallback?.dotCodeFront ?? null,
            dotCodeRear: fallback?.dotCodeRear ?? null,
            aiTireSpec: fallback?.aiTireSpec ?? undefined,
            ...buildSetupBaselineFields({
              treadByPosition: {
                FL: data.initialTreadFrontMm ?? data.initialTreadDepthMm ?? undefined,
                FR: data.initialTreadFrontMm ?? data.initialTreadDepthMm ?? undefined,
                RL: data.initialTreadRearMm ?? data.initialTreadDepthMm ?? undefined,
                RR: data.initialTreadRearMm ?? data.initialTreadDepthMm ?? undefined,
              },
              setupInitialTreadFrontMm: data.initialTreadFrontMm ?? fallback?.initialTreadFrontMm,
              setupInitialTreadRearMm: data.initialTreadRearMm ?? fallback?.initialTreadRearMm,
              setupInitialTreadDepthMm: data.initialTreadDepthMm ?? fallback?.initialTreadDepthMm,
              aiTireSpec: fallback?.aiTireSpec as any,
              userConfirmedSpec: (fallback?.aiTireSpec as any)?.userConfirmedSpec,
            }),
            ...(pressurePersist ?? {}),
          },
        });

        await tx.vehicleTireSetupMountPeriod.create({
          data: buildMountPeriodCreateData({
            organizationId: vehicle.organizationId,
            tireSetupId: newSetup.id,
            installedAt: now,
            anchor,
          }),
        });

        await this.tireIdentity.createTireSet({
          setup: newSetup,
          treadByPosition: {
            FL: data.initialTreadFrontMm ?? data.initialTreadDepthMm ?? undefined,
            FR: data.initialTreadFrontMm ?? data.initialTreadDepthMm ?? undefined,
            RL: data.initialTreadRearMm ?? data.initialTreadDepthMm ?? undefined,
            RR: data.initialTreadRearMm ?? data.initialTreadDepthMm ?? undefined,
          },
          mountedAt: now,
          tx,
        });

        await tx.tireEvent.create({
          data: {
            organizationId: vehicle.organizationId,
            vehicleId,
            tireSetId: newSetup.id,
            type: TireEventType.INSTALL,
            payload: {
              command: 'installTireSet',
              odometerKm: anchor.odometerKm,
              odometerAnchor: {
                source: anchor.source,
                status: anchor.status,
                confidence: anchor.confidence,
                clientValueIgnored: anchor.clientValueIgnored,
              },
              notes: data.notes ?? null,
              archivedSetId: currentSetup?.id ?? null,
            },
            createdBy: data.userId ?? null,
          },
        });

        return { setup: newSetup, archivedSetupId: currentSetup?.id ?? null };
      });

      await this.tireHealthService.recalculate(vehicleId);
      return result;
    } catch (error) {
      rethrowLifecycleInvariantViolation(error);
    }
  }

  async rotateTires(
    vehicleId: string,
    data: { template: string; odometerKm?: number; notes?: string; userId?: string },
  ) {
    const setup = await this.getActiveSetup(vehicleId);
    if (!setup) throw new BadRequestException('No active tire setup.');
    assertHealthEligibleSetup(setup.status, 'rotateTires');

    if (isStaggeredSetup(setup) && !this.wearModel.isRotationAllowedForStaggered(data.template)) {
      throw new BadRequestException(
        `Rotation template "${data.template}" is not allowed for staggered tire setups.`,
      );
    }

    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
      select: { organizationId: true },
    });
    if (!vehicle) throw new BadRequestException('Vehicle not found.');

    const moveMap = this.getRotationMoves(data.template);
    if (Object.keys(moveMap).length === 0) {
      throw new BadRequestException(`Unknown rotation template: ${data.template}`);
    }

    const now = new Date();
    const resolvedOdometer = await this.resolveMeasurementOdometer(
      vehicleId,
      data.odometerKm,
      false,
    );
    const wear = await this.wearModel.computeWearAnalysis(vehicleId);

    await this.tireIdentity.ensureTiresForSetup({
      setup,
      treadByPosition: wear
        ? {
            FL: wear.frontLeftMm,
            FR: wear.frontRightMm,
            RL: wear.rearLeftMm,
            RR: wear.rearRightMm,
          }
        : undefined,
      mountedAt: setup.installedAt ?? now,
    });

    await this.tireIdentity.applyRotation({
      organizationId: vehicle.organizationId,
      vehicleId,
      tireSetId: setup.id,
      moveMap,
      changedAt: now,
      odometerKm: resolvedOdometer,
      rotationTemplate: data.template,
      notes: data.notes ?? null,
      userId: data.userId ?? null,
    });

    await this.prisma.tireEvent.create({
      data: {
        organizationId: vehicle.organizationId,
        vehicleId,
        tireSetId: setup.id,
        type: TireEventType.ROTATION,
        payload: {
          command: 'rotateTires',
          template: data.template,
          odometerKm: resolvedOdometer,
          notes: data.notes ?? null,
          moves: moveMap,
        },
        createdBy: data.userId ?? null,
      },
    });

    if (wear) {
      const oldByPos: Record<WheelPos, number> = {
        FL: wear.frontLeftMm,
        FR: wear.frontRightMm,
        RL: wear.rearLeftMm,
        RR: wear.rearRightMm,
      };
      const rotated: Record<WheelPos, number> = { ...oldByPos };
      for (const [fromPos, toPos] of Object.entries(moveMap)) {
        const from = fromDbPosition(fromPos);
        const to = fromDbPosition(toPos);
        rotated[to] = oldByPos[from];
      }

      await this.recordMeasurement({
        vehicleId,
        tireSetupId: setup.id,
        frontLeftMm: rotated.FL,
        frontRightMm: rotated.FR,
        rearLeftMm: rotated.RL,
        rearRightMm: rotated.RR,
        odometerKm: resolvedOdometer ?? undefined,
        measuredAt: now,
        source: 'calibration',
        notes: `Rotation anchor (${data.template})`,
        quality: 'mixed',
        shouldCalibrate: false,
        triggerRecalculate: false,
        userId: data.userId,
      });

      const tiresAfter = await this.tireIdentity.getActiveTiresForSetup(setup.id);
      await Promise.all(
        tiresAfter.map((tire) =>
          this.prisma.tire.update({
            where: { id: tire.id },
            data: {
              estimatedTreadMm: rotated[dbPosToWheel(tire.currentPosition)],
            },
          }),
        ),
      );
    }

    await this.tireHealthService.recalculate(vehicleId);
    return { success: true, template: data.template, scope: 'rotation' };
  }

  async replaceTires(command: ReplaceTiresCommand) {
    if (command.scope === 'full_set') {
      const installed = await this.installTireSet(command.vehicleId, {
        ...(command.newSetup ?? {}),
        odometerKm: command.odometerKm,
        manualConfirmOdometer: command.manualConfirmOdometer,
        notes: command.notes,
        userId: command.userId,
        archiveCurrent: true,
        archiveStatus: TireSetupStatus.STORED,
      });
      await this.prisma.tireEvent.create({
        data: {
          organizationId: installed.setup.organizationId as string,
          vehicleId: command.vehicleId,
          tireSetId: installed.setup.id,
          type: TireEventType.TIRE_CHANGE,
          payload: {
            command: 'replaceTires',
            scope: 'full_set',
            archivedSetupId: installed.archivedSetupId,
            odometerKm: command.odometerKm ?? null,
            notes: command.notes ?? null,
          },
          createdBy: command.userId ?? null,
        },
      });
      return {
        success: true,
        scope: 'full_set',
        newSetupId: installed.setup.id,
        archivedSetupId: installed.archivedSetupId,
      };
    }

    const setup = await this.getActiveSetup(command.vehicleId);
    if (!setup) throw new BadRequestException('No active tire setup.');
    assertHealthEligibleSetup(setup.status, 'replaceTires.partial');

    const positions = resolveReplacementPositions(command.scope, command.positions);
    const wear = await this.wearModel.computeWearAnalysis(command.vehicleId);
    if (!wear) {
      throw new BadRequestException(
        'Tire wear estimate unavailable. Please record a measurement before partial replacement.',
      );
    }

    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: command.vehicleId },
      select: { organizationId: true },
    });
    if (!vehicle) throw new BadRequestException('Vehicle not found.');

    const now = new Date();
    const resolvedOdometer = await this.resolveMeasurementOdometer(
      command.vehicleId,
      command.odometerKm,
      command.manualConfirmOdometer,
    );

    const values: Record<WheelPos, number> = {
      FL: wear.frontLeftMm,
      FR: wear.frontRightMm,
      RL: wear.rearLeftMm,
      RR: wear.rearRightMm,
    };

    for (const pos of positions) {
      const replacementMm = pos.startsWith('F')
        ? wear.referenceNewTreadFront
        : wear.referenceNewTreadRear;
      values[pos] = replacementMm;
    }

    const setupPatch = this.buildPartialSetupPatch(command, positions, setup);
    if (Object.keys(setupPatch).length > 0) {
      await this.prisma.vehicleTireSetup.update({
        where: { id: setup.id },
        data: setupPatch,
      });
    }

    await this.tireIdentity.ensureTiresForSetup({
      setup,
      treadByPosition: {
        FL: values.FL,
        FR: values.FR,
        RL: values.RL,
        RR: values.RR,
      },
      mountedAt: setup.installedAt ?? now,
    });

    for (const pos of positions) {
      const isFront = pos.startsWith('F');
      const replacementMm = values[pos];
      await this.tireIdentity.replaceAtPosition({
        organizationId: vehicle.organizationId,
        vehicleId: command.vehicleId,
        tireSetId: setup.id,
        position: pos,
        initialTreadDepthMm: replacementMm,
        brand: isFront
          ? command.newSetup?.brandModelFront ?? setup.brandModelFront
          : command.newSetup?.brandModelRear ?? setup.brandModelRear,
        tireModel: isFront
          ? command.newSetup?.brandModelFront ?? setup.brandModelFront
          : command.newSetup?.brandModelRear ?? setup.brandModelRear,
        dotCode: isFront ? setup.dotCodeFront : setup.dotCodeRear,
        seasonType: setup.tireSeason,
        odometerKm: resolvedOdometer,
        notes: command.notes ?? null,
        userId: command.userId ?? null,
        mountedAt: now,
        workshopName: command.workshopName ?? null,
      });
    }

    await this.prisma.tireEvent.create({
      data: {
        organizationId: vehicle.organizationId,
        vehicleId: command.vehicleId,
        tireSetId: setup.id,
        type: TireEventType.TIRE_CHANGE,
        payload: {
          command: 'replaceTires',
          scope: command.scope,
          positions,
          odometerKm: resolvedOdometer,
          notes: command.notes ?? null,
        },
        createdBy: command.userId ?? null,
      },
    });

    await this.recordMeasurement({
      vehicleId: command.vehicleId,
      tireSetupId: setup.id,
      frontLeftMm: values.FL,
      frontRightMm: values.FR,
      rearLeftMm: values.RL,
      rearRightMm: values.RR,
      odometerKm: resolvedOdometer ?? undefined,
      measuredAt: now,
      source: command.workshopName ? 'workshop' : 'calibration',
      workshopName: command.workshopName,
      notes: command.notes ?? undefined,
      quality: 'mixed',
      shouldCalibrate: false,
      triggerRecalculate: false,
      userId: command.userId,
    });

    await this.tireHealthService.recalculate(command.vehicleId);

    return {
      success: true,
      scope: command.scope,
      positions,
      activeSetupId: setup.id,
    };
  }

  async activateStoredSet(command: ActivateStoredSetCommand) {
    const vehicle = await this.assertVehicleAccess(command.vehicleId, command.organizationId);

    const target = command.storedSetupId
      ? await this.prisma.vehicleTireSetup.findFirst({
          where: {
            id: command.storedSetupId,
            vehicleId: command.vehicleId,
            status: TireSetupStatus.STORED,
          },
        })
      : await this.prisma.vehicleTireSetup.findFirst({
          where: {
            vehicleId: command.vehicleId,
            status: TireSetupStatus.STORED,
          },
          orderBy: { updatedAt: 'desc' },
        });

    if (!target) {
      throw new BadRequestException('No stored tire set available for activation.');
    }

    const active = await this.getActiveSetup(command.vehicleId);
    if (active?.id === target.id) {
      return { success: true, activeSetupId: target.id, alreadyActive: true };
    }

    const now = new Date();
    const anchor = await this.resolveSetupOdometerAnchor(command.vehicleId, {
      clientOdometerKm: command.odometerKm,
      manualConfirmed: command.manualConfirmOdometer,
    });
    const preservedKm = {
      totalKmOnSet: target.totalKmOnSet,
      cityKm: target.cityKm,
      highwayKm: target.highwayKm,
      ruralKm: target.ruralKm,
    };

    try {
      await this.prisma.$transaction(async (tx) => {
        if (active) {
          assertSetupStatusTransition(active.status, TireSetupStatus.STORED, 'deactivate on reactivation');
          await this.tireIdentity.dismountAllForSetup(active.id, now, tx);
          await this.closeOpenMountPeriod(tx, active.id, now, anchor.odometerKm);
          await tx.vehicleTireSetup.update({
            where: { id: active.id },
            data: {
              status: TireSetupStatus.STORED,
              removedAt: now,
              removedOdometerKm: anchor.odometerKm,
              updatedBy: command.userId ?? null,
            },
          });
        }

        assertSetupStatusTransition(target.status, TireSetupStatus.ACTIVE, 'activateStoredSet');
        await tx.vehicleTireSetup.update({
          where: { id: target.id },
          data: {
            status: TireSetupStatus.ACTIVE,
            removedAt: null,
            removedOdometerKm: null,
            installedAt: now,
            updatedBy: command.userId ?? null,
            totalKmOnSet: preservedKm.totalKmOnSet,
            cityKm: preservedKm.cityKm,
            highwayKm: preservedKm.highwayKm,
            ruralKm: preservedKm.ruralKm,
            ...buildSetupOdometerAnchorFields(anchor),
          },
        });

        await tx.vehicleTireSetupMountPeriod.create({
          data: buildMountPeriodCreateData({
            organizationId: vehicle.organizationId,
            tireSetupId: target.id,
            installedAt: now,
            anchor,
          }),
        });

        await this.tireIdentity.remountStoredSetupTires(
          {
            organizationId: vehicle.organizationId,
            vehicleId: command.vehicleId,
            tireSetId: target.id,
            mountedAt: now,
            odometerKm: anchor.odometerKm,
            notes: command.notes ?? null,
            userId: command.userId ?? null,
          },
          tx,
        );

        await this.tireIdentity.ensureTiresForSetup({
          setup: target,
          mountedAt: now,
          measuredAt: now,
          tx,
        });

        await tx.tireEvent.create({
          data: {
            organizationId: vehicle.organizationId,
            vehicleId: command.vehicleId,
            tireSetId: target.id,
            type: TireEventType.INSTALL,
            payload: {
              command: 'activateStoredSet',
              previousActiveSetId: active?.id ?? null,
              activatedStoredSetId: target.id,
              odometerKm: anchor.odometerKm,
              odometerAnchor: {
                source: anchor.source,
                status: anchor.status,
                confidence: anchor.confidence,
                clientValueIgnored: anchor.clientValueIgnored,
              },
              notes: command.notes ?? null,
              preservedKm,
            },
            createdBy: command.userId ?? null,
          },
        });
      });
    } catch (error) {
      rethrowLifecycleInvariantViolation(error);
    }

    await this.tireHealthService.recalculate(command.vehicleId);

    return {
      success: true,
      activeSetupId: target.id,
      previousActiveSetId: active?.id ?? null,
      preservedKm,
    };
  }

  async storeTireSet(command: StoreTireSetCommand) {
    const vehicle = await this.assertVehicleAccess(command.vehicleId, command.organizationId);
    const setup = command.tireSetupId
      ? await this.prisma.vehicleTireSetup.findFirst({
          where: { id: command.tireSetupId, vehicleId: command.vehicleId },
        })
      : await this.getActiveSetup(command.vehicleId);

    if (!setup) throw new BadRequestException('No tire setup found to store.');
    if (setup.status !== TireSetupStatus.ACTIVE) {
      throw new BadRequestException('Only ACTIVE tire setups can be stored.');
    }

    const now = new Date();
    const resolvedOdometer = await this.resolveMeasurementOdometer(
      command.vehicleId,
      command.odometerKm,
      command.manualConfirmOdometer,
    );

    await this.prisma.$transaction(async (tx) => {
      assertSetupStatusTransition(setup.status, TireSetupStatus.STORED, 'storeTireSet');
      await this.tireIdentity.dismountAllForSetup(setup.id, now, tx);
      await this.closeOpenMountPeriod(tx, setup.id, now, resolvedOdometer);
      await tx.vehicleTireSetup.update({
        where: { id: setup.id },
        data: {
          status: TireSetupStatus.STORED,
          removedAt: now,
          removedOdometerKm: resolvedOdometer,
          updatedBy: command.userId ?? null,
        },
      });
      await tx.tireEvent.create({
        data: {
          organizationId: vehicle.organizationId,
          vehicleId: command.vehicleId,
          tireSetId: setup.id,
          type: TireEventType.REMOVE,
          payload: {
            command: 'storeTireSet',
            odometerKm: resolvedOdometer,
            notes: command.notes ?? null,
            preservedKm: {
              totalKmOnSet: setup.totalKmOnSet,
              cityKm: setup.cityKm,
              highwayKm: setup.highwayKm,
              ruralKm: setup.ruralKm,
            },
          },
          createdBy: command.userId ?? null,
        },
      });
    });

    await this.tireHealthAlertService.resolveOpenAlertsForSetup(
      setup.id,
      TireHealthAlertResolutionReason.SETUP_STORED,
    );

    return { success: true, storedSetupId: setup.id };
  }

  async removeTireSet(command: RemoveTireSetCommand) {
    const vehicle = await this.assertVehicleAccess(command.vehicleId, command.organizationId);
    const setup = command.tireSetupId
      ? await this.prisma.vehicleTireSetup.findFirst({
          where: { id: command.tireSetupId, vehicleId: command.vehicleId },
        })
      : await this.getActiveSetup(command.vehicleId);

    if (!setup) throw new BadRequestException('No tire setup found to remove.');
    if (setup.status === TireSetupStatus.REMOVED || setup.status === TireSetupStatus.RETIRED) {
      throw new BadRequestException('Tire setup is already terminal.');
    }

    const now = new Date();
    const resolvedOdometer = await this.resolveMeasurementOdometer(
      command.vehicleId,
      command.odometerKm,
      command.manualConfirmOdometer,
    );

    await this.prisma.$transaction(async (tx) => {
      assertSetupStatusTransition(setup.status, TireSetupStatus.REMOVED, 'removeTireSet');
      if (setup.status === TireSetupStatus.ACTIVE) {
        await this.tireIdentity.dismountAllForSetup(setup.id, now, tx);
        await this.closeOpenMountPeriod(tx, setup.id, now, resolvedOdometer);
      }
      await tx.vehicleTireSetup.update({
        where: { id: setup.id },
        data: {
          status: TireSetupStatus.REMOVED,
          removedAt: setup.removedAt ?? now,
          removedOdometerKm: setup.removedOdometerKm ?? resolvedOdometer,
          updatedBy: command.userId ?? null,
        },
      });
      await tx.tireEvent.create({
        data: {
          organizationId: vehicle.organizationId,
          vehicleId: command.vehicleId,
          tireSetId: setup.id,
          type: TireEventType.REMOVE,
          payload: {
            command: 'removeTireSet',
            odometerKm: resolvedOdometer,
            notes: command.notes ?? null,
          },
          createdBy: command.userId ?? null,
        },
      });
    });

    return { success: true, removedSetupId: setup.id };
  }

  async retireTire(command: RetireTireCommand) {
    const vehicle = await this.assertVehicleAccess(command.vehicleId, command.organizationId);
    const setup = await this.getActiveSetup(command.vehicleId);
    if (!setup) throw new BadRequestException('No active tire setup.');

    const position = normalizeWheelPosition(command.position);
    if (!position) throw new BadRequestException('Invalid wheel position.');

    const now = new Date();
    const resolvedOdometer = await this.resolveMeasurementOdometer(
      command.vehicleId,
      command.odometerKm,
      command.manualConfirmOdometer,
    );

    const retired = await this.prisma.$transaction(async (tx) => {
      const tire = await this.tireIdentity.retireTireAtPosition(
        {
          organizationId: vehicle.organizationId,
          vehicleId: command.vehicleId,
          tireSetId: setup.id,
          position,
          retiredAt: now,
          odometerKm: resolvedOdometer,
          notes: command.notes ?? null,
          userId: command.userId ?? null,
        },
        tx,
      );
      if (!tire) {
        throw new BadRequestException(`No active tire at position ${position}.`);
      }
      await tx.tireEvent.create({
        data: {
          organizationId: vehicle.organizationId,
          vehicleId: command.vehicleId,
          tireSetId: setup.id,
          tireId: tire.id,
          type: TireEventType.REMOVE,
          payload: {
            command: 'retireTire',
            position,
            odometerKm: resolvedOdometer,
            notes: command.notes ?? null,
            preservedKmOnTire: tire.totalKmOnTire,
          },
          createdBy: command.userId ?? null,
        },
      });
      return tire;
    });

    await this.tireHealthService.recalculate(command.vehicleId);
    return { success: true, tireId: retired.id, position };
  }

  async upsertSetupAndMeasurement(input: UpsertVehicleTireInput) {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: input.vehicleId, organizationId: input.organizationId },
      include: {
        tireSetups: {
          where: { status: TireSetupStatus.ACTIVE, removedAt: null },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });
    if (!vehicle) throw new BadRequestException('Vehicle not found');

    const hasSetupData = [
      input.frontDimension,
      input.rearDimension,
      input.brandModelFront,
      input.brandModelRear,
      input.tireSeason,
      input.loadIndexFront,
      input.speedIndexFront,
      input.loadIndexRear,
      input.speedIndexRear,
      input.dotCodeFront,
      input.dotCodeRear,
      input.tireCondition,
    ].some((v) => v != null && String(v).trim() !== '');

    const hasMeasurement =
      input.treadFL != null ||
      input.treadFR != null ||
      input.treadBL != null ||
      input.treadBR != null;

    if (!hasSetupData && !hasMeasurement) {
      return { setup: null, measurement: null };
    }

    let setup = vehicle.tireSetups[0] ?? null;
    const frontAvg =
      input.treadFL != null && input.treadFR != null
        ? (input.treadFL + input.treadFR) / 2
        : (input.treadFL ?? input.treadFR ?? null);
    const rearAvg =
      input.treadBL != null && input.treadBR != null
        ? (input.treadBL + input.treadBR) / 2
        : (input.treadBL ?? input.treadBR ?? null);
    const overallAvg =
      frontAvg != null && rearAvg != null
        ? (frontAvg + rearAvg) / 2
        : (frontAvg ?? rearAvg ?? null);

    if (!setup) {
      const installed = await this.installTireSet(input.vehicleId, {
        name: null as any,
        brandModelFront: input.brandModelFront ?? undefined,
        brandModelRear: input.brandModelRear ?? undefined,
        frontDimension: input.frontDimension ?? undefined,
        rearDimension: input.rearDimension ?? undefined,
        tireSeason: input.tireSeason ?? undefined,
        initialTreadDepthMm: overallAvg ?? undefined,
        initialTreadFrontMm: frontAvg ?? undefined,
        initialTreadRearMm: rearAvg ?? undefined,
        tireCondition: input.tireCondition ?? undefined,
        archiveCurrent: false,
        userId: undefined,
      });
      setup = installed.setup;
      await this.prisma.vehicleTireSetup.update({
        where: { id: setup.id },
        data: {
          loadIndexFront: trimOrNull(input.loadIndexFront) ?? null,
          speedIndexFront: trimOrNull(input.speedIndexFront) ?? null,
          loadIndexRear: trimOrNull(input.loadIndexRear) ?? null,
          speedIndexRear: trimOrNull(input.speedIndexRear) ?? null,
          dotCodeFront: trimOrNull(input.dotCodeFront) ?? null,
          dotCodeRear: trimOrNull(input.dotCodeRear) ?? null,
        },
      });
      setup =
        (await this.prisma.vehicleTireSetup.findUnique({
          where: { id: setup.id },
        })) ?? setup;
    } else {
      const patch: Record<string, any> = {};
      if (trimOrNull(input.frontDimension) != null) patch.frontDimension = trimOrNull(input.frontDimension);
      if (trimOrNull(input.rearDimension) != null) patch.rearDimension = trimOrNull(input.rearDimension);
      if (trimOrNull(input.brandModelFront) != null) patch.brandModelFront = trimOrNull(input.brandModelFront);
      if (trimOrNull(input.brandModelRear) != null) patch.brandModelRear = trimOrNull(input.brandModelRear);
      if (input.tireSeason != null) patch.tireSeason = this.parseSeason(input.tireSeason, setup.tireSeason);
      if (input.loadIndexFront != null) patch.loadIndexFront = trimOrNull(input.loadIndexFront);
      if (input.speedIndexFront != null) patch.speedIndexFront = trimOrNull(input.speedIndexFront);
      if (input.loadIndexRear != null) patch.loadIndexRear = trimOrNull(input.loadIndexRear);
      if (input.speedIndexRear != null) patch.speedIndexRear = trimOrNull(input.speedIndexRear);
      if (input.dotCodeFront != null) patch.dotCodeFront = trimOrNull(input.dotCodeFront);
      if (input.dotCodeRear != null) patch.dotCodeRear = trimOrNull(input.dotCodeRear);
      if (input.tireCondition != null) patch.tireCondition = this.parseCondition(input.tireCondition, setup.tireCondition);
      if (setup.initialTreadFrontMm == null && frontAvg != null) patch.initialTreadFrontMm = frontAvg;
      if (setup.initialTreadRearMm == null && rearAvg != null) patch.initialTreadRearMm = rearAvg;
      if (setup.initialTreadDepthMm == null && overallAvg != null) patch.initialTreadDepthMm = overallAvg;
      if (hasMeasurement) {
        Object.assign(
          patch,
          buildSetupBaselineFields({
            treadByPosition: {
              FL: input.treadFL,
              FR: input.treadFR,
              RL: input.treadBL,
              RR: input.treadBR,
            },
            legacySource: input.source ?? 'manual_registration',
          }),
        );
      }
      if (Object.keys(patch).length > 0) {
        await this.prisma.vehicleTireSetup.update({
          where: { id: setup.id },
          data: patch,
        });
      }
      setup =
        (await this.prisma.vehicleTireSetup.findUnique({
          where: { id: setup.id },
        })) ?? setup;
    }

    let measurement: any = null;
    if (hasMeasurement && setup) {
      const measured = await this.recordMeasurement({
        vehicleId: input.vehicleId,
        tireSetupId: setup.id,
        frontLeftMm: input.treadFL ?? undefined,
        frontRightMm: input.treadFR ?? undefined,
        rearLeftMm: input.treadBL ?? undefined,
        rearRightMm: input.treadBR ?? undefined,
        source: input.source ?? 'manual_registration',
        quality: 'measured',
        shouldCalibrate: false,
        triggerRecalculate: true,
      });
      measurement = measured.measurement;
    } else if (setup) {
      await this.tireHealthService.recalculate(input.vehicleId);
    }

    return { setup, measurement };
  }

  private async assertVehicleAccess(vehicleId: string, organizationId?: string) {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
      select: { organizationId: true },
    });
    if (!vehicle) throw new BadRequestException('Vehicle not found.');
    if (organizationId && vehicle.organizationId !== organizationId) {
      throw new BadRequestException('Vehicle does not belong to this organization.');
    }
    return vehicle;
  }

  private async resolveActiveMountPeriodForSetup(
    setupId: string,
    asOf: Date,
    setup: {
      installedAt: Date | null;
      removedAt: Date | null;
      installedOdometerKm: number | null;
      odometerAnchorStatus: import('@prisma/client').TireOdometerAnchorStatus | null;
    },
  ) {
    const periods = await this.prisma.vehicleTireSetupMountPeriod.findMany({
      where: { tireSetupId: setupId },
      select: {
        id: true,
        installedAt: true,
        removedAt: true,
        installedOdometerKm: true,
        odometerAnchorStatus: true,
      },
    });
    return resolveActiveMountPeriod(periods, asOf, {
      installedAt: setup.installedAt,
      removedAt: setup.removedAt,
      installedOdometerKm: setup.installedOdometerKm,
      odometerAnchorStatus: setup.odometerAnchorStatus,
    });
  }

  private async resolveSetupForMeasurement(vehicleId: string, tireSetupId?: string) {
    if (tireSetupId) {
      const setup = await this.prisma.vehicleTireSetup.findUnique({
        where: { id: tireSetupId },
      });
      if (!setup || setup.vehicleId !== vehicleId) {
        throw new BadRequestException('Tire setup does not belong to this vehicle.');
      }
      return setup;
    }
    const active = await this.getActiveSetup(vehicleId);
    if (!active) throw new BadRequestException('No active tire setup found.');
    return active;
  }

  private async getActiveSetup(vehicleId: string) {
    return this.prisma.vehicleTireSetup.findFirst({
      where: {
        vehicleId,
        status: TireSetupStatus.ACTIVE,
        removedAt: null,
      },
      orderBy: { createdAt: 'desc' },
      include: { measurements: { orderBy: { measuredAt: 'desc' }, take: 5 } },
    });
  }

  private async resolveSetupOdometerAnchor(
    vehicleId: string,
    opts?: {
      clientOdometerKm?: number | null;
      manualConfirmed?: boolean;
      documentEvidenceId?: string | null;
    },
  ): Promise<ResolvedOdometerAnchor> {
    const context = await this.fetchVehicleOdometerContext(vehicleId);
    return resolveOdometerAnchor({
      clientOdometerKm: opts?.clientOdometerKm,
      manualConfirmed: opts?.manualConfirmed,
      documentEvidenceId: opts?.documentEvidenceId,
      context,
    });
  }

  private async resolveMeasurementOdometer(
    vehicleId: string,
    odometerKm?: number | null,
    manualConfirmed?: boolean,
  ): Promise<number | null> {
    const anchor = await this.resolveSetupOdometerAnchor(vehicleId, {
      clientOdometerKm: odometerKm,
      manualConfirmed,
    });
    return anchor.odometerKm;
  }

  private async fetchVehicleOdometerContext(
    vehicleId: string,
  ): Promise<VehicleOdometerContext> {
    const [vehicle, latestState, lastSetup, recentEvents] = await Promise.all([
      this.prisma.vehicle.findUnique({
        where: { id: vehicleId },
        select: { mileageKm: true },
      }),
      this.prisma.vehicleLatestState.findUnique({
        where: { vehicleId },
        select: {
          odometerKm: true,
          providerSource: true,
          providerFetchedAt: true,
          sourceTimestamp: true,
          lastSeenAt: true,
          source: true,
        },
      }),
      this.prisma.vehicleTireSetup.findFirst({
        where: { vehicleId, removedOdometerKm: { not: null } },
        orderBy: { removedAt: 'desc' },
        select: { removedOdometerKm: true },
      }),
      this.prisma.tireEvent.findMany({
        where: { vehicleId },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: { payload: true },
      }),
    ]);

    const eventOdos = recentEvents
      .map((e) => toFiniteOdometerKm((e.payload as { odometerKm?: number } | null)?.odometerKm))
      .filter((v): v is number => v != null);
    const eventOdo = eventOdos.length > 0 ? Math.max(...eventOdos) : null;
    const lastKnown = [lastSetup?.removedOdometerKm, eventOdo, vehicle?.mileageKm]
      .map((v) => toFiniteOdometerKm(v))
      .filter((v): v is number => v != null)
      .reduce((max, v) => Math.max(max, v), Number.NEGATIVE_INFINITY);

    return {
      latestState,
      vehicleMileageKm: vehicle?.mileageKm ?? null,
      lastKnownOdometerKm: Number.isFinite(lastKnown) ? lastKnown : null,
    };
  }

  private async closeOpenMountPeriod(
    tx: Prisma.TransactionClient,
    tireSetupId: string,
    removedAt: Date,
    removedOdometerKm: number | null,
  ) {
    await tx.vehicleTireSetupMountPeriod.updateMany({
      where: { tireSetupId, removedAt: null },
      data: { removedAt, removedOdometerKm },
    });
  }

  private parseSeason(input: string | null | undefined, fallback: TireSeason): TireSeason {
    if (!input) return fallback;
    const key = String(input).toUpperCase().replace(/[^A-Z]/g, '_');
    if (key === 'SUMMER') return TireSeason.SUMMER;
    if (key === 'WINTER') return TireSeason.WINTER;
    if (key === 'ALL_SEASON' || key === 'ALL__SEASON') return TireSeason.ALL_SEASON;
    if (key === 'TRACK') return TireSeason.TRACK;
    return fallback;
  }

  private parseCondition(
    input: string | null | undefined,
    fallback: TireSetupCondition,
  ): TireSetupCondition {
    if (!input) return fallback;
    const key = String(input).toUpperCase().trim();
    if (key === 'NEW_INSTALLED') return TireSetupCondition.NEW_INSTALLED;
    if (key === 'ALREADY_MOUNTED') return TireSetupCondition.ALREADY_MOUNTED;
    return TireSetupCondition.UNKNOWN;
  }

  private parseTireWidth(dimension: string | null): number | null {
    if (!dimension) return null;
    const match = dimension.match(/^(\d{3})\//);
    if (match) return parseInt(match[1], 10);
    const fallback = dimension.match(/(\d{3})/);
    return fallback ? parseInt(fallback[1], 10) : null;
  }

  private extractMeasurementValues(command: RecordTireMeasurementCommand) {
    const frontLeftMm = command.frontLeftMm ?? null;
    const frontRightMm = command.frontRightMm ?? null;
    const rearLeftMm = command.rearLeftMm ?? null;
    const rearRightMm = command.rearRightMm ?? null;
    const count = [frontLeftMm, frontRightMm, rearLeftMm, rearRightMm].filter(
      (v) => v != null,
    ).length;
    return { frontLeftMm, frontRightMm, rearLeftMm, rearRightMm, count };
  }

  private getRotationMoves(template: string): Record<string, string> {
    switch (template) {
      case 'front_to_rear':
        return {
          FRONT_LEFT: 'REAR_LEFT',
          FRONT_RIGHT: 'REAR_RIGHT',
          REAR_LEFT: 'FRONT_LEFT',
          REAR_RIGHT: 'FRONT_RIGHT',
        };
      case 'cross':
        return {
          FRONT_LEFT: 'REAR_RIGHT',
          FRONT_RIGHT: 'REAR_LEFT',
          REAR_LEFT: 'FRONT_RIGHT',
          REAR_RIGHT: 'FRONT_LEFT',
        };
      case 'side_swap':
      case 'side_swap_only':
      case 'same_axle_swap':
        return {
          FRONT_LEFT: 'FRONT_RIGHT',
          FRONT_RIGHT: 'FRONT_LEFT',
          REAR_LEFT: 'REAR_RIGHT',
          REAR_RIGHT: 'REAR_LEFT',
        };
      case 'full_rotation':
        return {
          FRONT_LEFT: 'REAR_RIGHT',
          REAR_RIGHT: 'REAR_LEFT',
          REAR_LEFT: 'FRONT_RIGHT',
          FRONT_RIGHT: 'FRONT_LEFT',
        };
      default:
        return {};
    }
  }

  private buildPartialSetupPatch(
    command: ReplaceTiresCommand,
    positions: WheelPos[],
    currentSetup: any,
  ): Record<string, any> {
    const patch: Record<string, any> = {};
    const touchesFront = positions.some((p) => p.startsWith('F'));
    const touchesRear = positions.some((p) => p.startsWith('R'));
    const ns = command.newSetup;
    if (!ns) return patch;

    if (touchesFront) {
      if (trimOrNull(ns.brandModelFront) != null) patch.brandModelFront = trimOrNull(ns.brandModelFront);
      if (trimOrNull(ns.frontDimension) != null) patch.frontDimension = trimOrNull(ns.frontDimension);
      if (ns.initialTreadFrontMm != null) patch.initialTreadFrontMm = ns.initialTreadFrontMm;
    }
    if (touchesRear) {
      if (trimOrNull(ns.brandModelRear) != null) patch.brandModelRear = trimOrNull(ns.brandModelRear);
      if (trimOrNull(ns.rearDimension) != null) patch.rearDimension = trimOrNull(ns.rearDimension);
      if (ns.initialTreadRearMm != null) patch.initialTreadRearMm = ns.initialTreadRearMm;
    }
    if (ns.initialTreadDepthMm != null) patch.initialTreadDepthMm = ns.initialTreadDepthMm;
    if (ns.tireCondition != null) patch.tireCondition = this.parseCondition(ns.tireCondition, currentSetup.tireCondition);
    if (ns.tireSeason != null) patch.tireSeason = this.parseSeason(ns.tireSeason, currentSetup.tireSeason);

    if (patch.frontDimension != null || patch.rearDimension != null) {
      patch.isStaggered = isStaggeredSetup({
        frontDimension: patch.frontDimension ?? currentSetup.frontDimension,
        rearDimension: patch.rearDimension ?? currentSetup.rearDimension,
      });
      patch.frontTireWidthMm = this.parseTireWidth(patch.frontDimension ?? currentSetup.frontDimension);
      patch.rearTireWidthMm = this.parseTireWidth(patch.rearDimension ?? currentSetup.rearDimension);
    }

    return patch;
  }

  async updateRecommendedPressure(command: {
    vehicleId: string;
    tireSetupId: string;
    recommendedPressureFrontBar?: number;
    recommendedPressureRearBar?: number;
    recommendedPressureLoadedFrontBar?: number;
    recommendedPressureLoadedRearBar?: number;
    pressureSpecSource: string;
    confirmPressureSpec?: boolean;
    userId?: string;
    triggerRecalculate?: boolean;
  }) {
    const setup = await this.prisma.vehicleTireSetup.findFirst({
      where: {
        id: command.tireSetupId,
        vehicleId: command.vehicleId,
        removedAt: null,
      },
    });
    if (!setup) {
      throw new BadRequestException('Active tire setup not found.');
    }

    let persist: ReturnType<typeof buildRecommendedPressurePersistData>;
    try {
      persist = buildRecommendedPressurePersistData({
        recommendedPressureFrontBar: command.recommendedPressureFrontBar,
        recommendedPressureRearBar: command.recommendedPressureRearBar,
        recommendedPressureLoadedFrontBar: command.recommendedPressureLoadedFrontBar,
        recommendedPressureLoadedRearBar: command.recommendedPressureLoadedRearBar,
        pressureSpecSource: normalizeTirePressureSpecSource(
          command.pressureSpecSource,
        ) as TirePressureSpecSource,
        confirmPressureSpec: command.confirmPressureSpec,
      });
    } catch (err: any) {
      throw new BadRequestException(err?.message ?? 'Invalid pressure spec');
    }

    const updated = await this.prisma.vehicleTireSetup.update({
      where: { id: setup.id },
      data: {
        ...persist,
        updatedBy: command.userId ?? null,
      },
    });

    if (command.triggerRecalculate !== false) {
      await this.tireHealthService.recalculate(command.vehicleId);
    }

    return updated;
  }
}
