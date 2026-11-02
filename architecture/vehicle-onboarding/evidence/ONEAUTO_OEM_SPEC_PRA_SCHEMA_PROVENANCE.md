# One Auto OEM specification PRA — schema + provenance (2026-11-02)

| Field | Value |
|-------|-------|
| **Scope** | Nullable `Vehicle` OEM identity columns + `registrationIdentityProvenance` field registry |
| **Migration** | `20261102160000_vehicle_oem_specification_identity_pra` |
| **API / UI** | **Not in this slice** — columns and provenance types only |
| **Provider apply** | **Forbidden** — no One Auto job → Vehicle write path |

## Vehicle columns (all nullable TEXT, no defaults)

| Prisma field | DB column |
|--------------|-----------|
| `oemEngineCode` | `oem_engine_code` |
| `oemEngineDesc` | `oem_engine_desc` |
| `oemTransmissionCode` | `oem_transmission_code` |
| `oemTransmissionDesc` | `oem_transmission_desc` |
| `exteriorColorDesc` | `exterior_color_desc` |
| `oemExteriorColorCode` | `oem_exterior_color_code` |
| `interiorTrimDesc` | `interior_trim_desc` |
| `oemInteriorTrimCode` | `oem_interior_trim_code` |
| `oemModelRangeDesc` | `oem_model_range_desc` |
| `oemDerivativeDesc` | `oem_derivative_desc` |

Preserved unchanged: `make`, `model`, `year`, `vin`, `color`, `transmission` enum, displacement/cylinder scalars, tire/brake/HV/motion tables.

## Provenance envelope

- **Legacy documents:** `version: 1` — parse unchanged; no JSONB backfill required.
- **Version 2 (optional):** adds `oemFieldRegistryVersion: 1` for explicit OEM key registry; v1 remains valid indefinitely.
- **OEM field keys:** registered in `vehicle-oem-specification-provenance.registry.ts` (10 keys aligned with columns).
- **Provider suggestions:** merge path coerces OEM entries to `SUGGESTED` only; `USER_CONFIRMED` / `PROTECTED` on provider payloads rejected or downgraded — no auto-confirmation.
- **Protected USER_CONFIRMED:** existing P3 + technical-spec semantics preserved; OEM protected entries block silent overwrite in `mergeProvenanceOnSave`.

## Validation limits (future API)

- Code-like fields: max **64** characters (registry constant).
- Description fields: max **512** characters (registry constant).

## Tests

- `vehicle-oem-specification-provenance.registry.spec.ts` (12 cases)
- Regression: `vehicle-identity-p3.service.spec.ts`, `vehicle-technical-spec-patch.util.spec.ts`

## Non-effects

- No onboarding readiness rule changes
- No `OneAutoProviderResponse` → Vehicle bridge
- No attestation capture import
- VSI signal tables untouched
