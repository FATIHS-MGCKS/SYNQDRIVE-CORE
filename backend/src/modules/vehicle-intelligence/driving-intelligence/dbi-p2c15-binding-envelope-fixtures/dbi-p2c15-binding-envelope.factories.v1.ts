import { resolveTelemetrySourceFamily } from '../../telemetry-source-family';
import { computeDs4RpmHfV1bTierAwareInputFingerprint } from '../rpm-hf-v1b/ds4-rpm-hf-v1b-input-fingerprint';
import type { Ds4PowertrainDemandResearchInputV1 } from '../ds4-powertrain-demand-research/ds4-powertrain-demand-research.contract.v1';
import type { Ds4RpmEpisodeResearchInputV1 } from '../ds4-rpm-episode-research/ds4-rpm-episode-research.contract.v1';
import { computeMultichannelContentFingerprint } from '../ds4-powertrain-demand-research/ds4-powertrain-demand-research.input-binding.v1';
import type {
  DbiP2c15ScenarioIdV1,
  DbiP2c15SyntheticIdentityEnvelopeV1,
} from './dbi-p2c15-binding-envelope.types.v1';

export function envelopeFromPowertrainInput(
  scenarioId: DbiP2c15ScenarioIdV1,
  input: Ds4PowertrainDemandResearchInputV1,
): DbiP2c15SyntheticIdentityEnvelopeV1 {
  const family = resolveTelemetrySourceFamily(input.dimoVehicleRawJson) ?? 'UNKNOWN';
  return {
    contractVersion: 'dbi-p2c15-binding-envelope-v1',
    scenarioId,
    evidenceOrigin: input.evidenceOrigin,
    sourceBundleId: input.sourceBundleId,
    organizationId: input.organizationId,
    vehicleId: input.vehicleId,
    tripId: input.tripId,
    providerSourceLinkId: input.providerSourceLinkId,
    telemetrySourceFamily: family,
    v1bInputFingerprint: input.v1bResult?.inputFingerprint ?? null,
    multichannelFingerprint: input.multichannelFingerprint,
    sourceProvenanceVerified: false,
  };
}

export function envelopeFromA1Input(
  scenarioId: DbiP2c15ScenarioIdV1,
  input: Ds4RpmEpisodeResearchInputV1,
): DbiP2c15SyntheticIdentityEnvelopeV1 {
  const family = resolveTelemetrySourceFamily(input.dimoVehicleRawJson) ?? 'UNKNOWN';
  return {
    contractVersion: 'dbi-p2c15-binding-envelope-v1',
    scenarioId,
    evidenceOrigin: input.evidenceOrigin,
    sourceBundleId: input.sourceBundleId,
    organizationId: input.organizationId,
    vehicleId: input.vehicleId,
    tripId: input.tripId,
    providerSourceLinkId: input.providerSourceLinkId,
    telemetrySourceFamily: family,
    v1bInputFingerprint: input.v1bResult?.inputFingerprint ?? null,
    multichannelFingerprint: null,
    sourceProvenanceVerified: false,
  };
}

export function assertEnvelopeFingerprintsDeriveFromData(
  input: Ds4PowertrainDemandResearchInputV1,
): void {
  if (input.v1bResult != null) {
    const expectedV1b = computeDs4RpmHfV1bTierAwareInputFingerprint(input.tripInput);
    const actualV1b = input.v1bResult.inputFingerprint ?? '';
    if (actualV1b !== expectedV1b) {
      throw new Error('envelope v1b fingerprint must match tier-aware recompute unless scenario applies tamper');
    }
  }
  const family = resolveTelemetrySourceFamily(input.dimoVehicleRawJson) ?? 'UNKNOWN';
  const expectedMc = computeMultichannelContentFingerprint({
    organizationId: input.organizationId,
    vehicleId: input.vehicleId,
    tripId: input.tripId,
    providerSourceLinkId: input.providerSourceLinkId,
    telemetrySourceFamily: family,
    observations: input.multichannelObservations,
  });
  if (input.multichannelFingerprint !== expectedMc) {
    throw new Error('envelope multichannel fingerprint must match canonical grid unless scenario applies tamper');
  }
}

export function recomputeMultichannelFingerprintForInput(
  input: Ds4PowertrainDemandResearchInputV1,
): string {
  const family = resolveTelemetrySourceFamily(input.dimoVehicleRawJson) ?? 'UNKNOWN';
  return computeMultichannelContentFingerprint({
    organizationId: input.organizationId,
    vehicleId: input.vehicleId,
    tripId: input.tripId,
    providerSourceLinkId: input.providerSourceLinkId,
    telemetrySourceFamily: family,
    observations: input.multichannelObservations,
  });
}
