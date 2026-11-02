// @vitest-environment happy-dom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, createElement, StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderHook, waitForHook } from '../../test/renderHook';
import { api } from '../../lib/api';
import { useVsiMasterIntelligenceData } from './useVsiMasterIntelligenceData';
import type {
  MasterVsiFleetOverviewDto,
  MasterVsiProfileDetailDto,
  MasterVsiRevisionHistoryPageDto,
} from './vsi-master-intelligence-api.types';

vi.mock('../../lib/api', () => ({
  api: {
    admin: {
      masterIntelligenceVsi: {
        overview: vi.fn(),
        profile: vi.fn(),
        revisions: vi.fn(),
        revisionAsOf: vi.fn(),
        capabilityResolver: vi.fn(),
      },
    },
  },
}));

const ORG = 'org-1';
const VEH_A = 'veh-A';
const VEH_B = 'veh-B';
const LINK_A = 'link-A';
const LINK_B = 'link-B';

function profileSummary(linkId: string) {
  return {
    providerSourceLinkId: linkId,
    providerIdentity: 'dimo:x',
    provider: 'DIMO',
    profileRevision: 1,
    profileContractVersion: 'v2',
    evaluatedAt: '2026-10-28T10:00:00.000Z',
    lastMaterializedSourceTimestamp: null,
    lastMaterializedProviderFetchAt: null,
    profileLimitations: [],
    lvStandbyProfile: 'LV_8H_OBSERVED' as const,
    lvClassificationDecisionCode: null,
    lvEvidenceConfidence: null,
    rpmActiveProfile: 'RPM_1HZ' as const,
    rpmApplicability: 'APPLICABLE' as const,
    rpmClassificationDecisionCode: null,
    observedDensityLabel: null,
    evaluationBlocked: false,
    evaluationBlockedCodes: [],
  };
}

function overviewFor(vehicleId: string, linkId: string): MasterVsiFleetOverviewDto {
  return {
    organizationId: ORG,
    vehicleId,
    profiles: [profileSummary(linkId)],
  };
}

function profileDetail(linkId: string): MasterVsiProfileDetailDto {
  return {
    ...profileSummary(linkId, VEH_A),
    contentFingerprintPrefix: 'abc',
    signals: [],
    fetchTimeIsNotNewSignalProof: true,
  };
}

function revisionsPage(): MasterVsiRevisionHistoryPageDto {
  return {
    captureStatus: 'CAPTURE_ENABLED',
    items: [],
    page: { limit: 20, nextCursor: null, hasMore: false },
  };
}

type VsiInput = {
  orgId: string | null;
  vehicleId: string | null;
  providerSourceLinkId: string | null;
  asOf: string | null;
};

function defaultInput(overrides: Partial<VsiInput> = {}): VsiInput {
  return {
    orgId: ORG,
    vehicleId: VEH_A,
    providerSourceLinkId: null,
    asOf: null,
    ...overrides,
  };
}

function wireHappyPath(vehicleId: string, linkId: string) {
  vi.mocked(api.admin.masterIntelligenceVsi.overview).mockImplementation(async (_o, v) =>
    overviewFor(v, linkId),
  );
  vi.mocked(api.admin.masterIntelligenceVsi.profile).mockImplementation(async (_o, _v, link) =>
    profileDetail(link),
  );
  vi.mocked(api.admin.masterIntelligenceVsi.revisions).mockResolvedValue(revisionsPage());
  vi.mocked(api.admin.masterIntelligenceVsi.capabilityResolver).mockResolvedValue({ ok: true });
  vi.mocked(api.admin.masterIntelligenceVsi.revisionAsOf).mockResolvedValue({
    captureStatus: 'NOT_CAPTURED',
    decisionAt: '2026-10-28T10:00:00.000Z',
    authority: 'test',
    limitations: [],
    queryEvidence: {},
    selectedRevision: null,
  });
}

