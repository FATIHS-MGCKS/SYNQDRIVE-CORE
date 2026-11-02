import { createHash } from 'crypto';
import {
  computeC4AdaptiveL3,
  computeC5_1GatedRepair,
  withImplausibleLegEndpointsQuarantined,
  applyMotionEventUniversalPlausibility,
  applyMotionEventIntensityEvidenceGatesV1,
  detectMotionManoeuvreEvents,
  extractMotionFsmStopEpisodes,
  MOTION_CORE_C4_FULL_FINALIZATION_HORIZON_FORWARD_S,
  MOTION_CORE_C4_INPUT_HORIZON_FORWARD_S,
  MOTION_CORE_EVENT_GUARDS_V0_1_DEV,
  MOTION_CORE_SPEED_C4_VERSION,
  MOTION_CORE_SPEED_C5_1_PRODUCTION_SAFETY_VERSION,
  MOTION_CORE_SPEED_C5_1_VERSION,
  MOTION_EVENT_PLAUSIBILITY_UNIVERSAL_V0_2,
  MOTION_EVENT_V0_3_CANDIDATE_OPTIONS,
  MOTION_FSM_PARAMS_V0_2_DEV,
  MOTION_FSM_V0_3_CANDIDATE_OPTIONS,
  MOTION_FSM_V0_4_GAP_BRIDGE_OPTIONS,
  motionCoreSpeedC5_1AlgorithmFileSha256,
  motionEventVersionId,
  motionFsmVersionId,
  runMotionFsm,
  type C5_1GatedRepairSample,
  type C5_1VehicleClass,
  type MotionCoreSpeedSample,
  type MotionFsmMode,
} from '../core';
import type { DiV0S4ParsedEvidenceContainer } from '../s4a-foundation/di-v0-s4a-evidence-container-parse';
import type { DiV0S4SourceFamily } from '../s4a-foundation/di-v0-s4a-contract';
import { resolveMotionCoreShadowBundleVersion } from './di-v0-motion-core-shadow.bundle.version';
import { DI_V0_MOTION_CORE_C5_1_KNOWN_OFFLINE_LIMITATIONS } from './di-v0-motion-core-c5-1-known-limitations';
import {
  adaptMotionCoreShadowEvidenceFromParsedContainer,
  type DiV0MotionCoreShadowEvidenceAdaptation,
} from './di-v0-motion-core-shadow-evidence.adapter';
import { buildMotionCoreShadowIntentKey } from './di-v0-motion-core-shadow-intent';
import type {
  DiV0MotionCoreShadowPayloadV1,
  DiV0MotionCoreShadowPersistedRepairRow,
  DiV0MotionCoreShadowPersistedSpeedRow,
  DiV0MotionCoreShadowProcessingMode,
  DiV0MotionCoreShadowSummaryJson,
} from './di-v0-motion-core-shadow.types';
import { mapMotionManoeuvreEventToPersisted as mapEvent } from './di-v0-motion-core-shadow.types';
import { DI_V0_MOTION_CORE_SHADOW_PERSISTENCE_CONTRACT_V2 } from './di-v0-motion-core-shadow-event-row.contract';
import { motionFsmSparseVehicleSpeedFromR1 } from '../r1-obd-acquisition/di-v0-r1-vehicle-speed-ds4-boundary';
import { MOTION_FSM_GAP_BRIDGE_V1_VERSION } from '../core/kinematics/motion-fsm-gap-bridge-v1';
import type { MotionFsmGapBridgeAuxiliary } from '../core/kinematics/motion-fsm-gap-bridge-v1';
import type { DiV0VersionTuple } from '../core/versions';

export const DI_V0_MOTION_CORE_SHADOW_DEFAULT_FSM_MODE: MotionFsmMode = 'RETROSPECTIVE';
export const DI_V0_MOTION_CORE_SHADOW_PROCESSING_MODE: DiV0MotionCoreShadowProcessingMode =
  'POST_TRIP_RETROSPECTIVE';

export type DiV0MotionCoreShadowProcessInput = {
  parsed: DiV0S4ParsedEvidenceContainer;
  sourceFamily: DiV0S4SourceFamily;
  pinnedSnapshotHash: string;
  combinedInputIdentity: string;
  computedAt?: Date;
  c5_1PreferredSpeedEnabled?: boolean;
  fsmGapBridgeV1Enabled?: boolean;
  gapBridgeAuxiliary?: MotionFsmGapBridgeAuxiliary;
  gapBridgeAuxBindingVersions?: DiV0VersionTuple;
  vehiclePlausibilityClass?: C5_1VehicleClass;
};

