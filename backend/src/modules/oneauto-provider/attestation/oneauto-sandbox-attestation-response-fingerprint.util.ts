import { createHash } from 'node:crypto';
import type {
  AttestationResponseHeaderSnapshot,
  OneAutoAttestationResponseFingerprint,
} from './oneauto-sandbox-attestation-response-fingerprint.types';

const VIN_PATTERN = /^[A-HJ-NPR-Z0-9]{17}$/i;
const SAFE_JOB_ID = /^[A-Za-z0-9_-]{8,128}$/;
const SAFE_ERROR_CODE = /^[A-Za-z0-9_. -]{1,64}$/;

const JOB_ID_KEYS = [
  'job_id',
  'jobId',
  'request_id',
  'requestId',
  'async_request_id',
  'asyncRequestId',
  'transaction_id',
  'transactionId',
] as const;

const STATUS_URL_KEYS = [
  'status_url',
  'statusUrl',
  'result_url',
  'resultUrl',
  'poll_url',
  'pollUrl',
  'callback_url',
  'callbackUrl',
] as const;

const SENSITIVE_KEY =
  /authorization|api[_-]?key|password|secret|token|email|phone|address|vehicle_identification|vin|signed|credential/i;

const PROVIDER_ERROR_KEYS = ['error', 'error_code', 'errorCode', 'code', 'message'] as const;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function sha256Prefix16(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex').slice(0, 16);
}

function sanitizeProviderStatusHeader(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  const trimmed = raw.trim().slice(0, 64);
  if (!/^[A-Za-z0-9_. -]+$/.test(trimmed)) return null;
  return trimmed;
}

function parseRetryAfterSeconds(raw: string | null | undefined): number | null {
  if (!raw?.trim()) return null;
  const n = Number.parseInt(raw.trim(), 10);
  if (!Number.isFinite(n) || n < 0 || n > 86400) return null;
  return n;
}

/** Strip query, userinfo, and fragments from URLs before evidence storage. */
export function redactUrlToHostPath(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return `${u.protocol}//${u.host}${u.pathname}`;
  } catch {
    return null;
  }
}

function extractJobIdFingerprint(body: Record<string, unknown>): string | null {
  for (const key of JOB_ID_KEYS) {
    const value = body[key];
    if (typeof value !== 'string') continue;
    const normalized = value.trim();
    if (!SAFE_JOB_ID.test(normalized) || VIN_PATTERN.test(normalized)) continue;
    return sha256Prefix16(normalized);
  }
  return null;
}

function extractProviderErrorCode(body: Record<string, unknown>): {
  code: string | null;
  errorPresent: boolean;
} {
  let errorPresent = false;
  for (const key of PROVIDER_ERROR_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(body, key)) continue;
    const value = body[key];
    if (key === 'error' || key === 'message') {
      if (typeof value === 'string' && value.trim()) errorPresent = true;
    }
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (SAFE_ERROR_CODE.test(trimmed) && !VIN_PATTERN.test(trimmed) && trimmed.length <= 64) {
        return { code: trimmed, errorPresent: errorPresent || key === 'error' };
      }
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      return { code: String(value), errorPresent: errorPresent || key === 'error' };
    }
  }
  return { code: null, errorPresent };
}

function collectSensitiveKeys(obj: Record<string, unknown>, prefix = ''): string[] {
  const found: string[] = [];
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (SENSITIVE_KEY.test(key)) {
      found.push(path);
    }
    if (typeof value === 'string' && VIN_PATTERN.test(value.trim())) {
      found.push(path);
    }
    if (isPlainObject(value)) {
      found.push(...collectSensitiveKeys(value, path));
    }
  }
  return [...new Set(found)].sort();
}

function statusUrlFromBody(body: Record<string, unknown>): string | null {
  for (const key of STATUS_URL_KEYS) {
    const value = body[key];
    if (typeof value === 'string' && value.trim()) {
      return redactUrlToHostPath(value);
    }
  }
  return null;
}

