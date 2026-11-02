# RPM Multi-Cadence Tier — Phase 1 (pure classifier)

## Tier assignment (R1)

Active **P50** for tier selection uses the **FABLE replay ceil-index percentile** on sorted active intervals (≤ 8 s), not the arithmetic median when *n* is even. Stored `p50ActiveSeconds` is this tier-driving percentile.

- `RPM_1S` if P50 ≤ 1 s  
- `RPM_2S` if P50 ≤ 2 s (and > 1 s)  
- `RPM_3S` if P50 ≤ 3 s (and > 2 s)  
- `SPARSE` if P50 > 3 s  

P75 / P90 use the same percentile indexing (spread + confidence).

## Digests

| Digest | Recomputable from fixture? |
|--------|----------------------------|
| `fixtureInputDigest` | Yes — hash of trip window + interval inputs |
| `seriesDigest` | No — export-attested SHA-256 over full `(recordedAtIso, valueRpm)` series |

| Field | Meaning |
| --- | --- |
| `cadenceConfidence` | Confidence in **effective resolution tier** (R4 purity / P90 / longest sequence). |
| `tripCoverageBand` | `MINIMAL_SPAN` / `PARTIAL_SPAN` / `FULL_SPAN` from `activeSpanRatio` only. |
| `analysisReadiness` | Whether **trip-scoped** RPM analytics are appropriate — never inferred from cadence alone. |

**Rule:** `cadenceConfidence === HIGH` does **not** imply full-trip analytics. Example: Audi `a62ed62d` → `RPM_2S HIGH` + `ACTIVE_SPAN_ONLY` (`activeSpanRatio ≈ 0.127`).

## `activeDensityVsTier`

`c * activeIntervalCount / activeSpanSeconds` — density of observed intervals vs the tier’s nominal grid **inside the active span**. Values near 1.0 mean locally regular spacing at tier `c`; low `activeSpanRatio` can still mean poor global trip coverage.

Not a completeness metric. Do not expose as “data completeness” to product UI without `tripCoverageBand`.

## Frozen replay

Fixture: `fixtures/rpm-multicadence-tier-frozen-cohort-v1.json`

- Fixed calendar window `2026-10-15` … `2026-10-29` (no `NOW()-14d` in tests)
- 61 Tiguan + 57 Audi trips (tripId prefixes locked to FABLE replay)
- `seriesDigest` per trip (SHA-256 of canonical RPM series at export)

Reference aggregates are asserted in `vsi-rpm-cadence-tier-frozen-replay.spec.ts` — not hardcoded in production code.

## Non-goals (Phase 1)

No VSI persistence, V1A admission, V1B engine, flags, or legacy label changes.
