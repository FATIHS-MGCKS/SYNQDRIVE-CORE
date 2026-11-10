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
