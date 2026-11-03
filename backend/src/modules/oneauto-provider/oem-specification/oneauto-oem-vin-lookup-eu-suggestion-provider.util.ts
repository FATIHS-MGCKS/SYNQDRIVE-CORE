import { getDocumentedOneAutoContract } from '../catalog/oneauto-documented-contracts';
import { isValidVin, normalizeVin } from '../client/oneauto-vin.util';
import { evaluateSuccessResultErrorEnvelope } from '../oneauto-response-envelope.util';
import { extractProviderResultVin } from '../attestation/oneauto-sandbox-attestation-result-capture.util';
import { ONEAUTO_OEM_VIN_LOOKUP_EU_SERVICE_SKU } from './oneauto-vin-lookup-oem-suggestion.types';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

export type OemVinLookupEuBindingValidation =
  | { ok: true; normalizedVin: string }
  | { ok: false; code: string };

export function assertOemVinLookupEuJobBinding(input: {
  organizationId: string;
  vehicleId: string;
  serviceSku: string;
  jobVinSnapshot: string;
  vehicleVin: string | null;
  providerResponseBody: unknown;
}): OemVinLookupEuBindingValidation {
  if (input.serviceSku !== ONEAUTO_OEM_VIN_LOOKUP_EU_SERVICE_SKU) {
    return { ok: false, code: 'ONEAUTO_OEM_SUGGESTION_SKU_MISMATCH' };
  }

  const jobVin = normalizeVin(input.jobVinSnapshot);
  const vehicleVin = normalizeVin(input.vehicleVin);
  if (!isValidVin(jobVin) || !isValidVin(vehicleVin) || jobVin !== vehicleVin) {
    return { ok: false, code: 'ONEAUTO_OEM_SUGGESTION_VIN_BINDING_MISMATCH' };
  }

  const providerVin = extractProviderResultVin(input.providerResponseBody);
  if (providerVin != null) {
    const normalizedProviderVin = normalizeVin(providerVin);
    if (!isValidVin(normalizedProviderVin) || normalizedProviderVin !== jobVin) {
      return { ok: false, code: 'ONEAUTO_OEM_SUGGESTION_PROVIDER_VIN_MISMATCH' };
    }
  }

  return { ok: true, normalizedVin: jobVin! };
}

export function extractOeVinLookupEuProviderResult(body: unknown): Record<string, unknown> | null {
  if (!isPlainObject(body) || body.success !== true) return null;
  if (!isPlainObject(body.result)) return null;
  return body.result;
}

export function isSuccessfulOeVinLookupEuResponse(input: {
  httpStatus: number;
  body: unknown;
}): boolean {
  if (input.httpStatus !== 200) return false;
  const contract = getDocumentedOneAutoContract(ONEAUTO_OEM_VIN_LOOKUP_EU_SERVICE_SKU);
  if (!contract) return false;
  const envelope = evaluateSuccessResultErrorEnvelope(input.httpStatus, input.body, contract);
  if (!envelope.ok) return false;
  return extractOeVinLookupEuProviderResult(input.body) != null;
}

export function parseProviderDataUpdatedAtDate(value: string | null | undefined): Date | null {
  if (value == null) return null;
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  const parsed = Date.parse(`${trimmed}T00:00:00.000Z`);
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed);
}
