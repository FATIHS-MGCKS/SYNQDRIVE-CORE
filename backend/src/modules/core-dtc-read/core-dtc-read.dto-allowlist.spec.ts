import { ProductSlug } from '@prisma/client';
import { toCoreDtcReadV1 } from './core-dtc-read.v1.mapper';
import type { DtcSummaryForCoreRead } from './core-dtc-read.v1.mapper';

const TOP_LEVEL_KEYS = [
  'version',
  'organizationId',
  'vehicleId',
  'productSlug',
  'monitoringStatus',
  'isStale',
  'lastPollAttemptAt',
  'lastSuccessfulCheckAt',
  'activeFaultCount',
  'worstSeverityBand',
  'activeFaultPreview',
] as const;

const PREVIEW_KEYS = ['code', 'category', 'severityBand'] as const;

const FORBIDDEN_TOP_LEVEL = [
  'faultConfirmation',
  'dtcAvailability',
  'resolvedAt',
  'lastSourceObservedAt',
  'pollStatus',
  'message',
  'rental_blocked',
  'rental_readiness',
  'blocksRental',
  'dtc01aEnabled',
  'history',
  'label',
  'occurrenceCount',
  'severityRaw',
  'pollError',
];

function populatedSummary(): DtcSummaryForCoreRead {
  return {
    status: 'active_faults',
    activeFaultCount: 1,
    activeFaultPreview: [
      {
        code: 'P0301',
        label: 'Misfire',
        category: 'Powertrain',
        severity: 'medium',
        severityRaw: 'WARNING',
        severityBand: 'warning',
      },
    ],
    worstSeverityBand: 'warning',
    lastCheckedAt: '2026-06-01T10:00:00.000Z',
    lastSuccessfulCheckAt: '2026-06-01T10:00:00.000Z',
    lastSourceObservedAt: null,
    isStale: false,
    message: '1 active fault',
  } as DtcSummaryForCoreRead;
}

describe('Core DTC read — DTO allowlist', () => {
  it('active_faults path matches literal allowlists', () => {
    const dto = toCoreDtcReadV1({
      organizationId: 'org',
      vehicleId: 'veh',
      productSlug: ProductSlug.RENTAL,
      summary: populatedSummary(),
    });

    expect(Object.keys(dto).sort()).toEqual([...TOP_LEVEL_KEYS].sort());
    expect(Object.keys(dto.activeFaultPreview[0]).sort()).toEqual([...PREVIEW_KEYS].sort());

    for (const key of FORBIDDEN_TOP_LEVEL) {
      expect(dto).not.toHaveProperty(key);
    }
  });

  it('stale path matches literal allowlists', () => {
    const dto = toCoreDtcReadV1({
      organizationId: 'org',
      vehicleId: 'veh',
      productSlug: ProductSlug.RENTAL,
      summary: {
        ...populatedSummary(),
        status: 'stale',
        isStale: true,
      },
    });

    expect(Object.keys(dto).sort()).toEqual([...TOP_LEVEL_KEYS].sort());
    expect(dto.activeFaultPreview).toEqual([]);
  });
});
