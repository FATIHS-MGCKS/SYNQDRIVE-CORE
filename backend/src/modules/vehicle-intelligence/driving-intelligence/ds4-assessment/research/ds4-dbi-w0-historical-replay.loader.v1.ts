import { createHash } from 'crypto';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import type { DiV0MotionCoreShadowPayloadV1 } from '../../motion-core-shadow-worker/di-v0-motion-core-shadow.types';
import {
  deriveDs4DrivingExposureV1,
  type Ds4DrivingExposureV1,
} from '../ds4-assessment-driving-exposure.v1';
import type { Ds4SpeedAuthorityPartitionV1 } from '../ds4-trip-assessment-v1.contract';
import type { Ds4DbiW0TripMetaV1 } from './ds4-dbi-w0-mbf-kernel.v1';
import {
  DS4_DBI_W0_HISTORICAL_FIXTURES_V1,
  type Ds4DbiW0HistoricalFixtureIdV1,
  type Ds4DbiW0HistoricalFixtureRecordV1,
} from './ds4-dbi-w0-historical-replay.fixture-registry.v1';
import { resolveW0SpeedAuthorityPartitionV1 } from './ds4-dbi-w0-moving-exposure-clock.v1';

export type Ds4DbiW0HistoricalReplayBindingTierV1 = 'STRICT' | 'RELAXED';

export type Ds4DbiW0HistoricalReplayBindingFailureCodeV1 =
  | 'FIXTURE_FILE_MISSING'
  | 'PROVENANCE_MANIFEST_PARSE'
  | 'PAYLOAD_HASH_MISMATCH'
  | 'RUN_META_MISMATCH'
  | 'TRIP_IDENTITY_MISMATCH'
  | 'PAYLOAD_JSON_PARSE'
  | 'NO_MOTION_PAYLOAD_BYTES'
  | 'SPEED_AUTHORITY_NOT_ATTESTED'
  | 'EXPOSURE_NOT_DERIVABLE'
  | 'DISTANCE_KM_NOT_ATTESTED'
  | 'SHADOW_BUNDLE_VERSION_MISMATCH'
  | 'SOURCE_MOTION_RUN_ID_MISMATCH';

export type Ds4DbiW0HistoricalSpeedAuthorityBindingV1 =
  | {
      ok: true;
      partition: Ds4SpeedAuthorityPartitionV1;
      source: 'PAYLOAD_CONTRACT' | 'UNANIMOUS_C4_ESTIMATOR_WITH_RELAXED_POLICY';
      limitations: string[];
    }
  | {
      ok: false;
      code: 'SPEED_AUTHORITY_NOT_ATTESTED';
      detail: string;
      limitations: string[];
    };

export type Ds4DbiW0HistoricalReplayLoadSuccessV1 = {
  ok: true;
  fixture: Ds4DbiW0HistoricalFixtureRecordV1;
  payload: DiV0MotionCoreShadowPayloadV1;
  payloadFileSha256: string;
  tripMeta: Ds4DbiW0TripMetaV1;
  drivingExposure: Ds4DrivingExposureV1;
  speedAuthorityBinding: Ds4DbiW0HistoricalSpeedAuthorityBindingV1 & { ok: true };
  provenanceLimitations: string[];
  tripDistanceKmFromIdentity: number | null;
};

export type Ds4DbiW0HistoricalReplayLoadFailureV1 = {
  ok: false;
  fixtureId: Ds4DbiW0HistoricalFixtureIdV1;
  codes: Ds4DbiW0HistoricalReplayBindingFailureCodeV1[];
  detail: string;
  provenanceLimitations: string[];
};

export type Ds4DbiW0HistoricalReplayLoadResultV1 =
  | Ds4DbiW0HistoricalReplayLoadSuccessV1
  | Ds4DbiW0HistoricalReplayLoadFailureV1;

function sha256File(absPath: string): string {
  return createHash('sha256').update(readFileSync(absPath)).digest('hex');
}

