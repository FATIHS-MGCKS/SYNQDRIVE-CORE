# DS4 Assessment L2 PR-A2 Evidence

| Field | Value |
|-------|-------|
| **PR** | PR-A2 L2 intensity quality + canonical exposure |
| **Branch** | `cursor/ds4-assessment-l2-intensity-exposure-pr-a2-192d` |
| **Base** | `main` (post #2212, #2215) |
| **Worker / deploy** | OFF — Draft only |

## Scope

- Validated ordinal **event admissibility** (V2 intensity reader only)
- Duration metadata tiers (`FULL_ELIGIBLE` / `BIN_ONLY`)
- Canonical driving exposure (`Es`, `D_km`) with versioned provenance
- Quality counts per manoeuvre kind
- **No** numeric Driving Impact score publication

## Tests

```bash
cd backend && npm run test:di:ds4-assessment
cd backend && npm run test:di:ds4-assessment:postgres:ci   # when disposable Postgres available
```

## Non-effects

- Legacy HF / TripDrivingImpact unchanged
- Trip UI / DriverScore / Rental / Brake / Tire cutover unchanged
- C4 / C5.1 speed authority algorithms unchanged
