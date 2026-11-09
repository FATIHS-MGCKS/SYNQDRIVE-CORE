import type { DbiP2c2SourceModuleV1 } from '../dbi-p2c2-offline-evidence-adapters/dbi-p2c2-evidence-adapter.contract.v1';
import type {
  DbiP2c3CandidateInventoryRecordV1,
  DbiP2c3PairwiseReconciliationDecisionV1,
  DbiP2c3PairwiseRelationshipDecisionV1,
  DbiP2c3UnresolvedRelationshipV1,
} from './dbi-p2c3-reconciliation.contract.v1';
import {
  buildCandidateEnvelopeIdentityPayload,
  compareIsoIntervalOverlapOnly,
} from './dbi-p2c3-reconciliation.canonical.v1';
import { classificationIsPositiveProxy } from '../dbi-p2c2-offline-evidence-adapters/dbi-p2c2-evidence-adapter.shared.v1';

function buildPairDecision(input: {
  left: DbiP2c3CandidateInventoryRecordV1;
  right: DbiP2c3CandidateInventoryRecordV1;
  relationshipDecision: DbiP2c3PairwiseRelationshipDecisionV1;
  decisionRationaleCodes: readonly string[];
}): DbiP2c3PairwiseReconciliationDecisionV1 {
  const [left, right] =
    input.left.internalCandidateRef.localeCompare(input.right.internalCandidateRef) <= 0
      ? [input.left, input.right]
      : [input.right, input.left];
  return {
    leftCandidateRef: left.internalCandidateRef,
    rightCandidateRef: right.internalCandidateRef,
    leftSourceModule: left.sourceModule,
    rightSourceModule: right.sourceModule,
    relationshipDecision: input.relationshipDecision,
    decisionRationaleCodes: [...input.decisionRationaleCodes].sort(),
  };
}

