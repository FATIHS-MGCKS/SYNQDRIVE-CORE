import { join } from 'path';
import {
  DS4_LAYER2_P2_PINNED_11_ADMISSIBLE_EVENT_COUNT_V1,
  DS4_LAYER2_P2_PINNED_11_EVALUATION_CODE_SHA_V1,
  DS4_LAYER2_P2_PINNED_11_EXCLUDED_VEHICLE_IDS_V1,
  DS4_LAYER2_P2_PINNED_11_VEHICLE_IDS_V1,
} from '../research/ds4-layer2-p2-pinned-11.attestation.v1';
import {
  assertDs4Layer2P2Pinned11PreflightV1,
  loadDs4Layer2P2PinnedInputsFromDirV1,
} from '../research/ds4-layer2-p3c-p2-input.v1';
import {
  buildDs4Layer2P3cPhysicsDiagnosticsV1,
  buildDs4Layer2P3cSidecarArtifactsV1,
  recomputeSpecificImpulseMpsForKindV1,
} from '../research/ds4-layer2-p3c-physics-diagnostics.v1';
import { computeAverageAccelReferenceMps2 } from '../research/ds4-layer2-p3c-temporal-motion-physics.v1';
import {
  createReferenceResolverFromFixtureV1,
  loadDs4Layer2P3cMotionPhysicsReferenceFixtureV1,
} from '../research/ds4-layer2-p3c-reference-fixture.v1';
import { evaluateTemporalReferenceEvidenceV1 } from '../research/ds4-layer2-p3c-temporal-motion-physics.v1';

const FIXTURE_P2_DIR = join(
  __dirname,
  '../research/fixtures/ds4-layer2-p2-pinned-11',
);
const REF_FIXTURE = join(
  __dirname,
  '../research/fixtures/ds4-layer2-p3c-motion-physics-reference-snapshot.v1.json',
);

