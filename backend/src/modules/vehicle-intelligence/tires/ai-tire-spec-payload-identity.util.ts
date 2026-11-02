import type { AiTireSpec } from './tire-health.config';
import {
  buildJobAxleIdentityTuple,
  buildSetupAxleIdentityTuples,
  normalizeLoadSpeedIndex,
  normalizeTireSizeForCompare,
  type TireAxleIdentityTuple,
  type TireSetupIdentitySnapshot,
} from './ai-tire-spec-job-binding.util';
import { resolveSpecTireSizeRaw } from './ai-tire-spec-setup-consistency.util';

export interface AiTireSpecPayloadIdentity {
  tireSize: string;
  loadIndex: string;
  speedIndex: string;
}

export interface AiTireSpecApplyGenerationBinding {
  tireSetupId: string;
  setupUpdatedAt: string;
  requestTireSize: string;
  requestLoadIndex: string;
  requestSpeedIndex: string;
}

export type SetupAxleBindingScope = 'setup_wide' | 'front_axle' | 'rear_axle';

export type PayloadIdentityValidationResult =
  | { ok: true; matchedAxleCount: 1; bindingScope: SetupAxleBindingScope }
  | { ok: false; code: string; message: string };

function tuplesEqual(a: TireAxleIdentityTuple, b: TireAxleIdentityTuple): boolean {
  return (
    a.dimension === b.dimension &&
    a.loadIndex === b.loadIndex &&
    a.speedIndex === b.speedIndex
  );
}

function buildPhysicalFrontTuple(
  setup: Pick<
    TireSetupIdentitySnapshot,
    'frontDimension' | 'loadIndexFront' | 'speedIndexFront'
  >,
): TireAxleIdentityTuple | null {
  const dimension = normalizeTireSizeForCompare(setup.frontDimension);
  const loadIndex = normalizeLoadSpeedIndex(setup.loadIndexFront);
  const speedIndex = normalizeLoadSpeedIndex(setup.speedIndexFront);
  if (!dimension || !loadIndex || !speedIndex) return null;
  return { dimension, loadIndex, speedIndex };
}

function buildPhysicalRearTuple(
  setup: Pick<
    TireSetupIdentitySnapshot,
    'rearDimension' | 'loadIndexRear' | 'speedIndexRear'
  >,
): TireAxleIdentityTuple | null {
  const dimension = normalizeTireSizeForCompare(setup.rearDimension);
  const loadIndex = normalizeLoadSpeedIndex(setup.loadIndexRear);
  const speedIndex = normalizeLoadSpeedIndex(setup.speedIndexRear);
  if (!dimension || !loadIndex || !speedIndex) return null;
  return { dimension, loadIndex, speedIndex };
}

/**
 * aiTireSpec is persisted once per VehicleTireSetup (setup-wide JSON).
 * When front and rear axle identities are identical, one AI variant represents the whole set.
 */
export function setupHasUnifiedAxleIdentity(
  setup: Pick<
    TireSetupIdentitySnapshot,
    | 'frontDimension'
    | 'rearDimension'
    | 'loadIndexFront'
    | 'loadIndexRear'
    | 'speedIndexFront'
    | 'speedIndexRear'
  >,
): boolean {
  const front = buildPhysicalFrontTuple(setup);
  const rear = buildPhysicalRearTuple(setup);
  if (!front || !rear) return false;
  return tuplesEqual(front, rear);
}

export function resolvePayloadBindingScope(
  identity: AiTireSpecPayloadIdentity,
  setup: TireSetupIdentitySnapshot,
): SetupAxleBindingScope | null {
  const jobTuple = buildJobAxleIdentityTuple(identity);
  if (!jobTuple) return null;

  const front = buildPhysicalFrontTuple(setup);
  const rear = buildPhysicalRearTuple(setup);
  const frontMatch = front != null && tuplesEqual(front, jobTuple);
  const rearMatch = rear != null && tuplesEqual(rear, jobTuple);

  if (frontMatch && rearMatch) {
    return setupHasUnifiedAxleIdentity(setup) ? 'setup_wide' : null;
  }
  if (frontMatch) return 'front_axle';
  if (rearMatch) return 'rear_axle';
  return null;
}

/** Identity extracted from normalized AI spec payload (never from client-only fields). */
export function extractPayloadIdentityFromSpec(
  spec: AiTireSpec | null,
): AiTireSpecPayloadIdentity | null {
  if (!spec) return null;
  const tireSize = resolveSpecTireSizeRaw(spec);
  const loadIndex = spec.loadIndex?.trim();
  const speedIndex = spec.speedIndex?.trim();
  if (!tireSize || !loadIndex || !speedIndex) return null;
  const tuple = buildJobAxleIdentityTuple({ tireSize, loadIndex, speedIndex });
  if (!tuple) return null;
  return { tireSize, loadIndex, speedIndex };
}

export function countMatchingSetupAxlesForIdentity(
  identity: AiTireSpecPayloadIdentity,
  setup: Pick<
    TireSetupIdentitySnapshot,
    | 'frontDimension'
    | 'rearDimension'
    | 'loadIndexFront'
    | 'loadIndexRear'
    | 'speedIndexFront'
    | 'speedIndexRear'
  >,
): number {
  return countPhysicalAxlesMatchingIdentity(identity, setup);
}

