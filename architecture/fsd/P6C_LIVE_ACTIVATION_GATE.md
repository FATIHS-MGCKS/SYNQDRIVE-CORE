# FSD P6C — live activation gate (fleet full discovery)

P6B delivers the **mechanism** (privileged CLI, owner env gates, budgets, inspector, persistence). **P6C** prepares **full** FSD3+FSD4 discovery for four production vehicles and adds an explicit human/process gate before the first production DIMO fleet dispatch.

## Blockers (must be cleared before live fleet execute)

1. **Planner pass** — `OFFLINE_PLAN` shows every vehicle plan `executable` under manifest budget; provider budget guard `ok`.
2. **Preflight pass** — `AUTHORIZED_READ_ONLY_PREFLIGHT` on the same manifest, bindings, and token fingerprints (per vehicle).
3. Operator on an **authorized host** with `FSD3_ONE_SHOT_HOST_ATTESTATION=1` and `SYNQDRIVE_FSD3_ONE_SHOT_LIVE_OWNER_AUTHORIZED=1` (no L2 signing layer; superseded P6B crypto removed).
4. **MASTER_ADMIN** principal with valid DIMO source-link operator authorization (per vehicle).
5. Architectural sign-off: fleet CLI is **process-scoped** — must **not** require enabling FSD on PM2 replicas.
6. Post-run **inspector** per vehicle for both FSD3 and FSD4 `runId`: ledger outcomes, no stranded `IN_PROGRESS`, no unexpected `UNKNOWN_OUTCOME` retry behavior.
7. **STOP=AWAIT_CHATGPT_REVIEW** — external review before any `--provider=live` fleet execute.

## Explicit non-goals (this preparation PR)

- No merge to `main` for live activation
- No production deploy
- No live DIMO requests in CI
- No `FSD3_ENABLED` / `FSD4_*` changes on PM2 replicas
- No scheduler / canary / public HTTP endpoint
- No automated live fleet execute path in tooling (live fleet execute throws until owner follow-up)

## Recommended command shape (post-review)

```bash
export FSD3_ONE_SHOT_HOST_ATTESTATION=1
export SYNQDRIVE_FSD3_ONE_SHOT_LIVE_OWNER_AUTHORIZED=1

# 1) Offline planner disclosure (no DB)
npx tsx backend/scripts/ops/fsd-fleet-full-discovery-one-shot.ts \
  --mode=OFFLINE_PLAN \
  --fleet-manifest=/secure/fsd-p6c-production-fleet.json

# 2) Authorized preflight (DB + operator auth)
npx tsx backend/scripts/ops/fsd-fleet-full-discovery-one-shot.ts \
  --mode=AUTHORIZED_READ_ONLY_PREFLIGHT \
  --fleet-manifest=/secure/fsd-p6c-production-fleet.json \
  --actor-user-id=<MASTER_ADMIN> \
  --provider=live

# 3) After ChatGPT/architecture GO — owner-authorized live execute (separate change)
```

See [`P6C_FLEET_FOUR_VEHICLE_RUNBOOK.md`](./P6C_FLEET_FOUR_VEHICLE_RUNBOOK.md) for manifest fields and request tables.

Legacy L2 approval / `l2-approval-file` references are **obsolete** (removed in P6B simplify).
