import type { Ds4PowertrainDemandBindingAbstainReason } from '../ds4-powertrain-demand-research/ds4-powertrain-demand-research.contract.v1';
import type { Ds4RpmEpisodeResearchBindingAbstainReason } from '../ds4-rpm-episode-research/ds4-rpm-episode-research.contract.v1';
import type { DbiP2c15ScenarioIdV1 } from './dbi-p2c15-binding-envelope.types.v1';

/** Pinned expectations — not derived from live validator output at package build time. */
export type DbiP2c15IndependentExpectationV1 =
  | {
      readonly kind: 'POWERTRAIN_BINDING';
      readonly bindingOk: boolean;
      readonly requiredAbstainReasons: readonly Ds4PowertrainDemandBindingAbstainReason[];
      readonly allowAdditionalAbstainReasons?: boolean;
    }
  | {
      readonly kind: 'A1_BINDING';
      readonly bindingOk: boolean;
      readonly requiredAbstainReasons: readonly Ds4RpmEpisodeResearchBindingAbstainReason[];
      readonly allowAdditionalAbstainReasons?: boolean;
    }
  | {
      readonly kind: 'MODULE_KERNEL';
      readonly researchModule: 'B1' | 'B2' | 'B3' | 'B4' | 'A1';
      readonly expectedStatus: string;
      readonly requiredAbstainReasons?: readonly Ds4PowertrainDemandBindingAbstainReason[];
      readonly requiredSemanticGuards?: Readonly<Record<string, boolean>>;
    }
  | {
      readonly kind: 'CANONICAL_INVARIANCE';
      readonly multichannelFingerprintsMustMatch: true;
      readonly canonicalBucketCountMustMatch: true;
      readonly kickdownKernelStatusMustMatch: true;
    };

const BINDING_FAIL_ALLOW_EXTRA = true as const;

export const DBI_P2C15_PINNED_EXPECTATIONS: Record<
  DbiP2c15ScenarioIdV1,
  DbiP2c15IndependentExpectationV1
