# DSRG — Change ledger (canonical append-only)

**Canonical location** (Standard §4 migration, DSRG-03 R2): this file.  
**Compatibility:** [`../CHANGE_LEDGER.md`](../CHANGE_LEDGER.md) redirects here — do not append to root file.

| Date (UTC) | ID | Change | Production impact |
|------------|-----|--------|-------------------|
| 2026-10-10 | **DSRG-01** | Document DSRG authority; map VO5C P4B12–P4B16; record P6 pin promotion seal | None (docs) |
| 2026-10-10 | **DSRG-01-A** | Fix pinned runner `exec` → `exec bash` for git-clean `vps-deploy-release.sh` (100644); execution-contract selftest | Merged PR #1970 |
| 2026-10-10 | **DSRG-01-R1** | Runner must be invoked from pinned ops dir (not `/current`); preflight from pin | Merged PR #1970 |
| 2026-10-11 | **DSRG-02-R0** | Read-only preflight for pin `40c6dd9` → `448a889` | None |
| 2026-10-11 | **DSRG-02-R1** | VPS pin promotion; config pointer only; `40c6dd9` tree preserved | Live app unchanged |
| 2026-10-11 | **DSRG-02-R2** | Final seal + evidence `DSRG_02_PIN_REPROMOTION_2026-10-11.md` | None (audit/docs) |
| 2026-10-11 | **DSRG-03-R0** | Central registry row + authority bootstrap; **no** `AUTHORITY_ACTIVE` | None (docs/audit) |
| 2026-10-11 | **DSRG-03-R1** | Manifest metadata final gate for PR #1973 | None (docs) |
| 2026-10-11 | **DSRG-03-R2** | Knowledge graph, validators, Production R2 reconciliation, ledger migration | None (docs/audit) |
| 2026-10-11 | **DSRG-03-R3** | Final authority audit; R3 Production + SQL; Gate A split; execution inventory; graph via registry CI chain | None (docs/audit) |
| 2026-10-11 | **DSRG-03-R4** | Graph validator isolated deps (`architecture/dsrg/scripts`); no backend `npm ci`; negative fixture self-test; break-glass prerequisites BG-A–F; `BREAK_GLASS_READY=NOT_VERIFIED` | None (docs/validators) |
| 2026-10-11 | **DSRG-03-R5** | Correct break-glass VPS paths to `/opt/synqdrive/shared/`; recovery mechanisms classified NOT_VERIFIED where unproven | None (docs) |
| 2026-10-11 | **DSRG-03-R6** | Propose registry `AUTHORITY_ACTIVE`; Gate A revalidated; runtime enforcement explicitly not promoted | None (docs/registry) |
| 2026-10-11 | **P4B16-R0** | Read-only VPS attestation audit; code inventory; lifecycle design; offline test matrix; no ops script changes | None (docs/audit) |
| 2026-10-11 | **P4B16-R0A** | Design correction: journal publication, PM2 consumer matrix, per-replica runtime identity, entrypoint coverage | None (docs) |
| 2026-10-11 | **P4B16-R1A** | Durable attestation libs + offline selftest; **not** wired to deploy/Production | None (repo-only; NOT_DEPLOYED) |
| 2026-10-11 | **P4B16-R1A-MIN** | Minimalism pass: drop journal/phase machine; delegate replica verify to existing ops lib | None (repo-only) |
| 2026-10-11 | **P4B16-R1B** | Wire attestation into `vps-deploy-release.sh` + `vps_replica_rollback`; partial-success exit 3; offline integration selftest | None (repo-only; NOT_DEPLOYED) |
| 2026-10-12 | **DSRG-DEPLOY-CONSOLIDATION** | Single-VPS contract: cloud-agent → pinned runner; connectivity staging fail-closed; deploy outcome/monitoring exit 4; docs/skill harmonization | None (repo-only) |
| 2026-10-12 | **DSRG-DEPLOY-CONSOLIDATION-R2** | Operator session parse-without-source; tar-stream pinned delegate; enforcement ACTIVE allows pinned path; executable offline selftests (mock SSH); `DEPLOY_ATTESTATION_STATUS` committed vs legacy_unprotected | None (repo-only) |
| 2026-10-12 | **DSRG-DEPLOY-CONSOLIDATION-R3** | Cloud Agent session-file-only auth; shared-path canonicalization + symlink escape; immutable monitoring-fail exit 4; documented tar-stream root trust boundary | None (repo-only) |
| 2026-10-12 | **DSRG-DEPLOY-CONSOLIDATION-R4** | Fixed VPS bootstrap contract; tar-stream removed; Cloud Agent fail-closed until bootstrap installed; install doc + offline bootstrap selftests | None (repo-only; bootstrap NOT installed on prod) |
| 2026-10-12 | **DSRG-DEPLOY-CONSOLIDATION-R4.1** | sudo -n bootstrap preflight/invoke for synqdrive-admin; verify lib + pinned impl/session SHA256 before source; sudoers install contract; execution selftests | None (repo-only) |
| 2026-10-12 | **DSRG-DEPLOY-CONSOLIDATION-R4.2** | Trusted co-installed verify lib runs independent git/worktree integrity (`vo5c_bootstrap_verify_pinned_executor_tree_trusted`) before sourcing any pin-tree library; negative selftests for tampered security-floor/admission | None (repo-only) |
| 2026-10-12 | **DSRG-DEPLOY-CONSOLIDATION-R5** | Integrate EXP021-S4P8 SSH RCA into #1991: synqdrive-admin mapping, identity preflight, trusted host-key policy (no blind keyscan), preserve VO5C bootstrap + R4.2; rebase onto main incl. DIMO R3.1 | None (repo-only) |
| 2026-10-12 | **DSRG-04-R6** | Canonical Production VPS runbook reconciled to merged #1991; bootstrap readiness checklist; `docs/runbooks/00-canonical-production-vps.md`; AGENTS/DSRG cross-links; legacy root/Tailscale/legacy deploy marked historical | None (docs; bootstrap NOT installed on prod) |
| 2026-10-12 | **DSRG-05-DIRECT-SSH** | Owner policy: restore routine production deploy via `cloud-agent-deploy.sh` → SSH → `vps-deploy-release.sh`; `CLOUD_AGENT_OWNER_DEPLOY_AUTHORIZED=1` replaces mandatory VO5C session/bootstrap; `deploy-ci-gate.mjs`; VO5C pinned runner optional when enforcement armed | None until merge + owner deploy (repo-only) |
| 2026-10-12 | **DSRG-05-HARDEN** | Remove `CLOUD_AGENT_SKIP_CI_GATE`; paginate GitHub check-runs; evaluate latest critical gate per name (stale success cannot mask newer failure) | None (repo-only) |
| 2026-10-12 | **DSRG-05-PR2000** | `synqdrive-admin` remote invoke: `sudo -n -H env SYNQDRIVE_REQUESTED_DEPLOY_SHA=… bash <validated vps-deploy-release.sh>` (no `-lc`); CI gate GET pagination selftests; runbook B.2/B.3 VO5C bootstrap optional; EXP021-S4P10 production deploy evidence | Production deploy S4P10 at `09fd5d72` (authorized); repo hotfix PR #2000 |
| 2026-10-27 | **DSRG-CI-GATE-IDENTITY** | Legal Documents `workflow_dispatch` supplies validated `audit_baseline_sha` via existing `audit-dependencies.sh` harness; `deploy-ci-gate.mjs` selects canonical Vehicle Detail workflow gate (ignore homonymous Legal checks); regression selftests | None (repo-only; no deploy) |
| 2026-10-31 | **DSRG-CI-ZERO-BEFORE-BASELINE** | Legal Documents push events with GitHub all-zero `before` resolve dependency audit baseline via verified `merge-base` with `origin/main` (fail-closed otherwise); regression harness extended | None (repo-only; CI) |

Historical VO5C deploy-governance entries remain in [`../../vehicle-onboarding/research/CHANGE_LEDGER.md`](../../vehicle-onboarding/research/CHANGE_LEDGER.md) — reference only.
