import type {
  DbiP2c2A1EvidenceParticipantV1,
  DbiP2c2PowertrainProxyParticipantV1,
} from '../dbi-p2c2-offline-evidence-adapters/dbi-p2c2-evidence-adapter.contract.v1';
import type {
  DbiP2c3ModuleAssessabilitySummaryV1,
  DbiP2c3ModuleProjectionV1,
} from './dbi-p2c3-reconciliation.contract.v1';

export function projectA1ModuleAssessability(input: {
  readonly participantRef: string;
  readonly participant: DbiP2c2A1EvidenceParticipantV1;
}): DbiP2c3ModuleAssessabilitySummaryV1 {
  const moduleProjection: DbiP2c3ModuleProjectionV1 = {
    kind: 'A1_DESCRIPTIVE',
    highEpisodesStatus: input.participant.moduleAssessability.highEpisodesStatus,
    normalizedEpisodesEligible: input.participant.moduleAssessability.normalizedEpisodesEligible,
    semanticGuards: structuredClone(input.participant.moduleAssessability.semanticGuards),
  };
  return {
    participantRef: input.participantRef,
    sourceModule: 'P2-A1',
    originalKernelStatus: input.participant.originalKernelStatus,
    originalAbstainReasons: [...input.participant.originalAbstainReasons],
    adapterClaimsPositiveEvidence: input.participant.adapterClaimsPositiveEvidence,
    descriptiveOnly: true,
    moduleProjection,
  };
}

export function projectProxyModuleAssessability(input: {
  readonly participantRef: string;
  readonly participant: DbiP2c2PowertrainProxyParticipantV1;
}): DbiP2c3ModuleAssessabilitySummaryV1 {
  const base = {
    participantRef: input.participantRef,
    sourceModule: input.participant.sourceModule,
    originalKernelStatus: input.participant.originalKernelStatus,
    originalAbstainReasons: [...input.participant.originalAbstainReasons],
    adapterClaimsPositiveEvidence: input.participant.adapterClaimsPositiveEvidence,
    descriptiveOnly: false as const,
  };

  switch (input.participant.sourceModule) {
    case 'P2-B1': {
      const moduleProjection: DbiP2c3ModuleProjectionV1 = {
        kind: 'B1_PROXY',
        moduleCoverage: structuredClone(input.participant.moduleCoverage),
      };
      return { ...base, sourceModule: 'P2-B1', moduleProjection };
    }
    case 'P2-B2': {
      const moduleProjection: DbiP2c3ModuleProjectionV1 = {
        kind: 'B2_PROXY',
        subtypeAssessability: structuredClone(input.participant.subtypeAssessability),
        moduleCoverage: structuredClone(input.participant.moduleCoverage),
      };
      return { ...base, sourceModule: 'P2-B2', moduleProjection };
    }
    case 'P2-B3': {
      const moduleProjection: DbiP2c3ModuleProjectionV1 = {
        kind: 'B3_PROXY',
        tripEvidenceClassification: input.participant.tripEvidenceClassification,
        partialCoverage: structuredClone(input.participant.partialCoverage),
      };
      return { ...base, sourceModule: 'P2-B3', moduleProjection };
    }
    case 'P2-B4': {
      const moduleProjection: DbiP2c3ModuleProjectionV1 = {
        kind: 'B4_PROXY',
        facetA: structuredClone(input.participant.facetA),
        facetB: structuredClone(input.participant.facetB),
      };
      return { ...base, sourceModule: 'P2-B4', moduleProjection };
    }
    default: {
      const exhaustive: never = input.participant;
      throw new Error(`unsupported proxy participant: ${(exhaustive as { sourceModule: string }).sourceModule}`);
    }
  }
}
