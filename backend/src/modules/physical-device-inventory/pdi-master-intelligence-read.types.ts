import type {
  PhysicalDeviceAssignmentHistoryItemDto,
  PhysicalDeviceAuditHistoryItemDto,
} from './physical-device-inventory.types';

export type MasterPdiPhysicalR1Applicability =
  | 'NOT_APPLICABLE'
  | 'APPLICABLE_INSTALLED'
  | 'APPLICABLE_NOT_INSTALLED';

export type MasterPdiDriftHistoryAvailability =
  | 'NOT_PERSISTED'
  | 'LIVE_OBSERVATION_ONLY'
  | 'NOT_APPLICABLE';

export type MasterPdiTimelineKind =
  | 'ASSIGNMENT_START'
  | 'ASSIGNMENT_END'
  | 'AUDIT_EVENT'
  | 'CONNECTION_EPISODE_OPEN'
  | 'CONNECTION_EPISODE_RESOLVE';

export type MasterPdiIdentitySummaryDto = {
  physicalDeviceId: string;
  modelCode: string;
  hardwareTypeLabel: string;
  status: string;
  identityStatus: string;
  serialNumberMasked: string | null;
  imeiMasked: string | null;
  ownerOrganizationId: string | null;
  currentVehicleId: string | null;
  currentOrganizationId: string | null;
  identityEvidenceSummary: string | null;
  identityEvaluatedAt: string | null;
  identityEvidenceSource: string;
  currentSnapshotIsNotHistoricalObservation: true;
  physicalR1Applicability: MasterPdiPhysicalR1Applicability;
};

export type MasterPdiProviderBindingDto = {
  providerSourceLinkId: string;
  providerIdentity: string;
  linkStatus: string | null;
  attributionScope: 'CURRENT_VEHICLE_ONLY';
  historicalLinkAttributionRequiresPersistedAssignment: true;
};

export type MasterPdiConnectionEpisodeDto = {
  idPrefix: string;
  organizationId: string;
  vehicleId: string;
  status: string;
  openedReason: string;
  openedAt: string;
  resolvedAt: string | null;
  resolutionMethod: string | null;
  episodeIsNotRealPoll: true;
  attributionNote: string;
};

export type MasterPdiConnectionEpisodePageDto = {
  items: MasterPdiConnectionEpisodeDto[];
  page: { limit: number; nextCursor: string | null; hasMore: boolean };
};

export type MasterPdiDriftObservationDto = {
  observedAt: string;
  vehicleIdForObservation: string;
  expectedSerialMasked: string;
  observedSerialMasked: string | null;
  driftReasonCode: string;
  confidence: string;
  evidenceStale: boolean;
  observationIsLiveSnapshotNotHistory: true;
  observationVehicleIsNotImpliedForHistoricalAssignments: true;
};

export type MasterPdiDriftHistoryDto = {
  availability: MasterPdiDriftHistoryAvailability;
  availabilityExplanation: string[];
  liveObservation: MasterPdiDriftObservationDto | null;
  persistedHistoricalEntries: [];
  noDriftRecordsIsNotVerifiedNoDrift: true;
};

export type MasterPdiTimelineItemDto = {
  kind: MasterPdiTimelineKind;
  at: string;
  label: string;
  vehicleId: string | null;
  organizationId: string | null;
  source: 'PERSISTED_ASSIGNMENT' | 'PERSISTED_AUDIT' | 'PERSISTED_EPISODE';
  episodeIdPrefix?: string;
};

export type MasterPdiCrossLinkContextDto = {
  physicalDeviceId: string;
  organizationId: string | null;
  vehicleId: string | null;
  providerSourceLinkId: string | null;
};

export type MasterPdiDeviceIntelligenceDto = {
  identity: MasterPdiIdentitySummaryDto;
  assignmentHistory: PhysicalDeviceAssignmentHistoryItemDto[];
  auditHistory: PhysicalDeviceAuditHistoryItemDto[];
  connectionEpisodes: MasterPdiConnectionEpisodePageDto;
  driftHistory: MasterPdiDriftHistoryDto;
  providerBindings: MasterPdiProviderBindingDto[];
  timeline: MasterPdiTimelineItemDto[];
  crossLinkContext: MasterPdiCrossLinkContextDto;
  limitations: string[];
};
