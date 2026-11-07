# FSD P5B — Token and connection identity drift (intentional)

## Scope

P5B covers **link deactivation and supersession**, not provider token synchronization redesign.

## Fail-closed fencing (unchanged)

- `validateDimoSourceLink` / `assertDimoDispatchBinding` → `SOURCE_LINK_INVALID` before dispatch.
- `assertActiveDimoSourceLinkForWrites` → `STALE_SOURCE_LINK` on durable writes when the active link, token id, or connection identity fingerprint no longer matches the run binding.

No catalog or snapshot evidence may persist after identity drift: fenced writes throw before commit.

## Intentional identity replacement

When DIMO token or vehicle binding changes without deactivating the link row:

1. Treat as **identity drift** until a lifecycle writer deactivates or supersedes the link (future VO/DIMO flows).
2. Do not auto-retry `UNKNOWN` ledger outcomes or issue a second HTTP attempt.
3. Operators must use onboarding/DIMO link ensure or audited deactivate tooling — not raw SQL.

Reactivation of a **new** link id does not resurrect runs bound to the **old** `providerSourceLinkId`.
