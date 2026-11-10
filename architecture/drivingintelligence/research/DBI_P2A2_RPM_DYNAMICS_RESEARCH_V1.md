# P2-A2 RPM Dynamics Research V1

**Operation:** `DBI_P2A2_RPM_DYNAMICS_KERNEL_V1`  
**Status:** Research-only offline kernel (`ds4-rpm-dynamics-research-v1`)  
**Time authority:** `BUCKET_LABEL_UNVERIFIED` (unchanged from P2-A1 / V1B)

## Purpose

Expose **observed** RPM label-sequence dynamics (adjacent deltas, step-sign runs, reversals) without physical rate, gear-shift, load, misuse, or cross-domain claims.

## Admission

Reuses **P2-A1** `validateDs4RpmEpisodeResearchInputBinding` (V1A trip + tier-aware V1B + reference ICE gates). No new temporal authority or data source.

## Canon

Shared `canonicalizeDs4RpmResearchPoints` + `splitDs4RpmResearchSequences` (`ds4-rpm-research-shared`) — exact A1 parity for label collapse and v1b sequence gaps (strict `>` rule).

## Outputs (descriptive)

- Adjacent observed ΔRPM between consecutive admitted labels **within** a sequence only
- Positive / negative / zero delta counts
- Step-sign monotonic runs (`RISING` | `FALLING` | `FLAT`) — **requires ≥2 labels in sequence** (no singleton synthetic FLAT runs)
- `observedDynamics.status`: `SUPPORTED_DESCRIPTIVE` when ≥1 adjacent pair exists; `NOT_ASSESSABLE` when trip is `COMPUTED` but pair evidence is insufficient (independent of admission)
- Observed direction reversal count: consecutive **non-FLAT** trend kind changes within one sequence; intervening FLAT plateaus do not conceal a RISING↔FALLING change; never across sequence gaps
- Denominators: unique labels, sequence count, adjacent pair count

### Monotonic run boundary semantics (C2)

- Runs describe **contiguous step-sign chains**, not disjoint sets of RPM labels.
- **Adjacent runs share the turning/boundary label** (inclusive `startGlobalIdx` / `endGlobalIdx` on the canonical lattice).
- **`pointCount` must not be summed** across runs as if labels were independent observations.
- Every emitted run carries `stepCount = pointCount - 1`.
- The **sum of `stepCount` over all runs equals `adjacentObservedPairCount`** for the trip.

### Noise, cadence, and FLAT semantics (C3)

- **`FLAT` means exact equality** of observed aggregated RPM values at consecutive labels (`valueRpm` float equality after HF parse). No calibrated noise floor is applied.
- **Small bucket-to-bucket jitter** (quantization, AVG smoothing, or measurement noise) can flip step signs and **dominate** reversal and run counts near steady RPM — **not** evidence of driving behavior.
- **Do not compare** raw reversal or run counts across `RPM_1S` vs `RPM_2S` trips (different effective label spacing and admission tier).
- **`labelGapMs` in adjacent pairs may vary** inside a continuous sequence when inter-label wall-clock spacing is irregular; magnitude comparisons across heterogeneous gaps are weak evidence.
- **Equal RPM labels do not establish** steady physical engine operation, engine-off, or idling — only label equality under `BUCKET_LABEL_UNVERIFIED`.
- **No deadband** and **no arbitrary aggressiveness thresholds** in V1.

### RUPTELA_R1 (C1 / architect decision)

- R1-admitted trips may remain **`status: COMPUTED`** and **`observedDynamics.status: SUPPORTED_DESCRIPTIVE`** when binding admits (no new admission gate).
- Outputs carry `r1HistoricalObdRecordTimeUncertain` and claim **`R1_HISTORICAL_OBD_RECORD_TIME_UNCERTAIN`** (parity with P2-A1).
- **Not eligible** for DS4×RPM temporal fusion or driver/engine behavioral inference under existing R1 temporal containment — descriptive in-sequence statistics only.

## Scientific boundaries

| Allowed | Not authorized |
|---------|----------------|
| Observed delta RPM | Calibrated dRPM/dt |
| Label-sequence trends | Confirmed gear shifts |
| Descriptive reversals | Engine load / wear / misuse |
| | Driver scores |
| | Cross-domain event alignment |

`semanticGuards.notEvidenceCandidate=true` — not P2-C proxy inventory.

## Compatibility

- No P2-C2/C3 adapter or reconciliation changes in this PR
- P2-A1 kernel uses shared canon helper only (behavior parity tested)
- V1B cadence profiles unchanged; `RPM_3S` remains `OBSERVATION_ONLY` and abstains at A1/A2 binding (no policy change)

## Validation

`ds4-rpm-dynamics-research.kernel.spec.ts` — synthetic tier fixtures only.
