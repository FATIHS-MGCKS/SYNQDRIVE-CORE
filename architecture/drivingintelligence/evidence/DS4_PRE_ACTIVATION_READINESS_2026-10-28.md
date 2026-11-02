# DS4 pre-activation readiness — production read-only audit (2026-10-28)

**Mode:** read-only (SSH + Postgres + payload decode). **No writes, deploy, or flag changes.**

## Deployment baseline

| Field | Value |
|-------|--------|
| Release symlink | `/opt/synqdrive/releases/20261028125418_v4994` |
| `SYNQDRIVE_DEPLOYED_GIT_SHA` (both replicas) | `df9d89ad031f7b33bf65c3cd576aedd5d66d29d2` |
| PM2 | `synqdrive` → `:3001` online; `synqdrive-b` → `:3002` online |
| Redis scheduler lease | `synqdrive:scheduler:leader` present (TTL renewing) |

**Note:** `origin/main` @ `d40915b46` (#2218) is **not** on this production SHA (diverged release line).

## Code presence on production SHA

| PR | Deployed? | Evidence |
|----|-----------|----------|
| #2209 V2 intensity persistence | **YES** | Commit `c84eb6eed` on prod line; motion worker active |
| #2212 Assessment L2 | **NO** | No `ds4-trip-assessment-v1.engine.ts`; table `di_v0_ds4_trip_assessment_v1` missing |
| #2215 fleet-wide admission policy | **NO** | Not in prod git ancestry; no `DI_V0_DS4_FLEET_MOTION_GLOBAL_ROLLOUT_*` env |
| #2218 PR-A2 exposure/eligibility | **NO** | Not in prod git ancestry |

## Motion shadow data (142 succeeded runs)

| Metric | Count |
|--------|------:|
| Payload `eventRowContract = V2_INTENSITY_ORDINAL_V1` | 4 |
| Payload contract missing (legacy implicit V1) | 138 |
| Runs with `events[].intensity` objects | 4 |
| Distinct trips with succeeded motion | 91 |
| Speed authority partition (payload) | C4_ONLY 52 · C5_1_PREFERRED 45 · null 45 |

### Reference vehicles (calibration cohort)

| Vehicle role | Succeeded runs | V2-contract runs | Distinct trips |
|--------------|---------------:|-----------------:|---------------:|
| Tesla Model 3 | 38 | 0 | 22 |
| VW Tiguan | 42 | 3 | 33 |
| Audi A4 | 45 | 1 | 25 |
| VW Arteon | 17 | 0 | 11 |

## Active flags (shared `backend.env`, allowlist org `faa710c9-…`)

- S4: `DI_V0_S4_*` master/discovery/worker **ON** (four-vehicle allowlist)
- Motion-Core shadow: **ON** (`DI_V0_MOTION_CORE_SHADOW_WORKER_ENABLED=true`)
- C5.1 preferred speed: **ON**
- FSM gap bridge V1: **ON**
- DS4 assessment worker / global fleet rollout: **not set** (defaults OFF)
- `ordinalTripRatingApproved`: code default false (L2 not deployed)

## Activation dependency summary

See agent OUTPUT block `ACTIVATION_BLOCKERS` — production must deploy L2 stack + migrations before assessment persistence; V2 intensity contract must dominate new motion runs before ordinal L2 data collection.