describe('useVsiMasterIntelligenceData load stability', () => {
  beforeEach(() => {
    vi.mocked(api.admin.masterIntelligenceVsi.overview).mockReset();
    vi.mocked(api.admin.masterIntelligenceVsi.profile).mockReset();
    vi.mocked(api.admin.masterIntelligenceVsi.revisions).mockReset();
    vi.mocked(api.admin.masterIntelligenceVsi.revisionAsOf).mockReset();
    vi.mocked(api.admin.masterIntelligenceVsi.capabilityResolver).mockReset();
    wireHappyPath(VEH_A, LINK_A);
  });

  it('A: initial load once; rerender with new inline input object does not re-fetch', async () => {
    const { result, rerender, unmount } = renderHook(
      (props: VsiInput) => useVsiMasterIntelligenceData(props),
      { initialProps: defaultInput() },
    );

    await waitForHook(() => result.current.loading === false && result.current.overview !== null);
    const overviewCallsAfterLoad = vi.mocked(api.admin.masterIntelligenceVsi.overview).mock.calls.length;

    rerender(defaultInput());
    rerender(defaultInput());
    rerender(defaultInput());

    await act(async () => {
      await new Promise((r) => setTimeout(r, 80));
    });

    expect(vi.mocked(api.admin.masterIntelligenceVsi.overview).mock.calls.length).toBe(
      overviewCallsAfterLoad,
    );
    expect(result.current.loading).toBe(false);
    expect(result.current.overview?.vehicleId).toBe(VEH_A);
    unmount();
  });

  it('B: vehicle change triggers exactly one additional overview fetch', async () => {
    vi.mocked(api.admin.masterIntelligenceVsi.overview).mockImplementation(async (_o, v) => {
      if (v === VEH_B) return overviewFor(VEH_B, LINK_B);
      return overviewFor(VEH_A, LINK_A);
    });
    vi.mocked(api.admin.masterIntelligenceVsi.profile).mockImplementation(async (_o, _v, link) =>
      profileDetail(link),
    );

    const { result, rerender, unmount } = renderHook(
      (props: VsiInput) => useVsiMasterIntelligenceData(props),
      { initialProps: defaultInput() },
    );

    await waitForHook(() => result.current.loading === false && result.current.overview?.vehicleId === VEH_A);
    const callsAfterA = vi.mocked(api.admin.masterIntelligenceVsi.overview).mock.calls.length;

    rerender(defaultInput({ vehicleId: VEH_B }));
    await waitForHook(() => result.current.loading === false && result.current.overview?.vehicleId === VEH_B);

    expect(vi.mocked(api.admin.masterIntelligenceVsi.overview).mock.calls.length).toBe(callsAfterA + 1);
    expect(result.current.overview?.vehicleId).toBe(VEH_B);
    unmount();
  });

  it('C: revision failure keeps overview/profile and surfaces revisionsError without retry loop', async () => {
    vi.mocked(api.admin.masterIntelligenceVsi.revisions).mockRejectedValue(new Error('revisions 500'));

    const { result, unmount } = renderHook((props: VsiInput) => useVsiMasterIntelligenceData(props), {
      initialProps: defaultInput(),
    });

    await waitForHook(
      () =>
        result.current.loading === false &&
        result.current.revisionsLoading === false &&
        result.current.revisionsError !== null,
    );

    const revisionCalls = vi.mocked(api.admin.masterIntelligenceVsi.revisions).mock.calls.length;
    await act(async () => {
      await new Promise((r) => setTimeout(r, 120));
    });

    expect(result.current.overview).not.toBeNull();
    expect(result.current.profile).not.toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.revisionsError).toMatch(/revisions 500/);
    expect(vi.mocked(api.admin.masterIntelligenceVsi.revisions).mock.calls.length).toBe(revisionCalls);
    unmount();
  });

  it('D: rapid vehicle switching — stale overview cannot win', async () => {
    let resolveSlowA!: (v: MasterVsiFleetOverviewDto) => void;
    const slowA = new Promise<MasterVsiFleetOverviewDto>((r) => {
      resolveSlowA = r;
    });

    vi.mocked(api.admin.masterIntelligenceVsi.overview)
      .mockImplementationOnce(async () => slowA)
      .mockImplementation(async (_o, v) => overviewFor(v, v === VEH_B ? LINK_B : LINK_A));

    const { result, rerender, unmount } = renderHook(
      (props: VsiInput) => useVsiMasterIntelligenceData(props),
      { initialProps: defaultInput() },
    );

    rerender(defaultInput({ vehicleId: VEH_B }));
    await waitForHook(() => result.current.loading === false && result.current.overview?.vehicleId === VEH_B);

    await act(async () => {
      resolveSlowA(overviewFor(VEH_A, LINK_A));
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(result.current.overview?.vehicleId).toBe(VEH_B);
    expect(result.current.loading).toBe(false);
    unmount();
  });

  it('E: empty provider links settles without permanent loading', async () => {
    vi.mocked(api.admin.masterIntelligenceVsi.overview).mockResolvedValue({
      organizationId: ORG,
      vehicleId: VEH_A,
      profiles: [],
    });

    const { result, unmount } = renderHook((props: VsiInput) => useVsiMasterIntelligenceData(props), {
      initialProps: defaultInput(),
    });

    await waitForHook(() => result.current.loading === false);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 100));
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.overview?.profiles).toEqual([]);
    expect(result.current.profile).toBeNull();
    expect(vi.mocked(api.admin.masterIntelligenceVsi.profile).mock.calls.length).toBe(0);
    unmount();
  });

  it('F: React StrictMode does not create a self-sustaining request loop', async () => {
    const bagRef: { current: ReturnType<typeof useVsiMasterIntelligenceData> | undefined } = {
      current: undefined,
    };
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root: Root = createRoot(container);
    const props = defaultInput();

    function Harness() {
      // Test harness: capture latest hook return for assertions (not a React ref).
      // eslint-disable-next-line react-hooks/immutability -- vitest StrictMode harness
      bagRef.current = useVsiMasterIntelligenceData(props);
      return null;
    }

    act(() => {
      root.render(createElement(StrictMode, null, createElement(Harness)));
    });

    await waitForHook(() => bagRef.current!.loading === false && bagRef.current!.overview !== null);

    const callsAfterSettle = vi.mocked(api.admin.masterIntelligenceVsi.overview).mock.calls.length;
    expect(callsAfterSettle).toBeLessThanOrEqual(2);

    await act(async () => {
      await new Promise((r) => setTimeout(r, 150));
    });

    expect(vi.mocked(api.admin.masterIntelligenceVsi.overview).mock.calls.length).toBe(callsAfterSettle);
    expect(bagRef.current!.loading).toBe(false);

    act(() => {
      root.unmount();
      container.remove();
    });
  });
});
