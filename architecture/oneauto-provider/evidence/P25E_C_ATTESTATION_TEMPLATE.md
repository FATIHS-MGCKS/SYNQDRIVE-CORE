# One Auto P2.5E-C — Sandbox attestation evidence template

**Do not auto-commit generated evidence or promote EXECUTION_VERIFIED contracts from this template.**

Copy this template after a **owner-approved** isolated attestation run. Replace placeholders only with **redacted** values.

---

## Run metadata

| Field | Value |
|-------|--------|
| schemaVersion | oneauto-sandbox-attestation-v2 |
| recordedAtUtc | `<ISO-8601 UTC>` |
| targetSku | OE_VIN_LOOKUP_EU |
| mode | `offline` \| `live-sandbox` |
| fixtureId | `<fixture id or — for live>` |
| sandboxHostname | sandbox.oneautoapi.com |
| httpMethod | GET |
| httpStatus | `<number or —>` |
| envelopeSuccess | `true` \| `false` \| `—` |
| responseByteLength | `<number or —>` |
| diagnosticCategory | `<category enum>` |
| attestationQualified | `true` only when category is SYNC_ATTESTATION_SUCCESS |
| billingStatus | **UNKNOWN** (until vendor + portal evidence) |
| providerContractStatus | DOCUMENTED |
| vinSha256Prefix | `<first 16 hex of SHA-256(normalized VIN) — never full VIN>` |
| responseFingerprint | `<redacted async/sync metadata — no raw body>` |
| responseFingerprint.asyncState | `SYNC_RESPONSE` \| `ASYNC_ACCEPTED` \| `PARTIAL_CONTENT` \| `NOT_APPLICABLE` |
| responseFingerprint.asyncJobIdFingerprint | `<16-hex SHA-256 prefix of validated job/request id, or —>` |
| responseFingerprint.retryAfterSeconds | `<integer seconds or —>` |
| responseFingerprint.locationHostPathRedacted | `<https://host/path only — no query tokens>` |
| responseFingerprint.topLevelJsonKeys | `<sorted key names only>` |
| evidenceSha256 | `<sha256 of sanitized evidence JSON>` |

## Owner attestation (manual)

- [ ] Owner authorized at most **one** sandbox GET
- [ ] Approved test VIN confirmed by One Auto (not OpenAPI example alone)
- [ ] Sandbox API key confirmed sandbox-scoped (key value **not** stored in git)
- [ ] PrePay balance observed before call (redacted screenshot or portal note id)
- [ ] PrePay balance observed after call (redacted)
- [ ] Vendor email/ticket id referencing billing rules: `<id>`

## Sanitized notes

- `<bullet — no raw provider errors, no PII>`

## Explicit non-storage policy

Do **not** attach to git: API keys, Authorization headers, full VIN, full JSON responses, personal data.

## Promotion gate (separate PR)

EXECUTION_VERIFIED registry updates require a **separate reviewed PR** after this evidence is accepted — never automatic.
