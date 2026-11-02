import {
  analyzeEngineRpmCadence,
  analyzeLvVoltageCadence,
  buildCadenceSemanticFingerprint,
  clipTripWindowsToLinkBounds,
  collectIntraTripIntervalsSeconds,
  computeDistinctBucketCoverageRatio,
  dedupeCadenceProvenanceTags,
  dedupeLvPointsBySourceAdvance,
  detectCadenceRegimes,
  intervalsFromTimestampsMs,
  resolveIceRpmApplicability,
  resolveRpmObservedDensityLabel,
} from './vsi-profile-cadence-stats.util';
import { enrichVsiProfileWithCadenceIntelligence } from './vsi-profile-cadence.enricher';
import {
  fingerprintVsiProfileSemanticEvaluation,
} from './vsi-profile-fingerprint.util';
import { enrichVsiProfileWithSignalFingerprints } from './vsi-signal-fingerprint.enricher';
import type { VsiProfileEvaluationDraft } from './vsi-profile.types';
import { VSI_PROFILE_CONTRACT_VERSION } from './vsi-profile.types';

const T0 = Date.parse('2026-10-01T10:00:00.000Z');

function msAt(secondOffset: number): number {
  return T0 + secondOffset * 1000;
}

function rpmInput(
  overrides: Partial<Parameters<typeof analyzeEngineRpmCadence>[0]> = {},
) {
  return {
    iceRpmApplicability: 'APPLICABLE' as const,
    tripWindows: [{ tripId: 't1', startMs: msAt(0), endMs: msAt(600) }],
    points: [],
    provenance: [],
    hfReadStatus: 'SUCCESS' as const,
    ...overrides,
  };
}

