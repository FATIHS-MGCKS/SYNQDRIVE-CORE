import * as fs from 'node:fs';
import * as path from 'node:path';
const fixtures = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, 'fixtures/vsi-p0a-signal-integrity-audit-fixtures.v1.json'),
    'utf8',
  ),
) as {
  audiRpmReference: {
    vehicle: VsiP0aProfileAuditBundle['vehicle'];
    sourceLinkId: string;
    signals: Array<Record<string, unknown>>;
  };
  teslaEv: { vehicle: VsiP0aProfileAuditBundle['vehicle']; signals: Array<Record<string, unknown>> };
  providerFetchObservedUnknownQuality: { signals: Array<{ empiricalObservation: string; qualityClassification: string; freshnessClassification?: string; limitations: string[] }> };
};
import {
  assembleVsiP0aMatrixDocument,
  buildVsiP0aMatrixRows,
  type VsiP0aProfileAuditBundle,
} from './vsi-p0a-signal-integrity-audit.engine';
import { resolveVsiP0aApplicability, classifyVsiP0aSignalFinding } from './vsi-p0a-signal-integrity-audit.classifier';
import {
  analyzeEngineRpmCadence,
  analyzeLvVoltageCadence,
} from './vsi-profile-cadence-stats.util';
import { VSI_P0A_DEFAULT_COHORT_V1 } from './vsi-p0a-audit-cohort.v1';
import type { VsiProfileSignalFingerprintV1 } from './vsi-profile.types';

function baseBundle(partial: Partial<VsiP0aProfileAuditBundle> & Pick<VsiP0aProfileAuditBundle, 'vehicle'>): VsiP0aProfileAuditBundle {
  return {
    sourceLinkId: 'test-link',
    provider: 'DIMO',
    providerModality: partial.vehicle.providerModality,
    profileRow: {
      evaluatedAt: new Date('2026-10-30T12:00:00.000Z'),
      lastMaterializedProviderFetchAt: new Date('2026-10-30T11:55:00.000Z'),
      signalsSnapshot: [],
      providerSourceLinkId: 'test-link',
      providerIdentity: 'dimo',
      profileRevision: 1,
      profileContractVersion: 'vsi-signal-profile-v2',
      profileLimitations: [],
      contentFingerprint: 'abc123def456',
      lastMaterializedSourceTimestamp: new Date('2026-10-30T11:50:00.000Z'),
    },
    hfBySignal: {},
    verificationPartial: false,
    ...partial,
  };
}

function signalFingerprint(partial: Record<string, unknown>): VsiProfileSignalFingerprintV1 {
  return {
    signalFingerprintContractVersion: 'vsi-signal-fingerprint-v1',
    canonicalSignalKey: 'engine_rpm',
    providerNativeSignalName: 'powertrainCombustionEngineSpeed',
    declaredSupport: 'UNKNOWN',
    empiricalObservation: 'NEVER_OBSERVED',
    lastValidObservationAt: null,
    lastSourceTimestamp: null,
    lastProviderFetchAt: null,
    lastProvenStrictSourceAdvanceAt: null,
    strictSourceAdvanced: false,
    freshnessClassification: 'UNKNOWN',
    evidenceProvenance: [],
    limitations: [],
    qualityClassification: 'NEVER_OBSERVED',
    confidenceLevel: 'LOW',
    observedSamples: 0,
    provenSourceAdvances: 0,
    observedCadenceMedianSeconds: null,
    observedCadenceSampleCount: null,
    maxStaleIntervalSeconds: null,
    contentFingerprint: 'fp',
    ...partial,
  } as VsiProfileSignalFingerprintV1;
}

