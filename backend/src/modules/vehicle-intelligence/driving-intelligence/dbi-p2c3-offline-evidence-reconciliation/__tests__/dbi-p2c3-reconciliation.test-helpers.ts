import { buildDbiP2c15ScenarioPackage } from '../../dbi-p2c15-binding-envelope-fixtures/dbi-p2c15-binding-envelope.scenarios.v1';
import {
  DBI_P2C15_LINK_ALT,
  DBI_P2C15_LINK_BASELINE,
  DBI_P2C15_ORG_ALT,
  DBI_P2C15_ORG_BASELINE,
  DBI_P2C15_TRIP_ALT,
  DBI_P2C15_TRIP_BASELINE,
  DBI_P2C15_VEHICLE_ALT,
  DBI_P2C15_VEHICLE_BASELINE,
} from '../../dbi-p2c15-binding-envelope-fixtures/dbi-p2c15-binding-envelope.identity.v1';
import {
  buildBoundPowertrainInput,
  buildColdEngineBoundInput,
  buildObservationSeries,
  coldEctGrid,
} from '../../ds4-powertrain-demand-research/__tests__/ds4-powertrain-demand-research.test-helpers';
import { computeDs4PowertrainDemandColdEngineResearchV1 } from '../../ds4-powertrain-demand-research/ds4-powertrain-demand-cold-engine.kernel.v1';
import { computeDs4PowertrainDemandResearchV1 } from '../../ds4-powertrain-demand-research/ds4-powertrain-demand-research.kernel.v1';
import { computeDs4PowertrainDemandRevvingIdleResearchV1 } from '../../ds4-powertrain-demand-research/ds4-powertrain-demand-revving-idle.kernel.v1';
import { computeDs4PowertrainDemandSustainedLoadResearchV1 } from '../../ds4-powertrain-demand-research/ds4-powertrain-demand-sustained-load.kernel.v1';
import { computeDs4RpmEpisodeResearchV1 } from '../../ds4-rpm-episode-research/ds4-rpm-episode-research.kernel.v1';
import {
  DBI_P2C2_EVIDENCE_ADAPTER_CONTRACT_VERSION,
  type DbiP2c2OfflineEvidenceBundleV1,
  type DbiP2c2PowertrainProxyCandidatesPlaneV1,
  type DbiP2c2ProxyCandidateEnvelopeV1,
} from '../../dbi-p2c2-offline-evidence-adapters/dbi-p2c2-evidence-adapter.contract.v1';
import { adaptDs4RpmEpisodeResearchToP2c2Evidence } from '../../dbi-p2c2-offline-evidence-adapters/dbi-p2c2-a1-evidence-adapter.v1';
import { adaptDs4KickdownResearchToP2c2Evidence } from '../../dbi-p2c2-offline-evidence-adapters/dbi-p2c2-b1-evidence-adapter.v1';
import { adaptDs4ColdEngineResearchToP2c2Evidence } from '../../dbi-p2c2-offline-evidence-adapters/dbi-p2c2-b2-evidence-adapter.v1';
import { adaptDs4SustainedLoadResearchToP2c2Evidence } from '../../dbi-p2c2-offline-evidence-adapters/dbi-p2c2-b3-evidence-adapter.v1';
import { adaptDs4RevvingIdleResearchToP2c2Evidence } from '../../dbi-p2c2-offline-evidence-adapters/dbi-p2c2-b4-evidence-adapter.v1';

export {
  DBI_P2C15_ORG_ALT,
  DBI_P2C15_ORG_BASELINE,
  DBI_P2C15_TRIP_ALT,
  DBI_P2C15_TRIP_BASELINE,
  DBI_P2C15_VEHICLE_ALT,
  DBI_P2C15_VEHICLE_BASELINE,
  DBI_P2C15_LINK_ALT,
  DBI_P2C15_LINK_BASELINE,
};

export function assembleP2c2Bundle(input: {
  readonly descriptive: DbiP2c2OfflineEvidenceBundleV1['descriptive'];
  readonly powertrainProxies: readonly DbiP2c2PowertrainProxyCandidatesPlaneV1[];
}): DbiP2c2OfflineEvidenceBundleV1 {
  return {
    contractVersion: DBI_P2C2_EVIDENCE_ADAPTER_CONTRACT_VERSION,
    descriptive: input.descriptive,
    powertrainProxies: [...input.powertrainProxies],
  };
}

export function adaptKickdownPlaneFromScenario(
  scenarioId: 'S01_VALID_ICE_BASELINE' | 'S10_INSUFFICIENT_OBSERVATIONS' = 'S01_VALID_ICE_BASELINE',
): DbiP2c2PowertrainProxyCandidatesPlaneV1 {
  const pack = buildDbiP2c15ScenarioPackage(scenarioId);
  if (pack.payload.kind !== 'POWERTRAIN_INPUT') throw new Error('expected powertrain scenario');
  const kernel = computeDs4PowertrainDemandResearchV1(pack.payload.input);
  const out = adaptDs4KickdownResearchToP2c2Evidence(kernel);
  if (!out.ok) throw new Error(`kickdown adapter failed: ${out.diagnosticCodes.join(',')}`);
  return out.plane;
}

