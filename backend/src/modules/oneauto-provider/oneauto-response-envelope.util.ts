import type { OneAutoProviderHttpContract } from './catalog/oneauto-contract-types';

export type OneAutoEnvelopeEvaluation =
  | { ok: true }
  | {
      ok: false;
      code: 'ONEAUTO_PROVIDER_ENVELOPE_FAILURE' | 'ONEAUTO_ENVELOPE_MALFORMED';
      diagnostic: Record<string, unknown>;
    };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Fail-closed checks for OpenAPI SUCCESS_RESULT_ERROR on HTTP 200 only.
 * Does not validate result field shapes (OPAQUE_JSON).
 */
export function evaluateSuccessResultErrorEnvelope(
  httpStatus: number,
  body: unknown,
  contract: Pick<OneAutoProviderHttpContract, 'responseEnvelope'>,
): OneAutoEnvelopeEvaluation {
  if (contract.responseEnvelope !== 'SUCCESS_RESULT_ERROR') {
    return { ok: true };
  }
  if (httpStatus !== 200) {
    return { ok: true };
  }

  if (!isPlainObject(body)) {
    return {
      ok: false,
      code: 'ONEAUTO_ENVELOPE_MALFORMED',
      diagnostic: { reason: 'body_not_object' },
    };
  }

  if (!Object.prototype.hasOwnProperty.call(body, 'success')) {
    return {
      ok: false,
      code: 'ONEAUTO_ENVELOPE_MALFORMED',
      diagnostic: { reason: 'missing_success' },
    };
  }

  if (typeof body.success !== 'boolean') {
    return {
      ok: false,
      code: 'ONEAUTO_ENVELOPE_MALFORMED',
      diagnostic: { reason: 'success_not_boolean', successType: typeof body.success },
    };
  }

  if (body.success === false) {
    return {
      ok: false,
      code: 'ONEAUTO_PROVIDER_ENVELOPE_FAILURE',
      diagnostic: {
        success: false,
        providerErrorPresent: Object.prototype.hasOwnProperty.call(body, 'error'),
      },
    };
  }

  return { ok: true };
}

export function mergeEnvelopeDiagnostic(
  body: unknown,
  diagnostic: Record<string, unknown>,
): Record<string, unknown> {
  const base = isPlainObject(body) ? { ...body } : {};
  return {
    ...base,
    _synqdriveEnvelopeDiagnostic: diagnostic,
  };
}
