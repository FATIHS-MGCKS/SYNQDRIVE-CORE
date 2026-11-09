import type { DbiP2c3ReconciliationDiagnosticCodeV1 } from './dbi-p2c3-reconciliation.contract.v1';
import { validateParticipantRequiredAdapterFields } from './dbi-p2c3-reconciliation.bundle-required-fields.v1';

const MAX_CANDIDATES_PER_PLANE = 4096;
const MAX_EPISODES = 4096;
const MAX_REASON_CODE_ENTRIES = 512;
const MAX_STRING_FIELD_LENGTH = 2048;

const CORE_IDENTITY_KEYS = ['organizationId', 'vehicleId', 'tripId', 'providerSourceLinkId'] as const;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function boundedString(value: unknown): value is string {
  return typeof value === 'string' && value.length <= MAX_STRING_FIELD_LENGTH;
}

function isStringArray(value: unknown, maxLen: number): boolean {
  if (!Array.isArray(value)) return false;
  if (value.length > maxLen) return false;
  return value.every((entry) => typeof entry === 'string' && entry.length <= MAX_STRING_FIELD_LENGTH);
}

function push(codes: DbiP2c3ReconciliationDiagnosticCodeV1[], code: DbiP2c3ReconciliationDiagnosticCodeV1): void {
  codes.push(code);
}

function validateParticipantIdentity(identity: unknown, codes: DbiP2c3ReconciliationDiagnosticCodeV1[]): void {
  if (!isPlainObject(identity)) {
    push(codes, 'BUNDLE_NESTED_SHAPE_INVALID');
    return;
  }
  for (const key of CORE_IDENTITY_KEYS) {
    if (!boundedString(identity[key])) {
      push(codes, 'BUNDLE_NESTED_SHAPE_INVALID');
    }
  }
  if ('v1bInputFingerprint' in identity && identity.v1bInputFingerprint !== null) {
    if (!boundedString(identity.v1bInputFingerprint) && identity.v1bInputFingerprint !== 'NOT_REPORTED') {
      push(codes, 'BUNDLE_NESTED_SHAPE_INVALID');
    }
  }
  if ('multichannelFingerprint' in identity) {
    const mc = identity.multichannelFingerprint;
    if (mc !== null && mc !== 'NOT_REPORTED' && !boundedString(mc)) {
      push(codes, 'BUNDLE_NESTED_SHAPE_INVALID');
    }
  }
  if ('sourceBundleId' in identity && identity.sourceBundleId !== null && !boundedString(identity.sourceBundleId)) {
    push(codes, 'BUNDLE_NESTED_SHAPE_INVALID');
  }
}

function validateParticipantHeader(participant: unknown, codes: DbiP2c3ReconciliationDiagnosticCodeV1[]): void {
  if (!isPlainObject(participant)) {
    push(codes, 'BUNDLE_NESTED_SHAPE_INVALID');
    return;
  }
  if (!boundedString(participant.sourceModule)) {
    push(codes, 'BUNDLE_NESTED_SHAPE_INVALID');
  }
  if (!boundedString(participant.originalKernelStatus)) {
    push(codes, 'BUNDLE_NESTED_SHAPE_INVALID');
  }
  validateParticipantIdentity(participant.identity, codes);
  validateParticipantRequiredAdapterFields(participant, codes);
}

function validateCandidateEnvelope(cand: unknown, codes: DbiP2c3ReconciliationDiagnosticCodeV1[]): void {
  if (cand === null || cand === undefined) {
    push(codes, 'BUNDLE_NESTED_SHAPE_INVALID');
    return;
  }
  if (!isPlainObject(cand)) {
    push(codes, 'BUNDLE_NESTED_SHAPE_INVALID');
    return;
  }
  if (!boundedString(cand.sourceModule)) push(codes, 'BUNDLE_NESTED_SHAPE_INVALID');
  if (!boundedString(cand.sourceEpisodeKey)) push(codes, 'BUNDLE_NESTED_SHAPE_INVALID');
  if (!boundedString(cand.originalClassification)) push(codes, 'BUNDLE_NESTED_SHAPE_INVALID');
  if (!isPlainObject(cand.originalCandidate)) push(codes, 'BUNDLE_NESTED_SHAPE_INVALID');
  if (isPlainObject(cand.originalCandidate) && 'limitationCodes' in cand.originalCandidate) {
    if (!isStringArray((cand.originalCandidate as Record<string, unknown>).limitationCodes, MAX_REASON_CODE_ENTRIES)) {
      push(codes, 'BUNDLE_NESTED_SHAPE_INVALID');
    }
  }
}

function validatePowertrainPlane(plane: unknown, codes: DbiP2c3ReconciliationDiagnosticCodeV1[]): void {
  if (!isPlainObject(plane)) {
    push(codes, 'BUNDLE_NESTED_SHAPE_INVALID');
    return;
  }
  if (plane.participant === null || plane.participant === undefined) {
    push(codes, 'MISSING_PARTICIPANT_HEADER');
    return;
  }
  validateParticipantHeader(plane.participant, codes);
  if (!Array.isArray(plane.candidates)) {
    push(codes, 'BUNDLE_NESTED_SHAPE_INVALID');
    return;
  }
  if (plane.candidates.length > MAX_CANDIDATES_PER_PLANE) {
    push(codes, 'BUNDLE_NESTED_SHAPE_INVALID');
    return;
  }
  for (const cand of plane.candidates) {
    validateCandidateEnvelope(cand, codes);
  }
}

function validateDescriptivePlane(descriptive: unknown, codes: DbiP2c3ReconciliationDiagnosticCodeV1[]): void {
  if (!isPlainObject(descriptive)) {
    push(codes, 'BUNDLE_NESTED_SHAPE_INVALID');
    return;
  }
  if (descriptive.participant === null || descriptive.participant === undefined) {
    push(codes, 'MISSING_PARTICIPANT_HEADER');
    return;
  }
  validateParticipantHeader(descriptive.participant, codes);
  if (!Array.isArray(descriptive.episodes)) {
    push(codes, 'BUNDLE_NESTED_SHAPE_INVALID');
    return;
  }
  if (descriptive.episodes.length > MAX_EPISODES) {
    push(codes, 'BUNDLE_NESTED_SHAPE_INVALID');
  }
}

export function validateBundleInputShape(input: unknown): readonly DbiP2c3ReconciliationDiagnosticCodeV1[] {
  const codes: DbiP2c3ReconciliationDiagnosticCodeV1[] = [];
  if (!isPlainObject(input)) {
    return ['BUNDLE_INPUT_SHAPE_INVALID'];
  }
  if (typeof input.contractVersion !== 'string') {
    codes.push('BUNDLE_INPUT_SHAPE_INVALID');
  }
  if (!('powertrainProxies' in input) || !Array.isArray(input.powertrainProxies)) {
    codes.push('BUNDLE_INPUT_SHAPE_INVALID');
    return [...new Set(codes)];
  }
  if ('descriptive' in input && input.descriptive !== null && input.descriptive !== undefined) {
    if (!isPlainObject(input.descriptive)) {
      codes.push('BUNDLE_INPUT_SHAPE_INVALID');
    } else {
      validateDescriptivePlane(input.descriptive, codes);
    }
  }
  for (const plane of input.powertrainProxies) {
    if (!isPlainObject(plane)) {
      codes.push('BUNDLE_INPUT_SHAPE_INVALID');
      continue;
    }
    validatePowertrainPlane(plane, codes);
  }
  return [...new Set(codes)].sort();
}
