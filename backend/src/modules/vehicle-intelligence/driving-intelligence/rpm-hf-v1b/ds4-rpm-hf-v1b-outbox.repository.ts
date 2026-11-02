import type { PrismaClient } from '@prisma/client';
import {
  DS4_RPM_HF_V1B_ENGINE_VERSION,
  DS4_RPM_HF_V1B_ENGINE_VERSION_TIER_AWARE,
} from './ds4-rpm-hf-v1b.contract';
import { DS4_RPM_HF_V1B_TUNING } from './ds4-rpm-hf-v1b.config';

export type Ds4RpmHfV1bOutboxStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'SUCCEEDED'
  | 'FAILED_RETRYABLE'
  | 'SKIPPED_INELIGIBLE';

export type Ds4RpmHfV1bOutboxRow = {
  outboxId: string;
  organizationId: string;
  tripId: string;
  vehicleId: string;
  engineVersion: string;
  status: Ds4RpmHfV1bOutboxStatus;
  attemptCount: number;
  nextAttemptAt: Date;
  lastErrorCode: string | null;
  claimToken: string;
  succeededInputFingerprint: string | null;
};

/**
 * Outbox lifecycle (Postgres-backed):
 * - Discovery inserts one row per (org, trip, engine_version); ON CONFLICT DO NOTHING caps rediscovery.
 * - Retry: FAILED_RETRYABLE with next_attempt_at; claim uses SKIP LOCKED.
 * - Lease recovery: expired PROCESSING (claim_expires_at <= now) is reclaimable with a new claim_token.
 * - Completion fencing: mark* mutations require matching claim_token + PROCESSING.
 * - Input revision (bounded): after SUCCEEDED, runPass may reopen to PENDING when live fingerprint differs
 *   from succeeded_input_fingerprint (see shadow service). Same fingerprint + engine → idempotent SUCCESS run index.
 * - Automatic re-run after SUCCEEDED is not via duplicate outbox rows — only explicit revision reopen.
 */
type DiscoveryCandidate = {
  organization_id: string;
  trip_id: string;
  vehicle_id: string;
  end_time: Date;
};

