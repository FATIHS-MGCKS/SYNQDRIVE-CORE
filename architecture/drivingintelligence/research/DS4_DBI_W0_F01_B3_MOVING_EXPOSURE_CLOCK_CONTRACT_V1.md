# DS4 DBI W0 — F01 B3 Moving-Exposure Clock Contract (v1)

| Field | Value |
| --- | --- |
| **Contract ID** | `DS4_DBI_W0_F01_B3_MOVING_EXPOSURE_CLOCK_CONTRACT_V1` |
| **Contract revision** | **v1.1** (errata + U1–U6 architect closeout) |
| **Status** | `ARCHITECT_APPROVED_IMPLEMENTATION_SPEC` (documentation only; **not** implemented in kernel) |
| **PR** | #2353 |
| **Lock HEAD (initial)** | `9ec0e4c1a5d1888f2f5ccfc5d6e4ce15b38a7060` |
| **Errata HEAD** | `edc198e5b5924c7eb63e5e259d436ecc2a180b89` |
| **Supersedes for D8 axis** | Wall-clock misuse of `exposureSecondsEs` as `[t0, t0+Es)` horizon (rejected) |
| **Architect verdict** | B3+B2 **APPROVED**; test vectors **corrected v2**; U1–U6 **RESOLVED** |

## Architect decisions (locked)

| Decision ID | Value |
| --- | --- |
| `PRIMARY_D8_CLOCK` | **B3 — cumulative moving-exposure time** (τ, seconds) |
| `SECONDARY_METADATA` | **B2 — dual time domain** (wall + moving exposure diagnostics alongside τ) |
| `WALL_CLOCK_D8_PRIMARY` | **REJECTED** |
| `F03_THRESHOLDS` | **FROZEN** (`DS4_DBI_W0_RESEARCH_THRESHOLDS_V1`) |
| `F04_W0_REAL_ELIGIBILITY` | **`sealedRealC4StatisticalEligibility` always false** until W1 trusted loader |

## Normative references (code today)

| Artifact | Role |
| --- | --- |
| `deriveDs4DrivingExposureV1` (`ds4-assessment-driving-exposure.v1.ts`) | **Source of truth** for qualifying intervals and `exposureSeconds` |
| `DS4_ASSESSMENT_DRIVING_EXPOSURE_MAX_INTERVAL_GAP_S` (= 1) | Max credited step between consecutive speed labels |
| `MOTION_CORE_EVENT_GUARDS_V0_1_DEV.usableQualities` | Usable numeric speed qualities for exposure |
| `qualifiesExposureSample` | `MOVING` + `DIRECT` FSM at **both** endpoints of interval |
| `computeDs4DbiW0D8BurstinessFromObservationWindowV1` (`ds4-dbi-w0-mbf-kernel.v1.ts`) | **Current** D8 (wall-clock); implementation must migrate to τ per this contract |
| `DS4_DBI_W0_TRUSTED_SEALED_REAL_LOADER_ACTIVE_V1` | false — F04 not reopened |

---

## 1. Exposure parity rule

**Rule EP-1 (recompute authority).** Let `E*` be moving exposure seconds recomputed from the same payload inputs as `deriveDs4DrivingExposureV1`:

- sorted accepted speed rows (duplicate resolution per driving-exposure builder),
- FSM map on matching `bucketLabelUtc`,
- interval loop `i..i+1` with `dtS = (t_{i+1}-t_i)/1000`,
- credit `dtS` only when `0 < dtS ≤ 1`, both endpoints `qualifiesExposureSample`,
- sum → `movingExposureSecondsRecomputed` (= `E*` when `derivable`).

**Rule EP-2 (no wall-clock proxy).** `E*` MUST NOT be approximated by:

- `(maxLabel - minLabel)`,
- count of 1 Hz labels,
- `event_span_wall`,
- CSV `exposure_seconds_Es` without recompute.

**Rule EP-3 (metadata check).** Supplied `tripMeta.exposureSecondsEs` (or post-refactor `movingExposureSeconds`) is **advisory**. Implementation MUST emit:

- `movingExposureSecondsRecomputed: E*`,
- `movingExposureMetadataSupplied: Es_supplied`,
- if `derivable` and `|E* - Es_supplied| > ε`: reason `MBF_W0_MOVING_EXPOSURE_METADATA_MISMATCH` (new code, implementation tranche).