export function adaptColdEnginePlaneFromS09(): DbiP2c2PowertrainProxyCandidatesPlaneV1 {
  const pack = buildDbiP2c15ScenarioPackage('S09_MISSING_REQUIRED_CHANNELS');
  if (pack.payload.kind !== 'MODULE_B2_INPUT') throw new Error('expected B2');
  const kernel = computeDs4PowertrainDemandColdEngineResearchV1(pack.payload.input);
  const out = adaptDs4ColdEngineResearchToP2c2Evidence(kernel);
  if (!out.ok) throw new Error(`B2 adapter failed: ${out.diagnosticCodes.join(',')}`);
  return out.plane;
}

export function adaptColdEnginePositiveCandidatePlane(): DbiP2c2PowertrainProxyCandidatesPlaneV1 {
  const grid = coldEctGrid(12, (i) => {
    if (i >= 2 && i <= 4) {
      return { loadPct: 88, rpm: null, throttlePct: 40 };
    }
    return { loadPct: 12, rpm: null };
  });
  const kernel = computeDs4PowertrainDemandColdEngineResearchV1(
    buildColdEngineBoundInput({
      multichannelObservations: grid,
      tripId: DBI_P2C15_TRIP_BASELINE,
      linkId: DBI_P2C15_LINK_BASELINE,
    }),
  );
  const out = adaptDs4ColdEngineResearchToP2c2Evidence(kernel);
  if (!out.ok) throw new Error(`B2 adapter failed: ${out.diagnosticCodes.join(',')}`);
  if (out.plane.candidates.length === 0) throw new Error('expected B2 positive candidate');
  return out.plane;
}

export type MutableProxyPlane = {
  evidencePlane: 'POWERTRAIN_PROXY_CANDIDATES';
  participant: DbiP2c2PowertrainProxyCandidatesPlaneV1['participant'];
  candidates: DbiP2c2ProxyCandidateEnvelopeV1[];
};

export function cloneMutablePlane(plane: DbiP2c2PowertrainProxyCandidatesPlaneV1): MutableProxyPlane {
  return structuredClone(plane) as MutableProxyPlane;
}

export function adaptRevvingIdleB4FacetAPlaneFromS01(): DbiP2c2PowertrainProxyCandidatesPlaneV1 {
  const v1bPrefix = buildObservationSeries('2026-01-01T10:00:01.000Z', 8, 1, () => ({
    rpm: 850,
    speedKmh: 2,
    throttlePct: 8,
    loadPct: 12,
  }));
  const facetARev = buildObservationSeries('2026-01-01T10:00:12.000Z', 4, 1, (i) => ({
    speedKmh: 0,
    rpm: 2000 + i * 50,
  }));
  const kernel = computeDs4PowertrainDemandRevvingIdleResearchV1(
    buildBoundPowertrainInput({
      multichannelObservations: [...v1bPrefix, ...facetARev],
      tripId: DBI_P2C15_TRIP_BASELINE,
      linkId: DBI_P2C15_LINK_BASELINE,
    }),
  );
  const out = adaptDs4RevvingIdleResearchToP2c2Evidence(kernel);
  if (!out.ok) throw new Error(`B4 facet A adapter failed: ${out.diagnosticCodes.join(',')}`);
  if (
    !out.plane.candidates.some(
      (c) => c.sourceModule === 'P2-B4' && c.facet === 'HIGH_RPM_STATIONARY_LIKE_PROXY',
    )
  ) {
    throw new Error('expected B4 facet A candidate');
  }
  return out.plane;
}

export function adaptRevvingIdleB4FacetBPlaneFromS01(): DbiP2c2PowertrainProxyCandidatesPlaneV1 {
  const v1bPrefix = buildObservationSeries('2026-01-01T10:00:01.000Z', 8, 1, () => ({
    rpm: 850,
    speedKmh: 2,
    throttlePct: 8,
    loadPct: 12,
  }));
  const facetBIdle = buildObservationSeries('2026-01-01T10:00:12.000Z', 201, 1, () => ({
    speedKmh: 0,
    rpm: 850,
  }));
  const kernel = computeDs4PowertrainDemandRevvingIdleResearchV1(
    buildBoundPowertrainInput({
      multichannelObservations: [...v1bPrefix, ...facetBIdle],
      tripId: DBI_P2C15_TRIP_BASELINE,
      linkId: DBI_P2C15_LINK_BASELINE,
    }),
  );
  const out = adaptDs4RevvingIdleResearchToP2c2Evidence(kernel);
  if (!out.ok) throw new Error(`B4 facet B adapter failed: ${out.diagnosticCodes.join(',')}`);
  if (
    !out.plane.candidates.some(
      (c) => c.sourceModule === 'P2-B4' && c.facet === 'EXCESSIVE_STATIONARY_LIKE_SPAN_PROXY',
    )
  ) {
    throw new Error('expected B4 facet B candidate');
  }
  return out.plane;
}

