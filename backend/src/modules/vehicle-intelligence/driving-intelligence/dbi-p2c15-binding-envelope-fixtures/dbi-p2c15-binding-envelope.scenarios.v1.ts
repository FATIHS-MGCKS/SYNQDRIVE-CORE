import { validateDs4RpmEpisodeResearchInputBinding } from '../ds4-rpm-episode-research/ds4-rpm-episode-research.input-binding.v1';
import {
  buildBoundResearchInput,
  rpmAtU,
} from '../ds4-rpm-episode-research/__tests__/ds4-rpm-episode-research.test-helpers';
import type { Ds4PowertrainDemandResearchInputV1 } from '../ds4-powertrain-demand-research/ds4-powertrain-demand-research.contract.v1';
import { validateDs4PowertrainDemandResearchInputBinding } from '../ds4-powertrain-demand-research/ds4-powertrain-demand-research.input-binding.v1';
import { canonicalizeMultichannelObservations } from '../ds4-powertrain-demand-research/ds4-powertrain-demand-multichannel-canonicalize.v1';
import {
  buildBoundPowertrainInput,
  buildColdEngineBoundInput,
  buildObservationSeries,
  positiveKickdownGrid,
} from '../ds4-powertrain-demand-research/__tests__/ds4-powertrain-demand-research.test-helpers';
import { buildRpmPointsEverySeconds } from '../rpm-hf-v1b/__tests__/ds4-rpm-hf-v1b-tier-fixtures';
import {
  DBI_P2C15_GRID_START_ISO,
  DBI_P2C15_LINK_ALT,
  DBI_P2C15_LINK_BASELINE,
  DBI_P2C15_ORG_ALT,
  DBI_P2C15_ORG_BASELINE,
  DBI_P2C15_TRIP_ALT,
  DBI_P2C15_TRIP_BASELINE,
  DBI_P2C15_VEHICLE_ALT,
  DBI_P2C15_VEHICLE_BASELINE,
} from './dbi-p2c15-binding-envelope.identity.v1';
import {
  assertEnvelopeFingerprintsDeriveFromData,
  envelopeFromA1Input,
  envelopeFromPowertrainInput,
  recomputeMultichannelFingerprintForInput,
} from './dbi-p2c15-binding-envelope.factories.v1';
import type {
  DbiP2c15ScenarioIdV1,
  DbiP2c15ScenarioPackageV1,
} from './dbi-p2c15-binding-envelope.types.v1';

export const DBI_P2C15_SCENARIO_IDS: readonly DbiP2c15ScenarioIdV1[] = [
  'S01_VALID_ICE_BASELINE',
  'S02_DIFFERENT_ORGANIZATION',
  'S03_DIFFERENT_VEHICLE',
  'S04_DIFFERENT_TRIP',
  'S05_DIFFERENT_SOURCE_LINK',
  'S06_V1B_FINGERPRINT_TAMPER',
  'S07_MULTICHANNEL_FINGERPRINT_TAMPER',
  'S08_CONFLICTING_DUPLICATE_LABEL',
  'S09_MISSING_REQUIRED_CHANNELS',
  'S10_INSUFFICIENT_OBSERVATIONS',
  'S11_B3_SOLE_INSUFFICIENT_LOAD',
  'S12_B4_ZERO_ASSESSABLE_FACETS',
  'S13_POWERTRAIN_FAIL_CLOSED',
  'S14_A1_DESCRIPTIVE_ONLY',
  'S15_OFFLINE_UNATTESTED_NEGATIVE',
  'S16_CANONICAL_ORDER_INVARIANCE',
];

function baselineBoundIceInput(
  overrides?: Partial<Parameters<typeof buildBoundPowertrainInput>[0]>,
): Ds4PowertrainDemandResearchInputV1 {
  return buildBoundPowertrainInput({
    multichannelObservations: positiveKickdownGrid(),
    tripId: DBI_P2C15_TRIP_BASELINE,
    linkId: DBI_P2C15_LINK_BASELINE,
    ...overrides,
  });
}

function bindingPackage(
  scenarioId: DbiP2c15ScenarioIdV1,
  input: Ds4PowertrainDemandResearchInputV1,
  scientificNotes: string[],
  tamperAllowsMismatch?: boolean,
): DbiP2c15ScenarioPackageV1 {
  if (!tamperAllowsMismatch) {
    assertEnvelopeFingerprintsDeriveFromData(input);
  }
  expectSyntheticProvenance(input);
  const binding = validateDs4PowertrainDemandResearchInputBinding(input);
  return {
    scenarioId,
    envelope: envelopeFromPowertrainInput(scenarioId, input),
    expectation: {
      kind: 'POWERTRAIN_BINDING',
      bindingOk: binding.ok,
      abstainReasons: binding.ok ? undefined : binding.reasonCodes,
    },
    scientificNotes,
  };
}

