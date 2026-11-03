# VSI HF negative evidence semantics — P1

**Operation:** `VSI_HF_NEGATIVE_EVIDENCE_SEMANTICS_P1`  
**Production baseline (unchanged):** `a500a0503f4af575ef0ab1494caab9884ea565c2`  
**Status:** Design + implementation PR (no production deploy, reconciliation remains OFF)

## Problem (root cause)

After HF discovery activation, historical axis rows that HF did not re-evaluate retained P1b placeholders with `notEvaluatedReason: SNAPSHOT_EXTRACTOR_NOT_RUN`. That token is **snapshot-axis semantics** and misstates historical HF state (36 production rows). Merge preserved stale historical placeholders when HF incoming inventory omitted union keys present only from snapshot materialization.

## Contract changes

| Axis | Change |
|------|--------|
| Snapshot | Unchanged; `SNAPSHOT_EXTRACTOR_NOT_RUN` remains valid on snapshot only. |
| Historical (P1b seed) | New default `HF_HISTORICAL_NOT_ATTEMPTED` from snapshot extractor. |
| Historical (HF pass) | Dedicated HF reasons; **never** `SNAPSHOT_EXTRACTOR_NOT_RUN`. |

New / explicit historical `NOT_EVALUATED` reasons:

- `HF_HISTORICAL_NOT_ATTEMPTED`
- `HF_NO_ATTRIBUTABLE_TRIPS`
- `HF_MIRROR_UNAVAILABLE` (CH unavailable)
- `HF_MIRROR_INCOMPLETE`
- `HF_READ_FAILED`
- `HF_QUERY_TIMEOUT`
- `HF_UNION_SIGNAL_CAP_OMITTED`
- `LINK_ATTRIBUTION_AMBIGUOUS`
- `HF_SIGNAL_NOT_MIRRORED` (reserved in contract; gated when mirror contract evidence exists)

Replaceable historical placeholders (HF merge may overwrite): `HF_HISTORICAL_NOT_ATTEMPTED`, legacy historical `SNAPSHOT_EXTRACTOR_NOT_RUN`, `INVENTORY_NOT_REFRESHED`, `DISCOVERY_FEATURE_DISABLED`.

## Union-key strategy

Historical evaluation iterates the bounded union:

1. Persisted native inventory keys (snapshot materialization head), sorted.
2. CH aggregate keys not already persisted, sorted.

Cap: **32 signals** (`VSI_DISCOVERY_CH_MAX_INVENTORY_SIGNALS`). Persisted names win when truncated. Omitted union members emit `NOT_EVALUATED` + `HF_UNION_SIGNAL_CAP_OMITTED` — never `EVALUATED_NOT_OBSERVED`.

## Negative evidence gates

For each selected union key, historical state is derived only after:

1. Not union-cap omitted.
2. CH available (not global `UNAVAILABLE`).
3. Source-link attribution not ambiguous for the evaluation window.
4. At least one attributable trip in the 14-day / 20-trip bounded window.
5. Per-signal query failure → `HF_READ_FAILED`; global timeout flag → `HF_QUERY_TIMEOUT`.
6. **All** attributable trips queried successfully (`SUCCESS` or `EMPTY`) → else `HF_MIRROR_INCOMPLETE`.
7. Complete attributable queries + zero points → `EVALUATED_NOT_OBSERVED` with window metadata (not inferred from missing CH rows alone without trip queries).

## HF mirror completeness policy

- Trip-scoped CH aggregates with tenant + vehicle + trip predicates; 12k points/signal cap; 15s execution budget unchanged.
- Incomplete trip sweep → fail-closed `HF_MIRROR_INCOMPLETE` for negative claims.
- Per-signal failed trip aggregate → `HF_READ_FAILED` for that signal only when query failed with signal row hint.

## Merge semantics

- Snapshot axis: unchanged by HF updates; P1b snapshot placeholder still defers to persisted snapshot.
- Historical axis: incoming HF evaluation replaces replaceable placeholders; `pickHistoricalEvaluationAxis` prevents downgrading stronger prior `EVALUATED_OBSERVED` on incomplete later runs **within the same window**.
- **Refresh failure retention (P1 hardening):** when a newer HF pass fails closed (`HF_READ_FAILED`, `HF_MIRROR_INCOMPLETE`, `HF_QUERY_TIMEOUT`, `HF_MIRROR_UNAVAILABLE`) but persisted historical axis is `EVALUATED_OBSERVED`, merge **keeps** the verified positive evaluation and timestamps; the failure reason is recorded on `entry.ingestionLimitations` (no schema change).
- HF-only keys keep snapshot placeholder until snapshot evaluation runs.

## Before / after (illustrative)

**Before (production-class bug):**

```json
"historical": {
  "evaluation": {
    "state": "NOT_EVALUATED",
    "notEvaluatedReason": "SNAPSHOT_EXTRACTOR_NOT_RUN"
  }
}
```

**After HF pass with attributable trips and zero HF points:**

```json
"historical": {
  "evaluation": { "state": "EVALUATED_NOT_OBSERVED" },
  "sampleMetadata": {
    "windowStartAt": "…",
    "windowEndAt": "…",
    "pointCount": 0,
    "tripCountWithPoints": 0
  }
}
```

**After cap omission:**

```json
"notEvaluatedReason": "HF_UNION_SIGNAL_CAP_OMITTED"
```

## Migration impact

- **DB migration:** none (JSONB inventory shape unchanged).
- **Operational:** next HF materialization (or future reconcile when enabled) rewrites historical axis for union keys; semantic profile fingerprint/revision unchanged.
- **Rollback:** revert deploy; persisted inventory JSON remains valid; historical reasons may revert to pre-fix behavior until re-materialized.

## Rollout plan

1. Merge PR after owner review + CI green.
2. Deploy with existing HF flag ON (owner-approved release only).
3. Allow natural materialization per vehicle/profile (no reconcile flag).
4. Validate: no historical `SNAPSHOT_EXTRACTOR_NOT_RUN` on profiles after HF refresh; snapshot axis stable.

## Rollback plan

1. Revert application SHA.
2. No schema rollback required.
3. Optional: owner-triggered reconcile later (still OFF by policy until separate approval).

## Reconciliation readiness

Reconcile assessment treats historical `SNAPSHOT_EXTRACTOR_NOT_RUN`, `HF_HISTORICAL_NOT_ATTEMPTED`, mirror incomplete/read/timeout, and union-cap omission as refreshable when reconciliation is enabled in a future change. This PR does **not** enable reconciliation.

## Safety preserved

Tenant/vehicle/trip/link fencing, 14-day lookback, 20 trips, 12k points/signal, 32-signal cap, 15s timeout, operational JSONB CAS, APDS AS_OF isolation, RPM/LV/trip FSM unchanged.
