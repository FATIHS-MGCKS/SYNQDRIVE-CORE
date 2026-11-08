# FSD P6B — Privileged one-shot FSD3 execution (V1)

Status: **draft implementation** — no production activation, no PM2 FSD flag changes.

## Purpose

Provide a minimal, auditable, explicitly authorized **one-shot** entrypoint for FSD3 catalog/snapshot discovery. Reuses existing orchestration, persistence, DIMO adapter factory, request ledger, and P5B source-link fences without forking discovery logic.

## Entrypoints

| Artifact | Role |
|----------|------|
| `backend/scripts/ops/fsd3-live-discovery-one-shot.ts` | Operator CLI |
| `backend/scripts/ops/fsd3-discovery-run-inspector.ts` | Read-only run inspector |
| `backend/src/modules/vehicle-intelligence/fsd-integration/ops/fsd-discovery-ops.module.ts` | Minimal Nest context (no AppModule, HTTP, Bull, cron) |

## Modes

1. **OFFLINE_PLAN** — Parses L2 approval JSON and prints planned scope/budget. No `DATABASE_URL`, no provider, no writes.
2. **AUTHORIZED_READ_ONLY_PREFLIGHT** — DB reads: MASTER_ADMIN operator auth, active DIMO link fence, identity fingerprint. No provider calls, no discovery mutations.
3. **EXECUTE** — Full orchestration after preflight. **CI and local dev:** `--provider=mock` or `FSD3_ONE_SHOT_FORCE_MOCK_PROVIDER=1`. Live DIMO only on an explicitly authorized host with owner L2 approval (P6C gate).

## Authorization layers (fail-closed)

1. **Host attestation** — `FSD3_ONE_SHOT_HOST_ATTESTATION=1` in the operator shell (not owner approval).
2. **Platform operator** — ACTIVE `MASTER_ADMIN` with org/vehicle/link binding (`DimoSourceLinkOperatorAuthorizationService`).
3. **Owner L2 approval** — signed envelope `FSD3_LIVE_OWNER_APPROVAL_V1` (Ed25519 over canonical payload) binding: **git-attested** executable release SHA, org, vehicle, source link, discovery request key, `liveProvider`, budget cap, validity window. Trusted public keys via `FSD3_LIVE_OWNER_APPROVAL_TRUST_KEYS_JSON` or `FSD3_LIVE_OWNER_APPROVAL_TRUST_KEYS_FILE`. Sign off-repo with `scripts/ops/fsd3-live-owner-approval-sign.ts` + `FSD3_OWNER_L2_SIGNING_KEY_PEM_FILE`.
4. **Executable SHA attestation** — `resolveFsd3OneShotExecutableReleaseShaV1()` uses `git rev-parse HEAD` + clean tree (no `--executable-release-sha` CLI override).
5. **Execution capability** — HMAC-bound token minted only after preflight + verified approval in-process; execution rejects forged preflight/approvalReference passthrough.
6. **Process-scoped FSD3 gates** — CLI builds orchestration config with FSD3 enabled for **one** vehicle and `providerExecutionEnabled=true`. Does **not** read PM2 replica env. FSD4 remains default-off for the process.
7. **P5B fences** — `assertActiveSourceLinkForDispatch` and persistence invalidation semantics unchanged.

Empty `FSD3_LIVE_ACTIVATION_BLOCKERS_V1` in orchestration config is **not** used as the authorization decision for this CLI.

## Budget (hard cap V1)

- `maxRequestsPerRun = 2` (catalog + at most one snapshot)
- `maxSnapshotFieldsPerDocument = 26`
- `maxResponseBytes = 524288`
- No historical requests in the default P6B cap
- L2 approval budget must match cap exactly; no CLI override to increase limits.

## Rollback

- Do not merge or enable PM2 FSD flags.
- One-shot runs are keyed by `discoveryRequestKey`; inspector is read-only.
- Deactivate source link via existing P5B lifecycle ops to invalidate in-flight runs.

## Tests

- Unit: L2 approval, host attestation, CLI FSD3/FSD4 config, ops module bootstrap.
- PostgreSQL: preflight fences, mock execute, idempotent duplicate request key, inspector.
- CI: `backend/scripts/test/fsd2-persistence-postgres-ci.sh` and FSD P5A workflow.
