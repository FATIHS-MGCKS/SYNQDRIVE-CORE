// @vitest-environment happy-dom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act } from 'react';
import { renderHook } from '../../test/renderHook';
import { api } from '../../lib/api';
import { useVsiMasterFsdReadData } from './useVsiMasterFsdReadData';

vi.mock('../../lib/api', () => ({
  api: {
    admin: {
      masterIntelligenceVsi: {
        fsd: {
          summary: vi.fn(),
          signals: vi.fn(),
          runs: vi.fn(),
          runInspector: vi.fn(),
        },
      },
    },
  },
}));

const ORG = 'org-1';
const VEH = 'veh-1';
const LINK = 'link-1';

function summaryDto() {
  return {
    contractVersion: 'vsi-master-fsd-read-v1' as const,
    organizationId: ORG,
    vehicleId: VEH,
    providerSourceLinkId: LINK,
    catalog: {
      availability: 'AUTHORITATIVE_LIVE' as const,
      provenanceClass: 'LIVE_DIMO_VERIFIED' as const,
      declaredSignalCount: 3,
      authoritativeRunId: 'run-1',
      declaredCatalogFingerprint: null,
      rejectionReason: null,
      selectionLimitation: null,
    },
    execution: {
      fsd3: {
        discoveryStream: 'FSD3_CATALOG_SNAPSHOT' as const,
        state: 'COMPLETED' as const,
        latestActivityRunId: null,
        latestRunId: 'run-1',
        lastCompletedAt: '2026-01-01T00:00:00.000Z',
      },
      fsd4: {
        discoveryStream: 'FSD4_HISTORICAL' as const,
        state: 'NOT_YET_EXECUTED' as const,
        latestRunId: null,
        lastCompletedAt: null,
        historicalCrossStreamLink: 'NOT_AVAILABLE' as const,
      },
    },
    evidence: {
      snapshot: 'AVAILABLE' as const,
      historical: 'NOT_EXECUTED' as const,
      historicalCrossStreamLimitation: null,
    },
    invalidation: { isInvalidated: false, invalidatedAt: null, supersededByRunId: null },
    vsiProfileCompositionHints: { organizationId: ORG, vehicleId: VEH, providerSourceLinkId: LINK },
  };
}

describe('useVsiMasterFsdReadData', () => {
  beforeEach(() => {
    vi.mocked(api.admin.masterIntelligenceVsi.fsd.summary).mockReset();
    vi.mocked(api.admin.masterIntelligenceVsi.fsd.runInspector).mockReset();
  });

  it('loads summary once per stable scope', async () => {
    vi.mocked(api.admin.masterIntelligenceVsi.fsd.summary).mockResolvedValue(summaryDto());

    const { result, rerender } = renderHook(() =>
      useVsiMasterFsdReadData({ orgId: ORG, vehicleId: VEH, providerSourceLinkId: LINK }),
    );

    await vi.waitFor(() => expect(result.current.summary).not.toBeNull());
    expect(api.admin.masterIntelligenceVsi.fsd.summary).toHaveBeenCalledTimes(1);

    rerender();
    rerender();
    expect(api.admin.masterIntelligenceVsi.fsd.summary).toHaveBeenCalledTimes(1);
    expect(result.current.summary?.catalog.declaredSignalCount).toBe(3);
  });

  it('does not apply stale inspector for wrong run selection', async () => {
    vi.mocked(api.admin.masterIntelligenceVsi.fsd.summary).mockResolvedValue(summaryDto());

    let resolveA: (v: unknown) => void;
    let resolveB: (v: unknown) => void;
    const pendingA = new Promise((r) => {
      resolveA = r;
    });
    const pendingB = new Promise((r) => {
      resolveB = r;
    });

    vi.mocked(api.admin.masterIntelligenceVsi.fsd.runInspector).mockImplementation((_o, _v, _l, runId) => {
      if (runId === 'run-A') return pendingA as Promise<never>;
      return pendingB as Promise<never>;
    });

    const { result } = renderHook(() =>
      useVsiMasterFsdReadData({ orgId: ORG, vehicleId: VEH, providerSourceLinkId: LINK }),
    );

    await vi.waitFor(() => expect(result.current.summary).not.toBeNull());

    void act(() => {
      void result.current.loadInspector('run-A');
    });
    void act(() => {
      void result.current.loadInspector('run-B');
    });

    resolveB!({
      contractVersion: 'vsi-master-fsd-read-v1',
      organizationId: ORG,
      vehicleId: VEH,
      providerSourceLinkId: LINK,
      runId: 'run-B',
      discoveryStream: 'FSD3_CATALOG_SNAPSHOT',
      status: 'COMPLETED',
      stages: [],
      catalogProvenance: {
        class: 'LIVE_DIMO_VERIFIED',
        declaredSignalCount: 1,
        authoritative: true,
        rejectionReason: null,
      },
      ledger: {
        budgetTotal: null,
        budgetByStage: {},
        persistedAttemptCount: 0,
        deduplicatedAttemptKeys: 0,
        outcomeCounts: {},
        malformedCheckpointStages: [],
        reconciliationNote: 'ok',
        attempts: [],
      },
      evidenceCoverage: { snapshot: 'AVAILABLE', historical: 'NOT_EXECUTED', observationCounts: null },
      cadence: { nativePollingFrequencyProven: false, note: 'n/a' },
      aggregationSemantics: { aggregated1sIsProvenNative1Hz: false as const, note: 'n/a' },
    });

    await vi.waitFor(() => expect(result.current.inspector?.runId).toBe('run-B'));

    resolveA!({
      ...summaryDto(),
      runId: 'run-A',
    });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });

    expect(result.current.selectedRunId).toBe('run-B');
    expect(result.current.inspector?.runId).toBe('run-B');
  });

  it('refreshSummary does not leave signals permanently loading', async () => {
    vi.mocked(api.admin.masterIntelligenceVsi.fsd.summary).mockResolvedValue(summaryDto());

    const { result } = renderHook(() =>
      useVsiMasterFsdReadData({ orgId: ORG, vehicleId: VEH, providerSourceLinkId: LINK }),
    );

    await vi.waitFor(() => expect(result.current.summary).not.toBeNull());

    void act(() => {
      void result.current.loadSignalsPage();
    });

    await act(async () => {
      await result.current.refreshSummary();
    });

    expect(result.current.summaryLoading).toBe(false);
  });
});
