import {
  ONEAUTO_PRODUCTION_ATTESTATION_HOST,
  ONEAUTO_SANDBOX_ATTESTATION_HOST,
  ONEAUTO_PRODUCTION_ATTESTATION_BASE_URL,
  ONEAUTO_PRODUCTION_ATTESTATION_API_KEY_ENV,
  ONEAUTO_PRODUCTION_ATTESTATION_VIN_ENV,
  ONEAUTO_PRODUCTION_ATTESTATION_OWNER_AUTH_ENV,
  ONEAUTO_PRODUCTION_ATTESTATION_VIN_USE_AUTH_ENV,
  ONEAUTO_PRODUCTION_ATTESTATION_BILLING_ACK_ENV,
  ONEAUTO_PRODUCTION_ATTESTATION_ONE_GET_CONFIRMED_ENV,
} from './oneauto-sandbox-attestation.constants';
import type {
  OneAutoSandboxAttestationDiagnosticCategory,
  ProductionAttestationAuthorization,
} from './oneauto-sandbox-attestation.types';

function parseHttpsUrl(baseUrl: string): URL {
  try {
    return new URL(baseUrl.startsWith('http') ? baseUrl : `https://${baseUrl}`);
  } catch {
    throw Object.assign(new Error('Attestation base URL invalid'), {
      code: 'ONEAUTO_ATTESTATION_BASE_URL_INVALID',
    });
  }
}

export function assertSandboxAttestationHostnameOnly(baseUrl: string): void {
  const parsed = parseHttpsUrl(baseUrl);
  if (parsed.protocol !== 'https:') {
    throw Object.assign(new Error('Attestation requires HTTPS'), {
      code: 'ONEAUTO_ATTESTATION_BASE_URL_INVALID',
    });
  }
  if (parsed.hostname.toLowerCase() !== ONEAUTO_SANDBOX_ATTESTATION_HOST) {
    throw Object.assign(new Error('Only sandbox host allowed for offline fixture transport'), {
      code: 'ONEAUTO_ATTESTATION_SANDBOX_HOST_REQUIRED',
    });
  }
}

export function assertProductionAttestationHostnameOnly(baseUrl: string): void {
  const parsed = parseHttpsUrl(baseUrl);
  if (parsed.protocol !== 'https:') {
    throw Object.assign(new Error('Attestation requires HTTPS'), {
      code: 'ONEAUTO_ATTESTATION_BASE_URL_INVALID',
    });
  }
  const host = parsed.hostname.toLowerCase();
  if (host === ONEAUTO_SANDBOX_ATTESTATION_HOST) {
    throw Object.assign(new Error('Sandbox host forbidden for production attestation'), {
      code: 'ONEAUTO_ATTESTATION_SANDBOX_HOST_FORBIDDEN',
    });
  }
  if (host !== ONEAUTO_PRODUCTION_ATTESTATION_HOST) {
    throw Object.assign(new Error('Custom host forbidden for production attestation'), {
      code: 'ONEAUTO_ATTESTATION_CUSTOM_HOST_FORBIDDEN',
    });
  }
}

export function resolveOfflineFixtureBaseUrl(): string {
  const base = `https://${ONEAUTO_SANDBOX_ATTESTATION_HOST}`;
  assertSandboxAttestationHostnameOnly(base);
  return base;
}

export function resolveProductionAttestationBaseUrl(): string {
  assertProductionAttestationHostnameOnly(ONEAUTO_PRODUCTION_ATTESTATION_BASE_URL);
  return ONEAUTO_PRODUCTION_ATTESTATION_BASE_URL;
}

export function rejectCustomBaseUrlOverride(override: string | undefined): void {
  if (override != null && override.trim() !== '') {
    throw Object.assign(new Error('Custom base URL overrides are forbidden'), {
      code: 'ONEAUTO_ATTESTATION_CUSTOM_HOST_FORBIDDEN',
    });
  }
}

export type ProductionPreflightFailure = {
  code: string;
  category: OneAutoSandboxAttestationDiagnosticCategory;
};

export function validateProductionAttestationAuthorization(
  input: ProductionAttestationAuthorization,
): ProductionPreflightFailure | null {
  if (!input.cliLiveProduction) {
    return {
      code: 'ONEAUTO_ATTESTATION_LIVE_PRODUCTION_CLI_REQUIRED',
      category: 'LIVE_PRODUCTION_CLI_REQUIRED',
    };
  }
  if (input.ownerAuthorized !== '1') {
    return {
      code: 'ONEAUTO_ATTESTATION_LIVE_OWNER_AUTH_REQUIRED',
      category: 'LIVE_OWNER_AUTHORIZATION_REQUIRED',
    };
  }
  if (input.vinUseAuthorized !== '1') {
    return {
      code: 'ONEAUTO_ATTESTATION_VIN_USE_AUTH_REQUIRED',
      category: 'MISSING_VIN_USE_AUTHORIZATION',
    };
  }
  if (input.billingAcknowledged !== '1') {
    return {
      code: 'ONEAUTO_ATTESTATION_BILLING_ACK_REQUIRED',
      category: 'MISSING_BILLING_ACKNOWLEDGEMENT',
    };
  }
  if (input.oneGetConfirmed !== '1') {
    return {
      code: 'ONEAUTO_ATTESTATION_ONE_GET_CONFIRMED_REQUIRED',
      category: 'MISSING_ONE_GET_CONFIRMATION',
    };
  }
  if (!input.apiKey?.trim()) {
    return { code: 'ONEAUTO_ATTESTATION_MISSING_API_KEY', category: 'MISSING_API_KEY' };
  }
  if (!input.vin?.trim()) {
    return { code: 'ONEAUTO_ATTESTATION_MISSING_VIN', category: 'MISSING_VIN' };
  }
  return null;
}

export function readProductionAttestationAuthorizationFromEnv(): Omit<
  ProductionAttestationAuthorization,
  'cliLiveProduction'
> {
  return {
    apiKey: process.env[ONEAUTO_PRODUCTION_ATTESTATION_API_KEY_ENV]?.trim(),
    vin: process.env[ONEAUTO_PRODUCTION_ATTESTATION_VIN_ENV]?.trim(),
    ownerAuthorized: process.env[ONEAUTO_PRODUCTION_ATTESTATION_OWNER_AUTH_ENV],
    vinUseAuthorized: process.env[ONEAUTO_PRODUCTION_ATTESTATION_VIN_USE_AUTH_ENV],
    billingAcknowledged: process.env[ONEAUTO_PRODUCTION_ATTESTATION_BILLING_ACK_ENV],
    oneGetConfirmed: process.env[ONEAUTO_PRODUCTION_ATTESTATION_ONE_GET_CONFIRMED_ENV],
  };
}

export class OneAutoSandboxAttestationRequestBudget {
  private used = false;

  /** Consumes the single allowed outbound attempt before fetch begins. */
  assertSingleRequestAllowed(): void {
    if (this.used) {
      throw Object.assign(new Error('Attestation allows at most one outbound request'), {
        code: 'ONEAUTO_ATTESTATION_REQUEST_BUDGET_EXCEEDED',
      });
    }
    this.used = true;
  }

  get hasUsed(): boolean {
    return this.used;
  }

  get attemptedCount(): number {
    return this.used ? 1 : 0;
  }
}
