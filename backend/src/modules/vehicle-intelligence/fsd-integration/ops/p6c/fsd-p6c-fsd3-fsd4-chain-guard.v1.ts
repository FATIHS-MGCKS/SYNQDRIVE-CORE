import type { Fsd3OneShotExecutionResultV1 } from '../fsd3-one-shot-execution.service';
import type { Fsd4OneShotExecutionResultV1 } from '../fsd4-one-shot-execution.service';
import type { Fsd3DiscoveryRunInspectorReportV1 } from '../fsd3-discovery-run-inspector.service';

const FSD3_FSD4_REUSE_ALLOWED = new Set(['COMPLETED']);

export function assertFsd3TerminalAllowsFsd4ReuseV1(fsd3: Fsd3OneShotExecutionResultV1): void {
  if (!fsd3.runId?.trim()) {
    throw new Error('FSD_P6C_FSD3_RUN_ID_MISSING');
  }
  if (!FSD3_FSD4_REUSE_ALLOWED.has(fsd3.terminalStatus)) {
    throw new Error(`FSD_P6C_FSD4_BLOCKED_FSD3_${fsd3.terminalStatus}`);
  }
}

export function assertFsd4TerminalAllowsFleetContinueV1(fsd4: Fsd4OneShotExecutionResultV1): void {
  if (fsd4.terminalStatus === 'FAILED' || fsd4.terminalStatus === 'SKIPPED') {
    throw new Error(`FSD_P6C_FLEET_STOPPED_FSD4_${fsd4.terminalStatus}`);
  }
}

export function assertInspectorNoUnknownOutcomeStopV1(
  label: string,
  inspector: Fsd3DiscoveryRunInspectorReportV1 | null | undefined,
): void {
  if (!inspector) {
    return;
  }
  if (inspector.unknownOutcomeStages.length > 0) {
    throw new Error(`FSD_P6C_FLEET_STOPPED_UNKNOWN_OUTCOME_${label}`);
  }
  if (inspector.strandedInProgress) {
    throw new Error(`FSD_P6C_FLEET_STOPPED_STRANDED_IN_PROGRESS_${label}`);
  }
}
