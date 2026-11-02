import type { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { gunzipSync } from 'zlib';
import type { DiV0MotionCoreShadowPayloadV1 } from '../motion-core-shadow-worker/di-v0-motion-core-shadow.types';
import { evaluateDs4AssessmentScopeEligibilityV1 } from './ds4-assessment-eligibility-policy.v1';
import {
  DS4_ASSESSMENT_COLLECTION_EVENT_ROW_CONTRACT_V2,
  evaluateDs4MotionRunCollectionEligibilityV1,
  type Ds4AssessmentDiscoveryTerminalReasonCode,
} from './ds4-assessment-motion-discovery-eligibility.v1';
import {
  computeDs4AssessmentInputFingerprintFromMotionSource,
  computeDs4DiscoveryTerminalInputFingerprint,
} from './ds4-assessment-input-fingerprint';
import { DI_V0_DS4_ASSESSMENT_TUNING } from './ds4-assessment.config';
import { DS4_TRIP_ASSESSMENT_VERSION_V1 } from './ds4-trip-assessment-v1.contract';

export type Ds4AssessmentOutboxStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'SUCCEEDED'
  | 'FAILED_RETRYABLE'
  | 'FAILED_TERMINAL'
  | 'SKIPPED_INELIGIBLE';

function decodeMotionPayloadGzip(payloadGzip: Buffer): DiV0MotionCoreShadowPayloadV1 | null {
  try {
    const json = gunzipSync(payloadGzip).toString('utf8');
    return JSON.parse(json) as DiV0MotionCoreShadowPayloadV1;
  } catch {
    return null;
  }
}

export class Ds4AssessmentOutboxRepositoryV1 {
  constructor(private readonly prisma: PrismaClient) {}

  async persistDiscoveryTerminalOutbox(input: {
    sourceMotionRunId: string;
    organizationId: string;
    tripId: string;
    vehicleId: string;
    reasonCode: Ds4AssessmentDiscoveryTerminalReasonCode;
    now: Date;
    assessmentVersion?: string;
  }): Promise<'inserted' | 'duplicate'> {
    const assessmentVersion = input.assessmentVersion ?? DS4_TRIP_ASSESSMENT_VERSION_V1;
    const inputFingerprint = computeDs4DiscoveryTerminalInputFingerprint({
      sourceMotionRunId: input.sourceMotionRunId,
      assessmentVersion,
      reasonCode: input.reasonCode,
    });
    try {
      await this.prisma.diV0Ds4AssessmentOutboxV1.create({
        data: {
          sourceMotionRunId: input.sourceMotionRunId,
          organizationId: input.organizationId,
          tripId: input.tripId,
          vehicleId: input.vehicleId,
          assessmentVersion,
          inputFingerprint,
          status: 'SKIPPED_INELIGIBLE',
          attemptCount: DI_V0_DS4_ASSESSMENT_TUNING.maxProcessingAttempts,
          nextAttemptAt: input.now,
          lastErrorCode: input.reasonCode,
          lastErrorAt: input.now,
        },
      });
      return 'inserted';
    } catch {
      return 'duplicate';
    }
  }

  async discoverFromSucceededMotionRuns(input: {
    limit: number;
    now: Date;
    minMotionRunCreatedAt: Date;
  }): Promise<number> {
    if (input.limit <= 0) return 0;
    const rows = await this.prisma.$queryRaw<
      Array<{
        id: string;
        organization_id: string;
        trip_id: string;
        vehicle_id: string;
        pinned_snapshot_hash: string;
        combined_input_identity: string;
        content_fingerprint: string;
        summary_json: { contentFingerprint?: string | null; eventRowContract?: string | null };
        payload_gzip: Buffer;
        created_at: Date;
      }>
    >`
      SELECT r.id, r.organization_id, r.trip_id, r.vehicle_id, r.pinned_snapshot_hash,
        r.combined_input_identity, r.content_fingerprint, r.summary_json, r.payload_gzip, r.created_at
      FROM di_v0_motion_core_shadow_runs_v1 r
      WHERE r.shadow_status = 'SUCCEEDED'
        AND r.created_at >= ${input.minMotionRunCreatedAt}
        AND r.summary_json->>'eventRowContract' = ${DS4_ASSESSMENT_COLLECTION_EVENT_ROW_CONTRACT_V2}
        AND NOT EXISTS (
          SELECT 1 FROM di_v0_ds4_trip_assessment_v1 a
          WHERE a.trip_id = r.trip_id
            AND a.source_motion_run_id = r.id
            AND a.assessment_version = ${DS4_TRIP_ASSESSMENT_VERSION_V1}
        )
        AND NOT EXISTS (
          SELECT 1 FROM di_v0_ds4_assessment_outbox_v1 o
          WHERE o.source_motion_run_id = r.id
            AND o.assessment_version = ${DS4_TRIP_ASSESSMENT_VERSION_V1}
        )
      ORDER BY r.created_at ASC
      LIMIT ${input.limit}`;

    let inserted = 0;
    for (const row of rows) {
      const scopeEligibility = evaluateDs4AssessmentScopeEligibilityV1(
        {
          organizationId: row.organization_id,
          vehicleId: row.vehicle_id,
          tripId: row.trip_id,
        },
        { motionRunOrganizationId: row.organization_id },
      );
      if (!scopeEligibility.eligible) {
        const reasonCode =
          scopeEligibility.reason === 'SCOPE_IDENTITY_INVALID'
            ? 'DISCOVERY_SOURCE_IDENTITY_MISMATCH'
            : 'DISCOVERY_SOURCE_IDENTITY_MISMATCH';
        await this.persistDiscoveryTerminalOutbox({
          sourceMotionRunId: row.id,
          organizationId: row.organization_id,
          tripId: row.trip_id,
          vehicleId: row.vehicle_id,
          reasonCode,
          now: input.now,
        });
        continue;
      }
      const payload = decodeMotionPayloadGzip(Buffer.from(row.payload_gzip));
      if (payload == null) {
        const terminal = await this.persistDiscoveryTerminalOutbox({
          sourceMotionRunId: row.id,
          organizationId: row.organization_id,
          tripId: row.trip_id,
          vehicleId: row.vehicle_id,
          reasonCode: 'DISCOVERY_PAYLOAD_REQUIRED',
          now: input.now,
        });
        if (terminal === 'inserted') inserted += 1;
        continue;
      }

      const collectionEligibility = evaluateDs4MotionRunCollectionEligibilityV1({
        summaryJson: row.summary_json,
        payload,
      });
      if (!collectionEligibility.eligible) {
        const terminal = await this.persistDiscoveryTerminalOutbox({
          sourceMotionRunId: row.id,
          organizationId: row.organization_id,
          tripId: row.trip_id,
          vehicleId: row.vehicle_id,
          reasonCode: collectionEligibility.reasonCode,
          now: input.now,
        });
        if (terminal === 'inserted') inserted += 1;
        continue;
      }

      const fingerprintResult = computeDs4AssessmentInputFingerprintFromMotionSource({
        sourceMotionRunId: row.id,
        pinnedSnapshotHash: row.pinned_snapshot_hash,
        combinedInputIdentity: row.combined_input_identity,
        contentFingerprint: row.content_fingerprint,
        summaryJson: row.summary_json,
        payload,
      });
      if (!fingerprintResult.ok) {
        const reasonCode =
          fingerprintResult.code === 'PAYLOAD_REQUIRED'
            ? 'DISCOVERY_PAYLOAD_REQUIRED'
            : 'DISCOVERY_SOURCE_IDENTITY_MISMATCH';
        const terminal = await this.persistDiscoveryTerminalOutbox({
          sourceMotionRunId: row.id,
          organizationId: row.organization_id,
          tripId: row.trip_id,
          vehicleId: row.vehicle_id,
          reasonCode,
          now: input.now,
        });
        if (terminal === 'inserted') inserted += 1;
        continue;
      }
      try {
        await this.prisma.diV0Ds4AssessmentOutboxV1.create({
          data: {
            sourceMotionRunId: row.id,
            organizationId: row.organization_id,
            tripId: row.trip_id,
            vehicleId: row.vehicle_id,
            assessmentVersion: DS4_TRIP_ASSESSMENT_VERSION_V1,
            inputFingerprint: fingerprintResult.inputFingerprint,
            status: 'PENDING',
            nextAttemptAt: input.now,
          },
        });
        inserted += 1;
      } catch {
        // unique violation — already queued for this assessment version
      }
    }
    return inserted;
  }

  async releaseExpiredProcessingLeases(input: {
    now: Date;
    maxProcessingAttempts: number;
    retryDelayMs: number;
  }): Promise<number> {
    const nextAttemptAt = new Date(input.now.getTime() + input.retryDelayMs);
    const result = await this.prisma.$executeRaw`
      UPDATE di_v0_ds4_assessment_outbox_v1 o
      SET
        attempt_count = o.attempt_count + 1,
        status = CASE
          WHEN o.attempt_count + 1 >= ${input.maxProcessingAttempts} THEN 'FAILED_TERMINAL'
          ELSE 'FAILED_RETRYABLE'
        END,
        next_attempt_at = CASE
          WHEN o.attempt_count + 1 >= ${input.maxProcessingAttempts} THEN o.next_attempt_at
          ELSE ${nextAttemptAt}
        END,
        last_error_code = 'LEASE_EXPIRED',
        last_error_at = ${input.now},
        claim_token = NULL,
        claim_expires_at = NULL,
        updated_at = NOW()
      WHERE o.outbox_id IN (
        SELECT outbox_id FROM di_v0_ds4_assessment_outbox_v1
        WHERE status = 'PROCESSING'
          AND claim_expires_at IS NOT NULL
          AND claim_expires_at < ${input.now}
        FOR UPDATE SKIP LOCKED
      )`;
    return typeof result === 'number' ? result : 0;
  }

  async claimBatch(input: {
    limit: number;
    now: Date;
    leaseMs: number;
    maxProcessingAttempts: number;
  }): Promise<
    Array<{
      outboxId: string;
      sourceMotionRunId: string;
      organizationId: string;
      tripId: string;
      vehicleId: string;
      claimToken: string;
    }>
  > {
    const claimToken = randomUUID();
    const claimExpiresAt = new Date(input.now.getTime() + input.leaseMs);
    const rows = await this.prisma.$queryRaw<
      Array<{
        outbox_id: string;
        source_motion_run_id: string;
        organization_id: string;
        trip_id: string;
        vehicle_id: string;
      }>
    >`
      UPDATE di_v0_ds4_assessment_outbox_v1 o
      SET status = 'PROCESSING', claim_token = ${claimToken}, claim_expires_at = ${claimExpiresAt},
          updated_at = NOW()
      WHERE o.outbox_id IN (
        SELECT outbox_id FROM di_v0_ds4_assessment_outbox_v1
        WHERE status IN ('PENDING', 'FAILED_RETRYABLE')
          AND next_attempt_at <= ${input.now}
          AND attempt_count < ${input.maxProcessingAttempts}
        ORDER BY next_attempt_at ASC, created_at ASC
        LIMIT ${input.limit}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING o.outbox_id, o.source_motion_run_id, o.organization_id, o.trip_id, o.vehicle_id`;

    return rows.map((r) => ({
      outboxId: r.outbox_id,
      sourceMotionRunId: r.source_motion_run_id,
      organizationId: r.organization_id,
      tripId: r.trip_id,
      vehicleId: r.vehicle_id,
      claimToken,
    }));
  }

  async markSucceeded(outboxId: string, claimToken: string): Promise<void> {
    await this.prisma.diV0Ds4AssessmentOutboxV1.updateMany({
      where: { outboxId, claimToken, status: 'PROCESSING' },
      data: { status: 'SUCCEEDED', claimToken: null, claimExpiresAt: null },
    });
  }

  async markFailedRetryable(
    outboxId: string,
    claimToken: string,
    input: { nextAttemptAt: Date; errorCode: string; now: Date; maxProcessingAttempts: number },
  ): Promise<'retryable' | 'terminal'> {
    const rows = await this.prisma.$queryRaw<Array<{ status: string }>>`
      UPDATE di_v0_ds4_assessment_outbox_v1
      SET
        attempt_count = attempt_count + 1,
        status = CASE
          WHEN attempt_count + 1 >= ${input.maxProcessingAttempts} THEN 'FAILED_TERMINAL'
          ELSE 'FAILED_RETRYABLE'
        END,
        next_attempt_at = CASE
          WHEN attempt_count + 1 >= ${input.maxProcessingAttempts} THEN next_attempt_at
          ELSE ${input.nextAttemptAt}
        END,
        last_error_code = ${input.errorCode},
        last_error_at = ${input.now},
        claim_token = NULL,
        claim_expires_at = NULL,
        updated_at = NOW()
      WHERE outbox_id = ${outboxId}::uuid AND claim_token = ${claimToken} AND status = 'PROCESSING'
      RETURNING status`;
    const status = rows[0]?.status;
    return status === 'FAILED_TERMINAL' ? 'terminal' : 'retryable';
  }

  async markSkipped(outboxId: string, claimToken: string, errorCode: string): Promise<void> {
    await this.prisma.diV0Ds4AssessmentOutboxV1.updateMany({
      where: { outboxId, claimToken, status: 'PROCESSING' },
      data: {
        status: 'SKIPPED_INELIGIBLE',
        lastErrorCode: errorCode,
        lastErrorAt: new Date(),
        claimToken: null,
        claimExpiresAt: null,
      },
    });
  }

  static computeRetryDelayMs(attemptCountAfterIncrement: number): number {
    const exponent = Math.max(0, attemptCountAfterIncrement - 1);
    const delay = DI_V0_DS4_ASSESSMENT_TUNING.baseRetryDelayMs * 2 ** exponent;
    return Math.min(delay, DI_V0_DS4_ASSESSMENT_TUNING.maxRetryDelayMs);
  }
}
