# FSD P6B — Privileged one-shot FSD3 execution (simplified, direct production)

Status: **simplified operator CLI** — no fleet scheduler, FSD4 off by default, no L2 crypto framework.

## Purpose

Run **one** FSD3 catalog + snapshot discovery for **one** explicitly selected vehicle with existing SynqDrive orchestration, persistence, DIMO budget, and P5B source-link fences. Production live DIMO requires **owner env authorization**, not Ed25519 trust stores.

## Entrypoints

| Artifact | Role |
|----------|------|
| `backend/scripts/ops/fsd3-live-discovery-one-shot.ts` | Operator CLI (`tsx`) |
| `backend/scripts/ops/fsd3-discovery-run-inspector.ts` | Read-only run inspector |
| `backend/src/modules/vehicle-intelligence/fsd-integration/ops/fsd-discovery-ops.module.ts` | Minimal Nest context (mock/CI) |
| `backend/src/modules/vehicle-intelligence/fsd-integration/ops/fsd3-one-shot-live-bootstrap.module.ts` | Slim live DIMO slice for EXECUTE `--provider=live` |

## Modes

| Mode | Behavior |
|------|----------|
| `AUTHORIZED_READ_ONLY_PREFLIGHT` | MASTER_ADMIN + active DIMO link + identity fingerprint; **no** provider HTTP, **no** discovery writes |
| `EXECUTE` | Preflight then orchestration. CI/local: `--provider=mock`. Production live: `--provider=live` + owner gates below |

## Authorization (fail-closed, no crypto layer)

1. **Operator shell ack** — `FSD3_ONE_SHOT_HOST_ATTESTATION=1` in the invoking shell (preflight, execute, inspector).
2. **MASTER_ADMIN** — `DimoSourceLinkOperatorAuthorizationService` binds `actorUserId` to org / vehicle / source link.
3. **Live owner ack** — for `--provider=live` EXECUTE only: `SYNQDRIVE_FSD3_ONE_SHOT_LIVE_OWNER_AUTHORIZED=1` **and** host attestation (see `fsd3-one-shot-live-owner-gate.v1.ts`).
4. **P5B + persistence** — active source link, DIMO dispatch binding, idempotent `discoveryRequestKey`, lease fencing, UNKNOWN_OUTCOME handling unchanged.
5. **PM2 FSD flags** — remain **OFF**; one-shot CLI enables FSD3 only inside the process via `buildFsd3OneShotCliOrchestrationConfigV1` (single vehicle). **FSD4** default-off.

## Budget (hard cap V1)

- `maxRequestsPerRun = 2` (catalog + at most one snapshot in FSD discovery ledger)
- `maxSnapshotFieldsPerDocument = 26`
- `maxResponseBytes = 524288`
- No historical discovery in default cap
- DIMO JWT/auth outside the 2-request ledger still applies; provider budget service enforces in-flight caps on live path

## Removed (prior P6B drafts)

Pre-Node git attestation, trusted launcher, HMAC preflight tickets, HMAC execution capabilities, Ed25519 owner approvals, trust-store files, `fsd3-live-owner-approval-sign.ts`. Superseded signing doc: `P6B_OWNER_APPROVAL_TRUST_PROVISIONING.md` (historical).

## Tests

- Unit: host attestation, live owner gate, CLI FSD3 config, inspector edge, live bootstrap slice.
- PostgreSQL: preflight fences, mock execute, idempotency, concurrent serialize, inspector.
- CI: `backend/scripts/test/fsd2-persistence-postgres-ci.sh`, FSD P5A workflow.

## First production live

See **`architecture/fsd/P6B_DIRECT_PRODUCTION_ONE_SHOT_RUNBOOK.md`**. Deploy first; owner authorizes env; single vehicle; inspect result. **No deploy or live execute without explicit owner instruction.**

## Change record

| When | What |
|------|------|
| 2026-11-08 | Simplified P6B: direct `tsx` CLI, MASTER_ADMIN + dual env for live, retained orchestration/budget/idempotency |
