import { buildR1BlockedBundle, buildSyntheticApiBundleValid } from '../../ds4-rpm-real-data-replay/__tests__/ds4-rpm-real-data-replay-fixtures.harness';
import { executeDs4RpmRealDataFusionOfflineReplayV1 } from '../../ds4-rpm-real-data-fusion-replay/ds4-rpm-real-data-fusion-replay-orchestrator.v1';
import { buildDs4RpmPilotPreparationReportV1 } from '../ds4-rpm-pilot-preparation-report.v1';
import { classifyDs4RpmPilotScientificPlanningV1 } from '../ds4-rpm-pilot-scientific-planning.v1';
import {
  assertPilotCohortInScope,
  rankDs4RpmPilotTripCandidatesV1,
} from '../ds4-rpm-pilot-trip-candidate-ranking.v1';
import type { Ds4RpmPilotTripCandidateDescriptorV1 } from '../ds4-rpm-pilot-preparation.contract.v1';

const BASE_SHA = 'be4284e383654824e37d3dbcecdd9f82cefcfbfa';

function audiCandidate(overrides: Partial<Ds4RpmPilotTripCandidateDescriptorV1> = {}): Ds4RpmPilotTripCandidateDescriptorV1 {
  return {
    candidateTripId: 'audi-trip-a',
    cohortVehicleLabel: 'AUDI_A4',
    organizationId: 'org-pilot',
    vehicleId: 'veh-audi',
    providerSourceLinkId: 'link-audi',
    v1bAdmissionSucceeded: true,
    v1bInputFingerprintPresent: true,
    motionRunPresent: true,
    ds4AccelDecelEventCount: 4,
    rpmPointCount: 120,
    duplicateTimestampCount: 0,
    conflictingRpmValueCount: 0,
    estimatedMissingRpmBuckets: 0,
    vsiCadenceTier: 'RPM_1S',
    telemetrySourceFamily: 'API_SYNTHETIC',
    sourceFamilyAttestation: 'UNPROVEN',
    ...overrides,
  };
}

function tiguanCandidate(
  overrides: Partial<Ds4RpmPilotTripCandidateDescriptorV1> = {},
): Ds4RpmPilotTripCandidateDescriptorV1 {
  return {
    ...audiCandidate(),
    candidateTripId: 'tiguan-trip-a',
    cohortVehicleLabel: 'VW_TIGUAN',
    vehicleId: 'veh-tiguan',
    providerSourceLinkId: 'link-tiguan',
    ...overrides,
  };
}

