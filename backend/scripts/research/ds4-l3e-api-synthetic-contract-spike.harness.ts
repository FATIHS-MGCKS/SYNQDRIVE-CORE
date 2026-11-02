/**
 * L3-E research spike entrypoint.
 * Research artifacts: research/driving-intelligence/evaluations/ds4-l3e-api-synthetic-contract-20261029/
 *
 * cd backend && npx ts-node --transpile-only scripts/research/ds4-l3e-api-synthetic-contract-spike.harness.ts
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { gunzipSync } from 'node:zlib';
import type { DiV0S4SourceFamily } from '../../src/modules/vehicle-intelligence/driving-intelligence/s4a-foundation/di-v0-s4a-contract';
import { DI_V0_S4_LIMITS } from '../../src/modules/vehicle-intelligence/driving-intelligence/s4a-foundation/di-v0-s4a-contract';
import { buildDiV0S4EvidenceSnapshotHash } from '../../src/modules/vehicle-intelligence/driving-intelligence/s4a-foundation/di-v0-s4a-identity';
import { parseDiV0S4EvidenceContainer } from '../../src/modules/vehicle-intelligence/driving-intelligence/s4a-foundation/di-v0-s4a-evidence-container-parse';
import { processDiV0MotionCoreShadowTrip } from '../../src/modules/vehicle-intelligence/driving-intelligence/motion-core-shadow-worker/di-v0-motion-core-shadow-processor';
import {
  isC5_1PreferredSpeedEffective,
  resolveC5_1PlausibilityClassForEligibleVehicle,
  resolveC5_1VehicleAdmissionFromLabels,
} from '../../src/modules/vehicle-intelligence/driving-intelligence/motion-core-shadow-worker/di-v0-motion-core-c5-1-admission';
import { parseDiV0MotionCoreShadowRuntimeConfig } from '../../src/modules/vehicle-intelligence/driving-intelligence/motion-core-shadow-worker/di-v0-motion-core-shadow.config';
import { computeDs4TripAssessmentV1 } from '../../src/modules/vehicle-intelligence/driving-intelligence/ds4-assessment/ds4-trip-assessment-v1.engine';
import {
  buildDs4LongitudinalLoadObservablesInputV1,
  computeDs4LongitudinalLoadObservablesV1,
} from '../../src/modules/vehicle-intelligence/driving-intelligence/ds4-assessment/ds4-longitudinal-load-observables.v1';
import {
  DS4_LONGITUDINAL_EVIDENCE_QUALITY_CONTRACT_VERSION,
  resolveDs4LongitudinalEvidenceQualityForLayer2V1,
} from '../../src/modules/vehicle-intelligence/driving-intelligence/ds4-assessment/ds4-longitudinal-evidence-quality.v1';
import { evaluateDs4AssessmentQualityFromMotionPayload } from '../../src/modules/vehicle-intelligence/driving-intelligence/ds4-assessment/ds4-assessment-quality-policy.v1';

const RESEARCH_ROOT = path.join(
  __dirname,
  '../../../research/driving-intelligence/evaluations/ds4-l3e-api-synthetic-contract-20261029',
);
const OUT = path.join(RESEARCH_ROOT, 'outputs');
const PILOT_EVIDENCE =
  process.env.DS4_L3E_PILOT_EVIDENCE ??
  '/opt/cursor/artifacts/ds4-historical-offline-replay-pilot-20261029/evidence';

type TripPin = {
  tripId: string;
  vehicleId: string;
  organizationId: string;
  label: string;
  sourceFamily: DiV0S4SourceFamily;
  workItemCompletedAtUtc: string;
  vehicleMake: string;
  vehicleModel: string;
};

const TRIPS: TripPin[] = [
  {
    tripId: '5b43a2a3-ea98-4cab-8150-c23095591b04',
    vehicleId: '68868291-5478-42cd-b0c4-cc77b2a78e21',
    organizationId: 'faa710c9-6d91-4079-a7d5-91fdccdec14a',
    label: 'TESLA_M3',
    sourceFamily: 'API_SYNTHETIC',
    workItemCompletedAtUtc: '2026-10-27T13:04:07.664Z',
    vehicleMake: 'Tesla',
    vehicleModel: 'Model 3',
  },
  {
    tripId: '212cbcd4-6ac3-45cf-aa29-71280a20806f',
    vehicleId: '8c850ff1-4201-432b-af2e-2711dbc7ca48',
    organizationId: 'faa710c9-6d91-4079-a7d5-91fdccdec14a',
    label: 'ARTEON',
    sourceFamily: 'RUPTELA_R1',
    workItemCompletedAtUtc: '2026-10-20T12:59:13.000Z',
    vehicleMake: 'Volkswagen',
    vehicleModel: 'Arteon',
  },
];

function loadParsedSnapshot(trip: TripPin) {
  const dir = path.join(PILOT_EVIDENCE, trip.tripId);
  const meta = JSON.parse(fs.readFileSync(path.join(dir, 'freeze-metadata.json'), 'utf8')) as {
    snapshotHash: string;
    uncompressedBytes: number;
  };
  const payloadGzip = Buffer.from(fs.readFileSync(path.join(dir, 'payload.gz.b64'), 'utf8'), 'base64');
  const raw = gunzipSync(payloadGzip, { maxOutputLength: DI_V0_S4_LIMITS.maxUncompressedSnapshotBytes });
  if (raw.length !== meta.uncompressedBytes) {
    throw new Error(`UNCOMPRESSED_SIZE_MISMATCH:${trip.tripId}`);
  }
  const container = raw.toString('utf8');
  if (buildDiV0S4EvidenceSnapshotHash(container) !== meta.snapshotHash) {
    throw new Error(`SNAPSHOT_HASH_MISMATCH:${trip.tripId}`);
  }
  const parsed = parseDiV0S4EvidenceContainer(container);
  return { parsed, pinnedSnapshotHash: meta.snapshotHash };
}

function countEventTiers(records: { classification?: string }[]) {
  let full = 0;
  let bin = 0;
  for (const r of records) {
    if (r.classification === 'ADMISSIBLE_FULL') full += 1;
    if (r.classification === 'ADMISSIBLE_BIN_ONLY') bin += 1;
  }
  return { full, bin };
}

function assessmentDegradedFixture() {
  return {
    ratedEventCount: 0,
    unratedEventCount: 0,
    artefactSuspectCount: 0,
    drivingExposure: {
      derivable: false,
      exposureSeconds: null,
      distanceKm: null,
      provenance: {
        canonicalSpeedSeriesMissing: true,
        qualifyingIntervalCount: 0,
        fsmMovingDirectLabelCount: 0,
      },
    },
    eventIntensityRecords: [],
  };
}

async function main(): Promise<void> {
  fs.mkdirSync(OUT, { recursive: true });

  const motionEnv = {
    ...process.env,
    DI_V0_MOTION_CORE_C5_1_PREFERRED_SPEED_ENABLED: 'true',
    DI_V0_MOTION_CORE_C5_1_ACTIVATION_SINCE: '2026-10-23T21:47:00Z',
  };
  const runtimeConfig = parseDiV0MotionCoreShadowRuntimeConfig(motionEnv);

  const tripResults: Record<string, unknown>[] = [];

  for (const trip of TRIPS) {
    const freezeMeta = JSON.parse(
      fs.readFileSync(path.join(PILOT_EVIDENCE, trip.tripId, 'freeze-metadata.json'), 'utf8'),
    ) as { combinedInputIdentity: string };
    const { parsed, pinnedSnapshotHash } = loadParsedSnapshot(trip);
    const combinedInputIdentity = freezeMeta.combinedInputIdentity;

    const vehicleAdmission = resolveC5_1VehicleAdmissionFromLabels(trip.vehicleMake, trip.vehicleModel);
    const c5_1Effective = isC5_1PreferredSpeedEffective(runtimeConfig.controlPlane, {
      vehicleAdmission,
      workItemCompletedAt: new Date(trip.workItemCompletedAtUtc),
    });
    const vehiclePlausibilityClass = c5_1Effective
      ? resolveC5_1PlausibilityClassForEligibleVehicle(trip.vehicleMake, trip.vehicleModel)
      : 'TESLA';

    const processed = processDiV0MotionCoreShadowTrip({
      parsed,
      sourceFamily: trip.sourceFamily,
      pinnedSnapshotHash,
      combinedInputIdentity,
      computedAt: new Date('2026-10-29T12:00:00.000Z'),
      c5_1PreferredSpeedEnabled: c5_1Effective,
      fsmGapBridgeV1Enabled: false,
      vehiclePlausibilityClass,
    });

    const assessment = computeDs4TripAssessmentV1({
      scope: {
        organizationId: trip.organizationId,
        vehicleId: trip.vehicleId,
        tripId: trip.tripId,
      },
      motionRun: {
        id: `l3e-offline-${trip.tripId}`,
        organizationId: trip.organizationId,
        vehicleId: trip.vehicleId,
        tripId: trip.tripId,
        shadowStatus: 'SUCCEEDED',
        pinnedSnapshotHash,
        combinedInputIdentity,
        contentFingerprint: processed.payloadFingerprint,
        createdAt: new Date('2026-10-29T12:00:00.000Z'),
      },
      payload: processed.payload,
      now: new Date('2026-10-29T12:00:00.000Z'),
    });

    const originalL2 = computeDs4LongitudinalLoadObservablesV1(
      buildDs4LongitudinalLoadObservablesInputV1(assessment, null),
    );

    const sparseOutcome = processed.payload.contract?.sparse?.channelOutcome ?? null;
    const evidenceContext = {
      sourceFamily: trip.sourceFamily,
      channelManifest: parsed.channelManifest.map((c) => ({ channel: c.channel, outcome: c.outcome })),
      sparseChannelOutcome: sparseOutcome,
    };
    const contractEval = resolveDs4LongitudinalEvidenceQualityForLayer2V1({
      assessmentEvidenceQuality: assessment.evidenceQuality,
      speedAuthority: assessment.speedAuthority,
      eventSummaries: assessment.eventSummaries,
      context: evidenceContext,
    });

    const proposedL2 = computeDs4LongitudinalLoadObservablesV1(
      buildDs4LongitudinalLoadObservablesInputV1(assessment, evidenceContext),
    );

    const records = assessment.eventSummaries.eventIntensityRecords ?? [];
    const tiers = countEventTiers(records);

    tripResults.push({
      tripId: trip.tripId,
      label: trip.label,
      sourceFamily: trip.sourceFamily,
      speedAuthority: assessment.speedAuthority,
      c5_1Effective,
      sparseChannelOutcome: sparseOutcome,
      sparseChannelOutcomeMutated: sparseOutcome === 'PRESENT' && trip.sourceFamily === 'API_SYNTHETIC',
      original: {
        assessmentEvidenceQuality: assessment.evidenceQuality,
        l2Eligible: !originalL2.reasonCodes.includes('EVIDENCE_QUALITY_NOT_PRESENT'),
        l2ReasonCodes: originalL2.reasonCodes,
        exposureSeconds: originalL2.exposureSeconds,
        B_k_accel: originalL2.acceleration.specificLongitudinalImpulseMps,
        B_k_brake: originalL2.deceleration.specificLongitudinalImpulseMps,
      },
      researchContract: contractEval,
      proposed: {
        l2Eligible: !proposedL2.reasonCodes.includes('EVIDENCE_QUALITY_NOT_PRESENT'),
        l2ReasonCodes: proposedL2.reasonCodes,
        exposureSeconds: proposedL2.exposureSeconds,
        B_k_accel: proposedL2.acceleration.specificLongitudinalImpulseMps,
        B_k_brake: proposedL2.deceleration.specificLongitudinalImpulseMps,
        fullEventCount: {
          accel: proposedL2.acceleration.fullEventCount,
          brake: proposedL2.deceleration.fullEventCount,
        },
        binOnlyEventCount: {
          accel: proposedL2.acceleration.binOnlyEventCount,
          brake: proposedL2.deceleration.binOnlyEventCount,
        },
      },
      motion: {
        eventAcceptedCount: processed.payload.summary?.eventAcceptedCount,
        ratedEventCount: assessment.eventSummaries.ratedEventCount,
        admissibleTierCounts: tiers,
        drivingExposureDerivable: assessment.eventSummaries.drivingExposure?.derivable,
      },
    });
  }

  const r1 = tripResults.find((t) => t.tripId === '212cbcd4-6ac3-45cf-aa29-71280a20806f') as {
    original: { l2ReasonCodes: string[]; B_k_brake: number; exposureSeconds: number };
    proposed: { l2ReasonCodes: string[]; B_k_brake: number; exposureSeconds: number };
    speedAuthority: string;
  };
  const tesla = tripResults.find((t) => t.tripId === '5b43a2a3-ea98-4cab-8150-c23095591b04') as {
    original: { l2Eligible: boolean };
    proposed: { l2Eligible: boolean };
    sparseChannelOutcomeMutated: boolean;
    c5_1Effective: boolean;
    speedAuthority: string;
  };

  const degradedEval = resolveDs4LongitudinalEvidenceQualityForLayer2V1({
    assessmentEvidenceQuality: 'NOT_APPLICABLE',
    speedAuthority: 'C4_ONLY',
    eventSummaries: assessmentDegradedFixture() as any,
    context: {
      sourceFamily: 'API_SYNTHETIC',
      sparseChannelOutcome: 'NOT_APPLICABLE',
      channelManifest: [{ channel: 'POSITION', outcome: 'PRESENT' }],
    },
  });

  const positionOnlyEval = resolveDs4LongitudinalEvidenceQualityForLayer2V1({
    assessmentEvidenceQuality: 'NOT_APPLICABLE',
    speedAuthority: 'C4_ONLY',
    eventSummaries: {
      ratedEventCount: 0,
      drivingExposure: {
        derivable: true,
        exposureSeconds: 100,
        provenance: {
          canonicalSpeedSeriesMissing: false,
          qualifyingIntervalCount: 100,
          fsmMovingDirectLabelCount: 10,
        },
      },
    } as any,
    context: {
      sourceFamily: 'API_SYNTHETIC',
      sparseChannelOutcome: 'NOT_APPLICABLE',
      channelManifest: [{ channel: 'POSITION', outcome: 'PRESENT' }],
    },
  });

  const safety = {
    r1Parity:
      r1.original.l2ReasonCodes.join(',') === r1.proposed.l2ReasonCodes.join(',') &&
      r1.original.B_k_brake === r1.proposed.B_k_brake &&
      r1.original.exposureSeconds === r1.proposed.exposureSeconds,
    teslaProposedPass: tesla.proposed.l2Eligible === true,
    teslaOriginalFail: tesla.original.l2Eligible === false,
    noSyntheticChannelOutcomePresent: tesla.sparseChannelOutcomeMutated === false,
    degradedApiSyntheticFailClosed: degradedEval.layer2EvidenceQualityInput !== 'PRESENT',
    positionOnlyInsufficient: positionOnlyEval.layer2EvidenceQualityInput !== 'PRESENT',
    c4C51Separation:
      tesla.c5_1Effective === true &&
      tesla.speedAuthority === 'C5_1_PREFERRED' &&
      r1.speedAuthority === 'C4_ONLY',
    allVerified: false as boolean,
  };
  safety.allVerified =
    safety.r1Parity &&
    safety.teslaProposedPass &&
    safety.teslaOriginalFail &&
    safety.noSyntheticChannelOutcomePresent &&
    safety.degradedApiSyntheticFailClosed &&
    safety.positionOnlyInsufficient &&
    safety.c4C51Separation;

  const report = {
    packageId: 'ds4-l3e-api-synthetic-contract-20261029',
    contractVersion: DS4_LONGITUDINAL_EVIDENCE_QUALITY_CONTRACT_VERSION,
    generatedAtUtc: new Date().toISOString(),
    pilotEvidenceRoot: PILOT_EVIDENCE,
    productionGateUnchanged: true,
    trips: tripResults,
    safetyRegression: safety,
    degradedFixtureEval: degradedEval,
    positionOnlyFixtureEval: positionOnlyEval,
  };

  fs.writeFileSync(path.join(OUT, 'l3e-spike-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