describe('vsi-profile-cadence-stats.util', () => {
  it('aggregates intra-trip intervals only across separated trips', () => {
    const trips = [
      { tripId: 'a', startMs: msAt(0), endMs: msAt(10) },
      { tripId: 'b', startMs: msAt(500), endMs: msAt(510) },
    ];
    const points = [
      { recordedAtMs: msAt(0), value: 900 },
      { recordedAtMs: msAt(5), value: 900 },
      { recordedAtMs: msAt(500), value: 800 },
      { recordedAtMs: msAt(505), value: 800 },
    ];
    const intervals = collectIntraTripIntervalsSeconds(points, trips);
    expect(intervals).toEqual([5, 5]);
    const cadence = analyzeEngineRpmCadence(rpmInput({ tripWindows: trips, points }));
    expect(cadence.maxIntraWindowGapSeconds).toBeLessThanOrEqual(5);
  });

  it('sparse endpoint trip never reaches 100% bucket coverage', () => {
    const trip = { tripId: 't1', startMs: msAt(0), endMs: msAt(600) };
    const points = [
      { recordedAtMs: msAt(0), value: 1000 },
      { recordedAtMs: msAt(600), value: 1000 },
    ];
    const ratio = computeDistinctBucketCoverageRatio(points, [trip]);
    expect(ratio).not.toBeNull();
    expect(ratio!).toBeLessThan(0.01);
  });

  it('handles overlapping trips without double-counting timestamps', () => {
    const trips = [
      { tripId: 'a', startMs: msAt(0), endMs: msAt(100) },
      { tripId: 'b', startMs: msAt(50), endMs: msAt(150) },
    ];
    const points = [
      { recordedAtMs: msAt(60), value: 700 },
      { recordedAtMs: msAt(60), value: 700 },
      { recordedAtMs: msAt(65), value: 700 },
    ];
    const cadence = analyzeEngineRpmCadence(rpmInput({ tripWindows: trips, points }));
    expect(cadence.distinctTimestampCount).toBe(2);
  });

  it('unknown fuel type is not ICE NOT_APPLICABLE', () => {
    expect(resolveIceRpmApplicability(null)).toBe('UNKNOWN');
    const cadence = analyzeEngineRpmCadence(
      rpmInput({ iceRpmApplicability: 'UNKNOWN' }),
    );
    expect(cadence.observedDensityLabel).toBe('UNKNOWN');
    expect(cadence.limitations).toContain('POWERTRAIN_APPLICABILITY_UNKNOWN');
  });

  it('confirmed BEV is NOT_APPLICABLE for ICE RPM', () => {
    const cadence = analyzeEngineRpmCadence(
      rpmInput({ iceRpmApplicability: 'NOT_APPLICABLE' }),
    );
    expect(cadence.observedDensityLabel).toBe('NOT_APPLICABLE');
  });

  function rpmPointsEverySeconds(stepSeconds: number, count: number) {
    return Array.from({ length: count }, (_, i) => ({
      recordedAtMs: msAt(i * stepSeconds),
      value: 1500,
    }));
  }

  it('classifies Tiguan-like ~1s aggregate buckets as ONE_SECOND_BUCKETS_UNPROVEN', () => {
    const trip = { tripId: 'tiguan', startMs: msAt(0), endMs: msAt(120) };
    const cadence = analyzeEngineRpmCadence(
      rpmInput({
        tripWindows: [trip],
        points: rpmPointsEverySeconds(1, 40),
        hfReadStatus: 'SUCCESS',
      }),
    );
    expect(cadence.intervalMedianSeconds).toBeCloseTo(1, 0);
    expect(cadence.observedDensityLabel).toBe('ONE_SECOND_BUCKETS_UNPROVEN');
    expect(cadence.limitations).toContain(
      'DIMO_ONE_SECOND_BUCKET_NOT_NATIVE_SAMPLING_PROOF',
    );
  });

  it('classifies Arteon-like ~2s observed intervals as SUB_ONE_HZ', () => {
    const trip = { tripId: 'arteon', startMs: msAt(0), endMs: msAt(200) };
    const cadence = analyzeEngineRpmCadence(
      rpmInput({
        tripWindows: [trip],
        points: rpmPointsEverySeconds(2, 30),
        hfReadStatus: 'SUCCESS',
      }),
    );
    expect(cadence.intervalMedianSeconds).toBeCloseTo(2, 0);
    expect(cadence.observedDensityLabel).toBe('SUB_ONE_HZ');
    expect(cadence.limitations).toContain(
      'DIMO_ONE_SECOND_BUCKET_NOT_NATIVE_SAMPLING_PROOF',
    );
  });

  it('classifies Audi-like ~7s observed intervals as SUB_ONE_HZ', () => {
    const trip = { tripId: 'audi', startMs: msAt(0), endMs: msAt(600) };
    const cadence = analyzeEngineRpmCadence(
      rpmInput({
        tripWindows: [trip],
        points: rpmPointsEverySeconds(7, 20),
        hfReadStatus: 'SUCCESS',
      }),
    );
    expect(cadence.intervalMedianSeconds).toBeCloseTo(7, 0);
    expect(cadence.observedDensityLabel).toBe('SUB_ONE_HZ');
  });

  it('resolveRpmObservedDensityLabel returns UNKNOWN when interval evidence is thin', () => {
    expect(
      resolveRpmObservedDensityLabel({
        intervalMedianSeconds: 2,
        intervalSampleCount: 2,
        limitations: ['DIMO_ONE_SECOND_BUCKET_NOT_NATIVE_SAMPLING_PROOF'],
      }),
    ).toBe('UNKNOWN');
  });

  it('clips trip windows to provider link bounds for cadence eligibility', () => {
    const linkActivated = msAt(100);
    const linkEnd = msAt(200);
    const clipped = clipTripWindowsToLinkBounds(
      [{ tripId: 'span', startMs: msAt(0), endMs: msAt(300) }],
      linkActivated,
      linkEnd,
    );
    expect(clipped).toEqual([
      { tripId: 'span', startMs: linkActivated, endMs: linkEnd },
    ]);
    const points = [
      { recordedAtMs: msAt(50), value: 900 },
      { recordedAtMs: msAt(150), value: 900 },
      { recordedAtMs: msAt(250), value: 900 },
    ];
    const cadence = analyzeEngineRpmCadence(
      rpmInput({
        tripWindows: clipped,
        points,
        hfReadStatus: 'SUCCESS',
      }),
    );
    expect(cadence.observedSampleCount).toBe(1);
    expect(cadence.distinctTimestampCount).toBe(1);
  });

  it('dedupes LV by provider source advancement', () => {
    const deduped = dedupeLvPointsBySourceAdvance([
      { observedAtMs: msAt(0), providerTimestampMs: msAt(0) },
      { observedAtMs: msAt(10), providerTimestampMs: msAt(0) },
      { observedAtMs: msAt(20), providerTimestampMs: msAt(20) },
    ]);
    expect(deduped).toHaveLength(2);
    const cadence = analyzeLvVoltageCadence({
      linkActivatedAtMs: msAt(0),
      linkDeactivatedAtMs: null,
      provenance: [],
      points: [
        { observedAtMs: msAt(0), providerTimestampMs: msAt(0) },
        { observedAtMs: msAt(10), providerTimestampMs: msAt(0) },
        { observedAtMs: msAt(200), providerTimestampMs: msAt(200) },
        { observedAtMs: msAt(400), providerTimestampMs: msAt(400) },
      ],
    });
    expect(cadence.observedSampleCount).toBe(3);
  });

  it('classifies stable 8h and 24h resting heartbeats with adequate regularity', () => {
    const eightHour = 8 * 3600;
    const day = 24 * 3600;
    const eight = detectCadenceRegimes([eightHour, eightHour, eightHour, eightHour, eightHour]);
    const resting8 = eight.find((r) => r.kind === 'PERIODIC_RESTING_HEARTBEAT');
    expect(resting8?.intervalMedianSeconds).toBeGreaterThan(7.5 * 3600);
    expect(resting8?.confidence).not.toBe('LOW');

    const dayIntervals = [day, day, day, day, day];
    const twentyFour = detectCadenceRegimes(dayIntervals);
    const resting24 = twentyFour.find((r) => r.kind === 'PERIODIC_RESTING_HEARTBEAT');
    expect(resting24?.intervalMedianSeconds).toBeCloseTo(day, -2);
  });

  it('does not certify HIGH periodicity for irregular multi-hour gaps', () => {
    const gaps = [7200, 18000, 36000, 108000];
    const regimes = detectCadenceRegimes(gaps);
    const resting = regimes.find((r) => r.kind === 'PERIODIC_RESTING_HEARTBEAT');
    expect(resting?.confidence).not.toBe('HIGH');
  });

  it('cadence semantic fingerprint ignores sample totals', () => {
    const base = rpmInput({
      points: [
        { recordedAtMs: msAt(0), value: 900 },
        { recordedAtMs: msAt(5), value: 900 },
        { recordedAtMs: msAt(10), value: 900 },
        { recordedAtMs: msAt(15), value: 900 },
      ],
    });
    const a = analyzeEngineRpmCadence(base);
    const b = analyzeEngineRpmCadence({
      ...base,
      points: [
        ...base.points,
        { recordedAtMs: msAt(20), value: 900 },
        { recordedAtMs: msAt(25), value: 900 },
      ],
    });
    expect(a.cadenceSemanticFingerprint).toBe(b.cadenceSemanticFingerprint);
    expect(b.observedSampleCount).toBeGreaterThan(a.observedSampleCount);
  });

  it('cadence semantic fingerprint changes on real drift', () => {
    const trip = { tripId: 't', startMs: msAt(0), endMs: msAt(120) };
    const sparse = analyzeEngineRpmCadence(
      rpmInput({
        tripWindows: [trip],
        points: [
          { recordedAtMs: msAt(0), value: 900 },
          { recordedAtMs: msAt(60), value: 900 },
          { recordedAtMs: msAt(120), value: 900 },
        ],
      }),
    );
    const dense = analyzeEngineRpmCadence(
      rpmInput({
        tripWindows: [trip],
        points: [0, 1, 2, 3, 4, 5].map((s) => ({
          recordedAtMs: msAt(s),
          value: 900,
        })),
      }),
    );
    expect(sparse.cadenceSemanticFingerprint).not.toBe(dense.cadenceSemanticFingerprint);
  });

  it('profile semantic revision stable when only cadence sample counters grow', () => {
    const draft: VsiProfileEvaluationDraft = {
      contractVersion: VSI_PROFILE_CONTRACT_VERSION,
      organizationId: 'org',
      vehicleId: 'veh',
      providerSourceLinkId: 'link',
      providerIdentity: 'DIMO',
      verifiedModality: null,
      telemetrySourceFamily: null,
      evaluatedAt: new Date(),
      declaredCatalogCheckedAt: null,
      lastMaterializedSourceTimestamp: null,
      lastMaterializedProviderFetchAt: null,
      lastProvenStrictSourceAdvanceAt: null,
      signals: [],
      profileLimitations: [],
    };
    const trip = { tripId: 't', startMs: msAt(0), endMs: msAt(30) };
    const evidenceA = rpmInput({
      tripWindows: [trip],
      points: [
        { recordedAtMs: msAt(0), value: 1000 },
        { recordedAtMs: msAt(5), value: 1000 },
        { recordedAtMs: msAt(10), value: 1000 },
      ],
    });
    const evidenceB = {
      ...evidenceA,
      points: [
        ...evidenceA.points,
        { recordedAtMs: msAt(15), value: 1000 },
        { recordedAtMs: msAt(20), value: 1000 },
      ],
    };
    const evalA = enrichVsiProfileWithCadenceIntelligence(
      enrichVsiProfileWithSignalFingerprints(draft, { bundleSourceTimestamps: [] }),
      { rpmEvidence: evidenceA, lvEvidence: null },
    );
    const evalB = enrichVsiProfileWithCadenceIntelligence(
      enrichVsiProfileWithSignalFingerprints(draft, { bundleSourceTimestamps: [] }),
      { rpmEvidence: evidenceB, lvEvidence: null },
    );
    expect(fingerprintVsiProfileSemanticEvaluation(evalA)).toBe(
      fingerprintVsiProfileSemanticEvaluation(evalB),
    );
  });

  it('dedupes duplicate timestamps for interval math', () => {
    const intervals = intervalsFromTimestampsMs([
      msAt(0),
      msAt(0),
      msAt(5),
      msAt(10),
    ]);
    expect(intervals).toEqual([5, 5]);
  });

  it('buildCadenceSemanticFingerprint is stable for identical semantic payload', () => {
    const fp = buildCadenceSemanticFingerprint({ signal: 'lv_voltage', median: 180 });
    expect(fp).toBe(buildCadenceSemanticFingerprint({ signal: 'lv_voltage', median: 180 }));
  });

  describe('cadence provenance dedup (P1-a)', () => {
    it('dedupeCadenceProvenanceTags preserves order and distinct tags', () => {
      expect(
        dedupeCadenceProvenanceTags([
          'POSTGRES_BATTERY_MEASUREMENTS',
          'CLICKHOUSE_TELEMETRY_HF_POINTS',
          'POSTGRES_BATTERY_MEASUREMENTS',
        ]),
      ).toEqual(['POSTGRES_BATTERY_MEASUREMENTS', 'CLICKHOUSE_TELEMETRY_HF_POINTS']);
    });

    it('dedupeCadenceProvenanceTags is idempotent', () => {
      const tags = ['A', 'B', 'A', 'C', 'B'];
      const once = dedupeCadenceProvenanceTags(tags);
      expect(dedupeCadenceProvenanceTags(once)).toEqual(once);
    });

    it('engine RPM does not duplicate CLICKHOUSE when loader pre-set tag', () => {
      const points = [0, 5, 10, 15].map((s) => ({
        recordedAtMs: msAt(s),
        value: 900,
      }));
      const cadence = analyzeEngineRpmCadence(
        rpmInput({
          hfReadStatus: 'SUCCESS',
          provenance: ['CLICKHOUSE_TELEMETRY_HF_POINTS'],
          points,
        }),
      );
      expect(cadence.provenance).toEqual(['CLICKHOUSE_TELEMETRY_HF_POINTS']);
    });

    it('engine RPM adds CLICKHOUSE once when provenance empty and HF succeeds', () => {
      const cadence = analyzeEngineRpmCadence(
        rpmInput({
          hfReadStatus: 'SUCCESS',
          provenance: [],
          points: [
            { recordedAtMs: msAt(0), value: 900 },
            { recordedAtMs: msAt(5), value: 900 },
            { recordedAtMs: msAt(10), value: 900 },
            { recordedAtMs: msAt(15), value: 900 },
          ],
        }),
      );
      expect(cadence.provenance).toEqual(['CLICKHOUSE_TELEMETRY_HF_POINTS']);
    });

    it('LV voltage does not duplicate POSTGRES when loader pre-set tag', () => {
      const cadence = analyzeLvVoltageCadence({
        points: [
          { observedAtMs: msAt(0), providerTimestampMs: null },
          { observedAtMs: msAt(300), providerTimestampMs: null },
          { observedAtMs: msAt(600), providerTimestampMs: null },
        ],
        provenance: ['POSTGRES_BATTERY_MEASUREMENTS'],
        linkActivatedAtMs: msAt(-3600),
        linkDeactivatedAtMs: null,
      });
      expect(cadence.provenance).toEqual(['POSTGRES_BATTERY_MEASUREMENTS']);
    });

    it('cadence numeric outputs unchanged when deduping duplicate input tags', () => {
      const points = [0, 5, 10, 15].map((s) => ({
        recordedAtMs: msAt(s),
        value: 900,
      }));
      const withDupes = analyzeEngineRpmCadence(
        rpmInput({
          hfReadStatus: 'SUCCESS',
          provenance: [
            'CLICKHOUSE_TELEMETRY_HF_POINTS',
            'CLICKHOUSE_TELEMETRY_HF_POINTS',
          ],
          points,
        }),
      );
      const clean = analyzeEngineRpmCadence(
        rpmInput({
          hfReadStatus: 'SUCCESS',
          provenance: ['CLICKHOUSE_TELEMETRY_HF_POINTS'],
          points,
        }),
      );
      expect(withDupes.observedSampleCount).toBe(clean.observedSampleCount);
      expect(withDupes.intervalMedianSeconds).toBe(clean.intervalMedianSeconds);
      expect(withDupes.observedDensityLabel).toBe(clean.observedDensityLabel);
      expect(withDupes.regimes).toEqual(clean.regimes);
    });

    it('handles empty and missing provenance on LV path', () => {
      const empty = analyzeLvVoltageCadence({
        points: [],
        provenance: [],
        linkActivatedAtMs: msAt(0),
        linkDeactivatedAtMs: null,
      });
      expect(empty.provenance).toEqual(['POSTGRES_BATTERY_MEASUREMENTS']);
      expect(empty.observedSampleCount).toBe(0);
    });

    it('mixed distinct provenance tags remain on RPM path', () => {
      const cadence = analyzeEngineRpmCadence(
        rpmInput({
          hfReadStatus: 'SUCCESS',
          provenance: ['VEHICLE_LATEST_STATE'],
          points: [
            { recordedAtMs: msAt(0), value: 900 },
            { recordedAtMs: msAt(5), value: 900 },
            { recordedAtMs: msAt(10), value: 900 },
            { recordedAtMs: msAt(15), value: 900 },
          ],
        }),
      );
      expect(cadence.provenance).toEqual([
        'VEHICLE_LATEST_STATE',
        'CLICKHOUSE_TELEMETRY_HF_POINTS',
      ]);
    });
  });
});