/** Seven levels up from `.../ds4-assessment/research` → repository root. */
function resolveRepoRootFromBackendModule(): string {
  return join(__dirname, '../../../../../../..');
}

export function resolveHistoricalSpeedAuthorityBindingV1(input: {
  payload: DiV0MotionCoreShadowPayloadV1;
  bindingTier: Ds4DbiW0HistoricalReplayBindingTierV1;
}): Ds4DbiW0HistoricalSpeedAuthorityBindingV1 {
  const fromContract = resolveW0SpeedAuthorityPartitionV1(input.payload);
  if (fromContract) {
    return {
      ok: true,
      partition: fromContract,
      source: 'PAYLOAD_CONTRACT',
      limitations: [],
    };
  }

  const c4Version = input.payload.contract?.algorithmVersions?.c4 ?? null;
  const estimators = new Set(
    input.payload.speeds.map((r) => r.estimator).filter((e): e is string => typeof e === 'string' && e.length > 0),
  );

  if (
    input.bindingTier === 'RELAXED' &&
    c4Version &&
    estimators.size === 1 &&
    estimators.has(c4Version)
  ) {
    return {
      ok: true,
      partition: 'C4_ONLY',
      source: 'UNANIMOUS_C4_ESTIMATOR_WITH_RELAXED_POLICY',
      limitations: [
        'PAYLOAD_OMITS_contract.speedAuthority',
        'PARTITION_INFERRED_FROM_UNANIMOUS_C4_ESTIMATOR_NOT_SEALED_ATTESTATION',
      ],
    };
  }

  return {
    ok: false,
    code: 'SPEED_AUTHORITY_NOT_ATTESTED',
    detail:
      'payload.contract.speedAuthority is absent and STRICT binding (or RELAXED without unanimous C4 estimator) forbids partition inference',
    limitations: ['NO_VERIFIED_SPEED_AUTHORITY_PARTITION'],
  };
}

type TripIdentityV1 = {
  trip?: { id?: string; distance_km?: number };
  di_artifacts?: { motion_core_shadow_run_id?: string };
};

