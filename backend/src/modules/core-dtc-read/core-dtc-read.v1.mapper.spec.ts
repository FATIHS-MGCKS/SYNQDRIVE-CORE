import { ProductSlug } from '@prisma/client';
import { toCoreDtcReadV1, type DtcSummaryForCoreRead } from './core-dtc-read.v1.mapper';
import { CORE_DTC_READ_CONTRACT_VERSION } from './core-dtc-read.v1.types';

const ORG = 'org-a';
const VEH = 'veh-a';
const PRODUCT = ProductSlug.RENTAL;

function summary(overrides: Partial<DtcSummaryForCoreRead> = {}): DtcSummaryForCoreRead {
  return {
    status: 'clean',
    activeFaultCount: 0,
    activeFaultPreview: [],
    worstSeverityBand: 'unknown',
    lastCheckedAt: '2026-06-01T10:00:00.000Z',
    lastSuccessfulCheckAt: '2026-06-01T10:00:00.000Z',
    lastSourceObservedAt: null,
    isStale: false,
    message: 'No active fault codes',
    ...overrides,
  } as DtcSummaryForCoreRead;
}

describe('toCoreDtcReadV1 — fail-closed mapping', () => {
  const base = {
    organizationId: ORG,
    vehicleId: VEH,
    productSlug: PRODUCT,
  };

  it('stale: null count, null worst, empty preview (legacy)', () => {
    const dto = toCoreDtcReadV1({
      ...base,
      summary: summary({
        status: 'stale',
        isStale: true,
        activeFaultCount: 0,
        activeFaultPreview: [],
      }),
    });

    expect(dto.monitoringStatus).toBe('stale');
    expect(dto.activeFaultCount).toBeNull();
    expect(dto.worstSeverityBand).toBeNull();
    expect(dto.activeFaultPreview).toEqual([]);
    expect(dto).not.toHaveProperty('message');
    expect(dto).not.toHaveProperty('faultConfirmation');
  });

  it('mixed-mode safety: global 01A stale with upstream preview still fail-closed', () => {
    const dto = toCoreDtcReadV1({
      ...base,
      summary: summary({
        status: 'stale',
        isStale: true,
        activeFaultCount: 2,
        worstSeverityBand: 'critical',
        faultConfirmation: 'last_known_unconfirmed',
        dtc01aEnabled: true,
        activeFaultPreview: [
          {
            code: 'P0301',
            label: 'Misfire',
            category: 'Powertrain',
            severity: 'high',
            severityRaw: 'CRITICAL',
            severityBand: 'critical',
            faultConfirmation: 'last_known_unconfirmed',
          },
        ],
      } as Partial<DtcSummaryForCoreRead>),
    });

    expect(dto.activeFaultCount).toBeNull();
    expect(dto.worstSeverityBand).toBeNull();
    expect(dto.activeFaultPreview).toEqual([]);
  });

  it('unavailable: null count and preview', () => {
    const dto = toCoreDtcReadV1({
      ...base,
      summary: summary({
        status: 'unavailable',
        isStale: true,
        lastCheckedAt: null,
        lastSuccessfulCheckAt: null,
      }),
    });

    expect(dto.activeFaultCount).toBeNull();
    expect(dto.worstSeverityBand).toBeNull();
    expect(dto.activeFaultPreview).toEqual([]);
  });

  it('clean: count 0, null worst, empty preview', () => {
    const dto = toCoreDtcReadV1({
      ...base,
      summary: summary({ status: 'clean' }),
    });

    expect(dto.activeFaultCount).toBe(0);
    expect(dto.worstSeverityBand).toBeNull();
    expect(dto.activeFaultPreview).toEqual([]);
  });

  it('active_faults: maps count, worst, and minimal preview', () => {
    const dto = toCoreDtcReadV1({
      ...base,
      summary: summary({
        status: 'active_faults',
        activeFaultCount: 1,
        worstSeverityBand: 'warning',
        activeFaultPreview: [
          {
            code: 'P0420',
            label: 'Catalyst',
            category: 'Powertrain',
            severity: 'medium',
            severityRaw: 'WARNING',
            severityBand: 'warning',
          },
        ],
      } as Partial<DtcSummaryForCoreRead>),
    });

    expect(dto.activeFaultCount).toBe(1);
    expect(dto.worstSeverityBand).toBe('warning');
    expect(dto.activeFaultPreview).toEqual([
      { code: 'P0420', category: 'Powertrain', severityBand: 'warning' },
    ]);
    expect(dto.activeFaultPreview[0]).not.toHaveProperty('label');
  });

  it('active_faults preserves unknown severity band', () => {
    const dto = toCoreDtcReadV1({
      ...base,
      summary: summary({
        status: 'active_faults',
        activeFaultCount: 1,
        worstSeverityBand: 'unknown',
        activeFaultPreview: [
          {
            code: 'U0100',
            label: 'Unknown',
            category: 'Network',
            severity: 'low',
            severityRaw: 'INFO',
            severityBand: 'unknown',
          },
        ],
      } as Partial<DtcSummaryForCoreRead>),
    });

    expect(dto.worstSeverityBand).toBe('unknown');
    expect(dto.activeFaultPreview[0].severityBand).toBe('unknown');
  });
});

