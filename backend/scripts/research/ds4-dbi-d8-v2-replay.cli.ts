#!/usr/bin/env npx ts-node
/**
 * DBI D8 V2 — offline V1 vs V2 side-by-side (research only).
 *
 *   npm run research:ds4-dbi-d8-v2-replay -- --json
 *   npm run research:ds4-dbi-d8-v2-replay -- --fixture TIG22 --json
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { computeDs4DbiW0MbfFromPayloadV1 } from '../../src/modules/vehicle-intelligence/driving-intelligence/ds4-assessment/research/ds4-dbi-w0-mbf-kernel.v1';
import { loadDs4DbiW0HistoricalMotionFixtureV1 } from '../../src/modules/vehicle-intelligence/driving-intelligence/ds4-assessment/research/ds4-dbi-w0-historical-replay.loader.v1';
import type { Ds4DbiW0HistoricalFixtureIdV1 } from '../../src/modules/vehicle-intelligence/driving-intelligence/ds4-assessment/research/ds4-dbi-w0-historical-replay.fixture-registry.v1';
import {
  computeDs4DbiD8V2FromW0ContextV1,
  deriveDs4DbiD8V2W0TripFailClosedV1,
} from '../../src/modules/vehicle-intelligence/driving-intelligence/ds4-assessment/research/ds4-dbi-d8-v2-event-intelligence.research.v1';
import { computeCanonicalPayloadDigestV1 } from '../../src/modules/vehicle-intelligence/driving-intelligence/ds4-assessment/research/ds4-dbi-w1b1-digest-semantics.v1';
import { decodeMotionCoreShadowPayloadGzipV1 } from '../../src/modules/vehicle-intelligence/driving-intelligence/ds4-assessment/export/ds4-layer2-p2-offline-reconstruction.v1';
import { projectDs4DbiW1cTripAssessmentFromW0KernelV1 } from '../../src/modules/vehicle-intelligence/driving-intelligence/ds4-assessment/research/ds4-dbi-w1c-trip-assessment-projector.v1';
import { loadDs4DbiW1b1LocalEvidenceV1 } from '../../src/modules/vehicle-intelligence/driving-intelligence/ds4-assessment/research/ds4-dbi-w1b1-local-evidence.loader.v1';
import type { Ds4DbiW0HistoricalReplayLoadSuccessV1 } from '../../src/modules/vehicle-intelligence/driving-intelligence/ds4-assessment/research/ds4-dbi-w0-historical-replay.loader.v1';

const repoRoot = join(__dirname, '../../..');
const TESLA_ARTIFACT = '/opt/cursor/artifacts/dbi-tesla-20261107-payload.json.gz';
const TESLA_EXPORT_META = '/opt/cursor/artifacts/dbi-tesla-20261107-export-meta.json';

function parseArgs(): { json: boolean; fixtures: string[] } {
  const argv = process.argv.slice(2);
  const json = argv.includes('--json');
  const fixtureIdx = argv.indexOf('--fixture');
  const fixtures =
    fixtureIdx >= 0 && argv[fixtureIdx + 1]
      ? [argv[fixtureIdx + 1]!]
      : ['TIG22', 'TIG22_V4', 'W1B1_SYNTHETIC_POSITIVE', 'TESLA_20261107'];
  return { json, fixtures };
}

function summarizeV2(v2: ReturnType<typeof computeDs4DbiD8V2FromW0ContextV1>) {
  return {
    descriptiveStatus: v2.descriptive.status,
    admittedEvents: v2.descriptive.admittedEventCount,
    ratePerMin: v2.descriptive.ratePerMovingMinute,
    inferenceStatus: v2.inference.status,
    greenwoodG: v2.inference.observedGreenwoodG,
    pUpper: v2.inference.pValueUpper,
    v1Status: v2.v1Reference.status,
    w0TripFailClosed: v2.w0TripFailClosed,
    w0FailClosedReasons: v2.w0TripFailClosedReasonCodes,
  };
}

function runHistoricalKernelStrict(load: Ds4DbiW0HistoricalReplayLoadSuccessV1) {
  const canonicalDigest = computeCanonicalPayloadDigestV1(load.payload);
  const rawSha256 = load.payloadFileSha256;
  const expectedFileSha = load.fixture.expectedPayloadContentSha256;
  const rawMatchesPinnedSource = rawSha256 === expectedFileSha;
  const kernel = computeDs4DbiW0MbfFromPayloadV1({
    payload: load.payload,
    tripMeta: load.tripMeta,
    qualityTier: 'STRICT',
    expectedContentFingerprint: canonicalDigest,
    expectedShadowBundleVersion: load.tripMeta.shadowBundleVersion,
    evidenceOrigin: 'HISTORICAL_RESEARCH_RECORDING',
  });
  const failBinding = deriveDs4DbiD8V2W0TripFailClosedV1(kernel);
  return {
    digestBinding: {
      rawFileSha256: rawSha256,
      canonicalPayloadDigestSha256: canonicalDigest,
      rawMatchesPinnedSourceEvidence: rawMatchesPinnedSource,
      canonicalDigestDiffersFromRawFile: canonicalDigest !== rawSha256,
      runMetaContentFingerprintSha256: load.fixture.expectedRunMetaContentFingerprintSha256,
      provenanceLimitations: load.provenanceLimitations,
    },
    kernel,
    failBinding,
  };
}

async function main(): Promise<void> {
  const { json, fixtures } = parseArgs();
  const report: Record<string, unknown> = {
    contractVersion: 'ds4-dbi-d8-v2-replay-cli-v1',
    scientificValidation: 'NOT_EVALUATED',
    fixtures: {} as Record<string, unknown>,
  };

  for (const id of fixtures) {
    if (id === 'TESLA_20261107') {
      if (!existsSync(TESLA_ARTIFACT)) {
        (report.fixtures as Record<string, unknown>)[id] = { skipped: true, reason: 'ARTIFACT_NOT_ON_DISK' };
        continue;
      }
      const { payload } = decodeMotionCoreShadowPayloadGzipV1(readFileSync(TESLA_ARTIFACT));
      if (!payload) {
        (report.fixtures as Record<string, unknown>)[id] = { error: 'PAYLOAD_DECODE_FAILED' };
        continue;
      }
      const exportMeta = existsSync(TESLA_EXPORT_META)
        ? (JSON.parse(readFileSync(TESLA_EXPORT_META, 'utf8')) as Record<string, unknown>)
        : null;
      const observedCanonical = computeCanonicalPayloadDigestV1(payload);
      const bundleObs = payload.contract.algorithmVersions.bundle;
      const pinnedFingerprint =
        typeof exportMeta?.contentFingerprint === 'string'
          ? exportMeta.contentFingerprint
          : typeof (exportMeta?.summaryJson as Record<string, unknown> | undefined)?.contentFingerprint ===
              'string'
            ? ((exportMeta!.summaryJson as Record<string, unknown>).contentFingerprint as string)
            : null;
      const tripMeta = {
        tripId:
          typeof exportMeta?.tripId === 'string' ? exportMeta.tripId : '0bf6fa50-5f0e-4bc4-9a75-777711d66063',
        sourceMotionRunId:
          typeof exportMeta?.sourceMotionRunId === 'string'
            ? exportMeta.sourceMotionRunId
            : '316cddb2-372d-4084-ab2d-25d456470eab',
        speedAuthority:
          (payload.contract.speedAuthority as 'C5_1_PREFERRED' | undefined) ??
          (typeof exportMeta?.speedAuthority === 'string' ? exportMeta.speedAuthority : 'C5_1_PREFERRED'),
        shadowBundleVersion: bundleObs,
        contentFingerprint: observedCanonical,
        exposureSecondsEs: 832,
        distanceKm: typeof exportMeta?.distanceKm === 'number' ? exportMeta.distanceKm : 15.4,
      };
      const kernel = computeDs4DbiW0MbfFromPayloadV1({
        payload,
        tripMeta,
        qualityTier: 'STRICT',
        expectedContentFingerprint: observedCanonical,
        expectedShadowBundleVersion: bundleObs,
        evidenceOrigin: 'HISTORICAL_RESEARCH_RECORDING',
      });
      const v2 = computeDs4DbiD8V2FromW0ContextV1({ kernel, payload, tripMeta });
      const w1c = projectDs4DbiW1cTripAssessmentFromW0KernelV1(kernel);
      (report.fixtures as Record<string, unknown>)[id] = {
        evidencePresent: exportMeta != null,
        provenance: {
          observedCanonicalDigest: observedCanonical,
          pinnedExportFingerprint: pinnedFingerprint,
          canonicalMatchesPinnedExport: pinnedFingerprint != null && pinnedFingerprint === observedCanonical,
          shadowBundleVersion: bundleObs,
          sourceMotionRunId: tripMeta.sourceMotionRunId,
        },
        w1cOutcome: w1c.ok ? w1c.summary.tripOutcome : w1c,
        d8V1: kernel.d8Burstiness,
        d8V2Summary: summarizeV2(v2),
      };
      continue;
    }

    if (id === 'W1B1_SYNTHETIC_POSITIVE') {
      const load = loadDs4DbiW1b1LocalEvidenceV1({ fixtureId: 'W1B1_SYNTHETIC_POSITIVE', repositoryRoot: repoRoot });
      if (!load.ok) {
        (report.fixtures as Record<string, unknown>)[id] = { load };
        continue;
      }
      const kernel = computeDs4DbiW0MbfFromPayloadV1({
        payload: load.payload,
        tripMeta: load.tripMeta,
        qualityTier: 'STRICT',
        expectedContentFingerprint: load.tripMeta.contentFingerprint,
        expectedShadowBundleVersion: load.tripMeta.shadowBundleVersion,
        evidenceOrigin: 'SYNTHETIC_CONTROL',
      });
      const v2 = computeDs4DbiD8V2FromW0ContextV1({ kernel, payload: load.payload, tripMeta: load.tripMeta });
      (report.fixtures as Record<string, unknown>)[id] = {
        d8V1: kernel.d8Burstiness,
        d8V2Summary: summarizeV2(v2),
      };
      continue;
    }

    const load = loadDs4DbiW0HistoricalMotionFixtureV1({
      fixtureId: id as Ds4DbiW0HistoricalFixtureIdV1,
      bindingTier: 'RELAXED',
      repositoryRoot: repoRoot,
    });
    if (!load.ok) {
      (report.fixtures as Record<string, unknown>)[id] = { load };
      continue;
    }
    const hist = runHistoricalKernelStrict(load);
    const tripMetaBound = {
      ...load.tripMeta,
      contentFingerprint: hist.digestBinding.canonicalPayloadDigestSha256,
    };
    const v2 = computeDs4DbiD8V2FromW0ContextV1({
      kernel: hist.kernel,
      payload: load.payload,
      tripMeta: tripMetaBound,
      researchSpeedAuthorityPartitionOverride: hist.failBinding.tripFailClosed
        ? undefined
        : load.speedAuthorityBinding.partition,
    });
    const w1c = projectDs4DbiW1cTripAssessmentFromW0KernelV1(hist.kernel);
    (report.fixtures as Record<string, unknown>)[id] = {
      digestBinding: hist.digestBinding,
      w1cOutcome: w1c.ok ? w1c.summary.tripOutcome : w1c,
      d8V1: hist.kernel.d8Burstiness,
      d8V2Summary: summarizeV2(v2),
    };
  }

  if (json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(report);
  }
}

void main();
