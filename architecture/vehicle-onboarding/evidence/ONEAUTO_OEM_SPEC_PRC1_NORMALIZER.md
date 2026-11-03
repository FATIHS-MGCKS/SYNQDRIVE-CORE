# One Auto OEM specification PR-C1 — normalizer alignment (2026-11-03)

| Field | Value |
|-------|-------|
| **Depends on** | PRA schema + PR-B Master confirm path (merged) |
| **Module** | `oneauto-provider/oem-specification/` (pure functions) |
| **Authority** | [ONEAUTO_OEM_SPEC_PRC1_NORMALIZER.md](../../oneauto-provider/evidence/ONEAUTO_OEM_SPEC_PRC1_NORMALIZER.md) |

Provider VIN lookup suggestions remain **separate** from `Vehicle` OEM columns until explicit Master PATCH with `confirmedFieldKeys`. PR-C1 adds deterministic normalize + compare only.

## Non-effects

- No change to `vehicle-oem-specification-patch.util.ts` save path
- No provenance JSONB writes from provider jobs
