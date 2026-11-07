/**
 * Frozen historical Motion-Core shadow fixtures for DBI W0 offline replay (research only).
 * Paths are repo-relative from repository root.
 */

export type Ds4DbiW0HistoricalFixtureIdV1 = 'TIG22' | 'TES16';

export type Ds4DbiW0HistoricalFixtureRecordV1 = {
  fixtureId: Ds4DbiW0HistoricalFixtureIdV1;
  tripId: string;
  organizationId: string | null;
  vehicleLabel: string;
  sourceFamily: 'PRODUCTION_SHADOW_RESULT' | 'API_SYNTHETIC' | 'UNVERIFIED';
  /** Relative to repository root. */
  provenanceManifestRelPath: string;
  tripIdentityRelPath: string | null;
  motionCoreShadowPayloadRelPath: string | null;
  motionCoreShadowRunMetaRelPath: string | null;
  expectedPayloadContentSha256: string | null;
  expectedShadowBundleVersion: string | null;
  expectedSourceMotionRunId: string | null;
};

export const DS4_DBI_W0_HISTORICAL_FIXTURES_V1: Readonly<Record<Ds4DbiW0HistoricalFixtureIdV1, Ds4DbiW0HistoricalFixtureRecordV1>> = {
  TIG22: {
    fixtureId: 'TIG22',
    tripId: '98d2a8e0-8b7d-4529-bf76-acee44d61fbe',
    organizationId: 'faa710c9-6d91-4079-a7d5-91fdccdec14a',
    vehicleLabel: 'VW Tiguan 2026-10-22',
    sourceFamily: 'PRODUCTION_SHADOW_RESULT',
    provenanceManifestRelPath:
      'research/driving-intelligence/evaluations/ds4-speed-video-reference-20261023/inputs/tiguan-20261022/PROVENANCE_MANIFEST.json',
    tripIdentityRelPath:
      'research/driving-intelligence/evaluations/ds4-speed-video-reference-20261023/inputs/tiguan-20261022/snapshots/TRIP_IDENTITY.json',
    motionCoreShadowPayloadRelPath:
      'research/driving-intelligence/evaluations/ds4-speed-video-reference-20261023/inputs/tiguan-20261022/snapshots/di_v0_motion_core_shadow_payload.json',
    motionCoreShadowRunMetaRelPath:
      'research/driving-intelligence/evaluations/ds4-speed-video-reference-20261023/inputs/tiguan-20261022/snapshots/di_v0_motion_core_shadow_run_meta.json',
    expectedPayloadContentSha256: 'fca7baef63b3ef84e2cd0f1f44f08f0b6ced2294738ba65a5a1b74eca99f7c8a',
    expectedShadowBundleVersion: 'DI_V0_MOTION_CORE_SHADOW_BUNDLE_V1_FABLE_REVIEW_RECOMMENDED',
    expectedSourceMotionRunId: '8ec6306e-606b-4507-ab03-ea058c5d810d',
  },
  TES16: {
    fixtureId: 'TES16',
    tripId: '358d0158-b2a9-47ed-af26-33926c5770b4',
    organizationId: null,
    vehicleLabel: 'Tesla Model 3 2026-10-16',
    sourceFamily: 'API_SYNTHETIC',
    provenanceManifestRelPath: 'architecture/drivingintelligence/evidence/ldi-10d/fixtures/tesla-20261016/PROVENANCE_MANIFEST.json',
    tripIdentityRelPath: null,
    motionCoreShadowPayloadRelPath: null,
    motionCoreShadowRunMetaRelPath: null,
    expectedPayloadContentSha256: null,
    expectedShadowBundleVersion: null,
    expectedSourceMotionRunId: null,
  },
};
