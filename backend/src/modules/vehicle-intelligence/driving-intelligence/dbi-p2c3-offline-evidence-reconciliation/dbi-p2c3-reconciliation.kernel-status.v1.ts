import type { DbiP2c2A1EvidenceParticipantV1, DbiP2c2PowertrainProxyParticipantV1 } from '../dbi-p2c2-offline-evidence-adapters/dbi-p2c2-evidence-adapter.contract.v1';
import type { DbiP2c3ReconciliationDiagnosticCodeV1 } from './dbi-p2c3-reconciliation.contract.v1';

const POWERTRAIN_KERNEL_STATUSES = new Set(['COMPUTED', 'NOT_OBSERVED', 'ABSTAINED']);
const A1_KERNEL_STATUSES = new Set(['COMPUTED', 'ABSTAINED', 'NOT_APPLICABLE']);

export function isKnownPowertrainKernelStatus(status: string): boolean {
  return POWERTRAIN_KERNEL_STATUSES.has(status);
}

export function isKnownA1KernelStatus(status: string): boolean {
  return A1_KERNEL_STATUSES.has(status);
}

export function validatePowertrainKernelStatus(
  participant: DbiP2c2PowertrainProxyParticipantV1,
): DbiP2c3ReconciliationDiagnosticCodeV1[] {
  if (!isKnownPowertrainKernelStatus(participant.originalKernelStatus)) {
    return ['PARTICIPANT_KERNEL_STATUS_INVALID'];
  }
  return [];
}

export function validateA1KernelStatus(participant: DbiP2c2A1EvidenceParticipantV1): DbiP2c3ReconciliationDiagnosticCodeV1[] {
  if (!isKnownA1KernelStatus(participant.originalKernelStatus)) {
    return ['PARTICIPANT_KERNEL_STATUS_INVALID'];
  }
  return [];
}
