# One Auto OEM specification PR-C1 — VIN lookup normalizer & comparison (2026-11-03)

| Field | Value |
|-------|-------|
| **Scope** | Pure functions only — no DB, API, UI, provider HTTP, or Vehicle writes |
| **SKU** | `OE_VIN_LOOKUP_EU` documented `result` object |
| **Code** | `backend/src/modules/oneauto-provider/oem-specification/*` |

## Mapped provider → Vehicle desc fields (6)

| Provider path | Canonical key |
|---------------|---------------|
| `oem_model_range_desc` | `oemModelRangeDesc` |
| `oem_derivative_desc` | `oemDerivativeDesc` |
| `oem_engine_desc` | `oemEngineDesc` |
| `oem_transmission_type_desc` | `oemTransmissionDesc` |
| `oem_colour_desc` | `exteriorColorDesc` |
| `oem_interior_trim_desc` | `interiorTrimDesc` |

## Unmapped code columns (4)

`oemEngineCode`, `oemTransmissionCode`, `oemExteriorColorCode`, `oemInteriorTrimCode` — **never inferred** from descriptive strings; comparison state `NOT_COMPARABLE`.

## Normalizer contract

- Input: plain-object `providerResult`, ISO `fetchedAt`, ISO `snapshotCreatedAt`.
- Output: `OneAutoVinLookupEuSuggestionSnapshot` or fail-closed error codes (`INVALID_PROVIDER_RESULT`, invalid timestamps).
- Bounded strings: trim + collapse whitespace; max length from OEM registry (512 desc).
- Skips invalid per-field values with `skippedProviderFields` reasons; does not mutate input.
- `providerDataUpdatedAt` from `date_last_updated` when `YYYY-MM-DD` only.

## Comparison contract

- All ten registry keys compared; four code keys always `NOT_COMPARABLE` (unmapped).
- Mapped keys with a **valid** suggestion: `MATCH` | `MISSING` | `CONFLICT`.
- Mapped keys **without** a valid suggestion (skipped/absent provider value): `NOT_COMPARABLE` (never false `MATCH`).
- `confirmationStatus` orthogonal; protected `USER_CONFIRMED` conflicts remain `CONFLICT`, not `NOT_COMPARABLE`.
- `implicitConfirmationAllowed` always `false`.

## Timestamps

| Field | Meaning |
|-------|---------|
| `providerDataUpdatedAt` | Provider record date (`date_last_updated`) |
| `fetchedAt` | SynqDrive HTTP response time |
| `snapshotCreatedAt` | Normalization time |

## Tests

- `oneauto-vin-lookup-oem-suggestion.spec.ts` — Audi A4 sanitized fixture (P25E-P1 aligned), malformed input, protected conflict visibility.

## Non-effects

- `ONEAUTO_EXECUTION_VERIFIED_PROVIDER_CONTRACTS` unchanged
- No snapshot persistence (PR-C2)
- No Master UI (PR-C3)

Cross-ref: [ONEAUTO_OEM_SPEC_PRA_SCHEMA_PROVENANCE.md](../../vehicle-onboarding/evidence/ONEAUTO_OEM_SPEC_PRA_SCHEMA_PROVENANCE.md), [ONEAUTO_OEM_SPEC_PRB_MASTER_API_UI.md](../../vehicle-onboarding/evidence/ONEAUTO_OEM_SPEC_PRB_MASTER_API_UI.md)
