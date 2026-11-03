# One Auto P4 PR-2 — async job lifecycle (AWAITING_PROVIDER)

**Epistemic status:** Implementation from P4 forensics — **no live provider calls in this PR**.

## Behavior

| Provider HTTP | SynqDrive job status | Outbound provider GETs after initial |
|---------------|----------------------|--------------------------------------|
| **200** + envelope OK | `SUCCEEDED` | 0 (terminal) |
| **202** on `ASYNC_CAPABLE` SKU | `AWAITING_PROVIDER` | **0** — no poll, no callback, no retry |
| **206** (not attested) | `FAILED` (`ONEAUTO_PARTIAL_CONTENT`) | 0 |

## Persistence

- Initial **202** acceptance stored in `OneAutoProviderResponse` (existing table).
- `providerResultExpiresAt` = `initialProviderDispatchAt` + `ONEAUTO_PROVIDER_RESULT_RETENTION_MS` (default **24h**, conservative KB assumption).
- SynqDrive `expiresAt` (job TTL) unchanged.

## Budget

- `budgetReservedMinor` remains counted while `AWAITING_PROVIDER` (same as CREATED/QUEUED/RUNNING).
- On `EXPIRED` (`ONEAUTO_PROVIDER_RESULT_EXPIRED`), job drops out of daily budget sum — **does not** imply vendor refund.
- Duplicate execute for same org + vehicle + SKU blocked (`ONEAUTO_JOB_IN_FLIGHT`) unless same idempotency key returns existing row.

## Explicitly **not** in PR-2

- Provider polling, callbacks, automatic retries, or recovery GET.
- Production env activation.

## UI

Master One Auto dialog polls **SynqDrive job status only**; shows localized pending copy when `AWAITING_PROVIDER`.
