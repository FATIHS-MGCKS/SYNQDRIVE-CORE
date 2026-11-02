# DS4 L2 assessment collection safety — draft PR body

**Branch:** `cursor/ds4-assessment-collection-safety-192d`  
**Base:** `main`  
**HEAD:** `309ac446ab9f25210ed7ff3a4b945b7a982c3276`

## Summary

Prepares safe DS4 Assessment L2 **shadow collection** for production Motion V2 data without enabling workers, publishing scores, or reprocessing history.

## Changes

- **V2-only discovery:** SQL pre-filter (`eventRowContract` + `created_at >= cutoff`) plus in-memory summary ↔ payload contract validation before outbox enqueue.
- **Explicit cutoff:** `DI_V0_DS4_ASSESSMENT_MIN_MOTION_RUN_CREATED_AT` required for runnable worker config (unset/invalid → fail-closed). Proposed `2026-10-28T17:42:00Z` in `.env.example` comments only.
- **Impact V2 gate:** `resolveOperationalLoadIndexPercentile` only when `assessmentStatus === RATED`.

## Validation

```bash
cd backend && npm run test:di:ds4-assessment
cd backend && npm run test:di:ds4-assessment:postgres:ci
```

## Out of scope

No deploy, production env activation, schema migrations, Motion/S4/RPM/VSI/Tire/Legacy Impact/Trip UI changes.
