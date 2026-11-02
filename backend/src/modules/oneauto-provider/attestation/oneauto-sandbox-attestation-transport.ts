import type { OneAutoDocumentedProviderContract } from '../catalog/oneauto-contract-types';
import { buildOneAutoDocumentedGetUrl } from '../catalog/oneauto-documented-request.util';
import {
  assertNotRedirectStatus,
  nonJsonResponsePlaceholder,
  readBoundedResponseText,
} from '../client/oneauto-http-response-body.util';
import { isValidVin, normalizeVin } from '../client/oneauto-vin.util';
import {
  ONEAUTO_ATTESTATION_LIVE_MAX_RESPONSE_BYTES,
  ONEAUTO_ATTESTATION_LIVE_TIMEOUT_MS,
} from './oneauto-sandbox-attestation.constants';
import type { AttestationTransportOutcome } from './oneauto-sandbox-attestation-evaluate.util';
import type { OneAutoSandboxAttestationRequestBudget } from './oneauto-sandbox-attestation-guards.util';

export type SandboxAttestationFetchImpl = (
  url: string,
  init: RequestInit,
) => Promise<Response>;

function envelopeSuccessFromBody(httpStatus: number, body: unknown): boolean | null {
  if (httpStatus !== 200 || body == null || typeof body !== 'object' || Array.isArray(body)) {
    return null;
  }
  const success = (body as Record<string, unknown>).success;
  return typeof success === 'boolean' ? success : null;
}

function utf8ByteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

export async function executeAttestationGet(input: {
  contract: Pick<
    OneAutoDocumentedProviderContract,
    'providerPathTemplate' | 'vinQueryParameter' | 'authHeaderName'
  >;
  vin: string;
  apiKey: string;
  baseUrl: string;
  fetchImpl: SandboxAttestationFetchImpl;
  requestBudget: OneAutoSandboxAttestationRequestBudget;
  timeoutMs?: number;
  maxResponseBytes?: number;
}): Promise<AttestationTransportOutcome> {
  const normalized = normalizeVin(input.vin);
  const emptyHeaders = {
    retryAfterRaw: null,
    locationRaw: null,
    providerStatusRaw: null,
  } as const;

  if (!isValidVin(normalized)) {
    return {
      httpStatus: null,
      body: null,
      responseByteLength: null,
      envelopeSuccess: null,
      transportErrorCode: 'ONEAUTO_INVALID_VIN',
      responseHeaders: { ...emptyHeaders },
    };
  }

  const url = buildOneAutoDocumentedGetUrl(input.baseUrl, input.contract, normalized as string);
  const timeoutMs = input.timeoutMs ?? ONEAUTO_ATTESTATION_LIVE_TIMEOUT_MS;
  const maxBytes = input.maxResponseBytes ?? ONEAUTO_ATTESTATION_LIVE_MAX_RESPONSE_BYTES;

  try {
    input.requestBudget.assertSingleRequestAllowed();
  } catch (err: unknown) {
    const code =
      err && typeof err === 'object' && 'code' in err && typeof (err as { code: unknown }).code === 'string'
        ? (err as { code: string }).code
        : 'ONEAUTO_ATTESTATION_REQUEST_BUDGET_EXCEEDED';
    return {
      httpStatus: null,
      body: null,
      responseByteLength: null,
      envelopeSuccess: null,
      transportErrorCode: code,
      responseHeaders: { ...emptyHeaders },
    };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const res = await input.fetchImpl(url, {
      method: 'GET',
      redirect: 'manual',
      headers: {
        [input.contract.authHeaderName]: input.apiKey,
        Accept: 'application/json',
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    assertNotRedirectStatus(res.status);

    const responseHeaders = {
      retryAfterRaw: res.headers.get('retry-after') ?? res.headers.get('Retry-After'),
      locationRaw: res.headers.get('location') ?? res.headers.get('Location'),
      providerStatusRaw: res.headers.get('status') ?? res.headers.get('Status'),
    };

    const text = await readBoundedResponseText(res, maxBytes);
    const responseByteLength = text ? utf8ByteLength(text) : 0;
    let body: unknown = null;
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = nonJsonResponsePlaceholder(text);
      }
    }

    return {
      httpStatus: res.status,
      body,
      responseByteLength,
      envelopeSuccess: envelopeSuccessFromBody(res.status, body),
      transportErrorCode: null,
      responseHeaders,
    };
  } catch (err: unknown) {
    const code =
      err && typeof err === 'object' && 'code' in err && typeof (err as { code: unknown }).code === 'string'
        ? (err as { code: string }).code
        : null;
    if (code) {
      return {
        httpStatus: null,
        body: null,
        responseByteLength: null,
        envelopeSuccess: null,
        transportErrorCode: code,
        responseHeaders: { ...emptyHeaders },
      };
    }
    const isAbort = err instanceof Error && err.name === 'AbortError';
    return {
      httpStatus: null,
      body: null,
      responseByteLength: null,
      envelopeSuccess: null,
      transportErrorCode: isAbort ? 'ONEAUTO_PROVIDER_TIMEOUT' : 'ONEAUTO_ATTESTATION_NETWORK',
      responseHeaders: { ...emptyHeaders },
    };
  }
}

/** @deprecated use executeAttestationGet */
export const executeSandboxAttestationGet = executeAttestationGet;