**ε (locked for research v1):** `max(1e-3, 1e-6 * max(E*, Es_supplied))` seconds — implementation tranche; until then contract requires explicit diagnostic field, not silent override.

**Rule EP-4 (provenance version).** `exposureProvenanceVersion` MUST equal `DS4_ASSESSMENT_DRIVING_EXPOSURE_PROVENANCE_V2` when parity logic runs.

---

## 2. Moving-time mapper (UTC → τ)

**Contract module (future):** `mapUtcMsToMovingExposureSecondsV1`

### 2.1 Eligible wall-clock intervals (half-open)

For consecutive speed labels at `L_i`, `L_{i+1}` with UTC milliseconds `t_i`, `t_{i+1}`:

- `dt = (t_{i+1} - t_i) / 1000`.
- **Eligible interval** `I_i = [t_i, t_{i+1})` (half-open at the later label) iff:
  - `0 < dt ≤ 1`,
  - `qualifiesExposureSample(speed(L_i), fsm(L_i))`,
  - `qualifiesExposureSample(speed(L_{i+1}), fsm(L_{i+1}))`.

**Excluded:** gaps with `dt > 1`, stationary/inferred endpoints, non-usable speed qualities, missing FSM, duplicate/conflicting labels (per driving-exposure dedupe).

### 2.2 Cumulative τ

Process eligible intervals in ascending `t_i`. Maintain `τ_end` (initial 0).

For each eligible `I_i = [t_i, t_{i+1})` with duration `dt`:

- Map wall times in `[t_i, t_{i+1})` to τ in `[τ_end, τ_end + dt)` linearly:
  - `τ(t) = τ_end + (t - t_i) / 1000` for `t ∈ [t_i, t_{i+1})`.
- Then `τ_end += dt`.

**Monotonicity:** τ is non-decreasing; strict increase only across credited `dt`.

**Prohibited:**

- nearest-neighbour snapping of event times to labels,
- inventing labels or intervals,
- interpolating τ across excluded (non-eligible) wall-time gaps (events in excluded regions are not assigned τ — see §3).

### 2.3 Anchor for D8 observation window (B3)

- **Observation window in τ:** `[0, E*)` where `E* = τ_end` after full pass (= moving exposure seconds).
- **NOT** `[τ_min, τ_min + Es_supplied)` and NOT wall-clock `[t0, t0+Es)`.

**τ_min event-only anchoring (rejected):** D8 MUST NOT reintroduce min(speed, event) wall anchor for primary binning under B3.

---

## 3. Event admission rules

**Inputs:** `events[]` with `quality`, `startLabel` (UTC); optional intensity metadata (U1: no widening).

**Counters (must appear in dual-time metadata):**

- `admittedEventCount`
- `excludedEventCount`
- `eventMappingReasonCodes[]` per excluded event (stable enum, implementation tranche)

### 3.1 Quality gate

| Condition | Treatment |
| --- | --- |
| `quality === 'OK'` | Continue |
| `DEGRADED` / `LIMITED` / `ARTEFACT_SUSPECT` / other | **Exclude** from D8 onset set; reason `MBF_W0_EVENT_QUALITY_NOT_OK_FOR_D8` |

(W0 kernel today filters `OK` only — frozen.)

### 3.2 Onset-based eligibility (primary)

For OK event with `t_ev = parseBucketLabelMs(startLabel)`:

- **Admit for D8 counting** iff ∃ eligible interval `I_i = [t_i, t_{i+1})` with `t_ev ∈ [t_i, t_{i+1})`.
- Map `τ_ev = mapUtcMsToMovingExposureSecondsV1(t_ev)` (must succeed; else exclude).

**Onset vs duration:** Event **duration** / `endLabel` does NOT expand admission; only **start** matters for binning and `nEv`. (Duration may be recorded later for Layer-2 parity; not in D8 IOD.)

### 3.3 Exclusion cases (non-exhaustive, locked intent)

