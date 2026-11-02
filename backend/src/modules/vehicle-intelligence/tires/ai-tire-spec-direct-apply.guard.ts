import { TireSetupStatus } from '@prisma/client';
import type { TireSetupIdentitySnapshot } from './ai-tire-spec-job-binding.util';
import { isActiveTireSetup } from './ai-tire-spec-job-binding.util';

export type DirectApplyTargetSetupResult =
  | {
      ok: true;
      setup: TireSetupIdentitySnapshot;
      bindingReason: 'bound_setup' | 'single_active_setup';
    }
  | { ok: false; message: string; code: string };

/**
 * Resolve target setup for direct apply using server state only.
 * Client tireSize/load/speed are not trusted for setup selection.
 */
export function resolveDirectApplyTargetSetup(args: {
  tireSetupId: string | null | undefined;
  activeSetups: TireSetupIdentitySnapshot[];
  boundSetup: TireSetupIdentitySnapshot | null;
}): DirectApplyTargetSetupResult {
  const active = args.activeSetups.filter(
    (s) => s.removedAt == null && s.status === TireSetupStatus.ACTIVE,
  );

  if (args.tireSetupId) {
    if (!args.boundSetup) {
      return {
        ok: false,
        code: 'SETUP_NOT_FOUND',
        message: 'Bound tire setup was not found for this vehicle',
      };
    }
    if (args.boundSetup.id !== args.tireSetupId) {
      return {
        ok: false,
        code: 'SETUP_ID_MISMATCH',
        message: 'Tire setup binding is inconsistent',
      };
    }
    if (!isActiveTireSetup(args.boundSetup)) {
      return {
        ok: false,
        code: 'SETUP_NOT_ACTIVE',
        message: 'Bound tire setup is no longer active; apply rejected',
      };
    }
    return { ok: true, setup: args.boundSetup, bindingReason: 'bound_setup' };
  }

  if (active.length === 0) {
    return {
      ok: false,
      code: 'NO_ACTIVE_SETUP',
      message: 'No active tire setup found for this vehicle',
    };
  }
  if (active.length > 1) {
    return {
      ok: false,
      code: 'AMBIGUOUS_ACTIVE_SETUP',
      message: 'Direct apply requires tireSetupId when multiple active setups exist',
    };
  }

  return { ok: true, setup: active[0]!, bindingReason: 'single_active_setup' };
}
