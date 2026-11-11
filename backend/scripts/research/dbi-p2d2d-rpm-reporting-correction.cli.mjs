#!/usr/bin/env node
/**
 * Offline DBI P2-D2D corrected RPM research reports (no production I/O).
 * Uses persisted tier-aware V1B summaries when provided; never fabricates tierEvidence.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
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
const TIER_AWARE_DIR = process.env.P2D2D_TIER_AWARE_SUMMARY_DIR || '';
const OUT_PATH =
  process.env.P2D2D_CORRECTED_OUT || '/opt/cursor/artifacts/p2d2d-rpm-reporting-corrected.json';

function loadTierAwarePersistedSummary(tripId) {
  if (!TIER_AWARE_DIR) return null;
  const path = join(TIER_AWARE_DIR, `${tripId}.tier-aware.summary.json`);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf8'));
}

function legacyStubFromReconciliation(row) {
  const s = row.slice;
  return {
    contractVersion: 'ds4-rpm-hf-v1b-v1',
    organizationId: ORG,
    vehicleId: row.vehicleId,
    tripId: row.tripId,
    providerSourceLinkId: row.providerSourceLinkId ?? s.providerSourceLinkId ?? null,
    shadowVariant: 'legacy',
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
    const legacy = legacyStubFromReconciliation(row);
    const tierAwarePersisted = loadTierAwarePersistedSummary(row.tripId);
    const tierAware = tierAwarePersisted ?? null;
    const legacySummaryProvenance = 'RECONSTRUCTED_OFFLINE';
    const tierEvidenceProvenance = 'RECONSTRUCTED_OFFLINE';

    const preservedLegacy = {
      observedBucketCoverageRatio: legacy.temporalCoverage.observedBucketCoverageRatio,
      admissionQualityExposure: legacy.admission.qualityExposure,
    };

    out.reports[label] = {
      tierEvidenceProvenance,
      legacySummaryProvenance,
      tierAwarePersistedSummaryLoaded: Boolean(tierAwarePersisted),
      corrected: buildDs4RpmV1bResearchRpmReportV1({
        legacy,
        tierAware,
        telemetrySourceFamily: 'RUPTELA_R1',
        tierEvidenceProvenance,
        legacySummaryProvenance,
      }),
      preservedLegacyEvidence: preservedLegacy,
      preservedHistoricalAggregate: {
        intervalStats: row.slice.intervalStats,
        sequenceStats: row.slice.sequenceStats,
        vsiTripClassification: row.slice.vsiTripClassification,
        note: 'NON_AUTHORITATIVE_HISTORICAL_SLICE_NOT_TIER_VERIFICATION',
      },
    };
  }
  mkdirSync(OUT_PATH.replace(/\/[^/]+$/, ''), { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify(out, null, 2));
  console.log('WROTE', OUT_PATH);
}

main();
