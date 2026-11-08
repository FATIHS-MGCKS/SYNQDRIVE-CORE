# FSD P6B — Direct production one-shot runbook (first live test)

**Prerequisites:** Merged release on production VPS (`/opt/synqdrive/current`), global FSD PM2 flags **OFF**, one **active** DIMO source link for the target vehicle.

**This document does not authorize deploy or live execution.** Owner must explicitly instruct deploy and live run in Cursor.

## 1. Deploy (owner-authorized)

1. Confirm green `CI gate (all critical jobs)` on release SHA.
2. Owner: `CLOUD_AGENT_OWNER_DEPLOY_AUTHORIZED=1` → `cloud-agent-deploy.sh`.
3. Verify `https://app.synqdrive.eu/api/v1/health` and release SHA on both replicas.

## 2. Preconditions (read-only)

| Check | Command / action |
|-------|------------------|
| Target vehicle | Confirm org id, vehicle id, DIMO link id, `discoveryRequestKey` (new UUID per attempt) |
| Actor | ACTIVE platform user with `MASTER_ADMIN`; use real Clerk/user id as `--actor-user-id` |
| Global FSD | `FSD3_*` / `FSD4_*` orchestration and provider execution **disabled** in PM2 env (unchanged) |
| FSD4 | No historical orchestration for this test |
| Budget cap | 2 discovery requests, 26 snapshot fields (CLI default) |

## 3. Preflight (no DIMO writes beyond DB read)

On production VPS as `synqdrive-admin`:

```bash
cd /opt/synqdrive/current/backend
export FSD3_ONE_SHOT_HOST_ATTESTATION=1
export SYNQDRIVE_RELEASE_SHA="<deployed-sha>"
npx tsx scripts/ops/fsd3-live-discovery-one-shot.ts \
  --mode=AUTHORIZED_READ_ONLY_PREFLIGHT \
  --provider=live \
  --organization-id=<org> \
  --vehicle-id=<vehicle> \
  --link-id=<link> \
  --actor-user-id=<master-admin-user-id> \
  --discovery-request-key=<uuid>
```

Expect JSON `PREFLIGHT_OK` with `dimoVehicleId`, `dimoTokenId`, `connectionIdentityFingerprint`.

## 4. Live execute (owner env — do not run without owner ack)

Owner sets in the **same shell session**:

```bash
export SYNQDRIVE_FSD3_ONE_SHOT_LIVE_OWNER_AUTHORIZED=1
export FSD3_ONE_SHOT_HOST_ATTESTATION=1
export SYNQDRIVE_RELEASE_SHA="<deployed-sha>"
```

Then:

```bash
npx tsx scripts/ops/fsd3-live-discovery-one-shot.ts \
  --mode=EXECUTE \
  --provider=live \
  --organization-id=<org> \
  --vehicle-id=<vehicle> \
  --link-id=<link> \
  --actor-user-id=<master-admin-user-id> \
  --discovery-request-key=<same-uuid-as-preflight>
```

Expect `EXECUTE_LIVE` with `runId`, `terminalStatus` (`COMPLETED` or documented partial/failure).

## 5. Inspect result (read-only)

```bash
export FSD3_ONE_SHOT_HOST_ATTESTATION=1
npx tsx scripts/ops/fsd3-discovery-run-inspector.ts \
  --organization-id=<org> \
  --run-id=<runId> \
  --actor-user-id=<master-admin-user-id>
```

## 6. Rollback / stop

- Do **not** enable PM2 FSD orchestration flags.
- Deactivate source link via existing P5B lifecycle ops if the vehicle must not be retried.
- Duplicate `discoveryRequestKey` replays persisted outcome (no extra provider budget consumption).

## 7. Explicit non-goals

- No fleet-wide execution
- No canary/shadow mode
- No FSD4 historical run
- No automatic scheduler activation

`STOP=AWAIT_OWNER_DEPLOY_AUTHORIZATION`
