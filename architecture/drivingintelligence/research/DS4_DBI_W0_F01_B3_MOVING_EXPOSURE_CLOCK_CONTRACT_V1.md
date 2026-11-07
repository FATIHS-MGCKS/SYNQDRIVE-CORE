# DS4 DBI W0 — F01 B3 Moving-Exposure Clock Contract (v1)

| Field | Value |
| --- | --- |
| **Contract ID** | `DS4_DBI_W0_F01_B3_MOVING_EXPOSURE_CLOCK_CONTRACT_V1` |
| **Status** | `PREREGISTERED_IMPLEMENTATION_SPEC` (documentation only; **not** implemented in kernel at lock time) |
| **PR** | #2353 |
| **Lock HEAD** | `9ec0e4c1a5d1888f2f5ccfc5d6e4ce15b38a7060` |
| **Supersedes for D8 axis** | Wall-clock misuse of `exposureSecondsEs` as `[t0, t0+Es)` horizon (rejected) |

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

**Inputs:** `events[]` with `quality`, `startLabel` (UTC); optional intensity metadata (see unresolved).

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
| Start on exact `t_{i+1}` boundary (open end of `I_i`) | Exclude | `MBF_W0_EVENT_START_ON_INTERVAL_UPPER_BOUNDARY` |
| Start equals `t_i` (lower bound) | **Admit** if `I_i` eligible | — |
| Duplicate `startLabel` among OK events | **Fail-closed** trip (existing kernel) | `MBF_W0_FAIL_CLOSED_DUPLICATE_EVENT_START_TIME` |
| `t_ev` maps to τ outside `[0, E*)` | Exclude | `MBF_W0_EVENT_START_OUTSIDE_MOVING_EXPOSURE_HORIZON` |
| Unparseable label | Fail-closed | `MBF_W0_FAIL_CLOSED_EVENT_VALIDATION` |

### 3.4 Event timestamp uncertainty

Persisted shadow rows may carry intensity uncertainty in V2 contracts; W0 MBF payload events today **lack** `startUncertaintyS` on `DiV0MotionCoreShadowPersistedEventRow`. **UNRESOLVED-U1:** whether ±1s label uncertainty widens onset intervals for admission — **default at implementation: ignore until W1**; document only.

---

## 4. Dual time metadata (B2 secondary)

**Type (research output extension):** `Ds4DbiW0DualTimeDomainDiagnosticsV1`

| Field | Type | Definition |
| --- | --- | --- |
| `clockDomain` | `'MOVING_EXPOSURE_PRIMARY' \| 'WALL_CLOCK_SECONDARY'` | Primary for D8 = moving exposure |
| `wallClockStartUtc` | ISO8601 \| null | `min(t_0 speed label)` in accepted series (informational) |
| `wallClockEndUtc` | ISO8601 \| null | `max(t_last speed label)` (informational) |
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

**Note:** 30-second threshold is **30 exposure seconds** under B3 (locked with primary clock). **UNRESOLVED-U2:** architect confirmation that shareNext must not remain wall-clock seconds — contract assumes exposure-seconds for B3 consistency.

### 5.5 ABSTAIN conditions (B3)

| Gate | Reason (existing unless noted) |
| --- | --- |
| Missing/invalid `E*` | `MBF_W0_NOT_EVALUABLE_D8_OBSERVATION_WINDOW` |
| `E* < W` | same |
| `n_adm < 10` | `MBF_W0_INSUFFICIENT_EVENTS_FOR_BURSTINESS` |
| nonempty slots `< 10` | `MBF_W0_INSUFFICIENT_WINDOWS_FOR_BURSTINESS` |
| Metadata mismatch | `MBF_W0_MOVING_EXPOSURE_METADATA_MISMATCH` (diagnostic; ABSTAIN policy **UNRESOLVED-U3**) |

Fail-closed trip integrity reasons unchanged (fingerprints, duplicates, forged sealed origin, etc.).

### 5.6 Current implementation delta (baseline at lock HEAD)

| Aspect | Current kernel | B3 target |
| --- | --- | --- |
| Horizon | `[t0, t0+Es_ms)` wall | `[0, E*)` τ |
| Bin axis | `(t - t0)` wall ms | `τ` exposure s |
| Es field | `tripMeta.exposureSecondsEs` as duration | `E*` recompute |

---

## 6. E9 alignment plan

### 6.1 Reference null (primary for B3)

**`UNRESTRICTED_UNIFORM_ON_MOVING_EXPOSURE`:**

- Draw `n` independent τ-offsets uniform on `[0, E* - 1s)` **exposure seconds** (discrete ms implementation detail: `[0, round(E*)·1000 - 1000)` to mirror current ms habit).
- Convert each draw to **synthetic UTC** only for harness fixtures via inverse mapper along eligible intervals (**harness-only** inverse; kernel ingestion still uses real UTC labels on payload).
- Evaluate D8 under B3 binning; report eligibility rate `P(KNOWN | n, E*, K)`.

### 6.2 Occupancy-conditioned null

**`OCCUPANCY_ENFORCING_ON_MOVING_EXPOSURE`:** force ≥1 event in each of the first `min(10, K)` exposure slots (not wall bins). Label accurately; **not** conditional IID uniform.

### 6.3 Required changes (implementation tranche, not this operation)

1. Replace `horizonMs = Es·1000` wall in offline E9 Monte Carlo with `E*·1000` exposure horizon.
2. Regenerate analytic gate references for `(n, E*, K)` on τ axis (supersedes Es=660 wall analytic at fixed n=12).
3. Keep `externalEligibilityScaleEvidence` separate from batch empirical rates.
4. Update selection-hazard copy to state censoring is on **moving-exposure support gate**.
5. **No** claim of real-world validity.

