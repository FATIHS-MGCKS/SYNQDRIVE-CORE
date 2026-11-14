import { Injectable, BadRequestException, Inject, Optional, forwardRef } from '@nestjs/common';
import {
  BrakeComponentInstallationAnchorSource,
  BrakeComponentInstallationType,
  BrakeHealthCurrent,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import {
  DrivingImpactService,
  VehicleImpactForBrake,
} from '../driving-impact/driving-impact.service';
import { BRAKE_HEALTH_CONFIG } from './brake-health.config';
import { BrakeEvidenceService } from './brake-evidence.service';
import {
  pickPreferredReferenceSpec,
  resolveAnchorEligibleThicknessForInstallation,
} from './brake-reference-spec.domain';
import {
  modelingMinimumMm,
  modelingUsableWearMm,
  resolveAllComponentWearThresholds,
  resolveComponentWearThreshold,
  toThresholdApiContract,
  canEmitMeasuredCritical,
} from './brake-wear-threshold.domain';
import type { BrakeComponentWearThresholdContract } from './brake-wear-threshold.types';
import type { BrakeReferenceSpecComponent } from './brake-reference-spec.types';
import {
  aggregateBrakeCondition,
  alertCodeSeverity,
  alertTypeToCode,
  buildRemainingKmRange,
  classifyConfidenceLevel,
  classifyDtcSeverity,
  classifyEstimatedCondition,
  classifyFluidStatus,
  classifyMeasuredThickness,
  classifyMeasuredThicknessWithThresholds,
  classifyDiscConditionLabel,
  conditionToLegacyStatus,
  dataBasisFromAnchorValidation,
  evidenceSourceToDataBasis,
  harshBrakeWearMultiplier,
  isAlertableCondition,
  strongerDataBasis,
  type BrakeAlertCode,
  type BrakeCondition,
  type BrakeConfidenceLevel,
  type BrakeDataBasis,
} from './brake-status';
import {
  computeBrakeWearModelConfigHash,
  computeBrakeRecalculationInputFingerprint,
  type BrakeRecalculationInputContext,
  type BrakeRecalculationTrigger,
} from './brake-recalculation-fingerprint';
import { BrakeRecalculationInputLoader } from './brake-recalculation-input.loader';
import { resolveTelemetrySourceFamily } from '../telemetry-source-family';
import { containFullBrakingRate } from '../r1-temporal-containment';
import { BrakeHealthObservabilityService } from './brake-health-observability.service';
import { BrakeRecalculationOrchestratorService } from './brake-recalculation-orchestrator.service';
import { isActiveBrakeDtcEvidenceRow } from './brake-dtc-classification';
import { isActiveEvidence, isMmGroundTruth, resolveEffectiveFreshness } from './brake-evidence.domain';
import {
  buildBrakeHealthAlerts,
  candidatesToCanonicalAlerts,
  hasWearOrSafetyAlert,
} from './brake-health-alert.builder';
import { BrakeHealthAlertService } from './brake-health-alert.service';
import type { BrakeHealthAlertCategory } from './brake-health-alert.types';
import { BrakePredictionValidationService } from './brake-prediction-validation.service';
import {
  buildAnchorEvidenceSummary,
  buildSnapshotConfidence,
  buildSnapshotRemainingRange,
  deriveSnapshotCondition,
  serializeAlertsSummary,
} from './brake-snapshot.domain';
import { buildSnapshotPredictionPayload } from './brake-wear-model-version';
import { calibrateBrakeKFactorForComponent } from './brake-health-calibration.domain';
import {
  allocateTripDistancesToOdometerBudget,
  assessBrakeCoverageGap,
  NEUTRAL_GAP_WEAR_FACTORS,
  normalizeModelingSource,
  type BrakeCoverageGapAssessment,
  type BrakeCoverageStatus,
  type BrakeModelingSource,
} from './brake-coverage-gap.domain';
import {
  buildBrakeEvidencePresentation,
  resolveComponentEvidenceClass,
  type BrakeComponentBuildState,
  type BrakeEvidencePresentation,
} from './brake-health-presentation';

export interface BrakeRecalculateOptions {
  force?: boolean;
  reason?: string;
  actorId?: string | null;
  trigger?: BrakeRecalculationTrigger;
}

export interface BrakeRecalculationResult {
  padsHealthPct: number | null;
  discsHealthPct: number | null;
  padsRemainingKm: number | null;
  discsRemainingKm: number | null;
  confidence: { score: number; label: string };
  alertCount: number;
  modeledDistanceKm: number | null;
  coverageRatio: number | null;
  gapAssessment?: BrakeCoverageGapAssessment;
  skipped?: boolean;
  skipReason?: 'identical_input_fingerprint' | 'not_initialized_or_missing_odometer';
  forced?: boolean;
  inputFingerprint?: string;
  snapshotId?: string;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function lookupSteppedFactor(
  value: number,
  anchors: readonly { threshold: number; factor: number }[],
): number {
  for (const a of anchors) {
    if (value <= a.threshold) return a.factor;
  }
  return anchors[anchors.length - 1].factor;
}

function interpolateThermalFactor(
  score: number,
  anchors: readonly { score: number; factor: number }[],
): number {
  if (score <= anchors[0].score) return anchors[0].factor;
  if (score >= anchors[anchors.length - 1].score) {
    return anchors[anchors.length - 1].factor;
  }
  for (let i = 0; i < anchors.length - 1; i++) {
    if (score >= anchors[i].score && score <= anchors[i + 1].score) {
      const t = (score - anchors[i].score) / (anchors[i + 1].score - anchors[i].score);
      return anchors[i].factor + t * (anchors[i + 1].factor - anchors[i].factor);
    }
  }
  return 1.0;
}

const CONFIDENCE_RANK: Record<BrakeConfidenceLevel, number> = {
  UNKNOWN: 0,
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
};

/** Worse (lower) of two confidence levels; UNKNOWN defers to a known level. */
function worstConfidence(a: BrakeConfidenceLevel, b: BrakeConfidenceLevel): BrakeConfidenceLevel {
  if (a === 'UNKNOWN') return b;
  if (b === 'UNKNOWN') return a;
  return CONFIDENCE_RANK[a] <= CONFIDENCE_RANK[b] ? a : b;
}

function brakeAxleLabel(axle: 'FRONT' | 'REAR'): string {
  return axle === 'FRONT' ? 'Vorderachse' : 'Hinterachse';
}

export type BrakeStateClass = 'MEASURED' | 'ESTIMATED' | 'WARNING_ONLY' | 'NO_BASELINE';
export type BrakeLimitingComponent =
  | 'FRONT_PADS'
  | 'REAR_PADS'
  | 'FRONT_DISCS'
  | 'REAR_DISCS'
  | 'PADS_SET'
  | 'DISCS_SET'
  | null;
export type { BrakeModelingSource, BrakeCoverageStatus } from './brake-coverage-gap.domain';

export interface BrakeModeledComponentsDto {
  frontPads: boolean;
  rearPads: boolean;
  frontDiscs: boolean;
  rearDiscs: boolean;
  hasAnyPads: boolean;
  hasAnyDiscs: boolean;
  hasAnyModeled: boolean;
}

export interface BrakeModelCoverageDto {
  distanceSinceAnchorKm: number | null;
  modeledDistanceKm: number | null;
  modeledTripCount: number;
  coverageRatio: number | null;
  coverageRatioRaw: number | null;
  underCoverageKm: number | null;
  overCoverageKm: number | null;
  coverageStatus: BrakeCoverageStatus | null;
  hasGap: boolean;
  reconciliationRequired: boolean;
  source: BrakeModelingSource;
}

export interface BrakeCanonicalAlertDto {
  code: BrakeAlertCode;
  alertType: string;
  category: BrakeHealthAlertCategory;
  reasonCode: string;
  severity: 'info' | 'warning' | 'critical';
  message: string;
  messageEn: string;
  axle?: 'FRONT' | 'REAR' | 'UNKNOWN';
  displayMode: 'MEASURED' | 'ESTIMATED' | 'SAFETY_EVIDENCE' | 'DATA_GAP';
  dedupeKey?: string;
  evidenceFingerprint?: string;
}

export interface BrakeComponentThresholdDto {
  component: BrakeReferenceSpecComponent;
  warningThresholdMm: number | null;
  criticalThresholdMm: number | null;
  source: string | null;
  confirmed: boolean;
  thresholdMissing: boolean;
}

export interface BrakeAxleSummaryDto {
  condition: BrakeCondition;
  dataBasis: BrakeDataBasis;
  confidence: BrakeConfidenceLevel;
  estimatedRemainingKmMin: number | null;
  estimatedRemainingKmMax: number | null;
}

/** Legacy wear-model fields — backward compatibility only; not for UI; removal planned P28. */
export interface BrakeHealthLegacyDto {
  padsHealthPct: number | null;
  discsHealthPct: number | null;
  padsRemainingKm: number | null;
  discsRemainingKm: number | null;
  status: string;
  remainingKm: number | null;
}

export interface BrakeHealthSummaryDto {
  isInitialized: boolean;
  stateClass: BrakeStateClass;
  message?: string;
  actions?: { canAddBrakeService: boolean; canUseAiUpload: boolean };
  limitingComponent?: BrakeLimitingComponent;
  modeledComponents: BrakeModeledComponentsDto;
  modelCoverage: BrakeModelCoverageDto;
  lastChangeAt?: string | null;
  lastRecalculatedAt?: string | null;
  confidence?: { score: number; label: string };
  baselineWarnings: string[];
  provenanceWarnings: string[];
  /** Wear or safety open alert present — derived from `openAlerts` only. */
  hasAlert?: boolean;
  /** HM telemetry supplement when no modeled baseline — not operational truth. */
  legacyHeuristic?: { available: boolean; note: string };

  // ── Canonical evidence-based read model ────────────────────────────────────
  overallCondition: BrakeCondition;
  dataBasis: BrakeDataBasis;
  confidenceLevel: BrakeConfidenceLevel;
  frontAxle: BrakeAxleSummaryDto;
  rearAxle: BrakeAxleSummaryDto;
  /** @deprecated Prefer `frontAxle` / `rearAxle`. */
  frontAxleCondition: BrakeCondition;
  /** @deprecated Prefer `frontAxle` / `rearAxle`. */
  rearAxleCondition: BrakeCondition;
  /** @deprecated Prefer `frontAxle` / `rearAxle`. */
  frontDataBasis: BrakeDataBasis;
  /** @deprecated Prefer `frontAxle` / `rearAxle`. */
  rearDataBasis: BrakeDataBasis;
  /** @deprecated Prefer `frontAxle` / `rearAxle`. */
  frontConfidence: BrakeConfidenceLevel;
  /** @deprecated Prefer `frontAxle` / `rearAxle`. */
  rearConfidence: BrakeConfidenceLevel;
  estimatedFrontRemainingKmMin: number | null;
  estimatedFrontRemainingKmMax: number | null;
  estimatedRearRemainingKmMin: number | null;
  estimatedRearRemainingKmMax: number | null;
  nextInspectionRecommendedInKm: number | null;
  estimatedReplacementDueInKm: number | null;
  reasons: string[];
  recommendations: string[];
  /** Alias of `openAlerts` for API consumers. */
  alerts: BrakeCanonicalAlertDto[];
  openAlerts: BrakeCanonicalAlertDto[];
  lastMeasurementAt: string | null;
  lastMeasurementMileageKm: number | null;
  lastServiceAt: string | null;
  lastServiceMileageKm: number | null;
  updatedAt: string | null;
  legacy: BrakeHealthLegacyDto;
  componentThresholds: BrakeComponentThresholdDto[];
  /** Honest per-component evidence presentation for UI consumers. */
  evidencePresentation?: BrakeEvidencePresentation;
}

export type BrakeCanonicalReadModel = Pick<
  BrakeHealthSummaryDto,
  | 'overallCondition'
  | 'dataBasis'
  | 'confidenceLevel'
  | 'frontAxleCondition'
  | 'rearAxleCondition'
  | 'frontDataBasis'
  | 'rearDataBasis'
  | 'frontConfidence'
  | 'rearConfidence'
  | 'estimatedFrontRemainingKmMin'
  | 'estimatedFrontRemainingKmMax'
  | 'estimatedRearRemainingKmMin'
  | 'estimatedRearRemainingKmMax'
  | 'nextInspectionRecommendedInKm'
  | 'estimatedReplacementDueInKm'
  | 'reasons'
  | 'recommendations'
  | 'openAlerts'
  | 'lastMeasurementAt'
  | 'lastMeasurementMileageKm'
  | 'lastServiceAt'
  | 'lastServiceMileageKm'
  | 'updatedAt'
>;

/** Extended canonical build output — includes per-component state for presentation. */
export interface BrakeCanonicalBuildResult extends BrakeCanonicalReadModel {
  componentStates: BrakeComponentBuildState[];
  dataQualityFlags: {
    missingBaseline: boolean;
    specUnconfirmed: boolean;
    coverageGap: boolean;
    distanceConflict: boolean;
    staleEvidence: boolean;
  };
  safetyFlags: {
    abs: boolean;
    dtc: boolean;
    dtcCode: string | null;
    wearSensor: boolean;
    immediateReplacement: boolean;
  };
  predictionCapable: boolean;
  overallRemainingKmPoint: number | null;
  anchorValidationStatus: string | null;
  initialized: boolean;
  hasOdometerGap: boolean;
}

/** Wear-model axle estimates — backward compatibility only; UI must not read these. */
export interface BrakeHealthDetailLegacyDto {
  frontPads: AxleEstimate | null;
  rearPads: AxleEstimate | null;
  frontDiscs: AxleEstimate | null;
  rearDiscs: AxleEstimate | null;
}

export interface BrakeHealthGetSummaryOptions {
  /**
   * When `false`, skip {@link BrakeHealthAlertService.syncAlerts} (Core read-only GET).
   * In-memory alert computation is unchanged. Default: sync enabled.
   */
  syncAlerts?: boolean;
}

export interface BrakeHealthDetailDto {
  summary: BrakeHealthSummaryDto;
  /** Legacy wear-model estimates (mm/healthPct). Not part of canonical brake truth. */
  legacy: BrakeHealthDetailLegacyDto;
  specs: Record<string, unknown> | null;
  history: Array<Record<string, unknown>>;
  alerts: BrakeAlert[];
  factors: Record<string, number>;
  drivingImpactAvailable: boolean;
  distanceSinceAnchorKm: number | null;
  brakeBiasInfo: { front: number; rear: number; source: string } | null;
}

export interface AxleEstimate {
  anchorMm: number | null;
  estimatedMm: number | null;
  healthPct: number | null;
  remainingKm: number | null;
  wearRateMmPerKm: number | null;
  kFactor: number;
}

export interface BrakeAlert {
  type: string;
  severity: 'info' | 'warning' | 'critical';
  message: string;
  value?: number;
}

type BrakeImpactLike = {
  citySharePct: number | null;
  highwaySharePct: number | null;
  countryRoadSharePct: number | null;
  hardBrakePer100Km: number | null;
  fullBrakingPer100Km: number | null;
  stopDensity: number | null;
  highSpeedBrakeShare: number | null;
  thermalBrakeStressScore: number | null;
};

@Injectable()
export class BrakeHealthService {
  private readonly cfg = BRAKE_HEALTH_CONFIG;

  constructor(
    private readonly prisma: PrismaService,
    private readonly drivingImpactService: DrivingImpactService,
    private readonly brakeEvidence: BrakeEvidenceService,
    private readonly recalcInputLoader: BrakeRecalculationInputLoader,
    @Optional() private readonly observability?: BrakeHealthObservabilityService,
    @Optional()
    @Inject(forwardRef(() => BrakeRecalculationOrchestratorService))
    private readonly recalcOrchestrator?: BrakeRecalculationOrchestratorService,
    @Optional() private readonly predictionValidation?: BrakePredictionValidationService,
    @Optional() private readonly brakeHealthAlerts?: BrakeHealthAlertService,
  ) {}

  private async loadWearThresholds(
    vehicleId: string,
    current: BrakeHealthCurrent | null,
  ): Promise<Record<BrakeReferenceSpecComponent, BrakeComponentWearThresholdContract>> {
    const specs = await this.prisma.vehicleBrakeReferenceSpec.findMany({
      where: { vehicleId },
      orderBy: { createdAt: 'desc' },
    });
    const spec = pickPreferredReferenceSpec(specs);
    return resolveAllComponentWearThresholds(spec, {
      FRONT_PADS: current?.frontPadAnchorMm ?? null,
      REAR_PADS: current?.rearPadAnchorMm ?? null,
      FRONT_DISCS: current?.frontDiscAnchorMm ?? null,
      REAR_DISCS: current?.rearDiscAnchorMm ?? null,
    });
  }

  private componentThresholdDtos(
    thresholds: Record<BrakeReferenceSpecComponent, BrakeComponentWearThresholdContract>,
  ): BrakeComponentThresholdDto[] {
    return (['FRONT_PADS', 'REAR_PADS', 'FRONT_DISCS', 'REAR_DISCS'] as const).map(
      (component) => {
        const contract = toThresholdApiContract(thresholds[component]);
        return {
          ...contract,
          source: contract.source ?? null,
        };
      },
    );
  }

  async getSummary(
    vehicleId: string,
    options?: BrakeHealthGetSummaryOptions,
  ): Promise<BrakeHealthSummaryDto> {
    const current = await this.prisma.brakeHealthCurrent.findUnique({ where: { vehicleId } });
    const modeledComponents = this.deriveModeledComponents(current);
    const canonicalReadOptions = {
      emitNotifications: false as const,
      syncAlerts: options?.syncAlerts !== false,
    };

    if (
      !current ||
      !current.isInitialized ||
      current.anchorOdometerKm == null ||
      !modeledComponents.hasAnyModeled
    ) {
      return this.buildNoBaselineSummary(vehicleId, current, modeledComponents, canonicalReadOptions);
    }

    const padPct = current.padsHealthPct != null ? round2(current.padsHealthPct) : null;
    const discPct = current.discsHealthPct != null ? round2(current.discsHealthPct) : null;
    const stateClass = this.deriveStateClass(current, modeledComponents);
    const limitingComponent = this.deriveLimitingComponent(current);
    const baselineWarnings = this.readWarningArray(current?.baselineWarnings);
    const coverageWarnings = this.computeCoverageWarnings(
      current?.coverageRatioRaw ?? current?.modelCoverageRatio,
      current?.distanceSinceAnchorKm,
      current?.modeledDistanceKm,
      current?.modeledTripCount ?? 0,
      normalizeModelingSource(current?.modelingSource),
      current?.underCoverageKm,
      current?.overCoverageKm,
      (current?.coverageStatus as BrakeCoverageStatus | null) ?? null,
    );
    const remainingKm = Math.min(
      current.padsRemainingKm ?? Number.POSITIVE_INFINITY,
      current.discsRemainingKm ?? Number.POSITIVE_INFINITY,
    );
    const roundedRemainingKm = Number.isFinite(remainingKm) ? Math.round(remainingKm) : null;

    const canonical = await this.buildCanonicalReadModel(
      vehicleId,
      current,
      modeledComponents,
      canonicalReadOptions,
    );
    const wearThresholds = await this.loadWearThresholds(vehicleId, current);

    return this.composeSummaryDto({
      isInitialized: true,
      stateClass,
      actions: { canAddBrakeService: true, canUseAiUpload: true },
      limitingComponent,
      modeledComponents,
      modelCoverage: {
        distanceSinceAnchorKm:
          current.distanceSinceAnchorKm != null ? round2(current.distanceSinceAnchorKm) : null,
        modeledDistanceKm:
          current.modeledDistanceKm != null ? round2(current.modeledDistanceKm) : null,
        modeledTripCount: current.modeledTripCount ?? 0,
        coverageRatio:
          current.coverageRatioRaw != null
            ? round2(current.coverageRatioRaw)
            : current.modelCoverageRatio != null
              ? round2(current.modelCoverageRatio)
              : null,
        coverageRatioRaw:
          current.coverageRatioRaw != null
            ? round2(current.coverageRatioRaw)
            : current.modelCoverageRatio != null
              ? round2(current.modelCoverageRatio)
              : null,
        underCoverageKm:
          current.underCoverageKm != null ? round2(current.underCoverageKm) : null,
        overCoverageKm: current.overCoverageKm != null ? round2(current.overCoverageKm) : null,
        coverageStatus: (current.coverageStatus as BrakeCoverageStatus | null) ?? null,
        hasGap:
          (current.underCoverageKm ?? 0) > 0 ||
          ((current.distanceSinceAnchorKm ?? 0) > 0 &&
            (current.modeledDistanceKm ?? 0) + 1 < (current.distanceSinceAnchorKm ?? 0)),
        reconciliationRequired: (current.overCoverageKm ?? 0) > 0,
        source: normalizeModelingSource(current.modelingSource),
      },
      lastChangeAt: current.anchorServiceDate?.toISOString() ?? null,
      lastRecalculatedAt: current.lastRecalculatedAt?.toISOString() ?? null,
      confidence: {
        score: Math.round(current.confidenceScore ?? 0),
        label: current.confidenceLabel ?? 'Low',
      },
      baselineWarnings,
      provenanceWarnings: coverageWarnings,
      legacyHeuristic: {
        available: false,
        note: 'Legacy brake-status is deprecated and not used as primary truth.',
      },
      canonical,
      legacy: {
        padsHealthPct: padPct != null ? Math.round(padPct) : null,
        discsHealthPct: discPct != null ? Math.round(discPct) : null,
        padsRemainingKm:
          current.padsRemainingKm != null ? Math.round(current.padsRemainingKm) : null,
        discsRemainingKm:
          current.discsRemainingKm != null ? Math.round(current.discsRemainingKm) : null,
        status: conditionToLegacyStatus(canonical.overallCondition, stateClass),
        remainingKm: roundedRemainingKm,
      },
      componentThresholds: this.componentThresholdDtos(wearThresholds),
    });
  }

  async getDetail(vehicleId: string): Promise<BrakeHealthDetailDto> {
    const summary = await this.getSummary(vehicleId);
    const current = await this.prisma.brakeHealthCurrent.findUnique({ where: { vehicleId } });

    const specs = await this.prisma.vehicleBrakeReferenceSpec.findMany({
      where: { vehicleId },
      orderBy: { createdAt: 'desc' },
      take: 1,
    });

    const history = await this.prisma.vehicleServiceEvent.findMany({
      where: { vehicleId, eventType: 'BRAKE_SERVICE' },
      orderBy: { eventDate: 'desc' },
      take: 30,
    });

    const impact = await this.drivingImpactService.getVehicleImpactForBrake(vehicleId);
    const alerts: BrakeAlert[] = summary.openAlerts.map((a) => ({
      type: a.code,
      severity: a.severity,
      message: a.message,
    }));
    const factors =
      summary.stateClass === 'NO_BASELINE' || summary.stateClass === 'WARNING_ONLY'
        ? {}
        : await this.computeFactorsForDisplay(vehicleId, impact);

    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
      select: { brakeForceFrontPercent: true },
    });
    const biasFront =
      vehicle?.brakeForceFrontPercent != null
        ? vehicle.brakeForceFrontPercent / 100
        : this.cfg.brakeBias.defaultFront;

    return {
      summary,
      legacy: {
        frontPads:
          current && summary.modeledComponents.frontPads
            ? this.toAxleEstimate(
                current.frontPadAnchorMm,
                current.frontPadEstimatedMm,
                current.frontPadHealthPct,
                current.frontPadRemainingKm,
                current.frontPadWearRateMmPerKm,
                current.frontPadKFactor,
              )
            : null,
        rearPads:
          current && summary.modeledComponents.rearPads
            ? this.toAxleEstimate(
                current.rearPadAnchorMm,
                current.rearPadEstimatedMm,
                current.rearPadHealthPct,
                current.rearPadRemainingKm,
                current.rearPadWearRateMmPerKm,
                current.rearPadKFactor,
              )
            : null,
        frontDiscs:
          current && summary.modeledComponents.frontDiscs
            ? this.toAxleEstimate(
                current.frontDiscAnchorMm,
                current.frontDiscEstimatedMm,
                current.frontDiscHealthPct,
                current.frontDiscRemainingKm,
                current.frontDiscWearRateMmPerKm,
                current.frontDiscKFactor,
              )
            : null,
        rearDiscs:
          current && summary.modeledComponents.rearDiscs
            ? this.toAxleEstimate(
                current.rearDiscAnchorMm,
                current.rearDiscEstimatedMm,
                current.rearDiscHealthPct,
                current.rearDiscRemainingKm,
                current.rearDiscWearRateMmPerKm,
                current.rearDiscKFactor,
              )
            : null,
      },
      specs: specs[0] ?? null,
      history: history.map((e) => ({
        id: e.id,
        date: e.eventDate.toISOString(),
        odometerKm: e.odometerKm,
        workshopName: e.workshopName,
        notes: e.notes,
        costCents: e.costCents,
        serviceKind: e.brakeServiceKind,
        source: e.brakeServiceSource,
        scope: e.brakeServiceScope,
        lifecycleApplied: e.brakeLifecycleApplied,
        lifecycleNote: e.brakeLifecycleNote,
      })),
      alerts,
      factors,
      drivingImpactAvailable: impact != null,
      distanceSinceAnchorKm:
        current?.distanceSinceAnchorKm != null ? round2(current.distanceSinceAnchorKm) : null,
      brakeBiasInfo: {
        front: Math.round(biasFront * 100),
        rear: Math.round((1 - biasFront) * 100),
        source:
          vehicle?.brakeForceFrontPercent != null
            ? 'Vehicle master data'
            : 'EBD fallback estimate',
      },
    };
  }

  async initializeFromService(
    vehicleId: string,
    data: {
      serviceDate: string;
      odometerKm?: number;
      frontPadMm?: number;
      rearPadMm?: number;
      frontRotorWidthMm?: number;
      rearRotorWidthMm?: number;
    },
    options?: {
      scopedComponents?: BrakeComponentInstallationType[];
    },
  ) {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
      select: { organizationId: true },
    });
    if (!vehicle) throw new BadRequestException('Vehicle not found');

    const latestState = await this.prisma.vehicleLatestState.findUnique({
      where: { vehicleId },
      select: { odometerKm: true },
    });
    const odo = data.odometerKm ?? latestState?.odometerKm ?? null;
    const serviceDate = new Date(data.serviceDate);
    if (Number.isNaN(serviceDate.getTime())) {
      throw new BadRequestException('Invalid serviceDate');
    }

    const specs = await this.prisma.vehicleBrakeReferenceSpec.findMany({
      where: { vehicleId },
      orderBy: { createdAt: 'desc' },
    });
    const spec = pickPreferredReferenceSpec(specs);
    const existing = await this.prisma.brakeHealthCurrent.findUnique({ where: { vehicleId } });
    const scoped = options?.scopedComponents ? new Set(options.scopedComponents) : null;

    const measured = {
      frontPadMm: this.normalizePositive(data.frontPadMm),
      rearPadMm: this.normalizePositive(data.rearPadMm),
      frontDiscMm: this.normalizePositive(data.frontRotorWidthMm),
      rearDiscMm: this.normalizePositive(data.rearRotorWidthMm),
    };

    const resolveAnchor = (
      component: BrakeComponentInstallationType,
      measuredMm: number | null,
      specMm: number | null,
      existingMm: number | null | undefined,
    ): number | null => {
      if (scoped && !scoped.has(component)) {
        return existingMm ?? null;
      }
      if (scoped) {
        return measuredMm ?? (specMm != null ? this.normalizePositive(specMm) : null);
      }
      return measuredMm ?? this.normalizePositive(specMm);
    };

    const frontPadAnchor = resolveAnchor(
      BrakeComponentInstallationType.FRONT_PADS,
      measured.frontPadMm,
      resolveAnchorEligibleThicknessForInstallation(spec, BrakeComponentInstallationType.FRONT_PADS),
      existing?.frontPadAnchorMm,
    );
    const rearPadAnchor = resolveAnchor(
      BrakeComponentInstallationType.REAR_PADS,
      measured.rearPadMm,
      resolveAnchorEligibleThicknessForInstallation(spec, BrakeComponentInstallationType.REAR_PADS),
      existing?.rearPadAnchorMm,
    );
    const frontDiscAnchor = resolveAnchor(
      BrakeComponentInstallationType.FRONT_DISCS,
      measured.frontDiscMm,
      resolveAnchorEligibleThicknessForInstallation(spec, BrakeComponentInstallationType.FRONT_DISCS),
      existing?.frontDiscAnchorMm,
    );
    const rearDiscAnchor = resolveAnchor(
      BrakeComponentInstallationType.REAR_DISCS,
      measured.rearDiscMm,
      resolveAnchorEligibleThicknessForInstallation(spec, BrakeComponentInstallationType.REAR_DISCS),
      existing?.rearDiscAnchorMm,
    );

    const hasAnyAnchor =
      frontPadAnchor != null ||
      rearPadAnchor != null ||
      frontDiscAnchor != null ||
      rearDiscAnchor != null;
    const hasMeasuredAnchor =
      (scoped
        ? [
            scoped.has(BrakeComponentInstallationType.FRONT_PADS) && measured.frontPadMm != null,
            scoped.has(BrakeComponentInstallationType.REAR_PADS) && measured.rearPadMm != null,
            scoped.has(BrakeComponentInstallationType.FRONT_DISCS) && measured.frontDiscMm != null,
            scoped.has(BrakeComponentInstallationType.REAR_DISCS) && measured.rearDiscMm != null,
          ].some(Boolean)
        : null) ??
      (measured.frontPadMm != null ||
        measured.rearPadMm != null ||
        measured.frontDiscMm != null ||
        measured.rearDiscMm != null);

    const baselineWarnings: string[] = [];
    if (!hasAnyAnchor) {
      baselineWarnings.push(
        'No usable pad/disc thickness baseline found. Provide measured brake thickness values to initialize V2.',
      );
    }
    if (odo == null) {
      baselineWarnings.push(
        'No odometer anchor available. Provide service odometer to start modeled wear tracking.',
      );
    }
    if (hasAnyAnchor && !hasMeasuredAnchor) {
      baselineWarnings.push(
        'Using nominal reference-spec baseline (estimated). Add measured thickness at next inspection to improve confidence.',
      );
    }

    const canInitialize = hasAnyAnchor && odo != null;
    const stateClass: BrakeStateClass = canInitialize
      ? hasMeasuredAnchor
        ? 'MEASURED'
        : 'ESTIMATED'
      : 'NO_BASELINE';

    await this.prisma.brakeHealthCurrent.upsert({
      where: { vehicleId },
      create: {
        vehicleId,
        organizationId: vehicle.organizationId,
        isInitialized: canInitialize,
        anchorServiceDate: canInitialize ? serviceDate : null,
        anchorOdometerKm: canInitialize ? odo : null,
        frontPadAnchorMm: frontPadAnchor,
        rearPadAnchorMm: rearPadAnchor,
        frontPadEstimatedMm: frontPadAnchor,
        rearPadEstimatedMm: rearPadAnchor,
        frontPadHealthPct: canInitialize && frontPadAnchor != null ? 100 : null,
        rearPadHealthPct: canInitialize && rearPadAnchor != null ? 100 : null,
        frontDiscAnchorMm: frontDiscAnchor,
        rearDiscAnchorMm: rearDiscAnchor,
        frontDiscEstimatedMm: frontDiscAnchor,
        rearDiscEstimatedMm: rearDiscAnchor,
        frontDiscHealthPct: canInitialize && frontDiscAnchor != null ? 100 : null,
        rearDiscHealthPct: canInitialize && rearDiscAnchor != null ? 100 : null,
        padsHealthPct: canInitialize ? 100 : null,
        padsRemainingKm: null,
        discsHealthPct: canInitialize ? 100 : null,
        discsRemainingKm: null,
        distanceSinceAnchorKm: canInitialize ? 0 : null,
        stateClass: stateClass,
        anchorValidationStatus: canInitialize
          ? hasMeasuredAnchor
            ? 'measured_anchor'
            : 'spec_fallback_anchor'
          : 'invalid',
        modelCoverageRatio: canInitialize ? 0 : null,
        modeledDistanceKm: canInitialize ? 0 : null,
        modeledTripCount: 0,
        modelingSource: 'NOT_ENOUGH_DATA',
        baselineWarnings: baselineWarnings,
        modelVersion: this.cfg.MODEL_VERSION,
      },
      update: {
        isInitialized: canInitialize,
        anchorServiceDate: canInitialize ? serviceDate : null,
        anchorOdometerKm: canInitialize ? odo : null,
        frontPadAnchorMm: frontPadAnchor,
        rearPadAnchorMm: rearPadAnchor,
        frontPadEstimatedMm: frontPadAnchor,
        rearPadEstimatedMm: rearPadAnchor,
        frontPadHealthPct: canInitialize && frontPadAnchor != null ? 100 : null,
        rearPadHealthPct: canInitialize && rearPadAnchor != null ? 100 : null,
        frontDiscAnchorMm: frontDiscAnchor,
        rearDiscAnchorMm: rearDiscAnchor,
        frontDiscEstimatedMm: frontDiscAnchor,
        rearDiscEstimatedMm: rearDiscAnchor,
        frontDiscHealthPct: canInitialize && frontDiscAnchor != null ? 100 : null,
        rearDiscHealthPct: canInitialize && rearDiscAnchor != null ? 100 : null,
        padsHealthPct: canInitialize ? 100 : null,
        padsRemainingKm: null,
        discsHealthPct: canInitialize ? 100 : null,
        discsRemainingKm: null,
        distanceSinceAnchorKm: canInitialize ? 0 : null,
        stateClass: stateClass,
        anchorValidationStatus: canInitialize
          ? hasMeasuredAnchor
            ? 'measured_anchor'
            : 'spec_fallback_anchor'
          : 'invalid',
        modelCoverageRatio: canInitialize ? 0 : null,
        modeledDistanceKm: canInitialize ? 0 : null,
        modeledTripCount: 0,
        modelingSource: 'NOT_ENOUGH_DATA',
        baselineWarnings: baselineWarnings,
        lastRecalculatedAt: canInitialize ? new Date() : null,
        modelVersion: this.cfg.MODEL_VERSION,
      },
    });

    if (canInitialize) {
      await this.requestRecalculation(vehicleId, 'initialization');
      return {
        success: true,
        initialized: true,
        stateClass,
        message: hasMeasuredAnchor
          ? 'Brake health baseline initialized from measured service data.'
          : 'Brake health baseline initialized from reference-spec fallback.',
      };
    }

    return {
      success: false,
      initialized: false,
      stateClass: 'NO_BASELINE',
      message:
        'Brake service history was recorded, but V2 wear tracking was not initialized due to missing baseline odometer and/or thickness anchors.',
      warnings: baselineWarnings,
    };
  }

  /**
   * Scope-aware anchor mutation — only components explicitly listed are updated.
   * Preserves non-scoped anchors, k-factors, and wear state on BrakeHealthCurrent.
   */
  async applyScopedComponentAnchors(
    vehicleId: string,
    input: {
      serviceDate: Date;
      odometerKm: number | null;
      components: Array<{
        componentType: BrakeComponentInstallationType;
        anchorThicknessMm: number | null;
        anchorSource: BrakeComponentInstallationAnchorSource;
      }>;
      scheduleRecalculation?: boolean;
      /** When true (replacement install), scoped k-factors reset. Default preserves calibration. */
      resetWearCalibration?: boolean;
      baselineWarnings?: string[];
    },
  ): Promise<{ updated: boolean; recalculated: boolean }> {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
      select: { organizationId: true },
    });
    if (!vehicle) throw new BadRequestException('Vehicle not found');

    const current = await this.prisma.brakeHealthCurrent.findUnique({ where: { vehicleId } });
    const { merged, anyAnchor } = this.buildScopedAnchorMerge(
      vehicleId,
      vehicle.organizationId,
      current,
      input,
    );

    await this.prisma.brakeHealthCurrent.upsert({
      where: { vehicleId },
      create: merged as any,
      update: merged as any,
    });

    const shouldRecalc =
      input.scheduleRecalculation !== false &&
      (anyAnchor.canInitialize || current?.isInitialized === true);
    if (shouldRecalc) {
      await this.requestRecalculation(vehicleId, 'component_lifecycle');
    }

    return { updated: anyAnchor.anyAnchor, recalculated: shouldRecalc };
  }

  async applyScopedComponentAnchorsInTx(
    tx: Prisma.TransactionClient,
    vehicleId: string,
    organizationId: string,
    input: {
      serviceDate: Date;
      odometerKm: number | null;
      components: Array<{
        componentType: BrakeComponentInstallationType;
        anchorThicknessMm: number | null;
        anchorSource: BrakeComponentInstallationAnchorSource;
      }>;
      resetWearCalibration?: boolean;
      baselineWarnings?: string[];
    },
  ): Promise<{ updated: boolean }> {
    const current = await tx.brakeHealthCurrent.findUnique({ where: { vehicleId } });
    const { merged, anyAnchor } = this.buildScopedAnchorMerge(
      vehicleId,
      organizationId,
      current,
      input,
    );

    await tx.brakeHealthCurrent.upsert({
      where: { vehicleId },
      create: merged as any,
      update: merged as any,
    });

    return { updated: anyAnchor.anyAnchor };
  }

  private buildScopedAnchorMerge(
    vehicleId: string,
    organizationId: string,
    current: BrakeHealthCurrent | null,
    input: {
      serviceDate: Date;
      odometerKm: number | null;
      components: Array<{
        componentType: BrakeComponentInstallationType;
        anchorThicknessMm: number | null;
        anchorSource: BrakeComponentInstallationAnchorSource;
      }>;
      resetWearCalibration?: boolean;
      baselineWarnings?: string[];
    },
  ) {
    const scoped = new Set(input.components.map((c) => c.componentType));
    const resetWear = input.resetWearCalibration === true;
    const update: Partial<BrakeHealthCurrent> = {};
    let anyAnchor = false;
    let anyMeasured = false;

    for (const row of input.components) {
      const mm = this.normalizePositive(row.anchorThicknessMm);
      if (mm == null) continue;
      anyAnchor = true;
      if (row.anchorSource === BrakeComponentInstallationAnchorSource.MEASURED) {
        anyMeasured = true;
      }

      switch (row.componentType) {
        case BrakeComponentInstallationType.FRONT_PADS:
          update.frontPadAnchorMm = mm;
          update.frontPadEstimatedMm = mm;
          update.frontPadHealthPct = 100;
          if (resetWear) {
            update.frontPadKFactor = 1;
            update.frontPadWearRateMmPerKm = 0;
          }
          break;
        case BrakeComponentInstallationType.REAR_PADS:
          update.rearPadAnchorMm = mm;
          update.rearPadEstimatedMm = mm;
          update.rearPadHealthPct = 100;
          if (resetWear) {
            update.rearPadKFactor = 1;
            update.rearPadWearRateMmPerKm = 0;
          }
          break;
        case BrakeComponentInstallationType.FRONT_DISCS:
          update.frontDiscAnchorMm = mm;
          update.frontDiscEstimatedMm = mm;
          update.frontDiscHealthPct = 100;
          if (resetWear) {
            update.frontDiscKFactor = 1;
            update.frontDiscWearRateMmPerKm = 0;
          }
          break;
        case BrakeComponentInstallationType.REAR_DISCS:
          update.rearDiscAnchorMm = mm;
          update.rearDiscEstimatedMm = mm;
          update.rearDiscHealthPct = 100;
          if (resetWear) {
            update.rearDiscKFactor = 1;
            update.rearDiscWearRateMmPerKm = 0;
          }
          break;
        default:
          break;
      }
    }

    const odo = input.odometerKm;
    const canInitialize = anyAnchor && odo != null;
    const merged = {
      vehicleId,
      organizationId,
      isInitialized: canInitialize || current?.isInitialized === true,
      anchorServiceDate: canInitialize ? input.serviceDate : current?.anchorServiceDate ?? null,
      anchorOdometerKm: canInitialize ? odo : current?.anchorOdometerKm ?? null,
      frontPadAnchorMm: scoped.has(BrakeComponentInstallationType.FRONT_PADS)
        ? (update.frontPadAnchorMm ?? current?.frontPadAnchorMm ?? null)
        : current?.frontPadAnchorMm ?? null,
      rearPadAnchorMm: scoped.has(BrakeComponentInstallationType.REAR_PADS)
        ? (update.rearPadAnchorMm ?? current?.rearPadAnchorMm ?? null)
        : current?.rearPadAnchorMm ?? null,
      frontDiscAnchorMm: scoped.has(BrakeComponentInstallationType.FRONT_DISCS)
        ? (update.frontDiscAnchorMm ?? current?.frontDiscAnchorMm ?? null)
        : current?.frontDiscAnchorMm ?? null,
      rearDiscAnchorMm: scoped.has(BrakeComponentInstallationType.REAR_DISCS)
        ? (update.rearDiscAnchorMm ?? current?.rearDiscAnchorMm ?? null)
        : current?.rearDiscAnchorMm ?? null,
      frontPadEstimatedMm: scoped.has(BrakeComponentInstallationType.FRONT_PADS)
        ? (update.frontPadEstimatedMm ?? current?.frontPadEstimatedMm ?? null)
        : current?.frontPadEstimatedMm ?? null,
      rearPadEstimatedMm: scoped.has(BrakeComponentInstallationType.REAR_PADS)
        ? (update.rearPadEstimatedMm ?? current?.rearPadEstimatedMm ?? null)
        : current?.rearPadEstimatedMm ?? null,
      frontDiscEstimatedMm: scoped.has(BrakeComponentInstallationType.FRONT_DISCS)
        ? (update.frontDiscEstimatedMm ?? current?.frontDiscEstimatedMm ?? null)
        : current?.frontDiscEstimatedMm ?? null,
      rearDiscEstimatedMm: scoped.has(BrakeComponentInstallationType.REAR_DISCS)
        ? (update.rearDiscEstimatedMm ?? current?.rearDiscEstimatedMm ?? null)
        : current?.rearDiscEstimatedMm ?? null,
      frontPadHealthPct: scoped.has(BrakeComponentInstallationType.FRONT_PADS)
        ? update.frontPadHealthPct ?? current?.frontPadHealthPct ?? null
        : current?.frontPadHealthPct ?? null,
      rearPadHealthPct: scoped.has(BrakeComponentInstallationType.REAR_PADS)
        ? update.rearPadHealthPct ?? current?.rearPadHealthPct ?? null
        : current?.rearPadHealthPct ?? null,
      frontDiscHealthPct: scoped.has(BrakeComponentInstallationType.FRONT_DISCS)
        ? update.frontDiscHealthPct ?? current?.frontDiscHealthPct ?? null
        : current?.frontDiscHealthPct ?? null,
      rearDiscHealthPct: scoped.has(BrakeComponentInstallationType.REAR_DISCS)
        ? update.rearDiscHealthPct ?? current?.rearDiscHealthPct ?? null
        : current?.rearDiscHealthPct ?? null,
      frontPadKFactor: scoped.has(BrakeComponentInstallationType.FRONT_PADS) && resetWear
        ? 1
        : current?.frontPadKFactor ?? 1,
      rearPadKFactor: scoped.has(BrakeComponentInstallationType.REAR_PADS) && resetWear
        ? 1
        : current?.rearPadKFactor ?? 1,
      frontDiscKFactor: scoped.has(BrakeComponentInstallationType.FRONT_DISCS) && resetWear
        ? 1
        : current?.frontDiscKFactor ?? 1,
      rearDiscKFactor: scoped.has(BrakeComponentInstallationType.REAR_DISCS) && resetWear
        ? 1
        : current?.rearDiscKFactor ?? 1,
      frontPadWearRateMmPerKm: scoped.has(BrakeComponentInstallationType.FRONT_PADS) && resetWear
        ? 0
        : current?.frontPadWearRateMmPerKm ?? null,
      rearPadWearRateMmPerKm: scoped.has(BrakeComponentInstallationType.REAR_PADS) && resetWear
        ? 0
        : current?.rearPadWearRateMmPerKm ?? null,
      frontDiscWearRateMmPerKm: scoped.has(BrakeComponentInstallationType.FRONT_DISCS) && resetWear
        ? 0
        : current?.frontDiscWearRateMmPerKm ?? null,
      rearDiscWearRateMmPerKm: scoped.has(BrakeComponentInstallationType.REAR_DISCS) && resetWear
        ? 0
        : current?.rearDiscWearRateMmPerKm ?? null,
      calibrationCount: current?.calibrationCount ?? 0,
      hasAlert: current?.hasAlert ?? false,
      baselineWarnings:
        input.baselineWarnings ??
        this.readWarningArray(current?.baselineWarnings),
      stateClass: canInitialize
        ? anyMeasured
          ? 'MEASURED'
          : current?.stateClass ?? 'ESTIMATED'
        : current?.stateClass ?? 'NO_BASELINE',
      anchorValidationStatus: canInitialize
        ? anyMeasured
          ? 'measured_anchor'
          : 'spec_fallback_anchor'
        : current?.anchorValidationStatus ?? 'invalid',
      modelVersion: this.cfg.MODEL_VERSION,
      lastRecalculatedAt: canInitialize ? new Date() : current?.lastRecalculatedAt ?? null,
    };

    return { merged, anyAnchor: { anyAnchor, canInitialize } };
  }

  async recalculate(
    vehicleId: string,
    options: BrakeRecalculateOptions = {},
  ): Promise<BrakeRecalculationResult | null> {
    if (options.force && !options.reason?.trim()) {
      throw new BadRequestException('Force brake recalculation requires a non-empty reason.');
    }

    let current = await this.prisma.brakeHealthCurrent.findUnique({ where: { vehicleId } });
    if (!current?.isInitialized || current.anchorOdometerKm == null || !current.anchorServiceDate) {
      return null;
    }

    const trigger = options.trigger ?? 'manual';
    if (trigger === 'measurement') {
      await this.calibrateFromLatestMeasurement(vehicleId);
      current =
        (await this.prisma.brakeHealthCurrent.findUnique({ where: { vehicleId } })) ?? current;
      if (!current.isInitialized || current.anchorOdometerKm == null || !current.anchorServiceDate) {
        return null;
      }
    }

    const anchorOdometerKm = current.anchorOdometerKm;
    const anchorServiceDate = current.anchorServiceDate;

    const inputContext = await this.recalcInputLoader.load(vehicleId);
    if (!inputContext) return null;

    const modelConfigHash = computeBrakeWearModelConfigHash();
    const fingerprint = computeBrakeRecalculationInputFingerprint(inputContext, {
      modelConfigHash,
    });

    const recalcAsOf = new Date();

    const lastSnapshot = await this.prisma.brakeHealthSnapshot.findFirst({
      where: {
        vehicleId,
        modelVersion: fingerprint.modelVersion,
        inputFingerprint: fingerprint.inputFingerprint,
      },
      orderBy: { generatedAt: 'desc' },
      select: { id: true },
    });

    if (!options.force && lastSnapshot) {
      await this.prisma.brakeHealthCurrent.update({
        where: { vehicleId },
        data: { lastRecalculatedAt: recalcAsOf },
      });
      await this.writeRecalculationAudit({
        organizationId: current.organizationId,
        vehicleId,
        trigger,
        forced: false,
        forceReason: null,
        actorId: options.actorId ?? null,
        inputFingerprint: fingerprint.inputFingerprint,
        result: 'deduplicated',
        skipReason: 'identical_input_fingerprint',
        durationMs: 0,
      });
      this.observability?.recordSnapshot({ result: 'deduplicated' });
      return {
        padsHealthPct: current.padsHealthPct,
        discsHealthPct: current.discsHealthPct,
        padsRemainingKm: current.padsRemainingKm,
        discsRemainingKm: current.discsRemainingKm,
        confidence: {
          score: Math.round(current.confidenceScore ?? 0),
          label: current.confidenceLabel ?? 'Low',
        },
        alertCount: current.hasAlert ? 1 : 0,
        modeledDistanceKm: current.modeledDistanceKm,
        coverageRatio: current.coverageRatioRaw ?? current.modelCoverageRatio,
        skipped: true,
        skipReason: 'identical_input_fingerprint',
        inputFingerprint: fingerprint.inputFingerprint,
        snapshotId: lastSnapshot.id,
      };
    }

    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
      select: {
        fuelType: true,
        brakeForceFrontPercent: true,
        dimoVehicle: { select: { rawJson: true } },
      },
    });
    const sourceFamily = resolveTelemetrySourceFamily(vehicle?.dimoVehicle?.rawJson);
    const latestState = await this.prisma.vehicleLatestState.findUnique({
      where: { vehicleId },
      select: { odometerKm: true },
    });
    const currentOdo = latestState?.odometerKm ?? null;
    if (currentOdo == null) return null;

    const distanceSinceAnchor = Math.max(0, currentOdo - current.anchorOdometerKm);
    const fuelType = vehicle?.fuelType ?? 'GASOLINE';
    const brakeBiasFront =
      vehicle?.brakeForceFrontPercent != null
        ? vehicle.brakeForceFrontPercent / 100
        : this.cfg.brakeBias.defaultFront;
    const brakeBiasRear = 1 - brakeBiasFront;
    const wearThresholds = await this.loadWearThresholds(vehicleId, current);

    const tripImpacts = await this.prisma.tripDrivingImpact.findMany({
      where: {
        vehicleId,
        tripStartedAt: { gte: anchorServiceDate },
        analysisStatus: { in: ['COMPLETE', 'PARTIAL'] },
      },
      orderBy: { tripStartedAt: 'asc' },
      select: {
        tripId: true,
        distanceKm: true,
        authoritativeDistanceKm: true,
        analysisStatus: true,
        distanceDiscrepancyKm: true,
        citySharePct: true,
        highwaySharePct: true,
        countryRoadSharePct: true,
        hardBrakePer100Km: true,
        fullBrakingPer100Km: true,
        stopDensity: true,
        highSpeedBrakeShare: true,
        thermalBrakeStressScore: true,
      },
    });

    let modeledDistanceFromTrips = 0;
    let modeledTripCount = 0;

    let frontPadWorn = 0;
    let rearPadWorn = 0;
    let frontDiscWorn = 0;
    let rearDiscWorn = 0;

    const { allocations } = allocateTripDistancesToOdometerBudget(
      tripImpacts,
      (trip) => trip.authoritativeDistanceKm ?? trip.distanceKm ?? 0,
      distanceSinceAnchor,
    );

    let rawTripDistanceKm = 0;
    for (const { tripDistanceKm } of allocations) {
      if (tripDistanceKm > 0) rawTripDistanceKm += tripDistanceKm;
    }

    for (const { item: trip, allocatedKm } of allocations) {
      if (!(allocatedKm > 0)) continue;
      modeledTripCount += 1;
      modeledDistanceFromTrips += allocatedKm;

      const padUsage = this.computePadUsageFactor(trip);
      const padStopDensity = lookupSteppedFactor(
        trip.stopDensity ?? 0,
        this.cfg.padStopDensityAnchors,
      );
      const padHardBrake = this.resolveHardBrakeWearFactor(trip.hardBrakePer100Km);
      const padFullBraking = lookupSteppedFactor(
        containFullBrakingRate(trip.fullBrakingPer100Km, sourceFamily) ?? 0,
        this.cfg.padFullBrakingAnchors,
      );
      const padReku = this.cfg.padRekuFactors[fuelType] ?? 1.0;

      if (current.frontPadAnchorMm != null) {
        const rate = this.computePadRatePerKm(
          current.frontPadAnchorMm,
          brakeBiasFront,
          padUsage,
          padStopDensity,
          padHardBrake,
          padFullBraking,
          padReku,
          current.frontPadKFactor,
          wearThresholds.FRONT_PADS,
        );
        frontPadWorn += allocatedKm * rate;
      }
      if (current.rearPadAnchorMm != null) {
        const rate = this.computePadRatePerKm(
          current.rearPadAnchorMm,
          brakeBiasRear,
          padUsage,
          padStopDensity,
          padHardBrake,
          padFullBraking,
          padReku,
          current.rearPadKFactor,
          wearThresholds.REAR_PADS,
        );
        rearPadWorn += allocatedKm * rate;
      }

      const discUsage = this.computeDiscUsageFactor(trip);
      const discHighSpeed = lookupSteppedFactor(
        (trip.highSpeedBrakeShare ?? 0) * 100,
        this.cfg.discHighSpeedBrakeAnchors,
      );
      const discHardBrake = this.resolveHardBrakeWearFactor(trip.hardBrakePer100Km);
      const discFullBraking = lookupSteppedFactor(
        containFullBrakingRate(trip.fullBrakingPer100Km, sourceFamily) ?? 0,
        this.cfg.discFullBrakingAnchors,
      );
      const discThermal = interpolateThermalFactor(
        trip.thermalBrakeStressScore ?? 0,
        this.cfg.discThermalAnchors,
      );
      const discReku = this.cfg.discRekuFactors[fuelType] ?? 1.0;

      if (current.frontDiscAnchorMm != null) {
        const rate = this.computeDiscRatePerKm(
          current.frontDiscAnchorMm,
          brakeBiasFront,
          discUsage,
          discHighSpeed,
          discHardBrake,
          discFullBraking,
          discThermal,
          discReku,
          current.frontDiscKFactor,
          wearThresholds.FRONT_DISCS,
        );
        frontDiscWorn += allocatedKm * rate;
      }
      if (current.rearDiscAnchorMm != null) {
        const rate = this.computeDiscRatePerKm(
          current.rearDiscAnchorMm,
          brakeBiasRear,
          discUsage,
          discHighSpeed,
          discHardBrake,
          discFullBraking,
          discThermal,
          discReku,
          current.rearDiscKFactor,
          wearThresholds.REAR_DISCS,
        );
        rearDiscWorn += allocatedKm * rate;
      }
    }

    const gapAssessment = assessBrakeCoverageGap({
      distanceSinceAnchorKm: distanceSinceAnchor,
      observedDistanceKm: modeledDistanceFromTrips,
      observedTripCount: modeledTripCount,
      rawTripDistanceKm,
    });
    const baselineWarnings = this.readWarningArray(current.baselineWarnings);

    if (gapAssessment.reconciliationRequired) {
      baselineWarnings.push(
        `Trip-impact distance exceeds odometer delta by ${Math.round(gapAssessment.overCoverageKm).toLocaleString()} km — reconciliation required; wear is not applied to the excess.`,
      );
    }

    const neutralGapKm = gapAssessment.underCoverageKm;
    if (
      neutralGapKm > 0 &&
      gapAssessment.modelingSource !== 'NOT_ENOUGH_DATA' &&
      gapAssessment.modelingSource !== 'INCONSISTENT'
    ) {
      const n = NEUTRAL_GAP_WEAR_FACTORS;
      const padReku = this.cfg.padRekuFactors[fuelType] ?? n.padReku;
      const discReku = this.cfg.discRekuFactors[fuelType] ?? n.discReku;

      if (current.frontPadAnchorMm != null) {
        frontPadWorn +=
          neutralGapKm *
          this.computePadRatePerKm(
            current.frontPadAnchorMm,
            brakeBiasFront,
            n.padUsage,
            n.padStopDensity,
            n.padHardBrake,
            n.padFullBraking,
            padReku,
            current.frontPadKFactor,
            wearThresholds.FRONT_PADS,
          );
      }
      if (current.rearPadAnchorMm != null) {
        rearPadWorn +=
          neutralGapKm *
          this.computePadRatePerKm(
            current.rearPadAnchorMm,
            brakeBiasRear,
            n.padUsage,
            n.padStopDensity,
            n.padHardBrake,
            n.padFullBraking,
            padReku,
            current.rearPadKFactor,
            wearThresholds.REAR_PADS,
          );
      }
      if (current.frontDiscAnchorMm != null) {
        frontDiscWorn +=
          neutralGapKm *
          this.computeDiscRatePerKm(
            current.frontDiscAnchorMm,
            brakeBiasFront,
            n.discUsage,
            n.discHighSpeed,
            n.discHardBrake,
            n.discFullBraking,
            n.discThermal,
            discReku,
            current.frontDiscKFactor,
            wearThresholds.FRONT_DISCS,
          );
      }
      if (current.rearDiscAnchorMm != null) {
        rearDiscWorn +=
          neutralGapKm *
          this.computeDiscRatePerKm(
            current.rearDiscAnchorMm,
            brakeBiasRear,
            n.discUsage,
            n.discHighSpeed,
            n.discHardBrake,
            n.discFullBraking,
            n.discThermal,
            discReku,
            current.rearDiscKFactor,
            wearThresholds.REAR_DISCS,
          );
      }
      baselineWarnings.push(
        `Coverage gap: ${Math.round(neutralGapKm).toLocaleString()} km since anchor use neutral baseline wear (behavior unknown).`,
      );
    } else if (neutralGapKm > 0 && gapAssessment.modelingSource === 'NOT_ENOUGH_DATA') {
      baselineWarnings.push(
        'Distance since anchor is unknown — no precise wear prognosis for uncovered kilometers.',
      );
    }

    const rollingImpact = await this.drivingImpactService.getVehicleImpactForBrake(vehicleId);
    const modelingSource = gapAssessment.modelingSource;
    const modeledDistance = modeledDistanceFromTrips;
    const coverageRatioRaw = gapAssessment.coverageRatioRaw;

    const frontPadResult = this.computePadFromWorn(
      current.frontPadAnchorMm,
      frontPadWorn,
      distanceSinceAnchor,
      wearThresholds.FRONT_PADS,
    );
    const rearPadResult = this.computePadFromWorn(
      current.rearPadAnchorMm,
      rearPadWorn,
      distanceSinceAnchor,
      wearThresholds.REAR_PADS,
    );
    const frontDiscResult = this.computeDiscFromWorn(
      current.frontDiscAnchorMm,
      frontDiscWorn,
      distanceSinceAnchor,
      wearThresholds.FRONT_DISCS,
    );
    const rearDiscResult = this.computeDiscFromWorn(
      current.rearDiscAnchorMm,
      rearDiscWorn,
      distanceSinceAnchor,
      wearThresholds.REAR_DISCS,
    );

    const padsPcts = [frontPadResult.healthPct, rearPadResult.healthPct].filter(
      (v): v is number => v != null,
    );
    const padsHealthPct =
      padsPcts.length > 0 ? round2(Math.min(...padsPcts)) : null;
    const padsRemainingKm = Math.min(
      frontPadResult.remainingKm ?? Number.POSITIVE_INFINITY,
      rearPadResult.remainingKm ?? Number.POSITIVE_INFINITY,
    );

    const discsPcts = [frontDiscResult.healthPct, rearDiscResult.healthPct].filter(
      (v): v is number => v != null,
    );
    const discsHealthPct =
      discsPcts.length > 0 ? round2(Math.min(...discsPcts)) : null;
    const discsRemainingKm = Math.min(
      frontDiscResult.remainingKm ?? Number.POSITIVE_INFINITY,
      rearDiscResult.remainingKm ?? Number.POSITIVE_INFINITY,
    );

    const confidence = this.computeConfidence(
      current,
      rollingImpact,
      coverageRatioRaw,
      modeledTripCount,
      modelingSource,
      gapAssessment,
    );

    const modeledComponents = this.deriveModeledComponents(current);
    const stateClass = this.deriveStateClass(
      {
        ...current,
        anchorValidationStatus:
          current.anchorValidationStatus ??
          (this.hasMeasuredAnchorStatus(current) ? 'measured_anchor' : 'spec_fallback_anchor'),
      },
      modeledComponents,
    );

    const updatedData = {
      distanceSinceAnchorKm: round2(distanceSinceAnchor),
      frontPadEstimatedMm: frontPadResult.estimatedMm,
      frontPadHealthPct: frontPadResult.healthPct,
      frontPadRemainingKm: frontPadResult.remainingKm,
      frontPadWearRateMmPerKm: frontPadResult.wearRate,
      rearPadEstimatedMm: rearPadResult.estimatedMm,
      rearPadHealthPct: rearPadResult.healthPct,
      rearPadRemainingKm: rearPadResult.remainingKm,
      rearPadWearRateMmPerKm: rearPadResult.wearRate,
      frontDiscEstimatedMm: frontDiscResult.estimatedMm,
      frontDiscHealthPct: frontDiscResult.healthPct,
      frontDiscRemainingKm: frontDiscResult.remainingKm,
      frontDiscWearRateMmPerKm: frontDiscResult.wearRate,
      rearDiscEstimatedMm: rearDiscResult.estimatedMm,
      rearDiscHealthPct: rearDiscResult.healthPct,
      rearDiscRemainingKm: rearDiscResult.remainingKm,
      rearDiscWearRateMmPerKm: rearDiscResult.wearRate,
      padsHealthPct: padsHealthPct != null ? clamp(padsHealthPct, 0, 100) : null,
      padsRemainingKm:
        padsRemainingKm < Number.POSITIVE_INFINITY ? Math.round(padsRemainingKm) : null,
      discsHealthPct: discsHealthPct != null ? clamp(discsHealthPct, 0, 100) : null,
      discsRemainingKm:
        discsRemainingKm < Number.POSITIVE_INFINITY ? Math.round(discsRemainingKm) : null,
      confidenceScore: confidence.score,
      confidenceLabel: confidence.label,
      stateClass,
      modelCoverageRatio: coverageRatioRaw != null ? round2(coverageRatioRaw) : null,
      coverageRatioRaw: coverageRatioRaw != null ? round2(coverageRatioRaw) : null,
      underCoverageKm: round2(gapAssessment.underCoverageKm),
      overCoverageKm: round2(gapAssessment.overCoverageKm),
      coverageStatus: gapAssessment.coverageStatus,
      modeledDistanceKm: round2(modeledDistance),
      modeledTripCount,
      modelingSource,
      baselineWarnings,
      lastRecalculatedAt: new Date(),
      recalculationInputFingerprint: fingerprint.inputFingerprint,
      recalculationConfigHash: fingerprint.modelConfigHash,
      recalculationModelVersion: fingerprint.modelVersion,
    };

    await this.prisma.brakeHealthCurrent.update({
      where: { vehicleId },
      data: updatedData,
    });

    this.observability?.recordCoverage({
      coverageRatio: coverageRatioRaw,
      coverageStatus: gapAssessment.coverageStatus,
      underCoverageKm: gapAssessment.underCoverageKm,
      overCoverageKm: gapAssessment.overCoverageKm,
      missingImpact: modelingSource === 'NOT_ENOUGH_DATA',
    });
    if (
      !this.hasMeasuredAnchorStatus(current) &&
      String(current.anchorValidationStatus ?? '').toLowerCase().includes('spec_fallback')
    ) {
      this.observability?.recordSpecFallback('spec_fallback_anchor');
    }

    const mergedCurrent = { ...current, ...updatedData } as BrakeHealthCurrent;
    const canonicalPreSnapshot = await this.buildCanonicalReadModel(
      vehicleId,
      mergedCurrent,
      this.deriveModeledComponents(mergedCurrent),
      { emitNotifications: false },
    );
    const snapshotAlerts = canonicalPreSnapshot.openAlerts.map((alert) => ({
      type: alert.code,
      severity: alert.severity,
      message: alert.message,
    }));

    const snapshot = await this.persistHealthSnapshot({
      organizationId: current.organizationId,
      vehicleId,
      generatedAt: recalcAsOf,
      fingerprint,
      inputContext,
      distanceSinceAnchorKm: distanceSinceAnchor,
      gapAssessment,
      frontPadResult,
      rearPadResult,
      frontDiscResult,
      rearDiscResult,
      padsHealthPct,
      discsHealthPct,
      confidence,
      alerts: snapshotAlerts,
      modelingSource,
      coverageRatioRaw,
      observedDistanceKm: modeledDistanceFromTrips,
      existingSnapshot: lastSnapshot,
      force: options.force ?? false,
    });

    if (!options.force) {
      await this.predictionValidation?.linkPendingMeasurementSnapshots({
        vehicleId,
        asOf: recalcAsOf,
      });
    }

    const canonical = await this.buildCanonicalReadModel(
      vehicleId,
      mergedCurrent,
      this.deriveModeledComponents(mergedCurrent),
      { modelSnapshotId: snapshot.id, emitNotifications: true },
    );
    await this.prisma.brakeHealthCurrent.update({
      where: { vehicleId },
      data: { hasAlert: hasWearOrSafetyAlert(canonical.openAlerts) },
    });

    await this.writeRecalculationAudit({
      organizationId: current.organizationId,
      vehicleId,
      trigger,
      forced: options.force ?? false,
      forceReason: options.force ? options.reason?.trim() ?? null : null,
      actorId: options.actorId ?? null,
      inputFingerprint: fingerprint.inputFingerprint,
      result: 'success',
      skipReason: null,
      durationMs: null,
    });

    return {
      padsHealthPct,
      discsHealthPct,
      padsRemainingKm,
      discsRemainingKm,
      confidence,
      alertCount: canonical.openAlerts.length,
      modeledDistanceKm: round2(modeledDistance),
      coverageRatio: coverageRatioRaw != null ? round2(coverageRatioRaw) : null,
      gapAssessment,
      forced: options.force ?? false,
      inputFingerprint: fingerprint.inputFingerprint,
      snapshotId: snapshot.id,
    };
  }

  private async persistHealthSnapshot(args: {
    organizationId: string | null | undefined;
    vehicleId: string;
    generatedAt: Date;
    fingerprint: {
      modelVersion: string;
      modelConfigHash: string;
      inputFingerprint: string;
    };
    inputContext: BrakeRecalculationInputContext;
    distanceSinceAnchorKm: number;
    gapAssessment: BrakeCoverageGapAssessment;
    frontPadResult: {
      estimatedMm: number | null;
      healthPct: number | null;
      remainingKm: number | null;
    };
    rearPadResult: {
      estimatedMm: number | null;
      healthPct: number | null;
      remainingKm: number | null;
    };
    frontDiscResult: {
      estimatedMm: number | null;
      healthPct: number | null;
      remainingKm: number | null;
    };
    rearDiscResult: {
      estimatedMm: number | null;
      healthPct: number | null;
      remainingKm: number | null;
    };
    padsHealthPct: number | null;
    discsHealthPct: number | null;
    confidence: { score: number; label: string };
    alerts: Array<{ type: string; severity: string; message: string; value?: number }>;
    modelingSource: BrakeModelingSource;
    coverageRatioRaw: number | null;
    observedDistanceKm: number;
    existingSnapshot: { id: string } | null;
    force: boolean;
  }): Promise<{ id: string }> {
    if (args.existingSnapshot && args.force) {
      return args.existingSnapshot;
    }

    const predictionPayload = buildSnapshotPredictionPayload({
      modelVersion: args.fingerprint.modelVersion,
      modelConfigHash: args.fingerprint.modelConfigHash,
      predictionGeneratedAt: args.generatedAt,
      frontPadEstimateMm: args.frontPadResult.estimatedMm,
      rearPadEstimateMm: args.rearPadResult.estimatedMm,
      frontDiscEstimateMm: args.frontDiscResult.estimatedMm,
      rearDiscEstimateMm: args.rearDiscResult.estimatedMm,
    });

    const anchorEvidenceSummary = buildAnchorEvidenceSummary({
      inputContext: args.inputContext,
      predictionPayload,
    });

    const condition = deriveSnapshotCondition({
      frontPadHealthPct: args.frontPadResult.healthPct,
      rearPadHealthPct: args.rearPadResult.healthPct,
      frontDiscHealthPct: args.frontDiscResult.healthPct,
      rearDiscHealthPct: args.rearDiscResult.healthPct,
      frontPadRemainingKm: args.frontPadResult.remainingKm,
      rearPadRemainingKm: args.rearPadResult.remainingKm,
      frontDiscRemainingKm: args.frontDiscResult.remainingKm,
      rearDiscRemainingKm: args.rearDiscResult.remainingKm,
    });

    const snapshotConfidence = buildSnapshotConfidence({
      score: args.confidence.score,
      label: args.confidence.label,
    });

    const remainingRange = buildSnapshotRemainingRange({
      frontPadRemainingKm: args.frontPadResult.remainingKm,
      rearPadRemainingKm: args.rearPadResult.remainingKm,
      frontDiscRemainingKm: args.frontDiscResult.remainingKm,
      rearDiscRemainingKm: args.rearDiscResult.remainingKm,
      confidenceLabel: snapshotConfidence.label,
      gapAssessment: args.gapAssessment,
    });

    const snapshotData = {
      organizationId: args.organizationId ?? undefined,
      vehicleId: args.vehicleId,
      generatedAt: args.generatedAt,
      modelVersion: args.fingerprint.modelVersion,
      modelConfigHash: args.fingerprint.modelConfigHash,
      inputFingerprint: args.fingerprint.inputFingerprint,
      componentInstallationIds: args.inputContext.componentInstallations.map((row) => row.id),
      anchorEvidenceSummary: anchorEvidenceSummary as unknown as Prisma.InputJsonValue,
      modeledDistanceKm: round2(args.distanceSinceAnchorKm),
      observedDistanceKm: round2(args.observedDistanceKm),
      neutralGapDistanceKm: round2(args.gapAssessment.underCoverageKm),
      coverageRatio: args.coverageRatioRaw != null ? round2(args.coverageRatioRaw) : null,
      modelingSource: args.modelingSource,
      frontPadEstimateMm: args.frontPadResult.estimatedMm,
      rearPadEstimateMm: args.rearPadResult.estimatedMm,
      frontDiscEstimateMm: args.frontDiscResult.estimatedMm,
      rearDiscEstimateMm: args.rearDiscResult.estimatedMm,
      condition,
      confidence: snapshotConfidence as unknown as Prisma.InputJsonValue,
      remainingRange: remainingRange as unknown as Prisma.InputJsonValue,
      alertsSummary: serializeAlertsSummary(args.alerts) as unknown as Prisma.InputJsonValue,
    };

    try {
      const created = await this.prisma.brakeHealthSnapshot.create({
        data: snapshotData,
        select: { id: true },
      });
      this.observability?.recordSnapshot({ result: 'created' });
      return created;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const existing = await this.prisma.brakeHealthSnapshot.findFirst({
          where: {
            vehicleId: args.vehicleId,
            modelVersion: args.fingerprint.modelVersion,
            inputFingerprint: args.fingerprint.inputFingerprint,
          },
          orderBy: { generatedAt: 'desc' },
          select: { id: true },
        });
        if (!existing) throw error;
        this.observability?.recordSnapshot({ result: 'deduplicated' });
        return existing;
      }
      this.observability?.recordSnapshot({ result: 'failed' });
      throw error;
    }
  }

  async previewRecalculationAtAsOf(
    vehicleId: string,
    asOf: Date,
    inputContext: BrakeRecalculationInputContext,
  ): Promise<{
    modelVersion: string;
    modelConfigHash: string;
    inputFingerprint: string;
    frontPadEstimateMm: number | null;
    rearPadEstimateMm: number | null;
    frontDiscEstimateMm: number | null;
    rearDiscEstimateMm: number | null;
    condition: BrakeCondition;
    confidence: { score: number; label: string };
  } | null> {
    const current = await this.prisma.brakeHealthCurrent.findUnique({ where: { vehicleId } });
    if (!current?.isInitialized || current.anchorOdometerKm == null || !current.anchorServiceDate) {
      return null;
    }
    if (current.anchorServiceDate > asOf) return null;

    const fingerprint = computeBrakeRecalculationInputFingerprint(inputContext, {
      modelConfigHash: computeBrakeWearModelConfigHash(),
    });

    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
      select: {
        fuelType: true,
        brakeForceFrontPercent: true,
        dimoVehicle: { select: { rawJson: true } },
      },
    });
    const sourceFamily = resolveTelemetrySourceFamily(vehicle?.dimoVehicle?.rawJson);
    const latestState = await this.prisma.vehicleLatestState.findUnique({
      where: { vehicleId },
      select: { odometerKm: true },
    });
    const currentOdo = latestState?.odometerKm ?? null;
    if (currentOdo == null) return null;

    const distanceSinceAnchor = Math.max(0, currentOdo - current.anchorOdometerKm);
    const fuelType = vehicle?.fuelType ?? 'GASOLINE';
    const brakeBiasFront =
      vehicle?.brakeForceFrontPercent != null
        ? vehicle.brakeForceFrontPercent / 100
        : this.cfg.brakeBias.defaultFront;
    const brakeBiasRear = 1 - brakeBiasFront;
    const wearThresholds = await this.loadWearThresholds(vehicleId, current);

    const tripImpacts = await this.prisma.tripDrivingImpact.findMany({
      where: {
        vehicleId,
        tripStartedAt: { gte: current.anchorServiceDate, lte: asOf },
        analysisStatus: { in: ['COMPLETE', 'PARTIAL'] },
      },
      orderBy: { tripStartedAt: 'asc' },
      select: {
        tripId: true,
        distanceKm: true,
        authoritativeDistanceKm: true,
        analysisStatus: true,
        distanceDiscrepancyKm: true,
        citySharePct: true,
        highwaySharePct: true,
        countryRoadSharePct: true,
        hardBrakePer100Km: true,
        fullBrakingPer100Km: true,
        stopDensity: true,
        highSpeedBrakeShare: true,
        thermalBrakeStressScore: true,
      },
    });

    let modeledDistanceFromTrips = 0;
    let modeledTripCount = 0;
    let frontPadWorn = 0;
    let rearPadWorn = 0;
    let frontDiscWorn = 0;
    let rearDiscWorn = 0;

    const { allocations } = allocateTripDistancesToOdometerBudget(
      tripImpacts,
      (trip) => trip.authoritativeDistanceKm ?? trip.distanceKm ?? 0,
      distanceSinceAnchor,
    );

    let rawTripDistanceKm = 0;
    for (const { tripDistanceKm } of allocations) {
      if (tripDistanceKm > 0) rawTripDistanceKm += tripDistanceKm;
    }

    for (const { item: trip, allocatedKm } of allocations) {
      if (!(allocatedKm > 0)) continue;
      modeledTripCount += 1;
      modeledDistanceFromTrips += allocatedKm;
      const padUsage = this.computePadUsageFactor(trip);
      const padStopDensity = lookupSteppedFactor(
        trip.stopDensity ?? 0,
        this.cfg.padStopDensityAnchors,
      );
      const padHardBrake = this.resolveHardBrakeWearFactor(trip.hardBrakePer100Km);
      const padFullBraking = lookupSteppedFactor(
        containFullBrakingRate(trip.fullBrakingPer100Km, sourceFamily) ?? 0,
        this.cfg.padFullBrakingAnchors,
      );
      const padReku = this.cfg.padRekuFactors[fuelType] ?? 1.0;

      if (current.frontPadAnchorMm != null) {
        const rate = this.computePadRatePerKm(
          current.frontPadAnchorMm,
          brakeBiasFront,
          padUsage,
          padStopDensity,
          padHardBrake,
          padFullBraking,
          padReku,
          inputContext.anchor.frontPadKFactor,
          wearThresholds.FRONT_PADS,
        );
        frontPadWorn += allocatedKm * rate;
      }
      if (current.rearPadAnchorMm != null) {
        const rate = this.computePadRatePerKm(
          current.rearPadAnchorMm,
          brakeBiasRear,
          padUsage,
          padStopDensity,
          padHardBrake,
          padFullBraking,
          padReku,
          inputContext.anchor.rearPadKFactor,
          wearThresholds.REAR_PADS,
        );
        rearPadWorn += allocatedKm * rate;
      }

      const discUsage = this.computeDiscUsageFactor(trip);
      const discHighSpeed = lookupSteppedFactor(
        (trip.highSpeedBrakeShare ?? 0) * 100,
        this.cfg.discHighSpeedBrakeAnchors,
      );
      const discHardBrake = this.resolveHardBrakeWearFactor(trip.hardBrakePer100Km);
      const discFullBraking = lookupSteppedFactor(
        containFullBrakingRate(trip.fullBrakingPer100Km, sourceFamily) ?? 0,
        this.cfg.discFullBrakingAnchors,
      );
      const discThermal = interpolateThermalFactor(
        trip.thermalBrakeStressScore ?? 0,
        this.cfg.discThermalAnchors,
      );
      const discReku = this.cfg.discRekuFactors[fuelType] ?? 1.0;

      if (current.frontDiscAnchorMm != null) {
        const rate = this.computeDiscRatePerKm(
          current.frontDiscAnchorMm,
          brakeBiasFront,
          discUsage,
          discHighSpeed,
          discHardBrake,
          discFullBraking,
          discThermal,
          discReku,
          inputContext.anchor.frontDiscKFactor,
          wearThresholds.FRONT_DISCS,
        );
        frontDiscWorn += allocatedKm * rate;
      }
      if (current.rearDiscAnchorMm != null) {
        const rate = this.computeDiscRatePerKm(
          current.rearDiscAnchorMm,
          brakeBiasRear,
          discUsage,
          discHighSpeed,
          discHardBrake,
          discFullBraking,
          discThermal,
          discReku,
          inputContext.anchor.rearDiscKFactor,
          wearThresholds.REAR_DISCS,
        );
        rearDiscWorn += allocatedKm * rate;
      }
    }

    const gapAssessment = assessBrakeCoverageGap({
      distanceSinceAnchorKm: distanceSinceAnchor,
      observedDistanceKm: modeledDistanceFromTrips,
      observedTripCount: modeledTripCount,
      rawTripDistanceKm,
    });

    const neutralGapKm = gapAssessment.underCoverageKm;
    if (
      neutralGapKm > 0 &&
      gapAssessment.modelingSource !== 'NOT_ENOUGH_DATA' &&
      gapAssessment.modelingSource !== 'INCONSISTENT'
    ) {
      const n = NEUTRAL_GAP_WEAR_FACTORS;
      const padReku = this.cfg.padRekuFactors[fuelType] ?? n.padReku;
      const discReku = this.cfg.discRekuFactors[fuelType] ?? n.discReku;

      if (current.frontPadAnchorMm != null) {
        frontPadWorn +=
          neutralGapKm *
          this.computePadRatePerKm(
            current.frontPadAnchorMm,
            brakeBiasFront,
            n.padUsage,
            n.padStopDensity,
            n.padHardBrake,
            n.padFullBraking,
            padReku,
            inputContext.anchor.frontPadKFactor,
            wearThresholds.FRONT_PADS,
          );
      }
      if (current.rearPadAnchorMm != null) {
        rearPadWorn +=
          neutralGapKm *
          this.computePadRatePerKm(
            current.rearPadAnchorMm,
            brakeBiasRear,
            n.padUsage,
            n.padStopDensity,
            n.padHardBrake,
            n.padFullBraking,
            padReku,
            inputContext.anchor.rearPadKFactor,
            wearThresholds.REAR_PADS,
          );
      }
      if (current.frontDiscAnchorMm != null) {
        frontDiscWorn +=
          neutralGapKm *
          this.computeDiscRatePerKm(
            current.frontDiscAnchorMm,
            brakeBiasFront,
            n.discUsage,
            n.discHighSpeed,
            n.discHardBrake,
            n.discFullBraking,
            n.discThermal,
            discReku,
            inputContext.anchor.frontDiscKFactor,
            wearThresholds.FRONT_DISCS,
          );
      }
      if (current.rearDiscAnchorMm != null) {
        rearDiscWorn +=
          neutralGapKm *
          this.computeDiscRatePerKm(
            current.rearDiscAnchorMm,
            brakeBiasRear,
            n.discUsage,
            n.discHighSpeed,
            n.discHardBrake,
            n.discFullBraking,
            n.discThermal,
            discReku,
            inputContext.anchor.rearDiscKFactor,
            wearThresholds.REAR_DISCS,
          );
      }
    }

    const frontPadResult = this.computePadFromWorn(
      current.frontPadAnchorMm,
      frontPadWorn,
      distanceSinceAnchor,
      wearThresholds.FRONT_PADS,
    );
    const rearPadResult = this.computePadFromWorn(
      current.rearPadAnchorMm,
      rearPadWorn,
      distanceSinceAnchor,
      wearThresholds.REAR_PADS,
    );
    const frontDiscResult = this.computeDiscFromWorn(
      current.frontDiscAnchorMm,
      frontDiscWorn,
      distanceSinceAnchor,
      wearThresholds.FRONT_DISCS,
    );
    const rearDiscResult = this.computeDiscFromWorn(
      current.rearDiscAnchorMm,
      rearDiscWorn,
      distanceSinceAnchor,
      wearThresholds.REAR_DISCS,
    );

    const confidence = this.computeConfidence(
      current,
      null,
      gapAssessment.coverageRatioRaw,
      modeledTripCount,
      gapAssessment.modelingSource,
      gapAssessment,
    );

    const condition = deriveSnapshotCondition({
      frontPadHealthPct: frontPadResult.healthPct,
      rearPadHealthPct: rearPadResult.healthPct,
      frontDiscHealthPct: frontDiscResult.healthPct,
      rearDiscHealthPct: rearDiscResult.healthPct,
      frontPadRemainingKm: frontPadResult.remainingKm,
      rearPadRemainingKm: rearPadResult.remainingKm,
      frontDiscRemainingKm: frontDiscResult.remainingKm,
      rearDiscRemainingKm: rearDiscResult.remainingKm,
    });

    return {
      modelVersion: fingerprint.modelVersion,
      modelConfigHash: fingerprint.modelConfigHash,
      inputFingerprint: fingerprint.inputFingerprint,
      frontPadEstimateMm: frontPadResult.estimatedMm,
      rearPadEstimateMm: rearPadResult.estimatedMm,
      frontDiscEstimateMm: frontDiscResult.estimatedMm,
      rearDiscEstimateMm: rearDiscResult.estimatedMm,
      condition,
      confidence,
    };
  }

  private async requestRecalculation(
    vehicleId: string,
    trigger: BrakeRecalculationTrigger,
  ): Promise<void> {
    if (this.recalcOrchestrator) {
      await this.recalcOrchestrator.enqueue({ vehicleId, trigger });
      return;
    }
    await this.recalculate(vehicleId, { trigger });
  }

  /**
   * Workshop ground-truth calibration — adjusts scoped k-factors from confirmed mm measurements.
   * Requires initialized brake health and sufficient predicted wear since anchor.
   */
  async calibrateFromMeasurement(
    vehicleId: string,
    measurement: {
      frontPadMm?: number | null;
      rearPadMm?: number | null;
      frontDiscMm?: number | null;
      rearDiscMm?: number | null;
    },
  ): Promise<{
    frontPadKFactor: number;
    rearPadKFactor: number;
    frontDiscKFactor: number;
    rearDiscKFactor: number;
    calibrationCount: number;
    calibratedComponents: string[];
  }> {
    const current = await this.prisma.brakeHealthCurrent.findUnique({ where: { vehicleId } });
    if (!current?.isInitialized) {
      return {
        frontPadKFactor: current?.frontPadKFactor ?? 1,
        rearPadKFactor: current?.rearPadKFactor ?? 1,
        frontDiscKFactor: current?.frontDiscKFactor ?? 1,
        rearDiscKFactor: current?.rearDiscKFactor ?? 1,
        calibrationCount: current?.calibrationCount ?? 0,
        calibratedComponents: [],
      };
    }

    const count = current.calibrationCount ?? 0;
    let frontPadKFactor = current.frontPadKFactor ?? 1;
    let rearPadKFactor = current.rearPadKFactor ?? 1;
    let frontDiscKFactor = current.frontDiscKFactor ?? 1;
    let rearDiscKFactor = current.rearDiscKFactor ?? 1;
    const calibratedComponents: string[] = [];

    const apply = (
      component: 'FRONT_PADS' | 'REAR_PADS' | 'FRONT_DISCS' | 'REAR_DISCS',
      anchorMm: number | null,
      predictedMm: number | null,
      measuredMm: number | null | undefined,
      currentK: number,
    ): number => {
      if (anchorMm == null || predictedMm == null || measuredMm == null) return currentK;
      const result = calibrateBrakeKFactorForComponent(
        component,
        currentK,
        anchorMm,
        predictedMm,
        measuredMm,
        count + 1,
      );
      if (result.applied) calibratedComponents.push(component);
      return result.newK;
    };

    frontPadKFactor = apply(
      'FRONT_PADS',
      current.frontPadAnchorMm,
      current.frontPadEstimatedMm,
      measurement.frontPadMm,
      frontPadKFactor,
    );
    rearPadKFactor = apply(
      'REAR_PADS',
      current.rearPadAnchorMm,
      current.rearPadEstimatedMm,
      measurement.rearPadMm,
      rearPadKFactor,
    );
    frontDiscKFactor = apply(
      'FRONT_DISCS',
      current.frontDiscAnchorMm,
      current.frontDiscEstimatedMm,
      measurement.frontDiscMm,
      frontDiscKFactor,
    );
    rearDiscKFactor = apply(
      'REAR_DISCS',
      current.rearDiscAnchorMm,
      current.rearDiscEstimatedMm,
      measurement.rearDiscMm,
      rearDiscKFactor,
    );

    if (calibratedComponents.length === 0) {
      return {
        frontPadKFactor,
        rearPadKFactor,
        frontDiscKFactor,
        rearDiscKFactor,
        calibrationCount: count,
        calibratedComponents,
      };
    }

    const newCount = count + 1;
    await this.prisma.brakeHealthCurrent.update({
      where: { vehicleId },
      data: {
        frontPadKFactor,
        rearPadKFactor,
        frontDiscKFactor,
        rearDiscKFactor,
        calibrationCount: newCount,
      },
    });

    return {
      frontPadKFactor,
      rearPadKFactor,
      frontDiscKFactor,
      rearDiscKFactor,
      calibrationCount: newCount,
      calibratedComponents,
    };
  }

  private async calibrateFromLatestMeasurement(vehicleId: string): Promise<void> {
    const rows = await this.prisma.brakeEvidence.findMany({
      where: {
        vehicleId,
        active: true,
        supersededByEvidenceId: null,
        OR: [{ measuredPadMm: { not: null } }, { measuredDiscMm: { not: null } }],
      },
      orderBy: [{ measuredAt: 'desc' }, { createdAt: 'desc' }],
      take: 5,
      select: {
        source: true,
        confirmationStatus: true,
        measuredPadMm: true,
        measuredDiscMm: true,
        axle: true,
      },
    });
    const evidence = rows.find((row) => isMmGroundTruth(row));
    if (!evidence) return;

    await this.calibrateFromMeasurement(vehicleId, {
      frontPadMm:
        evidence.axle === 'FRONT' || evidence.axle === 'UNKNOWN'
          ? evidence.measuredPadMm
          : null,
      rearPadMm:
        evidence.axle === 'REAR' || evidence.axle === 'UNKNOWN'
          ? evidence.measuredPadMm
          : null,
      frontDiscMm:
        evidence.axle === 'FRONT' || evidence.axle === 'UNKNOWN'
          ? evidence.measuredDiscMm
          : null,
      rearDiscMm:
        evidence.axle === 'REAR' || evidence.axle === 'UNKNOWN'
          ? evidence.measuredDiscMm
          : null,
    });
  }

  private resolveHardBrakeWearFactor(hardBrakePer100Km: number | null | undefined): number {
    return harshBrakeWearMultiplier(hardBrakePer100Km).multiplier;
  }

  private async writeRecalculationAudit(input: {
    organizationId: string | null | undefined;
    vehicleId: string;
    trigger: BrakeRecalculationTrigger;
    forced: boolean;
    forceReason: string | null;
    actorId: string | null;
    inputFingerprint: string | null;
    result: string;
    skipReason: string | null;
    durationMs: number | null;
  }): Promise<void> {
    await this.prisma.brakeRecalculationAudit.create({
      data: {
        organizationId: input.organizationId ?? undefined,
        vehicleId: input.vehicleId,
        trigger: input.trigger,
        forced: input.forced,
        forceReason: input.forceReason,
        actorId: input.actorId ?? undefined,
        inputFingerprint: input.inputFingerprint,
        result: input.result,
        skipReason: input.skipReason,
        durationMs: input.durationMs,
      },
    });
  }

  computePadWear(
    anchorMm: number | null,
    distanceKm: number,
    biasShare: number,
    usageFactor: number,
    stopDensityFactor: number,
    hardBrakeFactor: number,
    fullBrakingFactor: number,
    rekuFactor: number,
    kFactor: number,
    threshold?: BrakeComponentWearThresholdContract,
  ): {
    estimatedMm: number | null;
    healthPct: number | null;
    remainingKm: number | null;
    wearRate: number | null;
  } {
    if (anchorMm == null) {
      return { estimatedMm: null, healthPct: null, remainingKm: null, wearRate: null };
    }

    const resolved =
      threshold ??
      resolveComponentWearThreshold('FRONT_PADS', null, { anchorMm });
    const minimumMm = modelingMinimumMm(resolved);
    const usableMm = minimumMm != null ? modelingUsableWearMm(anchorMm, resolved) : null;
    if (minimumMm != null && anchorMm <= minimumMm) {
      return {
        estimatedMm: anchorMm,
        healthPct: resolved.confirmed ? 0 : null,
        remainingKm: resolved.confirmed ? 0 : null,
        wearRate: null,
      };
    }
    if (usableMm == null || usableMm <= 0) {
      return { estimatedMm: anchorMm, healthPct: null, remainingKm: null, wearRate: null };
    }

    const baseWearPerKm = usableMm / this.cfg.pad.baseLifeKm;

    const effectiveWearPerKm =
      (baseWearPerKm * biasShare) / this.cfg.brakeBias.defaultFront *
      usageFactor *
      stopDensityFactor *
      hardBrakeFactor *
      fullBrakingFactor *
      rekuFactor *
      kFactor;

    const wornMm = distanceKm * effectiveWearPerKm;
    const estimatedMm = clamp(anchorMm - wornMm, minimumMm!, anchorMm);
    const healthPct = clamp(((estimatedMm - minimumMm!) / usableMm) * 100, 0, 100);
    const remainingMm = estimatedMm - minimumMm!;
    const remainingKm =
      resolved.confirmed && remainingMm > 0 && effectiveWearPerKm > 0
        ? Math.round(remainingMm / effectiveWearPerKm)
        : resolved.usesLegacyDefault && remainingMm > 0 && effectiveWearPerKm > 0
          ? Math.round(remainingMm / effectiveWearPerKm)
          : resolved.confirmed && remainingMm <= 0
            ? 0
            : null;

    return {
      estimatedMm: round2(estimatedMm),
      healthPct: round2(healthPct),
      remainingKm,
      wearRate: effectiveWearPerKm,
    };
  }

  computeDiscWear(
    anchorMm: number | null,
    distanceKm: number,
    biasShare: number,
    usageFactor: number,
    highSpeedFactor: number,
    hardBrakeFactor: number,
    fullBrakingFactor: number,
    thermalFactor: number,
    rekuFactor: number,
    kFactor: number,
    threshold?: BrakeComponentWearThresholdContract,
  ): {
    estimatedMm: number | null;
    healthPct: number | null;
    remainingKm: number | null;
    wearRate: number | null;
  } {
    if (anchorMm == null) {
      return { estimatedMm: null, healthPct: null, remainingKm: null, wearRate: null };
    }

    const resolved =
      threshold ??
      resolveComponentWearThreshold('FRONT_DISCS', null, { anchorMm });
    const minimumMm = modelingMinimumMm(resolved);
    if (resolved.thresholdMissing || minimumMm == null) {
      const wornMm =
        distanceKm > 0
          ? distanceKm *
            this.computeDiscRatePerKm(
              anchorMm,
              biasShare,
              usageFactor,
              highSpeedFactor,
              hardBrakeFactor,
              fullBrakingFactor,
              thermalFactor,
              rekuFactor,
              kFactor,
              resolved,
            )
          : 0;
      return {
        estimatedMm: round2(Math.max(0, anchorMm - wornMm)),
        healthPct: null,
        remainingKm: null,
        wearRate: null,
      };
    }

    const usableMm = anchorMm - minimumMm;
    const baseWearPerKm = usableMm / this.cfg.disc.baseLifeKm;

    const effectiveWearPerKm =
      (baseWearPerKm * biasShare) / this.cfg.brakeBias.defaultFront *
      usageFactor *
      highSpeedFactor *
      hardBrakeFactor *
      fullBrakingFactor *
      thermalFactor *
      rekuFactor *
      kFactor;

    const wornMm = distanceKm * effectiveWearPerKm;
    const estimatedMm = clamp(anchorMm - wornMm, minimumMm, anchorMm);
    const remainingWearMm = estimatedMm - minimumMm;
    const healthPct = clamp((remainingWearMm / usableMm) * 100, 0, 100);
    const remainingMm = estimatedMm - minimumMm;
    const remainingKm =
      resolved.confirmed && remainingMm > 0 && effectiveWearPerKm > 0
        ? Math.round(remainingMm / effectiveWearPerKm)
        : null;

    return {
      estimatedMm: round2(estimatedMm),
      healthPct: round2(healthPct),
      remainingKm,
      wearRate: effectiveWearPerKm,
    };
  }

  computePadUsageFactor(impact: Pick<BrakeImpactLike, 'citySharePct' | 'highwaySharePct' | 'countryRoadSharePct'> | null): number {
    if (!impact) return 1.0;
    const city = impact.citySharePct ?? 33;
    const highway = impact.highwaySharePct ?? 34;
    const country = impact.countryRoadSharePct ?? 33;
    const total = city + highway + country || 100;
    const f = this.cfg.padUsageFactors;
    return round2(
      (city / total) * f.city +
        (highway / total) * f.highway +
        (country / total) * f.countryRoad,
    );
  }

  computeDiscUsageFactor(impact: Pick<BrakeImpactLike, 'citySharePct' | 'highwaySharePct' | 'countryRoadSharePct'> | null): number {
    if (!impact) return 1.0;
    const city = impact.citySharePct ?? 33;
    const highway = impact.highwaySharePct ?? 34;
    const country = impact.countryRoadSharePct ?? 33;
    const total = city + highway + country || 100;
    const f = this.cfg.discUsageFactors;
    return round2(
      (city / total) * f.city +
        (highway / total) * f.highway +
        (country / total) * f.countryRoad,
    );
  }

  private computePadRatePerKm(
    anchorMm: number,
    biasShare: number,
    usageFactor: number,
    stopDensityFactor: number,
    hardBrakeFactor: number,
    fullBrakingFactor: number,
    rekuFactor: number,
    kFactor: number,
    threshold: BrakeComponentWearThresholdContract,
  ): number {
    const usableMm = modelingUsableWearMm(anchorMm, threshold);
    if (usableMm == null || usableMm <= 0) return 0;
    const baseWearPerKm = usableMm / this.cfg.pad.baseLifeKm;
    return (
      (baseWearPerKm * biasShare) / this.cfg.brakeBias.defaultFront *
      usageFactor *
      stopDensityFactor *
      hardBrakeFactor *
      fullBrakingFactor *
      rekuFactor *
      kFactor
    );
  }

  private computeDiscRatePerKm(
    anchorMm: number,
    biasShare: number,
    usageFactor: number,
    highSpeedFactor: number,
    hardBrakeFactor: number,
    fullBrakingFactor: number,
    thermalFactor: number,
    rekuFactor: number,
    kFactor: number,
    threshold: BrakeComponentWearThresholdContract,
  ): number {
    if (threshold.thresholdMissing || modelingMinimumMm(threshold) == null) return 0;
    const usableMm = modelingUsableWearMm(anchorMm, threshold);
    if (usableMm == null || usableMm <= 0) return 0;
    const baseWearPerKm = usableMm / this.cfg.disc.baseLifeKm;
    return (
      (baseWearPerKm * biasShare) / this.cfg.brakeBias.defaultFront *
      usageFactor *
      highSpeedFactor *
      hardBrakeFactor *
      fullBrakingFactor *
      thermalFactor *
      rekuFactor *
      kFactor
    );
  }

  private computePadFromWorn(
    anchorMm: number | null,
    wornMm: number,
    distanceSinceAnchor: number,
    threshold: BrakeComponentWearThresholdContract,
  ): { estimatedMm: number | null; healthPct: number | null; remainingKm: number | null; wearRate: number | null } {
    if (anchorMm == null) {
      return { estimatedMm: null, healthPct: null, remainingKm: null, wearRate: null };
    }
    const minimumMm = modelingMinimumMm(threshold);
    const usableMm = minimumMm != null ? modelingUsableWearMm(anchorMm, threshold) : null;
    if (usableMm == null || usableMm <= 0 || minimumMm == null) {
      return { estimatedMm: round2(Math.max(0, anchorMm - wornMm)), healthPct: null, remainingKm: null, wearRate: null };
    }
    const estimatedMm = clamp(anchorMm - wornMm, minimumMm, anchorMm);
    const healthPct = clamp(((estimatedMm - minimumMm) / usableMm) * 100, 0, 100);
    const wearRate = distanceSinceAnchor > 0 ? wornMm / distanceSinceAnchor : null;
    const remainingMm = estimatedMm - minimumMm;
    const remainingKm =
      remainingMm > 0 && wearRate != null && wearRate > 0 && (threshold.confirmed || threshold.usesLegacyDefault)
        ? Math.round(remainingMm / wearRate)
        : null;
    return {
      estimatedMm: round2(estimatedMm),
      healthPct: round2(healthPct),
      remainingKm,
      wearRate: wearRate != null ? round2(wearRate) : null,
    };
  }

  private computeDiscFromWorn(
    anchorMm: number | null,
    wornMm: number,
    distanceSinceAnchor: number,
    threshold: BrakeComponentWearThresholdContract,
  ): { estimatedMm: number | null; healthPct: number | null; remainingKm: number | null; wearRate: number | null } {
    if (anchorMm == null) {
      return { estimatedMm: null, healthPct: null, remainingKm: null, wearRate: null };
    }
    const minimumMm = modelingMinimumMm(threshold);
    if (threshold.thresholdMissing || minimumMm == null) {
      const wearRate = distanceSinceAnchor > 0 ? wornMm / distanceSinceAnchor : null;
      return {
        estimatedMm: round2(Math.max(0, anchorMm - wornMm)),
        healthPct: null,
        remainingKm: null,
        wearRate: wearRate != null ? round2(wearRate) : null,
      };
    }
    const usableMm = anchorMm - minimumMm;
    const estimatedMm = clamp(anchorMm - wornMm, minimumMm, anchorMm);
    const healthPct = clamp(((estimatedMm - minimumMm) / usableMm) * 100, 0, 100);
    const wearRate = distanceSinceAnchor > 0 ? wornMm / distanceSinceAnchor : null;
    const remainingMm = estimatedMm - minimumMm;
    const remainingKm =
      threshold.confirmed && remainingMm > 0 && wearRate != null && wearRate > 0
        ? Math.round(remainingMm / wearRate)
        : null;
    return {
      estimatedMm: round2(estimatedMm),
      healthPct: round2(healthPct),
      remainingKm,
      wearRate: wearRate != null ? round2(wearRate) : null,
    };
  }

  private computeConfidence(
    current: BrakeHealthCurrent,
    impact: VehicleImpactForBrake | null,
    coverageRatioRaw: number | null,
    modeledTripCount: number,
    source: BrakeModelingSource,
    gapAssessment: BrakeCoverageGapAssessment,
  ): { score: number; label: string } {
    const c = this.cfg.confidence;
    let score = 0;
    const hasMeasuredAnchor = this.hasMeasuredAnchorStatus(current);
    const anchorStatus = String(current.anchorValidationStatus ?? '').toLowerCase();
    const specFallbackOnly =
      !hasMeasuredAnchor &&
      (anchorStatus.includes('spec_fallback') || anchorStatus.includes('spec_only'));

    if (hasMeasuredAnchor) {
      if (current.frontPadAnchorMm != null || current.rearPadAnchorMm != null) score += c.padAnchors;
      if (current.frontDiscAnchorMm != null || current.rearDiscAnchorMm != null) score += c.rotorAnchors;
      score += c.measurementExists;
    }
    if (current.anchorServiceDate != null) score += c.serviceEvents;
    if (
      impact &&
      source !== 'NEUTRAL_GAP_ONLY' &&
      gapAssessment.gapShare < 0.7
    ) {
      score += c.drivingImpactData;
    }
    if (impact?.brakingStressScore != null && gapAssessment.gapShare < 0.5) {
      score += c.brakingMetrics;
    }
    if (impact?.stopDensity != null && gapAssessment.gapShare < 0.5) {
      score += c.usageData;
    }
    if (current.anchorOdometerKm != null) score += c.odometerAvailable;
    if (current.calibrationCount >= (this.cfg.calibration.stabilizedThreshold ?? 4)) {
      score += c.calibrationStabilized;
    }

    const effectiveCoverage =
      coverageRatioRaw != null ? Math.min(coverageRatioRaw, 1) : null;
    if (effectiveCoverage != null && effectiveCoverage >= 0.85) score += 6;
    else if (effectiveCoverage != null && effectiveCoverage >= 0.6) score += 2;
    else if (effectiveCoverage != null) score -= 16;
    else score -= 12;

    if (modeledTripCount === 0) score -= 8;
    score += gapAssessment.confidenceAdjustment;

    if (
      (source === 'MIXED_OBSERVED_NEUTRAL_GAP' || source === 'NEUTRAL_GAP_ONLY') &&
      gapAssessment.gapShare > 0.5
    ) {
      score = Math.min(score, this.cfg.confidenceThresholds.high - 1);
    }
    if (specFallbackOnly) {
      score = Math.min(score, this.cfg.confidenceThresholds.medium);
    }

    score = clamp(score, 0, 100);
    let label: string;
    if (score >= this.cfg.confidenceThresholds.high) label = 'High';
    else if (score >= this.cfg.confidenceThresholds.medium) label = 'Medium';
    else label = 'Low';
    return { score, label };
  }

  private computeAlerts(
    current: BrakeHealthCurrent,
    thresholds: Record<BrakeReferenceSpecComponent, BrakeComponentWearThresholdContract>,
  ): BrakeAlert[] {
    const alerts: BrakeAlert[] = [];
    const a = this.cfg.alerts;

    const evaluatePad = (
      label: string,
      mm: number | null | undefined,
      threshold: BrakeComponentWearThresholdContract,
    ) => {
      if (mm == null) return;
      if (canEmitMeasuredCritical(threshold) && threshold.criticalThresholdMm != null && mm <= threshold.criticalThresholdMm) {
        alerts.push({
          type: 'PAD_CRITICAL',
          severity: 'critical',
          message: `${label}: critically low (${mm.toFixed(1)} mm)`,
          value: mm,
        });
        return;
      }
      if (
        threshold.warningThresholdMm != null &&
        mm <= threshold.warningThresholdMm &&
        (threshold.confirmed || threshold.usesLegacyDefault)
      ) {
        alerts.push({
          type: 'PAD_WARNING',
          severity: 'warning',
          message: `${label}: approaching limit (${mm.toFixed(1)} mm)`,
          value: mm,
        });
      }
    };

    evaluatePad('Front pads', current.frontPadEstimatedMm, thresholds.FRONT_PADS);
    evaluatePad('Rear pads', current.rearPadEstimatedMm, thresholds.REAR_PADS);

    const evaluateDisc = (
      label: string,
      estimatedMm: number | null | undefined,
      threshold: BrakeComponentWearThresholdContract,
    ) => {
      if (estimatedMm == null || threshold.thresholdMissing) return;
      if (
        canEmitMeasuredCritical(threshold) &&
        threshold.criticalThresholdMm != null &&
        estimatedMm <= threshold.criticalThresholdMm
      ) {
        alerts.push({
          type: 'DISC_CRITICAL',
          severity: 'critical',
          message: `${label}: critically worn`,
          value: estimatedMm,
        });
        return;
      }
      if (
        threshold.confirmed &&
        threshold.warningThresholdMm != null &&
        estimatedMm <= threshold.warningThresholdMm
      ) {
        alerts.push({
          type: 'DISC_WARNING',
          severity: 'warning',
          message: `${label}: approaching wear limit`,
          value: estimatedMm,
        });
      }
    };

    evaluateDisc('Front discs', current.frontDiscEstimatedMm, thresholds.FRONT_DISCS);
    evaluateDisc('Rear discs', current.rearDiscEstimatedMm, thresholds.REAR_DISCS);

    const remainingCandidates = [
      current.frontPadRemainingKm,
      current.rearPadRemainingKm,
    ];
    if (!thresholds.FRONT_DISCS.thresholdMissing) {
      remainingCandidates.push(current.frontDiscRemainingKm);
    }
    if (!thresholds.REAR_DISCS.thresholdMissing) {
      remainingCandidates.push(current.rearDiscRemainingKm);
    }
    const finiteRemaining = remainingCandidates.filter(
      (v): v is number => typeof v === 'number' && Number.isFinite(v),
    );
    const minRemaining = finiteRemaining.length
      ? Math.min(...finiteRemaining)
      : Number.POSITIVE_INFINITY;
    if (minRemaining <= a.criticalRemainingKm) {
      alerts.push({
        type: 'CRITICAL_REMAINING_KM',
        severity: 'critical',
        message: `Brake replacement imminent (${Math.round(minRemaining).toLocaleString()} km)`,
        value: minRemaining,
      });
    } else if (minRemaining <= a.lowRemainingKm) {
      alerts.push({
        type: 'LOW_REMAINING_KM',
        severity: 'warning',
        message: `Plan brake service soon (${Math.round(minRemaining).toLocaleString()} km)`,
        value: minRemaining,
      });
    }

    const underCoverage =
      current.underCoverageKm ??
      (current.distanceSinceAnchorKm != null && current.modeledDistanceKm != null
        ? Math.max(0, current.distanceSinceAnchorKm - current.modeledDistanceKm)
        : null);
    const overCoverage = current.overCoverageKm ?? null;
    const coverageStatus = (current.coverageStatus as BrakeCoverageStatus | null) ?? null;
    const modelingSource = normalizeModelingSource(current.modelingSource);

    if (underCoverage != null && underCoverage > 0) {
      alerts.push({
        type: 'COVERAGE_GAP',
        severity: 'info',
        message: `Trip-impact coverage gap: ${Math.round(underCoverage).toLocaleString()} km modeled with neutral baseline wear (behavior unknown).`,
      });
    }

    if (overCoverage != null && overCoverage > 0) {
      alerts.push({
        type: 'COVERAGE_GAP',
        severity: 'warning',
        message: `Trip distance exceeds odometer by ${Math.round(overCoverage).toLocaleString()} km — reconciliation required.`,
      });
    }

    if (
      modelingSource === 'NOT_ENOUGH_DATA' ||
      coverageStatus === 'UNKNOWN'
    ) {
      alerts.push({
        type: 'COVERAGE_GAP',
        severity: 'info',
        message: 'Precise brake wear prognosis requires odometer distance since anchor.',
      });
    }

    const effectiveCoverage =
      current.coverageRatioRaw ?? current.modelCoverageRatio;
    if (
      effectiveCoverage != null &&
      effectiveCoverage < 0.6 &&
      (underCoverage ?? 0) > 0
    ) {
      alerts.push({
        type: 'COVERAGE_GAP',
        severity: 'info',
        message: 'Trip-impact coverage is partial. Remaining wear uncertainty is elevated.',
      });
    }

    if (current.confidenceScore != null && current.confidenceScore < a.lowConfidenceThreshold) {
      alerts.push({
        type: 'LOW_CONFIDENCE',
        severity: 'info',
        message: 'Brake health estimate confidence is low — measured service data recommended.',
      });
    }
    return alerts;
  }

  private normalizePositive(value: number | null | undefined): number | null {
    if (typeof value !== 'number' || !Number.isFinite(value)) return null;
    if (value <= 0) return null;
    return round2(value);
  }

  private deriveModeledComponents(current: BrakeHealthCurrent | null): BrakeModeledComponentsDto {
    const frontPads = current?.frontPadAnchorMm != null;
    const rearPads = current?.rearPadAnchorMm != null;
    const frontDiscs = current?.frontDiscAnchorMm != null;
    const rearDiscs = current?.rearDiscAnchorMm != null;
    return {
      frontPads,
      rearPads,
      frontDiscs,
      rearDiscs,
      hasAnyPads: frontPads || rearPads,
      hasAnyDiscs: frontDiscs || rearDiscs,
      hasAnyModeled: frontPads || rearPads || frontDiscs || rearDiscs,
    };
  }

  private deriveStateClass(current: BrakeHealthCurrent | null, modeled: BrakeModeledComponentsDto): BrakeStateClass {
    if (!modeled.hasAnyModeled) return 'NO_BASELINE';
    if (!current?.isInitialized) return 'NO_BASELINE';
    const status = String(current.anchorValidationStatus ?? '').toLowerCase();
    if (status.includes('measured')) return 'MEASURED';
    return 'ESTIMATED';
  }

  private hasMeasuredAnchorStatus(current: BrakeHealthCurrent | null): boolean {
    const status = String(current?.anchorValidationStatus ?? '').toLowerCase();
    return status.includes('measured');
  }

  private deriveLimitingComponent(current: BrakeHealthCurrent | null): BrakeLimitingComponent {
    const components: Array<{ key: BrakeLimitingComponent; value: number | null | undefined }> = [
      { key: 'FRONT_PADS', value: current?.frontPadHealthPct },
      { key: 'REAR_PADS', value: current?.rearPadHealthPct },
      { key: 'FRONT_DISCS', value: current?.frontDiscHealthPct },
      { key: 'REAR_DISCS', value: current?.rearDiscHealthPct },
    ];
    const valid = components.filter(
      (c): c is { key: Exclude<BrakeLimitingComponent, null>; value: number } =>
        typeof c.value === 'number',
    );
    if (valid.length === 0) return null;
    valid.sort((a, b) => a.value - b.value);
    return valid[0].key;
  }

  private readWarningArray(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value.filter((v): v is string => typeof v === 'string' && v.trim().length > 0);
  }

  private computeCoverageWarnings(
    coverageRatioRaw: number | null | undefined,
    distanceSinceAnchor: number | null | undefined,
    modeledDistance: number | null | undefined,
    modeledTripCount: number,
    source: BrakeModelingSource,
    underCoverageKm?: number | null,
    overCoverageKm?: number | null,
    coverageStatus?: BrakeCoverageStatus | null,
  ): string[] {
    const warnings: string[] = [];
    const coverageRatio =
      typeof coverageRatioRaw === 'number' && Number.isFinite(coverageRatioRaw)
        ? coverageRatioRaw
        : null;
    const dist = typeof distanceSinceAnchor === 'number' ? distanceSinceAnchor : null;
    const modeled = typeof modeledDistance === 'number' ? modeledDistance : null;
    const under =
      typeof underCoverageKm === 'number'
        ? underCoverageKm
        : dist != null && modeled != null
          ? Math.max(0, dist - modeled)
          : null;
    const over = typeof overCoverageKm === 'number' ? overCoverageKm : null;

    if (under != null && under > 0) {
      warnings.push(
        `Coverage gap: ${Math.round(under).toLocaleString()} km since anchor use neutral baseline wear (behavior unknown).`,
      );
    }
    if (over != null && over > 0) {
      warnings.push(
        `Trip-impact distance exceeds odometer by ${Math.round(over).toLocaleString()} km — reconciliation required.`,
      );
    }
    if (coverageRatio != null && coverageRatio < 0.6 && (under ?? 0) > 0) {
      warnings.push(
        `Low trip-impact coverage (${Math.round(Math.min(coverageRatio, 1) * 100)}%). Estimate confidence is reduced.`,
      );
    }
    if (modeledTripCount === 0 && dist != null && dist > 0) {
      warnings.push('No trip impact rows available since anchor; neutral baseline wear applies.');
    }
    if (source === 'MIXED_OBSERVED_NEUTRAL_GAP') {
      warnings.push('Uncovered distance uses neutral baseline wear — not current rolling behavior.');
    }
    if (source === 'NEUTRAL_GAP_ONLY') {
      warnings.push(
        'Only neutral baseline wear applies after anchor; no per-trip impacts were found.',
      );
    }
    if (source === 'INCONSISTENT' || coverageStatus === 'OVER') {
      warnings.push('Odometer and trip-impact distances conflict; wear is capped to odometer budget.');
    }
    if (source === 'NOT_ENOUGH_DATA' || coverageStatus === 'UNKNOWN') {
      warnings.push('Precise wear prognosis requires distance since anchor (odometer).');
    }
    return warnings;
  }

  private async buildNoBaselineSummary(
    vehicleId: string,
    current: BrakeHealthCurrent | null,
    modeledComponents: BrakeModeledComponentsDto,
    canonicalReadOptions?: { emitNotifications?: boolean; syncAlerts?: boolean },
  ): Promise<BrakeHealthSummaryDto> {
    const baselineWarnings = this.readWarningArray(current?.baselineWarnings);
    const canonical = await this.buildCanonicalReadModel(vehicleId, current, modeledComponents, {
      emitNotifications: canonicalReadOptions?.emitNotifications ?? false,
      syncAlerts: canonicalReadOptions?.syncAlerts !== false,
    });
    const wearThresholds = await this.loadWearThresholds(vehicleId, current);
    const legacyState = await this.prisma.vehicleLatestState.findUnique({
      where: { vehicleId },
      select: { brakePadPercent: true, lastSeenAt: true },
    });
    const legacyPad = legacyState?.brakePadPercent;
    const hasLegacyWarning = legacyPad != null && legacyPad < 40;
    const stateClass: BrakeStateClass = hasLegacyWarning ? 'WARNING_ONLY' : 'NO_BASELINE';
    const msg =
      stateClass === 'WARNING_ONLY'
        ? 'No modeled brake baseline yet. Legacy telemetry indicates potential brake attention.'
        : 'Brake wear tracking awaits a valid brake service baseline with odometer and thickness anchor.';

    return this.composeSummaryDto({
      isInitialized: false,
      stateClass,
      message: msg,
      actions: { canAddBrakeService: true, canUseAiUpload: true },
      modeledComponents,
      modelCoverage: {
        distanceSinceAnchorKm: null,
        modeledDistanceKm: null,
        modeledTripCount: 0,
        coverageRatio: null,
        coverageRatioRaw: null,
        underCoverageKm: null,
        overCoverageKm: null,
        coverageStatus: 'UNKNOWN',
        hasGap: false,
        reconciliationRequired: false,
        source: 'NOT_ENOUGH_DATA',
      },
      limitingComponent: null,
      lastChangeAt: null,
      lastRecalculatedAt: current?.lastRecalculatedAt?.toISOString() ?? null,
      confidence: { score: Math.round(current?.confidenceScore ?? 0), label: current?.confidenceLabel ?? 'Low' },
      baselineWarnings:
        baselineWarnings.length > 0
          ? baselineWarnings
          : ['No valid baseline anchor is available for V2 brake wear modeling.'],
      provenanceWarnings:
        stateClass === 'WARNING_ONLY'
          ? ['Legacy telemetry warning only; this is not a modeled brake wear estimate.']
          : [],
      legacyHeuristic: {
        available: legacyPad != null,
        note:
          legacyPad != null
            ? `Legacy brakePadPercent=${Math.round(legacyPad)}% (supplement only, not modeled truth).`
            : 'No legacy brake telemetry available.',
      },
      canonical,
      legacy: {
        padsHealthPct: legacyPad != null ? Math.round(legacyPad) : null,
        discsHealthPct: null,
        padsRemainingKm: null,
        discsRemainingKm: null,
        status: conditionToLegacyStatus(canonical.overallCondition, stateClass),
        remainingKm: null,
      },
      componentThresholds: this.componentThresholdDtos(wearThresholds),
    });
  }

  /** Merge canonical read model + legacy wear fields into the public summary DTO. */
  private composeSummaryDto(input: {
    isInitialized: boolean;
    stateClass: BrakeStateClass;
    message?: string;
    actions?: { canAddBrakeService: boolean; canUseAiUpload: boolean };
    limitingComponent?: BrakeLimitingComponent;
    modeledComponents: BrakeModeledComponentsDto;
    modelCoverage: BrakeModelCoverageDto;
    lastChangeAt?: string | null;
    lastRecalculatedAt?: string | null;
    confidence?: { score: number; label: string };
    baselineWarnings: string[];
    provenanceWarnings: string[];
    legacyHeuristic?: { available: boolean; note: string };
    canonical: BrakeCanonicalBuildResult;
    legacy: BrakeHealthLegacyDto;
    componentThresholds: BrakeComponentThresholdDto[];
  }): BrakeHealthSummaryDto {
    const { canonical, legacy } = input;
    const openAlerts = canonical.openAlerts;
    const hasCanonicalAlert = hasWearOrSafetyAlert(openAlerts);
    const frontAxle: BrakeAxleSummaryDto = {
      condition: canonical.frontAxleCondition,
      dataBasis: canonical.frontDataBasis,
      confidence: canonical.frontConfidence,
      estimatedRemainingKmMin: canonical.estimatedFrontRemainingKmMin,
      estimatedRemainingKmMax: canonical.estimatedFrontRemainingKmMax,
    };
    const rearAxle: BrakeAxleSummaryDto = {
      condition: canonical.rearAxleCondition,
      dataBasis: canonical.rearDataBasis,
      confidence: canonical.rearConfidence,
      estimatedRemainingKmMin: canonical.estimatedRearRemainingKmMin,
      estimatedRemainingKmMax: canonical.estimatedRearRemainingKmMax,
    };

    return {
      isInitialized: input.isInitialized,
      stateClass: input.stateClass,
      message: input.message,
      actions: input.actions,
      limitingComponent: input.limitingComponent ?? null,
      modeledComponents: input.modeledComponents,
      modelCoverage: input.modelCoverage,
      lastChangeAt: input.lastChangeAt,
      lastRecalculatedAt: input.lastRecalculatedAt,
      confidence: input.confidence,
      baselineWarnings: input.baselineWarnings,
      provenanceWarnings: input.provenanceWarnings,
      hasAlert: hasCanonicalAlert,
      legacyHeuristic: input.legacyHeuristic,
      overallCondition: canonical.overallCondition,
      dataBasis: canonical.dataBasis,
      confidenceLevel: canonical.confidenceLevel,
      frontAxle,
      rearAxle,
      frontAxleCondition: canonical.frontAxleCondition,
      rearAxleCondition: canonical.rearAxleCondition,
      frontDataBasis: canonical.frontDataBasis,
      rearDataBasis: canonical.rearDataBasis,
      frontConfidence: canonical.frontConfidence,
      rearConfidence: canonical.rearConfidence,
      estimatedFrontRemainingKmMin: canonical.estimatedFrontRemainingKmMin,
      estimatedFrontRemainingKmMax: canonical.estimatedFrontRemainingKmMax,
      estimatedRearRemainingKmMin: canonical.estimatedRearRemainingKmMin,
      estimatedRearRemainingKmMax: canonical.estimatedRearRemainingKmMax,
      nextInspectionRecommendedInKm: canonical.nextInspectionRecommendedInKm,
      estimatedReplacementDueInKm: canonical.estimatedReplacementDueInKm,
      reasons: canonical.reasons,
      recommendations: canonical.recommendations,
      alerts: openAlerts,
      openAlerts,
      lastMeasurementAt: canonical.lastMeasurementAt,
      lastMeasurementMileageKm: canonical.lastMeasurementMileageKm,
      lastServiceAt: canonical.lastServiceAt,
      lastServiceMileageKm: canonical.lastServiceMileageKm,
      updatedAt: canonical.updatedAt,
      legacy,
      componentThresholds: input.componentThresholds,
      evidencePresentation: buildBrakeEvidencePresentation({
        isInitialized: input.isInitialized,
        stateClass: input.stateClass,
        overallCondition: canonical.overallCondition,
        modeledComponents: input.modeledComponents,
        modelCoverage: input.modelCoverage,
        componentThresholds: input.componentThresholds,
        limitingComponent: input.limitingComponent ?? null,
        openAlerts: openAlerts,
        componentStates: canonical.componentStates,
        dataQualityFlags: canonical.dataQualityFlags,
        safetyFlags: canonical.safetyFlags,
        predictionCapable: canonical.predictionCapable,
        overallRemainingKmMin: canonical.estimatedFrontRemainingKmMin != null &&
          canonical.estimatedRearRemainingKmMin != null
          ? Math.min(canonical.estimatedFrontRemainingKmMin, canonical.estimatedRearRemainingKmMin)
          : canonical.estimatedFrontRemainingKmMin ?? canonical.estimatedRearRemainingKmMin,
        overallRemainingKmMax: canonical.estimatedFrontRemainingKmMax != null &&
          canonical.estimatedRearRemainingKmMax != null
          ? Math.min(canonical.estimatedFrontRemainingKmMax, canonical.estimatedRearRemainingKmMax)
          : canonical.estimatedFrontRemainingKmMax ?? canonical.estimatedRearRemainingKmMax,
        overallRemainingKmPoint: canonical.overallRemainingKmPoint,
        overallConfidence: canonical.confidenceLevel,
        modelCalculatedAt: canonical.updatedAt,
        hasOdometerGap: canonical.hasOdometerGap,
      }),
    };
  }

  /**
   * Build the canonical evidence-based read model on top of the V2 wear state.
   * This is the single honest brake truth every consumer reads. The modeled
   * estimate caps at WARNING; a CRITICAL condition is only produced by a real
   * safety signal (measured/documented critical thickness, brake DTC, fluid
   * critical, confirmed immediate-replacement).
   */
  private async buildCanonicalReadModel(
    vehicleId: string,
    current: BrakeHealthCurrent | null,
    modeledComponents: BrakeModeledComponentsDto,
    options?: {
      modelSnapshotId?: string | null;
      emitNotifications?: boolean;
      syncAlerts?: boolean;
    },
  ): Promise<BrakeCanonicalBuildResult> {
    const c = this.cfg;
    const initialized = !!current?.isInitialized && modeledComponents.hasAnyModeled;
    const wearThresholds = await this.loadWearThresholds(vehicleId, current);

    const anchorDate: Date | null = current?.anchorServiceDate ?? null;
    const anchorMs = anchorDate ? new Date(anchorDate).getTime() : 0;
    const measurementAgeDays = anchorDate
      ? Math.max(0, Math.floor((Date.now() - anchorMs) / 86400000))
      : null;
    const kmSinceAnchor =
      typeof current?.distanceSinceAnchorKm === 'number' ? current.distanceSinceAnchorKm : null;
    const score = typeof current?.confidenceScore === 'number' ? current.confidenceScore : null;

    const lastService = await this.prisma.vehicleServiceEvent.findFirst({
      where: { vehicleId, eventType: 'BRAKE_SERVICE' },
      orderBy: { eventDate: 'desc' },
      select: { eventDate: true, odometerKm: true },
    });

    const evidence = await this.brakeEvidence.listRecent(vehicleId, 40);
    // Ignore evidence captured before the current baseline anchor (a later
    // service may have replaced the worn component).
    const freshEvidence = evidence.filter((e) => {
      if (!isActiveBrakeDtcEvidenceRow(e)) return false;
      const t = e.measuredAt
        ? new Date(e.measuredAt).getTime()
        : new Date(e.createdAt).getTime();
      return t >= anchorMs;
    });

    const latestMeasurementForAxle = (axle: 'FRONT' | 'REAR') =>
      freshEvidence.find(
        (e) =>
          (e.axle === axle || e.axle === 'UNKNOWN') &&
          isMmGroundTruth(e),
      ) ?? null;
    const latestMeasurement =
      freshEvidence.find((e) => isMmGroundTruth(e)) ?? null;

    // ── Safety signals (system-level) ──
    let fluidCondition: BrakeCondition = 'UNKNOWN';
    let discDocCondition: BrakeCondition = 'UNKNOWN';
    let dtcCondition: BrakeCondition = 'UNKNOWN';
    let immediateReplacement = false;
    let dtcCode: string | null = null;
    let dtcCategory: string | null = null;
    let safetyBasis: BrakeDataBasis = 'UNKNOWN';
    for (const e of freshEvidence) {
      let contributes = false;
      if (e.brakeFluidStatus) {
        fluidCondition = aggregateBrakeCondition(fluidCondition, classifyFluidStatus(e.brakeFluidStatus));
        contributes = true;
      }
      if (e.discCondition) {
        discDocCondition = aggregateBrakeCondition(discDocCondition, classifyDiscConditionLabel(e.discCondition));
        contributes = true;
      }
      if (e.dtcSeverity) {
        dtcCondition = aggregateBrakeCondition(dtcCondition, classifyDtcSeverity(e.dtcSeverity));
        dtcCode = e.dtcCode ?? dtcCode;
        dtcCategory = e.dtcCategory ?? dtcCategory;
        contributes = true;
      }
      if (e.immediateReplacement === true) {
        immediateReplacement = true;
        contributes = true;
      }
      if (contributes) safetyBasis = strongerDataBasis(safetyBasis, evidenceSourceToDataBasis(e.source));
    }
    const systemSafety = aggregateBrakeCondition(
      fluidCondition,
      dtcCondition,
      immediateReplacement ? 'CRITICAL' : 'UNKNOWN',
    );

    // ── Per-axle estimated condition from the wear model ──
    const axleMin = (a: number | null | undefined, b: number | null | undefined): number | null => {
      const vals = [a, b].filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
      return vals.length ? Math.min(...vals) : null;
    };
    const frontPadHealth = initialized ? current!.frontPadHealthPct : null;
    const rearPadHealth = initialized ? current!.rearPadHealthPct : null;
    const frontDiscHealth =
      initialized && !wearThresholds.FRONT_DISCS.thresholdMissing
        ? current!.frontDiscHealthPct
        : null;
    const rearDiscHealth =
      initialized && !wearThresholds.REAR_DISCS.thresholdMissing
        ? current!.rearDiscHealthPct
        : null;
    const frontPadRemaining = initialized ? current!.frontPadRemainingKm : null;
    const rearPadRemaining = initialized ? current!.rearPadRemainingKm : null;
    const frontDiscRemaining =
      initialized && !wearThresholds.FRONT_DISCS.thresholdMissing
        ? current!.frontDiscRemainingKm
        : null;
    const rearDiscRemaining =
      initialized && !wearThresholds.REAR_DISCS.thresholdMissing
        ? current!.rearDiscRemainingKm
        : null;

    let frontPadCond: BrakeCondition = initialized
      ? classifyEstimatedCondition(frontPadHealth, frontPadRemaining)
      : 'UNKNOWN';
    let rearPadCond: BrakeCondition = initialized
      ? classifyEstimatedCondition(rearPadHealth, rearPadRemaining)
      : 'UNKNOWN';
    let frontDiscCond: BrakeCondition = initialized
      ? classifyEstimatedCondition(frontDiscHealth, frontDiscRemaining)
      : 'UNKNOWN';
    let rearDiscCond: BrakeCondition = initialized
      ? classifyEstimatedCondition(rearDiscHealth, rearDiscRemaining)
      : 'UNKNOWN';

    const anchorBasis: BrakeDataBasis = initialized
      ? dataBasisFromAnchorValidation(current?.anchorValidationStatus, current?.stateClass)
      : 'UNKNOWN';
    let frontPadBasis: BrakeDataBasis = anchorBasis;
    let rearPadBasis: BrakeDataBasis = anchorBasis;
    let frontDiscBasis: BrakeDataBasis = anchorBasis;
    let rearDiscBasis: BrakeDataBasis = anchorBasis;

    const hasThicknessEvidence = freshEvidence.some((e) => isMmGroundTruth(e));
    if (initialized && this.hasMeasuredAnchorStatus(current) && !hasThicknessEvidence) {
      if (frontPadBasis === 'MEASURED') frontPadBasis = 'ESTIMATED';
      if (rearPadBasis === 'MEASURED') rearPadBasis = 'ESTIMATED';
      if (frontDiscBasis === 'MEASURED') frontDiscBasis = 'ESTIMATED';
      if (rearDiscBasis === 'MEASURED') rearDiscBasis = 'ESTIMATED';
    }

    const frontMeas = latestMeasurementForAxle('FRONT');
    if (frontMeas?.measuredPadMm != null) {
      frontPadCond = aggregateBrakeCondition(
        frontPadCond,
        classifyMeasuredThicknessWithThresholds(frontMeas.measuredPadMm, wearThresholds.FRONT_PADS),
      );
      frontPadBasis = strongerDataBasis(frontPadBasis, evidenceSourceToDataBasis(frontMeas.source));
    }
    if (frontMeas?.measuredDiscMm != null) {
      frontDiscCond = aggregateBrakeCondition(
        frontDiscCond,
        classifyMeasuredThicknessWithThresholds(frontMeas.measuredDiscMm, wearThresholds.FRONT_DISCS),
      );
      frontDiscBasis = strongerDataBasis(frontDiscBasis, evidenceSourceToDataBasis(frontMeas.source));
    }
    const rearMeas = latestMeasurementForAxle('REAR');
    if (rearMeas?.measuredPadMm != null) {
      rearPadCond = aggregateBrakeCondition(
        rearPadCond,
        classifyMeasuredThicknessWithThresholds(rearMeas.measuredPadMm, wearThresholds.REAR_PADS),
      );
      rearPadBasis = strongerDataBasis(rearPadBasis, evidenceSourceToDataBasis(rearMeas.source));
    }
    if (rearMeas?.measuredDiscMm != null) {
      rearDiscCond = aggregateBrakeCondition(
        rearDiscCond,
        classifyMeasuredThicknessWithThresholds(rearMeas.measuredDiscMm, wearThresholds.REAR_DISCS),
      );
      rearDiscBasis = strongerDataBasis(rearDiscBasis, evidenceSourceToDataBasis(rearMeas.source));
    }

    if (initialized && current?.frontPadEstimatedMm != null) {
      frontPadCond = aggregateBrakeCondition(
        frontPadCond,
        classifyMeasuredThicknessWithThresholds(current.frontPadEstimatedMm, wearThresholds.FRONT_PADS),
      );
    }
    if (initialized && current?.rearPadEstimatedMm != null) {
      rearPadCond = aggregateBrakeCondition(
        rearPadCond,
        classifyMeasuredThicknessWithThresholds(current.rearPadEstimatedMm, wearThresholds.REAR_PADS),
      );
    }
    if (initialized && current?.frontDiscEstimatedMm != null && !wearThresholds.FRONT_DISCS.thresholdMissing) {
      frontDiscCond = aggregateBrakeCondition(
        frontDiscCond,
        classifyMeasuredThicknessWithThresholds(current.frontDiscEstimatedMm, wearThresholds.FRONT_DISCS),
      );
    }
    if (initialized && current?.rearDiscEstimatedMm != null && !wearThresholds.REAR_DISCS.thresholdMissing) {
      rearDiscCond = aggregateBrakeCondition(
        rearDiscCond,
        classifyMeasuredThicknessWithThresholds(current.rearDiscEstimatedMm, wearThresholds.REAR_DISCS),
      );
    }

    const frontWearCond = aggregateBrakeCondition(frontPadCond, frontDiscCond);
    const rearWearCond = aggregateBrakeCondition(rearPadCond, rearDiscCond);
    let frontCond = aggregateBrakeCondition(frontWearCond, systemSafety, discDocCondition);
    let rearCond = aggregateBrakeCondition(rearWearCond, systemSafety, discDocCondition);
    const frontBasis = strongerDataBasis(frontPadBasis, frontDiscBasis);
    const rearBasis = strongerDataBasis(rearPadBasis, rearDiscBasis);

    const frontConfidence = classifyConfidenceLevel({
      score,
      dataBasis: frontBasis,
      measurementAgeDays,
      kmSinceMeasurement: kmSinceAnchor,
    });
    const rearConfidence = classifyConfidenceLevel({
      score,
      dataBasis: rearBasis,
      measurementAgeDays,
      kmSinceMeasurement: kmSinceAnchor,
    });
    const overallConfidence = worstConfidence(frontConfidence, rearConfidence);

    const gapSpreadMultiplier = assessBrakeCoverageGap({
      distanceSinceAnchorKm: kmSinceAnchor,
      observedDistanceKm: current?.modeledDistanceKm ?? 0,
      observedTripCount: current?.modeledTripCount ?? 0,
    }).remainingKmSpreadMultiplier;

    const frontRemaining = axleMin(frontPadRemaining, frontDiscRemaining);
    const rearRemaining = axleMin(rearPadRemaining, rearDiscRemaining);
    const frontRange = buildRemainingKmRange(frontRemaining, frontConfidence, gapSpreadMultiplier);
    const rearRange = buildRemainingKmRange(rearRemaining, rearConfidence, gapSpreadMultiplier);

    const overallCondition = aggregateBrakeCondition(frontCond, rearCond);
    const overallBasis = strongerDataBasis(frontBasis, rearBasis);

    const minRemaining = axleMin(frontRemaining, rearRemaining);
    let nextInspectionRecommendedInKm: number | null = null;
    let estimatedReplacementDueInKm: number | null = null;
    if (minRemaining != null) {
      estimatedReplacementDueInKm = Math.round(minRemaining);
      nextInspectionRecommendedInKm = Math.max(
        0,
        Math.min(
          c.inspection.maxIntervalKm,
          Math.round(minRemaining - c.inspection.recommendedHeadroomKm),
        ),
      );
    }

    const inspectionOverdue =
      (kmSinceAnchor != null && kmSinceAnchor >= c.inspection.serviceOverdueKm) ||
      (lastService?.eventDate != null &&
        (Date.now() - new Date(lastService.eventDate).getTime()) / 86400000 >=
          c.inspection.serviceOverdueDays) ||
      (lastService == null &&
        initialized &&
        measurementAgeDays != null &&
        measurementAgeDays >= c.inspection.serviceOverdueDays);

    const underCoverage =
      current?.underCoverageKm ??
      (kmSinceAnchor != null && current?.modeledDistanceKm != null
        ? Math.max(0, kmSinceAnchor - current.modeledDistanceKm)
        : null);
    const overCoverage = current?.overCoverageKm ?? null;
    const coverageGap =
      (underCoverage ?? 0) > 0 ||
      current?.coverageStatus === 'UNKNOWN' ||
      normalizeModelingSource(current?.modelingSource) === 'NOT_ENOUGH_DATA';
    const distanceConflict = (overCoverage ?? 0) > 0;
    const specUnconfirmed = Object.values(wearThresholds).some(
      (threshold) => !threshold.confirmed && !threshold.thresholdMissing,
    );
    const staleEvidence = freshEvidence.some(
      (row) => resolveEffectiveFreshness(row) === 'STALE',
    );
    const wearSensorActive = freshEvidence.some(
      (row) => row.source === 'BRAKE_WEAR_SENSOR' && isActiveEvidence(row),
    );

    const organizationId =
      current?.organizationId ??
      (
        await this.prisma.vehicle.findUnique({
          where: { id: vehicleId },
          select: { organizationId: true },
        })
      )?.organizationId;

    const alertCandidates = organizationId
      ? buildBrakeHealthAlerts({
          organizationId,
          vehicleId,
          modelSnapshotId: options?.modelSnapshotId ?? null,
          initialized,
          stateClass: current?.stateClass,
          frontPadCondition: frontPadCond,
          rearPadCondition: rearPadCond,
          frontDiscCondition: frontDiscCond,
          rearDiscCondition: rearDiscCond,
          frontPadBasis,
          rearPadBasis,
          frontDiscBasis,
          rearDiscBasis,
          minRemainingKm: minRemaining,
          fluidCondition,
          dtcCondition,
          dtcCode,
          dtcCategory,
          immediateReplacement,
          wearSensorActive,
          coverageGap,
          distanceConflict,
          specUnconfirmed,
          staleEvidence,
          overallConfidence,
        })
      : [];

    const openAlerts = candidatesToCanonicalAlerts(alertCandidates);

    if (organizationId && this.brakeHealthAlerts && options?.syncAlerts !== false) {
      await this.brakeHealthAlerts.syncAlerts({
        organizationId,
        vehicleId,
        candidates: alertCandidates,
        inputFingerprint: current?.recalculationInputFingerprint ?? null,
        modelSnapshotId: options?.modelSnapshotId ?? null,
        emitNotifications: options?.emitNotifications !== false,
      });
    }

    const reasons: string[] = [];
    const recommendations: string[] = [];

    if (!initialized) {
      reasons.push('Keine belastbare Bremsen-Baseline (Messung/Service) hinterlegt');
      recommendations.push(
        'Bremsservice mit gemessenen Belag-/Scheibenstärken erfassen oder Werkstattbericht hochladen',
      );
    } else {
      reasons.push(
        overallBasis === 'MEASURED' || overallBasis === 'DOCUMENTED'
          ? 'Basis: gemessene/dokumentierte Bremswerte'
          : 'Basis: Schätzung aus Fahrprofil, Laufleistung und Bremsbias',
      );
      if (minRemaining == null) {
        reasons.push('Restnutzung nicht berechenbar — zu wenig Telemetrie/Modellabdeckung');
      }
    }

    if (overallCondition === 'CRITICAL') {
      recommendations.push('Bremsen umgehend in der Werkstatt prüfen/erneuern lassen');
    } else if (overallCondition === 'WARNING') {
      recommendations.push('Bremsenservice zeitnah einplanen');
    } else if (overallCondition === 'WATCH') {
      recommendations.push('Bremsen beobachten und beim nächsten Service messen lassen');
    }
    if (inspectionOverdue) recommendations.push('Bremsenprüfung nachholen');
    if (initialized && (overallConfidence === 'LOW' || overallConfidence === 'UNKNOWN')) {
      recommendations.push('Gemessene Belag-/Scheibenstärken erfassen, um die Schätzung zu verbessern');
    }

    const anchorValidationStatus = current?.anchorValidationStatus ?? null;
    const anchorOdometerKm = current?.anchorOdometerKm ?? null;
    const anchorIso = anchorDate ? anchorDate.toISOString() : null;

    const latestComponentMeasurement = (
      component: 'pad' | 'disc',
      axle: 'FRONT' | 'REAR',
    ): { at: string | null; mm: number | null; source: string | null; odometer: number | null } => {
      for (const row of freshEvidence) {
        if (row.axle !== axle && row.axle !== 'UNKNOWN') continue;
        const mm =
          component === 'pad' ? row.measuredPadMm : row.measuredDiscMm;
        if (mm == null || !Number.isFinite(mm)) continue;
        return {
          at: row.measuredAt ? new Date(row.measuredAt).toISOString() : null,
          mm,
          source: row.source ?? null,
          odometer: row.mileageAtMeasurementKm ?? null,
        };
      }
      return { at: null, mm: null, source: null, odometer: null };
    };

    const componentRange = (
      remaining: number | null,
      confidence: BrakeConfidenceLevel,
    ) => buildRemainingKmRange(remaining, confidence, gapSpreadMultiplier);

    const makeComponentState = (args: {
      component: BrakeReferenceSpecComponent;
      condition: BrakeCondition;
      basis: BrakeDataBasis;
      confidence: BrakeConfidenceLevel;
      measuredMm: number | null;
      estimatedMm: number | null;
      anchorMm: number | null;
      remainingKm: number | null;
      measurement: ReturnType<typeof latestComponentMeasurement>;
      installAt: string | null;
      sourceCode: string | null;
      evidenceAt: string | null;
      odometerKm: number | null;
      isModeled: boolean;
    }): BrakeComponentBuildState => {
      const range = componentRange(args.remainingKm, args.confidence);
      const evidenceClass = resolveComponentEvidenceClass({
        dataBasis: args.basis,
        anchorValidationStatus,
        measuredMm: args.measuredMm,
        estimatedMm: args.estimatedMm,
        isModeled: args.isModeled,
      });
      return {
        component: args.component,
        condition: args.condition,
        dataBasis: args.basis,
        confidence: args.confidence,
        measuredMm: args.measuredMm,
        estimatedMm: args.estimatedMm,
        anchorMm: args.anchorMm,
        remainingKm: args.remainingKm,
        remainingKmMin: range?.min ?? null,
        remainingKmMax: range?.max ?? null,
        evidenceClass,
        sourceCode: args.sourceCode,
        evidenceAt: args.evidenceAt,
        odometerKm: args.odometerKm,
        lastMeasurementAt: args.measurement.at,
        lastMeasurementMm: args.measurement.mm,
        lastInstallationAt: args.installAt,
      };
    };

    const frontPadMeas = latestComponentMeasurement('pad', 'FRONT');
    const rearPadMeas = latestComponentMeasurement('pad', 'REAR');
    const frontDiscMeas = latestComponentMeasurement('disc', 'FRONT');
    const rearDiscMeas = latestComponentMeasurement('disc', 'REAR');

    const installAtFor = (basis: BrakeDataBasis, modeled: boolean) =>
      modeled && (basis === 'DOCUMENTED' || basis === 'MEASURED') ? anchorIso : null;

    const sourceFor = (
      basis: BrakeDataBasis,
      measurement: ReturnType<typeof latestComponentMeasurement>,
    ): string | null => {
      if (measurement.source) return measurement.source;
      const status = String(anchorValidationStatus ?? '').toLowerCase();
      if (status.includes('spec_fallback')) return 'spec_fallback';
      if (basis === 'DOCUMENTED' || basis === 'MEASURED') return 'anchor_service';
      return null;
    };

    const componentStates: BrakeComponentBuildState[] = [
      makeComponentState({
        component: 'FRONT_PADS',
        condition: frontPadCond,
        basis: frontPadBasis,
        confidence: frontConfidence,
        measuredMm: frontPadMeas.mm,
        estimatedMm: initialized ? current?.frontPadEstimatedMm ?? null : null,
        anchorMm: initialized ? current?.frontPadAnchorMm ?? null : null,
        remainingKm: frontPadRemaining,
        measurement: frontPadMeas,
        installAt: installAtFor(frontPadBasis, modeledComponents.frontPads),
        sourceCode: sourceFor(frontPadBasis, frontPadMeas),
        evidenceAt: frontPadMeas.at ?? anchorIso,
        odometerKm: frontPadMeas.odometer ?? anchorOdometerKm,
        isModeled: modeledComponents.frontPads,
      }),
      makeComponentState({
        component: 'REAR_PADS',
        condition: rearPadCond,
        basis: rearPadBasis,
        confidence: rearConfidence,
        measuredMm: rearPadMeas.mm,
        estimatedMm: initialized ? current?.rearPadEstimatedMm ?? null : null,
        anchorMm: initialized ? current?.rearPadAnchorMm ?? null : null,
        remainingKm: rearPadRemaining,
        measurement: rearPadMeas,
        installAt: installAtFor(rearPadBasis, modeledComponents.rearPads),
        sourceCode: sourceFor(rearPadBasis, rearPadMeas),
        evidenceAt: rearPadMeas.at ?? anchorIso,
        odometerKm: rearPadMeas.odometer ?? anchorOdometerKm,
        isModeled: modeledComponents.rearPads,
      }),
      makeComponentState({
        component: 'FRONT_DISCS',
        condition: frontDiscCond,
        basis: frontDiscBasis,
        confidence: frontConfidence,
        measuredMm: frontDiscMeas.mm,
        estimatedMm: initialized ? current?.frontDiscEstimatedMm ?? null : null,
        anchorMm: initialized ? current?.frontDiscAnchorMm ?? null : null,
        remainingKm: frontDiscRemaining,
        measurement: frontDiscMeas,
        installAt: installAtFor(frontDiscBasis, modeledComponents.frontDiscs),
        sourceCode: sourceFor(frontDiscBasis, frontDiscMeas),
        evidenceAt: frontDiscMeas.at ?? anchorIso,
        odometerKm: frontDiscMeas.odometer ?? anchorOdometerKm,
        isModeled: modeledComponents.frontDiscs,
      }),
      makeComponentState({
        component: 'REAR_DISCS',
        condition: rearDiscCond,
        basis: rearDiscBasis,
        confidence: rearConfidence,
        measuredMm: rearDiscMeas.mm,
        estimatedMm: initialized ? current?.rearDiscEstimatedMm ?? null : null,
        anchorMm: initialized ? current?.rearDiscAnchorMm ?? null : null,
        remainingKm: rearDiscRemaining,
        measurement: rearDiscMeas,
        installAt: installAtFor(rearDiscBasis, modeledComponents.rearDiscs),
        sourceCode: sourceFor(rearDiscBasis, rearDiscMeas),
        evidenceAt: rearDiscMeas.at ?? anchorIso,
        odometerKm: rearDiscMeas.odometer ?? anchorOdometerKm,
        isModeled: modeledComponents.rearDiscs,
      }),
    ];

    const absActive =
      (dtcCategory ?? '').toUpperCase() === 'ABS' && dtcCondition !== 'UNKNOWN';

    return {
      overallCondition,
      dataBasis: overallBasis,
      confidenceLevel: overallConfidence,
      frontAxleCondition: frontCond,
      rearAxleCondition: rearCond,
      frontDataBasis: frontBasis,
      rearDataBasis: rearBasis,
      frontConfidence,
      rearConfidence,
      estimatedFrontRemainingKmMin: frontRange?.min ?? null,
      estimatedFrontRemainingKmMax: frontRange?.max ?? null,
      estimatedRearRemainingKmMin: rearRange?.min ?? null,
      estimatedRearRemainingKmMax: rearRange?.max ?? null,
      nextInspectionRecommendedInKm,
      estimatedReplacementDueInKm,
      reasons,
      recommendations,
      openAlerts,
      lastMeasurementAt: latestMeasurement?.measuredAt
        ? new Date(latestMeasurement.measuredAt).toISOString()
        : null,
      lastMeasurementMileageKm: latestMeasurement?.mileageAtMeasurementKm ?? null,
      lastServiceAt: lastService?.eventDate ? new Date(lastService.eventDate).toISOString() : null,
      lastServiceMileageKm: lastService?.odometerKm ?? null,
      updatedAt: current?.updatedAt ? new Date(current.updatedAt).toISOString() : null,
      componentStates,
      dataQualityFlags: {
        missingBaseline: !initialized,
        specUnconfirmed,
        coverageGap,
        distanceConflict,
        staleEvidence,
      },
      safetyFlags: {
        abs: absActive,
        dtc: dtcCondition !== 'UNKNOWN',
        dtcCode,
        wearSensor: wearSensorActive,
        immediateReplacement,
      },
      predictionCapable:
        initialized &&
        anchorOdometerKm != null &&
        !coverageGap &&
        (current?.modeledTripCount ?? 0) > 0,
      overallRemainingKmPoint: minRemaining != null ? Math.round(minRemaining) : null,
      anchorValidationStatus,
      initialized,
      hasOdometerGap: anchorOdometerKm == null,
    };
  }

  private toAxleEstimate(
    anchor: number | null,
    estimated: number | null,
    health: number | null,
    remaining: number | null,
    wearRate: number | null,
    kFactor: number,
  ): AxleEstimate {
    return {
      anchorMm: anchor,
      estimatedMm: estimated != null ? round2(estimated) : null,
      healthPct: health != null ? round2(health) : null,
      remainingKm: remaining != null ? Math.round(remaining) : null,
      wearRateMmPerKm: wearRate != null ? round2(wearRate * 1000) : null,
      kFactor: round2(kFactor),
    };
  }

  private async computeFactorsForDisplay(
    vehicleId: string,
    impact: VehicleImpactForBrake | null,
  ): Promise<Record<string, number>> {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
      select: { fuelType: true, brakeForceFrontPercent: true },
    });
    const fuelType = vehicle?.fuelType ?? 'GASOLINE';
    return {
      padUsageFactor: this.computePadUsageFactor(impact),
      padStopDensityFactor: lookupSteppedFactor(
        impact?.stopDensity ?? 0,
        this.cfg.padStopDensityAnchors,
      ),
      padHardBrakeFactor: this.resolveHardBrakeWearFactor(impact?.hardBrakePer100Km),
      padFullBrakingFactor: lookupSteppedFactor(
        impact?.fullBrakingPer100Km ?? 0,
        this.cfg.padFullBrakingAnchors,
      ),
      padRekuFactor: this.cfg.padRekuFactors[fuelType] ?? 1.0,
      discUsageFactor: this.computeDiscUsageFactor(impact),
      discHighSpeedFactor: lookupSteppedFactor(
        (impact?.highSpeedBrakeShare ?? 0) * 100,
        this.cfg.discHighSpeedBrakeAnchors,
      ),
      discHardBrakeFactor: this.resolveHardBrakeWearFactor(impact?.hardBrakePer100Km),
      discFullBrakingFactor: lookupSteppedFactor(
        impact?.fullBrakingPer100Km ?? 0,
        this.cfg.discFullBrakingAnchors,
      ),
      discThermalFactor: interpolateThermalFactor(
        impact?.thermalBrakeStressScore ?? 0,
        this.cfg.discThermalAnchors,
      ),
      discRekuFactor: this.cfg.discRekuFactors[fuelType] ?? 1.0,
      brakeBiasFront:
        vehicle?.brakeForceFrontPercent != null
          ? vehicle.brakeForceFrontPercent / 100
          : this.cfg.brakeBias.defaultFront,
    };
  }
}