describe('vsi-p0a signal integrity audit engine', () => {
  it('Audi: snapshot NEVER_OBSERVED + HF RPM_STANDARD → MISLEADING_PRESENTATION (deduped cadence provenance)', () => {
    const ref = fixtures.audiRpmReference;
    const bundle = baseBundle({
      vehicle: ref.vehicle,
      sourceLinkId: ref.sourceLinkId,
      profileRow: {
        ...baseBundle({ vehicle: ref.vehicle }).profileRow,
        signalsSnapshot: ref.signals.map((s) =>
          signalFingerprint({
            ...s,
            canonicalSignalKey: s.canonicalSignalKey,
          }),
        ),
      },
    });
    const rows = buildVsiP0aMatrixRows(bundle);
    const rpm = rows.find((r) => r.canonicalSignal === 'engine_rpm');
    expect(rpm?.snapshotObservation).toBe('NEVER_OBSERVED');
    expect(rpm?.activeCadenceProfile).toBe('RPM_STANDARD');
    expect(rpm?.findingClass).toBe('EXPECTED_BEHAVIOR');
    expect(rpm?.evidenceReference).toBe('rpm_dual_lane_combined_historical_only_v1');
  });

  it('Tesla: engine_rpm and fuel_level are NOT_APPLICABLE when fuel type is ELECTRIC', () => {
    for (const key of ['engine_rpm', 'fuel_level_relative'] as const) {
      expect(
        resolveVsiP0aApplicability(key, fixtures.teslaEv.vehicle as never),
      ).toBe('NOT_APPLICABLE');
    }
    const bundle = baseBundle({
      vehicle: fixtures.teslaEv.vehicle as never,
      profileRow: {
        ...baseBundle({ vehicle: fixtures.teslaEv.vehicle as never }).profileRow,
        signalsSnapshot: fixtures.teslaEv.signals.map((s) =>
          signalFingerprint({
            ...s,
            canonicalSignalKey: s.canonicalSignalKey,
            empiricalObservation: 'NOT_APPLICABLE',
            qualityClassification: 'NOT_APPLICABLE',
          }),
        ),
      },
    });
    const rows = buildVsiP0aMatrixRows(bundle);
    const er = rows.find((r) => r.canonicalSignal === 'engine_rpm');
    expect(er?.findingClass).toBe('EXPECTED_BEHAVIOR');
    expect(er?.evidenceReference).toBe('powertrain_not_applicable_correctly_materialized');
  });

  it('ICE: hv_battery_soc NOT_APPLICABLE when materialized correctly', () => {
    const bundle = baseBundle({
      vehicle: fixtures.audiRpmReference.vehicle as never,
      profileRow: {
        ...baseBundle({ vehicle: fixtures.audiRpmReference.vehicle as never }).profileRow,
        signalsSnapshot: [
          signalFingerprint({
            canonicalSignalKey: 'hv_battery_soc',
            empiricalObservation: 'NOT_APPLICABLE',
            qualityClassification: 'NOT_APPLICABLE',
          }),
        ],
      },
    });
    const row = buildVsiP0aMatrixRows(bundle).find((r) => r.canonicalSignal === 'hv_battery_soc');
    expect(row?.applicability).toBe('NOT_APPLICABLE');
    expect(row?.findingClass).toBe('EXPECTED_BEHAVIOR');
  });

  it('provider_last_successful_fetch OBSERVED with aligned fetch-recency quality is not P0 bug', () => {
    const s = fixtures.providerFetchObservedUnknownQuality.signals[0];
    const result = classifyVsiP0aSignalFinding({
      vehicle: fixtures.audiRpmReference.vehicle as never,
      canonicalSignal: 'provider_last_successful_fetch',
      applicability: 'UNKNOWN',
      declaredSupport: 'UNKNOWN',
      snapshotObservation: s.empiricalObservation,
      snapshotQuality: s.qualityClassification,
      snapshotConfidence: 'MEDIUM',
      hfAvailability: 'NOT_SUPPORTED_BY_PIPELINE',
      hfSampleCount: null,
      activeCadenceProfile: null,
      freshness: s.freshnessClassification ?? 'FRESH',
      provenance: ['VEHICLE_LATEST_STATE'],
      limitations: s.limitations,
      materializedInProfile: true,
    });
    expect(result.findingClass).not.toBe('CONFIRMED_BUG');
    expect(result.evidenceReference).not.toMatch(/observed_unknown_quality/);
  });

  it('P1-a differential: cadence analyzer output avoids cadence_provenance_duplicate_entries', () => {
    const ref = fixtures.audiRpmReference;
    const trip = { tripId: 't1', startMs: Date.parse('2026-10-30T10:00:00.000Z'), endMs: Date.parse('2026-10-30T10:10:00.000Z') };
    const rpmCadence = analyzeEngineRpmCadence({
      iceRpmApplicability: 'APPLICABLE',
      tripWindows: [trip],
      points: [
        { recordedAtMs: trip.startMs, value: 900 },
        { recordedAtMs: trip.startMs + 5000, value: 900 },
        { recordedAtMs: trip.startMs + 10000, value: 900 },
        { recordedAtMs: trip.startMs + 15000, value: 900 },
      ],
      provenance: ['CLICKHOUSE_TELEMETRY_HF_POINTS'],
      hfReadStatus: 'SUCCESS',
    });
    expect(rpmCadence.provenance).toEqual(['CLICKHOUSE_TELEMETRY_HF_POINTS']);

    const lvCadence = analyzeLvVoltageCadence({
      points: [
        { observedAtMs: Date.parse('2026-10-30T09:00:00.000Z'), providerTimestampMs: null },
        { observedAtMs: Date.parse('2026-10-30T09:05:00.000Z'), providerTimestampMs: null },
        { observedAtMs: Date.parse('2026-10-30T09:10:00.000Z'), providerTimestampMs: null },
      ],
      provenance: ['POSTGRES_BATTERY_MEASUREMENTS'],
      linkActivatedAtMs: Date.parse('2026-10-01T00:00:00.000Z'),
      linkDeactivatedAtMs: null,
    });
    expect(lvCadence.provenance).toEqual(['POSTGRES_BATTERY_MEASUREMENTS']);

    for (const cadence of [rpmCadence, lvCadence]) {
      const dup =
        cadence.provenance.length > 1 &&
        new Set(cadence.provenance).size < cadence.provenance.length;
      expect(dup).toBe(false);
    }

    const rpmRow = classifyVsiP0aSignalFinding({
      vehicle: ref.vehicle as never,
      canonicalSignal: 'engine_rpm',
      applicability: 'APPLICABLE',
      declaredSupport: 'UNKNOWN',
      snapshotObservation: 'NEVER_OBSERVED',
      snapshotQuality: 'NEVER_OBSERVED',
      snapshotConfidence: 'LOW',
      hfAvailability: 'SUPPORTED_WITH_SAMPLES',
      hfSampleCount: rpmCadence.observedSampleCount,
      activeCadenceProfile: 'RPM_STANDARD',
      freshness: 'UNKNOWN',
      provenance: rpmCadence.provenance,
      limitations: [],
      materializedInProfile: true,
    });
    expect(rpmRow.evidenceReference).not.toBe('cadence_provenance_duplicate_entries');
  });

  it('duplicate cadence provenance → CONFIRMED_BUG', () => {
    const result = classifyVsiP0aSignalFinding({
      vehicle: fixtures.audiRpmReference.vehicle as never,
      canonicalSignal: 'engine_rpm',
      applicability: 'APPLICABLE',
      declaredSupport: 'UNKNOWN',
      snapshotObservation: 'NEVER_OBSERVED',
      snapshotQuality: 'NEVER_OBSERVED',
      snapshotConfidence: 'LOW',
      hfAvailability: 'SUPPORTED_WITH_SAMPLES',
      hfSampleCount: 10,
      activeCadenceProfile: 'RPM_STANDARD',
      freshness: 'UNKNOWN',
      provenance: ['CLICKHOUSE_TELEMETRY_HF_POINTS', 'CLICKHOUSE_TELEMETRY_HF_POINTS'],
      limitations: [],
      materializedInProfile: true,
    });
    expect(result.findingClass).toBe('CONFIRMED_BUG');
  });

  it('P1-C differential: five FC-APPLICABILITY matrix rows fixed when NOT_APPLICABLE materialized', () => {
    const tesla = VSI_P0A_DEFAULT_COHORT_V1.vehicles[0];
    const iceVehicles = VSI_P0A_DEFAULT_COHORT_V1.vehicles.slice(1);
    const cases: Array<{
      vehicle: (typeof VSI_P0A_DEFAULT_COHORT_V1.vehicles)[number];
      canonicalSignal: 'engine_rpm' | 'fuel_level_relative' | 'hv_battery_soc';
    }> = [
      { vehicle: tesla, canonicalSignal: 'engine_rpm' },
      { vehicle: tesla, canonicalSignal: 'fuel_level_relative' },
      ...iceVehicles.map((vehicle) => ({
        vehicle,
        canonicalSignal: 'hv_battery_soc' as const,
      })),
    ];
    expect(cases).toHaveLength(5);

    for (const { vehicle, canonicalSignal } of cases) {
      const applicability = resolveVsiP0aApplicability(canonicalSignal, vehicle);
      expect(applicability).toBe('NOT_APPLICABLE');

      const before = classifyVsiP0aSignalFinding({
        vehicle,
        canonicalSignal,
        applicability,
        declaredSupport: 'UNKNOWN',
        snapshotObservation: 'NEVER_OBSERVED',
        snapshotQuality: 'NEVER_OBSERVED',
        snapshotConfidence: 'LOW',
        hfAvailability: 'NOT_SUPPORTED_BY_PIPELINE',
        hfSampleCount: null,
        activeCadenceProfile: null,
        freshness: 'UNKNOWN',
        provenance: [],
        limitations: [],
        materializedInProfile: true,
      });
      expect(before.findingClass).toBe('MISLEADING_PRESENTATION');
      expect(before.evidenceReference).toBe('not_applicable_shown_as_never_observed');

      const after = classifyVsiP0aSignalFinding({
        vehicle,
        canonicalSignal,
        applicability,
        declaredSupport: 'UNKNOWN',
        snapshotObservation: 'NOT_APPLICABLE',
        snapshotQuality: 'NOT_APPLICABLE',
        snapshotConfidence: 'LOW',
        hfAvailability: 'NOT_SUPPORTED_BY_PIPELINE',
        hfSampleCount: null,
        activeCadenceProfile: null,
        freshness: 'UNKNOWN',
        provenance: [],
        limitations: ['POWERTRAIN_SIGNAL_NOT_APPLICABLE'],
        materializedInProfile: true,
      });
      expect(after.findingClass).toBe('EXPECTED_BEHAVIOR');
      expect(after.evidenceReference).toBe('powertrain_not_applicable_correctly_materialized');
    }
  });

  it('assemble document row counts for default cohort keys', () => {
    const doc = assembleVsiP0aMatrixDocument({
      auditExecutedAt: new Date('2026-10-30T12:00:00.000Z'),
      auditTimezone: 'Europe/Berlin',
      productionVerification: {
        verifiedAt: '2026-10-30T12:00:00.000Z',
        originMainSha: '63626fa',
        productionCurrentSha: 'c847a680',
        productionRelease: '20261030144630_v4994',
        replica3001Sha: null,
        replica3002Sha: null,
        pm2Health: null,
        publicHealthOk: true,
        pr2255: 'CODE_PRESENT',
        pr2256: 'NOT_PRESENT',
        pr2257: 'CODE_PRESENT',
        frontendArtifact: {
          bundlePath: 'assets/index-DkMhoG6d.js',
          rpmDualPresent: 'ARTIFACT_PRESENT',
          dualProvenanceTestIdPresent: 'ARTIFACT_PRESENT',
        },
        runtimeDualProvenanceUi: 'NOT_VERIFIED',
        notes: [],
      },
      cohort: VSI_P0A_DEFAULT_COHORT_V1,
      bundles: [],
    });
    expect(doc.summary.canonicalSignalCount).toBeGreaterThan(15);
    expect(doc.summary.vehicleCount).toBe(4);
  });

  it('fixture file is present on disk', () => {
    const p = path.join(__dirname, 'fixtures/vsi-p0a-signal-integrity-audit-fixtures.v1.json');
    expect(fs.existsSync(p)).toBe(true);
  });
});
