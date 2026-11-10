import { resolveTelemetrySourceFamily } from '../../telemetry-source-family';
import { computeDs4RpmDynamicsResearchV1 } from '../ds4-rpm-dynamics-research/ds4-rpm-dynamics-research.kernel.v1';
import type { Ds4RpmDynamicsResearchInputV1 } from '../ds4-rpm-dynamics-research/ds4-rpm-dynamics-research.contract.v1';
import { canonicalizeDs4RpmResearchPoints } from '../ds4-rpm-research-shared/ds4-rpm-research-point-canon.v1';
import { DS4_RPM_REAL_DATA_UNSUPPORTED_SCIENTIFIC_CLAIMS } from '../ds4-rpm-real-data-replay/ds4-rpm-real-data-scientific-claims.v1';
import type { DiV0MotionCoreShadowPayloadV1 } from '../motion-core-shadow-worker/di-v0-motion-core-shadow.types';
import { validateDs4RpmShadowCorrelationProvenanceGate } from '../ds4-rpm-shadow-correlation/ds4-rpm-shadow-correlation-provenance-gate.v1';
import type { Ds4RpmShadowCorrelationProvenanceGateV1 } from '../ds4-rpm-shadow-correlation/ds4-rpm-shadow-correlation-provenance-gate.v1';
import { validateRpmSampleSourceFamilyAuthority } from '../ds4-rpm-shadow-correlation/ds4-rpm-shadow-correlation-source-family-gate.v1';
import type {
  Ds4RpmShadowCorrelationEvidenceKind,
  Ds4RpmShadowCorrelationInputV1,
} from '../ds4-rpm-shadow-correlation/ds4-rpm-shadow-correlation-v1.contract';
import { joinDs4EventsWithRpmEvidenceV1 } from '../ds4-rpm-shadow-correlation/ds4-rpm-shadow-correlation-temporal-join.v1';
import {
  buildDynamicsAlignmentSensitivity,
  filterAdjacentDeltasInHalfOpenWindow,
  summarizeEventLocalDynamics,
} from './ds4-rpm-dynamics-fusion-event-local.v1';
import {
  DS4_RPM_DYNAMICS_FUSION_RESEARCH_CONTRACT_VERSION,
  DS4_RPM_DYNAMICS_FUSION_RESEARCH_KERNEL_VERSION,
  type Ds4RpmDynamicsFusionResearchEventResultV1,
  type Ds4RpmDynamicsFusionResearchReasonCode,
  type Ds4RpmDynamicsFusionResearchResultV1,
} from './ds4-rpm-dynamics-fusion-research.contract.v1';

const SCIENTIFIC_LIMITATION_FLAGS = [
  'SOURCE_TIMESTAMP_PHASE_UNKNOWN',
  'RPM_OBSERVATION_SUPPORT_WIDTH_UNKNOWN',
  'FUSION_LABEL_TIME_HYPOTHESIS_ONLY',
  'NOT_CAUSAL_RPM_RESPONSE_TO_DS4_EVENT',
] as const;

export type Ds4RpmDynamicsFusionResearchInputV1 = {
  contractVersion: typeof DS4_RPM_DYNAMICS_FUSION_RESEARCH_CONTRACT_VERSION;
  evidenceKind: Ds4RpmShadowCorrelationEvidenceKind;
  correlation: Ds4RpmShadowCorrelationInputV1;
  dynamicsInput: Ds4RpmDynamicsResearchInputV1;
  motionPayload: DiV0MotionCoreShadowPayloadV1;
  provenanceGate: Ds4RpmShadowCorrelationProvenanceGateV1;
};

function mapShadowClassification(
  c: string,
): Ds4RpmDynamicsFusionResearchEventResultV1['fusionClassification'] {
  if (c === 'AVAILABLE' || c === 'PARTIAL' || c === 'AMBIGUOUS' || c === 'UNAVAILABLE') return c;
  return 'UNAVAILABLE';
}

function uniqueFusionReasonCodes(
  codes: readonly Ds4RpmDynamicsFusionResearchReasonCode[],
): Ds4RpmDynamicsFusionResearchReasonCode[] {
  return [...new Set(codes)];
}

