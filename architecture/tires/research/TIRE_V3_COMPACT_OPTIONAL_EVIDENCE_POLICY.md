# Tire AI `tire_v3_compact` — optional field evidence policy (P2A)

Read-only architecture review supporting production activation of the compact LLM contract.
**LLM output is never independent evidence.**

## Evidence classes (proposed)

| Class | Meaning |
|-------|---------|
| **CONFIRMED_SIDEWALL** | Operator photo / manual registration of sidewall marks (RFT, XL, EV, 3PMSF, Alpine symbol) |
| **VERIFIED_MANUFACTURER** | Tire-specific catalog sheet or EPREL record tied to exact size/LI/SI/variant |
| **VERIFIED_LABEL** | EU tire label scan (QR/EPREL ID) linked to the mounted tire |
| **UNKNOWN** | No independent proof — field must remain null in persisted spec |

Current **`applyCompactEvidenceGate`** (knowledge LLM path): all **OPTIONAL** keys null; **`newTreadDepthMm`** null unless `catalogNominalTreadEvidence === true`.

---

## Per-field review

### `evOptimized`

| Question | Answer |
|----------|--------|
| Observable from markings? | Often **EV** / **Electric** sidewall marking; not always present on EV lines |
| V3 consumes? | **Yes** — `resolveArchetype` → `ev_optimized`; `resolveExpectedLifeKm` +3% when true |
| Model identity sufficient? | **Partially** — product name (e.g. Pilot Sport EV) implies EV but is not sidewall proof |
| Independent evidence required | **CONFIRMED_SIDEWALL** or **VERIFIED_MANUFACTURER** variant sheet |
| Setup data can supply? | Manual registration / AI upload sidewall review (future) |
| Nulling loses useful info? | **Yes** if only `evOptimized` is stripped but **`tireArchetype: ev_optimized`** remains from CORE LLM |
| Recommendation | Keep null on knowledge LLM; allow **VERIFIED_MANUFACTURER** when variant catalog confirms EV compound |

### `severeSnowMarked` / `iceMarked`

| Question | Answer |
|----------|--------|
| Observable from markings? | **Yes** — 3PMSF (severe snow), Alpine (ice) symbols on sidewall/label |
| V3 consumes? | **Indirect** — not in wear math; season/archetype and compliance UX |
| Model identity sufficient? | **No** — winter line ≠ auto 3PMSF on every size |
| Independent evidence | **CONFIRMED_SIDEWALL** or **VERIFIED_LABEL** |
| Setup data | Registration photo, label OCR after AI upload confirm |
| Nulling loses info? | **Yes** for fleet winter compliance signaling |
| Recommendation | Do not trust LLM; persist only with **VERIFIED_LABEL** or confirmed registration capture |

### `matchedVariant`

| Question | Answer |
|----------|--------|
| Observable? | Sidewall full marketing name / MO-S etc. |
| V3 consumes? | **Minimal** — identity/display; not wear formula inputs today |
| Model identity sufficient? | **No** — many variants share size |
| Independent evidence | **VERIFIED_MANUFACTURER** catalog row |
| Nulling loses info? | Low for V3 math; medium for apply/bind accuracy |
| Recommendation | Keep null from LLM; populate from catalog job or user-confirmed variant |

### `oeHomologation`

| Question | Answer |
|----------|--------|
| Observable? | **Yes** — MO, ★, AO markings |
| V3 consumes? | **No** in wear V3 prior |
| Model identity sufficient? | **No** |
| Independent evidence | **CONFIRMED_SIDEWALL** |
| Recommendation | Optional tier; persist only with sidewall/label proof |

### EU label fields (`euRollingResistanceClass`, `euWetGripClass`, `euExternalNoiseDb`, `euExternalNoiseClass`)

| Question | Answer |
|----------|--------|
| Observable? | **Yes** — EU label (EPREL) |
| V3 consumes? | **No** in current wear V3 formulas |
| Model identity sufficient? | **No** — label is per tire ID |
| Independent evidence | **VERIFIED_LABEL** (EPREL ID) |
| Nulling loses info? | Low for V3; medium for efficiency/safety UX |
| Recommendation | Never from knowledge LLM; EPREL/OCR path only |

### `utqgTreadwear`

| Question | Answer |
|----------|--------|
| Observable? | **Yes** — US sidewall UTQG |
| V3 consumes? | **No** in EU-centric V3 prior |
| Model identity sufficient? | **No** |
| Independent evidence | **CONFIRMED_SIDEWALL** (US market tires) |
| Recommendation | Keep null from LLM; optional for US fleet later |

---

## Aggregate evidence policy recommendation

1. **Keep** knowledge-LLM path fail-closed for OPTIONAL + nominal depth.
2. **Introduce tiered persist flags** (future, not this PR): `labelEvidence`, `catalogEvidence`, `sidewallEvidence` — mirror `catalogNominalTreadEvidence` pattern.
3. **Promote to CORE only** fields that are both **setup-bound** (LI/SI/size) or **validated marks** — do **not** promote EU label fields to LLM-CORE.
4. **Season**: store LLM `seasonType` as **hint only**; **`setup.tireSeason` remains authoritative for V3** (`resolveArchetypeAndSeason`). Add UI conflict warning when LLM season ≠ setup (no silent overwrite).

---

## Season consistency (P2 simulated 2/9)

| Case | LLM (simulated) | Reference | Setup | Classification |
|------|-----------------|-----------|-------|----------------|
| **W2** Alpin 6 | `all_season` | `winter` (verified line) | `WINTER` | **LLM misclassification** — distinct winter product, not reference ambiguity |
| **A2** CrossClimate 2 | `summer` | `all_season` (slight marketing blur) | `ALL_SEASON` | **LLM misclassification** vs setup; reference tagged **AMBIGUOUS_PRODUCT_LINE** but operational truth follows setup |

**V3 behavior preserved:** `wear-v3-prior` uses setup season for archetype fallback when archetype missing; LLM season mismatch does not mutate setup.

---

## V3 consumer impact summary

| Compact field | V3 wear prior | Notes |
|---------------|---------------|-------|
| Identity CORE | Indirect (initial tread fallback order) | Authoritative ctx + apply guards (PR2264) |
| `tireArchetype` CORE | **High** | Expected life, initial tread, thresholds |
| `runFlat` / `xl` / `reinforced` CORE | Archetype / load modeling edges | LLM may fill; verify via sidewall for trust |
| `newTreadDepthMm` | Used only if in range and present | Gate keeps null → archetype defaults |
| OPTIONAL (EU/EV/snow) | **Not in formula** | UX/compliance only if persisted later |

No V3 formula changes in P2A.
