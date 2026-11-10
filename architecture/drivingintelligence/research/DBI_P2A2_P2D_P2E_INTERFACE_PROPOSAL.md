# P2-A2 → P2-D / P2-E interface proposal (non-binding)

## Proposed handoff contract (future)

| Field | Role |
|-------|------|
| `Ds4RpmDynamicsResearchResultV1` | Sidecar research artifact alongside `Ds4RpmEpisodeResearchResultV1` |
| Shared `bindings.*` | Same org/vehicle/trip/link/v1b fingerprint as A1 for join eligibility review |
| `observedDynamics.adjacentDeltas[]` | Optional enrichment for shadow-correlation windows — **no** automatic edge creation; pairs reference bucket label indices/values under `BUCKET_LABEL_UNVERIFIED` |
| `observedDynamics.monotonicRuns[]` | Descriptive context for P2-D fusion reviewers only; see run boundary semantics in `DBI_P2A2_RPM_DYNAMICS_RESEARCH_V1.md` |
| `timeAuthority` | Must remain `BUCKET_LABEL_UNVERIFIED` in any P2-D consumer |

### Index / label-time authority (C4)

| Rule | Requirement |
|------|-------------|
| **`globalIdx`** | Refers **exclusively** to `Ds4RpmResearchCanonPointV1.globalIdx` after `canonicalizeDs4RpmResearchPoints` — **not** an index into raw `tripInput.rpmPoints` |
| **Label recovery** | Apply `canonicalizeDs4RpmResearchPoints` to the **exact fingerprint-bound** admitted V1A trip input (`v1bInputFingerprint` gate) — preserve identical-duplicate collapse and conflicting-duplicate abstain rules |
| **ISO labels** | `fromRpm`/`toRpm` and indices alone **do not** establish DS4 time alignment or physical event overlap |
| **Wall-clock join** | Consumers needing timestamps must map `globalIdx` → `recordedAtIso` via canonical points on the bound trip input, or a future additive **label-time projection** artifact — **not implemented in PR #2398** |
| **`RUPTELA_R1`** | **`NOT_ELIGIBLE`** for DS4×RPM temporal fusion under existing R1 temporal containment (`R1_HISTORICAL_OBD_RECORD_TIME_UNCERTAIN`); shadow join family gate remains authoritative for correlation |

## Integration rules (proposed)

1. P2-D may **read** A2 output only when A1 binding already admitted the same trip envelope.
2. No promotion of A2 runs to DS4 motion events or misuse KPIs without separate architect decision.
3. Theil–Sen direction (`ds4-rpm-shadow-correlation`) remains a **separate** estimator; A2 adjacent deltas do not replace it.
4. P2-E scoring activation explicitly **out of scope** for A2 V1 (`NO_SCORING_ACTIVATION`).
5. **`RUPTELA_R1`:** A2 may be stored for audit, but **must not** feed P2-D fusion or behavioral inference pipelines.

## Not in V1 PR

- P2-C2 adapter plane for A2
- Persistence / worker scheduling
- Real-data executor wiring (see `REAL_DATA_VALIDATION_GAPS` in agent output)
- Timestamp-based fusion implementation
