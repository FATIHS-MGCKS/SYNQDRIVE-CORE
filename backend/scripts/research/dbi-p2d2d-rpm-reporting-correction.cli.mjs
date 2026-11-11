#!/usr/bin/env node
/**
 * Offline DBI P2-D2D corrected RPM research reports (no production I/O).
 * Logic mirror: ds4-rpm-v1b-research-reporting.v1.ts
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(__dirname, '../../package.json'));
const tsNode = require('ts-node');
tsNode.register({ transpileOnly: true, compilerOptions: { module: 'commonjs' } });

const {
  buildDs4RpmV1bResearchRpmReportV1,
} = require(join(
  __dirname,
  '../../src/modules/vehicle-intelligence/driving-intelligence/ds4-rpm-research-reporting/ds4-rpm-v1b-research-reporting.v1.ts',
));

const ORG = 'faa710c9-6d91-4079-a7d5-91fdccdec14a';
const RECON_PATH =
  process.env.P2D2D_RECON_PATH || '/opt/cursor/artifacts/p2d2d-v1b-vsi-reconciliation.json';
const OUT_PATH =
  process.env.P2D2D_CORRECTED_OUT || '/opt/cursor/artifacts/p2d2d-rpm-reporting-corrected.json';

function tierEvidenceFromReconciliation(label) {
  if (label === 'AUDI') {
    return {
      availability: 'AVAILABLE',
      tripId: 'f6c036d1-5f52-430a-aca0-621b905e1089',
      tier: 'RPM_1S',
      analysisMode: 'HIGH_RESOLUTION',
      decisionCode: 'TIER_ASSIGNED',
      tripCoverageBand: 'PARTIAL_SPAN',
      analysisReadiness: 'LIMITED_TRIP',
      cadenceConfidence: 'HIGH',
      temporalCadenceProfile: {
        bucketWidthSeconds: 1,
        nominalCadenceSeconds: 1,
        sequenceMaxGapSeconds: 2,
        interPointGapReportThresholdSeconds: 2,
      },
    };
  }
  return {
    availability: 'AVAILABLE',
    tripId: 'ca7d03a0-0702-40b9-acf2-0235c7dd07a1',
    tier: 'RPM_1S',
    analysisMode: 'HIGH_RESOLUTION',
    decisionCode: 'TIER_ASSIGNED',
    tripCoverageBand: 'FULL_SPAN',
    analysisReadiness: 'TIER_ANALYTICS_OK',
    cadenceConfidence: 'HIGH',
    temporalCadenceProfile: {
      bucketWidthSeconds: 1,
      nominalCadenceSeconds: 1,
      sequenceMaxGapSeconds: 2,
      interPointGapReportThresholdSeconds: 2,
    },
  };
}

function shadowStub(row, variant) {
  const s = row.slice;
  return {
    contractVersion: 'ds4-rpm-hf-v1b-v1',
    organizationId: ORG,
    vehicleId: row.vehicleId,
    tripId: row.tripId,
    providerSourceLinkId: null,
    shadowVariant: variant,
    processingOutcome: s.processingOutcome,
    vsiTripClassification: s.vsiTripClassification,
    admission: s.admission,
    temporalCoverage: {
      eligibleOneSecondBuckets: s.temporalCoverageEligibleBuckets,
      observedUniqueOneSecondBuckets: null,
      observedBucketCoverageRatio: s.observedBucketCoverageRatio,
      missingBucketCount: null,
      leadingMissingSeconds: 0,
      trailingMissingSeconds: 0,
      internalMissingBucketCount: 0,
      bucketSemanticsNote: 'DIMO_1S_AVG_BUCKETS_NOT_OEM_CAN_HZ',
      gapInterpretationPolicy: 'MISSING_DATA_NOT_ENGINE_OFF',
    },
    intervalStats: s.intervalStats,
    sequenceStats: s.sequenceStats,
    tierEvidence: variant === 'tier-aware' ? tierEvidenceFromReconciliation(row.label) : undefined,
  };
}

function main() {
  const recon = JSON.parse(readFileSync(RECON_PATH, 'utf8'));
  const out = {
    operation: 'DBI_P2D2D_RPM_REPORTING_CORRECTION',
    noProductionReads: true,
    reports: {},
  };
  for (const label of ['AUDI', 'TIGUAN']) {
    const row = { label, ...recon.trips[label] };
    const legacy = shadowStub(row, 'legacy');
    const tierAware = shadowStub(row, 'tier-aware');
    const preservedLegacy = {
      observedBucketCoverageRatio: legacy.temporalCoverage.observedBucketCoverageRatio,
      admissionQualityExposure: legacy.admission.qualityExposure,
    };
    out.reports[label] = {
      corrected: buildDs4RpmV1bResearchRpmReportV1({
        legacy,
        tierAware,
        telemetrySourceFamily: 'RUPTELA_R1',
      }),
      preservedLegacyEvidence: preservedLegacy,
    };
  }
  mkdirSync(OUT_PATH.replace(/\/[^/]+$/, ''), { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify(out, null, 2));
  console.log('WROTE', OUT_PATH);
}

main();
