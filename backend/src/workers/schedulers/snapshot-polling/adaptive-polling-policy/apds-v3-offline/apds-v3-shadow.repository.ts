import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { APDS_V3_OFFLINE_POLICY_VERSION } from './apds-v3-offline.types';

export type UpsertApdsV3ShadowDecisionRow = {
  organizationId: string;
  vehicleId: string;
  providerSourceLinkId: string;
  physicalRequestId: string;
  decisionAt: Date;
  activationVersion: string;
  policyVersion: string;
  baselineCanonicalDue: boolean | null;
  baselineAuthority: string;
  baselineAssessable: boolean;
  v3Decision: string;
  v3Reason: string;
  expectedInformationGain: number | null;
  informationGainHeuristic: boolean;
  consumerDemandFailClosed: boolean;
  observationQuality: string | null;
  observationScope: string;
};

@Injectable()
export class ApdsV3ShadowRepository {
  constructor(private readonly prisma: PrismaService) {}

  async upsertPollStartDecision(row: UpsertApdsV3ShadowDecisionRow): Promise<void> {
    await this.prisma.apdsV3ShadowDecision.upsert({
      where: {
        organizationId_vehicleId_physicalRequestId_policyVersion: {
          organizationId: row.organizationId,
          vehicleId: row.vehicleId,
          physicalRequestId: row.physicalRequestId,
          policyVersion: row.policyVersion,
        },
      },
      create: {
        organizationId: row.organizationId,
        vehicleId: row.vehicleId,
        providerSourceLinkId: row.providerSourceLinkId,
        physicalRequestId: row.physicalRequestId,
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
      },
      update: {
        providerSourceLinkId: row.providerSourceLinkId,
        decisionAt: row.decisionAt,
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
      },
    });
  }

  static defaultPolicyVersion(): string {
    return APDS_V3_OFFLINE_POLICY_VERSION;
  }
}
