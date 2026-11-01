import {
  ONEAUTO_SANDBOX_ATTESTATION_BASE_URL,
  ONEAUTO_SANDBOX_ATTESTATION_HOST,
  ONEAUTO_SANDBOX_ATTESTATION_OWNER_AUTH_ENV,
  ONEAUTO_SANDBOX_LIVE_ATTESTATION_CODE_ENABLED,
} from './oneauto-sandbox-attestation.constants';

export function assertSandboxAttestationHostnameOnly(baseUrl: string): void {
  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw Object.assign(new Error('Attestation base URL invalid'), {
      code: 'ONEAUTO_ATTESTATION_BASE_URL_INVALID',
    });
  }
  if (parsed.protocol !== 'https:') {
    throw Object.assign(new Error('Attestation requires HTTPS'), {
      code: 'ONEAUTO_ATTESTATION_BASE_URL_INVALID',
    });
  }
  if (parsed.hostname.toLowerCase() !== ONEAUTO_SANDBOX_ATTESTATION_HOST) {
    throw Object.assign(new Error('Production or unknown host forbidden for sandbox attestation'), {
      code: 'ONEAUTO_ATTESTATION_PRODUCTION_HOST_FORBIDDEN',
    });
  }
}

export function resolveSandboxAttestationBaseUrl(override?: string): string {
  const base = (override?.trim() || ONEAUTO_SANDBOX_ATTESTATION_BASE_URL).replace(/\/+$/, '');
  assertSandboxAttestationHostnameOnly(base.startsWith('http') ? base : `https://${base}`);
  return base.startsWith('http') ? base : `https://${base}`;
}

export function assertLiveAttestationPreconditions(input: {
  ownerAuthorizedEnv: string | undefined;
  apiKeyPresent: boolean;
}): void {
  if (!ONEAUTO_SANDBOX_LIVE_ATTESTATION_CODE_ENABLED) {
    throw Object.assign(new Error('Live sandbox attestation is disabled in this build'), {
      code: 'ONEAUTO_ATTESTATION_LIVE_CODE_DISABLED',
    });
  }
  if (input.ownerAuthorizedEnv !== '1') {
    throw Object.assign(new Error('Owner authorization env not set'), {
      code: 'ONEAUTO_ATTESTATION_LIVE_OWNER_AUTH_REQUIRED',
      requiredEnv: ONEAUTO_SANDBOX_ATTESTATION_OWNER_AUTH_ENV,
    });
  }
  if (!input.apiKeyPresent) {
    throw Object.assign(new Error('Sandbox attestation API key missing'), {
      code: 'ONEAUTO_ATTESTATION_MISSING_API_KEY',
    });
  }
}

export class OneAutoSandboxAttestationRequestBudget {
  private used = false;

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
}
