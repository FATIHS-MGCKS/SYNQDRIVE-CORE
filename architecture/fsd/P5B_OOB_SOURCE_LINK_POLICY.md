# FSD P5B — Out-of-band source-link mutation policy

## Normal production

Direct SQL or ad-hoc Prisma updates against `vehicle_data_source_links` for deactivation or supersession are **prohibited**. They bypass VSI lifecycle outbox, consent semantics, and FSD synchronous invalidation.

Arbitrary direct SQL is **not** intercepted by the application or by database triggers in this design.

## Approved operational path

Use the audited Nest entrypoint (single transaction; **not** offboarding):

```bash
cd backend
npx tsx scripts/ops/fsd-lifecycle-deactivate-dimo-source-link.ts \
  --organization-id=<org> --vehicle-id=<vehicle> --link-id=<link> \
  --actor-user-id=<user> --idempotency-key=<key> \
  [--reason=OPS_MANUAL_DEACTIVATE] [--dry-run]
```

`DimoSourceLinkAuditedDeactivationService` enforces:

1. Re-validated org/vehicle/link scope inside the transaction.
2. Lock order: vehicle `FOR NO KEY UPDATE` → link row `FOR NO KEY UPDATE` → FSD advisory invalidation → link deactivate (avoids FK `KEY SHARE` vs `FOR UPDATE` deadlock with concurrent run inserts).
3. VSI `SOURCE_LINK_DEACTIVATED` outbox (reason = operator `deactivationReason`, not `VEHICLE_OFFBOARDED`).
4. **No** vehicle provider consent mutation (explicit boundary — use offboarding to revoke consent).
5. Durable `business_audit_outbox` row (`DIMO_SOURCE_LINK_DEACTIVATED`); console output is not audit.

Requires explicit owner authorization for production `DATABASE_URL`.

## Incident response

If a link was deactivated OOB, run the ops script with `--recover-invalidate-only` (does **not** reactivate the link or dispatch DIMO). Example:

```bash
npx tsx scripts/ops/fsd-lifecycle-deactivate-dimo-source-link.ts \
  --recover-invalidate-only \
  --organization-id=... --vehicle-id=... --link-id=... \
  --actor-user-id=<MASTER_ADMIN_USER_ID> --idempotency-key=...
```

Link **reactivation** via `DimoVehicleDataSourceLinkService` invalidates executable FSD runs for that link id (`SOURCE_LINK_REACTIVATED`) so pre-reactivation runs cannot resume.

## In-flight HTTP (L3)

After `assertDimoDispatchBinding` commits, vehicle JWT acquisition and HTTP may still complete once per in-flight attempt; write fences (`STALE_SOURCE_LINK`, lease/version) prevent evidence persistence and run completion. No blocking DB transaction wraps network I/O.