> = {
  S01_VALID_ICE_BASELINE: {
    kind: 'POWERTRAIN_BINDING',
    bindingOk: true,
    requiredAbstainReasons: [],
  },
  S02_DIFFERENT_ORGANIZATION: {
    kind: 'POWERTRAIN_BINDING',
    bindingOk: false,
    requiredAbstainReasons: ['ORGANIZATION_ID_MISMATCH'],
    allowAdditionalAbstainReasons: BINDING_FAIL_ALLOW_EXTRA,
  },
  S03_DIFFERENT_VEHICLE: {
    kind: 'POWERTRAIN_BINDING',
    bindingOk: false,
    requiredAbstainReasons: ['VEHICLE_ID_MISMATCH'],
    allowAdditionalAbstainReasons: BINDING_FAIL_ALLOW_EXTRA,
  },
  S04_DIFFERENT_TRIP: {
    kind: 'POWERTRAIN_BINDING',
    bindingOk: false,
    requiredAbstainReasons: ['TRIP_ID_MISMATCH'],
    allowAdditionalAbstainReasons: BINDING_FAIL_ALLOW_EXTRA,
  },
  S05_DIFFERENT_SOURCE_LINK: {
    kind: 'POWERTRAIN_BINDING',
    bindingOk: false,
    requiredAbstainReasons: ['PROVIDER_SOURCE_LINK_MISMATCH'],
    allowAdditionalAbstainReasons: BINDING_FAIL_ALLOW_EXTRA,
  },
  S06_V1B_FINGERPRINT_TAMPER: {
    kind: 'POWERTRAIN_BINDING',
    bindingOk: false,
    requiredAbstainReasons: ['V1B_INPUT_FINGERPRINT_MISMATCH'],
    allowAdditionalAbstainReasons: BINDING_FAIL_ALLOW_EXTRA,
  },
  S07_MULTICHANNEL_FINGERPRINT_TAMPER: {
    kind: 'POWERTRAIN_BINDING',
    bindingOk: false,
    requiredAbstainReasons: ['MULTICHANNEL_FINGERPRINT_MISMATCH'],
    allowAdditionalAbstainReasons: BINDING_FAIL_ALLOW_EXTRA,
  },
  S08_CONFLICTING_DUPLICATE_LABEL: {
    kind: 'POWERTRAIN_BINDING',
    bindingOk: false,
    requiredAbstainReasons: ['CONFLICTING_DUPLICATE_BUCKETS'],
    allowAdditionalAbstainReasons: BINDING_FAIL_ALLOW_EXTRA,
  },
  S09_MISSING_REQUIRED_CHANNELS: {
    kind: 'MODULE_KERNEL',
    researchModule: 'B2',
    expectedStatus: 'NOT_OBSERVED',
  },
  S10_INSUFFICIENT_OBSERVATIONS: {
    kind: 'POWERTRAIN_BINDING',
    bindingOk: false,
    requiredAbstainReasons: ['NO_MOVING_OPPORTUNITY_EVIDENCE', 'INSUFFICIENT_ELIGIBLE_OBSERVATIONS'],
    allowAdditionalAbstainReasons: BINDING_FAIL_ALLOW_EXTRA,
  },
  S11_B3_SOLE_INSUFFICIENT_LOAD: {
    kind: 'MODULE_KERNEL',
    researchModule: 'B3',
    expectedStatus: 'ABSTAINED',
    requiredAbstainReasons: ['INSUFFICIENT_LOAD_LABEL_OBSERVATIONS'],
  },
  S12_B4_ZERO_ASSESSABLE_FACETS: {
    kind: 'MODULE_KERNEL',
    researchModule: 'B4',
    expectedStatus: 'COMPUTED',
  },
  S13_POWERTRAIN_BEV_FAIL_CLOSED: {
    kind: 'POWERTRAIN_BINDING',
    bindingOk: false,
    requiredAbstainReasons: ['POWERTRAIN_NOT_APPLICABLE'],
    allowAdditionalAbstainReasons: BINDING_FAIL_ALLOW_EXTRA,
  },
  S13_POWERTRAIN_UNKNOWN_FAIL_CLOSED: {
    kind: 'MODULE_KERNEL',
    researchModule: 'B3',
    expectedStatus: 'ABSTAINED',
    requiredAbstainReasons: ['ICE_OPERATION_NOT_CONFIRMED'],
  },
  S13_POWERTRAIN_CONTRADICTORY_FAIL_CLOSED: {
    kind: 'POWERTRAIN_BINDING',
    bindingOk: false,
    requiredAbstainReasons: ['POWERTRAIN_NOT_APPLICABLE'],
    allowAdditionalAbstainReasons: BINDING_FAIL_ALLOW_EXTRA,
  },
  S14_A1_DESCRIPTIVE_ONLY: {
    kind: 'MODULE_KERNEL',
    researchModule: 'A1',
    expectedStatus: 'COMPUTED',
    requiredSemanticGuards: {
      notEvidenceCandidate: true,
      labelsNotForCrossDomainJoin: true,
    },
  },
  S15_OFFLINE_UNATTESTED_NEGATIVE: {
    kind: 'POWERTRAIN_BINDING',
    bindingOk: false,
    requiredAbstainReasons: [
      'OFFLINE_SOURCE_ATTESTATION_NOT_VERIFIED',
      'MULTICHANNEL_MANIFEST_MISSING',
    ],
    allowAdditionalAbstainReasons: BINDING_FAIL_ALLOW_EXTRA,
  },
  S16_CANONICAL_ORDER_INVARIANCE: {
    kind: 'CANONICAL_INVARIANCE',
    multichannelFingerprintsMustMatch: true,
    canonicalBucketCountMustMatch: true,
    kickdownKernelStatusMustMatch: true,
  },
};
