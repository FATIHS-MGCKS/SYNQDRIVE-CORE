import {
  buildBoundResearchInput,
  rpmAtU,
} from '../ds4-rpm-episode-research/__tests__/ds4-rpm-episode-research.test-helpers';
import type { Ds4PowertrainDemandResearchInputV1 } from '../ds4-powertrain-demand-research/ds4-powertrain-demand-research.contract.v1';
import {
  buildBoundPowertrainInput,
  buildColdEngineBoundInput,
  buildObservationSeries,
  positiveKickdownGrid,
} from '../ds4-powertrain-demand-research/__tests__/ds4-powertrain-demand-research.test-helpers';
import { buildRpmPointsEverySeconds } from '../rpm-hf-v1b/__tests__/ds4-rpm-hf-v1b-tier-fixtures';
import { cloneA1FixtureInput, clonePowertrainFixtureInput } from './dbi-p2c15-binding-envelope.clone.v1';
import { DBI_P2C15_PINNED_EXPECTATIONS } from './dbi-p2c15-binding-envelope.expectations.v1';
import {
  assertEnvelopeFingerprintsDeriveFromData,
  envelopeFromA1Input,
  envelopeFromPowertrainInput,
  recomputeMultichannelFingerprintForInput,
} from './dbi-p2c15-binding-envelope.factories.v1';
import {
  DBI_P2C15_GRID_START_ISO,
  DBI_P2C15_LINK_ALT,
  DBI_P2C15_LINK_BASELINE,
  DBI_P2C15_ORG_ALT,
  DBI_P2C15_TRIP_ALT,
  DBI_P2C15_TRIP_BASELINE,
  DBI_P2C15_VEHICLE_ALT,
} from './dbi-p2c15-binding-envelope.identity.v1';
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
  'S13_POWERTRAIN_BEV_FAIL_CLOSED',
  'S13_POWERTRAIN_UNKNOWN_FAIL_CLOSED',
  'S13_POWERTRAIN_CONTRADICTORY_FAIL_CLOSED',
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

function expectSyntheticProvenance(input: Ds4PowertrainDemandResearchInputV1): void {
  if (input.evidenceOrigin !== 'SYNTHETIC_FIXTURE' && input.evidenceOrigin !== 'OFFLINE_SEALED_BUNDLE') {
    throw new Error('P2-C1.5 fixtures require SYNTHETIC_FIXTURE or OFFLINE_SEALED_BUNDLE');
  }
}

function finalizePowertrainPackage(
  scenarioId: DbiP2c15ScenarioIdV1,
  raw: Ds4PowertrainDemandResearchInputV1,
  scientificNotes: readonly string[],
  tamperAllowsMismatch?: boolean,
): DbiP2c15ScenarioPackageV1 {
  const input = clonePowertrainFixtureInput(raw);
  if (!tamperAllowsMismatch) {
    assertEnvelopeFingerprintsDeriveFromData(input);
  }
  expectSyntheticProvenance(input);
  return {
    scenarioId,
    envelope: envelopeFromPowertrainInput(scenarioId, input),
    payload: { kind: 'POWERTRAIN_INPUT', input, bindingValidator: 'SHARED_KICKDOWN_BINDING' },
    expectation: DBI_P2C15_PINNED_EXPECTATIONS[scenarioId],
    scientificNotes,
  };
}

function finalizeModulePackage(
  scenarioId: DbiP2c15ScenarioIdV1,
  raw: Ds4PowertrainDemandResearchInputV1,
  researchModule: 'B2' | 'B3' | 'B4',
  scientificNotes: readonly string[],
  subVariant?: 'BEV' | 'UNKNOWN' | 'CONTRADICTORY',
  tamperAllowsMismatch?: boolean,
): DbiP2c15ScenarioPackageV1 {
  const input = clonePowertrainFixtureInput(raw);
  if (!tamperAllowsMismatch) {
    assertEnvelopeFingerprintsDeriveFromData(input);
  }
  expectSyntheticProvenance(input);
  return {
    scenarioId,
    envelope: envelopeFromPowertrainInput(scenarioId, input),
    payload: { kind: 'MODULE_SPECIFIC_SCENARIO', input, researchModule, subVariant },
    expectation: DBI_P2C15_PINNED_EXPECTATIONS[scenarioId],
    scientificNotes,
  };
}

