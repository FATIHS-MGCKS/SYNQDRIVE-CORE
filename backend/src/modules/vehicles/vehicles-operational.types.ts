import type {
  IntegrationConnectivity,
  IntegrityState,
  OwnershipState,
  VehicleAttentionItem,
  VehicleAttentionSeverity,
} from './vehicle-attention.util';
import type { TelemetryFreshness } from './vehicle-state-interpreter';

export type RegistrationState = 'registered' | 'unregistered';

export type VehicleRegistryLifecycleFilter = 'ACTIVE' | 'OFFBOARDED' | 'ARCHIVED' | 'all';

export interface VehiclesOperationalQueryDto {
  page?: number;
  limit?: number;
  q?: string;
  organizationId?: string;
  registrationState?: RegistrationState | 'all';
  /** Registered rows only; default ACTIVE when omitted (VO-5C P2A). */
  registryLifecycle?: VehicleRegistryLifecycleFilter;
  integrationConnectivity?: IntegrationConnectivity | 'all';
  telemetryFreshness?: TelemetryFreshness | 'all';
  attention?: 'true' | 'false' | 'all';
  sort?: 'attention' | 'lastSignal' | 'organization' | 'vehicle';
}

export interface VehicleOperationalRowDto {
  /** Registry lifecycle for Master Admin cutover (VO-5C); ACTIVE vs OFFBOARDED visibility. */
  registryLifecycle?: 'ACTIVE' | 'OFFBOARDED' | 'ARCHIVED' | null;
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
  ownership: OwnershipState;
  dimoLinkStatus: 'linked' | 'unlinked' | 'conflict';
  integrationConnectivity: IntegrationConnectivity;
  integrationConnectivityLabel: string;
  telemetryFreshness: TelemetryFreshness;
  telemetryLabel: string;
  telemetryObservedAtIso: string | null;
  telemetryComputedAt: string;
  integrity: IntegrityState;
  attention: {
    severity: VehicleAttentionSeverity;
    primaryReason: string | null;
    reasonCount: number;
  };
  lastSignalRelative: string | null;
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
    /** Raw `dimo_vehicles.connection_status` (last provider mirror observation). */
    connectionStatus: string | null;
    /** Derived from mirror only — not SynqDrive effective access. */
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
    /** Registered vehicles in ACTIVE registry lifecycle (default list filter). */
    registered: number;
    registeredOffboarded: number;
    registeredArchived: number;
    /** All registered vehicle rows regardless of lifecycle. */
    registeredAll: number;
    unregistered: number;
    withAttention: number;
    /** ACTIVE registered vehicles with a DIMO link. */
    dimoLinked: number;
  };
  freshness: {
    live: number;
    standby: number;
    signal_delayed: number;
    offline: number;
    no_signal: number;
  };
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
