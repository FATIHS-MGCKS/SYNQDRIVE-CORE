import { readFileSync } from 'fs';
import { join } from 'path';
import type { DiV0MotionCoreShadowPayloadV1 } from '../../../motion-core-shadow-worker/di-v0-motion-core-shadow.types';
import { buildDs4Layer2P4bSyntheticPayloadsFromP2EventsV1 } from '../ds4-layer2-p4b-test-payload-synth.v1';
import { parseDs4Layer2P2PinnedCsvV1 } from '../ds4-layer2-p2-pinned-11-fixture-loader.v1';
import {
  DS4_DBI_W0_P2_PLACEHOLDER_EVENT_START_LABEL_V1,
  filterW0SyntheticResearchAdmittedEventsV1,
  isW0SyntheticPlaceholderEventV1,
} from '../ds4-dbi-w0-synthetic-event-hygiene.v1';
import { enrichSyntheticPayloadForW0V1 } from '../ds4-dbi-w0-synthetic-enrichment.v1';
import { computeDs4DbiW0MbfFromPayloadV1 } from '../ds4-dbi-w0-mbf-kernel.v1';
import { parseBucketLabelMs } from '../../../core/kinematics/motion-core-grid';

const fixtureDir = join(__dirname, '../fixtures/ds4-layer2-p2-pinned-11');

