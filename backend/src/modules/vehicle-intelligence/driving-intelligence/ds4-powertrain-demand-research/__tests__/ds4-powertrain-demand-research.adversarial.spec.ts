import { DI_V0_R1_OBD_EVIDENCE_SNAPSHOT_V0_3 } from '../../r1-obd-acquisition/di-v0-r1-obd-acquisition.versions';
import { resolveTelemetrySourceFamily } from '../../../telemetry-source-family';
import { computeDs4PowertrainDemandResearchV1 } from '../ds4-powertrain-demand-research.kernel.v1';
import {
  canonicalizeMultichannelObservations,
  verifyMultichannelRpmParityWithV1a,
} from '../ds4-powertrain-demand-multichannel-canonicalize.v1';
import { DS4_MULTICHANNEL_MANIFEST_VERSION } from '../ds4-powertrain-demand-research.contract.v1';
import {
  computeMultichannelContentFingerprint,
  validateDs4PowertrainDemandResearchInputBinding,
} from '../ds4-powertrain-demand-research.input-binding.v1';
import {
  buildBoundPowertrainInput,
  buildObservationSeries,
  positiveKickdownGrid,
  R1_DIMO,
} from './ds4-powertrain-demand-research.test-helpers';

function bound(
  extra?: Partial<Parameters<typeof buildBoundPowertrainInput>[0]>,
): ReturnType<typeof buildBoundPowertrainInput> {
  return buildBoundPowertrainInput({
    multichannelObservations: positiveKickdownGrid(),
    ...extra,
  });
}

