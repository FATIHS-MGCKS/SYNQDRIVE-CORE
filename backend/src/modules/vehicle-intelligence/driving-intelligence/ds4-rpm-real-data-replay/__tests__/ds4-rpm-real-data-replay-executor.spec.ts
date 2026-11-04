import {
  createStaticOfflineEvidenceAdapter,
  type Ds4RpmRealDataOfflineEvidenceAdapterV1,
} from '../ds4-rpm-real-data-offline-evidence.adapter.v1';
import { executeDs4RpmRealDataOfflineReplayTripV1 } from '../ds4-rpm-real-data-replay-executor.v1';
import {
  buildDs4RpmRealDataResearchReportV1,
  executeDs4RpmRealDataOfflineReplayCohortV1,
} from '../ds4-rpm-real-data-research-report.v1';
import {
  PR_B2_FIXTURE_BUNDLE_BUILDERS,
  buildCadenceMismatchBundle,
  buildCrossTenantBundle,
  buildDuplicateTimestampBundle,
  buildMissingRpmWindowBundle,
  buildR1BlockedBundle,
  buildSyntheticApiBundleValid,
  buildTeslaNotApplicableBundle,
  buildUnknownSourceBundle,
  buildV1bNonAdmissionBundle,
  buildWrongSourceLinkBundle,
} from './ds4-rpm-real-data-replay-fixtures.harness';

const CODE_SHA = 'test-sha-ds4-rpm-real-data-replay-b2';
const GENERATED_AT = new Date('2026-11-04T08:00:00.000Z');

