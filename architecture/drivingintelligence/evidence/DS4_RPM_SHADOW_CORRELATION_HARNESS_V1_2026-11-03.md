# DS4 × RPM HF shadow correlation harness V1 (Phase 0)

| Field | Value |
|-------|--------|
| **Evidence ID** | DI-EVID-DS4-RPM-SHADOW-CORRELATION-HARNESS-V1 |
| **Date** | 2026-11-03 |
| **Baseline SHA (audit + implementation)** | `69561e60a613852a6f7a8318494f2c81a1f19f79` |
| **Scope** | Research-only Phase 0 — no production activation, schema, API, UI, or score changes |
| **decision_status** | PROPOSED |

## BEFORE

- P0 audit (`DS4_RPM_HF_CROSS_ARCHITECTURE_AUDIT_P0`) concluded shadow join is architecturally bounded but **scientific value UNKNOWN** without replay artifacts.
- V1B persists **aggregate** `summary_json` only — no raw RPM series in Postgres; event-level join requires **V1A-equivalent sample evidence** (fixture or authorized CH read with fingerprint).
- No cross-domain harness compared DS4 manoeuvre windows to admitted RPM observations.

## WHY

- Owner workstream requires **reproducible, fail-closed** evidence before any DS4 consumer wiring or map overlay.
- Reuses existing motion shadow payloads, V1B admission/qualityExposure, VSI tier semantics, and optional ref-intel attach — **no competing tier classifier or motion detector**.

## CHANGE

| Area | Path |
|------|------|
| Contract + temporal join | `backend/src/modules/vehicle-intelligence/driving-intelligence/ds4-rpm-shadow-correlation/` |
| Fixture replay scenarios | `ds4-rpm-shadow-correlation/__tests__/ds4-rpm-shadow-correlation-scenarios.harness.ts` |
| CLI artifacts | `backend/scripts/research/ds4-rpm-shadow-correlation-harness.cli.ts` |
| Shared synthetic motion (harness) | `motion-core-shadow-worker/di-v0-motion-core-shadow-synthetic-drive.harness-fixture.ts` |
| npm script | `npm run test:di:ds4-rpm-shadow-correlation` |

Join emits per-event `AVAILABLE | PARTIAL | AMBIGUOUS | UNAVAILABLE`, alignment sensitivity (±bucket width diagnostics), and explicit reason codes. **Does not** modify DS4 event counts, L2 eligibility, or customer surfaces.

## EXPECTED_EFFECT

- Deterministic fixture cohort reports under `/opt/cursor/artifacts/ds4-rpm-shadow-correlation/` (or `DS4_RPM_SHADOW_CORRELATION_OUT`).
- Quantified **defensible context share** by tier scenario for orchestrator review.
- Clear **DATASET_GAP** list for Audi/Arteon live cohort and video GT.

## VALIDATION

```bash
cd backend && npm run test:di:ds4-rpm-shadow-correlation
cd backend && npx ts-node --transpile-only scripts/research/ds4-rpm-shadow-correlation-harness.cli.ts
cd backend && npm run test:di:ds4-assessment
cd backend && npx jest ds4-rpm-hf-v1b-temporal ds4-rpm-hf-v1b-tier-processor vsi-rpm-cadence-tier --runInBand
bash architecture/scripts/validate-module-registry.sh
```

## OBSERVED_EFFECT

- Fixture replay (2026-11-03): `RPM_1S_ALIGNED` produces **>0** events with `AVAILABLE` context; `TENANT_MISMATCH_NEGATIVE` and `RPM_TIMESTAMP_SHIFT_NEGATIVE` fail closed on all events.
- **Production/main drift:** not evaluated in harness v1 (explicit unknown in manifest).
- **Detection improvement:** **NOT CLAIMED** — descriptive context only.

## REVIEW_HARDENING (2026-11-03, PR #2325 orchestrator)

