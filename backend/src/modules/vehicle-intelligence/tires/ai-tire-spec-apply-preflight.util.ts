import type { AiTireSpec } from './tire-health.config';
import type { AiTireSpecApplyGenerationBinding } from './ai-tire-spec-payload-identity.util';
import {
  extractPayloadIdentityFromSpec,
  validateApplyGenerationBinding,
  validatePayloadIdentityAgainstSetup,
} from './ai-tire-spec-payload-identity.util';
import { buildJobAxleIdentityTuple } from './ai-tire-spec-job-binding.util';
import type { TireSetupIdentitySnapshot } from './ai-tire-spec-job-binding.util';
import {
  detectAiTireSpecSetupConflicts,
  partitionSetupSpecConflicts,
  toTireSetupSpecConsistencyInput,
  type AiTireSpecSetupConflict,
} from './ai-tire-spec-setup-consistency.util';

export type AiTireSpecApplyPreflightResult =
  | { ok: true; setupSpecWarnings: AiTireSpecSetupConflict[] }
  | { ok: false; code: string; message: string };

function jobIdentityMatchesPayload(
  jobIdentity: { tireSize: string; loadIndex: string; speedIndex: string },
  spec: AiTireSpec,
): boolean {
  const payload = extractPayloadIdentityFromSpec(spec);
  if (!payload) return false;
  const jobTuple = buildJobAxleIdentityTuple(jobIdentity);
  const payloadTuple = buildJobAxleIdentityTuple(payload);
  if (!jobTuple || !payloadTuple) return false;
  return (
    jobTuple.dimension === payloadTuple.dimension &&
    jobTuple.loadIndex === payloadTuple.loadIndex &&
    jobTuple.speedIndex === payloadTuple.speedIndex
  );
}

export function preflightDirectAiTireSpecApply(args: {
  setup: TireSetupIdentitySnapshot & { updatedAt: Date; tireSeason?: string | null };
  spec: AiTireSpec;
  generationBinding: AiTireSpecApplyGenerationBinding;
}): AiTireSpecApplyPreflightResult {
  const bindingCheck = validateApplyGenerationBinding({
    binding: args.generationBinding,
    setup: args.setup,
    spec: args.spec,
  });
  if (!bindingCheck.ok) {
    return { ok: false, code: bindingCheck.code, message: bindingCheck.message };
  }

  const payloadCheck = validatePayloadIdentityAgainstSetup(args.spec, args.setup);
  if (!payloadCheck.ok) {
    return { ok: false, code: payloadCheck.code, message: payloadCheck.message };
  }

  const conflicts = detectAiTireSpecSetupConflicts(
    toTireSetupSpecConsistencyInput(args.setup),
    args.spec,
  );
  const { blocking, warnings } = partitionSetupSpecConflicts(conflicts);
  if (blocking.length > 0) {
    const first = blocking[0]!;
    return {
      ok: false,
      code: first.code,
      message: first.message,
    };
  }

  return { ok: true, setupSpecWarnings: warnings };
}

export function preflightJobAiTireSpecApply(args: {
  setup: TireSetupIdentitySnapshot;
  spec: AiTireSpec;
  jobIdentity: { tireSize: string; loadIndex: string; speedIndex: string };
}): AiTireSpecApplyPreflightResult {
  if (!jobIdentityMatchesPayload(args.jobIdentity, args.spec)) {
    return {
      ok: false,
      code: 'PAYLOAD_JOB_IDENTITY_MISMATCH',
      message: 'Stored job result identity does not match normalized AI spec payload',
    };
  }

  const payloadCheck = validatePayloadIdentityAgainstSetup(args.spec, args.setup);
  if (!payloadCheck.ok) {
    return { ok: false, code: payloadCheck.code, message: payloadCheck.message };
  }

  const conflicts = detectAiTireSpecSetupConflicts(
    toTireSetupSpecConsistencyInput(args.setup),
    args.spec,
  );
  const { blocking, warnings } = partitionSetupSpecConflicts(conflicts);
  if (blocking.length > 0) {
    const first = blocking[0]!;
    return { ok: false, code: first.code, message: first.message };
  }

  return { ok: true, setupSpecWarnings: warnings };
}