export function adaptRevvingIdleB4DualFacetPlaneFromS01(): DbiP2c2PowertrainProxyCandidatesPlaneV1 {
  const facetA = adaptRevvingIdleB4FacetAPlaneFromS01();
  const facetB = adaptRevvingIdleB4FacetBPlaneFromS01();
  const participantA = facetA.participant;
  const participantB = facetB.participant;
  if (participantA.sourceModule !== 'P2-B4' || participantB.sourceModule !== 'P2-B4') {
    throw new Error('expected B4 participants');
  }
  const classifications = [...facetA.candidates, ...facetB.candidates].map((c) => c.originalClassification);
  const tripStatus =
    participantA.originalKernelStatus === 'COMPUTED' || participantB.originalKernelStatus === 'COMPUTED'
      ? 'COMPUTED'
      : participantA.originalKernelStatus;
  return {
    evidencePlane: 'POWERTRAIN_PROXY_CANDIDATES',
    participant: {
      ...participantA,
      originalKernelStatus: tripStatus,
      facetB: participantB.facetB,
      coverageEvidence: {
        ...participantA.coverageEvidence,
        gridBucketCount: Math.max(
          participantA.coverageEvidence.gridBucketCount,
          participantB.coverageEvidence.gridBucketCount,
        ),
      },
      adapterClaimsPositiveEvidence:
        tripStatus === 'ABSTAINED' || tripStatus === 'NOT_OBSERVED'
          ? false
          : classifications.some((c) => c.endsWith('_PROXY_CANDIDATE')),
    },
    candidates: [...facetA.candidates, ...facetB.candidates],
  };
}

export function adaptSustainedLoadPlaneFromS11(): DbiP2c2PowertrainProxyCandidatesPlaneV1 {
  const pack = buildDbiP2c15ScenarioPackage('S11_B3_SOLE_INSUFFICIENT_LOAD');
  if (pack.payload.kind !== 'MODULE_B3_INPUT') throw new Error('expected B3');
  const kernel = computeDs4PowertrainDemandSustainedLoadResearchV1(pack.payload.input);
  const out = adaptDs4SustainedLoadResearchToP2c2Evidence(kernel);
  if (!out.ok) throw new Error(`B3 adapter failed: ${out.diagnosticCodes.join(',')}`);
  return out.plane;
}

export function adaptRevvingIdlePlaneFromS12(): DbiP2c2PowertrainProxyCandidatesPlaneV1 {
  const pack = buildDbiP2c15ScenarioPackage('S12_B4_ZERO_ASSESSABLE_FACETS');
  if (pack.payload.kind !== 'MODULE_B4_INPUT') throw new Error('expected B4');
  const kernel = computeDs4PowertrainDemandRevvingIdleResearchV1(pack.payload.input);
  const out = adaptDs4RevvingIdleResearchToP2c2Evidence(kernel);
  if (!out.ok) throw new Error(`B4 adapter failed: ${out.diagnosticCodes.join(',')}`);
  return out.plane;
}

export function adaptA1DescriptivePlaneFromS14(): DbiP2c2OfflineEvidenceBundleV1['descriptive'] {
  const pack = buildDbiP2c15ScenarioPackage('S14_A1_DESCRIPTIVE_ONLY');
  if (pack.payload.kind !== 'A1_INPUT') throw new Error('expected A1');
  const kernel = computeDs4RpmEpisodeResearchV1(pack.payload.input);
  const out = adaptDs4RpmEpisodeResearchToP2c2Evidence(kernel);
  if (!out.ok) throw new Error(`A1 adapter failed: ${out.diagnosticCodes.join(',')}`);
  return out.plane;
}

export function withIdentityOverride(
  plane: DbiP2c2PowertrainProxyCandidatesPlaneV1,
  patch: Partial<DbiP2c2PowertrainProxyCandidatesPlaneV1['participant']['identity']>,
): DbiP2c2PowertrainProxyCandidatesPlaneV1 {
  const clone = cloneMutablePlane(plane);
  clone.participant = {
    ...clone.participant,
    identity: { ...clone.participant.identity, ...patch },
  };
  return clone;
}

export function baselineMatchingMultiModuleBundle(): DbiP2c2OfflineEvidenceBundleV1 {
  const b1 = adaptKickdownPlaneFromScenario();
  const b2 = withIdentityOverride(adaptColdEnginePositiveCandidatePlane(), {
    v1bInputFingerprint: b1.participant.identity.v1bInputFingerprint,
    multichannelFingerprint: b1.participant.identity.multichannelFingerprint,
    sourceBundleId: b1.participant.identity.sourceBundleId,
  });
  return assembleP2c2Bundle({ descriptive: null, powertrainProxies: [b1, b2] });
}
