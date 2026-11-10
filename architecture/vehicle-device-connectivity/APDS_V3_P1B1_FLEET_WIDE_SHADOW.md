# APDS V3 P1B1 — Fleet-wide shadow (draft)

**Mode:** `SHADOW_ONLY` — separate kill switch `WORKER_APDS_V3_SHADOW_ENABLED` + activation version `WORKER_APDS_V3_SHADOW_ACTIVATION_VERSION=APDS_V3_SHADOW_ACTIVATION_V1`.

## FLEET_WIDE_ELIGIBILITY

Dynamic: operational registry vehicle + active DIMO `dataSourceLink` + connectivity not `DISCONNECTED`/`HARD_OFFLINE`. **No vehicle allowlist.**

## ZERO_ADDITIONAL_DIMO_REQUESTS

Hook: `DimoSnapshotProcessor` after existing P25 shadow observe-only path at **baseline physical poll start** only. No new scheduler, no extra DIMO fetch.

## Observation scope

`BASELINE_PHYSICAL_POLL_START_ONLY` — savings are **not** certified; bounded observation space when only actual baseline polls are visible.

## TWO_REPLICA_IDEMPOTENCY

Unique `(organizationId, vehicleId, physicalRequestId, policyVersion)` on `apds_v3_shadow_decisions`.

## KILL_SWITCH

`WORKER_APDS_V3_SHADOW_ENABLED` default off. Rate cap `WORKER_APDS_V3_SHADOW_MAX_WRITES_PER_MINUTE` (default 600/replica).
