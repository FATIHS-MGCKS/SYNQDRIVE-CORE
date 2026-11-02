import { DI_V0_MOTION_CORE_SHADOW_PERSISTENCE_CONTRACT_V2 } from '../../motion-core-shadow-worker/di-v0-motion-core-shadow-event-row.contract';
import {
  DS4_ASSESSMENT_COLLECTION_EVENT_ROW_CONTRACT_V2,
  evaluateDs4MotionRunCollectionEligibilityV1,
} from '../ds4-assessment-motion-discovery-eligibility.v1';

function basePayload(overrides: Record<string, unknown> = {}) {
  return {
    contract: {
      algorithmVersions: { bundle: 'b1' },
      speedAuthority: 'C4_ONLY',
      persistence: DI_V0_MOTION_CORE_SHADOW_PERSISTENCE_CONTRACT_V2,
    },
    speeds: [],
    fsmLabels: [],
    stopEpisodes: [],
    events: [],
    summary: { labelCount: 0, eventAcceptedCount: 0, contentFingerprint: 'fp' },
    ...overrides,
  } as never;
}

describe('evaluateDs4MotionRunCollectionEligibilityV1', () => {
  const v2Summary = { eventRowContract: DS4_ASSESSMENT_COLLECTION_EVENT_ROW_CONTRACT_V2 };

  it('accepts V2 summary and matching payload contract', () => {
    expect(
      evaluateDs4MotionRunCollectionEligibilityV1({
        summaryJson: v2Summary,
        payload: basePayload(),
      }).eligible,
    ).toBe(true);
  });

  it('accepts V2 with zero manoeuvres', () => {
    expect(
      evaluateDs4MotionRunCollectionEligibilityV1({
        summaryJson: v2Summary,
        payload: basePayload({ events: [], summary: { eventAcceptedCount: 0 } }),
      }).eligible,
    ).toBe(true);
  });

  it('rejects null/implicit summary contract', () => {
    const result = evaluateDs4MotionRunCollectionEligibilityV1({
      summaryJson: { contentFingerprint: 'x' },
      payload: basePayload(),
    });
    expect(result).toEqual({ eligible: false, reasonCode: 'DISCOVERY_EVENT_ROW_CONTRACT_INELIGIBLE' });
  });

  it('rejects UNKNOWN summary contract string', () => {
    const result = evaluateDs4MotionRunCollectionEligibilityV1({
      summaryJson: { eventRowContract: 'DI_V0_MOTION_CORE_EVENT_ROW_V99_FUTURE' },
      payload: basePayload(),
    });
    expect(result).toEqual({ eligible: false, reasonCode: 'DISCOVERY_EVENT_ROW_CONTRACT_INELIGIBLE' });
  });

  it('rejects payload resolved as legacy V1 when summary declares V2', () => {
    const result = evaluateDs4MotionRunCollectionEligibilityV1({
      summaryJson: v2Summary,
      payload: basePayload({ contract: { algorithmVersions: { bundle: 'b1' }, speedAuthority: 'C4_ONLY' } }),
    });
    expect(result).toEqual({
      eligible: false,
      reasonCode: 'DISCOVERY_SUMMARY_PAYLOAD_CONTRACT_MISMATCH',
    });
  });

  it('rejects summary/payload contract mismatch when declared payload contract differs from summary', () => {
    const result = evaluateDs4MotionRunCollectionEligibilityV1({
      summaryJson: v2Summary,
      payload: basePayload({
        contract: {
          algorithmVersions: { bundle: 'b1' },
          speedAuthority: 'C4_ONLY',
          persistence: {
            ...DI_V0_MOTION_CORE_SHADOW_PERSISTENCE_CONTRACT_V2,
            eventRowContract: 'DI_V0_MOTION_CORE_EVENT_ROW_V1_BOUNDARY_ONLY',
          },
        },
      }),
    });
    expect(result).toEqual({
      eligible: false,
      reasonCode: 'DISCOVERY_SUMMARY_PAYLOAD_CONTRACT_MISMATCH',
    });
  });
});