export function computeDs4RpmDynamicsFusionResearchV1(
  input: Ds4RpmDynamicsFusionResearchInputV1,
): Ds4RpmDynamicsFusionResearchResultV1 {
  const tripReasonCodes: Ds4RpmDynamicsFusionResearchReasonCode[] = [];
  const family = resolveTelemetrySourceFamily(input.dynamicsInput.dimoVehicleRawJson);
  const provenance = validateDs4RpmShadowCorrelationProvenanceGate(
    input.correlation,
    input.provenanceGate,
  );
  if (!provenance.ok) {
    tripReasonCodes.push(...provenance.reasonCodes);
  }
  tripReasonCodes.push(
    ...validateRpmSampleSourceFamilyAuthority({
      evidenceKind: input.evidenceKind,
      rpmSamples: input.correlation.rpmSamples,
    }),
  );
  if (family === 'UNKNOWN') {
    tripReasonCodes.push('TELEMETRY_SOURCE_FAMILY_UNKNOWN');
  }

  const shadowEvents = joinDs4EventsWithRpmEvidenceV1(input.correlation, {
    payloadForIntensity: input.motionPayload,
    provenanceGate: input.provenanceGate,
  });

  const dynamicsResult = computeDs4RpmDynamicsResearchV1(input.dynamicsInput);
  if (dynamicsResult.status === 'ABSTAINED') {
    tripReasonCodes.push('A2_DYNAMICS_ABSTAINED');
  } else if (dynamicsResult.observedDynamics.status !== 'SUPPORTED_DESCRIPTIVE') {
    tripReasonCodes.push('A2_DYNAMICS_NOT_ASSESSABLE');
  }

  const tripBlocked =
    tripReasonCodes.includes('R1_HISTORICAL_OBD_POINT_TIME_CORRELATION_PROHIBITED') ||
    tripReasonCodes.includes('SOURCE_FAMILY_BINDING_UNPROVEN') ||
    tripReasonCodes.includes('TELEMETRY_SOURCE_FAMILY_UNKNOWN') ||
    tripReasonCodes.includes('A2_DYNAMICS_ABSTAINED') ||
    !provenance.ok;

  const canon = canonicalizeDs4RpmResearchPoints(input.dynamicsInput.tripInput.rpmPoints);
  const canonByGlobalIdx = new Map(canon.points.map((p) => [p.globalIdx, p]));

  const unsupportedClaims = [...new Set([...dynamicsResult.unsupportedScientificClaims])];
  if (input.evidenceKind === 'REAL_OBSERVATION') {
    unsupportedClaims.push('UNVERIFIED_EVIDENCE_SOURCE_CLAIM');
  }

  const events: Ds4RpmDynamicsFusionResearchEventResultV1[] = shadowEvents.map((shadow, eventIndex) => {
    const motionRow = input.correlation.events[eventIndex]!;
    const baseReasons: Ds4RpmDynamicsFusionResearchReasonCode[] = [...shadow.reasonCodes];

    if (tripBlocked) {
      return {
        eventIndex,
        motionEvent: {
          kind: motionRow.kind,
          startLabel: motionRow.startLabel,
          endLabel: motionRow.endLabel,
          quality: motionRow.quality,
          flags: motionRow.flags,
        },
        shadowCorrelation: shadow,
        fusionClassification: 'UNAVAILABLE',
        reasonCodes: uniqueFusionReasonCodes([
          ...baseReasons,
          ...tripReasonCodes,
          'FUSION_LABEL_TIME_HYPOTHESIS_ONLY',
        ]),
        eventLocalDynamics: null,
        alignmentHypothesisNote: 'RESEARCH_LABEL_TIME_HYPOTHESIS_NOT_PHYSICAL_SYNC',
        alignmentEnvelope: shadow.alignmentEnvelope,
        dynamicsAlignmentSensitivity: shadow.alignmentEnvelope.offsetSecondsProbed.map((offsetSeconds) => ({
          offsetSeconds,
          admittedPairCountInWindow: 0,
          classification: 'UNAVAILABLE' as const,
          researchDiagnosticOnly: true as const,
        })),
        scientificLimitationFlags: [...SCIENTIFIC_LIMITATION_FLAGS],
      };
    }

    const { windowValid, filtered } = filterAdjacentDeltasInHalfOpenWindow({
      adjacentDeltas: dynamicsResult.observedDynamics.adjacentDeltas,
      canonByGlobalIdx,
      startLabel: motionRow.startLabel,
      endLabel: motionRow.endLabel,
    });

    const eventReasons = [...baseReasons];
    if (!windowValid) {
      eventReasons.push('EVENT_WINDOW_INVALID');
    }
    if (filtered.length === 0 && windowValid) {
      eventReasons.push('NO_ADMITTED_PAIRS_IN_EVENT_WINDOW');
    }
    eventReasons.push('FUSION_LABEL_TIME_HYPOTHESIS_ONLY');

    const eventLocal = summarizeEventLocalDynamics(
      filtered,
      dynamicsResult.observedDynamics.status,
    );

    let fusionClass = mapShadowClassification(shadow.contextClassification);
    if (eventLocal.localAdmittedPairCount === 0) {
      fusionClass = 'UNAVAILABLE';
    } else if (eventLocal.localAdmittedPairCount === 1) {
      fusionClass = fusionClass === 'AVAILABLE' ? 'PARTIAL' : fusionClass;
    }

    const dynamicsAlignmentSensitivity = buildDynamicsAlignmentSensitivity({
      adjacentDeltas: dynamicsResult.observedDynamics.adjacentDeltas,
      canonByGlobalIdx,
      startLabel: motionRow.startLabel,
      endLabel: motionRow.endLabel,
      offsetSecondsProbed: shadow.alignmentEnvelope.offsetSecondsProbed,
    });

    return {
      eventIndex,
      motionEvent: {
        kind: motionRow.kind,
        startLabel: motionRow.startLabel,
        endLabel: motionRow.endLabel,
        quality: motionRow.quality,
        flags: motionRow.flags,
      },
      shadowCorrelation: shadow,
      fusionClassification: fusionClass,
      reasonCodes: uniqueFusionReasonCodes(eventReasons),
      eventLocalDynamics: eventLocal,
      alignmentHypothesisNote: 'RESEARCH_LABEL_TIME_HYPOTHESIS_NOT_PHYSICAL_SYNC',
      alignmentEnvelope: shadow.alignmentEnvelope,
      dynamicsAlignmentSensitivity,
      scientificLimitationFlags: [...SCIENTIFIC_LIMITATION_FLAGS],
    };
  });

  const uniqueTripReasons = uniqueFusionReasonCodes(tripReasonCodes);

  return {
    contractVersion: DS4_RPM_DYNAMICS_FUSION_RESEARCH_CONTRACT_VERSION,
    kernelVersion: DS4_RPM_DYNAMICS_FUSION_RESEARCH_KERNEL_VERSION,
    researchOnly: true,
    evidenceKind: input.evidenceKind,
    organizationId: input.correlation.organizationId,
    vehicleId: input.correlation.vehicleId,
    tripId: input.correlation.tripId,
    providerSourceLinkId: input.correlation.rpmSamples?.providerSourceLinkId ?? null,
    motionRunId: input.correlation.motion.runId,
    v1bInputFingerprint: input.provenanceGate.recomputedV1bInputFingerprint,
    a2ContractVersion: dynamicsResult.contractVersion,
    a2KernelVersion: dynamicsResult.kernelVersion,
    telemetrySourceFamily: family,
    sourceTimestampPhase: 'UNKNOWN',
    rpmObservationSupportWidthSeconds: 'UNKNOWN',
    status: tripBlocked ? 'UNAVAILABLE' : 'COMPUTED',
    tripReasonCodes: uniqueTripReasons,
    dynamicsTripResult: dynamicsResult,
    events,
    scientificGuards: {
      notPhysicalSynchronization: true,
      notCausalRpmResponse: true,
      notGearShiftConfirmation: true,
      notEngineLoadFromRpmAlone: true,
      notMisuseOrScoring: true,
      r1TemporalFusionIneligible: true,
      unknownSourceFamilyUntrusted: true,
    },
    unsupportedScientificClaims: [
      ...new Set([...DS4_RPM_REAL_DATA_UNSUPPORTED_SCIENTIFIC_CLAIMS, ...unsupportedClaims]),
    ],
  };
}
