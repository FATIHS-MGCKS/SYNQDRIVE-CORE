import {
  APDS_V3_CONSUMER_DEMAND_REGISTRY_VERSION,
  type ConsumerDemandEntry,
} from './consumer-demand-registry.v1';
import { listSnapshotBackedConsumers } from './consumer-demand-registry.v1';

export type ConsumerSignalEvidence = {
  decisionAtMs: number;
  strictLvProviderSourceMs: number | null;
  topLevelProviderSourceMs: number | null;
  tripFsmState: 'RESTING' | 'ACTIVE' | 'UNKNOWN';
};

export type ConsumerDemandGateResult = {
  registryVersion: typeof APDS_V3_CONSUMER_DEMAND_REGISTRY_VERSION;
  revisionValid: boolean;
  /** True when an authoritative WOULD_SKIP claim is not allowed */
  blocksAuthoritativeSafeSkip: boolean;
  reasons: string[];
};

function signalEvidencePresent(
  entry: ConsumerDemandEntry,
  ev: ConsumerSignalEvidence,
): boolean | null {
  switch (entry.signalGroup) {
    case 'STRICT_LV_PROVIDER_SOURCE':
      return ev.strictLvProviderSourceMs != null;
    case 'TOP_LEVEL_PROVIDER_SOURCE_TIMESTAMP':
      return ev.topLevelProviderSourceMs != null;
    case 'SPEED_IGNITION_PROVIDER_WAKE':
      return ev.tripFsmState !== 'UNKNOWN';
    default:
      return null;
  }
}

export function validateConsumerDemandRevision(revision: string): boolean {
  return revision === APDS_V3_CONSUMER_DEMAND_REGISTRY_VERSION;
}

export function evaluateConsumerDemandGate(
  consumerDemandRevision: string,
  evidence: ConsumerSignalEvidence,
  consumers: ConsumerDemandEntry[] = listSnapshotBackedConsumers(),
): ConsumerDemandGateResult {
  const revisionValid = validateConsumerDemandRevision(consumerDemandRevision);
  const reasons: string[] = [];
  if (!revisionValid) {
    reasons.push('CONSUMER_DEMAND_REVISION_MISMATCH');
  }

  for (const c of consumers) {
    if (c.dataSource !== 'DIMO_SNAPSHOT') continue;

    if (
      c.hardSafety &&
      c.missingDataBehavior === 'FAIL_CLOSED_POLL' &&
      c.freshness.kind === 'UNKNOWN'
    ) {
      reasons.push(`HARD_UNKNOWN_FRESHNESS:${c.consumerId}`);
    }

    if (c.freshness.kind === 'UNCALIBRATED_ASSUMPTION') {
      reasons.push(`UNCALIBRATED_NOT_CERTIFIED:${c.consumerId}`);
    }

    const present = signalEvidencePresent(c, evidence);
    if (c.hardSafety && present === false) {
      reasons.push(`MISSING_SIGNAL_EVIDENCE:${c.consumerId}:${c.signalGroup}`);
    }
  }

  const blocksAuthoritativeSafeSkip = reasons.length > 0 || !revisionValid;

  return {
    registryVersion: APDS_V3_CONSUMER_DEMAND_REGISTRY_VERSION,
    revisionValid,
    blocksAuthoritativeSafeSkip,
    reasons,
  };
}
