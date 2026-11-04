# Production VPS access and deployment — canonical runbook

**Status:** CURRENT_CANONICAL (DSRG-04, direct SSH standard restored 2026-10-12)  
**Repository baseline:** `main` — routine production deploy via **direct SSH** to `vps-deploy-release.sh` (owner-instructed Cursor agent).  
**Audience:** Cursor Cloud Agents, operators, and any agent performing Production VPS read-only audit or authorized deploy.

This document is the **single authoritative operational runbook** for SynqDrive Production on the **one Hostinger VPS**. It supersedes conflicting instructions that require mandatory VO5C operator sessions or Cloud Agent bootstrap for **routine** releases. Optional VO5C pinned-runner paths remain when production enforcement is **armed** on the VPS.

**Related governance (read before deploy):**

- [DEPLOYMENT_AUTHORIZATION.md](./DEPLOYMENT_AUTHORIZATION.md)
- [PINNING_AND_ATTESTATION.md](./PINNING_AND_ATTESTATION.md)
- [OS_PRIVILEGE_BOUNDARY.md](./OS_PRIVILEGE_BOUNDARY.md)
- [ROLLBACK_AND_CONTAINMENT.md](./ROLLBACK_AND_CONTAINMENT.md)
- [evidence/VO5C_CLOUD_AGENT_PINNED_BOOTSTRAP_INSTALL.md](./evidence/VO5C_CLOUD_AGENT_PINNED_BOOTSTRAP_INSTALL.md)
- [evidence/VO5C_CLOUD_AGENT_BOOTSTRAP_INSTALL_READINESS.md](./evidence/VO5C_CLOUD_AGENT_BOOTSTRAP_INSTALL_READINESS.md) (operator checklist; read-only until install authorized)

---

## A. Production identity

| Field | Current value |
|-------|----------------|
| **Host** | `srv1374778.hstgr.cloud` |
| **SSH port** | `22` |
| **SSH user (login principal)** | `synqdrive-admin` |
| **Transport** | **Direct public SSH** (Path A). **Not** Tailscale for routine Production operations. |
| **Application URL** | `https://app.synqdrive.eu` |
| **Privilege after login** | Selected deploy operations use **`sudo -n -H`** (passwordless, scoped). Login is **not** `root`. |

### Credential source

| Source | When it applies |
|--------|------------------|
| **Existing on-disk key** | `~/.ssh/id_ed25519` when already provisioned (`cloud-agent-start.sh` or prior bootstrap). `CLOUD_AGENT_SSH_PRIVATE_KEY` may be **unset**. |
| **Cursor Runtime Secret** | `CLOUD_AGENT_SSH_PRIVATE_KEY` — materialized by `cloud_agent_materialize_ssh_key` when the on-disk key is absent. |

**Never** print, commit, or log private-key material.

### Host-key verification (mandatory)

Production scripts (`cloud-agent-ssh-common.sh`) **fail closed** for `*hstgr.cloud*` hosts:

- Require a **pre-verified** host key in `CLOUD_AGENT_SSH_KNOWN_HOSTS_FILE` or `~/.ssh/known_hosts`.
- Use **`StrictHostKeyChecking=yes`** with that file — **no** blind `ssh-keyscan` append on deploy or EXP021 remote bootstrap entrypoints.
- Verify fingerprints out-of-band (Hostinger panel, prior operator record, or org policy) before first connect.

### SSH preflight (Cloud Agent / operator workstation)

```bash
bash .cursor/scripts/cloud-agent-ssh-preflight.sh
bash .cursor/scripts/cloud-agent-verify-vps.sh
```

`cloud-agent-ssh-preflight.sh` reports identity presence, optional public fingerprint, and **BatchMode** auth against `synqdrive-admin@srv1374778.hstgr.cloud:22`.

Manual SSH (strict host key):