export class Ds4RpmHfV1bOutboxRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async discoverEligible(input: {
    enabledSince: Date;
    organizationAllowlist: readonly string[];
    vehicleAllowlist: readonly string[];
    limit: number;
    now: Date;
  }): Promise<number> {
    if (input.organizationAllowlist.length === 0 || input.vehicleAllowlist.length === 0) return 0;
    if (input.limit <= 0) return 0;

    let inserted = 0;
    let cursor: { endTime: Date; tripId: string } | null = null;
    const pageSize = DS4_RPM_HF_V1B_TUNING.discoveryCandidatePageSize;

    while (inserted < input.limit) {
      const page = await this.fetchDiscoveryPage({ ...input, pageSize, cursor });
      if (page.length === 0) break;
      for (const c of page) {
        if (inserted >= input.limit) break;
        const did = await this.tryInsertCandidate(c, input.now, DS4_RPM_HF_V1B_ENGINE_VERSION);
        if (did) inserted += 1;
        if (inserted >= input.limit) break;
        const didTier = await this.tryInsertCandidate(c, input.now, DS4_RPM_HF_V1B_ENGINE_VERSION_TIER_AWARE);
        if (didTier) inserted += 1;
      }
      const last = page[page.length - 1]!;
      cursor = { endTime: last.end_time, tripId: last.trip_id };
      if (page.length < pageSize) break;
    }
    return inserted;
  }

  private async fetchDiscoveryPage(input: {
    enabledSince: Date;
    organizationAllowlist: readonly string[];
    vehicleAllowlist: readonly string[];
    pageSize: number;
    cursor: { endTime: Date; tripId: string } | null;
  }): Promise<DiscoveryCandidate[]> {
    const orgs = input.organizationAllowlist;
    const vehicles = input.vehicleAllowlist;
    const cursor = input.cursor;

    if (!cursor) {
      return this.prisma.$queryRaw<DiscoveryCandidate[]>`
        SELECT v.organization_id, t.id AS trip_id, t.vehicle_id, t.end_time
        FROM vehicle_trips t
        INNER JOIN vehicles v ON v.id = t.vehicle_id
        WHERE t.trip_status = 'COMPLETED'
          AND t.end_time IS NOT NULL
          AND t.end_time >= ${input.enabledSince}
          AND v.organization_id = ANY(${orgs}::text[])
          AND t.vehicle_id = ANY(${vehicles}::text[])
        ORDER BY t.end_time ASC, t.id ASC
        LIMIT ${input.pageSize}`;
    }

    return this.prisma.$queryRaw<DiscoveryCandidate[]>`
      SELECT v.organization_id, t.id AS trip_id, t.vehicle_id, t.end_time
      FROM vehicle_trips t
      INNER JOIN vehicles v ON v.id = t.vehicle_id
      WHERE t.trip_status = 'COMPLETED'
        AND t.end_time IS NOT NULL
        AND t.end_time >= ${input.enabledSince}
        AND v.organization_id = ANY(${orgs}::text[])
        AND t.vehicle_id = ANY(${vehicles}::text[])
        AND (t.end_time, t.id) > (${cursor.endTime}, ${cursor.tripId})
      ORDER BY t.end_time ASC, t.id ASC
      LIMIT ${input.pageSize}`;
  }

  private async tryInsertCandidate(
    c: DiscoveryCandidate,
    now: Date,
    engineVersion: string,
  ): Promise<boolean> {
    const rows = await this.prisma.$queryRaw<Array<{ outbox_id: string }>>`
      INSERT INTO ds4_rpm_hf_v1b_shadow_outbox_v1 (
        organization_id, vehicle_id, trip_id, engine_version, status, next_attempt_at
      ) VALUES (
        ${c.organization_id}, ${c.vehicle_id}, ${c.trip_id}, ${engineVersion}, 'PENDING', ${now}
      )
      ON CONFLICT (organization_id, trip_id, engine_version) DO NOTHING
      RETURNING outbox_id`;
    return rows.length > 0;
  }

  async listSucceededForRevisionProbe(input: {
    organizationAllowlist: readonly string[];
    vehicleAllowlist: readonly string[];
    limit: number;
    engineVersion?: string;
  }): Promise<
    Array<{
      outboxId: string;
      organizationId: string;
      tripId: string;
      vehicleId: string;
      succeededInputFingerprint: string | null;
    }>
  > {
    if (input.limit <= 0) return [];
    if (input.organizationAllowlist.length === 0 || input.vehicleAllowlist.length === 0) return [];
    const engineVersion = input.engineVersion ?? DS4_RPM_HF_V1B_ENGINE_VERSION;
    const rows = await this.prisma.$queryRaw<
      Array<{
        outbox_id: string;
        organization_id: string;
        trip_id: string;
        vehicle_id: string;
        succeeded_input_fingerprint: string | null;
      }>
    >`
      SELECT outbox_id, organization_id, trip_id, vehicle_id, succeeded_input_fingerprint
      FROM ds4_rpm_hf_v1b_shadow_outbox_v1
      WHERE status = 'SUCCEEDED'
        AND engine_version = ${engineVersion}
        AND organization_id = ANY(${input.organizationAllowlist}::text[])
        AND vehicle_id = ANY(${input.vehicleAllowlist}::text[])
      ORDER BY revision_last_probed_at ASC NULLS FIRST, updated_at ASC, outbox_id ASC
      LIMIT ${input.limit}`;
    return rows.map((r) => ({
      outboxId: r.outbox_id,
      organizationId: r.organization_id,
      tripId: r.trip_id,
      vehicleId: r.vehicle_id,
      succeededInputFingerprint: r.succeeded_input_fingerprint,
    }));
  }

  async reopenForInputRevision(outboxId: string, now: Date): Promise<boolean> {
    const rows = await this.prisma.$queryRaw<Array<{ outbox_id: string }>>`
      UPDATE ds4_rpm_hf_v1b_shadow_outbox_v1
      SET status = 'PENDING',
          next_attempt_at = ${now},
          claim_token = NULL,
          claim_expires_at = NULL,
          updated_at = ${now}
      WHERE outbox_id = ${outboxId}::uuid
        AND status = 'SUCCEEDED'
      RETURNING outbox_id`;
    return rows.length > 0;
  }

  async touchRevisionProbe(outboxId: string, now: Date): Promise<void> {
    await this.prisma.$executeRaw`
      UPDATE ds4_rpm_hf_v1b_shadow_outbox_v1
      SET revision_last_probed_at = ${now}, updated_at = ${now}
      WHERE outbox_id = ${outboxId}::uuid AND status = 'SUCCEEDED'`;
  }

  async claimBatch(limit: number, now: Date): Promise<Ds4RpmHfV1bOutboxRow[]> {
    const claimExpiresAt = new Date(now.getTime() + DS4_RPM_HF_V1B_TUNING.claimLeaseMs);
    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.$queryRaw<
        Array<{
          outbox_id: string;
          organization_id: string;
          trip_id: string;
          vehicle_id: string;
          engine_version: string;
          status: string;
          attempt_count: number;
          next_attempt_at: Date;
          last_error_code: string | null;
          claim_token: string;
          succeeded_input_fingerprint: string | null;
        }>
      >`
        WITH pick AS (
          SELECT outbox_id
          FROM ds4_rpm_hf_v1b_shadow_outbox_v1
          WHERE (
            status IN ('PENDING', 'FAILED_RETRYABLE')
            AND next_attempt_at <= ${now}
          ) OR (
            status = 'PROCESSING'
            AND claim_expires_at IS NOT NULL
            AND claim_expires_at <= ${now}
          )
          ORDER BY next_attempt_at ASC, created_at ASC
          LIMIT ${limit}
          FOR UPDATE SKIP LOCKED
        )
        UPDATE ds4_rpm_hf_v1b_shadow_outbox_v1 o
        SET status = 'PROCESSING',
            attempt_count = o.attempt_count + 1,
            claim_token = gen_random_uuid()::text,
            claim_expires_at = ${claimExpiresAt},
            updated_at = ${now}
        FROM pick
        WHERE o.outbox_id = pick.outbox_id
        RETURNING o.outbox_id, o.organization_id, o.trip_id, o.vehicle_id, o.engine_version,
          o.status, o.attempt_count, o.next_attempt_at, o.last_error_code, o.claim_token,
          o.succeeded_input_fingerprint`;
      return claimed.map((r) => ({
        outboxId: r.outbox_id,
        organizationId: r.organization_id,
        tripId: r.trip_id,
        vehicleId: r.vehicle_id,
        engineVersion: r.engine_version,
        status: r.status as Ds4RpmHfV1bOutboxStatus,
        attemptCount: r.attempt_count,
        nextAttemptAt: r.next_attempt_at,
        lastErrorCode: r.last_error_code,
        claimToken: r.claim_token,
        succeededInputFingerprint: r.succeeded_input_fingerprint,
      }));
    });
  }

  async renewClaimLease(outboxId: string, claimToken: string, now: Date): Promise<boolean> {
    const claimExpiresAt = new Date(now.getTime() + DS4_RPM_HF_V1B_TUNING.claimLeaseMs);
    const rows = await this.prisma.$queryRaw<Array<{ outbox_id: string }>>`
      UPDATE ds4_rpm_hf_v1b_shadow_outbox_v1
      SET claim_expires_at = ${claimExpiresAt}, updated_at = ${now}
      WHERE outbox_id = ${outboxId}::uuid
        AND claim_token = ${claimToken}
        AND status = 'PROCESSING'
      RETURNING outbox_id`;
    return rows.length > 0;
  }

  async markSucceeded(
    outboxId: string,
    claimToken: string,
    succeededInputFingerprint: string,
  ): Promise<boolean> {
    const rows = await this.prisma.$queryRaw<Array<{ outbox_id: string }>>`
      UPDATE ds4_rpm_hf_v1b_shadow_outbox_v1
      SET status = 'SUCCEEDED',
          succeeded_input_fingerprint = ${succeededInputFingerprint},
          claim_token = NULL,
          claim_expires_at = NULL,
          last_error_code = NULL,
          updated_at = now()
      WHERE outbox_id = ${outboxId}::uuid
        AND claim_token = ${claimToken}
        AND status = 'PROCESSING'
      RETURNING outbox_id`;
    return rows.length > 0;
  }

  async markSkipped(outboxId: string, claimToken: string, code: string): Promise<boolean> {
    const rows = await this.prisma.$queryRaw<Array<{ outbox_id: string }>>`
      UPDATE ds4_rpm_hf_v1b_shadow_outbox_v1
      SET status = 'SKIPPED_INELIGIBLE', last_error_code = ${code}, claim_token = NULL, claim_expires_at = NULL, updated_at = now()
      WHERE outbox_id = ${outboxId}::uuid AND claim_token = ${claimToken} AND status = 'PROCESSING'
      RETURNING outbox_id`;
    return rows.length > 0;
  }

  async markFailedRetryable(
    outboxId: string,
    claimToken: string,
    code: string,
    nextAttemptAt: Date,
  ): Promise<boolean> {
    const rows = await this.prisma.$queryRaw<Array<{ outbox_id: string }>>`
      UPDATE ds4_rpm_hf_v1b_shadow_outbox_v1
      SET status = 'FAILED_RETRYABLE',
          last_error_code = ${code},
          last_error_at = now(),
          next_attempt_at = ${nextAttemptAt},
          claim_token = NULL,
          claim_expires_at = NULL,
          updated_at = now()
      WHERE outbox_id = ${outboxId}::uuid AND claim_token = ${claimToken} AND status = 'PROCESSING'
      RETURNING outbox_id`;
    return rows.length > 0;
  }
}
