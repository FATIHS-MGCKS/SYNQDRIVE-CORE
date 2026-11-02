# DS4 Layer-2 P4E A2 — kind-scoped zero-load correction

**Operation:** `DS4_LAYER2_P4E_A2_KIND_SCOPED_ZERO_LOAD`  
**Root cause:** Trip-level `zeroLoadValid` in `computeDs4LongitudinalLoadObservablesV1` denied kind-scoped true zeros when the other kind had admissible events.

## Affected cohort cells (pinned 11 trips)

| Trip | Kind | Before (P2 export) | After |
|------|------|-------------------|-------|
| `c0448fea-e7c3-4658-b2fd-417c452f70d7` | Acceleration | `B/I/Φ/S` empty (UNAVAILABLE) | `0` / `0` / `0` / `0` |
| `dfc7c443-d847-4d31-8c84-9c0f11e47e1e` | Deceleration | `B/I/Φ/S` empty (UNAVAILABLE) | `0` / `0` / `0` / `0` |

All other trip×kind load cells match the attested P2 reconstruction CSV. **129/129** longitudinal event rows unchanged (fixture checksums unchanged).

## Gate semantics (A2)

Per kind, `zeroLoadValid` when:

- Trip exposure gates open (`canComputeMetrics`)
- `collectionComplete`
- Zero admissible events **of that kind**
- No UNRATED/EXCLUDED intensity records **of that kind**
- Trip has ≥1 admissible event **or** trip-level zero-load (both kinds absent, no exclusions)

UNCALIBRATED exposure gate, B/I/Φ/S formulas, admission classes, and event detection are unchanged.