describe('toCoreDtcReadV1 — contract version', () => {
  it('sets core.dtc.read.v1', () => {
    const dto = toCoreDtcReadV1({
      organizationId: ORG,
      vehicleId: VEH,
      productSlug: PRODUCT,
      summary: summary(),
    });
    expect(dto.version).toBe(CORE_DTC_READ_CONTRACT_VERSION);
  });
});

describe('toCoreDtcReadV1 — Opus minor-closeout (M1–M3)', () => {
  const base = {
    organizationId: ORG,
    vehicleId: VEH,
    productSlug: PRODUCT,
  };

  it('M1: unknown upstream status -> unavailable fail-closed', () => {
    const dto = toCoreDtcReadV1({
      ...base,
      summary: summary({
        status: 'bogus' as DtcSummaryForCoreRead['status'],
        isStale: false,
        activeFaultCount: 5,
        activeFaultPreview: [
          {
            code: 'P0001',
            label: 'x',
            category: 'Powertrain',
            severity: 'high',
            severityRaw: 'CRITICAL',
            severityBand: 'critical',
          },
        ],
      }),
    });

    expect(dto.monitoringStatus).toBe('unavailable');
    expect(dto.isStale).toBe(true);
    expect(dto.activeFaultCount).toBeNull();
    expect(dto.worstSeverityBand).toBeNull();
    expect(dto.activeFaultPreview).toEqual([]);
  });

  it('M1: missing upstream status -> unavailable fail-closed', () => {
    const dto = toCoreDtcReadV1({
      ...base,
      summary: {
        ...summary(),
        status: undefined as unknown as DtcSummaryForCoreRead['status'],
      },
    });

    expect(dto.monitoringStatus).toBe('unavailable');
    expect(dto.isStale).toBe(true);
    expect(dto.activeFaultCount).toBeNull();
    expect(dto.activeFaultPreview).toEqual([]);
  });

  it('M2: clean + isStale=true -> stale fail-closed', () => {
    const dto = toCoreDtcReadV1({
      ...base,
      summary: summary({
        status: 'clean',
        isStale: true,
        activeFaultCount: 0,
      }),
    });

    expect(dto.monitoringStatus).toBe('stale');
    expect(dto.isStale).toBe(true);
    expect(dto.activeFaultCount).toBeNull();
    expect(dto.activeFaultPreview).toEqual([]);
  });

  it('M2: active_faults + isStale=true -> stale fail-closed', () => {
    const dto = toCoreDtcReadV1({
      ...base,
      summary: summary({
        status: 'active_faults',
        isStale: true,
        activeFaultCount: 2,
        activeFaultPreview: [
          {
            code: 'P0301',
            label: 'Misfire',
            category: 'Powertrain',
            severity: 'high',
            severityRaw: 'CRITICAL',
            severityBand: 'critical',
          },
        ],
      } as Partial<DtcSummaryForCoreRead>),
    });

    expect(dto.monitoringStatus).toBe('stale');
    expect(dto.isStale).toBe(true);
    expect(dto.activeFaultCount).toBeNull();
    expect(dto.activeFaultPreview).toEqual([]);
  });

  it('M2: active_faults + missing freshness (isStale undefined) -> stale', () => {
    const dto = toCoreDtcReadV1({
      ...base,
      summary: summary({
        status: 'active_faults',
        activeFaultCount: 1,
        isStale: undefined as unknown as boolean,
        activeFaultPreview: [
          {
            code: 'P0420',
            label: 'Catalyst',
            category: 'Powertrain',
            severity: 'medium',
            severityRaw: 'WARNING',
            severityBand: 'warning',
          },
        ],
      } as Partial<DtcSummaryForCoreRead>),
    });

    expect(dto.monitoringStatus).toBe('stale');
    expect(dto.isStale).toBe(true);
    expect(dto.activeFaultCount).toBeNull();
    expect(dto.activeFaultPreview).toEqual([]);
  });

  it('M2: stale status + contradictory freshness (isStale=false) -> fail-closed stale', () => {
    const dto = toCoreDtcReadV1({
      ...base,
      summary: summary({
        status: 'stale',
        isStale: false,
        activeFaultCount: 3,
        worstSeverityBand: 'critical',
        activeFaultPreview: [
          {
            code: 'P0301',
            label: 'Misfire',
            category: 'Powertrain',
            severity: 'high',
            severityRaw: 'CRITICAL',
            severityBand: 'critical',
          },
        ],
      } as Partial<DtcSummaryForCoreRead>),
    });

    expect(dto.monitoringStatus).toBe('stale');
    expect(dto.isStale).toBe(true);
    expect(dto.activeFaultCount).toBeNull();
    expect(dto.activeFaultPreview).toEqual([]);
  });

  it('M3: four or more upstream preview items -> maximum three', () => {
    const previewItems = Array.from({ length: 5 }, (_, i) => ({
      code: `P042${i}`,
      label: `Fault ${i}`,
      category: 'Powertrain',
      severity: 'medium' as const,
      severityRaw: 'WARNING',
      severityBand: 'warning' as const,
    }));

    const dto = toCoreDtcReadV1({
      ...base,
      summary: summary({
        status: 'active_faults',
        activeFaultCount: 5,
        worstSeverityBand: 'warning',
        activeFaultPreview: previewItems,
      } as Partial<DtcSummaryForCoreRead>),
    });

    expect(dto.activeFaultPreview).toHaveLength(3);
    expect(dto.activeFaultPreview.map((p) => p.code)).toEqual(['P0420', 'P0421', 'P0422']);
  });
});
