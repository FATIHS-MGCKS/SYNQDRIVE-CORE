import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  resolveStrictLvBatteryProviderSourceAt,
  type DimoBatterySignalMap,
} from '../../../../modules/dimo/mappers/dimo-battery-signal.mapper';
import {
  evaluateBaselineLvSourceEvidence,
  evaluateBaselineSkipDiscoveryDelay,
  evaluateBaselineTopLevelSourceAdvance,
  evaluateInformationRediscoveredOnDeferredLv,
  parseSnapshotCorrelationId,
} from './p25-apd-shadow-baseline-poll-evidence';
import { ApdShadowBaselinePollEvidenceService } from './apd-shadow-baseline-poll-evidence.service';
import type { AdaptivePollingShadowPostPollContext } from './adaptive-polling-shadow.types';

const lossCases = JSON.parse(
  readFileSync(
    join(__dirname, 'fixtures/fable-skip-safety-audit-loss-cases.json'),
    'utf8',
  ),
) as Array<{
  id: string;
  preLastLvSourceAt: string;
  payloadLvProviderSourceAt: string;
  pollStartedAt: string;
  pollCompletedAt: string;
  nextBaselinePollStartedAt: string;
}>;

function batteryMapFixture(input: {
  lvValid: boolean;
  lvObservedAt: Date | null;
  collectionLastSeenAt: Date | null;
}): DimoBatterySignalMap {
  return {
    collectionLastSeenAt: input.collectionLastSeenAt,
    lvBatteryVoltage: {
      status: input.lvValid ? 'valid' : 'missing',
      value: input.lvValid ? 13.5 : null,
      observedAt: input.lvObservedAt,
    },
    evSoc: { status: 'missing', value: null, observedAt: null },
    tractionBatteryCurrentEnergyKwh: { status: 'missing', value: null, observedAt: null },
    tractionBatterySohPercent: { status: 'missing', value: null, observedAt: null },
    tractionBatteryPowerKw: { status: 'missing', value: null, observedAt: null },
    tractionBatteryChargingPowerKw: { status: 'missing', value: null, observedAt: null },
    tractionBatteryAddedEnergyKwh: { status: 'missing', value: null, observedAt: null },
    tractionBatteryChargeLimitPercent: { status: 'missing', value: null, observedAt: null },
    tractionBatteryCurrentVoltage: { status: 'missing', value: null, observedAt: null },
    tractionBatteryTemperatureC: { status: 'missing', value: null, observedAt: null },
    tractionBatteryGrossCapacityKwh: { status: 'missing', value: null, observedAt: null },
    tractionBatteryIsCharging: { status: 'missing', value: null, observedAt: null },
    tractionBatteryChargingCableConnected: { status: 'missing', value: null, observedAt: null },
  } as DimoBatterySignalMap;
}

