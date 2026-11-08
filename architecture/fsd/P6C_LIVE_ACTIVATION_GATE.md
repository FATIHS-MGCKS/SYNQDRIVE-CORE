# FSD P6C — Live activation gate (after P6B)

P6B delivers the **mechanism** (CLI, L2 contract, budgets, inspector). **P6C** is the explicit human/process gate before the first production DIMO dispatch.

## Blockers (must be cleared outside empty env arrays)

1. Signed owner **L2 approval** JSON on file for the exact executable SHA, tenant, vehicle, source link, discovery request key, budget, and validity window.
2. Operator on an **authorized host** with `FSD3_ONE_SHOT_HOST_ATTESTATION=1` and verified MASTER_ADMIN principal.
3. **Preflight pass** (`AUTHORIZED_READ_ONLY_PREFLIGHT`) immediately before execute on the same binding and token fingerprint.
4. Architectural sign-off on dual-replica / PM2 env policy: one-shot CLI must **not** require enabling FSD on existing app replicas.
5. Post-run **inspector** review: ledger outcomes, no stranded `IN_PROGRESS`, no unexpected `UNKNOWN_OUTCOME` retry behavior.

## Explicit non-goals for P6B PR

- No merge to `main` for live activation
- No production deploy
- No `FSD3_ENABLED` / allowlist changes on PM2 replicas
- No scheduler, canary, or public HTTP endpoint
- No live DIMO in CI

## Recommended first live command shape (post-P6C)

```bash
export FSD3_ONE_SHOT_HOST_ATTESTATION=1
export FSD3_ONE_SHOT_FORCE_MOCK_PROVIDER=0   # only after P6C sign-off

npx tsx backend/scripts/ops/fsd3-live-discovery-one-shot.ts \
  --mode=AUTHORIZED_READ_ONLY_PREFLIGHT \
  ... # scope + l2-approval-file

# After human review of preflight JSON:
npx tsx backend/scripts/ops/fsd3-live-discovery-one-shot.ts \
  --mode=EXECUTE \
  --provider=live \
  ...
```