describe('ds4-powertrain-demand adversarial binding', () => {
  it('extra multichannel RPM bucket without V1A label fails closed', () => {
    const input = buildBoundPowertrainInput({ multichannelObservations: positiveKickdownGrid() });
    const grid = [
      ...input.multichannelObservations,
      {
        recordedAtIso: '2026-01-01T10:05:00.000Z',
        throttlePct: 50,
        rpm: 3000,
        speedKmh: 60,
        loadPct: 70,
      },
    ];
    input.multichannelObservations = grid;
    const family = resolveTelemetrySourceFamily(input.dimoVehicleRawJson) ?? 'UNKNOWN';
    input.multichannelFingerprint = computeMultichannelContentFingerprint({
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      tripId: input.tripId,
      providerSourceLinkId: input.providerSourceLinkId,
      telemetrySourceFamily: family,
      observations: grid,
    });
    const binding = validateDs4PowertrainDemandResearchInputBinding(input);
    expect(binding.ok).toBe(false);
    if (!binding.ok) {
      expect(binding.reasonCodes).toContain('RPM_V1A_EXTRA_MULTICHANNEL_LABEL');
    }
  });

  it('RPM value mismatch fails closed', () => {
    const input = buildBoundPowertrainInput({ multichannelObservations: positiveKickdownGrid() });
    const grid = input.multichannelObservations.map((r) => ({ ...r }));
    grid[2] = { ...grid[2]!, rpm: (grid[2]!.rpm as number) + 500 };
    input.multichannelObservations = grid;
    const family = resolveTelemetrySourceFamily(input.dimoVehicleRawJson) ?? 'UNKNOWN';
    input.multichannelFingerprint = computeMultichannelContentFingerprint({
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      tripId: input.tripId,
      providerSourceLinkId: input.providerSourceLinkId,
      telemetrySourceFamily: family,
      observations: grid,
    });
    const binding = validateDs4PowertrainDemandResearchInputBinding(input);
    expect(binding.ok).toBe(false);
    if (!binding.ok) {
      expect(binding.reasonCodes).toContain('RPM_V1A_VALUE_MISMATCH');
    }
  });

  it('V1A conflicting duplicate epoch fails closed', () => {
    const input = bound();
    input.tripInput.rpmPoints = [
      ...input.tripInput.rpmPoints.slice(0, 3),
      { recordedAtIso: input.tripInput.rpmPoints[2]!.recordedAtIso, valueRpm: 9999 },
    ];
    const canon = canonicalizeMultichannelObservations(input.multichannelObservations);
    const verdict = verifyMultichannelRpmParityWithV1a({
      buckets: canon.buckets,
      rpmPoints: input.tripInput.rpmPoints,
    });
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.reason).toBe('V1A_RPM_DUPLICATE_CONFLICT');
  });

  it('cross-trip row identity fails closed', () => {
    const grid = positiveKickdownGrid().map((r, i) =>
      i === 0 ? { ...r, tripId: 'other-trip' } : r,
    );
    const input = buildBoundPowertrainInput({ multichannelObservations: grid });
    const binding = validateDs4PowertrainDemandResearchInputBinding(input);
    expect(binding.ok).toBe(false);
    if (!binding.ok) expect(binding.reasonCodes).toContain('MIXED_SOURCE_OBSERVATION');
  });

  it('mixed provider source link fails closed', () => {
    const grid = positiveKickdownGrid().map((r, i) =>
      i === 0 ? { ...r, providerSourceLinkId: 'other-link' } : r,
    );
    const input = buildBoundPowertrainInput({ multichannelObservations: grid });
    const binding = validateDs4PowertrainDemandResearchInputBinding(input);
    expect(binding.ok).toBe(false);
    if (!binding.ok) expect(binding.reasonCodes).toContain('MIXED_SOURCE_OBSERVATION');
  });

  it('forged independentFieldValidation fails closed', () => {
    const input = bound({ evidenceOrigin: 'OFFLINE_SEALED_BUNDLE' });
    const family = resolveTelemetrySourceFamily(input.dimoVehicleRawJson) ?? 'UNKNOWN';
  const fp = computeMultichannelContentFingerprint({
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      tripId: input.tripId,
      providerSourceLinkId: input.providerSourceLinkId,
      telemetrySourceFamily: family,
      observations: input.multichannelObservations,
    });
    input.multichannelManifest = {
      manifestVersion: DS4_MULTICHANNEL_MANIFEST_VERSION,
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      tripId: input.tripId,
      providerSourceLinkId: input.providerSourceLinkId,
      telemetrySourceFamily: family,
      r1SnapshotVersion: null,
      channels: [],
      expectedMultichannelFingerprint: fp,
      independentFieldValidation: true,
    };
    const binding = validateDs4PowertrainDemandResearchInputBinding(input);
    expect(binding.ok).toBe(false);
    if (!binding.ok) {
      expect(binding.reasonCodes).toContain('FORGED_INDEPENDENT_ATTESTATION');
      expect(binding.reasonCodes).toContain('OFFLINE_SOURCE_ATTESTATION_NOT_VERIFIED');
    }
  });

  it('matching self-generated forged hash still lacks attestation', () => {
    const input = bound({ evidenceOrigin: 'OFFLINE_SEALED_BUNDLE' });
    const out = computeDs4PowertrainDemandResearchV1(input);
    expect(out.status).toBe('ABSTAINED');
    expect(out.abstainReasons).toContain('OFFLINE_SOURCE_ATTESTATION_NOT_VERIFIED');
    expect(out.provenance.sourceProvenanceVerified).toBe(false);
  });

  it('invalid throttle >100 fails closed', () => {
    const grid = positiveKickdownGrid().map((r, i) => (i === 2 ? { ...r, throttlePct: 150 } : r));
    const input = buildBoundPowertrainInput({ multichannelObservations: grid });
    const family = resolveTelemetrySourceFamily(input.dimoVehicleRawJson) ?? 'UNKNOWN';
    input.multichannelFingerprint = computeMultichannelContentFingerprint({
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      tripId: input.tripId,
      providerSourceLinkId: input.providerSourceLinkId,
      telemetrySourceFamily: family,
      observations: grid,
    });
    const binding = validateDs4PowertrainDemandResearchInputBinding(input);
    expect(binding.ok).toBe(false);
    if (!binding.ok) expect(binding.reasonCodes).toContain('INVALID_SIGNAL_DOMAIN');
  });

  it('negative speed fails closed', () => {
    const grid = positiveKickdownGrid().map((r, i) => (i === 1 ? { ...r, speedKmh: -1 } : r));
    const input = buildBoundPowertrainInput({ multichannelObservations: grid });
    const family = resolveTelemetrySourceFamily(input.dimoVehicleRawJson) ?? 'UNKNOWN';
    input.multichannelFingerprint = computeMultichannelContentFingerprint({
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      tripId: input.tripId,
      providerSourceLinkId: input.providerSourceLinkId,
      telemetrySourceFamily: family,
      observations: grid,
    });
    const binding = validateDs4PowertrainDemandResearchInputBinding(input);
    expect(binding.ok).toBe(false);
    if (!binding.ok) expect(binding.reasonCodes).toContain('INVALID_SIGNAL_DOMAIN');
  });

  it('NaN throttle fails closed', () => {
    const grid = positiveKickdownGrid().map((r, i) => (i === 1 ? { ...r, throttlePct: Number.NaN } : r));
    const input = buildBoundPowertrainInput({ multichannelObservations: grid });
    const family = resolveTelemetrySourceFamily(input.dimoVehicleRawJson) ?? 'UNKNOWN';
    input.multichannelFingerprint = computeMultichannelContentFingerprint({
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      tripId: input.tripId,
      providerSourceLinkId: input.providerSourceLinkId,
      telemetrySourceFamily: family,
      observations: grid,
    });
    const binding = validateDs4PowertrainDemandResearchInputBinding(input);
    expect(binding.ok).toBe(false);
    if (!binding.ok) expect(binding.reasonCodes).toContain('INVALID_SIGNAL_DOMAIN');
  });

  it('manifest R1 snapshot mismatch fails closed', () => {
    const input = bound({ evidenceOrigin: 'OFFLINE_SEALED_BUNDLE', dimoVehicleRawJson: R1_DIMO });
    const family = resolveTelemetrySourceFamily(input.dimoVehicleRawJson) ?? 'UNKNOWN';
    const fp = computeMultichannelContentFingerprint({
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      tripId: input.tripId,
      providerSourceLinkId: input.providerSourceLinkId,
      telemetrySourceFamily: family,
      observations: input.multichannelObservations,
    });
    input.multichannelManifest = {
      manifestVersion: DS4_MULTICHANNEL_MANIFEST_VERSION,
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      tripId: input.tripId,
      providerSourceLinkId: input.providerSourceLinkId,
      telemetrySourceFamily: family,
      r1SnapshotVersion: 'WRONG_SNAPSHOT',
      channels: [],
      expectedMultichannelFingerprint: fp,
      independentFieldValidation: false,
    };
    const binding = validateDs4PowertrainDemandResearchInputBinding(input);
    expect(binding.ok).toBe(false);
    if (!binding.ok) expect(binding.reasonCodes).toContain('MANIFEST_R1_SNAPSHOT_MISMATCH');
  });

  it('manifest source family mismatch fails closed', () => {
    const input = bound({ evidenceOrigin: 'OFFLINE_SEALED_BUNDLE' });
    const family = resolveTelemetrySourceFamily(input.dimoVehicleRawJson) ?? 'UNKNOWN';
    const fp = computeMultichannelContentFingerprint({
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      tripId: input.tripId,
      providerSourceLinkId: input.providerSourceLinkId,
      telemetrySourceFamily: family,
      observations: input.multichannelObservations,
    });
    input.multichannelManifest = {
      manifestVersion: DS4_MULTICHANNEL_MANIFEST_VERSION,
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      tripId: input.tripId,
      providerSourceLinkId: input.providerSourceLinkId,
      telemetrySourceFamily: 'RUPTELA_R1',
      r1SnapshotVersion: null,
      channels: [],
      expectedMultichannelFingerprint: fp,
      independentFieldValidation: false,
    };
    const binding = validateDs4PowertrainDemandResearchInputBinding(input);
    expect(binding.ok).toBe(false);
    if (!binding.ok) expect(binding.reasonCodes).toContain('MANIFEST_SOURCE_FAMILY_MISMATCH');
  });

  it('out-of-trip-window bucket fails closed', () => {
    const grid = [...positiveKickdownGrid()];
    grid.push({
      recordedAtIso: '2099-01-01T00:00:00.000Z',
      throttlePct: 40,
      rpm: 2000,
      speedKmh: 50,
      loadPct: 50,
    });
    const input = buildBoundPowertrainInput({ multichannelObservations: grid });
    const family = resolveTelemetrySourceFamily(input.dimoVehicleRawJson) ?? 'UNKNOWN';
    input.multichannelFingerprint = computeMultichannelContentFingerprint({
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      tripId: input.tripId,
      providerSourceLinkId: input.providerSourceLinkId,
      telemetrySourceFamily: family,
      observations: grid,
    });
    const binding = validateDs4PowertrainDemandResearchInputBinding(input);
    expect(binding.ok).toBe(false);
    if (!binding.ok) expect(binding.reasonCodes).toContain('MULTICHANNEL_OUT_OF_TRIP_WINDOW');
  });

  it('correct R1 manifest snapshot constant is accepted only with offline attestation gap', () => {
    expect(DI_V0_R1_OBD_EVIDENCE_SNAPSHOT_V0_3).toContain('DI_V0');
    const input = bound({ evidenceOrigin: 'OFFLINE_SEALED_BUNDLE', dimoVehicleRawJson: R1_DIMO });
    const out = computeDs4PowertrainDemandResearchV1(input);
    expect(out.abstainReasons).toContain('OFFLINE_SOURCE_ATTESTATION_NOT_VERIFIED');
  });
});
