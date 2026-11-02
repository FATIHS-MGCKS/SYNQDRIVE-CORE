import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api';
import type {
  MasterApdsDecisionDetailDto,
  MasterApdsDecisionHistoryPageDto,
  MasterApdsEpochHistoryPageDto,
  MasterApdsOverviewDto,
  MasterApdsVsiCorrelationDto,
} from './apds-master-intelligence-api.types';

export function useApdsMasterIntelligenceData(input: {
  orgId: string | null;
  vehicleId: string | null;
  providerSourceLinkId: string | null;
  apdOpportunityId: string | null;
  policyVersion: string | null;
}) {
  const [overview, setOverview] = useState<MasterApdsOverviewDto | null>(null);
  const [epochs, setEpochs] = useState<MasterApdsEpochHistoryPageDto | null>(null);
  const [decisions, setDecisions] = useState<MasterApdsDecisionHistoryPageDto | null>(null);
  const [detail, setDetail] = useState<MasterApdsDecisionDetailDto | null>(null);
  const [vsiCorrelation, setVsiCorrelation] = useState<MasterApdsVsiCorrelationDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { orgId, vehicleId, providerSourceLinkId, apdOpportunityId, policyVersion } = input;
    if (!orgId || !vehicleId) {
      setOverview(null);
      setEpochs(null);
      setDecisions(null);
      setDetail(null);
      setVsiCorrelation(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [overviewRes, epochsRes, decisionsRes] = await Promise.all([
        api.admin.masterIntelligenceApds.overview(orgId, vehicleId, providerSourceLinkId),
        api.admin.masterIntelligenceApds.epochs(orgId, vehicleId, { limit: 20 }),
        api.admin.masterIntelligenceApds.decisions(orgId, vehicleId, {
          limit: 25,
          policyVersion: policyVersion ?? undefined,
        }),
      ]);
      setOverview(overviewRes);
      setEpochs(epochsRes);
      setDecisions(decisionsRes);

      if (apdOpportunityId && policyVersion) {
        const detailRes = await api.admin.masterIntelligenceApds.decisionDetail(
          orgId,
          vehicleId,
          apdOpportunityId,
          policyVersion,
        );
        setDetail(detailRes);
        if (providerSourceLinkId) {
          try {
            const corr = await api.admin.masterIntelligenceApds.vsiCorrelation(
              orgId,
              vehicleId,
              apdOpportunityId,
              {
                providerSourceLinkId,
                policyVersion,
                decisionAt: detailRes.summary.decisionAt,
              },
            );
            setVsiCorrelation(corr);
          } catch {
            setVsiCorrelation(null);
          }
        } else {
          setVsiCorrelation(null);
        }
      } else {
        setDetail(null);
        setVsiCorrelation(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'APDS data could not be loaded');
      setOverview(null);
      setEpochs(null);
      setDecisions(null);
      setDetail(null);
      setVsiCorrelation(null);
    } finally {
      setLoading(false);
    }
  }, [
    input.orgId,
    input.vehicleId,
    input.providerSourceLinkId,
    input.apdOpportunityId,
    input.policyVersion,
  ]);

  useEffect(() => {
    void load();
  }, [load]);

  return { overview, epochs, decisions, detail, vsiCorrelation, loading, error, refresh: load };
}
