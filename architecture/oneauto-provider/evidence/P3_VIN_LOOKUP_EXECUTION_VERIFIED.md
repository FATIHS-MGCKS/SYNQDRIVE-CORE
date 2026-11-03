# One Auto P3 — OE_VIN_LOOKUP_EU execution-verified registry (sync 200 only)

**Epistemic status:** Registry promotion from **existing** owner live attestation + committed offline parity — **not** a new provider call in this PR.

## Reused live evidence (owner attestation, not stored in git)

| Run | HTTP | SynqDrive outbound GETs | Attestation outcome | Product implication |
|-----|------|-------------------------|---------------------|---------------------|
| **E1** | **202** | **1** (no polling) | `HTTP_202_ASYNC`, `attestationQualified=false` | Async acceptance only — **no** same-URL poll activation |
| **E2** | **200**, `success=true` | **1** | `SYNC_ATTESTATION_SUCCESS`, `attestationQualified=true` | **18** keys under OpenAPI `result` object (incl. `vehicle_identification_number`) |

Cross-refs (repo):

- E1 portal/async interpretation: [P25E_E2_PROVIDER_DASHBOARD_ASYNC_SEQUENCE.md](./P25E_E2_PROVIDER_DASHBOARD_ASYNC_SEQUENCE.md)
- E2 envelope + capture field mapping (18 result keys in live capture contract): [P25E_P1_SECURE_RESULT_CAPTURE.md](./P25E_P1_SECURE_RESULT_CAPTURE.md)
- Offline fixture parity: `http-202-production-e1-parity`, `http-200-success-true` in `oneauto-sandbox-attestation-fixtures.ts`

## Registry entry (code)

File: `backend/src/modules/oneauto-provider/catalog/oneauto-execution-verified-registry.ts`

| Field | Value | Rationale |
|-------|--------|-----------|
| `asyncPollSameUrlWithoutNewCharge` | `false` | E1 proves 202 without attested free poll |
| `http206CompleteSuccessAllowed` | `false` | 206 not attested as job success |
| `catalogExecutionMode` | `SYNC` | Master hint: attested completion path is single GET → 200 |
| `asyncCapability` | `SYNC_ONLY` | Execution contract axis (documented row stays ASYNC_CAPABLE) |
| `pricingSourceVersion` | `synqdrive-p3-vin-lookup-e2-sync-200-v1` | Must match env catalog version at execute |

## Explicitly **not** promoted

- `OE_SERVICE_HISTORY_EU` and all other SKUs — remain DOCUMENTED-only / non-executable.
- Callback / webhook query parameters — not sent.
- HTTP 202 → poll → 200 provider portal sequence — **not** modeled as SynqDrive second GET ([P25E_E2](./P25E_E2_PROVIDER_DASHBOARD_ASYNC_SEQUENCE.md)).

## Production activation (separate operator step — not this PR)

Requires backend env only after merge + deploy; see PR body `REQUIRED_ENV` block. No `ONEAUTO_ENABLED=true` in this change.
