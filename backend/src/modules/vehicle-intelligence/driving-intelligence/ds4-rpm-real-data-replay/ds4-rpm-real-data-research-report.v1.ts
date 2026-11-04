import type {
  Ds4RpmRealDataReplayTripArtifactV1,
  Ds4RpmRealDataResearchReportV1,
} from './ds4-rpm-real-data-replay.contract.v1';
import { DS4_RPM_REAL_DATA_REPLAY_EXECUTOR_CONTRACT_VERSION } from './ds4-rpm-real-data-replay.contract.v1';
import { DS4_RPM_REAL_DATA_UNSUPPORTED_SCIENTIFIC_CLAIMS } from './ds4-rpm-real-data-replay-executor.v1';
import { DS4_RPM_REAL_DATA_SCIENTIFIC_OUTPUT_GUARD_CLAIMS } from './ds4-rpm-real-data-scientific-output-guard.v1';

function increment(map: Record<string, number>, key: string, by = 1): void {
  map[key] = (map[key] ?? 0) + by;
}

export function buildDs4RpmRealDataResearchReportV1(input: {
  reportId: string;
  codeSha: string;
  generatedAt: Date;
  tripArtifacts: readonly Ds4RpmRealDataReplayTripArtifactV1[];
}): Ds4RpmRealDataResearchReportV1 {
  const eligibilityCounts = { eligible: 0, blocked: 0, unproven: 0, notApplicable: 0 };
  const contextClassificationTotals: Record<string, number> = {};
  const sourceFamilyDistribution: Record<string, number> = {};
  const localCadenceTierDistribution: Record<string, number> = {};
  const alignmentStabilityDistribution: Record<string, number> = {};
  const abstentionReasonHistogram: Record<string, number> = {};
  let gapDeficiencySecondsSum = 0;
  let gapDeficiencyEventCount = 0;

  for (const artifact of input.tripArtifacts) {
    increment(sourceFamilyDistribution, artifact.resolvedTelemetrySourceFamily);
    switch (artifact.eligibility.overallVerdict) {
      case 'ELIGIBLE':
        eligibilityCounts.eligible += 1;
        break;
      case 'BLOCKED':
        eligibilityCounts.blocked += 1;
        break;
      case 'NOT_APPLICABLE':
        eligibilityCounts.notApplicable += 1;
        break;
      default:
        eligibilityCounts.unproven += 1;
    }
    for (const r of artifact.eligibility.abstainReasons) {
      increment(abstentionReasonHistogram, r);
    }
    for (const r of artifact.abstainReasons) {
      increment(abstentionReasonHistogram, `EXECUTOR:${r}`);
    }

    const report = artifact.shadowTripReport;
    if (!report) continue;

    for (const [k, v] of Object.entries(report.summary.byContextClassification)) {
      increment(contextClassificationTotals, k, v);
    }
    for (const e of report.events) {
      increment(localCadenceTierDistribution, e.cadenceTier ?? 'UNKNOWN');
      if (e.alignmentEnvelope?.directionSignEnvelopeStability) {
        increment(
          alignmentStabilityDistribution,
          e.alignmentEnvelope.directionSignEnvelopeStability,
        );
      }
      if (e.eventTemporalSupport?.gapDeficiencySeconds != null) {
        gapDeficiencySecondsSum += e.eventTemporalSupport.gapDeficiencySeconds;
        gapDeficiencyEventCount += 1;
      }
      for (const code of e.reasonCodes) {
        increment(abstentionReasonHistogram, code);
      }
    }
  }

  return {
    contractVersion: DS4_RPM_REAL_DATA_REPLAY_EXECUTOR_CONTRACT_VERSION,
    reportId: input.reportId,
    generatedAtIso: input.generatedAt.toISOString(),
    codeSha: input.codeSha,
    executionBoundary: 'OFFLINE_INJECTED_BUNDLE_ONLY',
    inputBundleFingerprints: input.tripArtifacts.map((a) => a.inputFingerprint),
    eligibilityCounts,
    contextClassificationTotals,
    sourceFamilyDistribution,
    localCadenceTierDistribution,
    alignmentStabilityDistribution,
    abstentionReasonHistogram,
    gapDeficiencySecondsSum,
    gapDeficiencyEventCount,
    tripArtifacts: input.tripArtifacts,
    unsupportedScientificClaims: [
      ...DS4_RPM_REAL_DATA_UNSUPPORTED_SCIENTIFIC_CLAIMS,
      ...DS4_RPM_REAL_DATA_SCIENTIFIC_OUTPUT_GUARD_CLAIMS,
    ],
  };
}

export function executeDs4RpmRealDataOfflineReplayCohortV1(input: {
  reportId: string;
  codeSha: string;
  generatedAt?: Date;
  tripArtifacts: readonly Ds4RpmRealDataReplayTripArtifactV1[];
}): Ds4RpmRealDataResearchReportV1 {
  return buildDs4RpmRealDataResearchReportV1({
    reportId: input.reportId,
    codeSha: input.codeSha,
    generatedAt: input.generatedAt ?? new Date('2026-11-04T08:00:00.000Z'),
    tripArtifacts: input.tripArtifacts,
  });
}