| Case | Admission | Reason code (proposed) |
| --- | --- | --- |
| Start during stationary / non-DIRECT moving | Exclude | `MBF_W0_EVENT_START_OUTSIDE_MOVING_DIRECT_SUPPORT` |
| Start in gap (`dt>1` between surrounding labels) | Exclude | `MBF_W0_EVENT_START_IN_EXCLUDED_GAP` |
| Start on shared boundary `t_b` = upper bound of eligible `I_i` **and** lower bound of adjacent eligible `I_{i+1}` | **Admit** via `I_{i+1}` (`t_ev ∈ [t_b, t_{i+2})`) | — |
| Start on upper bound of eligible interval with **no** qualifying successor | Exclude | `MBF_W0_EVENT_START_ON_INTERVAL_UPPER_BOUNDARY` |
| Start equals `t_i` (lower bound of eligible `I_i`) | **Admit** if `I_i` eligible | — |
| Duplicate `startLabel` among OK events | **Fail-closed** trip (existing kernel) | `MBF_W0_FAIL_CLOSED_DUPLICATE_EVENT_START_TIME` |
| `t_ev` maps to τ outside `[0, E*)` | Exclude | `MBF_W0_EVENT_START_OUTSIDE_MOVING_EXPOSURE_HORIZON` |
| Unparseable label | Fail-closed | `MBF_W0_FAIL_CLOSED_EVENT_VALIDATION` |

### 3.4 Event timestamp uncertainty (U1 — locked)

**U1:** W0 performs **no** artificial uncertainty widening (no ±1s synthetic tolerance bands). If evidence cannot establish membership in an eligible half-open interval, the event start is **excluded** (or fail-closed when validation fails), not admitted via widened intervals.

---

## 4. Dual time metadata (B2 secondary)

**Type (research output extension):** `Ds4DbiW0DualTimeDomainDiagnosticsV1`

| Field | Type | Definition |
| --- | --- | --- |
| `clockDomain` | `'MOVING_EXPOSURE_PRIMARY' \| 'WALL_CLOCK_SECONDARY'` | Primary for D8 = moving exposure |
| `wallClockStartUtc` | ISO8601 \| null | **U4:** `min` over **accepted speed-label** series only (informational) |
| `wallClockEndUtc` | ISO8601 \| null | **U4:** `max` over accepted speed labels (informational) |
| `dimoTripBoundsUtc` | object \| null | **U4:** optional separate field when segment bounds are independently provenanced; **never** substitutes for B2 wall span |
| `elapsedWallClockSeconds` | number \| null | `(wallClockEndUtc - wallClockStartUtc)/1000` on label span — **never** used as Es |
| `movingExposureSeconds` | number | `E*` recompute |
| `qualifyingIntervalCount` | number | From driving-exposure provenance |
| `excludedGapCount` | number | From driving-exposure provenance |
| `admittedEventCount` | number | §3 |
| `excludedEventCount` | number | §3 |
| `eventMappingReasonCodes` | string[] | Aggregated distinct codes |
| `exposureProvenanceVersion` | string | `DS4_ASSESSMENT_DRIVING_EXPOSURE_PROVENANCE_V2` |

`tripMeta.exposureSecondsEs` remains transport from P2 CSV until renamed; after F01 implementation it is **compared** to `movingExposureSeconds`, not used as D8 horizon length.

---

## 5. D8 statistical contract (target under B3)

**Thresholds (FROZEN):** `burstWindowSeconds=60`, `minEventsD8=10`, `minNonEmptyWindowsD8=10`, `burstNextEventMaxSeconds=30`.

Let `W = 60` exposure seconds, `E* = movingExposureSeconds`, `n_adm` = admitted OK event starts.

### 5.1 Bins

- `K = max(1, ceil(E* / W))` **exposure-second slots** (not wall slots).
- Slot `k ∈ {0..K-1}` covers τ ∈ `[k·W, min((k+1)·W, E*))` — **half-open in τ**.
- **Partial final slot:** if `E* mod W ≠ 0`, slot `K-1` has width `(E* - (K-1)·W) < W` (locked).

**Empty slots:** included in `totalWindowSlots = K`; zero counts contribute to IOD variance.

### 5.2 Event-to-bin assignment

For each admitted event with exposure onset `τ_ev`:

- `k = floor(τ_ev / W)`, clamped to `K-1` (same clamp semantics as current kernel, applied on τ).

### 5.3 IOD (unchanged formula)

On slot counts `c_k` summing to `n_adm`:

- `mean = n_adm / K`
- `variance = (Σ c_k² - n_adm²/K) / (K-1)` if `K>1` else `0`
- `IOD = variance / mean` if `mean > 0`

### 5.4 shareNext

Sort admitted events by **UTC** `startLabel` ascending; consecutive pairs `(τ_i, τ_{i+1})`:

- `shareNext = #{i : (τ_{i+1}-τ_i) ≤ 30} / (n_adm-1)` if `n_adm > 1`.

**U2 (locked):** the 30-second `shareNext` threshold is measured in **moving exposure τ**, not wall-clock seconds.

### 5.5 ABSTAIN conditions (B3)

| Gate | Reason (existing unless noted) |
| --- | --- |
| Missing/invalid `E*` | `MBF_W0_NOT_EVALUABLE_D8_OBSERVATION_WINDOW` |
| `E* < W` | same |
| `n_adm < 10` | `MBF_W0_INSUFFICIENT_EVENTS_FOR_BURSTINESS` |
| nonempty slots `< 10` | `MBF_W0_INSUFFICIENT_WINDOWS_FOR_BURSTINESS` |
| **Significant** metadata mismatch (`|E* - Es_supplied| > ε`) | **U3:** D8 **ABSTAIN** with `MBF_W0_MOVING_EXPOSURE_METADATA_MISMATCH`; D4/D5/D6 **not** auto fail-closed |

Fail-closed trip integrity reasons unchanged (fingerprints, duplicates, forged sealed origin, etc.).

### 5.6 Current implementation delta (baseline at lock HEAD)

| Aspect | Current kernel | B3 target |
| --- | --- | --- |
| Horizon | `[t0, t0+Es_ms)` wall | `[0, E*)` τ |
| Bin axis | `(t - t0)` wall ms | `τ` exposure s |
| Es field | `tripMeta.exposureSecondsEs` as duration | `E*` recompute |

---

## 6. E9 alignment plan

### 6.0 Architecture bindings (U5, U6)

**U5 (locked):** D8 statistical core is **τ-native** (bins, IOD, shareNext on τ). UTC labels enter only through a **UTC→τ mapping adapter** at admission. E9 null Monte Carlo draws event onsets **directly in τ** on `[0, E*)`; harness may optionally invert to UTC labels for payload fixtures.

**U6 (locked):** Exposure mapper eligibility is exactly **`deriveDs4DrivingExposureV1`** (canonical usable qualities + MOVING+DIRECT FSM gate). **RELAXED** D4/D5 quality tiering MUST NOT silently expand credited moving exposure.

### 6.1 Reference null (primary for B3)

**`UNRESTRICTED_UNIFORM_ON_MOVING_EXPOSURE`:**

- Draw `n` independent onset times **uniform on the complete eligible exposure support** `[0, E*)` (continuous τ; discrete implementation uses sufficient resolution — e.g. millisecond τ ticks — without truncating `E*`).
- **Do not** silently exclude the **final exposure second**: the support is the credited moving horizon through `E*`, including time credited in a partial final bin of width `< 60s`.
- Evaluate D8 under B3 binning with **frozen** IOD formula and thresholds; report `P(KNOWN | n, E*, K)`.

### 6.2 Unequal-width exposure bins and null reference (science contract)

**Fact (documented, not a threshold change):** exposure bins `k = 0..K-1` have widths `w_k`:

- `w_k = 60` for `k < K-1`,
- `w_{K-1} = E* - (K-1)·60` when `E* mod 60 ≠ 0` (else `60` when `E*` is a multiple of 60).

**Unrestricted null timing:** uniform draws on `[0, E*)` imply **onset probability density uniform per exposure second**, hence probability mass in bin `k` is proportional to `w_k / E*` (not `1/K` when final bin is partial).

**Event placement under uniform τ onsets (given `n` events, IID):** marginal count in bin `k` is Binomial(`n`, `w_k/E*`) under ideal continuous uniform; empirical E9 batches estimate eligibility after **full** D8 gate stack.

**IOD null distribution under unequal widths:**

- Preregistered IOD formula remains `variance/mean` on slot counts `c_k` with fixed `K` and **empty bins included** (§5.3).
- Unequal `w_k` changes the **null distribution** of `{c_k}` vs equal-width wall bins; analytic references MUST be recomputed for `(n, E*, K)` with explicit `w_k` (implementation tranche).
- **No** change to `minEventsD8`, `minNonEmptyWindowsD8`, or burst window `60`.

**E9 alignment verdict:** unrestricted null is **scientifically consistent** with B3 when draws are uniform on `[0, E*)` and bin occupancy probabilities respect `w_k`; occupancy-enforcing constructions remain **separately labeled** and are not IID uniform on τ.