### BEFORE (pre-hardening head `c709368d2123b1f9d5b60a6fae7081e251cb4cc5`)

- `AVAILABLE` could follow from a single RPM timestamp inside the DS4 window (inclusive end semantics).
- `NO_TEMPORAL_OVERLAP` could become `PARTIAL` when trip-level V1B aggregates showed `validPointCount > 0`.
- `alignmentUncertaintyMs` conflated observed sample span with source timestamp phase uncertainty.
- Conflicting duplicate timestamps still emitted min/median/max from an arbitrary chosen value.
- Provenance used algorithm bundle version as motion snapshot hash; fixture run/fingerprint strings were not recomputed from canonical V1A inputs.
- Trip-global reference operating band appeared on per-event rows.
- Empty manoeuvre list reported `MOTION_RUN_MISSING`.

### AFTER (hardened harness)

| Correction | Implementation |
|------------|----------------|
| Event coverage | Half-open event windows; `eventTemporalSupport` (point count, sample span, admitted sequence duration, missing intervals); `AVAILABLE` requires admitted multi-point continuous coverage without internal gaps — not a lone timestamp |
| Time alignment | `sourceTimestampPhase: UNKNOWN`; `observedSampleSpanMs` separate; alignment offsets remain research diagnostics only |
| Conflicts | `AMBIGUOUS` clears authoritative min/median/max |
| Provenance | `motionSnapshotHashAttested: null`; V1B fingerprint via `computeDs4RpmHfV1bTierAwareInputFingerprint`; fail-closed binding validation; `evidenceKind: SYNTHETIC_FIXTURE` |
| Context semantics | `tripLevelReferenceBand` at trip scope with `TRIP_LEVEL_AGGREGATE_NOT_EVENT_MEASURED` |
| Edge cases | `MOTION_RUN_NO_MANOEUVRES`; malformed timestamp reason; binding unproven codes |
| Scientific report | Cohort excludes negative controls from fixture prevalence (`defensibleContextShareFixtureScenariosExcludingNegativeControls`) |

### Fixture cohort (post-hardening, SYNTHETIC_FIXTURE)

- All events (incl. negative controls): **31.25%** defensible (`5/16`).
- Fixture scenarios excluding negative controls: **41.67%** defensible (`5/12`).
- Negative controls: **100%** `UNAVAILABLE` (no aggregate-only `PARTIAL`).

### Remaining limitations (unchanged)

- No production/CH loader; no independent motion snapshot attestation in fixture replay.
- Source timestamp phase vs DIMO bucket labels remains **UNKNOWN**.
- Descriptive coverage only — no accuracy uplift or fleet prevalence claims from fixtures.

## NON_EFFECTS

- No Trip FSM, Driving Impact V1, Tire/Battery/Brakes, map DTO, Nest flags, migrations, or production writes.
- No RPM-derived load, wear, or driver-quality scoring.

## TRADEOFFS

- Sample evidence supplied via **pinned fixtures** in v1; DB/CH-backed loader is a follow-up isolated PR.
- Scenarios harness lives under `__tests__` — intentional boundary for tier fixture reuse.

## REMAINING_GAPS

- Authorized read-only loader: motion run + V1B run + CH RPM with fingerprint attestation.
- Frozen Tiguan/Audi multicadence trip replay from production shadow rows.
- Fable review on bucket-aware alignment tolerance (questions prepared in CLI manifest).

## Fable questions (max 2, from findings)

1. What maximum **tier-aware bucket-width** temporal skew still supports descriptive RPM context at DS4 manoeuvre boundaries without implying engine load?
2. Does RPM reference-band context add interpretability beyond speed-only intensity for **eligibility-gated** events?

## GO / NO-GO (Phase 0)

| Verdict | Rationale |
|---------|-----------|
| **GO** | Continue to Phase 1 **internal shadow DTO** only after owner accepts fixture cohort + gap list |
| **NO-GO** | Customer/map/score integration; admission changes; RPM→load inference |
