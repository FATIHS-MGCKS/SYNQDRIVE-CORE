import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api';
import type {
  MasterVsiFleetOverviewDto,
  MasterVsiProfileDetailDto,
  MasterVsiRevisionAsOfDto,
  MasterVsiRevisionHistoryPageDto,
} from './vsi-master-intelligence-api.types';

export type VsiMasterIntelligenceLoadState = {
  overview: MasterVsiFleetOverviewDto | null;
  profile: MasterVsiProfileDetailDto | null;
  revisions: MasterVsiRevisionHistoryPageDto | null;
  revisionAsOf: MasterVsiRevisionAsOfDto | null;
  capabilityExplanation: unknown | null;
  loading: boolean;
  error: string | null;
  revisionsError: string | null;
  revisionsLoading: boolean;
};

const emptyLoad: VsiMasterIntelligenceLoadState = {
  overview: null,
  profile: null,
  revisions: null,
  revisionAsOf: null,
  capabilityExplanation: null,
  loading: false,
  error: null,
  revisionsError: null,
  revisionsLoading: false,
};

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : 'VSI data could not be loaded';
}

export function useVsiMasterIntelligenceData(input: {
  orgId: string | null;
  vehicleId: string | null;
  providerSourceLinkId: string | null;
  asOf: string | null;
}) {
  const { orgId, vehicleId, providerSourceLinkId, asOf } = input;
  const [state, setState] = useState<VsiMasterIntelligenceLoadState>(emptyLoad);
  const loadGenerationRef = useRef(0);

  const loadRevisionsForLink = useCallback(
    async (
      orgIdArg: string,
      vehicleIdArg: string,
      linkId: string,
      asOfArg: string | null,
      generation: number,
    ) => {
      const isCurrent = () => loadGenerationRef.current === generation;
      setState((prev) =>
        isCurrent() ? { ...prev, revisionsLoading: true, revisionsError: null } : prev,
      );
      try {
        const revisions = await api.admin.masterIntelligenceVsi.revisions(
          orgIdArg,
          vehicleIdArg,
          linkId,
          {
            limit: 20,
          },
        );
        if (!isCurrent()) return;
        let revisionAsOf: MasterVsiRevisionAsOfDto | null = null;
        if (asOfArg) {
          try {
            revisionAsOf = await api.admin.masterIntelligenceVsi.revisionAsOf(
              orgIdArg,
              vehicleIdArg,
              linkId,
              asOfArg,
            );
          } catch {
            revisionAsOf = null;
          }
        }
        if (!isCurrent()) return;
        setState((prev) => ({
          ...prev,
          revisions,
          revisionAsOf,
          revisionsLoading: false,
          revisionsError: null,
        }));
      } catch (e) {
        if (!isCurrent()) return;
        setState((prev) => ({
          ...prev,
          revisions: null,
          revisionAsOf: null,
          revisionsLoading: false,
          revisionsError: errorMessage(e),
        }));
      }
    },
    [],
  );

  const load = useCallback(async () => {
    if (!orgId || !vehicleId) {
      loadGenerationRef.current += 1;
      setState({ ...emptyLoad });
      return;
    }

    const generation = ++loadGenerationRef.current;
    const isCurrent = () => loadGenerationRef.current === generation;

    setState((prev) => ({
      ...prev,
      loading: true,
      error: null,
      revisionsError: null,
      revisionsLoading: false,
    }));
    try {
      const overview = await api.admin.masterIntelligenceVsi.overview(orgId, vehicleId);
      if (!isCurrent()) return;
      let profile: MasterVsiProfileDetailDto | null = null;
      let capabilityExplanation: unknown | null = null;

      const linkId = providerSourceLinkId ?? overview.profiles[0]?.providerSourceLinkId ?? null;
      if (linkId) {
        try {
          profile = await api.admin.masterIntelligenceVsi.profile(orgId, vehicleId, linkId);
        } catch (e) {
          if (!isCurrent()) return;
          setState({
            ...emptyLoad,
            overview,
            loading: false,
            error: errorMessage(e),
          });
          return;
        }

        if (!isCurrent()) return;

        try {
          capabilityExplanation = await api.admin.masterIntelligenceVsi.capabilityResolver(
            orgId,
            vehicleId,
            linkId,
            {
              consumerModule: 'apds',
              featureId: 'shadow_demand_profile_read',
              evaluationTime: profile.evaluatedAt,
            },
          );
        } catch {
          capabilityExplanation = null;
        }

        if (!isCurrent()) return;

        setState({
          overview,
          profile,
          revisions: null,
          revisionAsOf: null,
          capabilityExplanation,
          loading: false,
          error: null,
          revisionsError: null,
          revisionsLoading: true,
        });

        await loadRevisionsForLink(orgId, vehicleId, linkId, asOf, generation);
        return;
      }

      setState({
        overview,
        profile,
        revisions: null,
        revisionAsOf: null,
        capabilityExplanation,
        loading: false,
        error: null,
        revisionsError: null,
        revisionsLoading: false,
      });
    } catch (e) {
      if (!isCurrent()) return;
      setState({
        ...emptyLoad,
        loading: false,
        error: errorMessage(e),
      });
    }
  }, [orgId, vehicleId, providerSourceLinkId, asOf, loadRevisionsForLink]);

  const refreshRevisions = useCallback(async () => {
    if (!orgId || !vehicleId) return;
    const linkId =
      providerSourceLinkId ??
      state.overview?.profiles[0]?.providerSourceLinkId ??
      null;
    if (!linkId) return;
    const generation = ++loadGenerationRef.current;
    await loadRevisionsForLink(orgId, vehicleId, linkId, asOf, generation);
  }, [
    orgId,
    vehicleId,
    providerSourceLinkId,
    asOf,
    state.overview,
    loadRevisionsForLink,
  ]);

  useEffect(() => {
    void load();
  }, [load]);

  return { ...state, refresh: load, refreshRevisions };
}
