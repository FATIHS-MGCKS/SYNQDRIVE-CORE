# Tires Health — Architecture Authority (bootstrap, `AUDIT_IN_PROGRESS`)

Living architecture authority for the SynqDrive **Tires Health** module: tire setups and lifecycle, measurements and ground truth, Tire Wear Model V2, trip-usage ledger, health alerts, rental-health policy input, API/UI projections, and the **future DS4 Motion Engine driving-load integration (shadow only)**.

| Field | Value |
|-------|-------|
| Registry coverage status | `AUDIT_IN_PROGRESS` (from `NOT_STARTED`, 2026-10-24) — **not** a complete usable authority |
| Authority-native status | Bootstrap V0.1 · Tire Intelligence P1 · owner decisions recorded (PROPOSED) · Production `VERIFIED_READ_ONLY` @ `c169ddfab` |
| Repository baseline | `origin/main` `7a993eca6ebb39cbf632e119f8dfce411b17d5d1` (update on substantive tire PRs) |
| Standard | [`architecture/MODULE_AUTHORITY_STANDARD.md`](../MODULE_AUTHORITY_STANDARD.md); structural reference [`architecture/tankstellenerkennung/`](../tankstellenerkennung/) |
| Registry | [`architecture/SYNQDRIVE_RENTAL_ARCHITECTURE.md`](../SYNQDRIVE_RENTAL_ARCHITECTURE.md) → "Tires Health" |

## Entry documents (read in this order)

1. [`AUDIT_MANIFEST.md`](AUDIT_MANIFEST.md) — baselines, access mode, coverage matrix, promotion gate
2. [`CURRENT_STATE.md`](CURRENT_STATE.md) — ownership, production status, exact V2 inputs, DS4 availability, owner decisions
3. [`integration/DS4_MOTION_INTEGRATION_AUDIT.md`](integration/DS4_MOTION_INTEGRATION_AUDIT.md) — V2 ↔ DS4 comparison matrix, admission policy, target architecture, gaps, risk verdict
4. [`AGENT_CONTRACT.md`](AGENT_CONTRACT.md) — what counts as substantive, prohibited silent changes, shadow-only rule
5. [`KNOWLEDGE_GRAPH.md`](KNOWLEDGE_GRAPH.md) + [`graph/`](graph/) — machine graph (`TIRE-*` ids)
6. [`decisions/DECISION_REGISTER.md`](decisions/DECISION_REGISTER.md)
7. [`evidence/EVIDENCE_INDEX.md`](evidence/EVIDENCE_INDEX.md) · [`evidence/PRODUCTION_BASELINE.md`](evidence/PRODUCTION_BASELINE.md)
8. [`contradictions/KNOWLEDGE_GAPS.md`](contradictions/KNOWLEDGE_GAPS.md) · [`contradictions/OPEN_CONTRADICTIONS.md`](contradictions/OPEN_CONTRADICTIONS.md)
9. [`research/CHANGE_LEDGER.md`](research/CHANGE_LEDGER.md) · [`research/OPEN_QUESTIONS.md`](research/OPEN_QUESTIONS.md) · [`research/OPEN_HYPOTHESES.md`](research/OPEN_HYPOTHESES.md) · [`research/FAILED_APPROACHES.md`](research/FAILED_APPROACHES.md)

## Ownership boundary

**Owns:** tire setups/lifecycle, measurements/ground truth, V2 wear model + snapshots + alerts, trip-usage ledger and attribution, tire REST surface, tire UI surfaces, the future tire shadow adapter/store.
**Does not own:** Driving-Impact aggregates and DS4 Motion Engine/Event Detector/shadow worker (→ [Driving Intelligence](../drivingintelligence/)), rental gate semantics (→ Rental Health; consumes `TireHealthSummary`), trip boundaries (→ Trip Detection & Lifecycle).

## Non-negotiables (owner, 2026-10-24)

- Existing tire management, lifecycle, ledger, API, UI and safety mechanisms stay unchanged.
- Tire Wear Model V2 is frozen: obsolete as future basis, unchanged until a controlled replacement.
- DS4 Motion Events are the future driving-load basis — **shadow only**, no influence on productive tire status or rental gate.
- No new wear formula without ground-truth validation; no double counting of DI stress scores and DS4 events; DS4 numeric intensities are not physically validated.

## Validation

```bash
bash architecture/tires/scripts/validate-graph.sh
bash architecture/scripts/validate-module-registry.sh
```