describe('DS4 Layer-2 P3C physics diagnostics', () => {
  it('passes pinned 11-trip P2 preflight and preserves evaluation SHA', () => {
    const pre = assertDs4Layer2P2Pinned11PreflightV1(FIXTURE_P2_DIR);
    expect(pre.admissibleEventCount).toBe(DS4_LAYER2_P2_PINNED_11_ADMISSIBLE_EVENT_COUNT_V1);
    expect(pre.p2EvaluationCodeSha).toBe(DS4_LAYER2_P2_PINNED_11_EVALUATION_CODE_SHA_V1);
  });

  it('recomputes P2 specific impulse B without changing canonical P2 values', () => {
    const { admissibleEvents, assessmentTrips } = loadDs4Layer2P2PinnedInputsFromDirV1(FIXTURE_P2_DIR);
    for (const trip of assessmentTrips) {
      const tripEvents = admissibleEvents.filter((e) => e.tripId === trip.tripId);
      if (trip.accelSpecificImpulseMps != null) {
        expect(recomputeSpecificImpulseMpsForKindV1(tripEvents, 'ACCELERATION')).toBeCloseTo(
          trip.accelSpecificImpulseMps,
          3,
        );
      }
      if (trip.brakeSpecificImpulseMps != null) {
        expect(recomputeSpecificImpulseMpsForKindV1(tripEvents, 'DECELERATION')).toBeCloseTo(
          trip.brakeSpecificImpulseMps,
          3,
        );
      }
    }
  });

  it('accounts for all 129 admissible events with no Arteon vehicles', async () => {
    const { admissibleEvents, assessmentTrips } = loadDs4Layer2P2PinnedInputsFromDirV1(FIXTURE_P2_DIR);
    const fixture = loadDs4Layer2P3cMotionPhysicsReferenceFixtureV1(REF_FIXTURE);
    expect(fixture.effectiveFromNotHistoricalEvidence).toBe(true);
    const built = await buildDs4Layer2P3cPhysicsDiagnosticsV1({
      organizationId: 'faa710c9-6d91-4079-a7d5-91fdccdec14a',
      admissibleEvents,
      assessmentTrips,
      resolveVehicleReference: createReferenceResolverFromFixtureV1(fixture),
    });

    expect(built.eventDiagnosticRows).toHaveLength(DS4_LAYER2_P2_PINNED_11_ADMISSIBLE_EVENT_COUNT_V1);
    for (const excluded of DS4_LAYER2_P2_PINNED_11_EXCLUDED_VEHICLE_IDS_V1) {
      expect(built.eventDiagnosticRows.some((r) => r.vehicleId === excluded)).toBe(false);
    }
    expect(built.summary.admissibleP2EventCount).toBe(129);
  });

  it('marks fixture cohort as retrospective with no historical evidence support', async () => {
    const { admissibleEvents, assessmentTrips } = loadDs4Layer2P2PinnedInputsFromDirV1(FIXTURE_P2_DIR);
    const fixture = loadDs4Layer2P3cMotionPhysicsReferenceFixtureV1(REF_FIXTURE);
    const built = await buildDs4Layer2P3cPhysicsDiagnosticsV1({
      organizationId: 'faa710c9-6d91-4079-a7d5-91fdccdec14a',
      admissibleEvents,
      assessmentTrips,
      resolveVehicleReference: createReferenceResolverFromFixtureV1(fixture),
    });

    expect(built.summary.retrospectiveReferenceTripCount).toBe(11);
    expect(built.summary.historicalEvidenceSupportedTripCount).toBe(0);
    for (const row of built.eventDiagnosticRows) {
      expect(row.temporalProvenance).toBe('RETROSPECTIVE_REFERENCE');
      expect(row.historicalEvidenceSupported).toBe(false);
      expect(row.limitationReasonsJson).toContain('RETROSPECTIVE_REFERENCE_PROVENANCE');
      expect(row.limitationReasonsJson).toContain('HISTORICAL_APPLICABILITY_NOT_EVIDENCED');
    }
  });

  it('preserves numeric invariance for all 129 fixture-derived diagnostics', async () => {
    const { admissibleEvents, assessmentTrips } = loadDs4Layer2P2PinnedInputsFromDirV1(FIXTURE_P2_DIR);
    const fixture = loadDs4Layer2P3cMotionPhysicsReferenceFixtureV1(REF_FIXTURE);
    const built = await buildDs4Layer2P3cPhysicsDiagnosticsV1({
      organizationId: 'faa710c9-6d91-4079-a7d5-91fdccdec14a',
      admissibleEvents,
      assessmentTrips,
      resolveVehicleReference: createReferenceResolverFromFixtureV1(fixture),
    });

    expect(built.eventDiagnosticRows.every((r) => r.numericDiagnosticAvailability === 'AVAILABLE')).toBe(true);
    expect(built.eventDiagnosticRows.filter((r) => r.estimatedNetLongitudinalForceN != null)).toHaveLength(129);
  });

  it('preserves Tesla/Audi confirmed and Tiguan estimated evidence tiers separately from provenance', async () => {
    const { admissibleEvents, assessmentTrips } = loadDs4Layer2P2PinnedInputsFromDirV1(FIXTURE_P2_DIR);
    const fixture = loadDs4Layer2P3cMotionPhysicsReferenceFixtureV1(REF_FIXTURE);
    const built = await buildDs4Layer2P3cPhysicsDiagnosticsV1({
      organizationId: 'faa710c9-6d91-4079-a7d5-91fdccdec14a',
      admissibleEvents,
      assessmentTrips,
      resolveVehicleReference: createReferenceResolverFromFixtureV1(fixture),
    });

    const teslaCtx = built.physicsContextRows.find(
      (r) => r.vehicleId === DS4_LAYER2_P2_PINNED_11_VEHICLE_IDS_V1.TESLA_MODEL_3,
    );
    const audiCtx = built.physicsContextRows.find(
      (r) => r.vehicleId === DS4_LAYER2_P2_PINNED_11_VEHICLE_IDS_V1.AUDI_A4,
    );
    const tiguanCtx = built.physicsContextRows.find(
      (r) => r.vehicleId === DS4_LAYER2_P2_PINNED_11_VEHICLE_IDS_V1.VW_TIGUAN,
    );

    expect(teslaCtx?.referenceApplicability).toBe('AVAILABLE_CONFIRMED_UNVERIFIED');
    expect(audiCtx?.referenceApplicability).toBe('AVAILABLE_CONFIRMED_UNVERIFIED');
    expect(tiguanCtx?.referenceApplicability).toBe('ESTIMATED_ONLY');
    expect(teslaCtx?.temporalProvenance).toBe('RETROSPECTIVE_REFERENCE');

    const tiguanEvent = built.eventDiagnosticRows.find(
      (r) => r.vehicleId === DS4_LAYER2_P2_PINNED_11_VEHICLE_IDS_V1.VW_TIGUAN,
    );
    expect(tiguanEvent?.limitationReasonsJson).toContain('EXPLORATORY_ESTIMATED_REFERENCE');
    expect(tiguanEvent?.limitationReasonsJson).toContain('ENGINE_RATED_POWER_NOT_SYSTEM_POWER');
  });

  it('does not apply accel reference ratio to braking events', async () => {
    const { admissibleEvents, assessmentTrips } = loadDs4Layer2P2PinnedInputsFromDirV1(FIXTURE_P2_DIR);
    const fixture = loadDs4Layer2P3cMotionPhysicsReferenceFixtureV1(REF_FIXTURE);
    const built = await buildDs4Layer2P3cPhysicsDiagnosticsV1({
      organizationId: 'faa710c9-6d91-4079-a7d5-91fdccdec14a',
      admissibleEvents,
      assessmentTrips,
      resolveVehicleReference: createReferenceResolverFromFixtureV1(fixture),
    });

    const brakes = built.eventDiagnosticRows.filter((r) => r.eventKind === 'DECELERATION');
    expect(brakes.length).toBeGreaterThan(0);
    for (const row of brakes) {
      expect(row.accelRatioToReference).toBeNull();
      expect(row.limitationReasonsJson).toContain('BRAKING_EVENT_NO_ACCEL_REFERENCE_RATIO');
      expect(row.signedMeanAccelMps2).toBeLessThan(0);
    }
  });

  it('fail-closes temporal ambiguity when reference postdates trip', () => {
    const evidence = evaluateTemporalReferenceEvidenceV1({
      tripStartUtc: new Date('2026-10-28T10:00:00.000Z'),
      tripEndUtc: new Date('2026-10-28T11:00:00.000Z'),
      effectiveFrom: new Date('2026-11-01T00:00:00.000Z'),
      effectiveTo: null,
    });
    expect(evidence).toBe('REFERENCE_POSTDATES_TRIP');
  });

  it('computes average acceleration reference from 0-100 time', () => {
    const aRef = computeAverageAccelReferenceMps2(6.1);
    expect(aRef).toBeCloseTo(100 / 3.6 / 6.1, 5);
  });

  it('produces deterministic sidecar checksums', async () => {
    const { admissibleEvents, assessmentTrips } = loadDs4Layer2P2PinnedInputsFromDirV1(FIXTURE_P2_DIR);
    const fixture = loadDs4Layer2P3cMotionPhysicsReferenceFixtureV1(REF_FIXTURE);
    const built = await buildDs4Layer2P3cPhysicsDiagnosticsV1({
      organizationId: 'faa710c9-6d91-4079-a7d5-91fdccdec14a',
      admissibleEvents,
      assessmentTrips,
      resolveVehicleReference: createReferenceResolverFromFixtureV1(fixture),
    });

    const input = {
      p3cEvaluationCodeSha: 'a'.repeat(40),
      p2EvaluationCodeSha: DS4_LAYER2_P2_PINNED_11_EVALUATION_CODE_SHA_V1,
      p2InputChecksumsSha256: {},
      p2ManifestChecksumSha256: 'b'.repeat(64),
      organizationId: 'faa710c9-6d91-4079-a7d5-91fdccdec14a',
      builtAtUtc: new Date('2026-10-31T00:00:00.000Z'),
      physicsContextRows: built.physicsContextRows,
      eventDiagnosticRows: built.eventDiagnosticRows,
      limitationRows: built.limitationRows,
      summary: built.summary,
    };

    const a = buildDs4Layer2P3cSidecarArtifactsV1(input);
    const b = buildDs4Layer2P3cSidecarArtifactsV1(input);
    expect(a.fileChecksums).toEqual(b.fileChecksums);
    expect(a.manifest.manifestChecksumSha256).toBe(b.manifest.manifestChecksumSha256);
  });
});
