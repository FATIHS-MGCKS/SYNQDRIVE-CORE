# One Auto P3 — OE_VIN_LOOKUP_EU execution-verified registry (sync 200 only)

> **Superseded (2026-11-03):** `SYNC` / `SYNC_ONLY` classification was incorrect. Current authority: [P4_VIN_LOOKUP_ASYNC_CONTRACT_CORRECTION.md](./P4_VIN_LOOKUP_ASYNC_CONTRACT_CORRECTION.md). This file is retained for historical E1/E2 evidence tables only.

**Epistemic status:** Registry promotion from **existing** owner live attestation + committed offline parity — **not** a new provider call in this PR.

## Reused live evidence (owner attestation, not stored in git)

| Run | HTTP | SynqDrive outbound GETs | Attestation outcome | Product implication |
|-----|------|-------------------------|---------------------|---------------------|
| **E1** | **202** | **1** (no polling) | `HTTP_202_ASYNC`, `attestationQualified=false` | Async acceptance only — **no** same-URL poll activation |
| **E2** | **200**, `success=true` | **1** | `SYNC_ATTESTATION_SUCCESS`, `attestationQualified=true` | **18** keys under OpenAPI `result` object (incl. `vehicle_identification_number`) — **P4:** interpreted as cached retrieval after E1, not sync-first |

Cross-refs (repo):

- E1 portal/async interpretation: [P25E_E2_PROVIDER_DASHBOARD_ASYNC_SEQUENCE.md](./P25E_E2_PROVIDER_DASHBOARD_ASYNC_SEQUENCE.md)
- E2 envelope + capture field mapping (18 result keys in live capture contract): [P25E_P1_SECURE_RESULT_CAPTURE.md](./P25E_P1_SECURE_RESULT_CAPTURE.md)
- Offline fixture parity: `http-202-production-e1-parity`, `http-200-success-true` in `oneauto-sandbox-attestation-fixtures.ts`

## Registry entry (historical P3 — superseded)

File: `backend/src/modules/oneauto-provider/catalog/oneauto-execution-verified-registry.ts`

| Field | P3 value (superseded) | P4 value |
|-------|----------------------|----------|
| `asyncPollSameUrlWithoutNewCharge` | `false` | `false` |
| `http206CompleteSuccessAllowed` | `false` | `false` |
| `catalogExecutionMode` | `SYNC` | `ASYNC_CAPABLE` |
| `asyncCapability` | `SYNC_ONLY` | `ASYNC_CAPABLE` |
| `pricingSourceVersion` | `synqdrive-p3-vin-lookup-e2-sync-200-v1` | `synqdrive-p4-vin-lookup-async-capable-v1` |

## Explicitly **not** promoted

- `OE_SERVICE_HISTORY_EU` and all other SKUs — remain DOCUMENTED-only / non-executable.
- Callback / webhook query parameters — not sent.
- HTTP 202 → poll → 200 provider portal sequence — **not** modeled as SynqDrive second GET ([P25E_E2](./P25E_E2_PROVIDER_DASHBOARD_ASYNC_SEQUENCE.md)).

## Production activation (separate operator step — not this PR)

Requires backend env only after merge + deploy; see PR body `REQUIRED_ENV` block. No `ONEAUTO_ENABLED=true` in this change.
