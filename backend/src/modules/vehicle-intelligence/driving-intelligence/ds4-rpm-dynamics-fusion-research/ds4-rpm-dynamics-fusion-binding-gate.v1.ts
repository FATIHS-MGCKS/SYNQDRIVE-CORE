import {
  hasUncertainHistoricalObdRecordTime,
  resolveTelemetrySourceFamily,
} from '../../telemetry-source-family';
import { computeDs4RpmHfV1bTierAwareInputFingerprint } from '../rpm-hf-v1b/ds4-rpm-hf-v1b-input-fingerprint';
import type { Ds4RpmDynamicsResearchInputV1 } from '../ds4-rpm-dynamics-research/ds4-rpm-dynamics-research.contract.v1';
import type { DiV0MotionCoreShadowPayloadV1 } from '../motion-core-shadow-worker/di-v0-motion-core-shadow.types';
import type { Ds4RpmShadowCorrelationProvenanceGateV1 } from '../ds4-rpm-shadow-correlation/ds4-rpm-shadow-correlation-provenance-gate.v1';
import { validateRpmSampleSourceFamilyAuthority } from '../ds4-rpm-shadow-correlation/ds4-rpm-shadow-correlation-source-family-gate.v1';
import type {
  Ds4RpmShadowCorrelationEvidenceKind,
  Ds4RpmShadowCorrelationInputV1,
  Ds4RpmShadowCorrelationReasonCode,
} from '../ds4-rpm-shadow-correlation/ds4-rpm-shadow-correlation-v1.contract';
import type { Ds4RpmDynamicsFusionResearchReasonCode } from './ds4-rpm-dynamics-fusion-research.contract.v1';

export type Ds4RpmDynamicsFusionBindingGateInputV1 = {
  evidenceKind: Ds4RpmShadowCorrelationEvidenceKind;
  provenanceGate: Ds4RpmShadowCorrelationProvenanceGateV1;
  correlation: Ds4RpmShadowCorrelationInputV1;
  dynamicsInput: Ds4RpmDynamicsResearchInputV1;
  motionPayload: DiV0MotionCoreShadowPayloadV1;
};

export type Ds4RpmDynamicsFusionBindingGateResultV1 =
  | { ok: true; recomputedV1bInputFingerprint: string; dimoTelemetrySourceFamily: ReturnType<typeof resolveTelemetrySourceFamily> }
  | { ok: false; reasonCodes: Ds4RpmDynamicsFusionResearchReasonCode[]; recomputedV1bInputFingerprint: string };

function rpmPointsEqual(
  a: ReadonlyArray<{ recordedAtIso: string; valueRpm: number }>,
  b: ReadonlyArray<{ recordedAtIso: string; valueRpm: number }>,
): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i]!.recordedAtIso !== b[i]!.recordedAtIso || a[i]!.valueRpm !== b[i]!.valueRpm) {
      return false;
    }
  }
  return true;
}

function motionEventsConsistent(
  correlationEvents: Ds4RpmShadowCorrelationInputV1['events'],
  payloadEvents: DiV0MotionCoreShadowPayloadV1['events'],
): boolean {
  if (correlationEvents.length !== payloadEvents.length) return false;
  for (let i = 0; i < correlationEvents.length; i += 1) {
    const a = correlationEvents[i]!;
    const b = payloadEvents[i]!;
    if (
      a.kind !== b.kind ||
      a.startLabel !== b.startLabel ||
      a.endLabel !== b.endLabel ||
      a.quality !== b.quality ||
      JSON.stringify(a.flags) !== JSON.stringify(b.flags)
    ) {
      return false;
    }
  }
  return true;
}

function pushUnique(
  codes: Ds4RpmDynamicsFusionResearchReasonCode[],
  ...next: Array<Ds4RpmShadowCorrelationReasonCode | Ds4RpmDynamicsFusionResearchReasonCode>
): void {
  for (const c of next) {
    if (!codes.includes(c as Ds4RpmDynamicsFusionResearchReasonCode)) {
      codes.push(c as Ds4RpmDynamicsFusionResearchReasonCode);
    }
  }
}

