# APDS V3 P1A — Scientific foundation contract (design-only)

| Field | Value |
|-------|-------|
| Status | IMPLEMENTATION_DRAFT — no enforcement, no flag activation |
| P0/P0.1 evidence | `/opt/cursor/artifacts/apds-p0-1-evidence-closeout-pack.json` |

## Interface: VSI → APDS → DIMO scheduler

| Layer | Role |
|-------|------|
| **VSI** | Read-only signal profiles, P2C observations, P5 correlation evidence (non-decision-input) |
| **APDS** | Policy evaluation, shadow durability, scientific evidence versioning |
| **DIMO scheduler** | Physical SNAPSHOT enqueue + execution (unchanged cadence in P1A) |

### Decision inputs (future V3 — not active in P1A)

Scoped per `(organizationId, vehicleId, providerSourceLinkId)`:

- Signal evidence revision (immutable history when enabled)
- Causal timestamp at decision time
- Consumer requirement vector (P4 registry; domain approval separate)
- Profile class / capability resolver output

### Designed capabilities (dormant)

1. Expected information-gain assessment (read-only scoring)
2. Consumer-demand prioritization (no auto-enforce)
3. Adaptive backoff + hysteresis
4. Maximum-age watchdog
5. Wake + Trip FSM safety overrides (existing overlays preserved)
6. Recovery + provider-failure fallback
7. Fail-closed on ambiguous VSI evidence

**Exclusions:** No coupling to unfinished FSD/DBI research pipelines.

## P1A code deliveries

| Work package | Artifact |
|--------------|----------|
| A Delay integrity | `P25_APD_DELAY_EVIDENCE_V1_1` immediate-next binding |
| B Enqueue durability | `apdShadowEnqueueEvidence` on BullMQ job → processor patch |
| C Savings evaluator | `backend/scripts/ops/apds-scientific-savings-evaluator.ts` |
| D This contract | Architecture only |
| E Verification | Unit + optional Postgres CI script |

## Invariants

- Shadow epoch rows remain historical; V2.1 rows are not silently reinterpreted.
- B2/B4 policies frozen; savings intersection not additive.
- `correlationIsDecisionInput: false` for VSI P5 until explicit gate.