### 6.3 Occupancy-conditioned null

**`OCCUPANCY_ENFORCING_ON_MOVING_EXPOSURE`:** force ≥1 admitted onset in each of the first `min(10, K)` exposure slots (τ bins, possibly unequal final width). Label accurately; **not** conditional IID uniform on τ.

### 6.4 Required changes (implementation tranche, not this operation)

1. Replace wall `horizonMs = Es·1000` in offline E9 with τ horizon `E*`.
2. Regenerate analytic gate references for `(n, E*, K, w_k)` on τ axis.
3. Keep `externalEligibilityScaleEvidence` separate from batch empirical rates.
4. Update selection-hazard copy: censoring on **moving-exposure support** + frozen D8 gates.
5. **No** claim of real-world validity.

### 6.5 F03 thresholds

**Frozen** — only the **domain** of uniform draws and diagnostic clock metadata change under B3.

---

## 7. Deterministic test vectors (TV-F01 … TV-F10 + TV-F11)

Notation: labels are 1 Hz UTC strings; `M` = MOVING+DIRECT+OK speed; `S` = STATIONARY+DIRECT.

**Exposure identity:** for `N` contiguous 1 Hz labels in a qualifying MOVING+DIRECT run, `E* = N - 1` qualifying seconds (not `N`).

**Global synthetic trip meta unless noted:** `distanceKm=1`, `qualityTier=STRICT`, `evidenceOrigin=SYNTHETIC_CONTROL`.

**Frozen D8 gates (all vectors):** `K = ceil(E*/60)`, `minEventsD8=10`, `minNonEmptyWindowsD8=10`.

### TV-F01 — D8 KNOWN (720 labels) + independent D4/D5 baseline (200 labels)

| Field | D8 arm | D4/D5 baseline arm |
| --- | --- | --- |
| Labels | 720× `M`, `t0=2026-01-01T10:00:00Z` | 200× `M` (separate trip) |
| `E*` | **719** | **199** |
| Events | 12 OK at τ ∈ {0,60,120,180,240,300,360,420,480,540,600,660} | (not required for D4/D5 check) |
| `K` | 12 | — |
| D8 | **KNOWN** (12 distinct occupied bins ≥ 10; `n_adm=12`) | — |
| D4/D5 | — | **KNOWN** (unchanged baseline) |

**UTC→τ (continuous drive, linear):** `t0 + k s` wall → `τ = k` for `k ∈ [0,719]` on eligible span; example: `2026-01-01T10:11:00Z` → `τ=660`.

### TV-F02 — Stop-separated moving intervals

| Field | Value |
| --- | --- |
| Wall | 60 + 30 + 60 labels (`M`, `S`, `M`), 1 Hz contiguous |
| `E*` | **118** (= 59 + 59 qualifying intervals; not 120) |
| `elapsedWallClockSeconds` (label span) | **149** |
| Event | OK at wall offset **75** (stationary block) |
| Expected | `excludedEventCount=1`; no τ map for excluded onset |

### TV-F03 — Missing-speed gap (`dt>1`)

| Field | Value |
| --- | --- |
| Wall | `M` labels 0–59, missing label at +60s, `M` 61–120 |
| `E*` | **118** |
| Expected | `excludedGapCount≥1` |

### TV-F04 — Non-moving event start

| Field | Value |
| --- | --- |
| Wall | 120× `M` with `S` inject at wall offsets 50–55 |
| Event | OK start wall offset **52** |
| Expected | `admittedEventCount=0`, `excludedEventCount=1` |

### TV-F05 — Interval boundary admission (two cases)

| Case | Setup | Expected |
| --- | --- | --- |
| **F05-A** | Shared `t_b` between adjacent eligible `[t_i,t_b)` and `[t_b,t_{i+2})` | **Admit**; τ(`t_b`) = boundary τ |
| **F05-B** | `t_b` upper bound of last eligible interval, no qualifying successor | **Exclude** `MBF_W0_EVENT_START_ON_INTERVAL_UPPER_BOUNDARY` |

**UTC→τ example (F05-A):** at continuous `M`, UTC `10:05:00.000Z` is lower bound of `[10:05:00,10:05:01)` → admit with τ=300 (given prior credited exposure).

### TV-F06 — Duplicate event starts