export function validateDs4RpmDynamicsFusionBindingGate(
  input: Ds4RpmDynamicsFusionBindingGateInputV1,
): Ds4RpmDynamicsFusionBindingGateResultV1 {
  const reasonCodes: Ds4RpmDynamicsFusionResearchReasonCode[] = [];
  const recomputedV1bInputFingerprint = computeDs4RpmHfV1bTierAwareInputFingerprint(
    input.dynamicsInput.tripInput,
  );

  const dimoFamily = resolveTelemetrySourceFamily(input.dynamicsInput.dimoVehicleRawJson);

  if (input.evidenceKind !== input.provenanceGate.evidenceKind) {
    pushUnique(reasonCodes, 'FUSION_PROVENANCE_EVIDENCE_KIND_MISMATCH');
  }

  if (
    input.evidenceKind === 'REAL_OBSERVATION' &&
    input.provenanceGate.evidenceKind === 'SYNTHETIC_FIXTURE'
  ) {
    pushUnique(reasonCodes, 'FUSION_SYNTHETIC_GATE_REJECTS_REAL_OBSERVATION');
  }

  const expectedOrigin =
    input.evidenceKind === 'SYNTHETIC_FIXTURE' ? 'SYNTHETIC_FIXTURE' : 'OFFLINE_SEALED_BUNDLE';
  if (input.dynamicsInput.evidenceOrigin !== expectedOrigin) {
    pushUnique(reasonCodes, 'FUSION_EVIDENCE_ORIGIN_INCOMPATIBLE');
  }

  if (hasUncertainHistoricalObdRecordTime(dimoFamily)) {
    pushUnique(reasonCodes, 'R1_HISTORICAL_OBD_POINT_TIME_CORRELATION_PROHIBITED');
  }

  const sampleFamily = input.correlation.rpmSamples?.telemetrySourceFamily ?? null;
  if (dimoFamily !== 'UNKNOWN' && sampleFamily != null && sampleFamily !== dimoFamily) {
    pushUnique(reasonCodes, 'TELEMETRY_SOURCE_FAMILY_CONTRADICTS_DIMO_IDENTITY');
  }
  if (sampleFamily != null && hasUncertainHistoricalObdRecordTime(sampleFamily)) {
    pushUnique(reasonCodes, 'R1_HISTORICAL_OBD_POINT_TIME_CORRELATION_PROHIBITED');
  }

  pushUnique(
    reasonCodes,
    ...validateRpmSampleSourceFamilyAuthority({
      evidenceKind: input.evidenceKind,
      rpmSamples: input.correlation.rpmSamples,
    }),
  );

  if (dimoFamily === 'UNKNOWN') {
    pushUnique(reasonCodes, 'TELEMETRY_SOURCE_FAMILY_UNKNOWN');
  }

  if (input.dynamicsInput.organizationId !== input.correlation.organizationId) {
    pushUnique(reasonCodes, 'TENANCY_MISMATCH');
  }
  if (input.dynamicsInput.vehicleId !== input.correlation.vehicleId) {
    pushUnique(reasonCodes, 'TENANCY_MISMATCH');
  }
  if (input.dynamicsInput.tripId !== input.correlation.tripId) {
    pushUnique(reasonCodes, 'TRIP_ID_MISMATCH');
  }
  if (
    input.dynamicsInput.providerSourceLinkId !== '' &&
    input.correlation.rpmSamples?.providerSourceLinkId != null &&
    input.dynamicsInput.providerSourceLinkId !== input.correlation.rpmSamples.providerSourceLinkId
  ) {
    pushUnique(reasonCodes, 'SOURCE_LINK_MISMATCH');
  }

  if (input.provenanceGate.recomputedV1bInputFingerprint !== recomputedV1bInputFingerprint) {
    pushUnique(reasonCodes, 'RPM_SAMPLE_FINGERPRINT_MISMATCH');
  }

  if (
    input.correlation.rpmSamples != null &&
    input.correlation.rpmSamples.inputFingerprint !== recomputedV1bInputFingerprint
  ) {
    pushUnique(reasonCodes, 'RPM_SAMPLE_FINGERPRINT_MISMATCH');
  }

  const tripPoints = input.dynamicsInput.tripInput.rpmPoints.map((p) => ({
    recordedAtIso: p.recordedAtIso,
    valueRpm: p.valueRpm,
  }));

  if (
    input.correlation.rpmSamples != null &&
    !rpmPointsEqual(input.correlation.rpmSamples.points, tripPoints)
  ) {
    pushUnique(reasonCodes, 'RPM_SAMPLE_POINTS_DIGEST_MISMATCH');
  }

  const v1b = input.correlation.v1b;
  const v1bResult = input.dynamicsInput.v1bResult;
  if (v1b != null && v1bResult != null) {
    if (v1b.inputFingerprint !== recomputedV1bInputFingerprint) {
      pushUnique(reasonCodes, 'RPM_SAMPLE_FINGERPRINT_MISMATCH');
    }
    if (v1b.summary.inputFingerprint !== recomputedV1bInputFingerprint) {
      pushUnique(reasonCodes, 'RPM_SAMPLE_FINGERPRINT_MISMATCH');
    }
    if (
      v1bResult.organizationId !== input.correlation.organizationId ||
      v1bResult.vehicleId !== input.correlation.vehicleId ||
      v1bResult.tripId !== input.correlation.tripId
    ) {
      pushUnique(reasonCodes, 'TENANCY_MISMATCH');
    }
    if (v1bResult.tripId !== input.correlation.tripId) {
      pushUnique(reasonCodes, 'TRIP_ID_MISMATCH');
    }
  }

  if (!motionEventsConsistent(input.correlation.events, input.motionPayload.events)) {
    pushUnique(reasonCodes, 'FUSION_MOTION_EVENT_PAYLOAD_MISMATCH');
  }

  if (reasonCodes.length === 0) {
    return { ok: true, recomputedV1bInputFingerprint, dimoTelemetrySourceFamily: dimoFamily };
  }
  return { ok: false, reasonCodes, recomputedV1bInputFingerprint };
}
