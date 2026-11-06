import type { AxiosError } from 'axios';
import { DimoRateLimitedError } from '../provider-budget/dimo-http-error.util';
import {
  DimoProviderHttpStatusClass,
  type DimoProviderHttpObservation,
} from './dimo-provider-limiter.types';

function readRetryAfterSeconds(headers: Record<string, unknown> | undefined): number | undefined {
  if (!headers) return undefined;
  const raw = headers['retry-after'] ?? headers['Retry-After'];
  if (raw == null) return undefined;
  const parsed = Number.parseInt(String(raw), 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function classifyDimoProviderHttpError(error: unknown): DimoProviderHttpObservation {
  if (error instanceof DimoRateLimitedError) {
    const retryAfterSeconds = Math.max(1, Math.ceil(error.retryAfterMs / 1000));
    return {
      statusClass: 'rate_limited',
      httpStatus: error.httpStatus ?? 429,
      retryAfterSeconds,
    };
  }
  const axiosError = error as AxiosError | undefined;
  const status = axiosError?.response?.status;
  const code = axiosError?.code;

  if (code === 'ECONNABORTED' || code === 'ETIMEDOUT') {
    return { statusClass: 'timeout', httpStatus: status };
  }
  if (code === 'ENOTFOUND' || code === 'ECONNREFUSED' || code === 'ECONNRESET') {
    return { statusClass: 'network_error', httpStatus: status };
  }

  if (status === 403) {
    return { statusClass: 'forbidden', httpStatus: 403 };
  }
  if (status === 401) {
    return { statusClass: 'auth_error', httpStatus: 401 };
  }
  if (status === 429) {
    return {
      statusClass: 'rate_limited',
      httpStatus: 429,
      retryAfterSeconds: readRetryAfterSeconds(
        axiosError?.response?.headers as Record<string, unknown> | undefined,
      ),
    };
  }
  if (typeof status === 'number' && status >= 500) {
    return { statusClass: 'server_error', httpStatus: status };
  }
  if (typeof status === 'number' && status >= 400) {
    return { statusClass: 'client_error', httpStatus: status };
  }

  return { statusClass: 'unknown', httpStatus: status };
}

export function successHttpObservation(): DimoProviderHttpObservation {
  return { statusClass: 'success' };
}
