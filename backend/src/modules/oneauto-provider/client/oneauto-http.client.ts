import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { OneAutoProviderHttpContract } from '../catalog/oneauto-contract-types';
import { assertOneAutoPositiveOrgBudgetWhenEnabled } from '../oneauto-execution-budget-guard.util';
import { assertOneAutoAllowlistedPath } from './oneauto-allowlist';
import { ONEAUTO_HTTP_FETCH, type OneAutoHttpFetchImpl } from './oneauto-http-fetch.token';
import {
  nonJsonResponsePlaceholder,
  readBoundedResponseText,
} from './oneauto-http-response-body.util';
import { isValidVin, normalizeVin } from './oneauto-vin.util';

export type OneAutoHttpResult = {
  httpStatus: number;
  providerStatusHeader: string | null;
  body: unknown;
  redactedRequestPath: string;
};

const ALLOWED_BASE_HOSTS = new Set(['sandbox.oneautoapi.com', 'api.oneautoapi.com']);
const DEFAULT_MAX_RESPONSE_BYTES = 1_048_576;

function assertAllowedBaseUrl(baseUrl: string): void {
  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw Object.assign(new Error('One Auto base URL invalid'), { code: 'ONEAUTO_BASE_URL_INVALID' });
  }
  if (parsed.protocol !== 'https:') {
    throw Object.assign(new Error('One Auto base URL must be https'), { code: 'ONEAUTO_BASE_URL_INVALID' });
  }
  if (!ALLOWED_BASE_HOSTS.has(parsed.hostname.toLowerCase())) {
    throw Object.assign(new Error('One Auto base URL host not allowlisted'), {
      code: 'ONEAUTO_BASE_URL_NOT_ALLOWLISTED',
    });
  }
}

@Injectable()
export class OneAutoHttpClient {
  private readonly logger = new Logger(OneAutoHttpClient.name);
  private readonly fetchImpl: OneAutoHttpFetchImpl;

  constructor(
    private readonly config: ConfigService,
    @Optional() @Inject(ONEAUTO_HTTP_FETCH) fetchImpl?: OneAutoHttpFetchImpl,
  ) {
    this.fetchImpl = fetchImpl ?? fetch;
  }

  private cfg() {
    return this.config.get<{
      enabled?: boolean;
      sandbox?: boolean;
      apiKeyPresent?: boolean;
      baseUrl?: string;
      requestTimeoutMs?: number;
      maxRetries?: number;
      orgDailyBudgetMinor?: number;
      maxResponseBytes?: number;
    }>('oneautoProvider');
  }

  assertOutboundAllowed(): void {
    const cfg = this.cfg();
    if (!cfg?.enabled) {
      throw Object.assign(new Error('One Auto provider disabled'), { code: 'ONEAUTO_DISABLED' });
    }
    assertOneAutoPositiveOrgBudgetWhenEnabled(cfg);
    if (!cfg.apiKeyPresent) {
      throw Object.assign(new Error('One Auto API key not configured'), { code: 'ONEAUTO_API_KEY_MISSING' });
    }
  }

  /**
   * Contract-driven GET — requires execution-verified contract (allowlisted path, official auth/VIN param).
   */
  async executeProviderGet(input: {
    contract: OneAutoProviderHttpContract;
    vin: string;
  }): Promise<OneAutoHttpResult> {
    this.assertOutboundAllowed();
    const contract = input.contract;
    if (contract.evidenceState !== 'EXECUTION_VERIFIED') {
      throw Object.assign(new Error('One Auto contract not execution-verified'), {
        code: 'CONTRACT_UNVERIFIED',
      });
    }
    if (contract.httpMethod !== 'GET') {
      throw Object.assign(new Error('One Auto unsupported HTTP method'), {
        code: 'ONEAUTO_METHOD_NOT_ALLOWLISTED',
      });
    }

    const vin = normalizeVin(input.vin);
    if (!isValidVin(vin)) {
      throw Object.assign(new Error('Invalid VIN'), { code: 'ONEAUTO_INVALID_VIN' });
    }
    const validatedVin = vin as string;

    assertOneAutoAllowlistedPath(contract.httpMethod, contract.providerPathTemplate);

    const cfg = this.cfg();
    const base = (cfg?.baseUrl ?? '').replace(/\/+$/, '');
    assertAllowedBaseUrl(base.startsWith('http') ? base : `https://${base}`);

    const path = contract.providerPathTemplate.replace(/^\/+/, '');
    const vinParam = contract.vinQueryParameter;
    const url = `${base}/${path}?${encodeURIComponent(vinParam)}=${encodeURIComponent(validatedVin)}`;

    const apiKey = process.env.ONEAUTO_API_KEY?.trim();
    if (!apiKey) {
      throw Object.assign(new Error('One Auto API key not configured'), { code: 'ONEAUTO_API_KEY_MISSING' });
    }

    const headerName = contract.authHeaderName;
    const maxResponseBytes = cfg?.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES;
    const attempts = 1;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), cfg?.requestTimeoutMs ?? 30_000);
      const res = await this.fetchImpl(url, {
        method: 'GET',
        redirect: 'manual',
        headers: {
          [headerName]: apiKey,
          Accept: 'application/json',
        },
        signal: controller.signal,
      });
      clearTimeout(timeout);

      const providerStatusHeader = res.headers.get('status') ?? res.headers.get('Status');
      let body: unknown = null;
      const text = await readBoundedResponseText(res, maxResponseBytes);
      if (text) {
        try {
          body = JSON.parse(text);
        } catch {
          body = nonJsonResponsePlaceholder(text);
        }
      }

      this.logger.log(
        `OneAuto GET ${path} http=${res.status} sandbox=${cfg?.sandbox === true} attempts=${attempts}`,
      );

      return {
        httpStatus: res.status,
        providerStatusHeader,
        body,
        redactedRequestPath: path,
      };
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'code' in err && typeof (err as { code: unknown }).code === 'string') {
        throw err;
      }
      const isAbort =
        err instanceof Error &&
        (err.name === 'AbortError' || err.message.toLowerCase().includes('aborted'));
      throw Object.assign(new Error('One Auto provider request failed'), {
        code: isAbort ? 'ONEAUTO_PROVIDER_TIMEOUT' : 'ONEAUTO_PROVIDER_REQUEST_FAILED',
        cause: err,
      });
    }
  }

  /** @deprecated Use executeProviderGet with execution-verified contract */
  async getVinLookup(_input: {
    relativePath: string;
    vin: string;
    vinQueryParameter?: never;
  }): Promise<OneAutoHttpResult> {
    throw Object.assign(new Error('One Auto HTTP client requires execution-verified contract'), {
      code: 'CONTRACT_UNVERIFIED',
    });
  }
}
