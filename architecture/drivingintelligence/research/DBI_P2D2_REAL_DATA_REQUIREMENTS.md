# P2-D2 — Real-data requirements for DS4×RPM dynamics fusion

**Companion:** P2-D1 offline fusion V1 (`ds4-rpm-dynamics-fusion-research-v1`)  
**Status:** Requirements only — no real-data executor in P2-D1

## Preconditions (all mandatory)

| Requirement | Authority |
|-------------|-----------|
| Owner-authorized real-data replay envelope | `ds4-rpm-real-data-replay` gates |
| `evidenceKind: REAL_OBSERVATION` | Shadow correlation contract |
| `sourceFamilyAttestation: PROVEN_FROM_DIMO_IDENTITY` + non-null family | Source-family gate |
| No `RUPTELA_R1` / R1 uncertain record-time family | R1 temporal containment |
| Matching V1B input fingerprint on trip, samples, and gate | Provenance gate |
| A2 `COMPUTED` + `SUPPORTED_DESCRIPTIVE` | P2-A2 admission |
| Motion run provenance attested (no synthetic-only sample source) | Provenance gate |
| Pinned DS4 motion shadow run + events for same org/vehicle/trip | Shadow correlation input |

## Evidence bundles

- Sealed offline bundle id (when used) must match P2-A1/A2 binding identity.
- RPM samples must be byte-identical to canonical trip points under provenance digest check.
- DIMO vehicle JSON must resolve to a **known** telemetry source family (not `UNKNOWN`).

## Scientific constraints (unchanged from P2-D1)

- `sourceTimestampPhase` and RPM support width remain `UNKNOWN` until a separate timestamp-authority decision.
- Fusion outputs remain label-time hypotheses; no promotion to behavioral or misuse KPIs.
- Unsupported claim list must include all `DS4_RPM_REAL_DATA_UNSUPPORTED_SCIENTIFIC_CLAIMS` entries.

## Non-goals for P2-D2 design

- No automatic activation of fusion in workers or schedulers without architect sign-off.
- No ClickHouse write path for fusion artifacts in the first real-data slice.
- No UI surfacing beyond internal research review tooling.

## Offline replay bridge (P2-D2A)

Implemented: `executeDs4RpmRealDataFusionOfflineReplayV1` — see `DBI_P2D2A_REAL_DATA_FUSION_REPLAY_BRIDGE.md`.

## Suggested validation slice (real pilot, post-owner authorization)

1. Replay one authorized trip through existing real-data replay harness.
2. Feed harness output into fusion path only when independent attestation + `REAL_OBSERVATION` authority is approved (not P2-D2A injected gate).
3. Compare shadow metrics to standalone shadow replay (parity).
4. Record trip block reasons for R1 / unproven family negative controls.
5. Archive JSON artifact with contract version + kernel version + code SHA.
