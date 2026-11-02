export type CvSection = 'overview' | 'vehicles' | 'import';

export type RegistrationState = 'registered' | 'unregistered';
export type RegistryLifecycleFilter = 'ACTIVE' | 'OFFBOARDED' | 'ARCHIVED' | 'all';
export type VehicleRegistryLifecycle = 'ACTIVE' | 'OFFBOARDED' | 'ARCHIVED';
export type IntegrationConnectivity = 'connected' | 'disconnected' | 'error' | 'none';
export type TelemetryFreshness = 'live' | 'standby' | 'signal_delayed' | 'offline' | 'no_signal';
export type IntegrityState = 'healthy' | 'attention' | 'conflict';
export type VehicleAttentionSeverity = 'none' | 'info' | 'warning' | 'critical';

export interface VehicleAttentionSummary {
  severity: VehicleAttentionSeverity;
  primaryReason: string | null;
  reasonCount: number;
}

export interface VehicleOperationalRowDto {
  vehicleId: string | null;
  dimoVehicleId: string | null;
  displayTitle: string;
  displaySubtitle: string;
  vin: string | null;
  licensePlate: string | null;
  make: string;
  model: string;
  year: number | null;
  organizationId: string | null;
  organizationName: string | null;
  registrationState: RegistrationState;
  registryLifecycle?: VehicleRegistryLifecycle | null;
  ownership: 'assigned' | 'unassigned' | 'conflict';
  dimoLinkStatus: 'linked' | 'unlinked' | 'conflict';
  integrationConnectivity: IntegrationConnectivity;
  integrationConnectivityLabel: string;
  telemetryFreshness: TelemetryFreshness;
  telemetryLabel: string;
  telemetryObservedAtIso: string | null;
  telemetryComputedAt: string;
  integrity: IntegrityState;
  attention: VehicleAttentionSummary;
  lastSignalRelative: string | null;
}

export interface VehicleAttentionItem {
  code: string;
  severity: VehicleAttentionSeverity;
  reason: string;
  source: string;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
  drilldown: {
    section: 'mapping' | 'connectivity' | 'telemetry' | 'pipeline' | 'import';
    vehicleId?: string | null;
    dimoVehicleId?: string | null;
  };
}

export interface VehicleOperationalDetailDto extends VehicleOperationalRowDto {
  pipeline: {
    lastSuccessfulIngestAt: string | null;
    lastPollStatus: string | null;
    lastPollAt: string | null;
    lastProcessingAt: string | null;
    stale: boolean;
  };
  mapping: {
    dimoVehicleId: string | null;
    dimoExternalId: string | null;
    tokenIdMasked: string | null;
    connectionStatus: string | null;
    mirrorIntegrationConnectivity?: IntegrationConnectivity;
    mirrorIntegrationConnectivityLabel?: string;
    syncedAt: string | null;
    deviceType: string | null;
  };
  authorization: {
    state: IntegrationConnectivity;
    platformDimoDegraded: boolean;
    note: string | null;
  };
  activeIssues: VehicleAttentionItem[];
  auditEvents: Array<{
    id: string;
    action: string;
    label: string;
    occurredAt: string;
    actorName: string | null;
  }>;
  moduleErrors: string[];
}

export interface VehiclesOperationalOverviewDto {
  generatedAt: string;
  platformDimoDegraded: boolean;
  platformDimoMessage: string | null;
  counts: {
    registered: number;
    registeredOffboarded: number;
    registeredArchived: number;
    registeredAll: number;
    unregistered: number;
    withAttention: number;
    dimoLinked: number;
  };
  freshness: Record<TelemetryFreshness, number>;
  attentionQueue: VehicleAttentionQueueItemDto[];
}

export interface VehicleAttentionQueueItemDto {
  code: string;
  severity: VehicleAttentionSeverity;
  reason: string;
  vehicleCount: number;
  sampleVehicleId: string | null;
  sampleDimoVehicleId: string | null;
  sampleOrganizationName: string | null;
  drilldownSection: VehicleAttentionItem['drilldown']['section'];
}

export interface VehiclesOperationalQuery {
  page?: number;
  limit?: number;
  q?: string;
  organizationId?: string;
  registrationState?: RegistrationState | 'all';
  registryLifecycle?: RegistryLifecycleFilter;
  integrationConnectivity?: IntegrationConnectivity | 'all';
  telemetryFreshness?: TelemetryFreshness | 'all';
  attention?: 'true' | 'false' | 'all';
  sort?: 'attention' | 'lastSignal' | 'organization' | 'vehicle';
}

export interface PaginatedVehiclesOperationalResponse {
  data: VehicleOperationalRowDto[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface VehicleImportPreflightDto {
  canProceed: boolean;
  dimoVehicle: {
    id: string;
    vin: string | null;
    make: string | null;
    model: string | null;
    connectionStatus: string;
  };
  organization: {
    id: string;
    companyName: string;
  };
  conflict: {
    code: string;
    message: string;
    existingVehicleId: string | null;
    existingOrganizationId: string | null;
    existingOrganizationName: string | null;
  } | null;
  effects: string[];
}
