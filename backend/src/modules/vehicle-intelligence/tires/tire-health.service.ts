import { BadRequestException, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { TireWearV3CutoverConfig } from '@config/tire-wear-v3-cutover.config';
import { shouldSuppressV2TireWearSnapshotWrites } from '@config/tire-wear-v3-cutover.policy';
import { PrismaService } from '@shared/database/prisma.service';
import { TireWearModelService, WearExplainability } from './tire-wear-model.service';
import { DrivingImpactService } from '../driving-impact/driving-impact.service';
import {
  TIRE_HEALTH_CONFIG,
  isStaggeredSetup,
  parseAiTireSpec,
  resolveArchetype,
  resolveReplacementThreshold,
  resolveReferenceNewTread,
} from './tire-health.config';
import {
  detectAiTireSpecSetupConflicts,
  toTireSetupSpecConsistencyInput,
  type AiTireSpecSetupConflict,
} from './ai-tire-spec-setup-consistency.util';
import {
  TireStatus,
  TireDisplayMode,
  TireConfidenceLevel,
  TireAlertCode,
  classifyTreadStatus,
  classifyRemainingKmStatus,
  classifyUnevenWear,
  classifySeasonStatus,
  classifyConfidenceLevel,
  confidenceLevelToLabel,
  confidenceLevelToScore,
  resolveDisplayMode,
  classifyMeasurementOverdue,
  classifyTireAgeYears,
  dotAgeYears,
  aggregateTireStatus,
} from './tire-status';
import {
  TireHealthStatus,
  TireEventType,
  TireEvidenceSource,
  TireSetupStatus,
  Prisma,
} from '@prisma/client';
import {
  buildSnapshotEvidenceSummary,
  mapTreadSourceToEvidence,
  resolveSummaryProvenanceFlags,
} from './tire-evidence-provenance';
import {
  buildSnapshotProvenance,
} from './tire-provenance.repository';
import { mapLegacyMeasurementSourceToEvidence } from './tire-evidence-source';
import {
  applyAnchorToRemainingKmProjection,
  buildSetupOdometerAnchorFields,
  isPredictionCapable,
  isRuntimeTelemetryAutoAnchorEligible,
  resolveOdometerAnchor,
  toFiniteOdometerKm,
  type VehicleOdometerContext,
} from './tire-odometer-anchor';
import {
  TIRE_WEAR_MODEL_VERSION,
  computeTireWearModelConfigHash,
  buildSnapshotPredictionPayload,
} from './tire-wear-model-version';
import { TirePredictionValidationService } from './tire-prediction-validation.service';
import {
  computeTireRecalculationInputFingerprint,
  resolvePressureFreshnessBucket,
  type TireRecalculationInputContext,
} from './tire-recalculation-fingerprint';
import { resolveCanonicalVehicleTirePressuresBar } from './tire-pressure-canonical.util';
import {
  buildTirePressureContext,
  emptyTirePressureContext,
  extractDimoPerWheelTimestamps,
  extractDimoTpmsWarningFromPayload,
} from './tire-pressure-context.builder';
import type {
  TirePressureContext,
  TirePressureFreshness,
} from './tire-pressure-context.types';
import { resolveRecommendedTirePressure } from './tire-recommended-pressure';
import type { HmTirePressureSignals } from '../../high-mobility/high-mobility-signal-usage.service';
import {
  buildTireHealthAlerts,
  resolveKmSinceLastRotation,
  structuredAlertsToApiAlerts,
} from './tire-health-alert.builder';
import { TireHealthAlertService } from './tire-health-alert.service';
import type { TireHealthAlertReasonCode } from './tire-health-alert.types';
import {
  buildTireDimoContext,
  resolveCapabilityGatedTpmsWarning,
} from './tire-dimo-context.builder';
import type { TireDimoContext } from './tire-dimo-context.types';
import {
  buildTireEvidencePresentation,
  type TireEvidencePresentation,
  type TireHealthSummaryForPresentation,
} from './tire-health-presentation';
import { TireHealthObservabilityService } from './tire-health-observability.service';
import { TireHealthV3ReadService } from './tire-health-v3-read.service';

// ── Public interfaces ─────────────────────────────────────────────────────────

interface PerWheelEstimate {
  position: string;
  treadMm: number;
  wearPercent: number;
  remainingKm: number;
  healthStatus: string;
  initialTreadMm: number;
  lastMeasuredMm: number | null;
  lastMeasuredAt: string | null;
  confidenceScore: number;
  confidenceLabel: string;
  brand: string | null;
  tireModel: string | null;
  size: string | null;
  totalKm: number;
  cityKm: number;
  highwayKm: number;
  ruralKm: number;
}

export type TireActionState =
  | 'OBSERVE'
  | 'CHECK_SOON'
  | 'PLAN_SERVICE'
  | 'REPLACE';

export type PressureFreshness = TirePressureFreshness;
export type { TirePressureContext } from './tire-pressure-context.types';

export interface TireReadContext {
  hmTirePressure?: HmTirePressureSignals | null;
}

export interface TireHealthSummary {
  overallPercent: number;
  overallRemainingKm: number;
  healthStatus: string;
  confidenceScore: number;
  confidenceLabel: string;
  worstTirePosition: string | null;
  worstTirePercent: number | null;
  activeSetupName: string | null;
  activeSetupId: string | null;
  tireSeason: string | null;
  installedAt: string | null;
  totalKmOnSet: number;
  wearRateMmPer1000km: number | null;
  alerts: TireAlert[];
  tireCondition: string;
  tireArchetype: string | null;
  tireSpecMatched: boolean;
  tireSpecConfidence: number | null;
  dataCompletenessConfidence: number | null;
  modelConfidence: number | null;
  referenceNewTreadSource: string | null;
  replacementThresholdSource: string | null;
  currentTreadSource: string | null;
  currentTreadValue: number | null;
  currentTreadEvidenceSource: TireEvidenceSource | null;
  isMeasured: boolean;
  isEstimated: boolean;
  isDefaultAssumption: boolean;
  lastActualMeasurementAt: string | null;
  baselineSource: TireEvidenceSource | null;
  operationalReplacementMm: number | null;
  topWearDrivers: string[];
  actionState: TireActionState;
  actionReasons: string[];
  measurementState: 'measured' | 'estimated' | 'mixed';
  dataQualityWarnings: string[];
  pressureContext: TirePressureContext;
  recommendedPressure: import('./tire-recommended-pressure').RecommendedTirePressureSpec;
  pressureSpecMissingLabel: string | null;
  latestMeasurementAt: string | null;

  // ── Canonical read model (single honest tire truth) ────────────────────────
  // These are the fields every consumer (Vehicle Detail Quick Box, Fleet
  // Condition, VehicleHealthStatus, alert detector) should read. They make the
  // measured-vs-estimated distinction explicit and never imply fake precision.
  overallStatus: TireStatus;
  displayMode: TireDisplayMode;
  confidence: TireConfidenceLevel;
  lowestTreadMm: number | null;
  lowestTreadPosition: string | null;
  measuredTreadMm: number | null;
  estimatedTreadMm: number | null;
  displayTreadMm: number | null;
  lastMeasurementAt: string | null;
  measurementAgeDays: number | null;
  estimatedRemainingKm: number | null;
  pressureStatus: TireStatus;
  seasonStatus: TireStatus;
  unevenWearStatus: TireStatus;
  recommendations: string[];

  /** Whether the active setup has a traceable odometer anchor for km projection. */
  predictionCapable: boolean;
  odometerAnchorStatus: string | null;
  odometerAnchorConfidence: number | null;
  installedOdometerSource: string | null;

  /** Whether the vehicle has an ACTIVE tire setup (canonical data-quality flag). */
  hasActiveSet: boolean;
  /** Whether the vehicle has any tire setup records (active or stored). */
  hasSetups: boolean;
  /** Whether tread measurements exist for this vehicle. */
  hasMeasurements: boolean;

  /** UI-ready honest evidence presentation — single source for all consumers. */
  evidencePresentation: TireEvidencePresentation;

  /** Capability-gated DIMO context signals (ambient, odometer plausibility, TPMS). */
  dimoContext: TireDimoContext;

  /** Which wear read model backs customer-facing fields when authoritative cutover is on. */
  wearReadModel?: 'v2' | 'v3';
  /** Versioned V3 customer read model (interval mm, verification, evidence classes). */
  wearV3?: import('./tire-health-v3-read.types').TireHealthV3CustomerReadModel;
}

export interface TireHealthDetail {
  summary: TireHealthSummary;
  wearV3?: import('./tire-health-v3-read.types').TireHealthV3CustomerReadModel;
  wheels: PerWheelEstimate[];
  usageSplit: { city: number; highway: number; rural: number };
  factors: Record<string, any>;
  explainability: WearExplainability | null;
  effectiveWearRate: { front: number; rear: number };
  rotationHistory: RotationHistoryEntry[];
  measurements: MeasurementEntry[];
  alerts: TireAlert[];
  setupSpecConflicts?: AiTireSpecSetupConflict[];
}

export interface TireAlert {
  type: string;
  /** Canonical, stable alert code consumers can switch on (see tire-status.ts). */
  code?: TireAlertCode;
  severity: 'info' | 'warning' | 'critical';
  message: string;
  position?: string;
  value?: number;
  /** Structured reason code — replaces free-text business logic. */
  reasonCode?: TireHealthAlertReasonCode;
  displayMode?: TireDisplayMode;
  dedupeKey?: string;
}

export interface RotationHistoryEntry {
  id: string;
  date: string;
  odometerKm: number | null;
  changeType: string;
  rotationTemplate: string | null;
  notes: string | null;
  createdBy: string | null;
  moves: { tireId?: string; from: string | null; to: string }[];
}

export interface MeasurementEntry {
  id: string;
  date: string;
  odometerKm: number | null;
  source: string;
  workshopName: string | null;
  values: { position: string; mm: number }[];
}

export interface ConfidenceDimensions {
  score: number;
  label: string;
  tireSpecConfidence: number;
  dataCompletenessConfidence: number;
  modelConfidence: number;
}

export interface TireRecalculateOptions {
  /** Bypass fingerprint dedupe (authorized manual refresh only). */
  force?: boolean;
  /** Required when `force` is true — recorded in the audit event. */
  reason?: string;
  /** Actor id for force-recalculation audit trail. */
  actorId?: string | null;
}

export interface TireRecalculationResult {
  overallPercent: number;
  remainingKm: number | null;
  healthStatus: string;
  confidence: ConfidenceDimensions;
  skipped?: boolean;
  skipReason?: 'identical_input_fingerprint';
  snapshotId?: string | null;
  forced?: boolean;
  inputFingerprint?: string;
  timePolicyBucket?: string;
}

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable()
export class TireHealthService {
  private readonly logger = new Logger(TireHealthService.name);
  private readonly cfg = TIRE_HEALTH_CONFIG;
  private readonly modelVersion = TIRE_WEAR_MODEL_VERSION;
  private readonly modelConfigHash = computeTireWearModelConfigHash();

  constructor(
    private readonly prisma: PrismaService,
    private readonly wearModel: TireWearModelService,
    private readonly drivingImpactService: DrivingImpactService,
    private readonly predictionValidation: TirePredictionValidationService,
    private readonly tireHealthAlertService: TireHealthAlertService,
    @Optional() private readonly observability?: TireHealthObservabilityService,
    @Optional() private readonly tireHealthV3Read?: TireHealthV3ReadService,
    @Optional() private readonly config?: ConfigService,
  ) {}

  private tireWearV3CutoverFlags(): TireWearV3CutoverConfig {
    return (
      this.config?.get<TireWearV3CutoverConfig>('tireWearV3Cutover') ?? {
        customerReadEnabled: false,
        customerReadAuthoritative: false,
      }
    );
  }

  private shouldSuppressV2WearSnapshotWrites(): boolean {
    return shouldSuppressV2TireWearSnapshotWrites(this.tireWearV3CutoverFlags());
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  GET SUMMARY (Quick Box DTO)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Tire inventory / measurement flags for consumers that need data-quality
   * context when {@link getSummary} returns null (no active set).
   */
  async getTireDataQuality(vehicleId: string): Promise<
    Pick<TireHealthSummary, 'hasActiveSet' | 'hasSetups' | 'hasMeasurements'>
  > {
    const setup = await this.getActiveSetup(vehicleId);
    return this.resolveInventoryFlags(vehicleId, setup);
  }

  async getSummary(
    vehicleId: string,
    readContext: TireReadContext = {},
  ): Promise<TireHealthSummary | null> {
    const setup = await this.getActiveSetup(vehicleId);
    if (!setup) return null;

    const inventoryFlags = await this.resolveInventoryFlags(vehicleId, setup);
    const dimoContext = await this.resolveDimoTireContext(vehicleId);
    const pressureContext = await this.resolvePressureContext(
      vehicleId,
      readContext.hmTirePressure ?? null,
      setup,
      dimoContext,
    );
    const wearAnalysis = await this.wearModel.computeWearAnalysis(vehicleId, {
      pressureContext,
      dimoContext,
    });
    if (!wearAnalysis) return this.buildEmptySummary(setup, pressureContext, inventoryFlags, dimoContext);

    const baseConfidence = await this.computeConfidence(vehicleId, setup);
    const confidence = this.applyPressureConfidenceOverlay(
      baseConfidence,
      pressureContext,
    );
    const alerts = await this.buildAlertsForSetup(
      setup.organizationId ?? (await this.resolveOrganizationId(vehicleId)),
      vehicleId,
      setup,
      wearAnalysis,
      this.resolveUnifiedConfidence(
        setup,
        this.resolveMeasurementState(wearAnalysis.explainability.currentTreadSource),
      ).score,
      pressureContext,
      dimoContext,
    );

    const summary = this.buildSummaryPayload(
      setup,
      wearAnalysis,
      confidence,
      alerts,
      pressureContext,
      inventoryFlags,
      dimoContext,
    );
    return this.enrichSummaryWithV3IfEnabled(summary, setup);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  GET DETAIL (Modal DTO)
  // ═══════════════════════════════════════════════════════════════════════════

  async getDetail(
    vehicleId: string,
    readContext: TireReadContext = {},
  ): Promise<TireHealthDetail | null> {
    const setup = await this.getActiveSetup(vehicleId);
    if (!setup) return null;

    const dimoContext = await this.resolveDimoTireContext(vehicleId);
    const pressureContext = await this.resolvePressureContext(
      vehicleId,
      readContext.hmTirePressure ?? null,
      setup,
      dimoContext,
    );
    const wearAnalysis = await this.wearModel.computeWearAnalysis(vehicleId, {
      pressureContext,
      dimoContext,
    });
    const baseConfidence = await this.computeConfidence(vehicleId, setup);
    const confidence = this.applyPressureConfidenceOverlay(
      baseConfidence,
      pressureContext,
    );
    const alerts = wearAnalysis
      ? await this.buildAlertsForSetup(
          setup.organizationId ?? (await this.resolveOrganizationId(vehicleId)),
          vehicleId,
          setup,
          wearAnalysis,
          this.resolveUnifiedConfidence(
            setup,
            this.resolveMeasurementState(wearAnalysis.explainability.currentTreadSource),
          ).score,
          pressureContext,
          dimoContext,
        )
      : [];

    const wheels = this.buildWheelEstimates(setup, wearAnalysis, confidence);
    const usageSplit = this.computeUsageSplit(setup);
    const rotationHistory = await this.getRotationHistory(vehicleId);
    const measurements = await this.getMeasurements(vehicleId, setup.id);
    const inventoryFlags = await this.resolveInventoryFlags(vehicleId, setup);

    const summary = wearAnalysis
      ? this.buildSummaryPayload(
          setup,
          wearAnalysis,
          confidence,
          alerts,
          pressureContext,
          inventoryFlags,
          dimoContext,
        )
      : this.buildEmptySummary(setup, pressureContext, inventoryFlags, dimoContext);

    if (wheels.length > 0) {
      summary.evidencePresentation = buildTireEvidencePresentation({
        summary,
        wheels,
        modelCalculatedAt: setup.lastRecalculatedAt?.toISOString() ?? null,
      });
    }

    const detail: TireHealthDetail = {
      summary,
      wheels,
      usageSplit,
      factors: wearAnalysis?.factors ?? {},
      explainability: wearAnalysis?.explainability ?? null,
      effectiveWearRate: {
        front: wearAnalysis?.effectiveWearRateKmPerMm.front ?? 0,
        rear: wearAnalysis?.effectiveWearRateKmPerMm.rear ?? 0,
      },
      rotationHistory,
      measurements,
      alerts,
    };

    const parsedSpec = parseAiTireSpec(setup.aiTireSpec);
    const setupSpecConflicts = detectAiTireSpecSetupConflicts(
      toTireSetupSpecConsistencyInput(setup),
      parsedSpec,
    );
    if (setupSpecConflicts.length > 0) {
      detail.setupSpecConflicts = setupSpecConflicts;
    }

    if (!this.tireHealthV3Read?.isCustomerReadEnabled()) {
      return detail;
    }
    return this.tireHealthV3Read.enrichDetail(detail, setup.id, setup.tireSeason);
  }

  private async enrichSummaryWithV3IfEnabled(
    summary: TireHealthSummary,
    setup: { id: string; tireSeason: string | null },
  ): Promise<TireHealthSummary> {
    if (!this.tireHealthV3Read?.isCustomerReadEnabled()) {
      return summary;
    }
    const wheels = summary.evidencePresentation?.treadLines?.map((line) => ({
      position: line.position,
      treadMm: line.valueMm ?? 0,
      lastMeasuredMm: line.valueMm,
      lastMeasuredAt: line.measuredAt,
    })) ?? [];
    return this.tireHealthV3Read.enrichSummary(
      summary,
      setup.id,
      setup.tireSeason,
      wheels,
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  RECALCULATE
  // ═══════════════════════════════════════════════════════════════════════════

  async recalculate(
    vehicleId: string,
    options: TireRecalculateOptions = {},
  ): Promise<TireRecalculationResult | null> {
    if (options.force && !options.reason?.trim()) {
      throw new BadRequestException(
        'Force tire recalculation requires a non-empty reason.',
      );
    }

    let setup = await this.getActiveSetup(vehicleId);
    if (!setup) return null;

    setup = await this.ensureTelemetryOdometerAnchor(vehicleId, setup);

    const recalcAsOf = new Date();
    const inputContext = await this.loadRecalculationInputContext(
      vehicleId,
      setup,
      recalcAsOf,
    );
    const fingerprint = computeTireRecalculationInputFingerprint(inputContext, {
      modelVersion: this.modelVersion,
      modelConfigHash: this.modelConfigHash,
      asOf: recalcAsOf,
    });

    const lastSnapshot = await this.prisma.tireHealthSnapshot.findFirst({
      where: {
        tireSetId: setup.id,
        modelVersion: fingerprint.modelVersion,
        inputFingerprint: fingerprint.inputFingerprint,
      },
      orderBy: { snapshotDate: 'desc' },
      select: { id: true },
    });

    if (!options.force && lastSnapshot) {
      await this.prisma.vehicleTireSetup.update({
        where: { id: setup.id },
        data: { lastRecalculatedAt: recalcAsOf },
      });
      this.logger.debug(
        `Skipping tire recalculation for vehicle=${vehicleId} setup=${setup.id} — identical input fingerprint`,
      );
      this.observability?.recordRecalculation({
        result: 'deduplicated',
        skipReason: 'identical_input_fingerprint',
      });
      return {
        overallPercent: setup.overallHealthPercent ?? 0,
        remainingKm: setup.overallRemainingKm ?? null,
        healthStatus: setup.healthStatus,
        confidence: {
          score: setup.confidenceScore ?? 0,
          label: setup.confidenceLabel ?? 'Low',
          tireSpecConfidence: setup.tireSpecConfidence ?? 0,
          dataCompletenessConfidence: setup.dataCompletenessConfidence ?? 0,
          modelConfidence: setup.modelConfidence ?? 0,
        },
        skipped: true,
        skipReason: 'identical_input_fingerprint',
        snapshotId: lastSnapshot.id,
        inputFingerprint: fingerprint.inputFingerprint,
        timePolicyBucket: fingerprint.timePolicyBucket,
      };
    }

    const dimoContext = await this.resolveDimoTireContext(vehicleId, recalcAsOf);
    this.observeDimoOdometerAnchor(dimoContext);
    const pressureContextForWear = await this.resolvePressureContext(
      vehicleId,
      null,
      setup,
      dimoContext,
    );
    this.observability?.recordPressureContext(pressureContextForWear);
    this.observePressureInvalidWheels(pressureContextForWear);
    const recalcStartedAt = Date.now();
    const wearAnalysis = await this.wearModel.computeWearAnalysis(vehicleId, {
      pressureContext: pressureContextForWear,
      dimoContext,
    });
    if (!wearAnalysis) {
      this.observability?.recordRecalculation({
        result: 'skipped',
        durationMs: Date.now() - recalcStartedAt,
        skipReason: 'no_wear_analysis',
      });
      return null;
    }

    if (setup.initialTreadEvidenceSource === TireEvidenceSource.DEFAULT_ASSUMPTION) {
      this.observability?.recordDefaultBaseline('8mm_default_setup');
    }

    const confidence = await this.computeConfidence(vehicleId, setup);
    const wheels = [
      { pos: 'FL', mm: wearAnalysis.frontLeftMm },
      { pos: 'FR', mm: wearAnalysis.frontRightMm },
      { pos: 'RL', mm: wearAnalysis.rearLeftMm },
      { pos: 'RR', mm: wearAnalysis.rearRightMm },
    ];
    const lowestTread = Math.min(...wheels.map(w => w.mm));

    const wheelPercents = wheels.map(w => {
      const isFront = w.pos.startsWith('F');
      return this.computeWheelPercentV2(
        w.mm,
        isFront ? wearAnalysis.referenceNewTreadFront : wearAnalysis.referenceNewTreadRear,
        wearAnalysis.operationalReplacementMm,
      );
    });
    const minPercent = Math.min(...wheelPercents);
    const avgPercent = wheelPercents.reduce((s, v) => s + v, 0) / wheelPercents.length;
    const setLevelPercent = Math.round(
      Math.max(0, Math.min(100,
        this.cfg.setLevelHealth.minWeight * minPercent +
        this.cfg.setLevelHealth.avgWeight * avgPercent,
      )),
    );

    const effectiveRate = Math.max(wearAnalysis.effectiveWearRateKmPerMm.front, wearAnalysis.effectiveWearRateKmPerMm.rear, 1);
    const wearRateMmPer1000km = effectiveRate > 0 ? Math.round(1000 / effectiveRate * 100) / 100 : null;

    const healthStatus = this.classifyHealthStatus(setLevelPercent, lowestTread, setup.tireSeason);

    const measurementState = this.resolveMeasurementState(
      wearAnalysis.explainability.currentTreadSource,
    );
    const unified = this.resolveUnifiedConfidence(setup, measurementState);
    const confDiscount =
      this.cfg.remainingKmConfidenceDiscount[unified.label.toLowerCase()] ?? 0.85;
    const rawAdjustedRemainingKm = Math.round(wearAnalysis.estimatedRemainingKm * confDiscount);
    const anchorProjection = applyAnchorToRemainingKmProjection({
      anchorStatus: setup.odometerAnchorStatus,
      adjustedRemainingKm: rawAdjustedRemainingKm,
      confidenceScore: unified.score,
    });
    const adjustedRemainingKm = anchorProjection.adjustedRemainingKm;
    const unifiedScore = anchorProjection.confidenceScore;

    await this.prisma.vehicleTireSetup.update({
      where: { id: setup.id },
      data: {
        overallHealthPercent: setLevelPercent,
        overallRemainingKm: adjustedRemainingKm ?? 0,
        healthStatus,
        confidenceScore: unifiedScore,
        confidenceLabel: unified.label,
        tireSpecConfidence: confidence.tireSpecConfidence,
        dataCompletenessConfidence: confidence.dataCompletenessConfidence,
        modelConfidence: confidence.modelConfidence,
        referenceNewTreadMm: wearAnalysis.referenceNewTreadFront,
        operationalReplacementMm: wearAnalysis.operationalReplacementMm,
        referenceNewTreadSource: wearAnalysis.explainability.referenceNewTreadSource,
        replacementThresholdSource: wearAnalysis.explainability.replacementThresholdSource,
        initialTreadSource: wearAnalysis.explainability.currentTreadSource,
        lastRecalculatedAt: new Date(),
        wearRateMmPer1000km,
      },
    });

    const vehicle = await this.prisma.vehicle.findUnique({ where: { id: vehicleId }, select: { organizationId: true } });
    const latestState = await this.prisma.vehicleLatestState.findUnique({
      where: { vehicleId },
      select: { odometerKm: true },
    });

    const latestMeas = setup.measurements?.[0] ?? null;
    const evidenceSummary = buildSnapshotEvidenceSummary({
      currentTreadMm: lowestTread,
      treadSource: wearAnalysis.explainability.currentTreadSource,
      baselineSource: setup.initialTreadEvidenceSource ?? null,
      lastMeasurementAt: latestMeas?.measuredAt ?? null,
      measurementEvidenceSource:
        latestMeas?.evidenceSource ??
        mapLegacyMeasurementSourceToEvidence(latestMeas?.source) ??
        null,
    });

    const predictionPayload = buildSnapshotPredictionPayload({
      modelVersion: fingerprint.modelVersion,
      modelConfigHash: fingerprint.modelConfigHash,
      predictionGeneratedAt: recalcAsOf,
      frontLeftMm: wearAnalysis.frontLeftMm,
      frontRightMm: wearAnalysis.frontRightMm,
      rearLeftMm: wearAnalysis.rearLeftMm,
      rearRightMm: wearAnalysis.rearRightMm,
    });

    const snapshotProvenance = buildSnapshotProvenance({
      modelVersion: fingerprint.modelVersion,
      modelConfigHash: fingerprint.modelConfigHash,
      inputFingerprint: fingerprint.inputFingerprint,
      baselineSource: evidenceSummary.baselineSource,
      evidenceSummary: {
        ...evidenceSummary,
        ...predictionPayload,
        timePolicyBucket: fingerprint.timePolicyBucket,
      },
    });

    const snapshotData = {
      organizationId: vehicle!.organizationId,
      vehicleId,
      tireSetId: setup.id,
      snapshotDate: recalcAsOf,
      predictionGeneratedAt: recalcAsOf,
      odometerKm: latestState?.odometerKm ?? null,
      estimatedTreadMm: lowestTread,
      estimatedWearPercent: 100 - setLevelPercent,
      estimatedRemainingKm: adjustedRemainingKm,
      citySharePercent: setup.totalKmOnSet > 0 ? Math.round(setup.cityKm / setup.totalKmOnSet * 100) : null,
      highwaySharePercent: setup.totalKmOnSet > 0 ? Math.round(setup.highwayKm / setup.totalKmOnSet * 100) : null,
      ruralSharePercent: setup.totalKmOnSet > 0 ? Math.round(setup.ruralKm / setup.totalKmOnSet * 100) : null,
      confidenceScore: unified.score,
      wearRateMmPer1000km,
      modelVersion: snapshotProvenance.modelVersion ?? undefined,
      modelConfigHash: snapshotProvenance.modelConfigHash ?? undefined,
      inputFingerprint: snapshotProvenance.inputFingerprint ?? undefined,
      baselineSource: snapshotProvenance.baselineSource ?? undefined,
      evidenceSummary: (snapshotProvenance.evidenceSummary ?? undefined) as Prisma.InputJsonValue | undefined,
    };

    let snapshot: { id: string } | null = null;
    if (this.shouldSuppressV2WearSnapshotWrites()) {
      snapshot = lastSnapshot;
      this.logger.debug(
        `Skipping V2 tireHealthSnapshot create for vehicle=${vehicleId} setup=${setup.id} — V3 authoritative cutover active`,
      );
      this.observability?.recordRecalculation({
        result: 'skipped',
        skipReason: 'v3_authoritative_v2_snapshot_suppressed',
      });
    } else if (lastSnapshot && options.force) {
      // Snapshots are immutable historical records — force refresh never rewrites them.
      snapshot = lastSnapshot;
    } else {
      try {
        snapshot = await this.prisma.tireHealthSnapshot.create({
          data: snapshotData,
          select: { id: true },
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          const existing = await this.prisma.tireHealthSnapshot.findFirst({
            where: {
              tireSetId: setup.id,
              modelVersion: fingerprint.modelVersion,
              inputFingerprint: fingerprint.inputFingerprint,
            },
            orderBy: { snapshotDate: 'desc' },
            select: { id: true },
          });
          if (!existing) throw error;
          snapshot = existing;
        } else {
          throw error;
        }
      }
    }

    // ── Validation data points: link measurements to pre-measurement snapshots only ──
    const allowWearDataPoints = !options.force;
    if (allowWearDataPoints) {
      const regenFactor =
        (wearAnalysis.factors.regenBrakingFactorFront +
          wearAnalysis.factors.regenBrakingFactorRear) /
        2;
      await this.predictionValidation.linkPendingValidationDataPoints({
        organizationId: vehicle!.organizationId,
        vehicleId,
        tireSetupId: setup.id,
        tireSeason: setup.tireSeason,
        installedOdometerKm: setup.installedOdometerKm,
        currentOdometerKm: latestState?.odometerKm ?? null,
        referenceNewTreadFront: wearAnalysis.referenceNewTreadFront,
        referenceNewTreadRear: wearAnalysis.referenceNewTreadRear,
        frontTireWidthMm: setup.frontTireWidthMm ?? null,
        rearTireWidthMm: setup.rearTireWidthMm ?? null,
        climateFactor: wearAnalysis.factors.temperatureFactor,
        usageFactor: wearAnalysis.factors.usageFactor,
        behaviorFactor: wearAnalysis.factors.behaviorFactor,
        regenFactor,
        asOf: recalcAsOf,
      });
    }

    await this.prisma.tireEvent.create({
      data: {
        organizationId: vehicle!.organizationId,
        vehicleId,
        tireSetId: setup.id,
        type: TireEventType.RECALCULATION,
        createdBy: options.actorId ?? undefined,
        payload: {
          overallPercent: setLevelPercent,
          remainingKm: adjustedRemainingKm,
          confidence: confidence.score,
          healthStatus,
          inputFingerprint: fingerprint.inputFingerprint,
          timePolicyBucket: fingerprint.timePolicyBucket,
          modelVersion: fingerprint.modelVersion,
          forced: options.force ?? false,
          forceReason: options.force ? options.reason?.trim() ?? null : null,
          skippedWearDataPoints: options.force ?? false,
        },
      },
    });

    const pressureContext = await this.resolvePressureContext(
      vehicleId,
      null,
      setup,
      dimoContext,
    );
    const alertCandidates = await this.buildAlertCandidates(
      vehicle!.organizationId,
      vehicleId,
      setup,
      wearAnalysis,
      unifiedScore,
      pressureContext,
      dimoContext,
    );
    await this.tireHealthAlertService.syncAlerts({
      organizationId: vehicle!.organizationId,
      vehicleId,
      tireSetupId: setup.id,
      candidates: alertCandidates,
      inputFingerprint: fingerprint.inputFingerprint,
    });

    if (snapshot) {
      this.observability?.recordSnapshotCreated('created');
    }
    this.observability?.recordRecalculation({
      result: 'success',
      durationMs: Date.now() - recalcStartedAt,
    });

    return {
      overallPercent: setLevelPercent,
      remainingKm: adjustedRemainingKm,
      healthStatus,
      confidence,
      snapshotId: snapshot?.id ?? null,
      forced: options.force ?? false,
      inputFingerprint: fingerprint.inputFingerprint,
      timePolicyBucket: fingerprint.timePolicyBucket,
    };
  }

  private async loadRecalculationInputContext(
    vehicleId: string,
    setup: NonNullable<Awaited<ReturnType<TireHealthService['getActiveSetup']>>>,
    asOf: Date,
  ): Promise<TireRecalculationInputContext> {
    const ninetyDaysAgo = new Date(asOf.getTime() - 90 * 24 * 60 * 60 * 1000);

    const [
      vehicle,
      latestState,
      tires,
      measurements,
      regressionPoints,
      temperatureTrips,
      drivingImpact,
    ] = await Promise.all([
      this.prisma.vehicle.findUnique({
        where: { id: vehicleId },
        select: {
          fuelType: true,
          driveType: true,
          curbWeightKg: true,
          frontWeightDistributionPct: true,
        },
      }),
      this.prisma.vehicleLatestState.findUnique({
        where: { vehicleId },
        select: {
          odometerKm: true,
          tirePressureFl: true,
          tirePressureFr: true,
          tirePressureRl: true,
          tirePressureRr: true,
          speedKmh: true,
          providerSource: true,
          sourceTimestamp: true,
          providerFetchedAt: true,
          lastSeenAt: true,
        },
      }),
      this.prisma.tire.findMany({
        where: { tireSetId: setup.id, vehicleId },
        select: {
          id: true,
          currentPosition: true,
          dotCode: true,
          initialTreadDepthMm: true,
          estimatedTreadMm: true,
          initialTreadEvidenceSource: true,
        },
      }),
      this.prisma.vehicleTireTreadMeasurement.findMany({
        where: { vehicleId, tireSetupId: setup.id },
        orderBy: { measuredAt: 'desc' },
        take: 10,
        select: {
          id: true,
          createdAt: true,
          measuredAt: true,
          source: true,
          evidenceSource: true,
          odometerAtMeasurement: true,
          frontLeftMm: true,
          frontRightMm: true,
          rearLeftMm: true,
          rearRightMm: true,
        },
      }),
      this.prisma.tireWearDataPoint.findMany({
        where: { vehicleId, tireSetId: setup.id },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          axle: true,
          distanceKm: true,
          actualTreadMm: true,
          predictedTreadMm: true,
          actualMeasurementId: true,
        },
      }),
      this.prisma.vehicleTrip.findMany({
        where: { vehicleId, startTime: { gte: ninetyDaysAgo } },
        select: { distanceKm: true, outsideTemperatureStartC: true },
        take: 200,
      }),
      this.drivingImpactService.getVehicleImpactForTire(vehicleId),
    ]);

    const canonicalPressures = resolveCanonicalVehicleTirePressuresBar({
      providerSource: latestState?.providerSource,
      tirePressureFl: latestState?.tirePressureFl,
      tirePressureFr: latestState?.tirePressureFr,
      tirePressureRl: latestState?.tirePressureRl,
      tirePressureRr: latestState?.tirePressureRr,
      sourceTimestamp:
        latestState?.sourceTimestamp ??
        latestState?.providerFetchedAt ??
        latestState?.lastSeenAt ??
        null,
    });

    const pressureValues = [
      canonicalPressures.tirePressureFl,
      canonicalPressures.tirePressureFr,
      canonicalPressures.tirePressureRl,
      canonicalPressures.tirePressureRr,
    ].filter((v): v is number => v != null);

    return {
      setupId: setup.id,
      setupUpdatedAt: setup.updatedAt.toISOString(),
      vehicle: {
        fuelType: vehicle?.fuelType ?? null,
        driveType: vehicle?.driveType ?? null,
        curbWeightKg: vehicle?.curbWeightKg ?? null,
        frontWeightDistributionPct: vehicle?.frontWeightDistributionPct ?? null,
      },
      setup: {
        tireSeason: setup.tireSeason,
        tireCondition: setup.tireCondition ?? null,
        isStaggered: setup.isStaggered,
        frontDimension: setup.frontDimension ?? null,
        rearDimension: setup.rearDimension ?? null,
        brandModelFront: setup.brandModelFront ?? null,
        brandModelRear: setup.brandModelRear ?? null,
        initialTreadDepthMm: setup.initialTreadDepthMm,
        initialTreadFrontMm: setup.initialTreadFrontMm,
        initialTreadRearMm: setup.initialTreadRearMm,
        initialTreadEvidenceSource: setup.initialTreadEvidenceSource ?? null,
        baselineStatus: setup.baselineStatus ?? null,
        baselineConfidence: setup.baselineConfidence ?? null,
        referenceNewTreadMm: setup.referenceNewTreadMm,
        operationalReplacementMm: setup.operationalReplacementMm,
        expectedLifeKm: setup.expectedLifeKm,
        expectedLifeKmFront: setup.expectedLifeKmFront,
        expectedLifeKmRear: setup.expectedLifeKmRear,
        frontTireWidthMm: setup.frontTireWidthMm,
        rearTireWidthMm: setup.rearTireWidthMm,
        dotCodeFront: setup.dotCodeFront ?? null,
        dotCodeRear: setup.dotCodeRear ?? null,
        installedOdometerKm: setup.installedOdometerKm,
        odometerAnchorStatus: setup.odometerAnchorStatus ?? null,
        kFactorFront: setup.kFactorFront,
        kFactorRear: setup.kFactorRear,
        kFactorCalibrationCount: setup.kFactorCalibrationCount,
        regenBrakingFactorFront: setup.regenBrakingFactorFront,
        regenBrakingFactorRear: setup.regenBrakingFactorRear,
        aiTireSpec: setup.aiTireSpec,
      },
      ledgerAggregate: {
        totalKmOnSet: setup.totalKmOnSet,
        cityKm: setup.cityKm,
        highwayKm: setup.highwayKm,
        ruralKm: setup.ruralKm,
        harshAccelEvents: setup.harshAccelEvents,
        harshBrakeEvents: setup.harshBrakeEvents,
        harshCornerEvents: setup.harshCornerEvents,
      },
      tires: tires.map((tire) => ({
        id: tire.id,
        currentPosition: String(tire.currentPosition),
        dotCode: tire.dotCode,
        initialTreadDepthMm: tire.initialTreadDepthMm,
        estimatedTreadMm: tire.estimatedTreadMm,
        initialTreadEvidenceSource: tire.initialTreadEvidenceSource,
      })),
      measurements: measurements.map((m) => ({
        id: m.id,
        createdAt: m.createdAt.toISOString(),
        measuredAt: m.measuredAt.toISOString(),
        source: m.source,
        evidenceSource: m.evidenceSource,
        odometerAtMeasurement: m.odometerAtMeasurement,
        frontLeftMm: m.frontLeftMm,
        frontRightMm: m.frontRightMm,
        rearLeftMm: m.rearLeftMm,
        rearRightMm: m.rearRightMm,
      })),
      regressionPoints: regressionPoints.map((p) => ({
        id: p.id,
        axle: p.axle,
        distanceKm: p.distanceKm,
        actualTreadMm: p.actualTreadMm,
        predictedTreadMm: p.predictedTreadMm,
        actualMeasurementId: p.actualMeasurementId,
      })),
      latestState: {
        odometerKm: latestState?.odometerKm ?? null,
        tirePressureFl: canonicalPressures.tirePressureFl,
        tirePressureFr: canonicalPressures.tirePressureFr,
        tirePressureRl: canonicalPressures.tirePressureRl,
        tirePressureRr: canonicalPressures.tirePressureRr,
        speedKmh: latestState?.speedKmh ?? null,
        pressureFreshness: resolvePressureFreshnessBucket(
          latestState?.sourceTimestamp ??
            latestState?.providerFetchedAt ??
            latestState?.lastSeenAt ??
            null,
          pressureValues.length > 0,
          asOf,
        ),
      },
      drivingImpact,
      temperatureTrips,
      modelVersion: this.modelVersion,
      asOf,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  ROTATION HISTORY
  // ═══════════════════════════════════════════════════════════════════════════

  async getRotationHistory(vehicleId: string): Promise<RotationHistoryEntry[]> {
    const events = await this.prisma.tireEvent.findMany({
      where: { vehicleId, type: { in: [TireEventType.ROTATION, TireEventType.TIRE_CHANGE, TireEventType.INSTALL] } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    const positionHistory = await this.prisma.tirePositionHistory.findMany({
      where: { vehicleId },
      orderBy: { changedAt: 'desc' },
      take: 100,
    });
    const grouped = new Map<string, typeof positionHistory>();
    for (const ph of positionHistory) {
      const key = ph.changedAt.toISOString();
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(ph);
    }
    return events.map(ev => {
      const payload = (ev.payload as any) ?? {};
      return {
        id: ev.id,
        date: ev.createdAt.toISOString(),
        odometerKm: payload.odometerKm ?? null,
        changeType: ev.type,
        rotationTemplate: payload.template ?? null,
        notes: payload.notes ?? null,
        createdBy: ev.createdBy,
        moves: (grouped.get(ev.createdAt.toISOString()) ?? []).map(m => ({ tireId: m.tireId ?? undefined, from: m.fromPosition, to: m.toPosition })),
      };
    });
  }

  /**
   * @deprecated Use TireTripUsageService.processCanonicalTripFinalization — direct aggregate mutation removed (Prompt 10).
   */
  async updateTireUsageFromTrip(
    _vehicleId: string,
    _tripData: {
      distanceKm: number;
      cityPercent: number;
      highwayPercent: number;
      ruralPercent: number;
      harshBrakeCount: number;
      harshAccelCount: number;
      harshCornerCount: number;
    },
  ) {
    this.logger.warn(
      'updateTireUsageFromTrip is deprecated — tire usage is attributed via TireTripUsageService on canonical trip finalization.',
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  MULTI-DIMENSIONAL CONFIDENCE
  // ═══════════════════════════════════════════════════════════════════════════

  private async computeConfidence(vehicleId: string, setup: any): Promise<ConfidenceDimensions> {
    const c = this.cfg.confidence;
    let legacyScore = 0;
    let specScore = 0;
    let dataScore = 0;
    let modelScore = 0;

    // ── Tire spec confidence ─────────────────────────────────────────────
    const spec = parseAiTireSpec(setup.aiTireSpec);
    if (spec?.matchedBrand || spec?.matchedModel) {
      specScore += 30;
      legacyScore += c.aiTireSpecMatched;
    }
    if (spec?.confidenceScore != null) specScore += Math.round(spec.confidenceScore * 40);
    if (spec?.userConfirmedSpec) specScore += 30;
    specScore = Math.max(0, Math.min(100, specScore));

    // ── Data completeness confidence ─────────────────────────────────────
    if (setup.initialTreadDepthMm != null || setup.initialTreadFrontMm != null) { dataScore += 20; legacyScore += c.initialTreadExists; }
    if (setup.frontDimension) { dataScore += 10; legacyScore += c.tireSizeComplete; }
    if (setup.brandModelFront) { dataScore += 8; legacyScore += c.brandModelExists; }

    const latestState = await this.prisma.vehicleLatestState.findUnique({
      where: { vehicleId },
      select: {
        odometerKm: true,
        tirePressureFl: true,
        tirePressureFr: true,
        tirePressureRl: true,
        tirePressureRr: true,
        providerSource: true,
        sourceTimestamp: true,
        providerFetchedAt: true,
        lastSeenAt: true,
      },
    });
    if (latestState?.odometerKm != null) { dataScore += 12; legacyScore += c.odometerConsistent; }
    const canonicalPressures = resolveCanonicalVehicleTirePressuresBar({
      providerSource: latestState?.providerSource,
      tirePressureFl: latestState?.tirePressureFl,
      tirePressureFr: latestState?.tirePressureFr,
      tirePressureRl: latestState?.tirePressureRl,
      tirePressureRr: latestState?.tirePressureRr,
      sourceTimestamp:
        latestState?.sourceTimestamp ??
        latestState?.providerFetchedAt ??
        latestState?.lastSeenAt ??
        null,
    });

    const pressureValues = [
      canonicalPressures.tirePressureFl,
      canonicalPressures.tirePressureFr,
      canonicalPressures.tirePressureRl,
      canonicalPressures.tirePressureRr,
    ].filter((v): v is number => v != null);
    const pressureFreshness = this.resolveFreshness(
      latestState?.sourceTimestamp ??
        latestState?.providerFetchedAt ??
        latestState?.lastSeenAt ??
        null,
      pressureValues.length > 0,
    );
    if (pressureValues.length >= 2) {
      dataScore += 5;
      legacyScore += c.tirePressureAvailable;
    }
    if (pressureFreshness === 'stale') {
      dataScore -= 3;
      legacyScore -= 2;
    }
    if (pressureFreshness === 'no_data') {
      dataScore -= 5;
      legacyScore -= 3;
    }

    const impact = await this.drivingImpactService.getVehicleImpactForTire(vehicleId);
    if (impact) { dataScore += 10; legacyScore += c.usageSplitAvailable; }
    if (impact && (impact.longitudinalStressScore != null || impact.brakingStressScore != null)) {
      dataScore += 10; legacyScore += c.drivingImpactAvailable;
    }

    if (setup.totalKmOnSet >= 500) { dataScore += 5; legacyScore += c.atLeast500kmObserved; }
    if (setup.totalKmOnSet >= 2000) { dataScore += 5; legacyScore += c.atLeast2000kmObserved; }

    const measurementCount = setup.measurements?.length ?? 0;
    if (measurementCount >= 1) { dataScore += 8; legacyScore += c.atLeast1ManualMeasurement; }
    if (measurementCount >= 2) { dataScore += 7; legacyScore += c.atLeast2Measurements; }

    dataScore = Math.max(0, Math.min(100, dataScore));

    // ── Model confidence ─────────────────────────────────────────────────
    if (setup.kFactorCalibrationCount >= (this.cfg.calibration.stabilizedThreshold ?? 4)) {
      modelScore += 25; legacyScore += c.kFactorStabilized;
    }
    if (measurementCount >= 2) modelScore += 20;
    if (setup.totalKmOnSet >= 2000) modelScore += 15;
    if (impact) modelScore += 15;
    if (spec) modelScore += 15;
    if (pressureValues.length >= 2 && pressureFreshness !== 'stale') modelScore += 10;
    else if (pressureValues.length >= 2) modelScore += 4;
    modelScore = Math.max(0, Math.min(100, modelScore));

    legacyScore = Math.max(0, Math.min(100, legacyScore));

    let label: string;
    if (legacyScore >= this.cfg.confidenceThresholds.high) label = 'High';
    else if (legacyScore >= this.cfg.confidenceThresholds.medium) label = 'Medium';
    else label = 'Low';

    return {
      score: legacyScore,
      label,
      tireSpecConfidence: specScore,
      dataCompletenessConfidence: dataScore,
      modelConfidence: modelScore,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  ALERTS
  // ═══════════════════════════════════════════════════════════════════════════

  private async resolveOrganizationId(vehicleId: string): Promise<string> {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
      select: { organizationId: true },
    });
    return vehicle?.organizationId ?? '';
  }

  private resolveAlertDisplayMode(
    setup: { measurements?: Array<{ measuredAt: Date | string }> | null },
    wearAnalysis: { explainability?: { currentTreadSource?: string | null } },
  ): TireDisplayMode {
    const measurementState = this.resolveMeasurementState(
      wearAnalysis.explainability?.currentTreadSource,
    );
    return resolveDisplayMode(measurementState, (setup.measurements?.length ?? 0) > 0);
  }

  private async buildAlertCandidates(
    organizationId: string,
    vehicleId: string,
    setup: NonNullable<Awaited<ReturnType<TireHealthService['getActiveSetup']>>>,
    wearAnalysis: NonNullable<Awaited<ReturnType<TireWearModelService['computeWearAnalysis']>>>,
    confidenceScore: number,
    pressureContext: TirePressureContext,
    dimoContext?: TireDimoContext | null,
  ) {
    const kmSinceLastRotation = await resolveKmSinceLastRotation(
      this.prisma,
      vehicleId,
      setup,
    );
    return buildTireHealthAlerts({
      organizationId,
      vehicleId,
      setup,
      wearAnalysis,
      displayMode: this.resolveAlertDisplayMode(setup, wearAnalysis),
      confidenceScore,
      pressureContext,
      kmSinceLastRotation,
      dimoContext,
    });
  }

  private async buildAlertsForSetup(
    organizationId: string,
    vehicleId: string,
    setup: NonNullable<Awaited<ReturnType<TireHealthService['getActiveSetup']>>>,
    wearAnalysis: NonNullable<Awaited<ReturnType<TireWearModelService['computeWearAnalysis']>>>,
    confidenceScore: number,
    pressureContext: TirePressureContext,
    dimoContext?: TireDimoContext | null,
  ): Promise<TireAlert[]> {
    const candidates = await this.buildAlertCandidates(
      organizationId,
      vehicleId,
      setup,
      wearAnalysis,
      confidenceScore,
      pressureContext,
      dimoContext,
    );
    return structuredAlertsToApiAlerts(candidates);
  }

  private buildSummaryPayload(
    setup: any,
    wearAnalysis: any,
    confidence: ConfidenceDimensions,
    alerts: TireAlert[],
    pressureContext: TirePressureContext,
    inventoryFlags: Pick<TireHealthSummary, 'hasActiveSet' | 'hasSetups' | 'hasMeasurements'>,
    dimoContext: TireDimoContext,
  ): TireHealthSummary {
    const wheels = [
      { pos: 'FL', mm: wearAnalysis.frontLeftMm },
      { pos: 'FR', mm: wearAnalysis.frontRightMm },
      { pos: 'RL', mm: wearAnalysis.rearLeftMm },
      { pos: 'RR', mm: wearAnalysis.rearRightMm },
    ];
    const worst = wheels.reduce((w, c) => (c.mm < w.mm ? c : w), wheels[0]);

    const wheelPercents = wheels.map((w) => {
      const isFront = w.pos.startsWith('F');
      return this.computeWheelPercentV2(
        w.mm,
        isFront
          ? wearAnalysis.referenceNewTreadFront
          : wearAnalysis.referenceNewTreadRear,
        wearAnalysis.operationalReplacementMm,
      );
    });
    const minPercent = Math.min(...wheelPercents);
    const avgPercent =
      wheelPercents.reduce((sum, value) => sum + value, 0) / wheelPercents.length;
    const setLevelPercent = Math.round(
      Math.max(
        0,
        Math.min(
          100,
          this.cfg.setLevelHealth.minWeight * minPercent +
            this.cfg.setLevelHealth.avgWeight * avgPercent,
        ),
      ),
    );

    const healthStatus = this.classifyHealthStatus(
      setLevelPercent,
      worst.mm,
      setup.tireSeason,
    );
    const effectiveWearRate = Math.max(
      wearAnalysis.effectiveWearRateKmPerMm.front,
      wearAnalysis.effectiveWearRateKmPerMm.rear,
      1,
    );
    const wearRateMmPer1000km =
      effectiveWearRate > 0
        ? Math.round((1000 / effectiveWearRate) * 100) / 100
        : null;

    const latestMeasurement = setup.measurements?.[0] ?? null;
    const measurementState = this.resolveMeasurementState(
      wearAnalysis.explainability.currentTreadSource,
    );
    const unified = this.resolveUnifiedConfidence(setup, measurementState);
    const confDiscount =
      this.cfg.remainingKmConfidenceDiscount[unified.label.toLowerCase()] ?? 0.85;
    const rawAdjustedRemainingKm = Math.round(
      wearAnalysis.estimatedRemainingKm * confDiscount,
    );
    const anchorProjection = applyAnchorToRemainingKmProjection({
      anchorStatus: setup.odometerAnchorStatus,
      adjustedRemainingKm: rawAdjustedRemainingKm,
      confidenceScore: unified.score,
    });
    const adjustedRemainingKm = anchorProjection.adjustedRemainingKm ?? 0;
    const unifiedScore = anchorProjection.confidenceScore;

    const action = this.resolveActionState(
      anchorProjection.adjustedRemainingKm ?? 0,
      alerts,
      unifiedScore,
    );
    const dataQualityWarnings = this.resolveDataQualityWarnings({
      setup,
      confidenceScore: unifiedScore,
      measurementState,
      pressureContext,
      alerts,
      anchorWarnings: anchorProjection.warnings,
      dimoContext,
    });

    const canonical = this.buildCanonicalReadModel({
      setup,
      wearAnalysis,
      worst,
      measurementState,
      latestMeasurement,
      adjustedRemainingKm: anchorProjection.adjustedRemainingKm ?? 0,
      pressureContext,
      predictionCapable: anchorProjection.predictionCapable,
      dimoContext,
    });

    const currentTreadEvidenceSource = mapTreadSourceToEvidence(
      wearAnalysis.explainability.currentTreadSource,
      setup.initialTreadEvidenceSource ?? null,
    );
    const provenanceFlags = resolveSummaryProvenanceFlags(currentTreadEvidenceSource);

    const summaryCore = {
      overallPercent: setLevelPercent,
      overallRemainingKm: adjustedRemainingKm,
      healthStatus,
      confidenceScore: unifiedScore,
      confidenceLabel: unified.label,
      worstTirePosition: worst.pos,
      worstTirePercent: this.computeWheelPercentV2(
        worst.mm,
        worst.pos.startsWith('F')
          ? wearAnalysis.referenceNewTreadFront
          : wearAnalysis.referenceNewTreadRear,
        wearAnalysis.operationalReplacementMm,
      ),
      activeSetupName: setup.name ?? setup.brandModelFront ?? 'Active Set',
      activeSetupId: setup.id,
      tireSeason: setup.tireSeason,
      installedAt: setup.installedAt?.toISOString() ?? null,
      totalKmOnSet: setup.totalKmOnSet,
      wearRateMmPer1000km,
      alerts,
      tireCondition: setup.tireCondition ?? 'UNKNOWN',
      tireArchetype: wearAnalysis.factors.tireArchetype,
      tireSpecMatched: wearAnalysis.factors.tireSpecMatched,
      tireSpecConfidence: confidence.tireSpecConfidence,
      dataCompletenessConfidence: confidence.dataCompletenessConfidence,
      modelConfidence: confidence.modelConfidence,
      referenceNewTreadSource: wearAnalysis.explainability.referenceNewTreadSource,
      replacementThresholdSource:
        wearAnalysis.explainability.replacementThresholdSource,
      currentTreadSource: wearAnalysis.explainability.currentTreadSource,
      currentTreadValue: this.round1(worst.mm),
      currentTreadEvidenceSource,
      ...provenanceFlags,
      lastActualMeasurementAt: latestMeasurement?.measuredAt?.toISOString() ?? null,
      baselineSource: setup.initialTreadEvidenceSource ?? null,
      operationalReplacementMm: wearAnalysis.operationalReplacementMm,
      topWearDrivers: wearAnalysis.explainability.topWearDrivers,
      actionState: action.state,
      actionReasons: action.reasons,
      measurementState,
      dataQualityWarnings,
      pressureContext,
      recommendedPressure: pressureContext.recommendedPressure,
      pressureSpecMissingLabel: pressureContext.pressureSpecMissingLabel,
      latestMeasurementAt: latestMeasurement?.measuredAt?.toISOString() ?? null,
      predictionCapable: anchorProjection.predictionCapable,
      odometerAnchorStatus: setup.odometerAnchorStatus ?? null,
      odometerAnchorConfidence: setup.odometerAnchorConfidence ?? null,
      installedOdometerSource: setup.installedOdometerSource ?? null,
      ...canonical,
      ...inventoryFlags,
    } satisfies TireHealthSummaryForPresentation;

    return {
      ...summaryCore,
      dimoContext,
      evidencePresentation: buildTireEvidencePresentation({
        summary: summaryCore,
        modelCalculatedAt: setup.lastRecalculatedAt?.toISOString() ?? null,
      }),
    };
  }

  /**
   * Derives the honest GOOD/WATCH/WARNING/CRITICAL read model from the wear
   * analysis. Measured and estimated values are kept separate and the display
   * mode / confidence make clear which one is shown. Status is aggregated from
   * tread, remaining-km, season, uneven-wear, pressure and tire age — CRITICAL
   * always wins, UNKNOWN signals are ignored.
   */
  private buildCanonicalReadModel(args: {
    setup: any;
    wearAnalysis: any;
    worst: { pos: string; mm: number };
    measurementState: 'measured' | 'estimated' | 'mixed';
    latestMeasurement: any | null;
    adjustedRemainingKm: number;
    pressureContext: TirePressureContext;
    predictionCapable?: boolean;
    dimoContext?: TireDimoContext | null;
  }): {
    overallStatus: TireStatus;
    displayMode: TireDisplayMode;
    confidence: TireConfidenceLevel;
    lowestTreadMm: number | null;
    lowestTreadPosition: string | null;
    measuredTreadMm: number | null;
    estimatedTreadMm: number | null;
    displayTreadMm: number | null;
    lastMeasurementAt: string | null;
    measurementAgeDays: number | null;
    estimatedRemainingKm: number | null;
    pressureStatus: TireStatus;
    seasonStatus: TireStatus;
    unevenWearStatus: TireStatus;
    recommendations: string[];
  } {
    const { setup, wearAnalysis, worst, measurementState, latestMeasurement, adjustedRemainingKm, pressureContext, predictionCapable = true, dimoContext } = args;

    const estimatedTreadMm = this.round1(worst.mm);
    const lowestTreadPosition = this.positionLabel(worst.pos);

    const measuredVals = latestMeasurement
      ? [latestMeasurement.frontLeftMm, latestMeasurement.frontRightMm, latestMeasurement.rearLeftMm, latestMeasurement.rearRightMm].filter(
          (v: any): v is number => v != null,
        )
      : [];
    const hasMeasurement = measuredVals.length > 0;
    const measuredTreadMm = hasMeasurement ? this.round1(Math.min(...measuredVals)) : null;

    const measurementAgeDays = latestMeasurement?.measuredAt
      ? Math.floor((Date.now() - new Date(latestMeasurement.measuredAt).getTime()) / 86400000)
      : null;

    const displayMode = resolveDisplayMode(measurementState, true);
    const displayTreadMm = displayMode === 'MEASURED' ? measuredTreadMm ?? estimatedTreadMm : estimatedTreadMm;
    const lowestTreadMm = displayTreadMm;

    const confidence = classifyConfidenceLevel({
      hasMeasurement,
      measurementAgeDays,
      kmSinceMeasurement: null,
      hasWearBaseline: true,
    });

    // ── Sub-statuses ──
    const treadStatus = classifyTreadStatus(lowestTreadMm, setup.tireSeason);
    const remainingKmStatus = predictionCapable
      ? classifyRemainingKmStatus(adjustedRemainingKm)
      : 'UNKNOWN';
    const seasonResult = classifySeasonStatus(setup.tireSeason, new Date(), {
      weightedAvgTempC: dimoContext?.ambient.weightedAvgTempC ?? 0,
      sampleCount: dimoContext?.ambient.sampleCount ?? 0,
      capabilityUsable: dimoContext?.ambient.usable === true,
    });
    const seasonStatus = seasonResult.status;

    const sideDeltaFront = Math.abs(wearAnalysis.frontLeftMm - wearAnalysis.frontRightMm);
    const sideDeltaRear = Math.abs(wearAnalysis.rearLeftMm - wearAnalysis.rearRightMm);
    const axleDelta = Math.abs(
      (wearAnalysis.frontLeftMm + wearAnalysis.frontRightMm) / 2 -
        (wearAnalysis.rearLeftMm + wearAnalysis.rearRightMm) / 2,
    );
    const unevenWearStatus = classifyUnevenWear(sideDeltaFront, sideDeltaRear, axleDelta);
    const pressureStatus = this.mapPressureStatus(pressureContext);

    const dotAges = [dotAgeYears(setup.dotCodeFront), dotAgeYears(setup.dotCodeRear)].filter(
      (v): v is number => v != null,
    );
    const maxAgeYears = dotAges.length > 0 ? Math.max(...dotAges) : null;
    const ageStatus = classifyTireAgeYears(maxAgeYears);

    const overallStatus = aggregateTireStatus(
      treadStatus,
      remainingKmStatus,
      seasonStatus,
      unevenWearStatus,
      pressureStatus,
      ageStatus,
    );

    const recommendations = this.buildRecommendations({
      treadStatus,
      remainingKmStatus,
      seasonResult,
      unevenWearStatus,
      pressureStatus,
      ageStatus,
      ageYears: maxAgeYears,
      confidence,
      hasMeasurement,
      measurementOverdue: classifyMeasurementOverdue(measurementAgeDays),
    });

    return {
      overallStatus,
      displayMode,
      confidence,
      lowestTreadMm,
      lowestTreadPosition,
      measuredTreadMm,
      estimatedTreadMm,
      displayTreadMm,
      lastMeasurementAt: latestMeasurement?.measuredAt?.toISOString() ?? null,
      measurementAgeDays,
      estimatedRemainingKm: predictionCapable ? adjustedRemainingKm : null,
      pressureStatus,
      seasonStatus,
      unevenWearStatus,
      recommendations,
    };
  }

  private buildRecommendations(args: {
    treadStatus: TireStatus;
    remainingKmStatus: TireStatus;
    seasonResult: { status: TireStatus; mismatch: boolean; expectedSeason: string };
    unevenWearStatus: TireStatus;
    pressureStatus: TireStatus;
    ageStatus: TireStatus;
    ageYears: number | null;
    confidence: TireConfidenceLevel;
    hasMeasurement: boolean;
    measurementOverdue: boolean;
  }): string[] {
    const recs: string[] = [];
    if (args.treadStatus === 'CRITICAL') {
      recs.push('Replace tires now — tread is at or below the legal minimum (1.6 mm).');
    } else if (args.treadStatus === 'WARNING' || args.remainingKmStatus === 'WARNING') {
      recs.push('Plan tire replacement soon.');
    } else if (args.treadStatus === 'WATCH') {
      recs.push('Monitor tread depth; replacement will be needed in the medium term.');
    }
    if (args.seasonResult.mismatch && args.seasonResult.status === 'WARNING') {
      recs.push('Fit winter or all-season tires for current conditions.');
    } else if (args.seasonResult.mismatch && args.seasonResult.status === 'WATCH') {
      recs.push('Switch to summer tires to reduce wear and improve braking.');
    }
    if (args.unevenWearStatus === 'WARNING') {
      recs.push('Check wheel alignment and tire pressure — significant uneven wear detected.');
    } else if (args.unevenWearStatus === 'WATCH') {
      recs.push('Rotate tires to even out front/rear wear.');
    }
    if (args.pressureStatus === 'WARNING') {
      recs.push('Correct tire pressure to the recommended values.');
    }
    if (args.ageStatus === 'WARNING') {
      recs.push(`Tires are ~${Math.round(args.ageYears ?? 0)} years old — replacement is recommended regardless of tread.`);
    }
    if (args.measurementOverdue) {
      recs.push('Re-measure tread depth — the last measurement is overdue.');
    }
    if (!args.hasMeasurement) {
      recs.push('Record a tread measurement to confirm the estimate.');
    } else if (args.confidence === 'LOW') {
      recs.push('Re-measure soon to improve confidence.');
    }
    if (recs.length === 0) recs.push('No tire action required.');
    return Array.from(new Set(recs)).slice(0, 5);
  }

  private mapPressureStatus(ctx: TirePressureContext): TireStatus {
    switch (ctx.overallStatus) {
      case 'ISSUE':
        return 'WARNING';
      case 'OK':
        return 'GOOD';
      case 'STALE':
      case 'UNKNOWN':
      default:
        return 'UNKNOWN';
    }
  }

  private positionLabel(pos: string): string {
    switch (pos) {
      case 'FL':
        return 'front left';
      case 'FR':
        return 'front right';
      case 'RL':
        return 'rear left';
      case 'RR':
        return 'rear right';
      default:
        return pos;
    }
  }

  private round1(value: number): number {
    return Math.round(value * 10) / 10;
  }

  private resolveActionState(
    remainingKm: number,
    alerts: TireAlert[],
    confidenceScore: number,
  ): { state: TireActionState; reasons: string[] } {
    const criticalTypes = new Set([
      'CRITICAL_TREAD',
      'CRITICAL_REMAINING_KM',
      'UNEVEN_WEAR_CRITICAL',
    ]);
    const planTypes = new Set([
      'LOW_TREAD',
      'LOW_REMAINING_KM',
      'AXLE_WEAR_IMBALANCE',
      'PRESSURE_IMPACT',
      'ROTATION_OVERDUE',
    ]);
    const checkTypes = new Set([
      'ROTATION_RECOMMENDED',
      'LOW_CONFIDENCE',
      'USED_TIRE_NO_MEASUREMENT',
      'UNEVEN_WEAR_ATTENTION',
      'SEASON_MISMATCH',
    ]);

    const criticalMatches = alerts.filter((a) => criticalTypes.has(a.type));
    if (criticalMatches.length > 0) {
      return {
        state: 'REPLACE',
        reasons: criticalMatches.slice(0, 2).map((a) => a.message),
      };
    }

    const planMatches = alerts.filter((a) => planTypes.has(a.type));
    if (planMatches.length > 0 || remainingKm <= this.cfg.alerts.lowRemainingKm) {
      return {
        state: 'PLAN_SERVICE',
        reasons:
          planMatches.slice(0, 2).map((a) => a.message).length > 0
            ? planMatches.slice(0, 2).map((a) => a.message)
            : [`Remaining tire life nearing service window (${remainingKm.toLocaleString()} km)`],
      };
    }

    const checkMatches = alerts.filter((a) => checkTypes.has(a.type));
    if (checkMatches.length > 0 || confidenceScore < this.cfg.alerts.lowConfidenceThreshold) {
      return {
        state: 'CHECK_SOON',
        reasons: checkMatches.slice(0, 2).map((a) => a.message),
      };
    }

    return { state: 'OBSERVE', reasons: ['No urgent tire intervention required.'] };
  }

  private resolveMeasurementState(
    currentTreadSource: string | null | undefined,
    evidenceSource?: TireEvidenceSource | null,
  ): 'measured' | 'estimated' | 'mixed' {
    if (evidenceSource && resolveSummaryProvenanceFlags(evidenceSource).isMeasured) {
      return 'measured';
    }
    if (currentTreadSource === 'manual_measurement') return 'measured';
    if (currentTreadSource === 'calibration_projection') return 'mixed';
    if (currentTreadSource === 'fallback_estimate') return 'estimated';
    return 'estimated';
  }

  private resolveDataQualityWarnings(args: {
    setup: any;
    confidenceScore: number;
    measurementState: 'measured' | 'estimated' | 'mixed';
    pressureContext: TirePressureContext;
    alerts: TireAlert[];
    anchorWarnings?: string[];
    dimoContext?: TireDimoContext | null;
  }): string[] {
    const warnings: string[] = [...(args.anchorWarnings ?? [])];
    if (!isPredictionCapable(args.setup.odometerAnchorStatus)) {
      warnings.push('Odometer anchor missing or unvalidated for this setup.');
    }
    if (args.confidenceScore < this.cfg.alerts.lowConfidenceThreshold) {
      warnings.push('Low confidence: add workshop or manual measurements for stronger anchors.');
    }
    if (args.measurementState !== 'measured') {
      warnings.push('Current tread state is partially estimated.');
    }
    if (args.pressureContext.overallFreshness === 'stale') {
      warnings.push('DIMO tire pressure data is stale.');
    }
    if (args.pressureContext.wearEligibility.measurementHint) {
      warnings.push(args.pressureContext.wearEligibility.measurementHint);
    }
    if (
      args.setup.tireCondition === 'ALREADY_MOUNTED' &&
      (!args.setup.measurements || args.setup.measurements.length === 0)
    ) {
      warnings.push(
        'Used tires are mounted without a confirmed baseline measurement.',
      );
    }
    if (args.alerts.some((a) => a.type === 'LOW_CONFIDENCE')) {
      warnings.push('Model anchor quality is weak for long-horizon projection.');
    }
    if (args.dimoContext?.ambient.pressureContextHintEn) {
      warnings.push(args.dimoContext.ambient.pressureContextHintEn);
    }
    return Array.from(new Set(warnings));
  }

  private async resolvePressureContext(
    vehicleId: string,
    hmTirePressure: HmTirePressureSignals | null,
    setup?: {
      aiTireSpec?: unknown;
      recommendedPressureFrontBar?: number | null;
      recommendedPressureRearBar?: number | null;
      recommendedPressureLoadedFrontBar?: number | null;
      recommendedPressureLoadedRearBar?: number | null;
      pressureSpecSource?: string | null;
      pressureSpecConfirmedAt?: Date | null;
      pressureSpecConfidence?: number | null;
      isStaggered?: boolean | null;
    } | null,
    dimoContext?: TireDimoContext | null,
  ): Promise<TirePressureContext> {
    const latestState = await this.prisma.vehicleLatestState.findUnique({
      where: { vehicleId },
      select: {
        tirePressureFl: true,
        tirePressureFr: true,
        tirePressureRl: true,
        tirePressureRr: true,
        providerSource: true,
        providerFetchedAt: true,
        sourceTimestamp: true,
        lastSeenAt: true,
        rawPayloadJson: true,
      },
    });

    const recommendedPressure = resolveRecommendedTirePressure(setup ?? {});
    const rawTpms = latestState
      ? extractDimoTpmsWarningFromPayload(latestState.rawPayloadJson)
      : null;

    return buildTirePressureContext({
      recommendedPressure,
      dimo: latestState
        ? {
            tirePressureFl: latestState.tirePressureFl,
            tirePressureFr: latestState.tirePressureFr,
            tirePressureRl: latestState.tirePressureRl,
            tirePressureRr: latestState.tirePressureRr,
            providerSource: latestState.providerSource,
            sourceTimestamp: latestState.sourceTimestamp,
            providerFetchedAt: latestState.providerFetchedAt,
            lastSeenAt: latestState.lastSeenAt,
            perWheelTimestamps: extractDimoPerWheelTimestamps(
              latestState.rawPayloadJson,
            ),
            tpmsWarning: resolveCapabilityGatedTpmsWarning(
              dimoContext?.tpms ?? {
                architecturePrepared: true,
                usable: false,
                signalPresent: false,
                warningActive: null,
                sourceTimestamp: null,
                reasons: [],
              },
              rawTpms,
            ),
            capability: {
              tpms: dimoContext?.tpms ?? null,
            },
          }
        : null,
      hm: hmTirePressure
        ? {
            frontLeft: hmTirePressure.frontLeft,
            frontRight: hmTirePressure.frontRight,
            rearLeft: hmTirePressure.rearLeft,
            rearRight: hmTirePressure.rearRight,
            unit: hmTirePressure.unit,
            statusFrontLeft: hmTirePressure.statusFrontLeft,
            statusFrontRight: hmTirePressure.statusFrontRight,
            statusRearLeft: hmTirePressure.statusRearLeft,
            statusRearRight: hmTirePressure.statusRearRight,
            overallStatus: hmTirePressure.overallStatus,
            lastUpdatedAt: hmTirePressure.lastUpdatedAt,
            freshnessStatus: hmTirePressure.freshnessStatus,
          }
        : null,
    });
  }

  private observePressureInvalidWheels(context: TirePressureContext): void {
    const positions = ['frontLeft', 'frontRight', 'rearLeft', 'rearRight'] as const;
    for (const position of positions) {
      const wheel = context.wheels[position];
      if (wheel.plausibility === 'valid' || wheel.plausibility === 'missing') {
        continue;
      }
      this.observability?.recordPressureNormalization({
        plausibility: wheel.plausibility,
        invalid: true,
        source: wheel.sourceProvider,
      });
    }
  }

  private async ensureTelemetryOdometerAnchor<
    T extends {
      id: string;
      vehicleId: string;
      installedOdometerKm: number | null;
      installedOdometerSource?: string | null;
      installedOdometerCapturedAt?: Date | null;
      installedOdometerEvidenceId?: string | null;
      odometerAnchorStatus?: string | null;
      odometerAnchorConfidence?: number | null;
    },
  >(vehicleId: string, setup: T): Promise<T> {
    if (setup.installedOdometerKm != null) {
      return setup;
    }

    const context = await this.fetchVehicleOdometerContext(vehicleId);
    const anchor = resolveOdometerAnchor({ context });
    if (!isRuntimeTelemetryAutoAnchorEligible(anchor)) {
      return setup;
    }

    const fields = buildSetupOdometerAnchorFields(anchor);
    await this.prisma.vehicleTireSetup.update({
      where: { id: setup.id },
      data: fields,
    });
    await this.prisma.vehicleTireSetupMountPeriod.updateMany({
      where: { tireSetupId: setup.id, removedAt: null },
      data: fields,
    });

    this.observability?.recordOdometerAnchor({
      status: 'anchored',
      source: anchor.source,
      issue: 'runtime_telemetry_bootstrap',
    });
    this.logger.log(
      `Auto-anchored odometer for setup=${setup.id} vehicle=${vehicleId} ` +
        `odometerKm=${anchor.odometerKm} source=${anchor.source}`,
    );

    return { ...setup, ...fields };
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
      .map((event) =>
        toFiniteOdometerKm((event.payload as { odometerKm?: number } | null)?.odometerKm),
      )
      .filter((value): value is number => value != null);
    const eventOdo = eventOdos.length > 0 ? Math.max(...eventOdos) : null;
    const lastKnown = [lastSetup?.removedOdometerKm, eventOdo, vehicle?.mileageKm]
      .map((value) => toFiniteOdometerKm(value))
      .filter((value): value is number => value != null)
      .reduce((max, value) => Math.max(max, value), Number.NEGATIVE_INFINITY);

    return {
      latestState,
      vehicleMileageKm: vehicle?.mileageKm ?? null,
      lastKnownOdometerKm: Number.isFinite(lastKnown) ? lastKnown : null,
    };
  }

  private observeDimoOdometerAnchor(dimoContext: TireDimoContext): void {
    const odometer = dimoContext.odometer;
    const status =
      odometer.usable
        ? 'anchored'
        : odometer.valueKm != null &&
            odometer.reasons.some((reason) => reason.includes('plausibility'))
          ? 'plausibility_issue'
          : 'required';
    this.observability?.recordOdometerAnchor({
      status,
      source: odometer.source,
      issue: odometer.reasons[0] ?? null,
    });
  }

  private async resolveDimoTireContext(
    vehicleId: string,
    asOf?: Date,
  ): Promise<TireDimoContext> {
    const effectiveAsOf = asOf ?? new Date();
    const fourteenDaysAgo = new Date(
      effectiveAsOf.getTime() - 14 * 24 * 60 * 60 * 1000,
    );

    const [latestState, trips, setup] = await Promise.all([
      this.prisma.vehicleLatestState.findUnique({
        where: { vehicleId },
        select: {
          odometerKm: true,
          speedKmh: true,
          providerSource: true,
          sourceTimestamp: true,
          providerFetchedAt: true,
          lastSeenAt: true,
          rawPayloadJson: true,
        },
      }),
      this.prisma.vehicleTrip.findMany({
        where: {
          vehicleId,
          startTime: {
            gte: fourteenDaysAgo,
            ...(asOf ? { lte: asOf } : {}),
          },
        },
        select: {
          startTime: true,
          outsideTemperatureStartC: true,
          distanceKm: true,
        },
        take: 500,
        orderBy: { startTime: 'desc' },
      }),
      this.prisma.vehicleTireSetup.findFirst({
        where: { vehicleId, removedAt: null, status: TireSetupStatus.ACTIVE },
        select: { installedOdometerKm: true },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const ambientSamples = trips
      .filter(
        (t) =>
          t.outsideTemperatureStartC != null &&
          t.startTime != null &&
          Number.isFinite(t.outsideTemperatureStartC),
      )
      .map((t) => ({
        timestamp: t.startTime!.toISOString(),
        temperatureC: t.outsideTemperatureStartC!,
        weightKm: t.distanceKm ?? 1,
      }));

    const raw = latestState?.rawPayloadJson as Record<string, unknown> | null;
    const availableSignalNames = raw
      ? Object.keys(raw).filter((k) => !k.startsWith('_'))
      : [];

    const rawTpms = extractDimoTpmsWarningFromPayload(
      latestState?.rawPayloadJson,
    );

    return buildTireDimoContext({
      asOf: effectiveAsOf,
      latestState,
      ambientSamples,
      availableSignalNames,
      lastKnownOdometerKm: setup?.installedOdometerKm ?? null,
      tpmsWarning: rawTpms,
      coverage: {
        exteriorAirTemperature: {
          sampleCount14d: ambientSamples.length,
          coveragePercent:
            ambientSamples.length > 0
              ? Math.min(100, ambientSamples.length)
              : 0,
        },
        powertrainTransmissionTravelledDistance: {
          sampleCount14d: latestState?.odometerKm != null ? 1 : 0,
          coveragePercent: latestState?.odometerKm != null ? 1 : 0,
        },
        speed: {
          sampleCount14d: latestState?.speedKmh != null ? 1 : 0,
          coveragePercent: latestState?.speedKmh != null ? 1 : 0,
        },
      },
    });
  }

  private applyPressureConfidenceOverlay(
    confidence: ConfidenceDimensions,
    pressureContext: TirePressureContext,
  ): ConfidenceDimensions {
    let score = confidence.score - pressureContext.wearEligibility.confidencePenalty;
    if (pressureContext.tpmsWarning === true && pressureContext.overallFreshness !== 'stale') {
      score -= 3;
    }
    if (
      pressureContext.hmFreshness === 'fresh' &&
      pressureContext.dimoFreshness === 'no_data' &&
      pressureContext.sourceType === 'HIGH_MOBILITY'
    ) {
      score += 2;
    }
    score = Math.max(0, Math.min(100, score));

    let label: string;
    if (score >= this.cfg.confidenceThresholds.high) label = 'High';
    else if (score >= this.cfg.confidenceThresholds.medium) label = 'Medium';
    else label = 'Low';

    return { ...confidence, score, label };
  }

  private resolveFreshness(
    timestamp: Date | null | undefined,
    hasData: boolean,
  ): PressureFreshness {
    if (!hasData) return 'no_data';
    if (!timestamp) return 'aging';
    const ageMs = Date.now() - timestamp.getTime();
    if (ageMs < 2 * 60 * 60 * 1000) return 'fresh';
    if (ageMs < 12 * 60 * 60 * 1000) return 'aging';
    return 'stale';
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  PRIVATE HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  private async getActiveSetup(vehicleId: string) {
    return this.prisma.vehicleTireSetup.findFirst({
      where: { vehicleId, removedAt: null, status: TireSetupStatus.ACTIVE },
      orderBy: { createdAt: 'desc' },
      include: { measurements: { orderBy: { measuredAt: 'desc' }, take: 5 } },
    });
  }

  private async resolveInventoryFlags(
    vehicleId: string,
    activeSetup: { measurements?: unknown[] } | null,
  ): Promise<Pick<TireHealthSummary, 'hasActiveSet' | 'hasSetups' | 'hasMeasurements'>> {
    const [setupCount, measurementCount] = await Promise.all([
      this.prisma.vehicleTireSetup.count({ where: { vehicleId } }),
      this.prisma.vehicleTireTreadMeasurement.count({ where: { vehicleId } }),
    ]);
    const hasActiveSet = activeSetup != null;
    const hasSetups = setupCount > 0;
    const hasMeasurements =
      measurementCount > 0 || (activeSetup?.measurements?.length ?? 0) > 0;
    return { hasActiveSet, hasSetups, hasMeasurements };
  }

  /**
   * V2 wheel percent: uses resolved reference new tread and operational replacement threshold.
   */
  private computeWheelPercentV2(treadMm: number, referenceNewMm: number, operationalReplaceMm: number): number {
    const usable = referenceNewMm - operationalReplaceMm;
    const remaining = treadMm - operationalReplaceMm;
    return usable > 0 ? Math.max(0, Math.min(100, Math.round(remaining / usable * 100))) : 0;
  }

  /** Legacy wheel percent (kept for backward compat where needed). */
  private computeWheelPercent(treadMm: number, initialMm: number, tireSeason?: string | null): number {
    const season = tireSeason ?? 'ALL_SEASON';
    const replaceThreshold = this.cfg.replaceThresholds[season] ?? this.cfg.defaultReplaceThresholdMm;
    const usable = initialMm - replaceThreshold;
    const remaining = treadMm - replaceThreshold;
    return usable > 0 ? Math.max(0, Math.min(100, Math.round(remaining / usable * 100))) : 0;
  }

  private classifyHealthStatus(percent: number, lowestTreadMm?: number, tireSeason?: string | null): TireHealthStatus {
    const t = this.cfg.healthStatusThresholds;
    const season = tireSeason ?? 'ALL_SEASON';
    const replaceThreshold = this.cfg.replaceThresholds[season] ?? this.cfg.defaultReplaceThresholdMm;

    if (percent < t.poor || (lowestTreadMm != null && lowestTreadMm <= replaceThreshold)) return TireHealthStatus.REPLACE_NOW;
    if (percent < t.moderate) return TireHealthStatus.POOR;
    if (percent < t.good) return TireHealthStatus.MODERATE;
    if (percent < t.excellent) return TireHealthStatus.GOOD;
    return TireHealthStatus.EXCELLENT;
  }

  private buildWheelEstimates(setup: any, wearAnalysis: any, confidence: ConfidenceDimensions): PerWheelEstimate[] {
    const refFront = wearAnalysis?.referenceNewTreadFront ?? setup.initialTreadFrontMm ?? setup.initialTreadDepthMm ?? this.cfg.defaultInitialTreadFallbackMm;
    const refRear = wearAnalysis?.referenceNewTreadRear ?? setup.initialTreadRearMm ?? setup.initialTreadDepthMm ?? this.cfg.defaultInitialTreadFallbackMm;
    const operationalReplace = wearAnalysis?.operationalReplacementMm ?? this.cfg.defaultReplaceThresholdMm;
    const latestMeasurement = setup.measurements?.[0] ?? null;

    return [
      { pos: 'FL', mm: wearAnalysis?.frontLeftMm ?? refFront, initial: refFront, measuredMm: latestMeasurement?.frontLeftMm ?? null },
      { pos: 'FR', mm: wearAnalysis?.frontRightMm ?? refFront, initial: refFront, measuredMm: latestMeasurement?.frontRightMm ?? null },
      { pos: 'RL', mm: wearAnalysis?.rearLeftMm ?? refRear, initial: refRear, measuredMm: latestMeasurement?.rearLeftMm ?? null },
      { pos: 'RR', mm: wearAnalysis?.rearRightMm ?? refRear, initial: refRear, measuredMm: latestMeasurement?.rearRightMm ?? null },
    ].map(p => {
      const wearPercent = this.computeWheelPercentV2(p.mm, p.initial, operationalReplace);
      const isFront = p.pos.startsWith('F');
      const wearRate = isFront ? wearAnalysis?.effectiveWearRateKmPerMm.front : wearAnalysis?.effectiveWearRateKmPerMm.rear;
      const remainingMm = p.mm - operationalReplace;
      const remainingKm = remainingMm > 0 && wearRate ? Math.round(remainingMm * wearRate) : 0;

      return {
        position: p.pos,
        treadMm: Math.round(p.mm * 10) / 10,
        wearPercent,
        remainingKm,
        healthStatus: this.classifyHealthStatus(wearPercent, p.mm, setup.tireSeason),
        initialTreadMm: p.initial,
        lastMeasuredMm: p.measuredMm != null ? Math.round(p.measuredMm * 10) / 10 : null,
        lastMeasuredAt: latestMeasurement?.measuredAt?.toISOString() ?? null,
        confidenceScore: confidence.score,
        confidenceLabel: confidence.label,
        brand: isFront ? setup.brandModelFront : (setup.brandModelRear ?? setup.brandModelFront),
        tireModel: null,
        size: isFront ? setup.frontDimension : (setup.rearDimension ?? setup.frontDimension),
        totalKm: Math.round(setup.totalKmOnSet / 4),
        cityKm: Math.round(setup.cityKm / 4),
        highwayKm: Math.round(setup.highwayKm / 4),
        ruralKm: Math.round(setup.ruralKm / 4),
      };
    });
  }

  private async getMeasurements(vehicleId: string, setupId: string): Promise<MeasurementEntry[]> {
    const measurements = await this.prisma.vehicleTireTreadMeasurement.findMany({
      where: { vehicleId, tireSetupId: setupId },
      orderBy: { measuredAt: 'desc' },
      take: 20,
    });
    return measurements.map(m => ({
      id: m.id,
      date: m.measuredAt.toISOString(),
      odometerKm: m.odometerAtMeasurement,
      source: m.source,
      workshopName: m.workshopName,
      values: [
        ...(m.frontLeftMm != null ? [{ position: 'FL', mm: m.frontLeftMm }] : []),
        ...(m.frontRightMm != null ? [{ position: 'FR', mm: m.frontRightMm }] : []),
        ...(m.rearLeftMm != null ? [{ position: 'RL', mm: m.rearLeftMm }] : []),
        ...(m.rearRightMm != null ? [{ position: 'RR', mm: m.rearRightMm }] : []),
      ],
    }));
  }

  private resolveUnifiedConfidence(
    setup: any,
    measurementState: 'measured' | 'estimated' | 'mixed',
  ): { level: TireConfidenceLevel; label: string; score: number } {
    const latestMeasurement = setup.measurements?.[0] ?? null;
    const measuredVals = latestMeasurement
      ? [
          latestMeasurement.frontLeftMm,
          latestMeasurement.frontRightMm,
          latestMeasurement.rearLeftMm,
          latestMeasurement.rearRightMm,
        ].filter((v: any): v is number => v != null)
      : [];
    const level = classifyConfidenceLevel({
      hasMeasurement: measuredVals.length > 0,
      measurementAgeDays: latestMeasurement?.measuredAt
        ? Math.floor(
            (Date.now() - new Date(latestMeasurement.measuredAt).getTime()) / 86400000,
          )
        : null,
      kmSinceMeasurement: null,
      hasWearBaseline: true,
    });
    return {
      level,
      label: confidenceLevelToLabel(level),
      score: confidenceLevelToScore(level),
    };
  }

  private computeUsageSplit(setup: any): { city: number; highway: number; rural: number } {
    const total = setup.totalKmOnSet || 1;
    return {
      city: Math.round(setup.cityKm / total * 100),
      highway: Math.round(setup.highwayKm / total * 100),
      rural: Math.round(setup.ruralKm / total * 100),
    };
  }

  private parseTireWidth(dimension: string): number | null {
    const match = dimension.match(/^(\d{3})\//);
    if (match) return parseInt(match[1], 10);
    const numMatch = dimension.match(/(\d{3})/);
    if (numMatch) return parseInt(numMatch[1], 10);
    return null;
  }

  private buildEmptySummary(
    setup: any,
    pressureContext?: TirePressureContext,
    inventoryFlags: Pick<TireHealthSummary, 'hasActiveSet' | 'hasSetups' | 'hasMeasurements'> = {
      hasActiveSet: true,
      hasSetups: true,
      hasMeasurements: (setup.measurements?.length ?? 0) > 0,
    },
    dimoContext?: TireDimoContext,
  ): TireHealthSummary {
    const resolvedPressure = pressureContext ?? emptyTirePressureContext();
    const resolvedDimo =
      dimoContext ??
      buildTireDimoContext({
        asOf: new Date(),
        ambientSamples: [],
      });

    const latestMeasurement = setup.measurements?.[0] ?? null;
    const measuredVals = latestMeasurement
      ? [latestMeasurement.frontLeftMm, latestMeasurement.frontRightMm, latestMeasurement.rearLeftMm, latestMeasurement.rearRightMm].filter(
          (v: any): v is number => v != null,
        )
      : [];
    const measuredTreadMm = measuredVals.length > 0 ? this.round1(Math.min(...measuredVals)) : null;
    const measurementAgeDays = latestMeasurement?.measuredAt
      ? Math.floor((Date.now() - new Date(latestMeasurement.measuredAt).getTime()) / 86400000)
      : null;

    // Without a wear baseline we cannot honestly assert tread health, but a
    // season mismatch or a live pressure issue is still a real, knowable fact.
    const seasonResult = classifySeasonStatus(setup.tireSeason, new Date(), {
      weightedAvgTempC: resolvedDimo.ambient.weightedAvgTempC ?? 0,
      sampleCount: resolvedDimo.ambient.sampleCount,
      capabilityUsable: resolvedDimo.ambient.usable,
    });
    const pressureStatus = this.mapPressureStatus(resolvedPressure);
    const knownStatus = aggregateTireStatus(seasonResult.status, pressureStatus);
    const overallStatus: TireStatus = knownStatus === 'GOOD' ? 'UNKNOWN' : knownStatus;

    const recommendations: string[] = ['Record a tread measurement to establish a baseline.'];
    if (seasonResult.mismatch && seasonResult.status === 'WARNING') {
      recommendations.unshift('Fit winter or all-season tires for current conditions.');
    } else if (seasonResult.mismatch && seasonResult.status === 'WATCH') {
      recommendations.unshift('Switch to summer tires to reduce wear.');
    }

    const summaryCore = {
      overallPercent: 100,
      overallRemainingKm: setup.expectedLifeKm ?? 35000,
      healthStatus: 'EXCELLENT',
      confidenceScore: 10,
      confidenceLabel: 'Low',
      worstTirePosition: null,
      worstTirePercent: null,
      activeSetupName: setup.name ?? setup.brandModelFront ?? 'Active Set',
      activeSetupId: setup.id,
      tireSeason: setup.tireSeason,
      installedAt: setup.installedAt?.toISOString() ?? null,
      totalKmOnSet: 0,
      wearRateMmPer1000km: null,
      alerts: [{ type: 'LOW_CONFIDENCE', code: 'TIRE_LOW_CONFIDENCE', severity: 'info', message: 'New tire setup — no wear data yet. Measurement recommended.' }],
      tireCondition: setup.tireCondition ?? 'UNKNOWN',
      tireArchetype: null,
      tireSpecMatched: false,
      tireSpecConfidence: null,
      dataCompletenessConfidence: null,
      modelConfidence: null,
      referenceNewTreadSource: null,
      replacementThresholdSource: null,
      currentTreadSource: null,
      currentTreadValue: measuredTreadMm,
      currentTreadEvidenceSource: setup.initialTreadEvidenceSource ?? null,
      ...resolveSummaryProvenanceFlags(setup.initialTreadEvidenceSource),
      lastActualMeasurementAt: latestMeasurement?.measuredAt?.toISOString() ?? null,
      baselineSource: setup.initialTreadEvidenceSource ?? null,
      operationalReplacementMm: null,
      topWearDrivers: [],
      actionState: 'CHECK_SOON' as TireActionState,
      actionReasons: ['No calibrated wear baseline yet. Record first tread measurement.'],
      measurementState: 'estimated' as const,
      dataQualityWarnings: ['No tire wear baseline measurement available.'],
      pressureContext: resolvedPressure,
      recommendedPressure: resolvedPressure.recommendedPressure,
      pressureSpecMissingLabel: resolvedPressure.pressureSpecMissingLabel,
      latestMeasurementAt: latestMeasurement?.measuredAt?.toISOString() ?? null,

      // ── Canonical read model ──
      overallStatus,
      displayMode: (measuredTreadMm != null ? 'MEASURED' : 'UNKNOWN') as TireDisplayMode,
      confidence: (measuredTreadMm != null ? 'LOW' : 'UNKNOWN') as TireConfidenceLevel,
      lowestTreadMm: measuredTreadMm,
      lowestTreadPosition: null,
      measuredTreadMm,
      estimatedTreadMm: null,
      displayTreadMm: measuredTreadMm,
      lastMeasurementAt: latestMeasurement?.measuredAt?.toISOString() ?? null,
      measurementAgeDays,
      estimatedRemainingKm: null,
      pressureStatus,
      seasonStatus: seasonResult.status,
      unevenWearStatus: 'UNKNOWN' as TireStatus,
      recommendations,
      predictionCapable: isPredictionCapable(setup.odometerAnchorStatus),
      odometerAnchorStatus: setup.odometerAnchorStatus ?? null,
      odometerAnchorConfidence: setup.odometerAnchorConfidence ?? null,
      installedOdometerSource: setup.installedOdometerSource ?? null,
      ...inventoryFlags,
    } satisfies TireHealthSummaryForPresentation;

    return {
      ...summaryCore,
      dimoContext: resolvedDimo,
      evidencePresentation: buildTireEvidencePresentation({
        summary: summaryCore,
        modelCalculatedAt: setup.lastRecalculatedAt?.toISOString() ?? null,
      }),
    };
  }
}
