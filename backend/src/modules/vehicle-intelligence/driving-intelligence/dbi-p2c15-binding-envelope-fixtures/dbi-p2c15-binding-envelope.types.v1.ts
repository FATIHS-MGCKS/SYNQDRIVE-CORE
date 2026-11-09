import type { Ds4PowertrainDemandBindingAbstainReason } from '../ds4-powertrain-demand-research/ds4-powertrain-demand-research.contract.v1';
import type { Ds4RpmEpisodeResearchBindingAbstainReason } from '../ds4-rpm-episode-research/ds4-rpm-episode-research.contract.v1';

/** Frozen P2-C1.5 scenario identifiers (offline reconciliation preflight only). */
export type DbiP2c15ScenarioIdV1 =
  | 'S01_VALID_ICE_BASELINE'
  | 'S02_DIFFERENT_ORGANIZATION'
  | 'S03_DIFFERENT_VEHICLE'
  | 'S04_DIFFERENT_TRIP'
  | 'S05_DIFFERENT_SOURCE_LINK'
  | 'S06_V1B_FINGERPRINT_TAMPER'
  | 'S07_MULTICHANNEL_FINGERPRINT_TAMPER'
  | 'S08_CONFLICTING_DUPLICATE_LABEL'
  | 'S09_MISSING_REQUIRED_CHANNELS'
  | 'S10_INSUFFICIENT_OBSERVATIONS'
  | 'S11_B3_SOLE_INSUFFICIENT_LOAD'
  | 'S12_B4_ZERO_ASSESSABLE_FACETS'
  | 'S13_POWERTRAIN_FAIL_CLOSED'
  | 'S14_A1_DESCRIPTIVE_ONLY'
  | 'S15_OFFLINE_UNATTESTED_NEGATIVE'
  | 'S16_CANONICAL_ORDER_INVARIANCE';

export type DbiP2c15SyntheticIdentityEnvelopeV1 = {
  readonly contractVersion: 'dbi-p2c15-binding-envelope-v1';
  readonly scenarioId: DbiP2c15ScenarioIdV1;
  readonly evidenceOrigin: 'SYNTHETIC_FIXTURE' | 'OFFLINE_SEALED_BUNDLE';
  readonly sourceBundleId: string | null;
  readonly organizationId: string;
  readonly vehicleId: string;
  readonly tripId: string;
  readonly providerSourceLinkId: string;
  readonly telemetrySourceFamily: string;
  readonly v1bInputFingerprint: string | null;
  readonly multichannelFingerprint: string | null;
  /** Always false for P2-C1.5 — synthetic fixtures must not claim attestation. */
  readonly sourceProvenanceVerified: false;
};

export type DbiP2c15BindingExpectationV1 =
  | {
      readonly kind: 'POWERTRAIN_BINDING';
      readonly bindingOk: boolean;
      readonly abstainReasons?: readonly Ds4PowertrainDemandBindingAbstainReason[];
    }
  | {
      readonly kind: 'A1_BINDING';
      readonly bindingOk: boolean;
      readonly abstainReasons?: readonly Ds4RpmEpisodeResearchBindingAbstainReason[];
    }
  | {
      readonly kind: 'CANONICAL_INVARIANCE';
      readonly fingerprintsMatchForwardAndReversed: true;
    };

export type DbiP2c15ScenarioPackageV1 = {
  readonly scenarioId: DbiP2c15ScenarioIdV1;
  readonly envelope: DbiP2c15SyntheticIdentityEnvelopeV1;
  readonly expectation: DbiP2c15BindingExpectationV1;
  readonly scientificNotes: readonly string[];
};
