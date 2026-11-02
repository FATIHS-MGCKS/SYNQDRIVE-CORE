import { Injectable } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import type { Ds4LongitudinalLoadObservablesV1 } from './ds4-longitudinal-load-observables.v1.contract';
import { projectDs4LongitudinalLoadObservablesV1FromPersistedAssessmentV1 } from './ds4-longitudinal-load-observables.v1';
import { loadDs4LongitudinalEvidenceQualityContextV1 } from './ds4-longitudinal-evidence-quality-context.loader.v1';
import type { Ds4SpeedAuthorityPartitionV1, Ds4TripAssessmentStatusV1 } from './ds4-trip-assessment-v1.contract';
import { Ds4TripAssessmentRepositoryV1 } from './ds4-trip-assessment.repository.v1';

export type Ds4AssessmentInternalReadDtoV1 = {
  assessment: {
    assessmentVersion: string;
    assessmentStatus: string;
    evidenceQuality: string | null;
    reasonCodes: unknown;
    speedAuthority: string | null;
    eventRowContract: string | null;
    inputFingerprint: string;
    sourceMotionRunId: string;
    pinnedSnapshotHash: string;
    combinedInputIdentity: string;
    computedAt: string;
    completeness: unknown;
    eventSummaries: unknown;
    processingError: unknown;
  } | null;
  impact: {
    scoreAuthority: string;
    modelVersion: string;
    operationalLoadIndex: number | null;
    scorePublicationStatus: string;
    publicationReason: string | null;
    evidenceCompleteness: unknown;
    operationalLoad: unknown;
    computedAt: string;
  } | null;
  /** Deterministic Layer-2 projection from persisted assessment (AP1 kernel); not a customer score. */
  longitudinalLoadObservablesV1: Ds4LongitudinalLoadObservablesV1 | null;
};

@Injectable()
export class Ds4AssessmentReadServiceV1 {
  private readonly repo: Ds4TripAssessmentRepositoryV1;

  constructor(private readonly prisma: PrismaService) {
    this.repo = new Ds4TripAssessmentRepositoryV1(prisma as unknown as PrismaClient);
  }

  async readForTrip(scope: {
    organizationId: string;
    vehicleId: string;
    tripId: string;
  }): Promise<Ds4AssessmentInternalReadDtoV1 | null> {
    const bundle = await this.repo.readLatestBundleForTrip(scope);
    if (!bundle?.assessment) return null;
    const { assessment, impact } = bundle;

    const evidenceQualityContext = await loadDs4LongitudinalEvidenceQualityContextV1(
      this.prisma as unknown as PrismaClient,
      {
        organizationId: scope.organizationId,
        tripId: scope.tripId,
        pinnedSnapshotHash: assessment.pinnedSnapshotHash,
        sparseChannelOutcome: assessment.evidenceQuality,
      },
    );

    const longitudinalLoadObservablesV1 = projectDs4LongitudinalLoadObservablesV1FromPersistedAssessmentV1({
      assessmentStatus: assessment.assessmentStatus as Ds4TripAssessmentStatusV1,
      evidenceQuality: assessment.evidenceQuality,
      speedAuthority: assessment.speedAuthority as Ds4SpeedAuthorityPartitionV1 | null,
      eventSummariesJson: assessment.eventSummariesJson,
      evidenceQualityContext,
    });

    return {
      assessment: {
        assessmentVersion: assessment.assessmentVersion,
        assessmentStatus: assessment.assessmentStatus,
        evidenceQuality: assessment.evidenceQuality,
        reasonCodes: assessment.reasonCodes,
        speedAuthority: assessment.speedAuthority,
        eventRowContract: assessment.eventRowContract,
        inputFingerprint: assessment.inputFingerprint,
        sourceMotionRunId: assessment.sourceMotionRunId,
        pinnedSnapshotHash: assessment.pinnedSnapshotHash,
        combinedInputIdentity: assessment.combinedInputIdentity,
        computedAt: assessment.computedAt.toISOString(),
        completeness: assessment.completenessJson,
        eventSummaries: assessment.eventSummariesJson,
        processingError: assessment.processingErrorJson,
      },
      impact: impact
        ? {
            scoreAuthority: impact.scoreAuthority,
            modelVersion: impact.modelVersion,
            operationalLoadIndex: impact.operationalLoadIndex,
            scorePublicationStatus: impact.scorePublicationStatus,
            publicationReason: impact.publicationReason,
            evidenceCompleteness: impact.evidenceCompletenessJson,
            operationalLoad: impact.operationalLoadJson,
            computedAt: impact.computedAt.toISOString(),
          }
        : null,
      longitudinalLoadObservablesV1,
    };
  }
}
