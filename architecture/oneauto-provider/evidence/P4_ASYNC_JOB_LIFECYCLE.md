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
- **`EXPIRED` and `FAILED` jobs remain in the org daily budget sum** for `costConfirmedAt` on the same UTC day — expiry releases the in-flight duplicate guard only; it does **not** recycle daily cap for another paid dispatch.
- On `EXPIRED` (`ONEAUTO_PROVIDER_RESULT_EXPIRED`), `budgetReservedMinor` is **retained on the row** for audit; `actualChargeKnown` stays false (no vendor refund implied).

## Scheduled expiry (PR-2 review)

- `OneAutoProviderJobExpiryScheduler` (`oneauto_provider_job_expiry`) runs **every minute** on scheduler leader when `ONEAUTO_ENABLED=true`.
- `expireDueAwaitingProviderJobsBatch` — no provider HTTP; independent of Master UI `getJob` polling.

## Explicitly **not** in PR-2

- Provider polling, callbacks, automatic retries, or recovery GET.
- Production env activation.

## UI

Master One Auto dialog polls **SynqDrive job status only**; shows localized pending copy when `AWAITING_PROVIDER`.