describe('ds4-rpm-real-data-replay executor v1 (offline only)', () => {
  it('replays valid synthetic API bundle with defensible motion context (not field accuracy)', () => {
    const bundle = buildSyntheticApiBundleValid(GENERATED_AT);
    const artifact = executeDs4RpmRealDataOfflineReplayTripV1(bundle, {
      codeSha: CODE_SHA,
      generatedAt: GENERATED_AT,
    });
    expect(artifact.eligibility.overallVerdict).toBe('UNPROVEN');
    expect(artifact.shadowTripReport).not.toBeNull();
    expect(artifact.shadowTripReport!.summary.eventsWithDefensibleContext).toBeGreaterThan(0);
    expect(artifact.resolvedTelemetrySourceFamily).toBe('API_SYNTHETIC');
    expect(artifact.unsupportedScientificClaims.length).toBeGreaterThan(0);
  });

  it('blocks R1 historical OBD at eligibility and correlation layers', () => {
    const artifact = executeDs4RpmRealDataOfflineReplayTripV1(buildR1BlockedBundle(GENERATED_AT), {
      codeSha: CODE_SHA,
      generatedAt: GENERATED_AT,
    });
    expect(artifact.eligibility.overallVerdict).toBe('BLOCKED');
    expect(artifact.abstainReasons).toContain('ELIGIBILITY_BLOCKED');
    expect(
      artifact.shadowTripReport?.events.every((e) =>
        e.reasonCodes.includes('R1_HISTORICAL_OBD_POINT_TIME_CORRELATION_PROHIBITED'),
      ),
    ).toBe(true);
  });

  it('rejects unknown DIMO identity source family before correlation', () => {
    const artifact = executeDs4RpmRealDataOfflineReplayTripV1(buildUnknownSourceBundle(GENERATED_AT), {
      codeSha: CODE_SHA,
      generatedAt: GENERATED_AT,
    });
    expect(artifact.abstainReasons).toContain('BUNDLE_IDENTITY_BINDING_FAILED');
    expect(artifact.abstainReasons).toContain('SOURCE_FAMILY_UNKNOWN');
    expect(artifact.shadowTripReport).toBeNull();
  });

  it('classifies Tesla ICE RPM as NOT_APPLICABLE', () => {
    const artifact = executeDs4RpmRealDataOfflineReplayTripV1(buildTeslaNotApplicableBundle(GENERATED_AT), {
      codeSha: CODE_SHA,
      generatedAt: GENERATED_AT,
    });
    expect(artifact.eligibility.overallVerdict).toBe('NOT_APPLICABLE');
    expect(artifact.abstainReasons).toContain('ELIGIBILITY_NOT_APPLICABLE');
  });

  it('rejects cross-tenant bundle binding', () => {
    const artifact = executeDs4RpmRealDataOfflineReplayTripV1(buildCrossTenantBundle(GENERATED_AT), {
      codeSha: CODE_SHA,
      generatedAt: GENERATED_AT,
    });
    expect(artifact.shadowTripReport).toBeNull();
    expect(artifact.abstainReasons).toContain('BUNDLE_IDENTITY_BINDING_FAILED');
  });

  it('rejects wrong provider source link binding', () => {
    const artifact = executeDs4RpmRealDataOfflineReplayTripV1(buildWrongSourceLinkBundle(GENERATED_AT), {
      codeSha: CODE_SHA,
      generatedAt: GENERATED_AT,
    });
    expect(artifact.shadowTripReport).toBeNull();
    expect(artifact.abstainReasons).toContain('BUNDLE_IDENTITY_BINDING_FAILED');
  });

  it('abstains when V1B admission denied', () => {
    const artifact = executeDs4RpmRealDataOfflineReplayTripV1(buildV1bNonAdmissionBundle(GENERATED_AT), {
      codeSha: CODE_SHA,
      generatedAt: GENERATED_AT,
    });
    expect(artifact.shadowTripReport).not.toBeNull();
    expect(artifact.shadowTripReport!.summary.byContextClassification.UNAVAILABLE).toBeGreaterThan(0);
    expect(
      artifact.shadowTripReport!.events.some((e) => e.reasonCodes.includes('V1B_ADMISSION_DENIED')),
    ).toBe(true);
  });

  it('surfaces trip-tier vs local cadence mismatch as PARTIAL not AVAILABLE-only', () => {
    const artifact = executeDs4RpmRealDataOfflineReplayTripV1(buildCadenceMismatchBundle(GENERATED_AT), {
      codeSha: CODE_SHA,
      generatedAt: GENERATED_AT,
    });
    expect(artifact.shadowTripReport).not.toBeNull();
    const events = artifact.shadowTripReport!.events;
    expect(
      events.some((e) => e.reasonCodes.includes('LOCAL_EVENT_CADENCE_COARSER_THAN_VSI_TIER')),
    ).toBe(true);
  });

  it('handles missing RPM observation windows', () => {
    const artifact = executeDs4RpmRealDataOfflineReplayTripV1(buildMissingRpmWindowBundle(GENERATED_AT), {
      codeSha: CODE_SHA,
      generatedAt: GENERATED_AT,
    });
    expect(artifact.shadowTripReport!.summary.byContextClassification.UNAVAILABLE).toBeGreaterThan(0);
  });

  it('flags duplicate RPM timestamps in event windows', () => {
    const artifact = executeDs4RpmRealDataOfflineReplayTripV1(buildDuplicateTimestampBundle(GENERATED_AT), {
      codeSha: CODE_SHA,
      generatedAt: GENERATED_AT,
    });
    expect(
      artifact.shadowTripReport!.events.some((e) =>
        e.reasonCodes.includes('DUPLICATE_RPM_TIMESTAMPS_IN_WINDOW'),
      ),
    ).toBe(true);
  });

  it('probes alignment envelope offsets on valid synthetic fixture', () => {
    const artifact = executeDs4RpmRealDataOfflineReplayTripV1(buildSyntheticApiBundleValid(GENERATED_AT), {
      codeSha: CODE_SHA,
      generatedAt: GENERATED_AT,
    });
    const event = artifact.shadowTripReport!.events.find((e) => e.observedRpmPointCountInWindow > 0);
    expect(event?.alignmentEnvelope.offsetSecondsProbed.length).toBeGreaterThan(3);
    expect(event?.alignmentSensitivity.length).toBeGreaterThan(0);
  });

  it('is deterministic for repeated replay of the same bundle', () => {
    const bundle = buildSyntheticApiBundleValid(GENERATED_AT);
    const a = executeDs4RpmRealDataOfflineReplayTripV1(bundle, {
      codeSha: CODE_SHA,
      generatedAt: GENERATED_AT,
    });
    const b = executeDs4RpmRealDataOfflineReplayTripV1(bundle, {
      codeSha: CODE_SHA,
      generatedAt: GENERATED_AT,
    });
    expect(a).toEqual(b);
  });

  it('builds cohort research report with histograms and explicit unsupported claims', () => {
    const bundles = PR_B2_FIXTURE_BUNDLE_BUILDERS.map((fn) => fn(GENERATED_AT));
    const adapter: Ds4RpmRealDataOfflineEvidenceAdapterV1 = createStaticOfflineEvidenceAdapter(bundles);
    const artifacts = adapter.listBundleIds().map((id) => {
      const bundle = adapter.loadBundle(id)!;
      return executeDs4RpmRealDataOfflineReplayTripV1(bundle, {
        codeSha: CODE_SHA,
        generatedAt: GENERATED_AT,
      });
    });
    const reportA = executeDs4RpmRealDataOfflineReplayCohortV1({
      reportId: 'pr-b2-fixture-cohort',
      codeSha: CODE_SHA,
      generatedAt: GENERATED_AT,
      tripArtifacts: artifacts,
    });
    const reportB = buildDs4RpmRealDataResearchReportV1({
      reportId: 'pr-b2-fixture-cohort',
      codeSha: CODE_SHA,
      generatedAt: GENERATED_AT,
      tripArtifacts: artifacts,
    });
    expect(reportA).toEqual(reportB);
    expect(reportA.eligibilityCounts.blocked).toBeGreaterThan(0);
    expect(reportA.eligibilityCounts.notApplicable).toBeGreaterThan(0);
    expect(reportA.inputBundleFingerprints.length).toBe(bundles.length);
    expect(reportA.unsupportedScientificClaims).toContain('NO_REAL_WORLD_ACCURACY_OR_CAUSALITY_CLAIM');
  });

  it('never treats owner authorization flag as production access (remains false)', () => {
    const bundle = buildSyntheticApiBundleValid(GENERATED_AT);
    expect(bundle.ownerAuthorizedProductionExecutionDeclared).toBe(false);
    expect(() =>
      executeDs4RpmRealDataOfflineReplayTripV1(bundle, {
        codeSha: CODE_SHA,
        productionEvidenceSource: null,
      }),
    ).not.toThrow();
  });
});
