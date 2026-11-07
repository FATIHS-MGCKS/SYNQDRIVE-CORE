# FSD P5B — Out-of-band source-link mutation policy

## Normal production

Direct SQL or ad-hoc Prisma updates against `vehicle_data_source_links` for deactivation or supersession are **prohibited**. They bypass VSI lifecycle outbox, consent semantics, and FSD synchronous invalidation.

Arbitrary direct SQL is **not** intercepted by the application or by database triggers in this design.

## Approved operational path

Use the audited ops entrypoint (single transaction):

```bash
cd backend
npx tsx scripts/ops/fsd-lifecycle-deactivate-dimo-source-link.ts --help
```

The script:

1. Resolves org/vehicle scope from the link row (fail-closed on cross-tenant mismatch).
2. Acquires vehicle lifecycle consistency via transactional updates.
3. Runs FSD P5B invalidation per DIMO link.
4. Deactivates the link with a recorded `deactivationReason`.

Requires disposable or production-local credentials per operator runbook; never run against production without explicit owner authorization.

## Incident response

If a link was deactivated OOB, run the ops script in **invalidation-only** mode if supported, or restore link state only under architect-approved procedure; do not assume in-flight FSD runs self-heal.