| Field | Value |
| --- | --- |
| Events | two OK events, identical `startLabel` |
| Expected | trip fail-closed; D4–D8 stripped |

### TV-F07 — Exposure metadata mismatch (U3)

| Field | Value |
| --- | --- |
| `E*` (recomputed) | 719 |
| `Es_supplied` | 518 |
| Expected | diagnostic mismatch; **D8 ABSTAIN**; D4/D5/D6 **not** auto fail-closed |

### TV-F08 — Insufficient moving exposure horizon

| Field | Value |
| --- | --- |
| Labels | 45× `M` |
| `E*` | **44** |
| Events | 12 OK |
| Expected | D8 **ABSTAIN** `MBF_W0_NOT_EVALUABLE_D8_OBSERVATION_WINDOW` (`E* < 60`) |

### TV-F09 — Insufficient non-empty bins (partial final bin does not help)

| Field | Value |
| --- | --- |
| `E*` | **90** |
| `K` | **2** (bins [0,60), [60,90) width 30) |
| Events | 10 OK (max 2 non-empty slots) |
| Expected | D8 **ABSTAIN** `MBF_W0_INSUFFICIENT_WINDOWS_FOR_BURSTINESS` |

### TV-F10 — Event crossing movement boundary (duration)

| Field | Value |
| --- | --- |
| Event | OK start in `M`, end in `S` |
| Expected | **Admit onset**; duration does not veto; τ from start UTC |

### TV-F11 — Partial final bin D8 KNOWN (supplemental positive case)

| Field | Value |
| --- | --- |
| Continuous `M` labels | 666 labels → `E*=665` |
| `K` | **12** (`ceil(665/60)`) |
| Final bin | τ ∈ [660,665), **width 5s** |
| Events | 12 OK occupying ≥10 distinct bins |
| Expected | D8 **KNOWN** |

---

## 8. Machine-readable test index

Companion file: `DS4_DBI_W0_F01_B3_TEST_VECTORS_V1.json` (**version 2**, includes TV-F11).

---

## 9. Architect decisions U1–U6 (resolved)

| ID | Decision (locked) |
| --- | --- |
| **U1** | No artificial uncertainty widening; exclude ambiguous starts when eligible-interval membership cannot be established |
| **U2** | `shareNext` 30-second domain = moving exposure **τ** |
| **U3** | Significant `Es` metadata mismatch ⇒ **D8 ABSTAIN** + explicit diagnostic; unrelated metrics not auto fail-closed |
| **U4** | B2 wall fields = observed **accepted speed-label span**; DIMO trip bounds are separate, independently provenanced metadata |
| **U5** | τ-native D8 statistical core + UTC→τ adapter; E9 null samples **directly in τ** |
| **U6** | Mapper eligibility = `deriveDs4DrivingExposureV1`; RELAXED D4/D5 tier cannot silently expand moving exposure |

---

## 10. Gate validation audit (frozen thresholds)

| Vector | `E*` | `K=ceil(E*/60)` | Max non-empty slots | `n_adm` | D8 status | Consistent? |
| --- | ---: | ---: | ---: | ---: | --- | --- |
| TV-F01 D8 arm | 719 | 12 | 12 | 12 | KNOWN | yes |
| TV-F07 | 719 | 12 | — | — | ABSTAIN (mismatch) | yes |
| TV-F08 | 44 | 1 | — | 12 | ABSTAIN (`E*<60`) | yes |
| TV-F09 | 90 | 2 | 2 | 10 | ABSTAIN (windows) | yes |
| TV-F11 | 665 | 12 | ≥10 | 12 | KNOWN | yes |

No vector claims **KNOWN** without simultaneously satisfying `n_adm≥10` and achievable `nonEmpty≥10` under `K`.

---

## 11. Implementation readiness

**Ready for F01 implementation:** **YES** (spec v1.1, vectors v2, U1–U6 resolved). Kernel + executable pinned fixtures remain implementation tranche.

**Explicit non-effects:** no kernel/CLI motion changes; F03/F04/F02 frozen.

---

## Changelog

| Date (UTC) | Change |
| --- | --- |
| 2026-11-07 | Initial B3 contract lock document + JSON vectors |
| 2026-11-07 | **v1.1 errata:** corrected TV-F01..F10, TV-F11 partial-bin KNOWN, U1–U6 locked, E9 unequal-bin null science |