```bash
ssh -p 22 -i "$HOME/.ssh/id_ed25519" -o BatchMode=yes -o IdentitiesOnly=yes \
  -o StrictHostKeyChecking=yes -o UserKnownHostsFile="$HOME/.ssh/known_hosts" \
  synqdrive-admin@srv1374778.hstgr.cloud 'id -un; hostname'
```

Expected: `synqdrive-admin` and host identity `srv1374778` (or documented equivalent).

---

## B. Cursor Cloud Agent — repository contract (direct SSH)

| Step | Behavior |
|------|----------|
| Env | `CLOUD_AGENT_VPS_HOST=srv1374778.hstgr.cloud` (default). **Do not** use `mein-vps.internal` for routine Production. |
| User | `cloud_agent_ssh_user` maps `*hstgr.cloud*` + unset/`root` → **`synqdrive-admin`**. |
| Tailscale | Optional Path B only when `TAILSCALE_AUTH_KEY` is set. |
| Owner authorization | **`CLOUD_AGENT_OWNER_DEPLOY_AUTHORIZED=1`** when the owner explicitly requested production deploy in the Cursor task (replaces mandatory VO5C operator session for routine releases). |
| Deploy entry | `CLOUD_AGENT_OWNER_DEPLOY_AUTHORIZED=1 bash .cursor/scripts/cloud-agent-deploy.sh` after push (or explicit SHA). |

### B.2 Optional VO5C pinned bootstrap (not required for routine deploy)

