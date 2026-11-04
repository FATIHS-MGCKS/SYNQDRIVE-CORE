# One Auto P4 E4 — full-data callback completion (repository)

**Epistemic:** Implemented in code · **runtime activation** still requires production env callback flags + owner-controlled live test.

## Completion mode

| Registry field | Execution-verified seed (post promotion PR) | Runtime activation |
|----------------|---------------------------------------------|--------------------|
| `asyncCompletionMode` | **`CALLBACK_FULL_DATA`** | Requires `ONEAUTO_CALLBACK_ENABLED` + `ONEAUTO_CALLBACK_FULL_DATA_ENABLED` |

Prior production deploys carried seed `NONE`; promotion is a **code/registry seed change** only — not live callback execution until flags are set and PM2 restarted.

## Provider contract (OpenAPI evidence)

Initial dispatch (when mode + flags active):

- `callback_url` → `POST {ONEAUTO_CALLBACK_PUBLIC_BASE_URL}/webhooks/oneauto/provider-callback/{token}`
- `return_data_in_callback=true` (forced for this mode — not tied to retrieval flag)

When registry is `CALLBACK_FULL_DATA` but callback env flags are **OFF**, initial dispatch **does not** register `callback_url` (fail-closed).

Callback POST body treated as documented **SUCCESS_RESULT_ERROR @ HTTP 200** shape only. No undocumented delivery guarantees assumed.

## Runtime flags (defaults OFF)

| Variable | Role |
|----------|------|
| `ONEAUTO_CALLBACK_ENABLED` | Master callback registration + ingress |
| `ONEAUTO_CALLBACK_FULL_DATA_ENABLED` | Enable full-data completion (**independent** of retrieval GET flag) |
| `ONEAUTO_CALLBACK_RETRIEVAL_GET_ENABLED` | **Notify-then-GET only** — unused by `CALLBACK_FULL_DATA` |

`ONEAUTO_CALLBACK_RETURN_DATA_IN_CALLBACK` is **not** read for `CALLBACK_FULL_DATA` dispatch (execution forces `return_data_in_callback=true`).

## Outbound provider GET count

| Path | Provider GETs |
|------|----------------|
| Async 202 + full-data callback success | **1** (initial only) |
| Sync 200 on initial | **1** |
| `CALLBACK_NOTIFY_THEN_GET` (PR3) | **2** (initial + retrieval) |

No polling. No automatic retries on provider queue (`attempts: 1`).

## Safety

- Delivery token SHA-256 lookup + inbox dedupe
- Tenant-scoped vehicle binding on completion
- Redacted inbox + response persistence
- Race: callback may complete while job `RUNNING`; initial 202 handler will not downgrade `SUCCEEDED`
- Malformed/incomplete payload → job `FAILED`, inbox retained

## Tests

- `backend/src/modules/oneauto-provider/oneauto-p4-e4-full-data-callback.spec.ts`
- `backend/src/modules/oneauto-provider/oneauto-p4-e4-registry-promotion.spec.ts`

## Activation runbook (owner — not automated)

1. Deploy registry promotion release to production
2. Live callback capture attestation with `return_data_in_callback=true`
3. Set `ONEAUTO_CALLBACK_ENABLED=1` and `ONEAUTO_CALLBACK_FULL_DATA_ENABLED=1` (+ rolling PM2 restart)
4. Keep `ONEAUTO_CALLBACK_RETRIEVAL_GET_ENABLED=false` for this mode
5. Single Master Admin execute — max one billable initial GET; await provider POST

See also: `P25E_C3_PRODUCTION_ONE_SHOT_RUNBOOK.de.md` (general one-shot discipline); PR3 notify-then-GET remains separate under `CALLBACK_NOTIFY_THEN_GET`.
