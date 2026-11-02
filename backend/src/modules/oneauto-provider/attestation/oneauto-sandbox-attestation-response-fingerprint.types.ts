/** Redacted provider response metadata — never stores raw bodies or secrets. */
export type OneAutoAttestationResponseFingerprint = {
  httpStatusClass: '200' | '202' | '206' | '3xx' | '4xx' | '5xx' | 'none';
  /** Derived async / sync classification for attestation evidence only. */
  asyncState: 'SYNC_RESPONSE' | 'ASYNC_ACCEPTED' | 'PARTIAL_CONTENT' | 'NOT_APPLICABLE';
  topLevelJsonKeys: string[] | null;
  resultObjectKeys: string[] | null;
  envelopeSuccessField: boolean | null;
  providerStatusHeader: string | null;
  retryAfterSeconds: number | null;
  /** Origin + pathname only — query and credentials stripped. */
  locationHostPathRedacted: string | null;
  /** SHA-256 prefix (16 hex) of a validated async job / request id — never the raw id. */
  asyncJobIdFingerprint: string | null;
  providerErrorCode: string | null;
  errorFieldPresent: boolean;
  nonJsonBody: boolean;
  /** Key names only for sensitive / PII-like fields detected in JSON (values never stored). */
  sensitiveFieldKeysDetected: string[];
};

export type AttestationResponseHeaderSnapshot = {
  retryAfterRaw: string | null;
  locationRaw: string | null;
  providerStatusRaw: string | null;
};
