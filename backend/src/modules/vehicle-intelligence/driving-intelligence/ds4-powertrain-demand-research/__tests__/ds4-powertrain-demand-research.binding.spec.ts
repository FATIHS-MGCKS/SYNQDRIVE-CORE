import { computeDs4PowertrainDemandResearchV1 } from '../ds4-powertrain-demand-research.kernel.v1';
import {
  buildBoundPowertrainInput,
  positiveKickdownGrid,
} from './ds4-powertrain-demand-research.test-helpers';
import { computeMultichannelContentFingerprint } from '../ds4-powertrain-demand-research.input-binding.v1';
import { resolveTelemetrySourceFamily } from '../../../telemetry-source-family';

describe('ds4-powertrain-demand-research binding', () => {
  it('multichannel fingerprint mismatch abstains', () => {
    const input = buildBoundPowertrainInput({ multichannelObservations: positiveKickdownGrid() });
    input.multichannelFingerprint = 'deadbeef';
    const out = computeDs4PowertrainDemandResearchV1(input);
    expect(out.abstainReasons).toContain('MULTICHANNEL_FINGERPRINT_MISMATCH');
  });

  it('V1B fingerprint mismatch abstains', () => {
    const input = buildBoundPowertrainInput({ multichannelObservations: positiveKickdownGrid() });
    input.v1bResult!.inputFingerprint = 'deadbeef';
    const out = computeDs4PowertrainDemandResearchV1(input);
    expect(out.abstainReasons).toContain('V1B_INPUT_FINGERPRINT_MISMATCH');
  });

  it('insufficient observations abstains', () => {
    const input = buildBoundPowertrainInput({ multichannelObservations: positiveKickdownGrid() });
    input.multichannelObservations = input.multichannelObservations.slice(0, 5);
    const family = resolveTelemetrySourceFamily(input.dimoVehicleRawJson) ?? 'UNKNOWN';
    input.multichannelFingerprint = computeMultichannelContentFingerprint({
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      tripId: input.tripId,
      providerSourceLinkId: input.providerSourceLinkId,
      telemetrySourceFamily: family,
      observations: input.multichannelObservations,
    });
    const out = computeDs4PowertrainDemandResearchV1(input);
    expect(out.abstainReasons).toContain('INSUFFICIENT_ELIGIBLE_OBSERVATIONS');
  });

  it('tampered manifest abstains', () => {
    const input = buildBoundPowertrainInput({
      multichannelObservations: positiveKickdownGrid(),
      evidenceOrigin: 'OFFLINE_SEALED_BUNDLE',
    });
    const family = resolveTelemetrySourceFamily(input.dimoVehicleRawJson) ?? 'UNKNOWN';
    const expected = computeMultichannelContentFingerprint({
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      tripId: input.tripId,
      providerSourceLinkId: input.providerSourceLinkId,
      telemetrySourceFamily: family,
      observations: input.multichannelObservations,
    });
    input.multichannelManifest = {
      manifestVersion: 'test-v1',
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      tripId: input.tripId,
      providerSourceLinkId: input.providerSourceLinkId,
      telemetrySourceFamily: family,
      r1SnapshotVersion: null,
      channels: [],
      expectedMultichannelFingerprint: expected,
      independentFieldValidation: false,
    };
    input.multichannelFingerprint = 'tampered';
    const out = computeDs4PowertrainDemandResearchV1(input);
    expect(out.abstainReasons).toContain('MULTICHANNEL_FINGERPRINT_MISMATCH');
  });
});
