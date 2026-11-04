import type { OneAutoProviderHttpContract } from './catalog/oneauto-contract-types';
import { normalizeVin } from './client/oneauto-vin.util';
import { evaluateSuccessResultErrorEnvelope } from './oneauto-response-envelope.util';
import {
  extractOeVinLookupEuProviderResult,
  type OemVinLookupEuBindingValidation,
  assertOemVinLookupEuJobBinding,
} from './oem-specification/oneauto-oem-vin-lookup-eu-suggestion-provider.util';
import { ONEAUTO_OEM_VIN_LOOKUP_EU_SERVICE_SKU } from './oem-specification/oneauto-vin-lookup-oem-suggestion.types';

export type OneAutoFullDataCallbackEvaluation =
  | { ok: true; result: Record<string, unknown> }
  | {
      ok: false;
      code:
        | 'ONEAUTO_CALLBACK_PAYLOAD_MALFORMED'
        | 'ONEAUTO_CALLBACK_PAYLOAD_INCOMPLETE'
        | 'ONEAUTO_CALLBACK_VIN_MISMATCH';
      diagnostic: Record<string, unknown>;
    };

/**
 * Treat callback POST body as OpenAPI SUCCESS_RESULT_ERROR @ HTTP 200 (documented shape only).
 * Does not assume undocumented provider delivery guarantees beyond committed OpenAPI evidence.
 */
export function evaluateOneAutoFullDataCallbackPayload(input: {
  body: unknown;
  contract: Pick<OneAutoProviderHttpContract, 'responseEnvelope' | 'serviceSku'>;
  jobVinSnapshot: string;
  vehicleVin: string | null;
}): OneAutoFullDataCallbackEvaluation {
  const envelope = evaluateSuccessResultErrorEnvelope(200, input.body, input.contract);
  if (!envelope.ok) {
    return {
      ok: false,
      code: 'ONEAUTO_CALLBACK_PAYLOAD_MALFORMED',
      diagnostic: envelope.diagnostic,
    };
  }

  const result = extractOeVinLookupEuProviderResult(input.body);
  if (!result) {
    return {
      ok: false,
      code: 'ONEAUTO_CALLBACK_PAYLOAD_INCOMPLETE',
      diagnostic: { reason: 'missing_result_object' },
    };
  }

  const binding: OemVinLookupEuBindingValidation = assertOemVinLookupEuJobBinding({
    organizationId: '',
    vehicleId: '',
    serviceSku: input.contract.serviceSku,
    jobVinSnapshot: input.jobVinSnapshot,
    vehicleVin: input.vehicleVin,
    providerResponseBody: input.body,
  });
  if (!binding.ok) {
    return {
      ok: false,
      code: 'ONEAUTO_CALLBACK_VIN_MISMATCH',
      diagnostic: { bindingCode: binding.code },
    };
  }

  const resultVin = result.vehicle_identification_number;
  if (typeof resultVin !== 'string' || normalizeVin(resultVin) !== binding.normalizedVin) {
    return {
      ok: false,
      code: 'ONEAUTO_CALLBACK_PAYLOAD_INCOMPLETE',
      diagnostic: { reason: 'result_vin_missing_or_invalid' },
    };
  }

  return { ok: true, result };
}

export function isOeVinLookupEuFullDataCallbackSku(serviceSku: string): boolean {
  return serviceSku === ONEAUTO_OEM_VIN_LOOKUP_EU_SERVICE_SKU;
}