### 6.4 F03 thresholds

**Frozen** — only the **domain** of uniform draws changes from wall to τ.

---

## 7. Deterministic test vectors (TV-F01 … TV-F10)

Notation: labels are 1 Hz UTC strings; `M` = MOVING+DIRECT+OK speed; `S` = STATIONARY+DIRECT; `·` = gap/excluded.

**Global synthetic trip meta for vectors unless noted:** `distanceKm=1`, `qualityTier=STRICT`, `evidenceOrigin=SYNTHETIC_CONTROL`.

### TV-F01 — Continuous driving baseline (unchanged D4/D5; B3 D8 reference)

| Field | Value |
| --- | --- |
| Purpose | Regression guard: D4/D5 unchanged; B3 D8 KNOWN on continuous move |
| Wall series | 200× `M` @ 40 km/h, `t0=2026-01-01T10:00:00Z` |
| Events | 12 OK starts at τ = 0,55,110,… exposure seconds (place on wall via mapper inverse positions on eligible span) |
| `E*` | 199 s (199 qualifying intervals) |
| Expected τ map | linear identity on eligible span |
| D8 | `KNOWN`, `K=ceil(199/60)=4`, `n_adm=12`, `nonEmpty≥10` |
| D4/D5 | `KNOWN` (same as pre-F01) |

### TV-F02 — Stop-separated moving intervals

| Field | Value |
| --- | --- |
| Wall | 60s `M` + 30s `S` + 60s `M` (labels contiguous 1 Hz) |
| `E*` | 120 (stop intervals excluded) |
| `elapsedWallClock` | 149 s label span |
| Event | OK start at second 75 wall (inside stop) |
| Expected | `excludedEventCount≥1`, excluded reason gap/stop; D8 uses only starts with τ in eligible regions |

### TV-F03 — Missing-speed gap (`dt>1`)

| Field | Value |
| --- | --- |
| Wall | `M` labels 0–59, **no label at +60s**, resume `M` 61–120 |
| `E*` | 59 + 59 = 118 (gap breaks qualifying chain) |
| Expected | `excludedGapCount≥1` in provenance mirror |

### TV-F04 — Non-moving event start

| Field | Value |
| --- | --- |
| Wall | 120s all `M` |
| Event | OK start timestamp inside injected `S` segment |
| Expected | exclude event; `admittedEventCount` does not increment |

### TV-F05 — Exact interval upper boundary

| Field | Value |
| --- | --- |
| Wall | Two eligible intervals sharing boundary `t_b` |
| Event | `startLabel` exactly at `t_{i+1}` of first interval |
| Expected | **Exclude** (half-open upper bound); reason `…_UPPER_BOUNDARY` |

### TV-F06 — Duplicate event starts

| Field | Value |
| --- | --- |
| Events | two OK events same `startLabel` |
| Expected | fail-closed; D4–D8 values stripped |

### TV-F07 — Exposure metadata mismatch

| Field | Value |
| --- | --- |
| Recomputed `E*` | 120 |
| Supplied `exposureSecondsEs` | 518 (pinned-style mismatch) |
| Expected | diagnostic `MOVING_EXPOSURE_METADATA_MISMATCH`; D8 uses **E*** not 518; ABSTAIN-on-mismatch **UNRESOLVED-U3** (spec recommends KNOWN if E* sufficient but flag mismatch) |

### TV-F08 — Insufficient moving exposure (`E* < 60`)

| Field | Value |
| --- | --- |
| Wall | 45s `M` only |
| `E*` | 44 |
| Events | 12 OK (synthetic) |
| Expected | D8 `ABSTAIN` `NOT_EVALUABLE_D8_OBSERVATION_WINDOW` |

### TV-F09 — Partial final exposure bin

| Field | Value |
| --- | --- |
| `E*` | 90 |
| `K` | 2 (slots [0,60), [60,90)) |
| Events | 10 uniform τ-spread admits |
| Expected | `KNOWN` if `nonEmpty≥10`; verify last bin width 30s exposure |

### TV-F10 — Event crossing movement boundary (duration spans stop)

| Field | Value |
| --- | --- |
| Event | OK with `start` in `M`, `end` in `S` |
| Expected | **Admit onset** if start ∈ eligible interval; duration does not veto |

---

## 8. Machine-readable test index

Companion file: `DS4_DBI_W0_F01_B3_TEST_VECTORS_V1.json` (same directory).

---

## 9. Unresolved architecture decisions

| ID | Topic | Status |
| --- | --- | --- |
| U1 | Event `startUncertaintyS` / label ±1s widening | NOT_DECIDED — default ignore in W0 impl |
| U2 | `shareNext` 30s in τ vs wall | **Proposed:** τ; awaiting architect sign-off |
| U3 | ABSTAIN vs WARN on exposure metadata mismatch | NOT_DECIDED |
| U4 | DIMO segment bounds vs speed label span for B2 wall fields | NOT_DECIDED |
| U5 | Inverse mapper for E9 harness (UTC synthesis) vs τ-only internal D8 API | NOT_DECIDED — prefer τ-native D8 API + harness adapter |
| U6 | RELAXED quality tier for mapper speed qualities | NOT_DECIDED (D4/D5 tiering ≠ mapper tiering today) |

---

## 10. Implementation readiness

**Ready for F01 implementation:** **CONDITIONAL** — core B3/B2 rules and TV-F01..F10 specified; resolver decisions U1–U6 required before merge to kernel.

**Explicit non-effects (this lock operation):** no kernel/CLI motion changes; F03/F04/F02 frozen.

---

## Changelog

| Date (UTC) | Change |
| --- | --- |
| 2026-11-07 | Initial B3 contract lock document + JSON vectors |