export type DiV0MotionCoreShadowProcessResult = {
  intentKey: string;
  payload: DiV0MotionCoreShadowPayloadV1;
  summary: DiV0MotionCoreShadowSummaryJson;
  payloadFingerprint: string;
};

function fingerprintPayload(payload: DiV0MotionCoreShadowPayloadV1): string {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

function mapC4SpeedRow(s: MotionCoreSpeedSample): DiV0MotionCoreShadowPersistedSpeedRow {
  return {
    bucketLabelUtc: s.label,
    speedKmh: s.valueKmh,
    quality: s.quality,
    support: s.supportLabels ?? [],
    estimator: s.estimator,
    flags: s.flags ?? [],
  };
}

function mapPreferredFromC5Sample(s: C5_1GatedRepairSample): DiV0MotionCoreShadowPersistedSpeedRow {
  return {
    bucketLabelUtc: s.label,
    speedKmh: s.valueKmh,
    quality: s.quality,
    support: s.supportLabels ?? [],
    estimator: s.estimator,
    flags: s.flags ?? [],
  };
}

function buildRepairRows(c5Samples: C5_1GatedRepairSample[], c4: MotionCoreSpeedSample[]): DiV0MotionCoreShadowPersistedRepairRow[] {
  const c4By = new Map(c4.map((s) => [s.label, s]));
  return c5Samples.map((s) => {
    const c4s = c4By.get(s.label);
    const trace = s.trace as {
      q5Evidence?: string | null;
      q6Evidence?: string | null;
      q5Detail?: { reason?: string; evidenceReason?: string };
    } | undefined;
    const rejectionReason =
      s.repairState === 'REPAIR_REJECTED'
        ? trace?.q5Detail?.reason ?? trace?.q5Detail?.evidenceReason ?? 'repair_rejected'
        : null;
    return {
      bucketLabelUtc: s.label,
      repairState: s.repairState,
      c4SpeedKmh: c4s?.valueKmh ?? null,
      c4Quality: c4s?.quality ?? 'NO_POSITION',
      preferredSpeedKmh: s.valueKmh,
      preferredQuality: s.quality,
      rejectionReason,
      q5Evidence: trace?.q5Evidence ?? null,
      q6Evidence: trace?.q6Evidence ?? null,
    };
  });
}

/**
 * Pure post-trip motion-core shadow computation (Fable review recommended stack).
 * Does not read or mutate production shadow intervals.
 */
export function processDiV0MotionCoreShadowFromEvidenceAdaptation(
  evidence: DiV0MotionCoreShadowEvidenceAdaptation,
  meta: {
    pinnedSnapshotHash: string;
    combinedInputIdentity: string;
    computedAt?: Date;
    c5_1PreferredSpeedEnabled?: boolean;
    fsmGapBridgeV1Enabled?: boolean;
    gapBridgeAuxiliary?: MotionFsmGapBridgeAuxiliary;
    gapBridgeAuxBindingVersions?: DiV0VersionTuple;
    vehiclePlausibilityClass?: C5_1VehicleClass;
  },
): DiV0MotionCoreShadowProcessResult {
  const computedAt = meta.computedAt ?? new Date();
  const c5_1PreferredSpeedEnabled = meta.c5_1PreferredSpeedEnabled === true;
  const fsmGapBridgeV1Enabled = meta.fsmGapBridgeV1Enabled === true;
  const bundleVersion = resolveMotionCoreShadowBundleVersion({
    c5_1PreferredSpeedEnabled,
    fsmGapBridgeV1Enabled,
  });
  const kinBuckets = withImplausibleLegEndpointsQuarantined(evidence.buckets);
  const c4 = computeC4AdaptiveL3(evidence.buckets);
  const c4SpeedRows = c4.map(mapC4SpeedRow);

  let preferredSpeedSamples: MotionCoreSpeedSample[] = c4;
  let c5RepairRows: DiV0MotionCoreShadowPersistedRepairRow[] | undefined;
  if (c5_1PreferredSpeedEnabled) {
    const c5 = computeC5_1GatedRepair(evidence.buckets, {
      vehicleClass: meta.vehiclePlausibilityClass ?? 'TESLA',
    });
    preferredSpeedSamples = c5.samples;
    c5RepairRows = buildRepairRows(c5.samples, c4);
  }

  const sparseArg = motionFsmSparseVehicleSpeedFromR1(evidence.sparseSpeed, evidence.sparseComparable);
  const fsmOptions = fsmGapBridgeV1Enabled
    ? MOTION_FSM_V0_4_GAP_BRIDGE_OPTIONS
    : MOTION_FSM_V0_3_CANDIDATE_OPTIONS;
  const gapBridgeAuxiliary = fsmGapBridgeV1Enabled
    ? (meta.gapBridgeAuxiliary ?? { stationarySupportedLabels: new Set<string>() })
    : undefined;
  const fsmLabels = runMotionFsm(
    kinBuckets,
    c4,
    DI_V0_MOTION_CORE_SHADOW_DEFAULT_FSM_MODE,
    sparseArg,
    MOTION_FSM_PARAMS_V0_2_DEV,
    fsmOptions,
    gapBridgeAuxiliary,
  );
  const stopEpisodes = extractMotionFsmStopEpisodes(
    0,
    fsmLabels,
    DI_V0_MOTION_CORE_SHADOW_DEFAULT_FSM_MODE,
  );
  const eventSpeedSeries = c5_1PreferredSpeedEnabled ? preferredSpeedSamples : c4;
  const eventEstimator = c5_1PreferredSpeedEnabled ? MOTION_CORE_SPEED_C5_1_VERSION : 'C4_ADAPTIVE_L3';
  const events = detectMotionManoeuvreEvents(
    0,
    eventSpeedSeries,
    eventEstimator,
    MOTION_CORE_EVENT_GUARDS_V0_1_DEV.usableQualities,
    MOTION_EVENT_V0_3_CANDIDATE_OPTIONS,
  );
  applyMotionEventUniversalPlausibility(events);
  applyMotionEventIntensityEvidenceGatesV1(events, eventSpeedSeries, {
    c51RepairEvidence: c5RepairRows?.map((row) => ({
      bucketLabelUtc: row.bucketLabelUtc,
      q5Evidence: row.q5Evidence,
      q6Evidence: row.q6Evidence,
    })),
  });

  const intentKey = buildMotionCoreShadowIntentKey({
    pinnedSnapshotHash: meta.pinnedSnapshotHash,
    combinedInputIdentity: meta.combinedInputIdentity,
    bundleVersion,
  });

  const fsmVersion = motionFsmVersionId(fsmOptions);
  const auxBinding = fsmGapBridgeV1Enabled && meta.gapBridgeAuxBindingVersions
    ? {
        structuralVersion: meta.gapBridgeAuxBindingVersions.structuralVersion,
        estimatorVersion: meta.gapBridgeAuxBindingVersions.estimatorVersion,
        calibrationVersion: meta.gapBridgeAuxBindingVersions.calibrationVersion,
        sourceFamilyPolicyVersion: meta.gapBridgeAuxBindingVersions.sourceFamilyPolicyVersion,
      }
    : null;
  const eventVersion = `${motionEventVersionId(MOTION_EVENT_V0_3_CANDIDATE_OPTIONS)} + ${MOTION_EVENT_PLAUSIBILITY_UNIVERSAL_V0_2}`;
  const preferredRows = c5_1PreferredSpeedEnabled
    ? preferredSpeedSamples.map(mapPreferredFromC5Sample)
    : c4SpeedRows;

  const payload: DiV0MotionCoreShadowPayloadV1 = {
    contract: {
      algorithmVersions: {
        c4: MOTION_CORE_SPEED_C4_VERSION,
        c5_1: c5_1PreferredSpeedEnabled ? MOTION_CORE_SPEED_C5_1_VERSION : null,
        c5_1ProductionSafety: c5_1PreferredSpeedEnabled ? MOTION_CORE_SPEED_C5_1_PRODUCTION_SAFETY_VERSION : null,
        c5_1AlgorithmFileSha256: c5_1PreferredSpeedEnabled ? motionCoreSpeedC5_1AlgorithmFileSha256() : null,
        fsm: fsmVersion,
        gapBridgeV1: fsmGapBridgeV1Enabled ? MOTION_FSM_GAP_BRIDGE_V1_VERSION : null,
        fsmAuxBinding: auxBinding,
        events: eventVersion,
        bundle: bundleVersion,
      },
      speedAuthority: c5_1PreferredSpeedEnabled ? 'C5_1_PREFERRED' : 'C4_ONLY',
      persistence: DI_V0_MOTION_CORE_SHADOW_PERSISTENCE_CONTRACT_V2,
      knownLimitations: c5_1PreferredSpeedEnabled ? [...DI_V0_MOTION_CORE_C5_1_KNOWN_OFFLINE_LIMITATIONS] : undefined,
      timeSemantics: {
        processingMode: DI_V0_MOTION_CORE_SHADOW_PROCESSING_MODE,
        c4ValueSupportForwardS: MOTION_CORE_C4_INPUT_HORIZON_FORWARD_S,
        c4FullFinalizationForwardS: MOTION_CORE_C4_FULL_FINALIZATION_HORIZON_FORWARD_S,
        fsmMode: DI_V0_MOTION_CORE_SHADOW_DEFAULT_FSM_MODE,
        eventFinalizationNote:
          'Post-trip batch; event detector is retrospective; K3 may add up to 2s within-segment finalization.',
        computedAtUtc: computedAt.toISOString(),
      },
      sparse: {
        channelOutcome: evidence.sparseChannelOutcome,
        comparable: evidence.sparseComparable,
        sampleCount: evidence.sparsePersisted.length,
        samples: evidence.sparsePersisted,
        limitations: evidence.limitations,
      },
      comparisonHints: {
        artefactSuspectExcludedFromAcceptedManoeuvreCounts: true,
        inferredNeverPromotedToDirect: true,
        unknownNotCountedAsConfirmedStandstill: true,
      },
    },
    speeds: preferredRows,
    c4Speeds: c5_1PreferredSpeedEnabled ? c4SpeedRows : undefined,
    speedRepairs: c5RepairRows,
    fsmLabels: fsmLabels.map((l) => ({
      bucketLabelUtc: l.label,
      state: l.state,
      evidenceQuality: l.evidenceQuality,
      reason: l.reason,
      flags: l.flags ?? [],
    })),
    stopEpisodes,
    events: events.map(mapEvent),
    summary: {
      labelCount: fsmLabels.length,
      speedNumericCount: preferredRows.filter((s) => s.speedKmh != null).length,
      eventCount: events.length,
      eventAcceptedCount: events.filter((e) => e.quality !== 'ARTEFACT_SUSPECT').length,
      eventArtefactSuspectCount: events.filter((e) => e.quality === 'ARTEFACT_SUSPECT').length,
      stopEpisodeCount: stopEpisodes.length,
    },
  };

  const payloadFingerprint = fingerprintPayload(payload);
  const summary: DiV0MotionCoreShadowSummaryJson = {
    bundleVersion,
    intentKey,
    processingMode: DI_V0_MOTION_CORE_SHADOW_PROCESSING_MODE,
    sparseComparable: evidence.sparseComparable,
    limitations: evidence.limitations,
    labelCount: payload.summary.labelCount,
    eventAcceptedCount: payload.summary.eventAcceptedCount,
    eventArtefactSuspectCount: payload.summary.eventArtefactSuspectCount,
    contentFingerprint: payloadFingerprint,
    eventRowContract: DI_V0_MOTION_CORE_SHADOW_PERSISTENCE_CONTRACT_V2.eventRowContract,
  };

  return { intentKey, payload, summary, payloadFingerprint };
}

export function processDiV0MotionCoreShadowTrip(input: DiV0MotionCoreShadowProcessInput): DiV0MotionCoreShadowProcessResult {
  const evidence = adaptMotionCoreShadowEvidenceFromParsedContainer(input.parsed, input.sourceFamily);
  return processDiV0MotionCoreShadowFromEvidenceAdaptation(evidence, {
    pinnedSnapshotHash: input.pinnedSnapshotHash,
    combinedInputIdentity: input.combinedInputIdentity,
    computedAt: input.computedAt,
    c5_1PreferredSpeedEnabled: input.c5_1PreferredSpeedEnabled,
    fsmGapBridgeV1Enabled: input.fsmGapBridgeV1Enabled,
    gapBridgeAuxiliary: input.gapBridgeAuxiliary,
    gapBridgeAuxBindingVersions: input.gapBridgeAuxBindingVersions,
    vehiclePlausibilityClass: input.vehiclePlausibilityClass,
  });
}
