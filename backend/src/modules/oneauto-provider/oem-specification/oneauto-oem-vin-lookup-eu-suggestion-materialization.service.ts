import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OneAutoProviderJobStatus, Prisma } from '@prisma/client';
import { isDeepStrictEqual } from 'node:util';
import { PrismaService } from '@shared/database/prisma.service';
import { vinSha256Prefix } from '../attestation/oneauto-sandbox-attestation-evidence.util';
import { normalizeOemVinLookupEuSuggestions } from './oneauto-vin-lookup-oem-suggestion.normalizer';
import { ONEAUTO_OEM_VIN_LOOKUP_EU_SERVICE_SKU } from './oneauto-vin-lookup-oem-suggestion.types';
import {
  assertOemVinLookupEuJobBinding,
  extractOeVinLookupEuProviderResult,
  isSuccessfulOeVinLookupEuResponse,
  parseProviderDataUpdatedAtDate,
} from './oneauto-oem-vin-lookup-eu-suggestion-provider.util';

export type OneAutoOemSuggestionMaterializationOutcome =
  | 'DISABLED'
  | 'SKIPPED_JOB_STATE'
  | 'SKIPPED_EXPIRED_JOB'
  | 'SKIPPED_BINDING'
  | 'SKIPPED_RESPONSE'
  | 'SKIPPED_NORMALIZE'
  | 'ALREADY_EXISTS'
  | 'IMMUTABLE_CONFLICT'
  | 'CREATED';

export type OneAutoOemSuggestionMaterializationEvidence = {
  outcome: OneAutoOemSuggestionMaterializationOutcome;
  providerJobId: string;
  code?: string;
};

