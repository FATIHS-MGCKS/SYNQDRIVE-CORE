export type MasterPdiDeviceIntelligenceDto = {
  identity: {
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
    physicalR1Applicability: string;
  };
  assignmentHistory: Array<{
    id: string;
    assignmentKind: string;
    vehicleId: string | null;
    organizationId: string | null;
    effectiveFrom: string;
    effectiveTo: string | null;
    actorUserId: string | null;
  }>;
  auditHistory: Array<{
    id: string;
    eventKind: string;
    createdAt: string;
    actorUserId: string | null;
    evidenceSummary: string;
  }>;
  connectionEpisodes: {
    items: Array<{
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
    }>;
    page: { limit: number; nextCursor: string | null; hasMore: boolean };
  };
  driftHistory: {
    availability: string;
    availabilityExplanation: string[];
    liveObservation: {
      observedAt: string;
      vehicleIdForObservation: string;
      expectedSerialMasked: string;
      observedSerialMasked: string | null;
      driftReasonCode: string;
      confidence: string;
      evidenceStale: boolean;
      observationIsLiveSnapshotNotHistory: true;
      observationVehicleIsNotImpliedForHistoricalAssignments: true;
    } | null;
    persistedHistoricalEntries: [];
    noDriftRecordsIsNotVerifiedNoDrift: true;
  };
  providerBindings: Array<{
    providerSourceLinkId: string;
    providerIdentity: string;
    linkStatus: string | null;
    attributionScope?: 'CURRENT_VEHICLE_ONLY';
    historicalLinkAttributionRequiresPersistedAssignment?: true;
  }>;
  timeline: Array<{
    kind: string;
    at: string;
    label: string;
    vehicleId: string | null;
    organizationId: string | null;
    source: string;
  }>;
  crossLinkContext: {
    physicalDeviceId: string;
    organizationId: string | null;
    vehicleId: string | null;
    providerSourceLinkId: string | null;
  };
  limitations: string[];
};