export function computePairwiseReconciliation(input: {
  readonly candidates: readonly DbiP2c3CandidateInventoryRecordV1[];
  readonly maxPairs: number;
}): {
  readonly pairwiseDecisions: readonly DbiP2c3PairwiseReconciliationDecisionV1[];
  readonly unresolvedRelationships: readonly DbiP2c3UnresolvedRelationshipV1[];
  readonly budgetExceeded: boolean;
} {
  const sorted = [...input.candidates].sort((a, b) => {
    const moduleOrder = (m: DbiP2c2SourceModuleV1): number => {
      switch (m) {
        case 'P2-B1':
          return 1;
        case 'P2-B2':
          return 2;
        case 'P2-B3':
          return 3;
        case 'P2-B4':
          return 4;
        default:
          return 9;
      }
    };
    if (a.sourceModule !== b.sourceModule) return moduleOrder(a.sourceModule) - moduleOrder(b.sourceModule);
    if (a.sourcePlaneIndex !== b.sourcePlaneIndex) return a.sourcePlaneIndex - b.sourcePlaneIndex;
    if (a.sourceEpisodeKey !== b.sourceEpisodeKey) {
      return a.sourceEpisodeKey.localeCompare(b.sourceEpisodeKey);
    }
    const payloadCmp = buildCandidateEnvelopeIdentityPayload(a.candidateEnvelope).localeCompare(
      buildCandidateEnvelopeIdentityPayload(b.candidateEnvelope),
    );
    if (payloadCmp !== 0) return payloadCmp;
    if (a.sourceCandidateIndex !== b.sourceCandidateIndex) {
      return a.sourceCandidateIndex - b.sourceCandidateIndex;
    }
    return a.internalCandidateRef.localeCompare(b.internalCandidateRef);
  });

  const pairwiseDecisions: DbiP2c3PairwiseReconciliationDecisionV1[] = [];
  const unresolvedRelationships: DbiP2c3UnresolvedRelationshipV1[] = [];
  let pairCount = 0;

  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      pairCount++;
      if (pairCount > input.maxPairs) {
        return { pairwiseDecisions, unresolvedRelationships, budgetExceeded: true };
      }
      const left = sorted[i]!;
      const right = sorted[j]!;

      const leftPayload = buildCandidateEnvelopeIdentityPayload(left.candidateEnvelope);
      const rightPayload = buildCandidateEnvelopeIdentityPayload(right.candidateEnvelope);

      if (left.sourceModule === right.sourceModule) {
        if (leftPayload === rightPayload) {
          const leftPositive = classificationIsPositiveProxy(left.originalClassification);
          const rightPositive = classificationIsPositiveProxy(right.originalClassification);
          if (leftPositive && rightPositive) {
            pairwiseDecisions.push(
              buildPairDecision({
                left,
                right,
                relationshipDecision: 'SAME_SOURCE_DUPLICATE',
                decisionRationaleCodes: ['SAME_MODULE_SAME_SOURCE_IDENTITY_AND_PAYLOAD'],
              }),
            );
          } else {
            pairwiseDecisions.push(
              buildPairDecision({
                left,
                right,
                relationshipDecision: 'INSUFFICIENT_ALIGNMENT_EVIDENCE',
                decisionRationaleCodes: ['NON_POSITIVE_DUPLICATE_NOT_AUTHORIZED_V1_EDGE'],
              }),
            );
          }
          continue;
        }

        if (left.sourceEpisodeKey === right.sourceEpisodeKey) {
          unresolvedRelationships.push({
            kind: 'EPISODE_KEY_COLLISION',
            leftCandidateRef: left.internalCandidateRef,
            rightCandidateRef: right.internalCandidateRef,
            sharedSourceEpisodeKey: left.sourceEpisodeKey,
            detailCodes: ['SAME_EPISODE_KEY_DIFFERENT_PAYLOAD_NOT_ONE_EVENT'],
          });
          pairwiseDecisions.push(
            buildPairDecision({
              left,
              right,
              relationshipDecision: 'INSUFFICIENT_ALIGNMENT_EVIDENCE',
              decisionRationaleCodes: ['EPISODE_KEY_COLLISION_WITHOUT_EXPLICIT_CONTRADICTION_CONTRACT'],
            }),
          );
          continue;
        }

        pairwiseDecisions.push(
          buildPairDecision({
            left,
            right,
            relationshipDecision: 'INSUFFICIENT_ALIGNMENT_EVIDENCE',
            decisionRationaleCodes: ['SAME_MODULE_NO_AUTHORIZED_V1_POSITIVE_RELATIONSHIP_WITHOUT_DUPLICATE_PROOF'],
          }),
        );
        continue;
      }

      if (
        compareIsoIntervalOverlapOnly(left.candidateEnvelope.originalCandidate, right.candidateEnvelope.originalCandidate)
      ) {
        pairwiseDecisions.push(
          buildPairDecision({
            left,
            right,
            relationshipDecision: 'INSUFFICIENT_ALIGNMENT_EVIDENCE',
            decisionRationaleCodes: [
              'TIMESTAMP_RANGE_OVERLAP_ALONE_INSUFFICIENT',
              'SHARED_LABEL_EVIDENCE_UNAVAILABLE_V1',
            ],
          }),
        );
        unresolvedRelationships.push({
          kind: 'CROSS_MODULE_ALIGNMENT_UNAVAILABLE',
          leftCandidateRef: left.internalCandidateRef,
          rightCandidateRef: right.internalCandidateRef,
          detailCodes: ['NO_CROSS_MODULE_INTERVAL_EDGE_WITHOUT_LABEL_CONTRACT'],
        });
        continue;
      }

      pairwiseDecisions.push(
        buildPairDecision({
          left,
          right,
          relationshipDecision: 'INSUFFICIENT_ALIGNMENT_EVIDENCE',
          decisionRationaleCodes: ['CROSS_MODULE_NO_SCIENTIFICALLY_VALID_ALIGNMENT_V1'],
        }),
      );
      unresolvedRelationships.push({
        kind: 'CROSS_MODULE_ALIGNMENT_UNAVAILABLE',
        leftCandidateRef: left.internalCandidateRef,
        rightCandidateRef: right.internalCandidateRef,
        detailCodes: ['CROSS_MODULE_RELATIONSHIP_PROOF_UNAVAILABLE'],
      });
    }
  }

  return { pairwiseDecisions, unresolvedRelationships, budgetExceeded: false };
}
