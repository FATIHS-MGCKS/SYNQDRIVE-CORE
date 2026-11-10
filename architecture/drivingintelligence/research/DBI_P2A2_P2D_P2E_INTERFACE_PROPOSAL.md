# P2-A2 → P2-D / P2-E interface proposal (non-binding)

## Proposed handoff contract (future)

| Field | Role |
|-------|------|
| `Ds4RpmDynamicsResearchResultV1` | Sidecar research artifact alongside `Ds4RpmEpisodeResearchResultV1` |
| Shared `bindings.*` | Same org/vehicle/trip/link/v1b fingerprint as A1 for join eligibility review |
| `observedDynamics.adjacentDeltas[]` | Optional enrichment for shadow-correlation windows — **no** automatic edge creation; pairs reference bucket label indices/values under `BUCKET_LABEL_UNVERIFIED` |
| Label-time for P2-D fusion (requirement) | Consumers needing wall-clock alignment must join **bound original RPM label timestamps** from the admitted V1A trip input, or a future additive **label-time projection** — not implemented in PR #2398 |
| `observedDynamics.monotonicRuns[]` | Descriptive context for P2-D fusion reviewers only |
| `timeAuthority` | Must remain `BUCKET_LABEL_UNVERIFIED` in any P2-D consumer |

## Integration rules (proposed)

1. P2-D may **read** A2 output only when A1 binding already admitted the same trip envelope.
2. No promotion of A2 runs to DS4 motion events or misuse KPIs without separate architect decision.
3. Theil–Sen direction (`ds4-rpm-shadow-correlation`) remains a **separate** estimator; A2 adjacent deltas do not replace it.
4. P2-E scoring activation explicitly **out of scope** for A2 V1 (`NO_SCORING_ACTIVATION`).

## Not in V1 PR

- P2-C2 adapter plane for A2
- Persistence / worker scheduling
- Real-data executor wiring (see `REAL_DATA_VALIDATION_GAPS` in agent output)