function httpStatusClass(
  httpStatus: number | null,
): OneAutoAttestationResponseFingerprint['httpStatusClass'] {
  if (httpStatus == null) return 'none';
  if (httpStatus === 200) return '200';
  if (httpStatus === 202) return '202';
  if (httpStatus === 206) return '206';
  if (httpStatus >= 300 && httpStatus < 400) return '3xx';
  if (httpStatus >= 400 && httpStatus < 500) return '4xx';
  if (httpStatus >= 500) return '5xx';
  return 'none';
}

function resolveAsyncState(
  httpStatus: number | null,
): OneAutoAttestationResponseFingerprint['asyncState'] {
  if (httpStatus === 202) return 'ASYNC_ACCEPTED';
  if (httpStatus === 206) return 'PARTIAL_CONTENT';
  if (httpStatus === 200) return 'SYNC_RESPONSE';
  return 'NOT_APPLICABLE';
}

export function buildAttestationResponseFingerprint(input: {
  httpStatus: number | null;
  body: unknown;
  headers: AttestationResponseHeaderSnapshot;
}): OneAutoAttestationResponseFingerprint {
  const nonJsonBody =
    input.body != null &&
    typeof input.body === 'object' &&
    !Array.isArray(input.body) &&
    (input.body as Record<string, unknown>)._nonJsonResponse === true;

  if (!isPlainObject(input.body) || nonJsonBody) {
    return {
      httpStatusClass: httpStatusClass(input.httpStatus),
      asyncState: resolveAsyncState(input.httpStatus),
      topLevelJsonKeys: null,
      resultObjectKeys: null,
      envelopeSuccessField: null,
      providerStatusHeader: sanitizeProviderStatusHeader(input.headers.providerStatusRaw),
      retryAfterSeconds: parseRetryAfterSeconds(input.headers.retryAfterRaw),
      locationHostPathRedacted: redactUrlToHostPath(input.headers.locationRaw),
      asyncJobIdFingerprint: null,
      providerErrorCode: null,
      errorFieldPresent: false,
      nonJsonBody: true,
      sensitiveFieldKeysDetected: [],
    };
  }

  const body = input.body;
  const topLevelJsonKeys = Object.keys(body).sort();
  const resultObjectKeys =
    isPlainObject(body.result) ? Object.keys(body.result).sort().slice(0, 32) : null;

  const envelopeSuccessField =
    typeof body.success === 'boolean' ? body.success : null;

  const { code, errorPresent } = extractProviderErrorCode(body);
  const jobFingerprint = extractJobIdFingerprint(body);
  const bodyStatusUrl = statusUrlFromBody(body);
  const headerLocation = redactUrlToHostPath(input.headers.locationRaw);
  const locationHostPathRedacted = bodyStatusUrl ?? headerLocation;

  return {
    httpStatusClass: httpStatusClass(input.httpStatus),
    asyncState: resolveAsyncState(input.httpStatus),
    topLevelJsonKeys,
    resultObjectKeys,
    envelopeSuccessField,
    providerStatusHeader: sanitizeProviderStatusHeader(input.headers.providerStatusRaw),
    retryAfterSeconds: parseRetryAfterSeconds(input.headers.retryAfterRaw),
    locationHostPathRedacted,
    asyncJobIdFingerprint: jobFingerprint,
    providerErrorCode: code,
    errorFieldPresent: errorPresent,
    nonJsonBody: false,
    sensitiveFieldKeysDetected: collectSensitiveKeys(body),
  };
}

/** Ensures serialized attestation evidence never embeds forbidden substrings. */
export function assertAttestationEvidenceRedaction(evidenceJson: string): void {
  if (/x-api-key|authorization\s*:/i.test(evidenceJson)) {
    throw new Error('Attestation evidence leaked credential markers');
  }
  if (/"[A-HJ-NPR-Z0-9]{17}"/i.test(evidenceJson)) {
    throw new Error('Attestation evidence leaked full VIN pattern');
  }
}