| Field | Value |
|-------|--------|
| Routine Path A | **Direct SSH** → validated `vps-deploy-release.sh` (DSRG-05 / PR #1998+) |
| Bootstrap status | `vo5c-cloud-agent-pinned-deploy-bootstrap.sh` — **optional** delegate when enforcement armed or operator policy requires pin-only entry |
| VPS path (when installed) | `/opt/synqdrive/shared/vo5c-cloud-agent-pinned-deploy-bootstrap.sh` |
| Agent rule | **Do not** require VO5C operator session or bootstrap for owner-authorized `cloud-agent-deploy.sh` when `VO5C_PRODUCTION_DEPLOY_ENFORCEMENT_ACTIVE` is **not** set on the VPS |
| Install procedure | [evidence/VO5C_CLOUD_AGENT_PINNED_BOOTSTRAP_INSTALL.md](./evidence/VO5C_CLOUD_AGENT_PINNED_BOOTSTRAP_INSTALL.md) |

### B.3 `cloud-agent-deploy.sh` flow (canonical when enforcement inactive)

1. Optional `cloud-agent-verify-vps.sh`.
2. **SSH identity** + **trusted host key** + **`cloud_agent_ssh_auth_preflight`**.
3. Owner deploy ack (`CLOUD_AGENT_OWNER_DEPLOY_AUTHORIZED=1`).
4. Git preflight: clean tree, `HEAD` == `origin/main` (or explicit `CLOUD_AGENT_REQUESTED_DEPLOY_SHA`).
5. **CI gate (non-bypassable):** latest `CI gate (all critical jobs)` check run **completed/success** on `REQUESTED_DEPLOY_SHA` (`deploy-ci-gate.mjs` / `gh`; no skip env).
6. SSH → for **`synqdrive-admin`**: `sudo -n -H env SYNQDRIVE_REQUESTED_DEPLOY_SHA=<sha> bash /opt/synqdrive/current/backend/scripts/ops/vps-deploy-release.sh` (path validated under `/opt/synqdrive/…`; **no** login shell). Existing VPS sudo grants elevation to run the release script only — this PR does **not** add new sudoers fragments.
7. Public health check (`https://app.synqdrive.eu/api/v1/health`).

| Exit | Meaning |
|------|---------|
| `0` | Release OK + public health OK |
| `2` | Release OK; public health failed |
| `3` | P4B16 partial success (replicas OK; attestation reconciliation) |
| `4` | Monitoring outcome failure (from release script) |
| `41` | Missing `CLOUD_AGENT_OWNER_DEPLOY_AUTHORIZED=1` |
| `46` | VPS `vps-deploy-release.sh` missing |

**Agents must never** set `SYNQDRIVE_VO5C_DEPLOY_AUTHORIZED=1`.

### Optional VO5C path (enforcement armed only)

When `/opt/synqdrive/shared/vo5c-production-deploy-authority.env` sets `VO5C_PRODUCTION_DEPLOY_ENFORCEMENT_ACTIVE=1`, direct `vps-deploy-release.sh` from non-pinned trees is **blocked** — use pinned `vps-vo5c-run-pinned-security-deploy.sh` with operator authorization. Cloud Agent bootstrap (`vo5c-cloud-agent-pinned-deploy-bootstrap.sh`) remains an **optional** delegate, not installed by default.

---

## C. Read-only Production audit

| Concept | Source |
|---------|--------|
| **ACTUAL_RUNNING_SHA** | `git -C "$(readlink -f /opt/synqdrive/current)" rev-parse HEAD` when git metadata exists |
| **Pinned executor** | `/opt/synqdrive/shared/vo5c-pinned-executor.env` → `SYNQDRIVE_PINNED_EXECUTOR_ROOT` + `SYNQDRIVE_PINNED_EXECUTOR_SHA` |
| **`SYNQDRIVE_DEPLOYED_GIT_SHA` in `backend.env`** | May be stale — verify runtime separately |

Safe read-only examples (on VPS as `synqdrive-admin`):

```bash
readlink -f /opt/synqdrive/current
git -C "$(readlink -f /opt/synqdrive/current)" rev-parse HEAD 2>/dev/null || true
source /opt/synqdrive/shared/vo5c-pinned-executor.env
git -C "$SYNQDRIVE_PINNED_EXECUTOR_ROOT" rev-parse HEAD
curl -sS http://127.0.0.1:3001/api/v1/health
curl -sS http://127.0.0.1:3002/api/v1/health
```

**EXP021 Gate-6 / GLOBAL_KILL / APDS / Battery / RFRF:** read-only audit does **not** authorize flag changes, kill toggles, or activation epochs. See [CROSS_MODULE_DEPENDENCIES.md](./CROSS_MODULE_DEPENDENCIES.md).

---

## D. Canonical deployment procedure

Deployment requires **explicit owner instruction** (Cursor: `CLOUD_AGENT_OWNER_DEPLOY_AUTHORIZED=1`), exact **40-character** `SYNQDRIVE_REQUESTED_DEPLOY_SHA`, and **accepted CI** on that SHA (aggregate gates **success** — cancelled is not pass).

### D.1 Cloud Agent (routine)

```bash
bash .cursor/scripts/cloud-agent-ssh-preflight.sh
git push origin main   # when deploying main tip
CLOUD_AGENT_OWNER_DEPLOY_AUTHORIZED=1 bash .cursor/scripts/cloud-agent-deploy.sh
```

Explicit approved SHA (not necessarily `main` tip):

```bash
CLOUD_AGENT_OWNER_DEPLOY_AUTHORIZED=1 \
CLOUD_AGENT_SKIP_GIT_PREFLIGHT=1 \
CLOUD_AGENT_REQUESTED_DEPLOY_SHA=<40-char-hex> \
bash .cursor/scripts/cloud-agent-deploy.sh
```

Remote execution: `vps-deploy-release.sh` on VPS — DB backup → clone at SHA → admission/security floor inside release → migrate → rolling **A/B** (3001/3002) → **P4B16** → public health.

### D.2 Optional VO5C pinned runner (break-glass / enforcement)

When enforcement is armed or operator policy requires pin-only entry:

```bash
export SYNQDRIVE_VO5C_DEPLOY_AUTHORIZED=1
export SYNQDRIVE_REQUESTED_DEPLOY_SHA=<40-char-hex>
bash "${SYNQDRIVE_PINNED_EXECUTOR_ROOT}/backend/scripts/ops/vps-vo5c-run-pinned-security-deploy.sh"
```

Optional Cloud Agent bootstrap path: see [VO5C_CLOUD_AGENT_PINNED_BOOTSTRAP_INSTALL.md](./evidence/VO5C_CLOUD_AGENT_PINNED_BOOTSTRAP_INSTALL.md) — **not** required for routine deploy.

### D.3 Post-deploy attestation

Verify from **runtime**: `current` HEAD, both replicas on target SHA, health/readiness, single scheduler leader, `backend.env` SHA256 per scope, P4B16 status, safety flags (GLOBAL_KILL, APDS, Battery) unchanged unless separately authorized.

---

## E. Environment change scope

| Scope | Authorization |
|-------|----------------|
| Application deploy (release, PM2, build) | Owner deploy + pinned runner / Cloud Agent path above |
| `backend.env` / `SYNQDRIVE_DEPLOYED_GIT_SHA` | **Separate** explicit scope |
| APDS epoch, Battery publication, EXP021 S4, Global Kill | **Never** side effects of routine deploy |
| VPS bootstrap install | **Separate** operator procedure; not implied by merge #1991 |

---

## F. Emergency recovery

```
SSH fails?
├─ Wrong user (root)? → synqdrive-admin (CURRENT)
├─ No trusted host key? → Verify fingerprint; update known_hosts (no blind keyscan on production path)
├─ KEY_MISSING? → Baked ~/.ssh/id_ed25519 or CLOUD_AGENT_SSH_PRIVATE_KEY
├─ AUTH_FAILURE with correct user? → Stop; no Tailscale/root rotation without owner
└─ Break-glass → Hostinger console (owner authorization only)

Deploy fails?
├─ Exit 44/45 → Bootstrap not installed or integrity failure (install doc)
├─ Exit 42 → Session file / authorization
├─ Exit 3 → P4B16 partial — `SYNQDRIVE_P4B16_RECONCILE_AUTHORIZED=1` + `backend/scripts/ops/vps-reconcile-release-attestation.sh --expected-sha <sha>` (attestation only; see `architecture/dsrg/evidence/P4B16_R1C_STALE_COMMITTED_RECOVERY.md`)
└─ Post-promotion → VO5C rollback if eligible (ROLLBACK_AND_CONTAINMENT.md)
```

---

## G. Legacy and non-canonical (do not use for current Production)

| Item | Classification |
|------|----------------|
| `root@srv1374778.hstgr.cloud` | **OUTDATED** — use `synqdrive-admin` |
| `mein-vps.internal` / routine Tailscale deploy | **HISTORICAL Path B** — not current Production transport |
| Shallow-fetch `vps-deploy-release.sh` from agent workspace to VPS | **NOT USED** |
| Mandatory VO5C operator session + Cloud Agent bootstrap for routine deploy | **RETIRED** (optional when enforcement armed) |
| Deploy without exact SHA + CI success | **FORBIDDEN** |

Historical evidence (EXP021 S4F-7X, older deploy reports) remains **HISTORICAL**; follow this runbook for **current** operations.

---

## H. Evidence

- DSRG-04 introduction: [evidence/DSRG_04_PRODUCTION_VPS_ACCESS_RUNBOOK.md](./evidence/DSRG_04_PRODUCTION_VPS_ACCESS_RUNBOOK.md)
- SSH RCA (EXP021-S4P8): [evidence/DSRG_SSH_RCA_CLOUD_AGENT_VPS_ACCESS_2026-10-12.md](./evidence/DSRG_SSH_RCA_CLOUD_AGENT_VPS_ACCESS_2026-10-12.md)
- Consolidation contract: [evidence/DSRG_DEPLOYMENT_CONSOLIDATION_SINGLE_VPS.md](./evidence/DSRG_DEPLOYMENT_CONSOLIDATION_SINGLE_VPS.md)

Update this runbook when Production transport, principal, bootstrap install status, or deploy entrypoints change.