function expectSyntheticProvenance(input: Ds4PowertrainDemandResearchInputV1): void {
  if (input.evidenceOrigin !== 'SYNTHETIC_FIXTURE' && input.evidenceOrigin !== 'OFFLINE_SEALED_BUNDLE') {
    throw new Error('P2-C1.5 fixtures require SYNTHETIC_FIXTURE or OFFLINE_SEALED_BUNDLE');
  }
}

export function buildDbiP2c15ScenarioPackage(scenarioId: DbiP2c15ScenarioIdV1): DbiP2c15ScenarioPackageV1 {
  switch (scenarioId) {
    case 'S01_VALID_ICE_BASELINE': {
      const input = baselineBoundIceInput();
      return bindingPackage(scenarioId, input, [
        'Consistent tenant/trip/link and derived v1b + multichannel fingerprints.',
      ]);
    }
    case 'S02_DIFFERENT_ORGANIZATION': {
      const input = baselineBoundIceInput();
      input.organizationId = DBI_P2C15_ORG_ALT;
      return bindingPackage(scenarioId, input, ['Root org disagrees with tripInput/v1b org.'], true);
    }
    case 'S03_DIFFERENT_VEHICLE': {
      const input = baselineBoundIceInput();
      input.vehicleId = DBI_P2C15_VEHICLE_ALT;
      return bindingPackage(scenarioId, input, ['Root vehicle disagrees with tripInput/v1b vehicle.'], true);
    }
    case 'S04_DIFFERENT_TRIP': {
      const input = baselineBoundIceInput();
      input.tripId = DBI_P2C15_TRIP_ALT;
      return bindingPackage(scenarioId, input, ['Root trip disagrees with tier/v1b trip id.'], true);
    }
    case 'S05_DIFFERENT_SOURCE_LINK': {
      const input = baselineBoundIceInput();
      input.providerSourceLinkId = DBI_P2C15_LINK_ALT;
      return bindingPackage(scenarioId, input, ['Root link disagrees with tripInput link.'], true);
    }
    case 'S06_V1B_FINGERPRINT_TAMPER': {
      const input = baselineBoundIceInput();
      assertEnvelopeFingerprintsDeriveFromData(input);
      input.v1bResult!.inputFingerprint = 'p2c15-deadbeef-v1b-tamper';
      return bindingPackage(scenarioId, input, ['Tampered v1b fingerprint without recomputing away tamper.'], true);
    }
    case 'S07_MULTICHANNEL_FINGERPRINT_TAMPER': {
      const input = baselineBoundIceInput();
      assertEnvelopeFingerprintsDeriveFromData(input);
      input.multichannelFingerprint = 'p2c15-forged-multichannel';
      return bindingPackage(scenarioId, input, ['Tampered multichannel fingerprint; data unchanged.'], true);
    }
    case 'S08_CONFLICTING_DUPLICATE_LABEL': {
      const iso = positiveKickdownGrid()[2]!.recordedAtIso;
      const grid = [
        ...positiveKickdownGrid(),
        { recordedAtIso: iso, rpm: 1111, speedKmh: 10, throttlePct: 10, loadPct: 10 },
        { recordedAtIso: iso, rpm: 2222, speedKmh: 20, throttlePct: 20, loadPct: 20 },
      ];
      const input = buildBoundPowertrainInput({
        multichannelObservations: grid,
        tripId: DBI_P2C15_TRIP_BASELINE,
        linkId: DBI_P2C15_LINK_BASELINE,
      });
      input.multichannelFingerprint = recomputeMultichannelFingerprintForInput(input);
      return bindingPackage(scenarioId, input, ['Conflicting duplicate epoch labels in multichannel grid.']);
    }
    case 'S09_MISSING_REQUIRED_CHANNELS': {
      const grid = buildObservationSeries(DBI_P2C15_GRID_START_ISO, 12, 1, () => ({
        rpm: null,
        speedKmh: null,
        throttlePct: null,
        loadPct: null,
        coolantC: 40,
      }));
      const input = buildColdEngineBoundInput({
        multichannelObservations: grid,
        tripId: DBI_P2C15_TRIP_BASELINE,
        linkId: DBI_P2C15_LINK_BASELINE,
      });
      return bindingPackage(scenarioId, input, [
        'ECT-only window — RPM/speed/load absent; no invented RPM for admission.',
      ]);
    }
    case 'S10_INSUFFICIENT_OBSERVATIONS': {
      const grid = buildObservationSeries(DBI_P2C15_GRID_START_ISO, 10, 1, () => ({
        rpm: 1500,
        speedKmh: 0,
        throttlePct: 10,
        loadPct: 12,
      }));
      const input = buildBoundPowertrainInput({
        multichannelObservations: grid,
        tripId: DBI_P2C15_TRIP_BASELINE,
        linkId: DBI_P2C15_LINK_BASELINE,
      });
      return bindingPackage(scenarioId, input, ['Binding-adjacent grid below moving observation minimums.']);
    }
    case 'S11_B3_SOLE_INSUFFICIENT_LOAD': {
      const grid = buildObservationSeries(DBI_P2C15_GRID_START_ISO, 12, 1, (i) => ({
        rpm: 2000,
        speedKmh: 55,
        throttlePct: 40,
        loadPct: i < 3 ? 80 : null,
      }));
      const input = buildBoundPowertrainInput({
        multichannelObservations: grid,
        tripId: DBI_P2C15_TRIP_BASELINE,
        linkId: DBI_P2C15_LINK_BASELINE,
      });
      return bindingPackage(scenarioId, input, [
        'Partial trusted load counts — sole INSUFFICIENT_LOAD_LABEL_OBSERVATIONS at kernel layer.',
      ]);
    }
    case 'S12_B4_ZERO_ASSESSABLE_FACETS': {
      const grid = buildObservationSeries(DBI_P2C15_GRID_START_ISO, 30, 1, () => ({
        speedKmh: 0,
        rpm: null,
        loadPct: 20,
      }));
      const input = buildColdEngineBoundInput({
        multichannelObservations: grid,
        tripId: DBI_P2C15_TRIP_BASELINE,
        linkId: DBI_P2C15_LINK_BASELINE,
      }) as Ds4PowertrainDemandResearchInputV1;
      return bindingPackage(scenarioId, input, [
        'COMPUTED with both facets NOT_ASSESSABLE — not a positive rev/idle verdict.',
      ]);
    }
    case 'S13_POWERTRAIN_FAIL_CLOSED': {
      const input = baselineBoundIceInput({ isEvPowertrain: true });
      return bindingPackage(scenarioId, input, ['BEV path — no invented ICE combustion evidence.']);
    }
    case 'S14_A1_DESCRIPTIVE_ONLY': {
      const rpmPoints = buildRpmPointsEverySeconds(DBI_P2C15_GRID_START_ISO, 8, 1).map((p) => ({
        recordedAtIso: p.recordedAtIso,
        valueRpm: rpmAtU(0.7),
      }));
      const input = buildBoundResearchInput({
        rpmPoints,
        tripId: DBI_P2C15_TRIP_BASELINE,
        linkId: DBI_P2C15_LINK_BASELINE,
      });
      const binding = validateDs4RpmEpisodeResearchInputBinding(input);
      return {
        scenarioId,
        envelope: envelopeFromA1Input(scenarioId, input),
        expectation: {
          kind: 'A1_BINDING',
          bindingOk: binding.ok,
          abstainReasons: binding.ok ? undefined : binding.reasonCodes,
        },
        scientificNotes: [
          'A1 descriptive episodes — labelsNotForCrossDomainJoin; not a B1–B4 event participant.',
        ],
      };
    }
    case 'S15_OFFLINE_UNATTESTED_NEGATIVE': {
      const input = baselineBoundIceInput({ evidenceOrigin: 'OFFLINE_SEALED_BUNDLE' });
      input.multichannelManifest = null;
      return bindingPackage(scenarioId, input, [
        'OFFLINE_SEALED_BUNDLE without manifest — fail closed; no forged positive attestation.',
      ]);
    }
    case 'S16_CANONICAL_ORDER_INVARIANCE': {
      const forward = positiveKickdownGrid();
      const reversed = [...forward].reverse();
      const forwardInput = buildBoundPowertrainInput({
        multichannelObservations: forward,
        tripId: DBI_P2C15_TRIP_BASELINE,
        linkId: DBI_P2C15_LINK_BASELINE,
      });
      const reversedInput = buildBoundPowertrainInput({
        multichannelObservations: reversed,
        tripId: DBI_P2C15_TRIP_BASELINE,
        linkId: DBI_P2C15_LINK_BASELINE,
      });
      const forwardCanon = canonicalizeMultichannelObservations(forward);
      const reversedCanon = canonicalizeMultichannelObservations(reversed);
      const fpForward = forwardInput.multichannelFingerprint;
      const fpReversed = reversedInput.multichannelFingerprint;
      if (fpForward !== fpReversed) {
        throw new Error('S16 invariant failed: order should not change canonical fingerprint');
      }
      return {
        scenarioId,
        envelope: envelopeFromPowertrainInput(scenarioId, forwardInput),
        expectation: { kind: 'CANONICAL_INVARIANCE', fingerprintsMatchForwardAndReversed: true },
        scientificNotes: [
          'Raw observation order reversed — canonical buckets and multichannel fingerprint stable.',
        ],
      };
    }
    default: {
      const exhaustive: never = scenarioId;
      throw new Error(`unknown scenario ${exhaustive as string}`);
    }
  }
}
