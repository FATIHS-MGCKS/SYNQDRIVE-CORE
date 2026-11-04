import type { OneAutoProviderHttpContract } from './catalog/oneauto-contract-types';
import { normalizeVin } from './client/oneauto-vin.util';
import { evaluateSuccessResultErrorEnvelope } from './oneauto-response-envelope.util';
import {
  extractOeVinLookupEuProviderResult,
  type OemVinLookupEuBindingValidation,
  assertOemVinLookupEuJobBinding,
} from './oem-specification/oneauto-oem-vin-lookup-eu-suggestion-provider.util';
import { ONEAUTO_OEM_VIN_LOOKUP_EU_SERVICE_SKU } from './oem-specification/oneauto-vin-lookup-oem-suggestion.types';

export type OneAutoFullDataCallbackRejectionCode =
  | 'ONEAUTO_CALLBACK_PAYLOAD_MALFORMED'
  | 'ONEAUTO_CALLBACK_PAYLOAD_INCOMPLETE'
  | 'ONEAUTO_CALLBACK_VIN_MISMATCH'
  /** Provider delivered a documented envelope with `success:false` (business failure, e.g. no data for VIN). */
  | 'ONEAUTO_CALLBACK_PROVIDER_FAILURE'
  /** Provider delivered `success:true` under wrapper `status` 206 — not attested as complete success. */
  | 'ONEAUTO_PARTIAL_CONTENT';

export type OneAutoFullDataCallbackEvaluation =
  | {
      ok: true;
      result: Record<string, unknown>;
      /** SUCCESS_RESULT_ERROR envelope (unwrapped when the provider wrapped it). */
      envelope: Record<string, unknown>;
      wrapperStatus: number | null;
    }
  | {
      ok: false;
      code: OneAutoFullDataCallbackRejectionCode;
      diagnostic: Record<string, unknown>;
      /** Present when the body carried a recognizable envelope (for provider-failure persistence). */
      envelope?: Record<string, unknown>;
      wrapperStatus?: number | null;
    };

/** Codes that represent a processed provider answer rather than a rejected/unreadable payload. */
export const ONEAUTO_CALLBACK_PROVIDER_OUTCOME_CODES: ReadonlySet<OneAutoFullDataCallbackRejectionCode> =
  new Set(['ONEAUTO_CALLBACK_PROVIDER_FAILURE', 'ONEAUTO_PARTIAL_CONTENT']);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function hasOwn(obj: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

export type OneAutoCallbackBodyUnwrap = {
  envelope: unknown;
  wrapped: boolean;
  wrapperStatus: number | null;
};

/**
 * Production-observed (2026-11-04) One Auto full-data callback POST body:
 * `{ status: <provider HTTP status>, result: { success, result, error } }` —
 * the documented SUCCESS_RESULT_ERROR envelope is nested under `result` with the
 * provider's own HTTP status beside it. A bare envelope (`{ success, result }`) is
 * still accepted unchanged.
 */
export function unwrapOneAutoCallbackBody(body: unknown): OneAutoCallbackBodyUnwrap {
  if (!isPlainObject(body)) {
    return { envelope: body, wrapped: false, wrapperStatus: null };
  }
  if (hasOwn(body, 'success')) {
    return { envelope: body, wrapped: false, wrapperStatus: null };
  }
  const inner = body.result;
  if (isPlainObject(inner) && hasOwn(inner, 'success')) {
    const status = body.status;
    return {
      envelope: inner,
      wrapped: true,
      wrapperStatus: typeof status === 'number' && Number.isFinite(status) ? status : null,
    };
  }
  return { envelope: body, wrapped: false, wrapperStatus: null };
}

/**
 * Treat callback POST body as OpenAPI SUCCESS_RESULT_ERROR (documented shape only), optionally
 * wrapped as `{ status, result: <envelope> }` (observed live). Provider business failures
 * (`success:false`) and partial content are classified distinctly from malformed payloads.
 */
export function evaluateOneAutoFullDataCallbackPayload(input: {
  body: unknown;
  contract: Pick<OneAutoProviderHttpContract, 'responseEnvelope' | 'serviceSku'>;
  jobVinSnapshot: string;
  vehicleVin: string | null;
}): OneAutoFullDataCallbackEvaluation {
  const { envelope, wrapped, wrapperStatus } = unwrapOneAutoCallbackBody(input.body);
  const topLevelKeys = isPlainObject(input.body) ? Object.keys(input.body).sort() : [];

  const envelopeEval = evaluateSuccessResultErrorEnvelope(200, envelope, input.contract);
  if (!envelopeEval.ok) {
    if (envelopeEval.code === 'ONEAUTO_PROVIDER_ENVELOPE_FAILURE' && isPlainObject(envelope)) {
      return {
        ok: false,
        code: 'ONEAUTO_CALLBACK_PROVIDER_FAILURE',
        diagnostic: { ...envelopeEval.diagnostic, wrapped, wrapperStatus },
        envelope,
        wrapperStatus,
      };
    }
    return {
      ok: false,
      code: 'ONEAUTO_CALLBACK_PAYLOAD_MALFORMED',
      diagnostic: { ...envelopeEval.diagnostic, wrapped, wrapperStatus, topLevelKeys },
    };
  }

  if (!isPlainObject(envelope)) {
    return {
      ok: false,
      code: 'ONEAUTO_CALLBACK_PAYLOAD_MALFORMED',
      diagnostic: { reason: 'body_not_object', wrapped, wrapperStatus, topLevelKeys },
    };
  }

  if (wrapperStatus != null && wrapperStatus !== 200) {
    return {
      ok: false,
      code: wrapperStatus === 206 ? 'ONEAUTO_PARTIAL_CONTENT' : 'ONEAUTO_CALLBACK_PROVIDER_FAILURE',
      diagnostic: { reason: 'wrapper_status_not_200', wrapped, wrapperStatus },
      envelope,
      wrapperStatus,
    };
  }

  const result = extractOeVinLookupEuProviderResult(envelope);
  if (!result) {
    return {
      ok: false,
      code: 'ONEAUTO_CALLBACK_PAYLOAD_INCOMPLETE',
      diagnostic: { reason: 'missing_result_object', wrapped, wrapperStatus },
      envelope,
      wrapperStatus,
    };
  }

  const binding: OemVinLookupEuBindingValidation = assertOemVinLookupEuJobBinding({
    organizationId: '',
    vehicleId: '',
    serviceSku: input.contract.serviceSku,
    jobVinSnapshot: input.jobVinSnapshot,
    vehicleVin: input.vehicleVin,
    providerResponseBody: envelope,
  });
  if (!binding.ok) {
    return {
      ok: false,
      code: 'ONEAUTO_CALLBACK_VIN_MISMATCH',
      diagnostic: { bindingCode: binding.code, wrapped, wrapperStatus },
      envelope,
      wrapperStatus,
    };
  }

  const resultVin = result.vehicle_identification_number;
  if (typeof resultVin !== 'string' || normalizeVin(resultVin) !== binding.normalizedVin) {
    return {
      ok: false,
      code: 'ONEAUTO_CALLBACK_PAYLOAD_INCOMPLETE',
      diagnostic: { reason: 'result_vin_missing_or_invalid', wrapped, wrapperStatus },
      envelope,
      wrapperStatus,
    };
  }

  return { ok: true, result, envelope, wrapperStatus };
}

export function isOeVinLookupEuFullDataCallbackSku(serviceSku: string): boolean {
  return serviceSku === ONEAUTO_OEM_VIN_LOOKUP_EU_SERVICE_SKU;
}
