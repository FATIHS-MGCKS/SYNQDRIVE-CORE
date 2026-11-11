import { replayDs4RpmShadowCorrelationScenario } from '../../ds4-rpm-shadow-correlation/__tests__/ds4-rpm-shadow-correlation-scenarios.harness';
import { buildDefaultSyntheticMotionPayload } from '../../ds4-rpm-shadow-correlation/ds4-rpm-shadow-correlation-harness.v1';
import { DI_V0_MOTION_CORE_SHADOW_PERSISTENCE_CONTRACT_V2 } from '../../motion-core-shadow-worker/di-v0-motion-core-shadow-event-row.contract';
import type { DiV0MotionCoreShadowPersistedEventRow } from '../../motion-core-shadow-worker/di-v0-motion-core-shadow.types';
import {
  motionEventsConsistent,
  validateDs4RpmDynamicsFusionBindingGate,
} from '../ds4-rpm-dynamics-fusion-binding-gate.v1';
import {
  buildRpmPointsEverySeconds,
  runFusionFixture,
} from './ds4-rpm-dynamics-fusion-research.test-helpers';

function cloneEvent(row: DiV0MotionCoreShadowPersistedEventRow): DiV0MotionCoreShadowPersistedEventRow {
  return {
    ...row,
    flags: [...row.flags],
    ...(row.intensity ? { intensity: { ...row.intensity } } : {}),
  };
}

describe('fusion motion-event material parity (F2)', () => {
  let payloadEvents: DiV0MotionCoreShadowPersistedEventRow[];

  beforeAll(() => {
    const { payload } = buildDefaultSyntheticMotionPayload('RPM_1S_ALIGNED');
    payloadEvents = payload.events;
  });

  it('1: different startSpeedKmh rejects binding', () => {
    const base = cloneEvent(payloadEvents[0]!);
    const corrupt = cloneEvent(base);
    corrupt.startSpeedKmh = base.startSpeedKmh + 0.1;
    expect(motionEventsConsistent([base], [corrupt])).toBe(false);
  });

  it('2: different deltaKmh rejects binding', () => {
    const base = cloneEvent(payloadEvents[0]!);
    const corrupt = cloneEvent(base);
    corrupt.deltaKmh = base.deltaKmh + 1;
    expect(motionEventsConsistent([base], [corrupt])).toBe(false);
  });

  it('3: different intensity field rejects binding', () => {
    const row = cloneEvent(payloadEvents[0]!);
    row.intensity = {
      meanAccelMps2: 1.5,
      durationS: 4,
      steps: 4,
      coverageRatio: 0.8,
      startUncertaintyS: 'ZERO',
      endUncertaintyS: 'ZERO',
    };
    const corrupt = cloneEvent(row);
    corrupt.intensity = { ...row.intensity!, meanAccelMps2: row.intensity!.meanAccelMps2 + 0.01 };
    expect(motionEventsConsistent([row], [corrupt])).toBe(false);
  });

  it('4: absent vs present intensity rejects binding', () => {
    const withIntensity = cloneEvent(payloadEvents[0]!);
    withIntensity.intensity = {
      meanAccelMps2: 1.2,
      durationS: 3,
      steps: 3,
      coverageRatio: 0.75,
      startUncertaintyS: 'ZERO',
      endUncertaintyS: 'ZERO',
    };
    const withoutIntensity = cloneEvent(withIntensity);
    delete (withoutIntensity as { intensity?: unknown }).intensity;
    expect(motionEventsConsistent([withoutIntensity], [withIntensity])).toBe(false);
  });

  it('5: valid legacy V1 (no intensity) passes material parity', () => {
    const v1a = cloneEvent(payloadEvents[0]!);
    const v1b = cloneEvent(payloadEvents[0]!);
    delete (v1a as { intensity?: unknown }).intensity;
    delete (v1b as { intensity?: unknown }).intensity;
    expect(motionEventsConsistent([v1a], [v1b])).toBe(true);
  });

  it('6: valid V2 intensity row passes material parity', () => {
    const v2a = cloneEvent(payloadEvents[0]!);
    const v2b = cloneEvent(payloadEvents[0]!);
    v2a.intensity = {
      meanAccelMps2: 2.1,
      durationS: 5,
      steps: 5,
      coverageRatio: 1,
      startUncertaintyS: 'BOUNDARY',
      endUncertaintyS: 'BOUNDARY',
    };
    v2b.intensity = { ...v2a.intensity! };
    expect(motionEventsConsistent([v2a], [v2b])).toBe(true);
  });

  it('6b: payload-level V2 contract rows all match correlation copy', () => {
    const { payload } = buildDefaultSyntheticMotionPayload('RPM_1S_ALIGNED');
    expect(payload.contract.persistence).toEqual(DI_V0_MOTION_CORE_SHADOW_PERSISTENCE_CONTRACT_V2);
    expect(motionEventsConsistent(payload.events, payload.events)).toBe(true);
  });

  it('7: existing positive fusion harness still computes', () => {
    const { payload } = buildDefaultSyntheticMotionPayload('RPM_1S_ALIGNED');
    const motionStart = payload.speeds[0]!.bucketLabelUtc;
    const fusion = runFusionFixture({
      motionScenarioKey: 'RPM_1S_ALIGNED',
      rpmPoints: buildRpmPointsEverySeconds(motionStart, 30, 1),
    });
    expect(fusion.status).toBe('COMPUTED');
    expect(validateDs4RpmDynamicsFusionBindingGate).toBeDefined();
  });

  it('8: shadow replay metrics unchanged under matching motion payload', () => {
    const shadow = replayDs4RpmShadowCorrelationScenario('RPM_1S_ALIGNED', {
      codeSha: 'motion-parity-sha',
    });
    const { payload } = buildDefaultSyntheticMotionPayload('RPM_1S_ALIGNED');
    const motionStart = payload.speeds[0]!.bucketLabelUtc;
    const fusion = runFusionFixture({
      motionScenarioKey: 'RPM_1S_ALIGNED',
      rpmPoints: buildRpmPointsEverySeconds(motionStart, 30, 1),
    });
    expect(fusion.events.length).toBe(shadow.events.length);
    for (let i = 0; i < shadow.events.length; i += 1) {
      expect(fusion.events[i]!.shadowCorrelation.contextClassification).toBe(
        shadow.events[i]!.contextClassification,
      );
    }
  });
});