/** Count front and rear axles separately. */
export function countPhysicalAxlesMatchingIdentity(
  identity: AiTireSpecPayloadIdentity,
  setup: Pick<
    TireSetupIdentitySnapshot,
    | 'frontDimension'
    | 'rearDimension'
    | 'loadIndexFront'
    | 'loadIndexRear'
    | 'speedIndexFront'
    | 'speedIndexRear'
  >,
): number {
  const jobTuple = buildJobAxleIdentityTuple(identity);
  if (!jobTuple) return 0;

  let matches = 0;
  const front = buildPhysicalFrontTuple(setup);
  const rear = buildPhysicalRearTuple(setup);
  if (front && tuplesEqual(front, jobTuple)) matches += 1;
  if (rear && tuplesEqual(rear, jobTuple)) matches += 1;
  return matches;
}

/**
 * Validates AI spec payload identity against server setup axles.
 * Setup-wide aiTireSpec: identical front/rear identities allow a single variant for the full set.
 * Staggered setups require an exact single-axle match.
 */
export function validatePayloadIdentityAgainstSetup(
  spec: AiTireSpec,
  setup: TireSetupIdentitySnapshot,
): PayloadIdentityValidationResult {
  const identity = extractPayloadIdentityFromSpec(spec);
  if (!identity) {
    return {
      ok: false,
      code: 'INCOMPLETE_SPEC_IDENTITY',
      message:
        'AI tire spec payload lacks complete size, load index, and speed index identity',
    };
  }

  const setupTuples = buildSetupAxleIdentityTuples(setup);
  if (setupTuples.length === 0) {
    return {
      ok: false,
      code: 'INSUFFICIENT_SETUP_IDENTITY',
      message: 'Tire setup lacks complete axle identity (dimension, load, and speed per axle)',
    };
  }

  const bindingScope = resolvePayloadBindingScope(identity, setup);
  if (!bindingScope) {
    const matchCount = countPhysicalAxlesMatchingIdentity(identity, setup);
    if (matchCount === 0) {
      return {
        ok: false,
        code: 'PAYLOAD_AXLE_IDENTITY_MISMATCH',
        message: 'AI spec identity does not match any complete axle on the tire setup',
      };
    }
    return {
      ok: false,
      code: 'AMBIGUOUS_AXLE_BINDING',
      message:
        'AI spec identity matches conflicting setup axles; staggered setup requires an explicit single-axle match',
    };
  }

  return { ok: true, matchedAxleCount: 1, bindingScope };
}

function identityTuplesEqual(
  a: AiTireSpecPayloadIdentity,
  b: AiTireSpecPayloadIdentity,
): boolean {
  const ta = buildJobAxleIdentityTuple(a);
  const tb = buildJobAxleIdentityTuple(b);
  if (!ta || !tb) return false;
  return tuplesEqual(ta, tb);
}

export function validateApplyGenerationBinding(args: {
  binding: AiTireSpecApplyGenerationBinding;
  setup: TireSetupIdentitySnapshot & { updatedAt: Date };
  spec: AiTireSpec;
}): PayloadIdentityValidationResult {
  if (args.binding.tireSetupId !== args.setup.id) {
    return {
      ok: false,
      code: 'GENERATION_SETUP_MISMATCH',
      message: 'Generation binding tire setup does not match target setup',
    };
  }

  const setupUpdatedAt = args.setup.updatedAt.toISOString();
  if (args.binding.setupUpdatedAt !== setupUpdatedAt) {
    return {
      ok: false,
      code: 'STALE_GENERATION_BINDING',
      message: 'Tire setup changed after AI spec was generated; fetch AI spec again',
    };
  }

  const requestIdentity: AiTireSpecPayloadIdentity = {
    tireSize: args.binding.requestTireSize.trim(),
    loadIndex: args.binding.requestLoadIndex.trim(),
    speedIndex: args.binding.requestSpeedIndex.trim(),
  };
  if (
    !requestIdentity.tireSize ||
    !requestIdentity.loadIndex ||
    !requestIdentity.speedIndex
  ) {
    return {
      ok: false,
      code: 'INCOMPLETE_GENERATION_BINDING',
      message: 'Generation binding is missing request tire identity',
    };
  }

  const payloadIdentity = extractPayloadIdentityFromSpec(args.spec);
  if (!payloadIdentity) {
    return {
      ok: false,
      code: 'INCOMPLETE_SPEC_IDENTITY',
      message:
        'AI tire spec payload lacks complete size, load index, and speed index identity',
    };
  }

  if (!identityTuplesEqual(payloadIdentity, requestIdentity)) {
    return {
      ok: false,
      code: 'PAYLOAD_GENERATION_IDENTITY_MISMATCH',
      message: 'AI spec payload identity does not match the identity used at generation time',
    };
  }

  const requestScope = resolvePayloadBindingScope(requestIdentity, args.setup);
  if (!requestScope) {
    return {
      ok: false,
      code: 'GENERATION_AXLE_IDENTITY_MISMATCH',
      message: 'Generation request identity does not match a valid setup axle binding',
    };
  }

  return validatePayloadIdentityAgainstSetup(args.spec, args.setup);
}