describe('ds4-dbi-w0-synthetic-enrichment.v1', () => {
  it('identifies P2 placeholder events by documented 1970 label', () => {
    expect(
      isW0SyntheticPlaceholderEventV1({
        kind: 'ACCELERATION',
        startLabel: DS4_DBI_W0_P2_PLACEHOLDER_EVENT_START_LABEL_V1,
        endLabel: '1970-01-01T00:00:01Z',
        startSpeedKmh: 40,
        endSpeedKmh: 40,
        deltaKmh: 0,
        quality: 'OK',
        flags: [],
      }),
    ).toBe(true);
  });

  it('preserves admissible OK events with valid timestamps', () => {
    const real = {
      kind: 'ACCELERATION' as const,
      startLabel: '2026-10-28T10:00:00Z',
      endLabel: '2026-10-28T10:00:05Z',
      startSpeedKmh: 40,
      endSpeedKmh: 41,
      deltaKmh: 1,
      quality: 'OK' as const,
      flags: [] as string[],
    };
    const mixed = [real, {
      kind: 'ACCELERATION' as const,
      startLabel: DS4_DBI_W0_P2_PLACEHOLDER_EVENT_START_LABEL_V1,
      endLabel: '1970-01-01T00:00:01Z',
      startSpeedKmh: 40,
      endSpeedKmh: 40,
      deltaKmh: 0,
      quality: 'OK' as const,
      flags: [],
    }];
    const filtered = filterW0SyntheticResearchAdmittedEventsV1(mixed);
    expect(filtered).toHaveLength(1);
    expect(filtered[0]!.startLabel).toBe(real.startLabel);
  });

  it('enrichment sets events to admitted set only and aligns summary counts', () => {
    const placeholder = {
      kind: 'ACCELERATION' as const,
      startLabel: DS4_DBI_W0_P2_PLACEHOLDER_EVENT_START_LABEL_V1,
      endLabel: '1970-01-01T00:00:01Z',
      startSpeedKmh: 40,
      endSpeedKmh: 40,
      deltaKmh: 0,
      quality: 'OK' as const,
      flags: [],
    };
    const real = {
      kind: 'ACCELERATION' as const,
      startLabel: '2026-10-28T10:00:00Z',
      endLabel: '2026-10-28T10:00:02Z',
      startSpeedKmh: 40,
      endSpeedKmh: 41,
      deltaKmh: 1,
      quality: 'OK' as const,
      flags: [],
    };
    const payload: DiV0MotionCoreShadowPayloadV1 = {
      contract: {
        algorithmVersions: {
          c4: 't',
          c5_1: null,
          c5_1ProductionSafety: null,
          c5_1AlgorithmFileSha256: null,
          fsm: 't',
          gapBridgeV1: null,
          fsmAuxBinding: null,
          events: 't',
          bundle: 'TEST_BUNDLE',
        },
        speedAuthority: 'C4_ONLY',
        timeSemantics: {
          processingMode: 'POST_TRIP_RETROSPECTIVE',
          c4ValueSupportForwardS: 1,
          c4FullFinalizationForwardS: 1,
          fsmMode: 'RETROSPECTIVE',
          eventFinalizationNote: 't',
          computedAtUtc: '2026-01-01T00:00:00Z',
        },
        sparse: { channelOutcome: null, comparable: true, sampleCount: 0, samples: [], limitations: [] },
        comparisonHints: {
          artefactSuspectExcludedFromAcceptedManoeuvreCounts: true,
          inferredNeverPromotedToDirect: true,
          unknownNotCountedAsConfirmedStandstill: true,
        },
      },
      speeds: [],
      fsmLabels: [],
      stopEpisodes: [],
      events: [placeholder, real, placeholder],
      summary: {
        labelCount: 0,
        speedNumericCount: 0,
        eventCount: 3,
        eventAcceptedCount: 3,
        eventArtefactSuspectCount: 0,
        stopEpisodeCount: 0,
      },
    };
    const enriched = enrichSyntheticPayloadForW0V1('t', payload, { exposureSecondsEs: 600 });
    expect(enriched.events).toHaveLength(1);
    expect(enriched.events[0]!.startLabel).toBe('2026-10-28T10:00:00Z');
    expect(enriched.summary.eventCount).toBe(1);
    expect(enriched.summary.eventAcceptedCount).toBe(1);
    expect(enriched.events.every((e) => parseBucketLabelMs(e.startLabel) > Date.UTC(2000, 0, 1))).toBe(true);
  });

  it('pinned P2 harness: no duplicate-placeholder fail-closed after enrichment', () => {
    const tripRows = parseDs4Layer2P2PinnedCsvV1(readFileSync(join(fixtureDir, 'p2_reconstructed_assessments.csv'), 'utf8'));
    const evText = readFileSync(join(fixtureDir, 'p2_longitudinal_events.csv'), 'utf8');
    const evRows = parseDs4Layer2P2PinnedCsvV1(evText);
    const vehicleByTrip = new Map<string, string>();
    for (const row of tripRows) {
      vehicleByTrip.set(row.trip_id!, row.vehicle_id!);
    }
    const admissible = evRows
      .filter((r) => (r.eligibility_classification ?? '').startsWith('ADMISSIBLE'))
      .map((r) => ({
        offlineReconstructionKey: r.offline_reconstruction_key!,
        tripId: r.trip_id!,
        vehicleId: vehicleByTrip.get(r.trip_id!) ?? 'UNKNOWN',
        sourceMotionRunId: r.source_motion_run_id!,
        eventIndex: Number(r.event_index),
        eventKind: r.event_kind!,
        startLabelUtc: r.start_label_utc!,
        endLabelUtc: r.end_label_utc!,
        durationS: Number(r.duration_s),
        steps: Number(r.steps),
        coverageRatio: r.coverage_ratio === '' ? null : Number(r.coverage_ratio),
        durationTier: r.duration_tier!,
        eligibilityClassification: r.eligibility_classification!,
        speedAuthority: r.speed_authority!,
      }));
    const payloads = buildDs4Layer2P4bSyntheticPayloadsFromP2EventsV1(admissible, {
      includeWindowSpeedSamples: true,
      linearInWindowSpeedSamples: true,
      boundarySpeedKmh: 40,
    });
    const failClosedTrips: string[] = [];
    for (const row of tripRows) {
      const runId = row.source_motion_run_id!;
      const loaded = payloads.get(runId);
      if (!loaded) {
        continue;
      }
      const enriched = enrichSyntheticPayloadForW0V1(row.trip_id!, loaded.payload, {
        exposureSecondsEs: Number(row.exposure_seconds_Es),
      });
      const r = computeDs4DbiW0MbfFromPayloadV1({
        payload: enriched,
        tripMeta: {
          tripId: row.trip_id!,
          sourceMotionRunId: runId,
          speedAuthority: row.speed_authority!,
          shadowBundleVersion: row.shadow_bundle_version!,
          contentFingerprint: row.content_fingerprint!,
          exposureSecondsEs: Number(row.exposure_seconds_Es),
          distanceKm: Number(row.distance_km_D),
        },
        qualityTier: 'STRICT',
        evidenceOrigin: 'SYNTHETIC_P2_ENRICHMENT',
      });
      if (r.diagnostics.failClosedReasons.includes('MBF_W0_FAIL_CLOSED_DUPLICATE_EVENT_START_TIME')) {
        failClosedTrips.push(row.trip_id!.slice(0, 8));
      }
      expect(enriched.events.every((e) => !isW0SyntheticPlaceholderEventV1(e))).toBe(true);
    }
    expect(failClosedTrips).toEqual([]);
  });
});
