import { DI_V0_MOTION_CORE_SHADOW_EVENT_ROW_CONTRACT_V2_INTENSITY } from '../../motion-core-shadow-worker/di-v0-motion-core-shadow-event-row.contract';
import { assertPersistedEventSummariesJsonIntegrityForLayer2ExportV1 } from '../export/ds4-layer2-historical-export-event-summaries-integrity.v1';
import { Ds4Layer2HistoricalExportIntegrityErrorV1 } from '../export/ds4-layer2-historical-export.v1';

const ASSESS_ID = 'assess-1';

function validSummaries(overrides: Record<string, unknown> = {}) {
  return {
    ratedEventCount: 0,
    unratedEventCount: 0,
    eventIntensityRecords: [],
    ...overrides,
  };
}

describe('ds4-layer2-historical-export-event-summaries-integrity.v1', () => {
  it('allows valid empty eventIntensityRecords array', () => {
    expect(() =>
      assertPersistedEventSummariesJsonIntegrityForLayer2ExportV1({
        assessmentId: ASSESS_ID,
        eventRowContract: DI_V0_MOTION_CORE_SHADOW_EVENT_ROW_CONTRACT_V2_INTENSITY,
        eventSummariesJson: validSummaries(),
      }),
    ).not.toThrow();
  });

  it('fails when eventIntensityRecords key is missing', () => {
    expect(() =>
      assertPersistedEventSummariesJsonIntegrityForLayer2ExportV1({
        assessmentId: ASSESS_ID,
        eventRowContract: DI_V0_MOTION_CORE_SHADOW_EVENT_ROW_CONTRACT_V2_INTENSITY,
        eventSummariesJson: { ratedEventCount: 0 },
      }),
    ).toThrow(Ds4Layer2HistoricalExportIntegrityErrorV1);
  });

  it('fails on null eventSummariesJson', () => {
    expect(() =>
      assertPersistedEventSummariesJsonIntegrityForLayer2ExportV1({
        assessmentId: ASSESS_ID,
        eventRowContract: DI_V0_MOTION_CORE_SHADOW_EVENT_ROW_CONTRACT_V2_INTENSITY,
        eventSummariesJson: null,
      }),
    ).toThrow(/must be a JSON object/);
  });

  it('fails on malformed event record shape', () => {
    expect(() =>
      assertPersistedEventSummariesJsonIntegrityForLayer2ExportV1({
        assessmentId: ASSESS_ID,
        eventRowContract: DI_V0_MOTION_CORE_SHADOW_EVENT_ROW_CONTRACT_V2_INTENSITY,
        eventSummariesJson: validSummaries({
          eventIntensityRecords: [{ eventIndex: 'bad' }],
        }),
      }),
    ).toThrow(/eventIndex invalid/);
  });

  it('fails on unsupported event row contract', () => {
    expect(() =>
      assertPersistedEventSummariesJsonIntegrityForLayer2ExportV1({
        assessmentId: ASSESS_ID,
        eventRowContract: 'DI_V0_MOTION_CORE_EVENT_ROW_V99_FUTURE',
        eventSummariesJson: validSummaries(),
      }),
    ).toThrow(/unsupported or missing event_row_contract/);
  });

  it('fails on duplicate eventIndex', () => {
    const record = {
      eventIndex: 0,
      kind: 'ACCELERATION',
      classification: 'UNRATED',
      durationTier: 'UNRATED',
      eventQuality: 'OK',
      speedAuthority: 'C4_ONLY',
      meanAccelMps2: null,
      durationS: 1,
      steps: 1,
      coverageRatio: 1,
      startUncertaintyS: null,
      endUncertaintyS: null,
      reasonCodes: ['EVENT_DURATION_BELOW_MINIMUM'],
      startLabel: '2026-10-29T12:00:00.000Z',
      endLabel: '2026-10-29T12:00:01.000Z',
    };
    expect(() =>
      assertPersistedEventSummariesJsonIntegrityForLayer2ExportV1({
        assessmentId: ASSESS_ID,
        eventRowContract: DI_V0_MOTION_CORE_SHADOW_EVENT_ROW_CONTRACT_V2_INTENSITY,
        eventSummariesJson: validSummaries({ eventIntensityRecords: [record, { ...record }] }),
      }),
    ).toThrow(/duplicate eventIndex/);
  });
});