export function loadDs4DbiW0HistoricalMotionFixtureV1(input: {
  fixtureId: Ds4DbiW0HistoricalFixtureIdV1;
  bindingTier: Ds4DbiW0HistoricalReplayBindingTierV1;
  repositoryRoot?: string;
}): Ds4DbiW0HistoricalReplayLoadResultV1 {
  const fixture = DS4_DBI_W0_HISTORICAL_FIXTURES_V1[input.fixtureId];
  const repoRoot = input.repositoryRoot ?? resolveRepoRootFromBackendModule();
  const provenanceLimitations: string[] = [
    fixture.sourceFamily === 'PRODUCTION_SHADOW_RESULT'
      ? 'PRODUCTION_SHADOW_RESULT_NOT_SEALED_REAL_C4'
      : 'API_SYNTHETIC_NOT_INDEPENDENT_TELEMETRY',
  ];

  if (!fixture.motionCoreShadowPayloadRelPath) {
    return {
      ok: false,
      fixtureId: input.fixtureId,
      codes: ['NO_MOTION_PAYLOAD_BYTES'],
      detail: `${input.fixtureId} has no frozen Motion-Core shadow payload in repository`,
      provenanceLimitations,
    };
  }

  const payloadAbs = join(repoRoot, fixture.motionCoreShadowPayloadRelPath);
  const manifestAbs = join(repoRoot, fixture.provenanceManifestRelPath);
  if (!existsSync(payloadAbs) || !existsSync(manifestAbs)) {
    return {
      ok: false,
      fixtureId: input.fixtureId,
      codes: ['FIXTURE_FILE_MISSING'],
      detail: `Missing fixture bytes under ${repoRoot}`,
      provenanceLimitations,
    };
  }

  let manifest: { file_hashes?: Record<string, string> };
  try {
    manifest = JSON.parse(readFileSync(manifestAbs, 'utf8')) as { file_hashes?: Record<string, string> };
  } catch {
    return {
      ok: false,
      fixtureId: input.fixtureId,
      codes: ['PROVENANCE_MANIFEST_PARSE'],
      detail: `Cannot parse ${fixture.provenanceManifestRelPath}`,
      provenanceLimitations,
    };
  }

  const payloadSha = sha256File(payloadAbs);
  const manifestKey = fixture.motionCoreShadowPayloadRelPath.split('/inputs/tiguan-20261022/')[1]
    ? `snapshots/di_v0_motion_core_shadow_payload.json`
    : null;
  if (manifestKey && manifest.file_hashes?.[manifestKey] && manifest.file_hashes[manifestKey] !== payloadSha) {
    return {
      ok: false,
      fixtureId: input.fixtureId,
      codes: ['PAYLOAD_HASH_MISMATCH'],
      detail: `Manifest hash ${manifest.file_hashes[manifestKey]} != file ${payloadSha}`,
      provenanceLimitations,
    };
  }
  if (fixture.expectedPayloadContentSha256 && fixture.expectedPayloadContentSha256 !== payloadSha) {
    return {
      ok: false,
      fixtureId: input.fixtureId,
      codes: ['PAYLOAD_HASH_MISMATCH'],
      detail: `Registry hash ${fixture.expectedPayloadContentSha256} != file ${payloadSha}`,
      provenanceLimitations,
    };
  }

  let payload: DiV0MotionCoreShadowPayloadV1;
  try {
    payload = JSON.parse(readFileSync(payloadAbs, 'utf8')) as DiV0MotionCoreShadowPayloadV1;
  } catch {
    return {
      ok: false,
      fixtureId: input.fixtureId,
      codes: ['PAYLOAD_JSON_PARSE'],
      detail: 'Motion-Core payload JSON invalid',
      provenanceLimitations,
    };
  }

  if (fixture.expectedShadowBundleVersion && payload.contract?.algorithmVersions?.bundle !== fixture.expectedShadowBundleVersion) {
    return {
      ok: false,
      fixtureId: input.fixtureId,
      codes: ['SHADOW_BUNDLE_VERSION_MISMATCH'],
      detail: `Expected bundle ${fixture.expectedShadowBundleVersion}, got ${payload.contract?.algorithmVersions?.bundle}`,
      provenanceLimitations,
    };
  }

  if (fixture.motionCoreShadowRunMetaRelPath) {
    const metaAbs = join(repoRoot, fixture.motionCoreShadowRunMetaRelPath);
    if (!existsSync(metaAbs)) {
      return {
        ok: false,
        fixtureId: input.fixtureId,
        codes: ['FIXTURE_FILE_MISSING'],
        detail: 'Missing motion core shadow run meta',
        provenanceLimitations,
      };
    }
    const meta = JSON.parse(readFileSync(metaAbs, 'utf8')) as {
      id?: string;
      content_fingerprint?: string;
      shadow_bundle_version?: string;
    };
    if (fixture.expectedSourceMotionRunId && meta.id !== fixture.expectedSourceMotionRunId) {
      return {
        ok: false,
        fixtureId: input.fixtureId,
        codes: ['SOURCE_MOTION_RUN_ID_MISMATCH'],
        detail: `Run meta id ${meta.id} != ${fixture.expectedSourceMotionRunId}`,
        provenanceLimitations,
      };
    }
    if (meta.content_fingerprint && meta.content_fingerprint !== payloadSha) {
      return {
        ok: false,
        fixtureId: input.fixtureId,
        codes: ['RUN_META_MISMATCH'],
        detail: `Run meta fingerprint ${meta.content_fingerprint} != payload file sha ${payloadSha}`,
        provenanceLimitations,
      };
    }
  }

  let tripDistanceKmFromIdentity: number | null = null;
  if (fixture.tripIdentityRelPath) {
    const identityAbs = join(repoRoot, fixture.tripIdentityRelPath);
    if (!existsSync(identityAbs)) {
      return {
        ok: false,
        fixtureId: input.fixtureId,
        codes: ['FIXTURE_FILE_MISSING'],
        detail: 'Missing TRIP_IDENTITY.json',
        provenanceLimitations,
      };
    }
    const identity = JSON.parse(readFileSync(identityAbs, 'utf8')) as TripIdentityV1;
    if (identity.trip?.id && identity.trip.id !== fixture.tripId) {
      return {
        ok: false,
        fixtureId: input.fixtureId,
        codes: ['TRIP_IDENTITY_MISMATCH'],
        detail: `TRIP_IDENTITY trip ${identity.trip.id} != fixture ${fixture.tripId}`,
        provenanceLimitations,
      };
    }
    if (typeof identity.trip?.distance_km === 'number' && Number.isFinite(identity.trip.distance_km)) {
      tripDistanceKmFromIdentity = identity.trip.distance_km;
    } else {
      return {
        ok: false,
        fixtureId: input.fixtureId,
        codes: ['DISTANCE_KM_NOT_ATTESTED'],
        detail: 'TRIP_IDENTITY lacks finite trip.distance_km',
        provenanceLimitations,
      };
    }
    if (
      fixture.expectedSourceMotionRunId &&
      identity.di_artifacts?.motion_core_shadow_run_id &&
      identity.di_artifacts.motion_core_shadow_run_id !== fixture.expectedSourceMotionRunId
    ) {
      return {
        ok: false,
        fixtureId: input.fixtureId,
        codes: ['TRIP_IDENTITY_MISMATCH'],
        detail: 'TRIP_IDENTITY motion_core_shadow_run_id mismatch',
        provenanceLimitations,
      };
    }
  }

  const speedBinding = resolveHistoricalSpeedAuthorityBindingV1({
    payload,
    bindingTier: input.bindingTier,
  });
  if (!speedBinding.ok) {
    return {
      ok: false,
      fixtureId: input.fixtureId,
      codes: ['SPEED_AUTHORITY_NOT_ATTESTED'],
      detail: speedBinding.detail,
      provenanceLimitations: [...provenanceLimitations, ...speedBinding.limitations],
    };
  }
  provenanceLimitations.push(...speedBinding.limitations);

  const drivingExposure = deriveDs4DrivingExposureV1({
    payload,
    speedAuthority: speedBinding.partition,
  });
  if (!drivingExposure.derivable) {
    return {
      ok: false,
      fixtureId: input.fixtureId,
      codes: ['EXPOSURE_NOT_DERIVABLE'],
      detail: 'deriveDs4DrivingExposureV1 returned derivable=false',
      provenanceLimitations,
    };
  }

  const sourceMotionRunId = fixture.expectedSourceMotionRunId;
  if (!sourceMotionRunId) {
    return {
      ok: false,
      fixtureId: input.fixtureId,
      codes: ['SOURCE_MOTION_RUN_ID_MISMATCH'],
      detail: 'Fixture registry missing expectedSourceMotionRunId',
      provenanceLimitations,
    };
  }

  const shadowBundle =
    fixture.expectedShadowBundleVersion ?? payload.contract?.algorithmVersions?.bundle ?? 'UNKNOWN_BUNDLE';

  const tripMeta: Ds4DbiW0TripMetaV1 = {
    tripId: fixture.tripId,
    sourceMotionRunId,
    speedAuthority: speedBinding.partition,
    shadowBundleVersion: shadowBundle,
    contentFingerprint: payloadSha,
    exposureSecondsEs: drivingExposure.exposureSeconds,
    distanceKm: tripDistanceKmFromIdentity ?? drivingExposure.distanceKm,
  };

  return {
    ok: true,
    fixture,
    payload,
    payloadFileSha256: payloadSha,
    tripMeta,
    drivingExposure,
    speedAuthorityBinding: speedBinding,
    provenanceLimitations,
    tripDistanceKmFromIdentity,
  };
}
