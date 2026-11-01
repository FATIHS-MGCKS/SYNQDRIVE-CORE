/** Target SKU for P2.5E-C sandbox attestation harness (DOCUMENTED only). */
export const ONEAUTO_SANDBOX_ATTESTATION_SKU = 'OE_VIN_LOOKUP_EU' as const;

export const ONEAUTO_SANDBOX_ATTESTATION_HOST = 'sandbox.oneautoapi.com' as const;

export const ONEAUTO_SANDBOX_ATTESTATION_BASE_URL =
  `https://${ONEAUTO_SANDBOX_ATTESTATION_HOST}` as const;

/** Synthetic VIN for offline fixtures only — not vendor-approved. */
export const ONEAUTO_SANDBOX_ATTESTATION_SYNTHETIC_VIN = 'WBA12345678901234' as const;

export const ONEAUTO_SANDBOX_ATTESTATION_LIVE_TIMEOUT_MS = 15_000;

export const ONEAUTO_SANDBOX_ATTESTATION_LIVE_MAX_RESPONSE_BYTES = 256 * 1024;

/**
 * Live sandbox HTTP remains disabled in repository builds until a separate owner-reviewed
 * change sets this to true. CLI/tests must treat false as hard block.
 */
export const ONEAUTO_SANDBOX_LIVE_ATTESTATION_CODE_ENABLED = false as const;

export const ONEAUTO_SANDBOX_ATTESTATION_OWNER_AUTH_ENV =
  'ONEAUTO_SANDBOX_ATTESTATION_OWNER_AUTHORIZED' as const;

export const ONEAUTO_SANDBOX_ATTESTATION_API_KEY_ENV =
  'ONEAUTO_SANDBOX_ATTESTATION_API_KEY' as const;