@Injectable()
export class OneAutoOemVinLookupEuSuggestionMaterializationService {
  private readonly logger = new Logger(OneAutoOemVinLookupEuSuggestionMaterializationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private suggestionsEnabled(): boolean {
    const cfg = this.config.get<{ oemSuggestionsEnabled?: boolean }>('oneautoProvider');
    return cfg?.oemSuggestionsEnabled === true;
  }

  emitOperationalEvidence(evidence: OneAutoOemSuggestionMaterializationEvidence): void {
    this.logger.log(
      JSON.stringify({
        kind: 'ONEAUTO_OEM_SUGGESTION_MATERIALIZATION',
        ...evidence,
      }),
    );
  }

  /**
   * Idempotent, isolated from provider execution — never mutates job status or Vehicle rows.
   */
  async tryMaterializeFromSucceededJob(providerJobId: string): Promise<OneAutoOemSuggestionMaterializationEvidence> {
    const base = { providerJobId };
    if (!this.suggestionsEnabled()) {
      const evidence = { ...base, outcome: 'DISABLED' as const };
      this.emitOperationalEvidence(evidence);
      return evidence;
    }

    try {
      const job = await this.prisma.oneAutoProviderJob.findUnique({
        where: { id: providerJobId },
        include: {
          responses: { orderBy: { fetchedAt: 'desc' }, take: 5 },
        },
      });

      if (!job) {
        const evidence = { ...base, outcome: 'SKIPPED_JOB_STATE' as const, code: 'JOB_NOT_FOUND' };
        this.emitOperationalEvidence(evidence);
        return evidence;
      }

      if (job.status !== OneAutoProviderJobStatus.SUCCEEDED) {
        const evidence = {
          ...base,
          outcome: 'SKIPPED_JOB_STATE' as const,
          code: `JOB_STATUS_${job.status}`,
        };
        this.emitOperationalEvidence(evidence);
        return evidence;
      }

      if (job.serviceSku !== ONEAUTO_OEM_VIN_LOOKUP_EU_SERVICE_SKU) {
        const evidence = { ...base, outcome: 'SKIPPED_BINDING' as const, code: 'SKU_MISMATCH' };
        this.emitOperationalEvidence(evidence);
        return evidence;
      }

      if (job.expiresAt && job.expiresAt.getTime() < Date.now()) {
        const evidence = { ...base, outcome: 'SKIPPED_EXPIRED_JOB' as const, code: 'JOB_EXPIRED' };
        this.emitOperationalEvidence(evidence);
        return evidence;
      }

      if (!job.expiresAt) {
        const evidence = { ...base, outcome: 'SKIPPED_BINDING' as const, code: 'JOB_EXPIRES_AT_MISSING' };
        this.emitOperationalEvidence(evidence);
        return evidence;
      }

      const vehicle = await this.prisma.vehicle.findFirst({
        where: { id: job.vehicleId, organizationId: job.organizationId },
        select: { vin: true },
      });
      if (!vehicle) {
        const evidence = {
          ...base,
          outcome: 'SKIPPED_BINDING' as const,
          code: 'ONEAUTO_OEM_SUGGESTION_ORG_VEHICLE_MISMATCH',
        };
        this.emitOperationalEvidence(evidence);
        return evidence;
      }

      const successResponse = job.responses.find((response) =>
        isSuccessfulOeVinLookupEuResponse({
          httpStatus: response.httpStatus ?? 0,
          body: response.responseBodyJson,
        }),
      );
      if (!successResponse) {
        const evidence = { ...base, outcome: 'SKIPPED_RESPONSE' as const, code: 'NO_SUCCESS_RESPONSE' };
        this.emitOperationalEvidence(evidence);
        return evidence;
      }

      const binding = assertOemVinLookupEuJobBinding({
        organizationId: job.organizationId,
        vehicleId: job.vehicleId,
        serviceSku: job.serviceSku,
        jobVinSnapshot: job.vinSnapshot,
        vehicleVin: vehicle.vin,
        providerResponseBody: successResponse.responseBodyJson,
      });
      if (!binding.ok) {
        const evidence = { ...base, outcome: 'SKIPPED_BINDING' as const, code: binding.code };
        this.emitOperationalEvidence(evidence);
        return evidence;
      }

      const providerResult = extractOeVinLookupEuProviderResult(successResponse.responseBodyJson);
      if (!providerResult) {
        const evidence = { ...base, outcome: 'SKIPPED_RESPONSE' as const, code: 'RESULT_MISSING' };
        this.emitOperationalEvidence(evidence);
        return evidence;
      }

      const fetchedAtIso = successResponse.fetchedAt.toISOString();
      const snapshotCreatedAtIso = fetchedAtIso;
      const normalized = normalizeOemVinLookupEuSuggestions({
        providerResult,
        fetchedAt: fetchedAtIso,
        snapshotCreatedAt: snapshotCreatedAtIso,
      });
      if (!normalized.ok) {
        const evidence = {
          ...base,
          outcome: 'SKIPPED_NORMALIZE' as const,
          code: normalized.code,
        };
        this.emitOperationalEvidence(evidence);
        return evidence;
      }

      const existing = await this.prisma.oneAutoOemVinLookupEuSuggestionSnapshot.findUnique({
        where: { providerJobId },
        select: { id: true, normalizedSnapshotJson: true },
      });
      if (existing) {
        const prior = existing.normalizedSnapshotJson;
        const next = normalized.snapshot as unknown as Prisma.JsonValue;
        if (!isDeepStrictEqual(prior, next)) {
          const evidence = {
            ...base,
            outcome: 'IMMUTABLE_CONFLICT' as const,
            code: 'SNAPSHOT_IMMUTABLE',
          };
          this.emitOperationalEvidence(evidence);
          return evidence;
        }
        const evidence = { ...base, outcome: 'ALREADY_EXISTS' as const };
        this.emitOperationalEvidence(evidence);
        return evidence;
      }

      const prefix = vinSha256Prefix(binding.normalizedVin);
      if (!prefix) {
        const evidence = { ...base, outcome: 'SKIPPED_BINDING' as const, code: 'VIN_HASH_PREFIX_FAILED' };
        this.emitOperationalEvidence(evidence);
        return evidence;
      }

      const providerDataUpdatedAt = parseProviderDataUpdatedAtDate(
        normalized.snapshot.timestamps.providerDataUpdatedAt,
      );

      await this.prisma.oneAutoOemVinLookupEuSuggestionSnapshot.create({
        data: {
          organizationId: job.organizationId,
          vehicleId: job.vehicleId,
          providerJobId: job.id,
          vinSha256Prefix: prefix,
          normalizedSnapshotJson: normalized.snapshot as Prisma.InputJsonValue,
          responseFetchedAt: successResponse.fetchedAt,
          snapshotCreatedAt: new Date(snapshotCreatedAtIso),
          providerDataUpdatedAt,
          expiresAt: job.expiresAt,
        },
      });

      const evidence = { ...base, outcome: 'CREATED' as const };
      this.emitOperationalEvidence(evidence);
      return evidence;
    } catch (err: unknown) {
      const code =
        err && typeof err === 'object' && 'code' in err && (err as { code: unknown }).code === 'P2002'
          ? 'UNIQUE_PROVIDER_JOB'
          : 'MATERIALIZATION_EXCEPTION';
      if (code === 'UNIQUE_PROVIDER_JOB') {
        const evidence = { ...base, outcome: 'ALREADY_EXISTS' as const, code };
        this.emitOperationalEvidence(evidence);
        return evidence;
      }
      this.logger.warn(
        JSON.stringify({
          kind: 'ONEAUTO_OEM_SUGGESTION_MATERIALIZATION_ERROR',
          providerJobId,
          code,
        }),
      );
      const evidence = { ...base, outcome: 'SKIPPED_NORMALIZE' as const, code };
      this.emitOperationalEvidence(evidence);
      return evidence;
    }
  }
}