describe('ds4-rpm-pilot-preparation P2-D2B (offline only)', () => {
  it('retains Audi and Tiguan identity scopes with historical unverified refs', () => {
    const report = buildDs4RpmPilotPreparationReportV1({ baseSha: BASE_SHA });
    expect(report.targetCohorts).toEqual(['AUDI_A4', 'VW_TIGUAN']);
    expect(report.identityReadiness.AUDI_A4.historicalReferences[0]?.plateLabel).toBe('KS MS 661');
    expect(report.identityReadiness.VW_TIGUAN.historicalReferences[0]?.plateLabel).toBe('WOB L 7503');
    expect(report.identityReadiness.AUDI_A4.organizationId).toBe('UNVERIFIED');
  });

  it('excludes Arteon and Tesla from pilot scope', () => {
    expect(assertPilotCohortInScope('VW_ARTEON')).toBe(false);
    expect(assertPilotCohortInScope('TESLA_MODEL_3')).toBe(false);
    const report = buildDs4RpmPilotPreparationReportV1({ baseSha: BASE_SHA });
    expect(report.excludedCohorts).toContain('VW_ARTEON');
  });

  it('abstains on missing vehicle identity and source link', () => {
    const ranked = rankDs4RpmPilotTripCandidatesV1([
      audiCandidate({ vehicleId: null }),
      audiCandidate({ providerSourceLinkId: null }),
    ]);
    expect(ranked[0]?.abstainReasons).toContain('MISSING_TENANT_OR_SOURCE_LINK_BINDING');
  });

  it('blocks R1 confirmed candidates from temporal fusion planning', () => {
    const classes = classifyDs4RpmPilotScientificPlanningV1({
      telemetrySourceFamily: 'RUPTELA_R1',
      sourceFamilyAttestation: 'PROVEN',
      v1bAdmissionSucceeded: true,
      motionRunPresent: true,
      rpmPointCount: 50,
      authorizedRealObservation: false,
    });
    expect(classes).toContain('TEMPORAL_FUSION_BLOCKED_R1');
    expect(classes).not.toContain('TEMPORAL_FUSION_UNVERIFIED');
  });

  it('treats UNKNOWN family as unverified', () => {
    const classes = classifyDs4RpmPilotScientificPlanningV1({
      telemetrySourceFamily: 'UNKNOWN',
      sourceFamilyAttestation: 'UNKNOWN',
      v1bAdmissionSucceeded: true,
      motionRunPresent: true,
      rpmPointCount: 10,
      authorizedRealObservation: false,
    });
    expect(classes).toContain('TEMPORAL_FUSION_UNVERIFIED');
  });

  it('does not treat API_SYNTHETIC as physical timestamp alignment proof', () => {
    const classes = classifyDs4RpmPilotScientificPlanningV1({
      telemetrySourceFamily: 'API_SYNTHETIC',
      sourceFamilyAttestation: 'PROVEN',
      v1bAdmissionSucceeded: true,
      motionRunPresent: true,
      rpmPointCount: 100,
      authorizedRealObservation: false,
    });
    expect(classes).toContain('TEMPORAL_FUSION_UNVERIFIED');
    expect(classes).toContain('REAL_OBSERVATION_NOT_AUTHORIZED');
  });

  it('keeps RPM_1S and RPM_2S tiers distinct in ranking scores', () => {
    const r1s = rankDs4RpmPilotTripCandidatesV1([
      audiCandidate({ candidateTripId: 'trip-1s', vsiCadenceTier: 'RPM_1S' }),
    ]);
    const r2s = rankDs4RpmPilotTripCandidatesV1([
      audiCandidate({ candidateTripId: 'trip-2s', vsiCadenceTier: 'RPM_2S' }),
    ]);
    expect(r1s[0]!.selectionScore).toBeGreaterThan(r2s[0]!.selectionScore);
  });

  it('ranks RPM_3S lower and marks observation-only fusion path via D2A fixture', () => {
    const ranked = rankDs4RpmPilotTripCandidatesV1([
      audiCandidate({ vsiCadenceTier: 'RPM_3S', rpmPointCount: 40 }),
    ]);
    expect(ranked[0]!.candidate.vsiCadenceTier).toBe('RPM_3S');
    expect(
      buildDs4RpmPilotPreparationReportV1({ baseSha: BASE_SHA }).rpmReadiness.AUDI_A4.rpm3sEventLocalFusionEligible,
    ).toBe(false);
  });

  it('abstains when motion run missing or v1b fingerprint missing', () => {
    const missingMotion = rankDs4RpmPilotTripCandidatesV1([audiCandidate({ motionRunPresent: false })]);
    expect(missingMotion[0]!.abstainReasons).toContain('NO_DEFENSIBLE_CANDIDATES_AFTER_GATES');
    const missingFp = rankDs4RpmPilotTripCandidatesV1([audiCandidate({ v1bInputFingerprintPresent: false })]);
    expect(missingFp[0]!.abstainReasons).toContain('NO_DEFENSIBLE_CANDIDATES_AFTER_GATES');
  });

  it('ranks trips deterministically with tie-breaker on trip id', () => {
    const a = rankDs4RpmPilotTripCandidatesV1([
      audiCandidate({ candidateTripId: 'trip-z', ds4AccelDecelEventCount: 2 }),
      audiCandidate({ candidateTripId: 'trip-a', ds4AccelDecelEventCount: 2 }),
    ]);
    expect(a[0]!.candidate.candidateTripId).toBe('trip-a');
    const b = rankDs4RpmPilotTripCandidatesV1([
      audiCandidate({ candidateTripId: 'trip-z', ds4AccelDecelEventCount: 2 }),
      audiCandidate({ candidateTripId: 'trip-a', ds4AccelDecelEventCount: 2 }),
    ]);
    expect(a).toEqual(b);
  });

  it('confirms no production reads in preparation report', () => {
    const report = buildDs4RpmPilotPreparationReportV1({ baseSha: BASE_SHA });
    expect(report.noProductionReadsPerformed).toBe(true);
    expect(report.noProviderCallsPerformed).toBe(true);
    expect(report.minimalReadPlan.AUDI_A4.productionReadPermitted).toBe(false);
  });

  it('never marks a candidate as tripSelected', () => {
    const ranked = rankDs4RpmPilotTripCandidatesV1([audiCandidate(), tiguanCandidate()]);
    expect(ranked.every((r) => r.tripSelected === false)).toBe(true);
  });

  it('preserves D2A R1 hard block on injected R1 bundle', () => {
    const artifact = executeDs4RpmRealDataFusionOfflineReplayV1(buildR1BlockedBundle(), {
      codeSha: 'pilot-regression-sha',
    });
    expect(artifact.r1Containment.r1VetoActive).toBe(true);
    expect(artifact.syntheticFusionStatus).not.toBe('COMPUTED');
  });

  it('preserves D2A synthetic replay for valid Audi-labeled fixture bundle', () => {
    const bundle = buildSyntheticApiBundleValid();
    expect(bundle.cohortVehicleLabel).toBe('AUDI_A4');
    const artifact = executeDs4RpmRealDataFusionOfflineReplayV1(bundle, {
      codeSha: 'pilot-regression-sha',
    });
    expect(artifact.researchReplayStatus).toBe('EXECUTED');
  });
});
