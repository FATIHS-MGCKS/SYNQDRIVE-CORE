import { processDiV0MotionCoreShadowFromEvidenceAdaptation } from '../motion-core-shadow-worker/di-v0-motion-core-shadow-processor';
import type { DiV0MotionCoreShadowPayloadV1 } from '../motion-core-shadow-worker/di-v0-motion-core-shadow.types';
import { syntheticDriveEvidence } from '../motion-core-shadow-worker/di-v0-motion-core-shadow-synthetic-drive.harness-fixture';
import { computeDs4RpmHfV1bTierAwareInputFingerprint } from '../rpm-hf-v1b/ds4-rpm-hf-v1b-input-fingerprint';
import type { Ds4RpmHfV1aTripInputV1 } from '../rpm-hf-v1a/ds4-rpm-hf-v1a.contract';
import type { Ds4RpmHfV1bShadowResultV1 } from '../rpm-hf-v1b/ds4-rpm-hf-v1b.contract';
import type {
  Ds4RpmShadowCorrelationEvidenceKind,
  Ds4RpmShadowCorrelationInputV1,
  Ds4RpmShadowCorrelationRpmSampleEvidenceV1,
  Ds4RpmShadowCorrelationTripReportV1,
} from './ds4-rpm-shadow-correlation-v1.contract';
import { joinDs4EventsWithRpmEvidenceV1 } from './ds4-rpm-shadow-correlation-temporal-join.v1';
import { validateDs4RpmShadowCorrelationProvenanceGate } from './ds4-rpm-shadow-correlation-provenance-gate.v1';
import {
  buildDs4RpmShadowCorrelationProvenanceManifest,
  buildDs4RpmShadowCorrelationTripReport,
} from './ds4-rpm-shadow-correlation-report.v1';

export type Ds4RpmShadowCorrelationHarnessExecuteInput = {
  scenarioId: string | null;
  organizationId: string;
  vehicleId: string;
  tripId: string;
  motionRunId: string;
  motionPayload: DiV0MotionCoreShadowPayloadV1;
  tripInput: Ds4RpmHfV1aTripInputV1;
  v1bResult: Ds4RpmHfV1bShadowResultV1 | null;
  v1bInputFingerprint: string;
  v1bRunId: string;
  rpmSamples: Ds4RpmShadowCorrelationRpmSampleEvidenceV1 | null;
  evidenceKind: Ds4RpmShadowCorrelationEvidenceKind;
  codeSha: string;
  generatedAt?: Date;
  omissions?: string[];
  unknowns?: string[];
};

export function buildDefaultSyntheticMotionPayload(scenarioKey = 'default'): {
  payload: DiV0MotionCoreShadowPayloadV1;
  runId: string;
} {
  const processed = processDiV0MotionCoreShadowFromEvidenceAdaptation(syntheticDriveEvidence(), {
    pinnedSnapshotHash: 'synthetic-fixture-motion-pin-unattested',
    combinedInputIdentity: `synthetic-fixture-motion-input:${scenarioKey}`,
  });
  return {
    payload: processed.payload,
    runId: `synthetic-fixture-motion-run:${scenarioKey}`,
  };
}

export function executeDs4RpmShadowCorrelationHarness(
  input: Ds4RpmShadowCorrelationHarnessExecuteInput,
): Ds4RpmShadowCorrelationTripReportV1 {
  const generatedAt = input.generatedAt ?? new Date('2026-11-03T12:00:00.000Z');
  const recomputedFingerprint = computeDs4RpmHfV1bTierAwareInputFingerprint(input.tripInput);

  const persistedSummaryFingerprint = input.v1bResult?.inputFingerprint ?? null;
  const suppliedRunFingerprint = input.v1bInputFingerprint;
  const suppliedSampleFingerprint = input.rpmSamples?.inputFingerprint ?? null;

  const correlationInput: Ds4RpmShadowCorrelationInputV1 = {
    contractVersion: 'ds4-rpm-shadow-correlation-v1',
    organizationId: input.organizationId,
    vehicleId: input.vehicleId,
    tripId: input.tripId,
    motion: {
      runId: input.motionRunId,
      pinnedSnapshotHash: null,
      inputFingerprint: null,
    },
    events: input.motionPayload.events,
    v1b: input.v1bResult
      ? {
          runId: input.v1bRunId,
          engineVersion: input.v1bResult.engineVersion,
          inputFingerprint: suppliedRunFingerprint,
          summary: input.v1bResult,
        }
      : null,
    rpmSamples: input.rpmSamples,
  };

  const provenanceGate = {
    recomputedV1bInputFingerprint: recomputedFingerprint,
    evidenceKind: input.evidenceKind,
    canonicalTripRpmPoints: input.tripInput.rpmPoints.map((p) => ({ ...p })),
  };

  const validation = validateDs4RpmShadowCorrelationProvenanceGate(correlationInput, provenanceGate);

  const joined = joinDs4EventsWithRpmEvidenceV1(correlationInput, {
    payloadForIntensity: input.motionPayload,
    provenanceGate,
  });

  const provenance = buildDs4RpmShadowCorrelationProvenanceManifest({
    codeSha: input.codeSha,
    generatedAt,
    evidenceKind: input.evidenceKind,
    motionRunId: input.motionRunId,
    motionSnapshotHashAttested: null,
    v1bRunId: input.v1bResult ? input.v1bRunId : null,
    v1bInputFingerprint: persistedSummaryFingerprint ?? suppliedRunFingerprint,
    rpmSampleInputFingerprint: suppliedSampleFingerprint,
    rpmSampleSource: input.rpmSamples?.source ?? null,
    v1bEngineVersion: input.v1bResult?.engineVersion ?? null,
    omissions: [
      'V1B_PERSISTENCE_AGGREGATES_ONLY_NO_RAW_IN_DB',
      'MOTION_SNAPSHOT_HASH_NOT_INDEPENDENTLY_ATTESTED_IN_FIXTURE_REPLAY',
      'REFERENCE_ATTACHMENT_UNAVAILABLE',
      ...(input.omissions ?? []),
    ],
    unknowns: [
      ...(validation.ok
        ? []
        : [`PROVENANCE_GATE_FAILED:${validation.reasonCodes.join(',')}`]),
      ...(input.unknowns ?? ['PRODUCTION_MAIN_DRIFT_NOT_EVALUATED_IN_FIXTURE_REPLAY']),
    ],
  });

  return buildDs4RpmShadowCorrelationTripReport({
    organizationId: input.organizationId,
    vehicleId: input.vehicleId,
    tripId: input.tripId,
    scenarioId: input.scenarioId,
    evidenceKind: input.evidenceKind,
    events: joined,
    tripLevelReferenceBand: null,
    referenceAttachmentStatus: 'UNAVAILABLE',
    provenance,
  });
}

/** Documented gap: frozen Audi/Arteon multicadence replay lives in V1B tier fixtures — not expanded here. */
export const DS4_RPM_SHADOW_CORRELATION_DATASET_GAPS = [
  'AUDI_ARTEON_LIVE_COHORT_REPLAY_NOT_IN_HARNESS_V1',
  'VIDEO_GROUND_TRUTH_INDEPENDENT_VALIDATION_NOT_CLAIMED',
] as const;