export function buildDbiP2c15ScenarioPackage(scenarioId: DbiP2c15ScenarioIdV1): DbiP2c15ScenarioPackageV1 {
  switch (scenarioId) {
    case 'S01_VALID_ICE_BASELINE':
      return finalizePowertrainPackage(scenarioId, baselineBoundIceInput(), [
        'Consistent tenant/trip/link and derived v1b + multichannel fingerprints.',
      ]);
    case 'S02_DIFFERENT_ORGANIZATION': {
      const raw = baselineBoundIceInput();
      raw.organizationId = DBI_P2C15_ORG_ALT;
      return finalizePowertrainPackage(scenarioId, raw, ['Root org disagrees with tripInput/v1b org.'], true);
    }
    case 'S03_DIFFERENT_VEHICLE': {
      const raw = baselineBoundIceInput();
      raw.vehicleId = DBI_P2C15_VEHICLE_ALT;
      return finalizePowertrainPackage(scenarioId, raw, ['Root vehicle disagrees with tripInput/v1b vehicle.'], true);
    }
    case 'S04_DIFFERENT_TRIP': {
      const raw = baselineBoundIceInput();
      raw.tripId = DBI_P2C15_TRIP_ALT;
      return finalizePowertrainPackage(scenarioId, raw, ['Root trip disagrees with tier/v1b trip id.'], true);
    }
    case 'S05_DIFFERENT_SOURCE_LINK': {
      const raw = baselineBoundIceInput();
      raw.providerSourceLinkId = DBI_P2C15_LINK_ALT;
      return finalizePowertrainPackage(scenarioId, raw, ['Root link disagrees with tripInput link.'], true);
    }
    case 'S06_V1B_FINGERPRINT_TAMPER': {
      const raw = baselineBoundIceInput();
      assertEnvelopeFingerprintsDeriveFromData(raw);
      raw.v1bResult!.inputFingerprint = 'p2c15-deadbeef-v1b-tamper';
      return finalizePowertrainPackage(scenarioId, raw, ['Tampered v1b fingerprint without recomputing away tamper.'], true);
    }
    case 'S07_MULTICHANNEL_FINGERPRINT_TAMPER': {
      const raw = baselineBoundIceInput();
      assertEnvelopeFingerprintsDeriveFromData(raw);
      raw.multichannelFingerprint = 'p2c15-forged-multichannel';
      return finalizePowertrainPackage(scenarioId, raw, ['Tampered multichannel fingerprint; data unchanged.'], true);
    }
    case 'S08_CONFLICTING_DUPLICATE_LABEL': {
      const iso = positiveKickdownGrid()[2]!.recordedAtIso;
      const grid = [
        ...positiveKickdownGrid(),
        { recordedAtIso: iso, rpm: 1111, speedKmh: 10, throttlePct: 10, loadPct: 10 },
        { recordedAtIso: iso, rpm: 2222, speedKmh: 20, throttlePct: 20, loadPct: 20 },
      ];
      const raw = buildBoundPowertrainInput({
        multichannelObservations: grid,
        tripId: DBI_P2C15_TRIP_BASELINE,
        linkId: DBI_P2C15_LINK_BASELINE,
      });
      raw.multichannelFingerprint = recomputeMultichannelFingerprintForInput(raw);
      return finalizePowertrainPackage(scenarioId, raw, ['Conflicting duplicate epoch labels in multichannel grid.']);
    }
    case 'S09_MISSING_REQUIRED_CHANNELS': {
      const grid = buildObservationSeries(DBI_P2C15_GRID_START_ISO, 12, 1, () => ({
        rpm: null,
        speedKmh: null,
        throttlePct: null,
        loadPct: null,
        coolantC: 40,
      }));
      const raw = buildColdEngineBoundInput({
        multichannelObservations: grid,
        tripId: DBI_P2C15_TRIP_BASELINE,
        linkId: DBI_P2C15_LINK_BASELINE,
      }) as Ds4PowertrainDemandResearchInputV1;
      return finalizeModulePackage(scenarioId, raw, 'B2', [
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
      const raw = buildBoundPowertrainInput({
        multichannelObservations: grid,
        tripId: DBI_P2C15_TRIP_BASELINE,
        linkId: DBI_P2C15_LINK_BASELINE,
      });
      return finalizePowertrainPackage(scenarioId, raw, ['Stationary grid — no moving opportunity at bind layer.']);
    }
    case 'S11_B3_SOLE_INSUFFICIENT_LOAD': {
      const grid = buildObservationSeries(DBI_P2C15_GRID_START_ISO, 12, 1, (i) => ({
        rpm: 2000,
        speedKmh: 55,
        throttlePct: 40,
        loadPct: i < 3 ? 80 : null,
      }));
      const raw = buildBoundPowertrainInput({
        multichannelObservations: grid,
        tripId: DBI_P2C15_TRIP_BASELINE,
        linkId: DBI_P2C15_LINK_BASELINE,
      });
      return finalizeModulePackage(scenarioId, raw, 'B3', [
        'Partial trusted load counts — sole INSUFFICIENT_LOAD_LABEL_OBSERVATIONS at kernel layer.',
      ]);
    }
    case 'S12_B4_ZERO_ASSESSABLE_FACETS': {
      const grid = buildObservationSeries(DBI_P2C15_GRID_START_ISO, 30, 1, () => ({
        speedKmh: 0,
        rpm: null,
        loadPct: 20,
      }));
      const raw = buildColdEngineBoundInput({
        multichannelObservations: grid,
        tripId: DBI_P2C15_TRIP_BASELINE,
        linkId: DBI_P2C15_LINK_BASELINE,
      }) as Ds4PowertrainDemandResearchInputV1;
      return finalizeModulePackage(scenarioId, raw, 'B4', [
        'COMPUTED with both facets NOT_ASSESSABLE — not a positive rev/idle verdict.',
      ]);
    }
    case 'S13_POWERTRAIN_BEV_FAIL_CLOSED': {
      const raw = baselineBoundIceInput({ fuelType: 'ELECTRIC', isEvPowertrain: true });
      return finalizePowertrainPackage(scenarioId, raw, ['BEV — ELECTRIC + isEvPowertrain.']);
    }
    case 'S13_POWERTRAIN_UNKNOWN_FAIL_CLOSED': {
      const raw = baselineBoundIceInput();
      raw.fuelType = null;
      raw.isEvPowertrain = false;
      return finalizeModulePackage(scenarioId, raw, 'B3', ['Unknown fuel context — no ICE confirmation.'], 'UNKNOWN');
    }
    case 'S13_POWERTRAIN_CONTRADICTORY_FAIL_CLOSED': {
      const raw = baselineBoundIceInput({ fuelType: 'GASOLINE', isEvPowertrain: true });
      return finalizePowertrainPackage(scenarioId, raw, ['Contradictory GASOLINE + EV flag.']);
    }
    case 'S14_A1_DESCRIPTIVE_ONLY': {
      const rpmPoints = buildRpmPointsEverySeconds(DBI_P2C15_GRID_START_ISO, 8, 1).map((p) => ({
        recordedAtIso: p.recordedAtIso,
        valueRpm: rpmAtU(0.7),
      }));
      const raw = buildBoundResearchInput({
        rpmPoints,
        tripId: DBI_P2C15_TRIP_BASELINE,
        linkId: DBI_P2C15_LINK_BASELINE,
      });
      const input = cloneA1FixtureInput(raw);
      return {
        scenarioId,
        envelope: envelopeFromA1Input(scenarioId, input),
        payload: { kind: 'A1_INPUT', input },
        expectation: DBI_P2C15_PINNED_EXPECTATIONS[scenarioId],
        scientificNotes: [
          'A1 descriptive episodes — labelsNotForCrossDomainJoin; not a B1–B4 event participant.',
        ],
      };
    }
    case 'S15_OFFLINE_UNATTESTED_NEGATIVE': {
      const raw = baselineBoundIceInput({ evidenceOrigin: 'OFFLINE_SEALED_BUNDLE' });
      raw.multichannelManifest = null;
      return finalizePowertrainPackage(scenarioId, raw, [
        'OFFLINE_SEALED_BUNDLE without manifest — fail closed; no forged positive attestation.',
      ]);
    }
    case 'S16_CANONICAL_ORDER_INVARIANCE': {
      const forwardObservations = positiveKickdownGrid();
      const reversedObservations = [...forwardObservations].reverse();
      const forwardRaw = buildBoundPowertrainInput({
        multichannelObservations: forwardObservations,
        tripId: DBI_P2C15_TRIP_BASELINE,
        linkId: DBI_P2C15_LINK_BASELINE,
      });
      const reversedRaw = buildBoundPowertrainInput({
        multichannelObservations: reversedObservations,
        tripId: DBI_P2C15_TRIP_BASELINE,
        linkId: DBI_P2C15_LINK_BASELINE,
      });
      const forwardInput = clonePowertrainFixtureInput(forwardRaw);
      const reversedInput = clonePowertrainFixtureInput(reversedRaw);
      assertEnvelopeFingerprintsDeriveFromData(forwardInput);
      assertEnvelopeFingerprintsDeriveFromData(reversedInput);
      return {
        scenarioId,
        envelope: envelopeFromPowertrainInput(scenarioId, forwardInput),
        payload: {
          kind: 'CANONICAL_ORDER_PAIR',
          forwardInput,
          reversedInput,
          forwardObservations,
          reversedObservations,
        },
        expectation: DBI_P2C15_PINNED_EXPECTATIONS[scenarioId],
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
