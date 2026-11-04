# One Auto P4 PR-3 — callback notify-then-retrieval (draft, flags OFF)

**Epistemic:** Implementation scaffold only — **not** production-activated until E4 attestation promotes registry `asyncCompletionMode`.

## Mode

Vendor KB option **(b)**: callback notification → **one** execution-verified retrieval GET on the original VIN lookup URL.

Registry default for `OE_VIN_LOOKUP_EU`:

| Field | Value |
|-------|--------|
| `asyncCompletionMode` | **`NONE`** (unchanged runtime until E4) |
| `asyncPollSameUrlWithoutNewCharge` | `false` |

## Environment (all default OFF)

| Variable | Default | Role |
|----------|---------|------|
| `ONEAUTO_CALLBACK_ENABLED` | `false` | Register `callback_url` on initial dispatch |
| `ONEAUTO_CALLBACK_RETRIEVAL_GET_ENABLED` | `false` | Allow retrieval GET + accept inbound callbacks (**notify-then-GET only**) |
| `ONEAUTO_CALLBACK_FULL_DATA_ENABLED` | `false` | Complete jobs from callback POST (**no retrieval GET**) |
| `ONEAUTO_CALLBACK_RETURN_DATA_IN_CALLBACK` | `false` | Optional on notify-then-GET dispatch only |
| `ONEAUTO_CALLBACK_PUBLIC_BASE_URL` | `https://app.synqdrive.eu/api/v1` | Prefix for registered callback URL |

## Ingress

`POST /api/v1/webhooks/oneauto/provider-callback/:deliveryToken` — public (AuthGuard prefix), token maps to `one_auto_provider_jobs.callback_delivery_token_sha256`.

## Persistence

- `one_auto_provider_callback_inbox` — redacted payload + SHA-256 dedupe per job
- Job markers: `provider_callback_received_at`, `retrieval_provider_dispatch_at`

## Explicitly not in PR-3

- Live provider activation (requires all flags ON **and** registry `CALLBACK_NOTIFY_THEN_GET`)
- `CALLBACK_FULL_DATA` completion without attestation
- Same-URL polling (`POLL_SAME_URL`)
- `OE_SERVICE_HISTORY_EU` execution promotion

## E4 gate (before activation)

1. Sandbox/live attestation with real callback delivery capture
2. Utilisation / audit log billing proof for 202 + retrieval 200
3. Promote `asyncCompletionMode` to `CALLBACK_NOTIFY_THEN_GET` on execution-verified registry only