describe('p25-apd-shadow-baseline-poll-evidence', () => {
  describe('strict LV authority', () => {
    it('Tesla: collectionLastSeenAt without LV signal → UNKNOWN strict timestamp', () => {
      const bundleTs = new Date('2026-10-25T12:00:00.000Z');
      const strict = resolveStrictLvBatteryProviderSourceAt(
        batteryMapFixture({
          lvValid: false,
          lvObservedAt: null,
          collectionLastSeenAt: bundleTs,
        }),
      );
      expect(strict).toBeNull();
      expect(
        evaluateBaselineLvSourceEvidence({
          previousLvProviderSourceMs: null,
          strictLvProviderSourceMs: strict?.getTime() ?? null,
        }).kind,
      ).toBe('UNKNOWN');
    });

    it('valid LV value but missing LV observedAt → UNKNOWN', () => {
      const strict = resolveStrictLvBatteryProviderSourceAt(
        batteryMapFixture({
          lvValid: true,
          lvObservedAt: null,
          collectionLastSeenAt: new Date('2026-10-25T12:00:00.000Z'),
        }),
      );
      expect(strict).toBeNull();
    });

    it('first-ever strict LV → FIRST_VALID_LV_OBSERVATION (not STRICT advance)', () => {
      expect(
        evaluateBaselineLvSourceEvidence({
          previousLvProviderSourceMs: null,
          strictLvProviderSourceMs: 1_000,
        }).kind,
      ).toBe('FIRST_VALID_LV_OBSERVATION');
    });

    it('STRICT_LV_ADVANCE when previous exists and timestamp increases', () => {
      expect(
        evaluateBaselineLvSourceEvidence({
          previousLvProviderSourceMs: 1_000,
          strictLvProviderSourceMs: 2_000,
        }).kind,
      ).toBe('STRICT_LV_ADVANCE');
    });
  });

  describe('discovery delay semantics', () => {
    it('NEXT_BASELINE_POLL_OBSERVED records poll timing only (not confirmed discovery)', () => {
      const r = evaluateBaselineSkipDiscoveryDelay({
        priorPollCompletedAtMs: 1_000_000,
        nextBaselinePollStartedAtMs: 1_060_000,
        nextBaselinePollCompletedAtMs: 1_065_000,
        nextBaselinePollId: 'next-poll-id',
      });
      expect(r.kind).toBe('NEXT_BASELINE_POLL_OBSERVED');
      if (r.kind === 'NEXT_BASELINE_POLL_OBSERVED') {
        expect(r.simulatedNextPollAtMs).toBe(1_060_000);
        expect(r.additionalDiscoveryDelayMs).toBe(60_000);
      }
    });

    it('deferred strict LV on same realPollId is not INFORMATION_REDISCOVERED', () => {
      expect(
        evaluateInformationRediscoveredOnDeferredLv({
          previousLvProviderSourceMs: 1_000,
          strictLvProviderSourceMs: 2_000,
          pollFinishedAtMs: 9_000,
        }).kind,
      ).toBe('UNKNOWN');
    });

    it('UNKNOWN when next poll not yet available at post-poll time', () => {
      const evidence = new ApdShadowBaselinePollEvidenceService({} as never);
      const patch = evidence.buildObservationalPatch({
        ctx: {
          organizationId: 'o',
          vehicleId: 'v',
          opportunityId: 'opp',
          realPollId: 'p',
          pollStartedAtMs: 1_000,
          pollCompletedAtMs: 2_000,
          realPollVisibleLvSourceAtMs: null,
          previousLvSourceMs: 900,
          baselineLvProviderSourceMs: 950,
          previousTopLevelSourceMs: null,
          newTopLevelSourceMs: null,
          providerFetchedAtMs: null,
        },
        existing: null,
      });
      expect(patch.additionalDiscoveryDelayMs).toBeNull();
      expect(patch.simulatedDiscoveryAt).toBeNull();
    });
  });

  describe('Fable audit loss cases (frozen regression)', () => {
    const evidence = new ApdShadowBaselinePollEvidenceService({} as never);

    for (const c of lossCases) {
      it(`${c.id} → STRICT_LV_ADVANCE observational evidence`, () => {
        const preMs = Date.parse(c.preLastLvSourceAt);
        const payloadMs = Date.parse(c.payloadLvProviderSourceAt);
        const ctx: AdaptivePollingShadowPostPollContext = {
          organizationId: 'org',
          vehicleId: 'veh',
          opportunityId: 'opp',
          realPollId: 'poll',
          pollStartedAtMs: Date.parse(c.pollStartedAt),
          pollCompletedAtMs: Date.parse(c.pollCompletedAt),
          realPollVisibleLvSourceAtMs: null,
          previousLvSourceMs: preMs,
          baselineLvProviderSourceMs: payloadMs,
          previousTopLevelSourceMs: preMs,
          newTopLevelSourceMs: payloadMs,
          providerFetchedAtMs: null,
        };
        const patch = evidence.buildObservationalPatch({ ctx, existing: null });
        expect(patch.newLvSourceObserved).toBe(true);
        expect(patch.newLvSourceAt?.getTime()).toBe(payloadMs);
        expect(patch.additionalDiscoveryDelayMs).toBeNull();
      });
    }
  });

  it('parseSnapshotCorrelationId', () => {
    const parsed = parseSnapshotCorrelationId(
      'snapshot:19fedd4b-c4e8-4de8-a125-dab293326e7e:2026-10-25T10:29:02.655Z',
    );
    expect(parsed?.vehicleId).toBe('19fedd4b-c4e8-4de8-a125-dab293326e7e');
  });

  it('top-level UNKNOWN without previous', () => {
    expect(
      evaluateBaselineTopLevelSourceAdvance({
        previousSourceTimestampMs: null,
        newSourceTimestampMs: 200,
      }).informative,
    ).toBe(false);
  });
});
