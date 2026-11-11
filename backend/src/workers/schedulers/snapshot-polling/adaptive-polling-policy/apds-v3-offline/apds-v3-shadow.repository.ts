import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { APDS_V3_OFFLINE_POLICY_VERSION } from './apds-v3-offline.types';
import {
  buildApdsV3ShadowDecisionFingerprint,
  type ApdsV3ShadowDecisionFingerprintInput,
} from './apds-v3-shadow-decision-fingerprint.v1';
import type { ApdsV3PhysicalRequestIdentityClass } from './apds-v3-shadow-physical-identity.v1';

export type InsertApdsV3ShadowDecisionRow = ApdsV3ShadowDecisionFingerprintInput & {
  decisionAt: Date;
  physicalRequestIdentityClass: ApdsV3PhysicalRequestIdentityClass;
  correlationAttemptId: string | null;
};

export class ApdsV3ShadowImmutableConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ApdsV3ShadowImmutableConflictError';
  }
}

export type ApdsV3ShadowInsertOutcome =
  | 'inserted'
  | 'idempotent_replay'
  | 'immutable_conflict';

@Injectable()
export class ApdsV3ShadowRepository {
  constructor(private readonly prisma: PrismaService) {}

  static defaultPolicyVersion(): string {
    return APDS_V3_OFFLINE_POLICY_VERSION;
  }

  async insertPollStartDecision(
    row: InsertApdsV3ShadowDecisionRow,
  ): Promise<ApdsV3ShadowInsertOutcome> {
    const fingerprint = buildApdsV3ShadowDecisionFingerprint(row);
    try {
      await this.prisma.apdsV3ShadowDecision.create({
        data: {
          organizationId: row.organizationId,
          vehicleId: row.vehicleId,
          providerSourceLinkId: row.providerSourceLinkId,
          physicalRequestId: row.physicalRequestId,
          physicalRequestIdentityClass: row.physicalRequestIdentityClass,
          correlationAttemptId: row.correlationAttemptId,
          decisionAt: row.decisionAt,
          activationVersion: row.activationVersion,
          policyVersion: row.policyVersion,
          baselineCanonicalDue: row.baselineCanonicalDue,
          baselineAuthority: row.baselineAuthority,
          baselineAssessable: row.baselineAssessable,
          v3Decision: row.v3Decision,
          v3Reason: row.v3Reason,
          expectedInformationGain: row.expectedInformationGain,
          informationGainHeuristic: row.informationGainHeuristic,
          consumerDemandFailClosed: row.consumerDemandFailClosed,
          observationQuality: row.observationQuality,
          observationScope: row.observationScope,
          missingEvidenceReasons: row.missingEvidenceReasons,
          decisionFingerprint: fingerprint,
        },
      });
      return 'inserted';
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        const existing = await this.prisma.apdsV3ShadowDecision.findUnique({
          where: {
            organizationId_vehicleId_physicalRequestId_policyVersion: {
              organizationId: row.organizationId,
              vehicleId: row.vehicleId,
              physicalRequestId: row.physicalRequestId,
              policyVersion: row.policyVersion,
            },
          },
          select: { decisionFingerprint: true },
        });
        if (existing?.decisionFingerprint === fingerprint) {
          return 'idempotent_replay';
        }
        throw new ApdsV3ShadowImmutableConflictError(
          'Existing APDS V3 shadow decision differs; scientific row is immutable',
        );
      }
      throw err;
    }
  }
}
