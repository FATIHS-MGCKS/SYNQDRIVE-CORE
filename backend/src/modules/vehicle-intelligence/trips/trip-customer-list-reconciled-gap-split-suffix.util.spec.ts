import {
  applyHiddenCustomerSuffixTripExclusion,
  filterCustomerVisibleTrips,
  hasExplicitPartialTripBoundaryExtensionEvidence,
  listReconciledGapSplitSuffixTripIdsHiddenFromCustomerList,
  parseSplitSecondStartAtEpochMs,
  shouldHideReconciledGapSplitSuffixFromCustomerList,
  splitSecondStartAtMatchesSuffixStart,
} from './trip-customer-list-reconciled-gap-split-suffix.util';

const CANONICAL_ID = '2245f107-0dda-412f-9903-dbfe1cd725a7';
const SUFFIX_ID = '22b79470-cae2-4fa7-8aed-74201cf6107e';
const VEHICLE_ID = '19fedd4b-c4e8-4de8-a125-dab293326e7e';
const SPLIT_SECOND_START = new Date('2026-10-31T19:16:54.841Z');

function tiguanIncidentParent() {
  return {
    id: CANONICAL_ID,
    tripStatus: 'COMPLETED',
    startTime: new Date('2026-10-31T18:59:00.000Z'),
    endDetectionMode: 'MID_TRIP_GAP_SPLIT',
    rawDetectionMeta: {
      splitReason: 'live_mid_trip_gap_split',
      splitTriggeredBy: 'LIVE_FSM',
      splitGapMs: 340229,
      splitSecondStartAt: SPLIT_SECOND_START.toISOString(),
      boundaryRepair: {
        repairType: 'PARTIAL_TRIP_BOUNDARY_EXTENSION',
        newEndTime: '2026-10-31T19:18:00.000Z',
      },
    },
  };
}

function tiguanIncidentSuffix(withSplitFrom: boolean) {
  return {
    id: SUFFIX_ID,
    tripStatus: 'CANCELLED',
    startTime: SPLIT_SECOND_START,
    endDetectionMode: 'MID_TRIP_GAP_SPLIT',
    rawDetectionMeta: withSplitFrom
      ? { splitFrom: CANONICAL_ID, splitTriggeredBy: 'LIVE_FSM', discardReason: 'too_short_no_distance' }
      : { discardReason: 'too_short_no_distance' },
  };
}

describe('hasExplicitPartialTripBoundaryExtensionEvidence', () => {
  it('rejects isRepaired-only parent meta', () => {
    expect(hasExplicitPartialTripBoundaryExtensionEvidence({})).toBe(false);
    expect(
      hasExplicitPartialTripBoundaryExtensionEvidence({
        splitTriggeredBy: 'LIVE_FSM',
      }),
    ).toBe(false);
  });

  it('accepts boundaryRepair PARTIAL_TRIP_BOUNDARY_EXTENSION', () => {
    expect(
      hasExplicitPartialTripBoundaryExtensionEvidence({
        boundaryRepair: { repairType: 'PARTIAL_TRIP_BOUNDARY_EXTENSION' },
      }),
    ).toBe(true);
  });
});

describe('parseSplitSecondStartAtEpochMs', () => {
  it('rejects malformed timestamps', () => {
    expect(parseSplitSecondStartAtEpochMs('not-a-valid-timestamp')).toBeNull();
    expect(parseSplitSecondStartAtEpochMs('2026-10-31 19:16:54')).toBeNull();
    expect(parseSplitSecondStartAtEpochMs('')).toBeNull();
  });

  it('accepts Tiguan production anchor', () => {
    expect(parseSplitSecondStartAtEpochMs(SPLIT_SECOND_START.toISOString())).toBe(
      SPLIT_SECOND_START.getTime(),
    );
  });
});

