export const VSI_PROFILE_LIFECYCLE_OUTBOX_PAYLOAD_VERSION = 1;

export const VSI_PROFILE_LIFECYCLE_OUTBOX_BATCH_SIZE = 25;

export const VSI_PROFILE_LIFECYCLE_OUTBOX_WORKER_INTERVAL_MS = 15_000;

export const VSI_PROFILE_LIFECYCLE_OUTBOX_MAX_ATTEMPTS = 8;

/** Lease while a worker owns a PROCESSING row (stale leases become reclaimable). */
export const VSI_PROFILE_LIFECYCLE_OUTBOX_CLAIM_LEASE_MS = 120_000;

export const VSI_PROFILE_LIFECYCLE_LIMITATION_SOURCE_LINK_INACTIVE =
  'SOURCE_LINK_INACTIVE';

export const VSI_PROFILE_LIFECYCLE_LIMITATION_SOURCE_LINK_SUPERSEDED =
  'SOURCE_LINK_SUPERSEDED';

/** Bounded backfill: max active links processed per operator/CLI invocation. */
export const VSI_PROFILE_BACKFILL_MAX_LINKS_PER_RUN = 200;

/** P3A inventory reconcile: max per-link events planned per sweep batch. */
export const VSI_DISCOVERY_INVENTORY_RECONCILE_MAX_LINKS_PER_SWEEP = 50;

/** P3A sweep tick on lifecycle leader (no separate process). */
export const VSI_DISCOVERY_INVENTORY_SWEEP_INTERVAL_MS = 300_000;
