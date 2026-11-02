import type { MasterApdsOverviewDto } from '../../intelligence/apds-master-intelligence-api.types';
import type { MasterVsiFleetOverviewDto, MasterVsiProfileSummaryDto } from '../../intelligence/vsi-master-intelligence-api.types';

/** Safe read-only fixture IDs for navigation and presentation tests (not production). */
export const VEHICLE_DETAIL_QA_ORG = 'faa710c9-6d91-4079-a7d5-91fdccdec14a';
export const VEHICLE_DETAIL_QA_LINK = '9ff5e350-cd4b-4e3a-956a-4f1770b017f2';
export const VEHICLE_DETAIL_QA_DEVICE = 'b2c3d4e5-f6a7-4890-b123-456789abcdef';

export const QA_VEHICLE_TESLA_MODEL3 = '11111111-1111-4111-8111-111111111101';
export const QA_VEHICLE_VW_TIGUAN = '22222222-2222-4222-8222-222222222202';
export const QA_VEHICLE_AUDI_A4 = '33333333-3333-4333-8333-333333333303';
export const QA_VEHICLE_VW_ARTEON = '44444444-4444-4444-8444-444444444404';

function profile(partial: Partial<MasterVsiProfileSummaryDto> & Pick<MasterVsiProfileSummaryDto, 'providerSourceLinkId'>): MasterVsiProfileSummaryDto {
  return {
    providerIdentity: 'dimo',
    provider: 'DIMO',
    profileRevision: 1,
    profileContractVersion: 'V1',
    evaluatedAt: '2026-10-28T12:00:00.000Z',
    lastMaterializedSourceTimestamp: '2026-10-28T11:00:00.000Z',
    lastMaterializedProviderFetchAt: '2026-10-28T11:05:00.000Z',
    profileLimitations: [],
    lvStandbyProfile: 'UNKNOWN',
    lvClassificationDecisionCode: null,
    lvEvidenceConfidence: null,
    rpmActiveProfile: 'UNKNOWN',
    rpmApplicability: 'UNKNOWN',
    rpmClassificationDecisionCode: null,
    observedDensityLabel: null,
    evaluationBlocked: false,
    evaluationBlockedCodes: [],
    ...partial,
  };
}

export const VSI_OVERVIEW_BY_VEHICLE: Record<string, MasterVsiFleetOverviewDto> = {
  [QA_VEHICLE_TESLA_MODEL3]: {
    organizationId: VEHICLE_DETAIL_QA_ORG,
    vehicleId: QA_VEHICLE_TESLA_MODEL3,
    profiles: [
      profile({
        providerSourceLinkId: VEHICLE_DETAIL_QA_LINK,
        rpmApplicability: 'NOT_APPLICABLE',
        rpmActiveProfile: 'UNKNOWN',
        lvStandbyProfile: 'UNKNOWN',
      }),
    ],
  },
  [QA_VEHICLE_VW_TIGUAN]: {
    organizationId: VEHICLE_DETAIL_QA_ORG,
    vehicleId: QA_VEHICLE_VW_TIGUAN,
    profiles: [
      profile({
        providerSourceLinkId: VEHICLE_DETAIL_QA_LINK,
        lvStandbyProfile: 'LV_8H_OBSERVED',
        rpmActiveProfile: 'RPM_1HZ',
        rpmApplicability: 'APPLICABLE',
      }),
    ],
  },
  [QA_VEHICLE_AUDI_A4]: {
    organizationId: VEHICLE_DETAIL_QA_ORG,
    vehicleId: QA_VEHICLE_AUDI_A4,
    profiles: [
      profile({
        providerSourceLinkId: VEHICLE_DETAIL_QA_LINK,
        rpmActiveProfile: 'RPM_STANDARD',
        rpmApplicability: 'APPLICABLE',
        lvStandbyProfile: 'LV_24H_OBSERVED',
      }),
    ],
  },
  [QA_VEHICLE_VW_ARTEON]: {
    organizationId: VEHICLE_DETAIL_QA_ORG,
    vehicleId: QA_VEHICLE_VW_ARTEON,
    profiles: [
      profile({
        providerSourceLinkId: VEHICLE_DETAIL_QA_LINK,
        lvStandbyProfile: 'LV_8H_OBSERVED',
        rpmActiveProfile: 'RPM_STANDARD',
        rpmApplicability: 'APPLICABLE',
      }),
    ],
  },
};

export const APDS_OVERVIEW_BY_VEHICLE: Record<string, MasterApdsOverviewDto> = {
  [QA_VEHICLE_TESLA_MODEL3]: {
    organizationId: VEHICLE_DETAIL_QA_ORG,
    vehicleId: QA_VEHICLE_TESLA_MODEL3,
    providerSourceLinkId: VEHICLE_DETAIL_QA_LINK,
    availability: 'NOT_ACTIVATED',
    availabilityExplanation: [],
    activeEpoch: null,
    latestEpoch: null,
    latestDecision: null,
    decisionCountForVehicle: 0,
  },
  [QA_VEHICLE_VW_TIGUAN]: {
    organizationId: VEHICLE_DETAIL_QA_ORG,
    vehicleId: QA_VEHICLE_VW_TIGUAN,
    providerSourceLinkId: VEHICLE_DETAIL_QA_LINK,
    availability: 'AVAILABLE',
    availabilityExplanation: [],
    activeEpoch: null,
    latestEpoch: null,
    latestDecision: {
      id: 'd1',
      opportunityId: 'opp-tiguan',
      opportunityIdPrefix: 'opp-tig***',
      decisionAt: '2026-10-27T10:00:00.000Z',
      policyVersion: 'P25_APD_B2_V1',
      profileVersion: '1',
      profileClass: 'LTE_R1',
      shadowExecutionVersion: '1',
      decision: 'ALLOW',
      reason: 'OK',
      activationEpochIdPrefix: null,
      simulatedNextPollAt: '2026-10-27T11:00:00.000Z',
      simulatedNextPollAtIsNotExecutedPoll: true,
      realPollIdPrefix: null,
      realPollStatus: null,
      realPollLinkStatus: 'NOT_LINKED',
      reconciliation: null,
    },
    decisionCountForVehicle: 1,
  },
  [QA_VEHICLE_AUDI_A4]: {
    organizationId: VEHICLE_DETAIL_QA_ORG,
    vehicleId: QA_VEHICLE_AUDI_A4,
    providerSourceLinkId: VEHICLE_DETAIL_QA_LINK,
    availability: 'AVAILABLE',
    availabilityExplanation: [],
    activeEpoch: null,
    latestEpoch: null,
    latestDecision: null,
    decisionCountForVehicle: 0,
  },
  [QA_VEHICLE_VW_ARTEON]: {
    organizationId: VEHICLE_DETAIL_QA_ORG,
    vehicleId: QA_VEHICLE_VW_ARTEON,
    providerSourceLinkId: VEHICLE_DETAIL_QA_LINK,
    availability: 'NO_DECISIONS_CAPTURED',
    availabilityExplanation: [],
    activeEpoch: null,
    latestEpoch: null,
    latestDecision: null,
    decisionCountForVehicle: 0,
  },
};

export const PHYSICAL_DEVICE_VEHICLES = new Set([
  QA_VEHICLE_VW_TIGUAN,
  QA_VEHICLE_AUDI_A4,
  QA_VEHICLE_VW_ARTEON,
]);