describe('shouldHideReconciledGapSplitSuffixFromCustomerList', () => {
  it('hides Tiguan incident suffix when parent has splitSecondStartAt anchor (no splitFrom on suffix)', () => {
    expect(
      shouldHideReconciledGapSplitSuffixFromCustomerList(
        tiguanIncidentSuffix(false),
        tiguanIncidentParent(),
      ),
    ).toBe(true);
  });

  it('hides suffix when splitFrom lineage is present', () => {
    expect(
      shouldHideReconciledGapSplitSuffixFromCustomerList(
        tiguanIncidentSuffix(true),
        tiguanIncidentParent(),
      ),
    ).toBe(true);
  });

  it('does not hide when parent is isRepaired-only without boundary extension meta', () => {
    const parent = {
      ...tiguanIncidentParent(),
      rawDetectionMeta: {
        splitTriggeredBy: 'LIVE_FSM',
        splitSecondStartAt: SPLIT_SECOND_START.toISOString(),
      },
    };
    expect(
      shouldHideReconciledGapSplitSuffixFromCustomerList(tiguanIncidentSuffix(false), parent),
    ).toBe(false);
  });

  it('keeps independent CANCELLED too_short trip without reconciled LIVE_FSM parent', () => {
    const independent = {
      id: 'independent-cancelled',
      tripStatus: 'CANCELLED',
      startTime: new Date('2026-11-01T10:00:00.000Z'),
      rawDetectionMeta: { discardReason: 'too_short_no_distance' },
    };
    expect(
      shouldHideReconciledGapSplitSuffixFromCustomerList(independent, tiguanIncidentParent()),
    ).toBe(false);
  });

  it('fail-closed when splitSecondStartAt malformed', () => {
    const parent = {
      ...tiguanIncidentParent(),
      rawDetectionMeta: {
        splitTriggeredBy: 'LIVE_FSM',
        splitSecondStartAt: 'not-a-valid-timestamp',
        boundaryRepair: { repairType: 'PARTIAL_TRIP_BOUNDARY_EXTENSION' },
      },
    };
    expect(
      shouldHideReconciledGapSplitSuffixFromCustomerList(tiguanIncidentSuffix(false), parent),
    ).toBe(false);
    expect(splitSecondStartAtMatchesSuffixStart('not-a-valid-timestamp', SPLIT_SECOND_START)).toBe(
      false,
    );
  });

  it('keeps legitimate COMPLETED trip unchanged in batch filter', () => {
    const parent = tiguanIncidentParent();
    const suffix = tiguanIncidentSuffix(false);
    const other = {
      id: 'other-trip',
      tripStatus: 'COMPLETED',
      startTime: new Date('2026-10-30T12:00:00.000Z'),
      rawDetectionMeta: {},
    };
    const hidden = new Set([SUFFIX_ID]);
    const visible = filterCustomerVisibleTrips([parent, suffix, other], hidden);
    expect(visible.map((t) => t.id)).toEqual([CANONICAL_ID, 'other-trip']);
  });
});

describe('applyHiddenCustomerSuffixTripExclusion', () => {
  it('merges notIn trip ids into prisma where', () => {
    const where = applyHiddenCustomerSuffixTripExclusion({ vehicleId: VEHICLE_ID }, ['a', 'b']);
    expect(where).toEqual({ vehicleId: VEHICLE_ID, id: { notIn: ['a', 'b'] } });
  });
});

describe('listReconciledGapSplitSuffixTripIdsHiddenFromCustomerList', () => {
  it('filters SQL rows with safe lineage matching in application code', async () => {
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue([
        {
          suffix_id: SUFFIX_ID,
          parent_id: CANONICAL_ID,
          suffix_start: SPLIT_SECOND_START,
          split_from: null,
          split_second_start_at: SPLIT_SECOND_START.toISOString(),
        },
        {
          suffix_id: 'wrong-suffix',
          parent_id: CANONICAL_ID,
          suffix_start: new Date('2026-10-31T20:00:00.000Z'),
          split_from: null,
          split_second_start_at: SPLIT_SECOND_START.toISOString(),
        },
      ]),
    };
    await expect(
      listReconciledGapSplitSuffixTripIdsHiddenFromCustomerList(prisma, VEHICLE_ID),
    ).resolves.toEqual([SUFFIX_ID]);
  });
});
