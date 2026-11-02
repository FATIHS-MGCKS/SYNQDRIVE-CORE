import {
  Injectable,
  NotFoundException,
  ConflictException,
  Inject,
  Logger,
  forwardRef,
  Optional,
} from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import {
  Vehicle,
  Prisma,
  FuelType,
  VehicleType,
  VehicleStatus,
  VehicleRegistryLifecycle,
  HealthStatus,
  CleaningStatus,
  EnrichmentJobType,
  BatterySourceType,
  BookingStatus,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import {
  acquirePgAdvisoryXactLock,
  vehicleDimoBindingLockKey,
} from '@shared/database/pg-advisory-lock.util';
import { isPrismaUniqueViolation } from '@shared/database/prisma-error.util';
import { RedisService } from '@shared/redis/redis.service';
import { DimoAuthService } from '@modules/dimo/dimo-auth.service';
import { DimoTelemetryService } from '@modules/dimo/dimo-telemetry.service';
import { buildDimoProviderRequestContext } from '@modules/dimo/provider/dimo-provider-request-context.util';
import { VehicleProviderConsentService } from './vehicle-provider-consent.service';
import {
  legacyVehicleDeleteDisabledException,
  legacyVehicleDestructionDisabledException,
} from './legacy-vehicle-destruction.errors';
import { BatteryCapabilityRefreshService } from '@modules/vehicle-intelligence/battery-health/capability-preflight/battery-capability-refresh.service';
import { BatteryCapabilityRefreshTrigger } from '@modules/vehicle-intelligence/battery-health/capability-preflight/battery-capability-lifecycle.policy';
import dimoConfig from '@config/dimo.config';
import {
  parsePagination,
  buildPaginatedResult,
  PaginationParams,
  PaginatedResult,
} from '@shared/utils/pagination';
import { interpretVehicleState } from './vehicle-state-interpreter';
import {
  hvMasterSpecToFormFields,
  mergeHvMasterSpecification,
  parseVehicleHvMasterSpecification,
  type UpsertHvMasterSpecInput,
  type VehicleHvMasterSpecificationV1,
} from './vehicle-hv-master-specification.domain';
import {
  buildFleetBookingContextFromRows,
  emptyFleetBookingSupplement,
  type FleetBookingContextRow,
  type FleetVehicleBookingSupplementDto,
} from './operational/fleet-booking-context.util';
import {
  buildRegistryLifecycleFleetOperationalState,
  resolveRegistryLifecycleFleetBlock,
} from './registry/fleet-registry-lifecycle-status';
import {
  buildFleetOperationalStateDto,
  type FleetVehicleOperationalStateDto,
} from './operational/fleet-operational-state.util';
import { FleetMapCacheService } from './fleet-map-cache.service';
import { VehicleDrivingCapabilityLifecycleService } from '../vehicle-intelligence/driving-capability/vehicle-driving-capability-lifecycle.service';
import type { FleetConnectivityQueryDto } from './dto/fleet-connectivity-query.dto';
import {
  buildFleetConnectivitySummary,
  DEFAULT_FLEET_CONNECTIVITY_LIMIT,
  FLEET_CONNECTIVITY_HARD_LIMIT,
  FLEET_CONNECTIVITY_THRESHOLDS,
  mapFleetConnectivityVehicle,
  matchesFleetConnectivitySearch,
  paginateFleetConnectivityVehicles,
} from './fleet-connectivity.util';
import type { FleetConnectivityResponseDto } from './fleet-connectivity.types';
import type { FleetConnectivityDetailDto } from './fleet-connectivity-api.types';
import {
  buildFleetConnectivityKpiSummary,
  mapFleetConnectivityDetail,
  mapFleetConnectivityListItem,
  sortFleetConnectivityListItems,
} from './fleet-connectivity-api.mapper';
import { TireLifecycleService } from '@modules/vehicle-intelligence/tires/tire-lifecycle.service';
import { buildNormalizedRegistrationAiTireSpecJson } from '@modules/vehicle-intelligence/tires/ai-tire-spec-registration-persist.util';
import { BrakeRegistrationService } from '@modules/vehicle-intelligence/brakes/brake-registration.service';
import type { RegistrationBrakeManualSpec } from '@modules/vehicle-intelligence/brakes/register-brake-baseline';
import type { RegisterFromDimoResult } from './dto/register-from-dimo-result.dto';
import { MasterDimoCanonicalRegistrationService } from '@modules/vehicle-onboarding/master-dimo/master-dimo-canonical-registration.service';
import { runVehicleOnboardingHttp } from '@modules/vehicle-onboarding/http/vehicle-onboarding-http.util';
import { parseRegistrationIdentityProvenance } from '@modules/vehicle-onboarding/vehicle-identity-review/vehicle-identity-provenance.util';
import {
  assertAiTechnicalFieldsConfirmed,
  buildVehicleTechnicalSpecificationPrismaPatch,
  technicalSpecSaveRequiresOptimisticConcurrency,
  extractTechnicalSpecificationPatchInput,
  mapVehicleTechnicalSpecsToRegisteredVehicleFields,
  stripTechnicalSpecificationKeysFromUpdateBody,
} from './vehicle-technical-spec-patch.util';
import { DataAuthorizationsService } from '@modules/data-authorizations/data-authorizations.service';
import { DataAuthorizationEnforcementService } from '@modules/data-authorizations/data-authorization-enforcement.service';
import { DeviceConnectionQueryService } from '@modules/dimo/device-connection-query.service';
import { DimoVehicleDataSourceLinkService } from '@modules/dimo/dimo-vehicle-data-source-link.service';
import { buildFleetDeviceConnectionFields } from '@modules/dimo/device-connection-read-model';
import { VehicleConnectivityRuntimeProjectionService } from '@modules/dimo/device-connection-episode-resolution/vehicle-connectivity-runtime-projection.service';
import { VehicleOperationalProjectionService } from './operational/projection/vehicle-operational-projection.service';
import {
  createFleetOperationalAvailabilityUnknownFallback,
  toFleetOperationalAvailabilityDto,
  type FleetOperationalAvailabilityDto,
} from './operational/fleet-operational-availability.dto';
import {
  createFleetHealthEvaluationUnknownFallback,
  toFleetHealthEvaluationDto,
  type FleetHealthEvaluationDto,
} from './operational/fleet-health-evaluation.dto';
import type { VehicleOperationalProjection } from './operational/projection/vehicle-operational-projection.types';
import { serializeVehicleConnectivityRuntimeState } from './connectivity/vehicle-connectivity-runtime-state.dto';
import {
  serializeConnectivityDiagnosticAdmin,
  type ConnectivityDiagnosticAdminDto,
} from './connectivity/connectivity-diagnostic.admin-dto';
import type { VehicleConnectivityRuntimeState } from './connectivity/domain/connectivity-domain.types';
import type { VehicleConnectivityRuntimeStateDto } from './connectivity/vehicle-connectivity-runtime-state.dto';
import { TasksService } from '@modules/tasks/tasks.service';
import { BillingQuantityVehicleIntegration } from '@modules/billing/billing-quantity-vehicle.integration';
import { VehicleDetailObservabilityService } from './observability/vehicle-detail-observability.service';
import { classifyVehicleDetailProviderError } from './observability/vehicle-detail-log.util';
import { normalizeMotionSystemPowerDefinition } from '@modules/vehicle-intelligence/motion-physics-reference/motion-physics-reference.domain';

const DIMO_FUEL_TYPE_MAP: Record<string, FuelType> = {
  GASOLINE: FuelType.GASOLINE,
  DIESEL: FuelType.DIESEL,
  ELECTRIC: FuelType.ELECTRIC,
  HYBRID: FuelType.HYBRID,
  PLUGIN_HYBRID: FuelType.PLUGIN_HYBRID,
  GAS: FuelType.GASOLINE,
  PETROL: FuelType.GASOLINE,
  OTHER: FuelType.OTHER,
};

// V4.6.86 — Platform-admin status labels. Aligned with the rental
// `RENTAL_STATUS_MAP` for the shared states (`Available`, `Reserved`,
// `Active Rented`). Keeps the admin-only distinction between
// scheduled `Maintenance` (IN_SERVICE) and an explicit operational
// `Blocked` (OUT_OF_SERVICE) so platform operators can still see
// whether a vehicle is down by choice or by break-down. Previously
// used `Rented`, which caused terminology drift between master and
// rental surfaces.
const VEHICLE_STATUS_MAP: Record<VehicleStatus, string> = {
  AVAILABLE: 'Available',
  RENTED: 'Active Rented',
  IN_SERVICE: 'Maintenance',
  OUT_OF_SERVICE: 'Blocked',
  RESERVED: 'Reserved',
};

// Rental Fleet/Dashboard status keys. Deliberately collapses BOTH IN_SERVICE
// and OUT_OF_SERVICE into a single `Maintenance` bucket — the rental UI does
// not distinguish "scheduled service" from "operational block" at the tab
// level. Must stay in sync with the frontend `PRISMA_TO_FLEET_STATUS_KEY`
// (frontend/src/rental/lib/vehicle-status.ts), which mirrors this mapping.
const RENTAL_STATUS_MAP: Record<VehicleStatus, string> = {
  AVAILABLE: 'Available',
  RENTED: 'Active Rented',
  RESERVED: 'Reserved',
  IN_SERVICE: 'Maintenance',
  OUT_OF_SERVICE: 'Maintenance',
};

const HEALTH_STATUS_MAP: Record<HealthStatus, string> = {
  GOOD: 'Good',
  WARNING: 'Warning',
  CRITICAL: 'Critical',
};

const RENTAL_HEALTH_MAP: Record<HealthStatus, string> = {
  GOOD: 'Good Health',
  WARNING: 'Warning',
  CRITICAL: 'Critical',
};

const CLEANING_STATUS_MAP: Record<CleaningStatus, string> = {
  CLEAN: 'Clean',
  NEEDS_CLEANING: 'Needs Cleaning',
};

const FUEL_TYPE_LABEL: Record<FuelType, string> = {
  GASOLINE: 'Gasoline',
  DIESEL: 'Diesel',
  ELECTRIC: 'Electric',
  HYBRID: 'Hybrid',
  PLUGIN_HYBRID: 'Plug-in Hybrid',
  OTHER: 'Other',
};

function centsToEur(cents: number | null | undefined): string {
  if (cents == null) return '0.00';
  return (cents / 100).toFixed(2);
}

const FULL_VEHICLE_INCLUDE = {
  homeStation: true,
  dimoVehicle: true,
  latestState: true,
  batterySpecs: { orderBy: { createdAt: 'desc' as const }, take: 1 },
  tireSetups: {
    orderBy: { createdAt: 'desc' as const },
    take: 1,
    include: {
      measurements: { orderBy: { measuredAt: 'desc' as const }, take: 1 },
    },
  },
  brakeSpecs: { orderBy: { createdAt: 'desc' as const }, take: 1 },
  serviceEvents: { orderBy: { eventDate: 'desc' as const }, take: 5 },
} satisfies Prisma.VehicleInclude;

const FULL_VEHICLE_WITH_ORG_INCLUDE = {
  ...FULL_VEHICLE_INCLUDE,
  organization: true,
} satisfies Prisma.VehicleInclude;

// V4.6.84 — Fleet-status context that every vehicle-status surface
// (Fleet page, Dashboard tabs, Business widgets) must be able to render
// without inventing data. Nullable everywhere so legacy API consumers
// keep working unchanged.
export interface FleetVehicleBookingContextDto {
  // Reserved bucket (PENDING/CONFIRMED booking with start in the future
  // or within the booking window).
  reservedBookingId: string | null;
  reservedCustomerName: string | null;
  reservedPickupAt: string | null;
  // V4.6.94 — Planned end-of-rental for the reserved booking. Surfaces
  // the booked rental duration on the Dashboard fleet-status popup so
  // dispatchers see "for how long" without opening the booking.
  reservedReturnAt: string | null;
  reservedPickupStationName: string | null;
  // V4.6.85 — True when the planned pickup time has passed but the
  // handover has not been recorded yet (no-show risk / backlog).
  reservedIsOverdue: boolean;
  // Active rented bucket (ACTIVE booking, including overdue ones).
  activeBookingId: string | null;
  activeCustomerName: string | null;
  // V4.6.94 — Effective rental start (= booking startDate, NOT the
  // pickup-protocol timestamp). Combined with `activeReturnAt` this
  // lets the frontend render a time-progress bar without a second API
  // round-trip into the bookings/handover service.
  activeStartAt: string | null;
  activeReturnAt: string | null;
  activeReturnStationName: string | null;
  activeKmIncluded: number | null;
  activeKmDriven: number | null;
  activeIsOverdue: boolean;
}

// V4.6.84 — Declarative maintenance context derived from Vehicle.status
// and Vehicle.healthStatus. No free-form reason is fabricated — we only
// surface the canonical operational reason. Health problems are surfaced
// via the RentalHealthBadge, not via this field.
// V4.6.85 — The frontend now drives its own localized label from the
// enum code; `maintenanceReason` stays for legacy API consumers that
// render a ready-to-use English string.
export type FleetMaintenanceReasonCode = 'SCHEDULED_SERVICE' | 'OPERATIONAL_BLOCK';

export interface FleetVehicleMaintenanceContextDto {
  maintenanceReason: string | null;
  maintenanceReasonCode: FleetMaintenanceReasonCode | null;
  maintenanceUrgency: 'planned' | 'urgent' | null;
}

export interface FleetVehicleBookingReferenceDto {
  bookingId: string;
  customerName: string | null;
  pickupAt: string | null;
  returnAt: string | null;
  pickupStationName: string | null;
  returnStationName: string | null;
  isOverdue: boolean;
}

export interface FleetVehicleBookingContextV2Dto {
  activeBooking: FleetVehicleBookingReferenceDto | null;
  reservedBooking: FleetVehicleBookingReferenceDto | null;
  nextBooking: FleetVehicleBookingReferenceDto | null;
  futureBookingCount: number;
}

export type FleetBookingContextBundle = {
  map: Map<string, FleetVehicleBookingContextDto>;
  supplements: Map<string, FleetVehicleBookingSupplementDto>;
  loadFailed: boolean;
};

export interface FleetMapVehicleDto
  extends FleetVehicleBookingContextDto,
    FleetVehicleMaintenanceContextDto {
  id: string;
  licensePlate: string | null;
  displayName: string;
  make: string | null;
  model: string;
  year: number | null;
  /** Derived fleet display status (legacy). Prefer `operationalState`. */
  status: string;
  rawVehicleStatus?: string;
  operationalState?: FleetVehicleOperationalStateDto;
  bookingContext?: FleetVehicleBookingContextV2Dto;
  fuelType: string;
  healthStatus: string;
  cleaningStatus: string;
  stationId: string | null;
  stationName: string | null;
  latitude: number | null;
  longitude: number | null;
  lastSeenAt: string | null;
  signalAgeMs: number;
  isFresh: boolean;
  onlineStatus: string;
  telemetryFreshness: string;
  displayState: string;
  displayIgnition: string;
  isLiveTracking: boolean;
  heading: number | null;
  imageUrl: string | null;
  // V4.6.84 — telemetry summary so map markers can render fuel/SoC and
  // odometer without a second round-trip. Nullable when no telemetry
  // state exists yet.
  odometerKm: number | null;
  fuelPercent: number | null;
  evSoc: number | null;
  isElectric: boolean;
  /** Canonical connectivity runtime — shared truth across fleet surfaces. */
  connectivityRuntime?: VehicleConnectivityRuntimeStateDto;
  /** P0.3 — operator-facing operational availability from P0.2 projection. */
  operationalAvailability?: FleetOperationalAvailabilityDto;
  /** P0.4 — Health condition + P0.2 evaluability for Fleet presentation. */
  healthEvaluation?: FleetHealthEvaluationDto;
}

@Injectable()
export class VehiclesService {
  private readonly logger = new Logger(VehiclesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly dimoAuth: DimoAuthService,
    private readonly dimoTelemetry: DimoTelemetryService,
    private readonly providerConsent: VehicleProviderConsentService,
    @Inject(forwardRef(() => TireLifecycleService))
    private readonly tireLifecycleService: TireLifecycleService,
    @Inject(forwardRef(() => BrakeRegistrationService))
    private readonly brakeRegistrationService: BrakeRegistrationService,
    private readonly dataAuthorizations: DataAuthorizationsService,
    private readonly dataAuthEnforcement: DataAuthorizationEnforcementService,
    private readonly deviceConnectionQuery: DeviceConnectionQueryService,
    private readonly dimoVehicleDataSourceLink: DimoVehicleDataSourceLinkService,
    private readonly connectivityRuntimeProjection: VehicleConnectivityRuntimeProjectionService,
    @Inject(forwardRef(() => VehicleOperationalProjectionService))
    private readonly operationalProjection: VehicleOperationalProjectionService,
    @Inject(dimoConfig.KEY) private readonly dimoConf: ConfigType<typeof dimoConfig>,
    private readonly tasksService: TasksService,
    private readonly fleetMapCache: FleetMapCacheService,
    private readonly masterDimoCanonicalRegistration: MasterDimoCanonicalRegistrationService,
    @Optional()
    private readonly billingQuantity?: BillingQuantityVehicleIntegration,
    @Optional()
    @Inject(forwardRef(() => VehicleDrivingCapabilityLifecycleService))
    private readonly capabilityLifecycle?: VehicleDrivingCapabilityLifecycleService,
    @Optional()
    private readonly batteryCapabilityRefresh?: BatteryCapabilityRefreshService,
    @Optional()
    private readonly vehicleDetailObservability?: VehicleDetailObservabilityService,
  ) {}

  /** Invalidate cached fleet-map payload after booking/handover/status mutations. */
  async invalidateFleetMapCache(organizationId: string): Promise<void> {
    await this.fleetMapCache.invalidate(organizationId);
  }

  // Short-lived cache for the fleet-map endpoint. The UI polls every few
  // seconds for live tracking; a 5s TTL makes the common case (heartbeat
  // refresh) serve from Redis instead of Postgres without sacrificing
  // perceived freshness (telemetry lag is > 5s anyway on most providers).
  private static readonly FLEET_MAP_CACHE_TTL_SECONDS = 5;

  private withOrgScope(organizationId: string) {
    return { organizationId };
  }

  private async buildTripStateMap(
    vehicleIds: string[],
  ): Promise<Map<string, { state: any }>> {
    if (vehicleIds.length === 0) return new Map();
    const rows = await this.prisma.vehicleTripDetectionState
      .findMany({
        where: { vehicleId: { in: vehicleIds } },
        select: { vehicleId: true, state: true },
      })
      .catch(() => [] as { vehicleId: string; state: any }[]);
    return new Map(rows.map((r) => [r.vehicleId, { state: r.state }]));
  }

  /**
   * V4.6.84 — Single canonical booking context resolver for the Fleet
   * page, Dashboard fleet-status tabs and any other surface that needs
   * to render "who is this vehicle reserved for / rented to". Returns
   * one entry per vehicle that has at least one PENDING / CONFIRMED /
   * ACTIVE booking, with an ACTIVE booking always winning over a future
   * reservation.
   *
   * Booking lifecycle we respect:
   *   1. ACTIVE (regardless of endDate) → Active Rented; when endDate is
   *      in the past we additionally flag `activeIsOverdue = true` so
   *      the operator sees the overdue state until the return handover
   *      is recorded.
   *   2. PENDING / CONFIRMED with `endDate >= now` AND pickup calendar day
   *      reached in org timezone → Reserved. Future bookings before pickup
   *      day surface via `bookingContext.nextBooking` only (status stays Available).
   *   3. Maintenance is resolved separately from `Vehicle.status`; this
   *      helper never downgrades a maintenance vehicle.
   *
   * All booking fields are resolved server-side so the frontend never
   * has to stitch customer names, pickup/return times or km allowance
   * from multiple endpoints.
   */
  private async buildBookingContextMap(
    organizationId: string,
    vehicleIds: string[],
  ): Promise<FleetBookingContextBundle> {
    const emptyBundle = (): FleetBookingContextBundle => ({
      map: new Map(),
      supplements: new Map(),
      loadFailed: false,
    });
    if (vehicleIds.length === 0) return emptyBundle();

    const now = new Date();
    const org = await this.prisma.organization
      .findUnique({
        where: { id: organizationId },
        select: { timezone: true },
      })
      .catch(() => null);
    const orgTimezone = org?.timezone ?? null;

    let rows: FleetBookingContextRow[];
    const loadFailed = false;
    try {
      rows = await this.prisma.booking.findMany({
        where: {
          organizationId,
          vehicleId: { in: vehicleIds },
          OR: [
            {
              status: 'ACTIVE',
            },
            {
              status: { in: ['PENDING', 'CONFIRMED'] as BookingStatus[] },
              endDate: { gte: now },
            },
          ],
        },
        select: {
          id: true,
          vehicleId: true,
          status: true,
          startDate: true,
          endDate: true,
          kmIncluded: true,
          kmDriven: true,
          pickupStationId: true,
          returnStationId: true,
          customer: { select: { firstName: true, lastName: true, company: true } },
        },
        orderBy: { startDate: 'asc' },
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `[fleet-status] buildBookingContextMap failed for org ${organizationId}: ${message}`,
      );
      return { map: new Map(), supplements: new Map(), loadFailed: true };
    }

    const stationIds = Array.from(
      new Set(
        rows
          .flatMap((r) => [r.pickupStationId, r.returnStationId])
          .filter((x): x is string => !!x),
      ),
    );
    const stationMap = new Map<string, string>();
    if (stationIds.length > 0) {
      const stations = await this.prisma.station
        .findMany({
          where: { id: { in: stationIds }, organizationId },
          select: { id: true, name: true },
        })
        .catch(() => [] as Array<{ id: string; name: string }>);
      for (const s of stations) stationMap.set(s.id, s.name);
    }

    const fmtCustomer = (c: {
      firstName: string;
      lastName: string;
      company: string | null;
    }): string => {
      const personal = `${c.firstName} ${c.lastName}`.trim();
      if (c.company && c.company.trim().length > 0) {
        return personal ? `${personal} · ${c.company}` : c.company;
      }
      return personal || c.company || '';
    };

    const built = buildFleetBookingContextFromRows({
      rows,
      now,
      orgTimezone: orgTimezone ?? '',
      stationMap,
      fmtCustomer,
    });

    return {
      map: built.map,
      supplements: built.supplements,
      loadFailed,
    };
  }

  private toBookingReference(
    bookingId: string | null,
    customerName: string | null,
    pickupAt: string | null,
    returnAt: string | null,
    pickupStationName: string | null,
    returnStationName: string | null,
    isOverdue: boolean,
  ): FleetVehicleBookingReferenceDto | null {
    if (!bookingId) return null;
    return {
      bookingId,
      customerName,
      pickupAt,
      returnAt,
      pickupStationName,
      returnStationName,
      isOverdue,
    };
  }

  private buildBookingContextV2Dto(
    flat: FleetVehicleBookingContextDto,
    supplement: FleetVehicleBookingSupplementDto | null,
  ): FleetVehicleBookingContextV2Dto {
    return {
      activeBooking: this.toBookingReference(
        flat.activeBookingId,
        flat.activeCustomerName,
        flat.activeStartAt,
        flat.activeReturnAt,
        null,
        flat.activeReturnStationName,
        flat.activeIsOverdue,
      ),
      reservedBooking: this.toBookingReference(
        flat.reservedBookingId,
        flat.reservedCustomerName,
        flat.reservedPickupAt,
        flat.reservedReturnAt,
        flat.reservedPickupStationName,
        null,
        flat.reservedIsOverdue,
      ),
      nextBooking: supplement?.nextBookingId
        ? this.toBookingReference(
            supplement.nextBookingId,
            supplement.nextBookingCustomerName,
            supplement.nextBookingPickupAt,
            supplement.nextBookingReturnAt,
            supplement.nextBookingPickupStationName,
            null,
            false,
          )
        : null,
      futureBookingCount: supplement?.futureBookingCount ?? 0,
    };
  }

  /**
   * Aggregate derived rental fleet status counts for org KPIs (not raw DB column).
   */
  async aggregateDerivedFleetStatusCounts(organizationId: string): Promise<{
    total: number;
    available: number;
    rented: number;
    reserved: number;
    maintenance: number;
    unknown: number;
  }> {
    const vehicles = await this.prisma.vehicle.findMany({
      where: this.withOrgScope(organizationId),
      select: {
        id: true,
        status: true,
        tankCapacityLiters: true,
        latestState: {
          select: {
            odometerKm: true,
            evSoc: true,
            fuelLevelRelative: true,
            fuelLevelAbsolute: true,
            rawPayloadJson: true,
          },
        },
      },
    });

    if (vehicles.length === 0) {
      return {
        total: 0,
        available: 0,
        rented: 0,
        reserved: 0,
        maintenance: 0,
        unknown: 0,
      };
    }

    const vehicleIds = vehicles.map((v) => v.id);
    const bundle = await this.buildBookingContextMap(organizationId, vehicleIds);
    const activeBookingIds = Array.from(bundle.map.values())
      .map((ctx) => ctx.activeBookingId)
      .filter((id): id is string => !!id);
    const pickupOdoByBooking = await this.fetchPickupOdometerMap(
      organizationId,
      activeBookingIds,
    );

    const counts = {
      total: vehicles.length,
      available: 0,
      rented: 0,
      reserved: 0,
      maintenance: 0,
      unknown: 0,
    };

    for (const vehicle of vehicles) {
      const bookingCtx = bundle.map.get(vehicle.id) ?? null;
      const fleetCtx = this.deriveFleetStatusContext({
        vehicle,
        state: vehicle.latestState,
        bookingCtx,
        pickupOdoByBooking,
        bookingContextLoadFailed: bundle.loadFailed,
      });
      const token = fleetCtx.operationalState.status;
      if (token === 'UNKNOWN') counts.unknown += 1;
      else if (token === 'ACTIVE_RENTED') counts.rented += 1;
      else if (token === 'RESERVED') counts.reserved += 1;
      else if (token === 'MAINTENANCE') counts.maintenance += 1;
      else counts.available += 1;
    }

    return counts;
  }

  /**
   * V4.6.84 — Maintenance reason is derived from `Vehicle.status` only.
   * We intentionally do NOT fabricate reasons from health state — health
   * warnings already surface via the RentalHealthBadge on every card.
   */
  /**
   * V4.6.84 — Resolve the odometer recorded at booking handover (PICKUP).
   * Used to compute a live "kmDriven so far" for ACTIVE bookings by
   * subtracting this value from the current `VehicleLatestState.odometerKm`.
   * Batched, safe on empty input, and resilient to DB errors.
   */
  private async fetchPickupOdometerMap(
    organizationId: string,
    bookingIds: string[],
  ): Promise<Map<string, number>> {
    const map = new Map<string, number>();
    if (bookingIds.length === 0) return map;
    // V4.6.85 — explicit tenant scope. Booking IDs are already org-scoped
    // upstream, but joining on `booking.organizationId` defends against a
    // future caller that forgets to pre-filter.
    const rows = await this.prisma.bookingHandoverProtocol
      .findMany({
        where: {
          bookingId: { in: bookingIds },
          kind: 'PICKUP',
          booking: { organizationId },
        },
        select: { bookingId: true, odometerKm: true },
      })
      .catch(() => [] as Array<{ bookingId: string; odometerKm: number }>);
    for (const r of rows) {
      if (typeof r.odometerKm === 'number' && Number.isFinite(r.odometerKm)) {
        map.set(r.bookingId, r.odometerKm);
      }
    }
    return map;
  }

  private deriveMaintenanceContext(
    status: VehicleStatus | string | null | undefined,
  ): FleetVehicleMaintenanceContextDto {
    if (status === VehicleStatus.IN_SERVICE) {
      return {
        maintenanceReason: 'Scheduled service',
        maintenanceReasonCode: 'SCHEDULED_SERVICE',
        maintenanceUrgency: 'planned',
      };
    }
    if (status === VehicleStatus.OUT_OF_SERVICE) {
      return {
        maintenanceReason: 'Operationally blocked',
        maintenanceReasonCode: 'OPERATIONAL_BLOCK',
        maintenanceUrgency: 'urgent',
      };
    }
    return {
      maintenanceReason: null,
      maintenanceReasonCode: null,
      maintenanceUrgency: null,
    };
  }

  // ── Mapping: RegisteredVehicle (Master Admin) ─────────────────────

  private formatRegisteredVehicleKwhField(
    value: number | null | undefined,
  ): string {
    if (value == null || !Number.isFinite(value)) return '';
    return String(value);
  }

  private resolveAdminVehicleEnrichmentFromLinkMetadata(metadata: unknown): {
    connectionModality: string | null;
    telemetryConnectionFamily: string | null;
  } {
    if (!metadata || typeof metadata !== 'object') {
      return { connectionModality: null, telemetryConnectionFamily: null };
    }
    const meta = metadata as Record<string, unknown>;
    const connectionIdentity = meta.connectionIdentity;
    let connectionModality: string | null = null;
    if (connectionIdentity && typeof connectionIdentity === 'object') {
      const ci = connectionIdentity as Record<string, unknown>;
      const verified = ci.verifiedModality;
      if (verified != null && String(verified).trim()) {
        connectionModality = String(verified).trim();
      }
    }
    let telemetryConnectionFamily: string | null = null;
    const evidenceLists: unknown[] = [];
    if (Array.isArray(meta.verificationEvidence)) {
      evidenceLists.push(meta.verificationEvidence);
    }
    if (connectionIdentity && typeof connectionIdentity === 'object') {
      const ci = connectionIdentity as Record<string, unknown>;
      if (Array.isArray(ci.verificationEvidence)) {
        evidenceLists.push(ci.verificationEvidence);
      }
    }
    for (const evidence of evidenceLists) {
      if (!Array.isArray(evidence)) continue;
      const synthetic = evidence.find(
        (e) => typeof e === 'string' && e.includes('API_SYNTHETIC'),
      );
      if (synthetic) {
        telemetryConnectionFamily = 'API_SYNTHETIC';
        break;
      }
      const r1 = evidence.find(
        (e) => typeof e === 'string' && e.includes('RUPTELA'),
      );
      if (r1) telemetryConnectionFamily = 'RUPTELA_R1';
    }
    return { connectionModality, telemetryConnectionFamily };
  }

  mapToRegisteredVehicle(
    v: any,
    tripStateMap?: Map<string, { state: any }>,
    derivedFleetStatus?: string | null,
    hvReference?: {
      capacityKwh: number;
      capacityType: string;
    } | null,
    adminEnrichment?: {
      motionReference?: {
        systemMotorPowerKw: number | null;
        systemPowerDefinition: string | null;
        accel0To100S: number | null;
        variantAssumption: string | null;
      } | null;
      connectionIdentity?: {
        connectionModality: string | null;
        telemetryConnectionFamily: string | null;
      } | null;
    } | null,
  ) {
    const battery = v.batterySpecs?.[0];
    const tireSetup = v.tireSetups?.[0];
    const measurement = tireSetup?.measurements?.[0];
    const brake = v.brakeSpecs?.[0];
    const state = v.latestState;

    const lastInspection = v.serviceEvents?.find(
      (e: any) => e.eventType === 'GENERAL_INSPECTION',
    );
    const lastOilChange = v.serviceEvents?.find(
      (e: any) => e.eventType === 'OIL_CHANGE',
    );
    const lastBrakePadChange = v.serviceEvents?.find(
      (e: any) => e.eventType === 'BRAKE_SERVICE',
    );

    const hvMaster = parseVehicleHvMasterSpecification(v.hvMasterSpecification);
    const hvMasterFields = hvMasterSpecToFormFields(hvMaster);

    const tripState = tripStateMap?.get(v.id) ?? null;
    const interpreted = interpretVehicleState(
      {
        lastSeenAt: state?.lastSeenAt ?? null,
        speedKmh: state?.speedKmh ?? null,
        isIgnitionOn: state?.isIgnitionOn ?? null,
        engineLoad: state?.engineLoad ?? null,
        tractionBatteryPowerKw: state?.tractionBatteryPowerKw ?? null,
        coolantTempC: state?.coolantTempC ?? null,
        odometerKm: state?.odometerKm ?? null,
      },
      tripState,
    );

    return {
      id: v.id,
      vehicleName: v.vehicleName ?? `${v.make} ${v.model}`,
      vin: v.vin,
      make: v.make,
      model: v.model,
      year: v.year,
      organizationId: v.organizationId,
      organizationName: v.organization?.companyName ?? '',
      station: v.homeStation?.name ?? '',
      status:
        derivedFleetStatus ??
        VEHICLE_STATUS_MAP[v.status as VehicleStatus] ??
        'Available',
      health: HEALTH_STATUS_MAP[v.healthStatus as HealthStatus] ?? 'Good',
      lastSignal: interpreted.lastSignal,
      online: interpreted.isFresh,
      fuelType: FUEL_TYPE_LABEL[v.fuelType as FuelType] ?? 'Other',
      mileage: v.mileageKm ?? 0,
      licensePlate: v.licensePlate ?? '',
      vehicleType: v.vehicleType ?? '',
      cleaningStatus:
        CLEANING_STATUS_MAP[v.cleaningStatus as CleaningStatus] ?? 'Clean',
      notes: v.notes ?? '',
      batteryType: battery?.batteryType ?? '',
      batteryAmpere: battery?.batteryAmpere?.toString() ?? '',
      batteryVolt: battery?.batteryVolt?.toString() ?? '',
      tireFrontDimension: tireSetup?.frontDimension ?? '',
      tireFrontBrandModel: tireSetup?.brandModelFront ?? '',
      tireFrontSeason: tireSetup?.tireSeason ?? '',
      tireFrontDot: (tireSetup as any)?.dotCodeFront ?? '',
      tireFrontLoadIndex: (tireSetup as any)?.loadIndexFront ?? '',
      tireFrontSpeedIndex: (tireSetup as any)?.speedIndexFront ?? '',
      tireBackDimension: tireSetup?.rearDimension ?? '',
      tireBackBrandModel: tireSetup?.brandModelRear ?? '',
      tireBackSeason: tireSetup?.tireSeason ?? '',
      tireBackDot: (tireSetup as any)?.dotCodeRear ?? '',
      tireBackLoadIndex: (tireSetup as any)?.loadIndexRear ?? '',
      tireBackSpeedIndex: (tireSetup as any)?.speedIndexRear ?? '',
      treadDepthFL: measurement?.frontLeftMm?.toString() ?? '',
      treadDepthFR: measurement?.frontRightMm?.toString() ?? '',
      treadDepthBL: measurement?.rearLeftMm?.toString() ?? '',
      treadDepthBR: measurement?.rearRightMm?.toString() ?? '',
      brakeFrontRotorDiameter: brake?.frontRotorDiameter?.toString() ?? '',
      brakeFrontRotorWidth: brake?.frontRotorWidth?.toString() ?? '',
      brakeFrontPadThickness: brake?.frontPadThickness?.toString() ?? '',
      brakeBackRotorDiameter: brake?.rearRotorDiameter?.toString() ?? '',
      brakeBackRotorWidth: brake?.rearRotorWidth?.toString() ?? '',
      brakeBackPadThickness: brake?.rearPadThickness?.toString() ?? '',
      idleRpm: v.idleRpm?.toString() ?? '',
      maxRpm: v.maxRpm?.toString() ?? '',
      drivetrain: v.driveType ?? '',
      brakeForceDistribution: v.brakeForceFrontPercent
        ? `${v.brakeForceFrontPercent}% front`
        : '',
      ...mapVehicleTechnicalSpecsToRegisteredVehicleFields({
        engineDisplacementCc: v.engineDisplacementCc ?? null,
        cylinderCount: v.cylinderCount ?? null,
        frontWeightDistributionPct: v.frontWeightDistributionPct ?? null,
      }),
      curbWeight: v.curbWeightKg?.toString() ?? '',
      systemMotorPowerKw:
        adminEnrichment?.motionReference?.systemMotorPowerKw != null
          ? String(adminEnrichment.motionReference.systemMotorPowerKw)
          : '',
      accel0To100S:
        adminEnrichment?.motionReference?.accel0To100S != null
          ? String(adminEnrichment.motionReference.accel0To100S)
          : '',
      motionPhysicsVariantAssumption:
        adminEnrichment?.motionReference?.variantAssumption?.trim() ?? '',
      systemPowerDefinition:
        normalizeMotionSystemPowerDefinition(
          adminEnrichment?.motionReference?.systemPowerDefinition,
        ) ?? '',
      connectionModality:
        adminEnrichment?.connectionIdentity?.connectionModality ?? null,
      telemetryConnectionFamily:
        adminEnrichment?.connectionIdentity?.telemetryConnectionFamily ?? null,
      serviceIntervals: v.serviceIntervalKm
        ? `${v.serviceIntervalKm} km`
        : v.serviceIntervalMonths
          ? `${v.serviceIntervalMonths} months`
          : '',
      serviceIntervalManufacturerKm:
        v.serviceIntervalManufacturerKm?.toString() ?? '',
      serviceIntervalManufacturerMonths:
        v.serviceIntervalManufacturerMonths?.toString() ?? '',
      oilChangeIntervalKm: v.oilChangeIntervalKm?.toString() ?? '',
      oilChangeIntervalMonths: v.oilChangeIntervalMonths?.toString() ?? '',
      operationalStatus: '',
      lastTuev: v.lastTuvDate?.toISOString() ?? '',
      lastBokraft: v.lastBokraftDate?.toISOString() ?? '',
      lastInspection: lastInspection?.eventDate?.toISOString() ?? '',
      lastOilChange: lastOilChange?.eventDate?.toISOString() ?? '',
      lastBrakePadChange: lastBrakePadChange?.eventDate?.toISOString() ?? '',
      lastBrakeRotorChange: '',
      // Interpreted telemetry fields
      signalAgeMs: interpreted.signalAgeMs,
      isFresh: interpreted.isFresh,
      onlineStatus: interpreted.onlineStatus,
      telemetryFreshness: interpreted.telemetryFreshness,
      displayState: interpreted.displayState,
      displayIgnition: interpreted.displayIgnition,
      isLiveTracking: interpreted.isLiveTracking,
      hardwareType: v.hardwareType ?? 'UNKNOWN',
      hvBatteryCapacityKwh: this.formatRegisteredVehicleKwhField(
        v.hvBatteryCapacityKwh,
      ),
      tankCapacityLiters: this.formatRegisteredVehicleKwhField(
        v.tankCapacityLiters,
      ),
      hvBatteryUsableCapacityKwh:
        hvReference?.capacityType === 'USABLE'
          ? this.formatRegisteredVehicleKwhField(hvReference.capacityKwh)
          : this.formatRegisteredVehicleKwhField(v.hvBatteryCapacityKwh),
      hvBatteryGrossCapacityKwh:
        hvReference?.capacityType === 'GROSS'
          ? this.formatRegisteredVehicleKwhField(hvReference.capacityKwh)
          : hvMasterFields.hvBatteryGrossCapacityKwh ?? '',
      hvBatteryChemistry: hvMasterFields.hvBatteryChemistry ?? '',
      hvBatteryCellFormat: hvMasterFields.hvBatteryCellFormat ?? '',
      hvBatteryNominalVoltage: hvMasterFields.hvBatteryNominalVoltage ?? '',
      hvBatteryArchitecture: hvMasterFields.hvBatteryArchitecture ?? '',
      hvBatteryThermalManagement: hvMasterFields.hvBatteryThermalManagement ?? '',
      hvBatteryWarrantyYears: hvMasterFields.hvBatteryWarrantyYears ?? '',
      hvBatteryWarrantyKm: hvMasterFields.hvBatteryWarrantyKm ?? '',
      acOnboardChargerKw: hvMasterFields.acOnboardChargerKw ?? '',
      dcFastChargeMaxKw: hvMasterFields.dcFastChargeMaxKw ?? '',
      hvMasterSpecificationProvenance: hvMaster?.provenance ?? null,
      hvMasterSpecificationVariantLabel: hvMaster?.variantLabel ?? null,
      hvMasterSpecificationEvidenceNote: hvMaster?.evidenceNote ?? null,
      hvMasterSpecificationCatalogReferences: hvMaster?.catalogReferences ?? null,
      hvMasterSpecificationCatalogVariantKey: hvMaster?.catalogVariantKey ?? null,
      hvMasterSpecificationFieldChangeClassification:
        hvMaster?.fieldChangeClassification ?? null,
      registrationIdentityProvenance: v.registrationIdentityProvenance ?? null,
    };
  }

  // ── Mapping: VehicleData (Rental Dashboard) ───────────────────────

  mapToVehicleData(
    v: any,
    tripStateMap?: Map<string, { state: any }>,
    bookingBundle?: FleetBookingContextBundle,
    pickupOdoByBooking?: Map<string, number>,
  ) {
    const state = v.latestState;
    const leasing = v.leasingRateCents ?? 0;
    const insurance = v.insuranceCostCents ?? 0;
    const tax = v.taxCostCents ?? 0;
    const totalCents = leasing + insurance + tax;
    const isEv =
      v.fuelType === FuelType.ELECTRIC || v.fuelType === FuelType.PLUGIN_HYBRID;

    const tripState = tripStateMap?.get(v.id) ?? null;
    const interpreted = interpretVehicleState(
      {
        lastSeenAt: state?.lastSeenAt ?? null,
        speedKmh: state?.speedKmh ?? null,
        isIgnitionOn: state?.isIgnitionOn ?? null,
        engineLoad: state?.engineLoad ?? null,
        tractionBatteryPowerKw: state?.tractionBatteryPowerKw ?? null,
        coolantTempC: state?.coolantTempC ?? null,
        odometerKm: state?.odometerKm ?? null,
      },
      tripState,
    );

    // V4.6.85 — Single source of truth for status / booking context /
    // telemetry fallbacks. `getFleetMapData` calls the same helper, so
    // the Fleet page, Dashboard tabs and the map marker layer cannot
    // drift from each other anymore.
    // V4.6.90 — `pickupOdoByBooking` is now a required field on the
    // derivation input; we pass an empty map when a caller did not
    // pre-compute it (e.g. `findById`). An empty map is correct for
    // that case because the vehicle has no in-flight booking at that
    // call site; the derivation will fall through the `liveKmDriven`
    // branch safely.
    const bookingCtx = bookingBundle?.map.get(v.id) ?? null;
    const fleetCtx = this.deriveFleetStatusContext({
      vehicle: v,
      state,
      bookingCtx,
      pickupOdoByBooking: pickupOdoByBooking ?? new Map(),
      bookingContextLoadFailed: bookingBundle?.loadFailed,
    });
    const supplement =
      bookingBundle?.supplements.get(v.id) ?? emptyFleetBookingSupplement();
    const bookingContextV2 = this.buildBookingContextV2Dto(
      fleetCtx.bookingDto,
      supplement.futureBookingCount > 0 || supplement.nextBookingId ? supplement : null,
    );

    // Legacy numeric fallbacks for existing consumers (RentalVehicleTable
    // counters, CSV exports, …). Telemetry-grade code must read the
    // nullable canonical fields below.
    const odometerLegacy = Math.floor(
      fleetCtx.odometerKm ?? v.mileageKm ?? 0,
    );
    const fuelOrEnergyLegacy = isEv
      ? fleetCtx.evSoc ?? 0
      : fleetCtx.fuelPercent ?? 0;

    return {
      id: v.id,
      license: v.licensePlate ?? '',
      make: v.make ?? '',
      model: v.model,
      year: v.year,
      station: v.homeStation?.name ?? '',
      // V4.6.96 — expose canonical station identity so the Settings →
      // Stations vehicle-assignment modal can render the current
      // station of each vehicle without a second round-trip.
      stationId: v.homeStation?.id ?? null,
      stationName: v.homeStation?.name ?? null,
      homeStationId: v.homeStation?.id ?? null,
      currentStationId: v.currentStationId ?? null,
      expectedStationId: v.expectedStationId ?? null,
      fuelType: FUEL_TYPE_LABEL[v.fuelType as FuelType] ?? 'Other',
      // Rental status is derived from open bookings first, then falls back
      // to the admin-managed DB column. Maintenance wins over booking
      // state — a vehicle physically in service is never reported as
      // Rented or Reserved even if a booking row exists for it.
      status: fleetCtx.status,
      rawVehicleStatus: String(v.status ?? ''),
      operationalState: fleetCtx.operationalState,
      bookingContext: bookingContextV2,
      dataQualityState: fleetCtx.operationalState.dataQualityState,
      isReliable: fleetCtx.operationalState.isReliable,
      cleaningStatus:
        CLEANING_STATUS_MAP[v.cleaningStatus as CleaningStatus] ?? 'Clean',
      healthStatus:
        RENTAL_HEALTH_MAP[v.healthStatus as HealthStatus] ?? 'Good Health',
      online: interpreted.isFresh,
      lastSignal: interpreted.lastSignal,
      // Legacy numeric fields (always numbers) — kept for backward compat.
      odometer: odometerLegacy,
      fuel: Math.min(100, Math.max(0, Math.ceil(fuelOrEnergyLegacy))),
      battery: fleetCtx.evSoc ?? 0,
      speed: state?.speedKmh ?? 0,
      coolant: state?.coolantTempC ?? 0,
      /** @deprecated HM telemetry gauge only — not brake health truth. See rental-health / brake-health. */
      brakes: state?.brakePadPercent ?? 0,
      tires: state?.tireHealthPercent ?? 0,
      engineOil: state?.engineOilPercent ?? 0,
      // V4.6.85 — canonical telemetry, null-preserving.
      odometerKm: fleetCtx.odometerKm,
      fuelPercent: fleetCtx.fuelPercent,
      evSoc: fleetCtx.evSoc,
      isElectric: isEv,
      hvBatteryCapacityKwh: v.hvBatteryCapacityKwh ?? null,
      tankCapacityLiters: v.tankCapacityLiters ?? null,
      fuelLevel: fleetCtx.fuelPercent,
      lat: state?.latitude ?? null,
      lng: state?.longitude ?? null,
      leasingRate: centsToEur(leasing),
      insuranceCost: centsToEur(insurance),
      taxCost: centsToEur(tax),
      totalMonthlyCost: centsToEur(totalCents),
      // Interpreted telemetry fields
      signalAgeMs: interpreted.signalAgeMs,
      isFresh: interpreted.isFresh,
      onlineStatus: interpreted.onlineStatus,
      telemetryFreshness: interpreted.telemetryFreshness,
      displayState: interpreted.displayState,
      displayIgnition: interpreted.displayIgnition,
      isLiveTracking: interpreted.isLiveTracking,
      imageUrl: v.imageUrl ?? null,
      // V4.6.84 — canonical fleet-status context. All fields nullable;
      // the frontend renders graceful fallbacks when nothing is
      // persisted yet.
      reservedBookingId: fleetCtx.bookingDto.reservedBookingId,
      reservedCustomerName: fleetCtx.bookingDto.reservedCustomerName,
      reservedPickupAt: fleetCtx.bookingDto.reservedPickupAt,
      reservedReturnAt: fleetCtx.bookingDto.reservedReturnAt,
      reservedPickupStationName: fleetCtx.bookingDto.reservedPickupStationName,
      reservedIsOverdue: fleetCtx.bookingDto.reservedIsOverdue,
      activeBookingId: fleetCtx.bookingDto.activeBookingId,
      activeCustomerName: fleetCtx.bookingDto.activeCustomerName,
      activeStartAt: fleetCtx.bookingDto.activeStartAt,
      activeReturnAt: fleetCtx.bookingDto.activeReturnAt,
      activeReturnStationName: fleetCtx.bookingDto.activeReturnStationName,
      activeKmIncluded: fleetCtx.bookingDto.activeKmIncluded,
      activeKmDriven: fleetCtx.liveKmDriven,
      activeIsOverdue: fleetCtx.bookingDto.activeIsOverdue,
      maintenanceReason: fleetCtx.maintenanceCtx.maintenanceReason,
      maintenanceReasonCode: fleetCtx.maintenanceCtx.maintenanceReasonCode,
      maintenanceUrgency: fleetCtx.maintenanceCtx.maintenanceUrgency,
    };
  }

  /**
   * V4.6.90 — Explicit input shape for `deriveFleetStatusContext`.
   *
   * Before V4.6.90 the `pickupOdoByBooking` map was a silently optional
   * 4th positional arg — a future caller that forgot to pass it would
   * silently lose the live `kmDriven` delta for every in-flight ACTIVE
   * booking with no visible error. Making the shape explicit and
   * marking every field as required means the TypeScript compiler now
   * flags the mistake at build time instead of at runtime.
   *
   * Callers MUST pre-compute `bookingCtx` via `buildBookingContextMap`
   * and `pickupOdoByBooking` via `fetchPickupOdometerMap`. Passing an
   * empty map for vehicles without active bookings is correct and safe.
   */
  static readonly EMPTY_BOOKING_CONTEXT: FleetVehicleBookingContextDto = {
    reservedBookingId: null,
    reservedCustomerName: null,
    reservedPickupAt: null,
    reservedReturnAt: null,
    reservedPickupStationName: null,
    reservedIsOverdue: false,
    activeBookingId: null,
    activeCustomerName: null,
    activeStartAt: null,
    activeReturnAt: null,
    activeReturnStationName: null,
    activeKmIncluded: null,
    activeKmDriven: null,
    activeIsOverdue: false,
  };

  /**
   * V4.6.85 — Canonical fleet-status context resolver. Returns the
   * derived rental status, the normalized maintenance context, a
   * booking DTO safe to spread, the live `kmDriven` (telemetry-aware
   * for in-flight ACTIVE bookings) and the null-preserving telemetry
   * fields used by every fleet-status surface. Shared between the
   * rental dashboard (`/vehicles`) and the map (`/fleet-map`) so the
   * two endpoints cannot drift.
   *
   * V4.6.90 — Hardened against two regression vectors:
   *  1. **Ghost operational states**: when the raw DB `Vehicle.status`
   *     column is `RENTED` / `RESERVED` but no matching booking row
   *     exists (either because an admin mutated the column directly or
   *     because a booking was deleted without resetting the column),
   *     the derivation falls back to `Available` instead of rendering a
   *     hollow "Active Rented" / "Reserved" card with null customer /
   *     pickup / return data. A warning is emitted so ops can trace the
   *     stale row.
   *  2. **Silent optional footgun**: see the dedicated interface above —
   *     `pickupOdoByBooking` is now a required argument.
   */
  // Visible for tests.
  public deriveFleetStatusContext(input: {
    vehicle: {
      id?: string;
      status: VehicleStatus | string | null | undefined;
      registryLifecycle?: VehicleRegistryLifecycle | string | null;
      licensePlate?: string | null;
      tankCapacityLiters?: number | null;
    };
    state: {
      odometerKm?: number | null;
      evSoc?: number | null;
      fuelLevelRelative?: number | null;
      fuelLevelAbsolute?: number | null;
      rawPayloadJson?: unknown;
    } | null;
    bookingCtx: FleetVehicleBookingContextDto | null;
    pickupOdoByBooking: Map<string, number>;
    bookingContextLoadFailed?: boolean;
  }): {
    status: string;
    operationalState: FleetVehicleOperationalStateDto;
    maintenanceCtx: FleetVehicleMaintenanceContextDto;
    bookingDto: FleetVehicleBookingContextDto;
    liveKmDriven: number | null;
    odometerKm: number | null;
    fuelPercent: number | null;
    evSoc: number | null;
  } {
    const { vehicle, state, bookingCtx, pickupOdoByBooking, bookingContextLoadFailed } =
      input;

    const registryBlock = resolveRegistryLifecycleFleetBlock(
      vehicle.registryLifecycle as VehicleRegistryLifecycle | null | undefined,
    );
    if (registryBlock) {
      const operationalState = buildRegistryLifecycleFleetOperationalState({
        block: registryBlock,
      });
      const maintenanceCtx: FleetVehicleMaintenanceContextDto =
        vehicle.status === VehicleStatus.IN_SERVICE ||
        vehicle.status === VehicleStatus.OUT_OF_SERVICE
          ? this.deriveMaintenanceContext(vehicle.status)
          : {
              maintenanceReason: null,
              maintenanceReasonCode: null,
              maintenanceUrgency: null,
            };
      return {
        status: registryBlock.displayStatus,
        operationalState,
        maintenanceCtx,
        bookingDto: VehiclesService.EMPTY_BOOKING_CONTEXT,
        liveKmDriven: null,
        odometerKm:
          typeof state?.odometerKm === 'number' && Number.isFinite(state.odometerKm)
            ? Math.floor(state.odometerKm)
            : null,
        fuelPercent: this.resolveFuelPercentOrNull(state, vehicle.tankCapacityLiters),
        evSoc:
          typeof state?.evSoc === 'number' && Number.isFinite(state.evSoc)
            ? Math.min(100, Math.max(0, Math.ceil(state.evSoc)))
            : null,
      };
    }

    if (bookingContextLoadFailed) {
      const operationalState = buildFleetOperationalStateDto({
        displayStatus: 'Unknown',
        bookingContextLoadFailed: true,
      });
      const maintenanceCtx: FleetVehicleMaintenanceContextDto =
        vehicle.status === VehicleStatus.IN_SERVICE ||
        vehicle.status === VehicleStatus.OUT_OF_SERVICE
          ? this.deriveMaintenanceContext(vehicle.status)
          : {
              maintenanceReason: null,
              maintenanceReasonCode: null,
              maintenanceUrgency: null,
            };
      return {
        status: 'Unknown',
        operationalState,
        maintenanceCtx,
        bookingDto: VehiclesService.EMPTY_BOOKING_CONTEXT,
        liveKmDriven: null,
        odometerKm:
          typeof state?.odometerKm === 'number' && Number.isFinite(state.odometerKm)
            ? Math.floor(state.odometerKm)
            : null,
        fuelPercent: this.resolveFuelPercentOrNull(state, vehicle.tankCapacityLiters),
        evSoc:
          typeof state?.evSoc === 'number' && Number.isFinite(state.evSoc)
            ? Math.min(100, Math.max(0, Math.ceil(state.evSoc)))
            : null,
      };
    }

    const dbStatus =
      RENTAL_STATUS_MAP[vehicle.status as VehicleStatus] ?? 'Available';
    const bookingDerived: 'Active Rented' | 'Reserved' | null =
      bookingCtx && bookingCtx.activeBookingId
        ? 'Active Rented'
        : bookingCtx && bookingCtx.reservedBookingId
          ? 'Reserved'
          : null;

    // V4.6.90 — Ghost-state guard. `Maintenance` always wins (true
    // operational block). Otherwise the booking-derived bucket wins.
    // If the DB column says `RENTED` / `RESERVED` but no booking truth
    // backs it, demote to `Available` and log once per vehicle — we
    // never render an operational state from a db-only row.
    let status: string;
    if (dbStatus === 'Maintenance') {
      status = 'Maintenance';
    } else if (bookingDerived) {
      status = bookingDerived;
    } else if (dbStatus === 'Active Rented' || dbStatus === 'Reserved') {
      status = 'Available';
      this.logger.warn(
        `[fleet-status] Ghost ${dbStatus} state on vehicle ${
          vehicle.id ?? vehicle.licensePlate ?? '<unknown>'
        }: Vehicle.status is ${String(vehicle.status)} but no matching booking truth. Treating as Available.`,
      );
    } else {
      status = dbStatus;
    }
    const maintenanceCtx: FleetVehicleMaintenanceContextDto =
      status === 'Maintenance'
        ? this.deriveMaintenanceContext(vehicle.status)
        : {
            maintenanceReason: null,
            maintenanceReasonCode: null,
            maintenanceUrgency: null,
          };

    // When we demoted a ghost RENTED/RESERVED to Available, also drop
    // the (necessarily null) booking context — otherwise the frontend
    // could still try to render e.g. a reservedPickupAt timestamp that
    // has no matching booking row.
    const bookingDto: FleetVehicleBookingContextDto =
      status === 'Active Rented' || status === 'Reserved'
        ? bookingCtx ?? VehiclesService.EMPTY_BOOKING_CONTEXT
        : VehiclesService.EMPTY_BOOKING_CONTEXT;

    const liveKmDriven: number | null = (() => {
      if (!bookingDto.activeBookingId) {
        return bookingDto.activeKmDriven ?? null;
      }
      if (bookingDto.activeKmDriven != null) return bookingDto.activeKmDriven;
      const pickupOdo = pickupOdoByBooking.get(bookingDto.activeBookingId);
      const currentOdo =
        typeof state?.odometerKm === 'number' ? state.odometerKm : null;
      if (pickupOdo == null || currentOdo == null) return null;
      return Math.max(0, Math.floor(currentOdo - pickupOdo));
    })();

    const odometerKm =
      typeof state?.odometerKm === 'number' && Number.isFinite(state.odometerKm)
        ? Math.floor(state.odometerKm)
        : null;

    const fuelPercent = this.resolveFuelPercentOrNull(
      state,
      vehicle.tankCapacityLiters,
    );

    const evSoc =
      typeof state?.evSoc === 'number' && Number.isFinite(state.evSoc)
        ? Math.min(100, Math.max(0, Math.ceil(state.evSoc)))
        : null;

    const operationalState = buildFleetOperationalStateDto({
      displayStatus: status,
    });

    return {
      status,
      operationalState,
      maintenanceCtx,
      bookingDto,
      liveKmDriven,
      odometerKm,
      fuelPercent,
      evSoc,
    };
  }

  /**
   * Batch fleet status context — shared booking load for legacy fleet + P0.2 shadow.
   * Reuses booking-context batch loaders — no per-vehicle booking queries.
   */
  async deriveFleetStatusContextBatch(
    organizationId: string,
    vehicles: Array<{
      id: string;
      status: VehicleStatus;
      registryLifecycle?: VehicleRegistryLifecycle | string | null;
      licensePlate?: string | null;
      tankCapacityLiters?: number | null;
      latestState: {
        odometerKm?: number | null;
        evSoc?: number | null;
        fuelLevelRelative?: number | null;
        fuelLevelAbsolute?: number | null;
        rawPayloadJson?: unknown;
      } | null;
    }>,
  ): Promise<
    Map<
      string,
      ReturnType<VehiclesService['deriveFleetStatusContext']>
    >
  > {
    const vehicleIds = vehicles.map((v) => v.id);
    const result = new Map<
      string,
      ReturnType<VehiclesService['deriveFleetStatusContext']>
    >();
    if (vehicleIds.length === 0) return result;

    const bookingBundle = await this.buildBookingContextMap(organizationId, vehicleIds);
    const activeBookingIds = Array.from(bookingBundle.map.values())
      .map((ctx) => ctx.activeBookingId)
      .filter((id): id is string => !!id);
    const pickupOdoByBooking = await this.fetchPickupOdometerMap(
      organizationId,
      activeBookingIds,
    );

    for (const vehicle of vehicles) {
      const fleetCtx = this.deriveFleetStatusContext({
        vehicle,
        state: vehicle.latestState,
        bookingCtx: bookingBundle.map.get(vehicle.id) ?? null,
        pickupOdoByBooking,
        bookingContextLoadFailed: bookingBundle.loadFailed,
      });
      result.set(vehicle.id, fleetCtx);
    }

    return result;
  }

  /**
   * Batch fleet business/workflow context for P0.2 operational projection.
   */
  async deriveFleetBusinessContextBatch(
    organizationId: string,
    vehicles: Parameters<VehiclesService['deriveFleetStatusContextBatch']>[1],
  ): Promise<Map<string, FleetVehicleOperationalStateDto>> {
    const contexts = await this.deriveFleetStatusContextBatch(organizationId, vehicles);
    return new Map(
      Array.from(contexts.entries()).map(([vehicleId, fleetCtx]) => [
        vehicleId,
        fleetCtx.operationalState,
      ]),
    );
  }

  /**
   * Resolve the best fuel percentage from VehicleLatestState.
   *
   * DIMO provides two fuel signals that update independently:
   *   - powertrainFuelSystemRelativeLevel  (percentage, not all vehicles report it)
   *   - powertrainFuelSystemAbsoluteLevel  (liters, often more current or the only signal)
   *
   * Strategy:
   *  1. If relative % exists and is at least as fresh as absolute → use it.
   *  2. If absolute is newer, try to infer tank capacity from the last known pair.
   *  3. If relative is never reported (null), calculate % from absolute using
   *     the vehicle's stored tankCapacityLiters or a 50 L default.
   */
  private resolveFuelPercent(
    state: any,
    tankCapacityLiters?: number | null,
  ): number {
    if (!state) return 0;

    const relPct = state.fuelLevelRelative as number | null;
    const absLiters = state.fuelLevelAbsolute as number | null;

    if (relPct == null && absLiters == null) return 0;
    if (absLiters == null) return relPct ?? 0;

    const raw = state.rawPayloadJson as Record<string, any> | null;

    if (relPct != null && relPct > 0 && raw) {
      const relTs = this.signalTimestamp(raw.powertrainFuelSystemRelativeLevel);
      const absTs = this.signalTimestamp(raw.powertrainFuelSystemAbsoluteLevel);

      if (!absTs || !relTs || absTs <= relTs) return relPct;

      const relVal = this.signalValue(raw.powertrainFuelSystemRelativeLevel);
      const absVal = this.signalValue(raw.powertrainFuelSystemAbsoluteLevel);
      if (relVal != null && absVal != null && relVal > 0 && absVal > 0) {
        const timeDiffMs = absTs.getTime() - relTs.getTime();
        if (timeDiffMs < 6 * 60 * 60 * 1000) {
          const inferredCapacity = absVal / (relVal / 100);
          if (inferredCapacity > 10 && inferredCapacity < 200) {
            return Math.round(
              Math.min(100, (absLiters / inferredCapacity) * 100) * 10,
            ) / 10;
          }
        }
      }
    }

    const DEFAULT_TANK_LITERS = 50;
    const capacity =
      tankCapacityLiters != null && tankCapacityLiters > 0
        ? tankCapacityLiters
        : DEFAULT_TANK_LITERS;
    return Math.round(Math.min(100, (absLiters / capacity) * 100) * 10) / 10;
  }

  /**
   * V4.6.85 — Null-preserving variant of `resolveFuelPercent` used by the
   * fleet-status layer. Returns `null` (not `0`) when no fuel signal has
   * ever been reported, so the UI can show "—" instead of a misleading
   * "0%" for vehicles that simply lack a fuel sensor or fresh telemetry.
   * EV-only vehicles (no fuel tank, no fuel signal) naturally resolve to
   * `null`, and the rendering layer falls back to `evSoc`.
   */
  private resolveFuelPercentOrNull(
    state: any,
    tankCapacityLiters?: number | null,
  ): number | null {
    if (!state) return null;
    const relPct = state.fuelLevelRelative as number | null;
    const absLiters = state.fuelLevelAbsolute as number | null;
    if (relPct == null && absLiters == null) return null;
    const value = this.resolveFuelPercent(state, tankCapacityLiters);
    return Math.min(100, Math.max(0, Math.ceil(value)));
  }

  private signalTimestamp(signal: unknown): Date | null {
    if (!signal || typeof signal !== 'object') return null;
    const t = (signal as Record<string, unknown>).timestamp;
    if (typeof t === 'string') return new Date(t);
    return null;
  }

  private signalValue(signal: unknown): number | null {
    if (!signal || typeof signal !== 'object') return null;
    const v = (signal as Record<string, unknown>).value;
    return typeof v === 'number' && !Number.isNaN(v) ? v : null;
  }

  private extractHeading(rawPayload: unknown): number | null {
    if (!rawPayload || typeof rawPayload !== 'object') return null;
    const raw = rawPayload as Record<string, unknown>;

    const directKeys = ['heading', 'bearing', 'course'] as const;
    for (const key of directKeys) {
      const value = raw[key];
      if (typeof value === 'number' && Number.isFinite(value)) return value;
    }

    const nestedCandidates: unknown[] = [
      raw.currentLocationHeading,
      raw.currentLocationCoordinates,
      raw.currentLocationCourse,
      raw.location,
      raw.position,
    ];

    for (const candidate of nestedCandidates) {
      if (!candidate || typeof candidate !== 'object') continue;
      const obj = candidate as Record<string, unknown>;
      const fromValue = obj.value;
      if (typeof fromValue === 'number' && Number.isFinite(fromValue)) return fromValue;
      if (fromValue && typeof fromValue === 'object') {
        const nestedValue = fromValue as Record<string, unknown>;
        for (const key of directKeys) {
          const v = nestedValue[key];
          if (typeof v === 'number' && Number.isFinite(v)) return v;
        }
      }
      for (const key of directKeys) {
        const v = obj[key];
        if (typeof v === 'number' && Number.isFinite(v)) return v;
      }
    }

    return null;
  }

  // ── CRUD ──────────────────────────────────────────────────────────

  async create(
    organizationId: string,
    data: Omit<Prisma.VehicleCreateInput, 'organization'>,
    createdByUserId?: string,
  ): Promise<Vehicle> {
    let vehicle: Vehicle;
    try {
      vehicle = await this.prisma.vehicle.create({
        data: {
          ...data,
          organization: { connect: { id: organizationId } },
          createdByUserId: createdByUserId ?? null,
        },
      });
    } catch (error) {
      if (isPrismaUniqueViolation(error, ['vin', 'organizationId'])) {
        throw new ConflictException({
          code: 'VEHICLE_VIN_ALREADY_EXISTS',
          message: 'A vehicle with this VIN already exists in the organization',
        });
      }
      throw error;
    }

    void this.billingQuantity
      ?.onVehicleProvisioned({
        organizationId,
        vehicleId: vehicle.id,
        actorUserId: createdByUserId ?? null,
      })
      .catch((error) => {
        this.logger.warn({
          msg: 'billing.quantity.vehicle_provision_hook_failed',
          organizationId,
          vehicleId: vehicle.id,
          error: error instanceof Error ? error.message : String(error),
        });
      });

    return vehicle;
  }

  async findByOrganization(
    organizationId: string,
    params?: PaginationParams,
  ): Promise<PaginatedResult<any>> {
    const { skip, take } = parsePagination(params || {});
    const where = this.withOrgScope(organizationId);
    const [data, total] = await Promise.all([
      this.prisma.vehicle.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: FULL_VEHICLE_INCLUDE,
      }),
      this.prisma.vehicle.count({ where }),
    ]);

    const vehicleIds = data.map((v) => v.id);
    const [tripStateMap, bookingBundle] = await Promise.all([
      this.buildTripStateMap(vehicleIds),
      this.buildBookingContextMap(organizationId, vehicleIds),
    ]);
    const activeBookingIds = Array.from(bookingBundle.map.values())
      .map((ctx) => ctx.activeBookingId)
      .filter((id): id is string => !!id);
    const pickupOdoByBooking = await this.fetchPickupOdometerMap(
      organizationId,
      activeBookingIds,
    );

    return buildPaginatedResult(
      data.map((v) =>
        this.mapToVehicleData(
          v,
          tripStateMap,
          bookingBundle,
          pickupOdoByBooking,
        ),
      ),
      total,
      params || {},
    );
  }

  async getFleetMapData(organizationId: string): Promise<FleetMapVehicleDto[]> {
    const cacheKey = this.fleetMapCache.cacheKey(organizationId);
    try {
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        this.vehicleDetailObservability?.recordCacheOutcome('hit');
        return JSON.parse(cached) as FleetMapVehicleDto[];
      }
      this.vehicleDetailObservability?.recordCacheOutcome('miss');
    } catch (err: any) {
      this.logger.debug(`Fleet-map cache read failed (${err?.message ?? err})`);
      this.vehicleDetailObservability?.recordCacheOutcome('miss');
    }

    const where = this.withOrgScope(organizationId);
    // Hard cap to prevent unbounded queries for very large fleets. The UI
    // paginates/virtualises at 500+ markers anyway. Orgs exceeding this cap
    // should migrate to a clustered / bbox-scoped endpoint.
    const FLEET_MAP_HARD_LIMIT = 500;
    const vehicles = await this.prisma.vehicle.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: FLEET_MAP_HARD_LIMIT,
      select: {
        id: true,
        licensePlate: true,
        vehicleName: true,
        make: true,
        model: true,
        year: true,
        status: true,
        fuelType: true,
        healthStatus: true,
        cleaningStatus: true,
        imageUrl: true,
        tankCapacityLiters: true,
        homeStationId: true,
        currentStationId: true,
        expectedStationId: true,
        homeStation: { select: { id: true, name: true } },
        latestState: {
          select: {
            latitude: true,
            longitude: true,
            lastSeenAt: true,
            speedKmh: true,
            isIgnitionOn: true,
            engineLoad: true,
            tractionBatteryPowerKw: true,
            coolantTempC: true,
            odometerKm: true,
            fuelLevelRelative: true,
            fuelLevelAbsolute: true,
            evSoc: true,
            rawPayloadJson: true,
          },
        },
      },
    });

    const vehicleIdsForMap = vehicles.map((v) => v.id);
    const [tripStateMap, bookingBundle] = await Promise.all([
      this.buildTripStateMap(vehicleIdsForMap),
      this.buildBookingContextMap(organizationId, vehicleIdsForMap),
    ]);
    const bookingContextMap = bookingBundle.map;

    // V4.6.84 — Live kmDriven for ACTIVE bookings is computed here in
    // one batched query: pickup-handover odometer per active booking +
    // vehicle.latestState.odometerKm (already loaded above). Falls back
    // to `Booking.kmDriven` when the return handover has already
    // persisted the final value.
    const activeBookingIds = Array.from(bookingContextMap.values())
      .map((ctx) => ctx.activeBookingId)
      .filter((id): id is string => !!id);
    const pickupOdoByBooking = await this.fetchPickupOdometerMap(
      organizationId,
      activeBookingIds,
    );

    const runtimeByVehicle = await this.connectivityRuntimeProjection.projectForVehicles(
      organizationId,
      vehicleIdsForMap,
    );

    const fleetProjectionGeneratedAt = new Date().toISOString();

    let projectionsByVehicle = new Map<string, VehicleOperationalProjection>();
    try {
      const projections = await this.operationalProjection.getVehicleProjections({
        organizationId,
        vehicleIds: vehicleIdsForMap,
      });
      projectionsByVehicle = projections;
    } catch (err) {
      this.logger.warn({
        msg: 'fleet_map.operational_projection_batch_failed',
        organizationId,
        vehicleCount: vehicleIdsForMap.length,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    const fleetOperationalAvailabilityFallback =
      createFleetOperationalAvailabilityUnknownFallback(fleetProjectionGeneratedAt);
    const fleetHealthEvaluationFallback =
      createFleetHealthEvaluationUnknownFallback(fleetProjectionGeneratedAt);

    const result: FleetMapVehicleDto[] = vehicles.map((vehicle) => {
      const state = vehicle.latestState;
      const tripState = tripStateMap.get(vehicle.id) ?? null;
      const interpreted = interpretVehicleState(
        {
          lastSeenAt: state?.lastSeenAt ?? null,
          speedKmh: state?.speedKmh ?? null,
          isIgnitionOn: state?.isIgnitionOn ?? null,
          engineLoad: state?.engineLoad ?? null,
          tractionBatteryPowerKw: state?.tractionBatteryPowerKw ?? null,
          coolantTempC: state?.coolantTempC ?? null,
          odometerKm: state?.odometerKm ?? null,
        },
        tripState,
      );

      const bookingCtx = bookingContextMap.get(vehicle.id) ?? null;
      const supplement =
        bookingBundle.supplements.get(vehicle.id) ?? emptyFleetBookingSupplement();
      const fleetCtx = this.deriveFleetStatusContext({
        vehicle,
        state,
        bookingCtx,
        pickupOdoByBooking,
        bookingContextLoadFailed: bookingBundle.loadFailed,
      });
      const isElectric =
        vehicle.fuelType === FuelType.ELECTRIC ||
        vehicle.fuelType === FuelType.PLUGIN_HYBRID;

      return {
        id: vehicle.id,
        licensePlate: vehicle.licensePlate ?? null,
        displayName:
          vehicle.vehicleName ??
          [vehicle.make, vehicle.model].filter(Boolean).join(' ').trim(),
        make: vehicle.make ?? null,
        model: vehicle.model,
        year: vehicle.year ?? null,
        status: fleetCtx.status,
        rawVehicleStatus: String(vehicle.status ?? ''),
        operationalState: fleetCtx.operationalState,
        bookingContext: this.buildBookingContextV2Dto(
          fleetCtx.bookingDto,
          supplement.futureBookingCount > 0 || supplement.nextBookingId
            ? supplement
            : null,
        ),
        dataQualityState: fleetCtx.operationalState.dataQualityState,
        isReliable: fleetCtx.operationalState.isReliable,
        fuelType: FUEL_TYPE_LABEL[vehicle.fuelType as FuelType] ?? 'Other',
        healthStatus:
          RENTAL_HEALTH_MAP[vehicle.healthStatus as HealthStatus] ?? 'Good Health',
        cleaningStatus:
          CLEANING_STATUS_MAP[vehicle.cleaningStatus as CleaningStatus] ?? 'Clean',
        stationId: vehicle.homeStation?.id ?? null,
        stationName: vehicle.homeStation?.name ?? null,
        homeStationId: vehicle.homeStation?.id ?? null,
        currentStationId: vehicle.currentStationId ?? null,
        expectedStationId: vehicle.expectedStationId ?? null,
        latitude: state?.latitude ?? null,
        longitude: state?.longitude ?? null,
        lastSeenAt: state?.lastSeenAt?.toISOString() ?? null,
        signalAgeMs: interpreted.signalAgeMs,
        isFresh: interpreted.isFresh,
        onlineStatus: interpreted.onlineStatus,
        telemetryFreshness: interpreted.telemetryFreshness,
        displayState: interpreted.displayState,
        displayIgnition: interpreted.displayIgnition,
        isLiveTracking: interpreted.isLiveTracking,
        heading: this.extractHeading(state?.rawPayloadJson),
        imageUrl: vehicle.imageUrl ?? null,
        odometerKm: fleetCtx.odometerKm,
        fuelPercent: fleetCtx.fuelPercent,
        evSoc: fleetCtx.evSoc,
        isElectric,
        ...fleetCtx.bookingDto,
        activeKmDriven: fleetCtx.liveKmDriven,
        ...fleetCtx.maintenanceCtx,
        connectivityRuntime: runtimeByVehicle.has(vehicle.id)
          ? serializeVehicleConnectivityRuntimeState(runtimeByVehicle.get(vehicle.id)!)
          : undefined,
        operationalAvailability: projectionsByVehicle.has(vehicle.id)
          ? toFleetOperationalAvailabilityDto(projectionsByVehicle.get(vehicle.id)!)
          : fleetOperationalAvailabilityFallback,
        healthEvaluation: projectionsByVehicle.has(vehicle.id)
          ? toFleetHealthEvaluationDto(projectionsByVehicle.get(vehicle.id)!)
          : fleetHealthEvaluationFallback,
      };
    });

    try {
      await this.redis.set(
        cacheKey,
        JSON.stringify(result),
        'EX',
        VehiclesService.FLEET_MAP_CACHE_TTL_SECONDS,
      );
    } catch (err: any) {
      this.logger.debug(`Fleet-map cache write failed (${err?.message ?? err})`);
    }

    return result;
  }

  async findById(id: string) {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id },
      include: FULL_VEHICLE_WITH_ORG_INCLUDE,
    });
    if (!vehicle) return null;
    const [tripStateMap, hvReference, motionReference, dimoSourceLink] =
      await Promise.all([
        this.buildTripStateMap([vehicle.id]),
        this.prisma.vehicleBatteryReferenceCapacity.findFirst({
          where: {
            organizationId: vehicle.organizationId,
            vehicleId: vehicle.id,
            isActive: true,
            supersededById: null,
          },
          select: { capacityKwh: true, capacityType: true },
        }),
        this.prisma.vehicleMotionPhysicsReference.findFirst({
          where: {
            organizationId: vehicle.organizationId,
            vehicleId: vehicle.id,
            isActive: true,
            supersededById: null,
          },
          select: {
            systemMotorPowerKw: true,
            systemPowerDefinition: true,
            accel0To100S: true,
            variantAssumption: true,
          },
        }),
        this.prisma.vehicleDataSourceLink.findFirst({
          where: {
            vehicleId: vehicle.id,
            isActive: true,
            provider: 'DIMO',
          },
          orderBy: [{ activatedAt: 'desc' }, { id: 'desc' }],
          select: { metadata: true },
        }),
      ]);
    const connectionIdentity = this.resolveAdminVehicleEnrichmentFromLinkMetadata(
      dimoSourceLink?.metadata,
    );
    return this.mapToRegisteredVehicle(
      vehicle,
      tripStateMap,
      undefined,
      hvReference,
      {
        motionReference,
        connectionIdentity,
      },
    );
  }

  async findOne(organizationId: string, id: string) {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id, ...this.withOrgScope(organizationId) },
      include: FULL_VEHICLE_INCLUDE,
    });
    if (!vehicle) return null;
    const [tripStateMap, bookingBundle] = await Promise.all([
      this.buildTripStateMap([vehicle.id]),
      this.buildBookingContextMap(organizationId, [vehicle.id]),
    ]);
    const activeBookingIds = Array.from(bookingBundle.map.values())
      .map((ctx) => ctx.activeBookingId)
      .filter((id): id is string => !!id);
    const pickupOdoByBooking = await this.fetchPickupOdometerMap(
      organizationId,
      activeBookingIds,
    );
    return this.mapToVehicleData(
      vehicle,
      tripStateMap,
      bookingBundle,
      pickupOdoByBooking,
    );
  }

  async findAllPlatform(
    params?: PaginationParams,
  ): Promise<PaginatedResult<any>> {
    const { skip, take } = parsePagination(params || {});
    const [data, total] = await Promise.all([
      this.prisma.vehicle.findMany({
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: FULL_VEHICLE_WITH_ORG_INCLUDE,
      }),
      this.prisma.vehicle.count(),
    ]);
    const tripStateMap = await this.buildTripStateMap(
      data.map((v) => v.id),
    );

    const byOrg = new Map<string, typeof data>();
    for (const vehicle of data) {
      const orgId = vehicle.organizationId;
      const bucket = byOrg.get(orgId) ?? [];
      bucket.push(vehicle);
      byOrg.set(orgId, bucket);
    }

    const derivedStatusByVehicleId = new Map<string, string>();
    for (const [orgId, orgVehicles] of byOrg) {
      const ids = orgVehicles.map((v) => v.id);
      const bundle = await this.buildBookingContextMap(orgId, ids);
      const activeBookingIds = Array.from(bundle.map.values())
        .map((ctx) => ctx.activeBookingId)
        .filter((id): id is string => !!id);
      const pickupOdoByBooking = await this.fetchPickupOdometerMap(
        orgId,
        activeBookingIds,
      );
      for (const vehicle of orgVehicles) {
        const fleetCtx = this.deriveFleetStatusContext({
          vehicle,
          state: vehicle.latestState ?? null,
          bookingCtx: bundle.map.get(vehicle.id) ?? null,
          pickupOdoByBooking,
          bookingContextLoadFailed: bundle.loadFailed,
        });
        derivedStatusByVehicleId.set(vehicle.id, fleetCtx.status);
      }
    }

    return buildPaginatedResult(
      data.map((v) =>
        this.mapToRegisteredVehicle(
          v,
          tripStateMap,
          derivedStatusByVehicleId.get(v.id) ?? null,
        ),
      ),
      total,
      params || {},
    );
  }

  async getVehicleWithTelemetry(vehicleId: string, organizationId?: string) {
    const where = organizationId
      ? { id: vehicleId, organizationId }
      : { id: vehicleId };
    const vehicle = await this.prisma.vehicle.findFirst({
      where,
      include: {
        homeStation: true,
        latestState: true,
        dimoVehicle: true,
      },
    });
    if (!vehicle) throw new NotFoundException('Vehicle not found');

    const state = vehicle.latestState;
    let latitude = state?.latitude ?? null;
    let longitude = state?.longitude ?? null;

    const tripDetState = await this.prisma.vehicleTripDetectionState
      .findUnique({ where: { vehicleId }, select: { state: true } })
      .catch(() => null);

    const interpreted = interpretVehicleState(
      {
        lastSeenAt: state?.lastSeenAt ?? null,
        speedKmh: state?.speedKmh ?? null,
        isIgnitionOn: state?.isIgnitionOn ?? null,
        engineLoad: state?.engineLoad ?? null,
        tractionBatteryPowerKw: state?.tractionBatteryPowerKw ?? null,
        coolantTempC: state?.coolantTempC ?? null,
        odometerKm: state?.odometerKm ?? null,
      },
      tripDetState,
    );

    const needsFreshGps =
      (latitude == null || longitude == null || interpreted.isLiveTracking) &&
      vehicle.dimoVehicle?.tokenId != null;

    if (needsFreshGps) {
      try {
        const jwt = await this.dimoAuth.getVehicleJwt(
          vehicle.dimoVehicle!.tokenId!,
        );
        const liveContext = buildDimoProviderRequestContext(
          vehicle.dimoVehicle!.tokenId!,
          {
            organizationId,
            vehicleId,
          },
        );
        const raw = await this.dimoTelemetry.fetchLastSeenLocation(
          jwt,
          vehicle.dimoVehicle!.tokenId!,
          liveContext,
        );
        const data = (raw as any)?.data ?? raw;
        const signals = Array.isArray(data?.signalsLatest)
          ? data.signalsLatest[0]
          : data?.signalsLatest;
        if (signals) {
          const loc = signals.currentLocationCoordinates as
            | { value?: { latitude?: number; longitude?: number } }
            | undefined;
          const lat = loc?.value?.latitude;
          const lng = loc?.value?.longitude;
          if (
            typeof lat === 'number' &&
            typeof lng === 'number' &&
            !Number.isNaN(lat) &&
            !Number.isNaN(lng)
          ) {
            latitude = lat;
            longitude = lng;
          }
        }
      } catch (err) {
        const errorClass = classifyVehicleDetailProviderError(err);
        this.vehicleDetailObservability?.observeProviderOutcome(
          'telemetry',
          errorClass === 'timeout'
            ? 'timeout'
            : errorClass === 'rate_limited'
              ? 'rate_limited'
              : 'provider_error',
          err,
        );
      }
    }

    return {
      id: vehicle.id,
      vin: vehicle.vin,
      make: vehicle.make,
      model: vehicle.model,
      year: vehicle.year,
      station: vehicle.homeStation?.name ?? '',
      online: interpreted.isFresh,
      lastSignal: interpreted.lastSignal,
      speed: state?.speedKmh ?? 0,
      odometer: state?.odometerKm ?? vehicle.mileageKm ?? 0,
      fuel: this.resolveFuelPercent(state, vehicle.tankCapacityLiters),
      battery: state?.evSoc ?? 0,
      coolant: state?.coolantTempC ?? 0,
      /** @deprecated HM telemetry gauge only — not brake health truth. */
      brakes: state?.brakePadPercent ?? 0,
      tires: state?.tireHealthPercent ?? 0,
      engineOil: state?.engineOilPercent ?? 0,
      oilLevel: state?.oilLevelRelative ?? 0,
      lvBatteryVoltage: state?.lvBatteryVoltage ?? 0,
      engineLoad: state?.engineLoad ?? 0,
      isIgnitionOn: state?.isIgnitionOn ?? null,
      latitude,
      longitude,
      signalAgeMs: interpreted.signalAgeMs,
      isFresh: interpreted.isFresh,
      onlineStatus: interpreted.onlineStatus,
      telemetryFreshness: interpreted.telemetryFreshness,
      displayState: interpreted.displayState,
      displayIgnition: interpreted.displayIgnition,
      isLiveTracking: interpreted.isLiveTracking,
      displaySpeed: interpreted.displaySpeed,
      displayCoolant: interpreted.displayCoolant,
      displayEngineLoad: interpreted.displayEngineLoad,
      tripDetectionState: interpreted.tripDetectionState,
    };
  }

  // ── Live GPS (direct DIMO proxy, no DB caching) ──────────────────

  async getLiveGps(vehicleId: string, organizationId?: string) {
    const where = organizationId
      ? { id: vehicleId, organizationId }
      : { id: vehicleId };
    const vehicle = await this.prisma.vehicle.findFirst({
      where,
      select: {
        id: true,
        dimoVehicle: { select: { tokenId: true } },
        latestState: { select: { latitude: true, longitude: true } },
      },
    });
    if (!vehicle) throw new NotFoundException('Vehicle not found');

    const tokenId = vehicle.dimoVehicle?.tokenId;
    if (!tokenId) {
      this.vehicleDetailObservability?.recordLiveGpsSource('cache');
      return {
        latitude: vehicle.latestState?.latitude ?? null,
        longitude: vehicle.latestState?.longitude ?? null,
        speedKmh: null,
        lastSeenAt: null,
        source: 'cache' as const,
      };
    }

    if (organizationId) {
      await this.dataAuthorizations.ensureDimoTelemetryAuthorization(
        organizationId,
      );
      await this.dataAuthEnforcement.assertDataAuthorization({
        orgId: organizationId,
        vehicleId,
        sourceType: 'DIMO',
        dataCategory: 'GPS_LOCATION',
        purpose: 'LIVE_MAP',
        processorType: 'SYNQDRIVE',
        trackAccess: true,
      });
    }

    try {
      const jwt = await this.dimoAuth.getVehicleJwt(tokenId);
      const liveContext = buildDimoProviderRequestContext(tokenId, {
        organizationId,
        vehicleId,
      });
      const raw = await this.dimoTelemetry.fetchLastSeenLocation(
        jwt,
        tokenId,
        liveContext,
      );
      const data = (raw as any)?.data ?? raw;
      const signals = Array.isArray(data?.signalsLatest)
        ? data.signalsLatest[0]
        : data?.signalsLatest;

      if (!signals) {
        this.vehicleDetailObservability?.recordLiveGpsSource('cache');
        this.vehicleDetailObservability?.observeProviderOutcome('live_gps', 'cache_fallback');
        return {
          latitude: vehicle.latestState?.latitude ?? null,
          longitude: vehicle.latestState?.longitude ?? null,
          speedKmh: null,
          lastSeenAt: null,
          source: 'cache' as const,
        };
      }

      const loc = signals.currentLocationCoordinates as
        | { timestamp?: string; value?: { latitude?: number; longitude?: number } }
        | undefined;
      const speedSig = signals.speed as
        | { timestamp?: string; value?: number }
        | undefined;

      const lat = loc?.value?.latitude;
      const lng = loc?.value?.longitude;
      const speedKmh = typeof speedSig?.value === 'number' ? speedSig.value : null;
      const lastSeenAt = signals.lastSeen ?? loc?.timestamp ?? null;

      if (typeof lat === 'number' && typeof lng === 'number' && !Number.isNaN(lat) && !Number.isNaN(lng)) {
        this.vehicleDetailObservability?.recordLiveGpsSource('dimo');
        this.vehicleDetailObservability?.observeProviderOutcome('live_gps', 'success');
        return { latitude: lat, longitude: lng, speedKmh, lastSeenAt, source: 'dimo' as const };
      }

      this.vehicleDetailObservability?.recordLiveGpsSource('cache');
      this.vehicleDetailObservability?.observeProviderOutcome('live_gps', 'cache_fallback');
      return {
        latitude: vehicle.latestState?.latitude ?? null,
        longitude: vehicle.latestState?.longitude ?? null,
        speedKmh,
        lastSeenAt,
        source: 'cache' as const,
      };
    } catch (err) {
      const errorClass = classifyVehicleDetailProviderError(err);
      this.vehicleDetailObservability?.observeProviderOutcome(
        'live_gps',
        errorClass === 'timeout'
          ? 'timeout'
          : errorClass === 'rate_limited'
            ? 'rate_limited'
            : 'provider_error',
        err,
      );
      this.vehicleDetailObservability?.recordLiveGpsSource('cache');
      this.logger.warn({
        msg: 'vehicle_detail.live_gps_provider_failed',
        errorClass,
      });
      return {
        latitude: vehicle.latestState?.latitude ?? null,
        longitude: vehicle.latestState?.longitude ?? null,
        speedKmh: null,
        lastSeenAt: null,
        source: 'cache' as const,
      };
    }
  }

  // ── Mutations ─────────────────────────────────────────────────────

  async upsertHvMasterSpecificationForAdmin(
    vehicleId: string,
    patch: UpsertHvMasterSpecInput,
  ): Promise<VehicleHvMasterSpecificationV1> {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
      select: { id: true, hvMasterSpecification: true, hvBatteryCapacityKwh: true },
    });
    if (!vehicle) throw new NotFoundException('Vehicle not found');

    const existing = parseVehicleHvMasterSpecification(vehicle.hvMasterSpecification);
    const merged = mergeHvMasterSpecification(existing, patch);

    if (
      merged.grossCapacityKwh != null &&
      vehicle.hvBatteryCapacityKwh != null &&
      merged.grossCapacityKwh < vehicle.hvBatteryCapacityKwh
    ) {
      throw new ConflictException('HV_GROSS_BELOW_LEGACY_USABLE');
    }

    await this.prisma.vehicle.update({
      where: { id: vehicleId },
      data: { hvMasterSpecification: merged as unknown as Prisma.InputJsonValue },
    });

    return merged;
  }

  async update(
    id: string,
    data: Prisma.VehicleUpdateInput,
    organizationId?: string,
    options?: { rawBody?: Record<string, unknown> },
  ): Promise<Vehicle> {
    const where: Prisma.VehicleWhereUniqueInput = { id };
    const existing = organizationId
      ? await this.prisma.vehicle.findFirst({
          where: { id, ...this.withOrgScope(organizationId) },
          select: {
            id: true,
            organizationId: true,
            engineDisplacementCc: true,
            cylinderCount: true,
            frontWeightDistributionPct: true,
            idleRpm: true,
            maxRpm: true,
            brakeForceFrontPercent: true,
            tankCapacityLiters: true,
            serviceIntervalManufacturerKm: true,
            serviceIntervalManufacturerMonths: true,
            oilChangeIntervalKm: true,
            oilChangeIntervalMonths: true,
            driveType: true,
            registrationIdentityProvenance: true,
            updatedAt: true,
          },
        })
      : await this.prisma.vehicle.findUnique({
          where: { id },
          select: {
            id: true,
            organizationId: true,
            engineDisplacementCc: true,
            cylinderCount: true,
            frontWeightDistributionPct: true,
            idleRpm: true,
            maxRpm: true,
            brakeForceFrontPercent: true,
            tankCapacityLiters: true,
            serviceIntervalManufacturerKm: true,
            serviceIntervalManufacturerMonths: true,
            oilChangeIntervalKm: true,
            oilChangeIntervalMonths: true,
            driveType: true,
            registrationIdentityProvenance: true,
            updatedAt: true,
          },
        });
    if (!existing) throw new NotFoundException('Vehicle not found');

    const rawBody = options?.rawBody ?? (data as Record<string, unknown>);
    const technicalInput = extractTechnicalSpecificationPatchInput(rawBody);
    let merged: Prisma.VehicleUpdateInput = {
      ...stripTechnicalSpecificationKeysFromUpdateBody(data as Record<string, unknown>),
    };
    let optimisticTechnicalSave = false;
    if (technicalInput) {
      assertAiTechnicalFieldsConfirmed(
        technicalInput,
        rawBody.aiFieldProvenance as Record<string, { category?: string }> | undefined,
      );
      const provenanceDoc = parseRegistrationIdentityProvenance(
        existing.registrationIdentityProvenance,
      );
      optimisticTechnicalSave = technicalSpecSaveRequiresOptimisticConcurrency(
        provenanceDoc,
        existing,
        technicalInput,
      );
      const technicalPatch = buildVehicleTechnicalSpecificationPrismaPatch(
        existing,
        technicalInput,
        provenanceDoc,
      );
      merged = {
        ...stripTechnicalSpecificationKeysFromUpdateBody(merged as Record<string, unknown>),
        ...technicalPatch,
      } as Prisma.VehicleUpdateInput;
    }

    if (optimisticTechnicalSave) {
      const optimisticWhere: Prisma.VehicleWhereInput = {
        id,
        updatedAt: existing.updatedAt,
      };
      if (organizationId) {
        optimisticWhere.organizationId = organizationId;
      }
      const writeResult = await this.prisma.vehicle.updateMany({
        where: optimisticWhere,
        data: merged,
      });
      if (writeResult.count !== 1) {
        throw new ConflictException({
          code: 'VEHICLE_TECH_SPEC_SAVE_CONFLICT',
          message: 'Concurrent technical specification save detected; reload and confirm again.',
        });
      }
      const updated = await this.prisma.vehicle.findUnique({ where: { id } });
      if (!updated) throw new NotFoundException('Vehicle not found');
      return updated;
    }

    return this.prisma.vehicle.update({ where, data: merged });
  }

  async upsertTireData(
    vehicleId: string,
    organizationId: string,
    tires: {
      frontDimension?: string | null;
      rearDimension?: string | null;
      brandModelFront?: string | null;
      brandModelRear?: string | null;
      tireSeason?: string | null;
      loadIndexFront?: string | null;
      speedIndexFront?: string | null;
      loadIndexRear?: string | null;
      speedIndexRear?: string | null;
      dotCodeFront?: string | null;
      dotCodeRear?: string | null;
      treadFL?: number | null;
      treadFR?: number | null;
      treadBL?: number | null;
      treadBR?: number | null;
      tireCondition?: string | null;
    },
  ) {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId, ...this.withOrgScope(organizationId) },
      select: { id: true },
    });
    if (!vehicle) throw new NotFoundException('Vehicle not found');

    return this.tireLifecycleService.upsertSetupAndMeasurement({
      vehicleId,
      organizationId,
      frontDimension: tires.frontDimension ?? null,
      rearDimension: tires.rearDimension ?? null,
      brandModelFront: tires.brandModelFront ?? null,
      brandModelRear: tires.brandModelRear ?? null,
      tireSeason: tires.tireSeason ?? null,
      loadIndexFront: tires.loadIndexFront ?? null,
      speedIndexFront: tires.speedIndexFront ?? null,
      loadIndexRear: tires.loadIndexRear ?? null,
      speedIndexRear: tires.speedIndexRear ?? null,
      dotCodeFront: tires.dotCodeFront ?? null,
      dotCodeRear: tires.dotCodeRear ?? null,
      treadFL: tires.treadFL ?? null,
      treadFR: tires.treadFR ?? null,
      treadBL: tires.treadBL ?? null,
      treadBR: tires.treadBR ?? null,
      tireCondition: tires.tireCondition ?? null,
      source: 'manual_edit',
    });
  }

  async updateCleaningStatus(
    vehicleId: string,
    cleaningStatus: CleaningStatus,
  ): Promise<Vehicle> {
    await this.prisma.vehicle.findUniqueOrThrow({
      where: { id: vehicleId },
    });
    return this.prisma.vehicle.update({
      where: { id: vehicleId },
      data: { cleaningStatus },
    });
  }

  async updateHealthStatus(
    vehicleId: string,
    healthStatus: HealthStatus,
  ): Promise<Vehicle> {
    await this.prisma.vehicle.findUniqueOrThrow({
      where: { id: vehicleId },
    });
    return this.prisma.vehicle.update({
      where: { id: vehicleId },
      data: { healthStatus },
    });
  }

  /**
   * VO5C-P2B3: physical vehicle DELETE retired — fail-closed.
   */
  async delete(_id: string, _organizationId?: string): Promise<never> {
    this.logger.warn({
      msg: 'legacy_vehicle_delete_blocked',
      code: 'LEGACY_VEHICLE_DESTRUCTION_DISABLED',
    });
    throw legacyVehicleDeleteDisabledException();
  }

  /**
   * VO5C-P2B1: legacy Master Admin deregister retired — fail-closed.
   * Use canonical vehicle onboarding offboard HTTP instead.
   */
  async deregister(_vehicleId: string): Promise<never> {
    this.logger.warn({
      msg: 'legacy_vehicle_deregistration_blocked',
      code: 'LEGACY_VEHICLE_DESTRUCTION_DISABLED',
    });
    throw legacyVehicleDestructionDisabledException();
  }

  private parseFuelType(input: unknown, fallback: FuelType): FuelType {
    if (input == null || input === '') return fallback;
    if (typeof input === 'string') {
      const k = input.toUpperCase().replace(/\s+/g, '_');
      const alias: Record<string, FuelType> = {
        ...DIMO_FUEL_TYPE_MAP,
        PLUGIN_HYBRID: FuelType.PLUGIN_HYBRID,
        PLUGINHYBRID: FuelType.PLUGIN_HYBRID,
        PHEV: FuelType.PLUGIN_HYBRID,
      };
      return alias[k] ?? fallback;
    }
    return input as FuelType;
  }

  private parseVehicleType(input: unknown): VehicleType | undefined {
    if (input == null || input === '') return undefined;
    if (typeof input !== 'string') return input as VehicleType;
    const k = input.toUpperCase().replace(/\s+/g, '_');
    const map: Record<string, VehicleType> = {
      SEDAN: VehicleType.SEDAN,
      SUV: VehicleType.SUV,
      HATCHBACK: VehicleType.HATCHBACK,
      WAGON: VehicleType.WAGON,
      COUPE: VehicleType.COUPE,
      CONVERTIBLE: VehicleType.CONVERTIBLE,
      VAN: VehicleType.VAN,
      TRUCK: VehicleType.TRUCK,
      MINIVAN: VehicleType.MINIVAN,
      SPORTS: VehicleType.COUPE,
      OTHER: VehicleType.OTHER,
    };
    return map[k];
  }

  async registerFromDimo(
    orgId: string,
    stationId: string | null,
    dimoVehicleId: string,
    extraData?: Partial<Prisma.VehicleCreateInput> & {
      fuelType?: FuelType | string;
      vehicleType?: VehicleType | string;
    },
    manualSpecs?: {
      battery?: {
        batteryType?: string | null;
        batteryAmpere?: number | null;
        batteryVolt?: number | null;
      };
      brakes?: RegistrationBrakeManualSpec;
      tires?: {
        frontDimension?: string | null;
        rearDimension?: string | null;
        brandModelFront?: string | null;
        brandModelRear?: string | null;
        tireSeason?: string | null;
        loadIndexFront?: string | null;
        speedIndexFront?: string | null;
        loadIndexRear?: string | null;
        speedIndexRear?: string | null;
        dotCodeFront?: string | null;
        dotCodeRear?: string | null;
        tireCondition?: string | null;
        initialTreadFrontMm?: number | null;
        initialTreadRearMm?: number | null;
        treadFL?: number | null;
        treadFR?: number | null;
        treadBL?: number | null;
        treadBR?: number | null;
        aiTireSpec?: Record<string, unknown> | null;
      };
    },
    createdByUserId?: string | null,
  ): Promise<RegisterFromDimoResult> {
    try {
      const result = await runVehicleOnboardingHttp(() =>
        this.masterDimoCanonicalRegistration.register({
          organizationId: orgId,
          stationId,
          dimoVehicleId,
          extraData,
          manualSpecs,
          actorUserId: createdByUserId ?? null,
        }),
      );

      let postActivationEnrichment: RegisterFromDimoResult['postActivationEnrichment'];
      if (
        !result.idempotentReplay &&
        manualSpecs?.tires &&
        this.masterDimoCanonicalRegistration.masterManualSpecsNeedLegacyTireTreadPass({
          organizationId: orgId,
          stationId,
          dimoVehicleId,
          manualSpecs,
          actorUserId: createdByUserId ?? null,
        })
      ) {
        try {
          await this.applyRegisterFromDimoTireTreadEnrichment(
            orgId,
            result.vehicle.id,
            manualSpecs.tires,
          );
        } catch (tireError) {
          const message =
            tireError instanceof Error ? tireError.message : 'Tire tread enrichment failed';
          this.logger.warn(
            `registerFromDimo tire tread enrichment failed vehicleId=${result.vehicle.id} orgId=${orgId}: ${message}`,
          );
          postActivationEnrichment = {
            tireTread: { status: 'FAILED', message },
          };
        }
      }

      this.capabilityLifecycle?.refreshOnNewIntegration(orgId, result.vehicle.id);
      void this.batteryCapabilityRefresh?.enqueueForDimoVehicle(
        orgId,
        result.vehicle.id,
        BatteryCapabilityRefreshTrigger.VEHICLE_REGISTRATION,
      );
      void this.dataAuthorizations.ensureDimoTelemetryAuthorization(orgId);

      const vehicle = await this.prisma.vehicle.findUniqueOrThrow({
        where: { id: result.vehicle.id },
      });
      return {
        vehicle,
        brakeRegistration: result.brakeRegistration,
        postActivationEnrichment,
      };
    } catch (error) {
      if (error instanceof ConflictException) {
        const body = error.getResponse();
        if (
          typeof body === 'object' &&
          body &&
          (body as { code?: string }).code === 'SOURCE_ALREADY_REGISTERED'
        ) {
          const details = (body as { details?: Record<string, unknown> }).details ?? {};
          throw new ConflictException({
            code: 'DIMO_VEHICLE_ALREADY_REGISTERED',
            message:
              (body as { message?: string }).message ??
              'This DIMO vehicle is already linked to a fleet vehicle',
            vehicleId: details.vehicleId,
            organizationId: details.organizationId,
          });
        }
        if (
          (body as { code?: string }).code === 'MASTER_DIMO_REGISTRATION_PAYLOAD_MISMATCH'
        ) {
          const mismatchDetails =
            (body as { details?: Record<string, unknown> }).details ?? {};
          throw new ConflictException({
            code: 'DIMO_REGISTER_PAYLOAD_MISMATCH',
            message:
              (body as { message?: string }).message ??
              'DIMO vehicle is already registered with a different payload',
            vehicleId: mismatchDetails.vehicleId,
            organizationId: mismatchDetails.organizationId,
            useVehicleUpdateWorkflow: mismatchDetails.useVehicleUpdateWorkflow ?? true,
          });
        }
      }
      throw error;
    }
  }

  private async applyRegisterFromDimoTireTreadEnrichment(
    organizationId: string,
    vehicleId: string,
    tr: NonNullable<
      Parameters<VehiclesService['registerFromDimo']>[4]
    >['tires'],
  ): Promise<void> {
    if (!tr) return;
    const result = await this.tireLifecycleService.upsertSetupAndMeasurement({
      vehicleId,
      organizationId,
      frontDimension: tr.frontDimension ?? null,
      rearDimension: tr.rearDimension ?? null,
      brandModelFront: tr.brandModelFront ?? null,
      brandModelRear: tr.brandModelRear ?? null,
      tireSeason: tr.tireSeason ?? null,
      loadIndexFront: tr.loadIndexFront ?? null,
      speedIndexFront: tr.speedIndexFront ?? null,
      loadIndexRear: tr.loadIndexRear ?? null,
      speedIndexRear: tr.speedIndexRear ?? null,
      dotCodeFront: tr.dotCodeFront ?? null,
      dotCodeRear: tr.dotCodeRear ?? null,
      treadFL: tr.treadFL ?? null,
      treadFR: tr.treadFR ?? null,
      treadBL: tr.treadBL ?? null,
      treadBR: tr.treadBR ?? null,
      tireCondition: tr.tireCondition ?? null,
      source: 'manual_registration',
    });

    if (result.setup?.id && (tr.initialTreadFrontMm != null || tr.initialTreadRearMm != null)) {
      await this.prisma.vehicleTireSetup.update({
        where: { id: result.setup.id },
        data: {
          initialTreadFrontMm: tr.initialTreadFrontMm ?? undefined,
          initialTreadRearMm: tr.initialTreadRearMm ?? undefined,
        },
      });
    }

    if (tr.aiTireSpec && result.setup?.id) {
      const existingSetup = await this.prisma.vehicleTireSetup.findUnique({
        where: { id: result.setup.id },
        select: { aiTireSpec: true },
      });
      const normalizedJson = buildNormalizedRegistrationAiTireSpecJson(
        tr.aiTireSpec as Record<string, unknown>,
        existingSetup?.aiTireSpec,
        {
          brandModelFront: tr.brandModelFront ?? null,
          frontDimension: tr.frontDimension ?? null,
          loadIndexFront: tr.loadIndexFront ?? null,
          speedIndexFront: tr.speedIndexFront ?? null,
        },
      );
      if (normalizedJson) {
        await this.prisma.vehicleTireSetup.update({
          where: { id: result.setup.id },
          data: { aiTireSpec: normalizedJson },
        });
      }
    }
  }

  async getFleetConnectivity(
    organizationId: string,
    query: FleetConnectivityQueryDto = {},
  ): Promise<FleetConnectivityResponseDto> {
    const generatedAt = new Date().toISOString();
    const nowMs = Date.now();
    const page = query.page ?? 1;
    const limit =
      query.limit ??
      (query.page != null
        ? DEFAULT_FLEET_CONNECTIVITY_LIMIT
        : FLEET_CONNECTIVITY_HARD_LIMIT);

    const vehicles = await this.prisma.vehicle.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      take: FLEET_CONNECTIVITY_HARD_LIMIT,
      include: {
        dimoVehicle: true,
        latestState: true,
        homeStation: { select: { name: true } },
      },
    });

    const vehicleIds = vehicles.map((v) => v.id);
    const hardwareById = new Map(
      vehicles.map((v) => [v.id, v.hardwareType as string | null]),
    );
    const dimoLinkedById = new Map(
      vehicles.map((v) => [v.id, v.dimoVehicleId != null]),
    );
    const tokenIdById = new Map(
      vehicles.map((v) => [v.id, v.dimoVehicle?.tokenId ?? null]),
    );
    const deviceSummaries = await this.deviceConnectionQuery.getFleetSummariesForVehicles(
      organizationId,
      vehicleIds,
      hardwareById,
      dimoLinkedById,
      tokenIdById,
    );
    const runtimeByVehicle = await this.connectivityRuntimeProjection.projectForVehicles(
      organizationId,
      vehicleIds,
    );

    let mapped = vehicles.map((v) => {
      const summary = deviceSummaries.get(v.id);
      const deviceConnection =
        summary && (summary.lteR1Capable || summary.lastWebhookReceivedAt)
          ? buildFleetDeviceConnectionFields(summary)
          : null;
      const runtime = runtimeByVehicle.get(v.id);
      if (!runtime) {
        throw new Error(`Missing connectivity runtime for vehicle ${v.id}`);
      }
      return mapFleetConnectivityVehicle(v, nowMs, deviceConnection, runtime);
    });

    if (query.status) {
      mapped = mapped.filter((v) => v.connectionStatus === query.status);
    }
    if (query.q?.trim()) {
      mapped = mapped.filter((v) =>
        matchesFleetConnectivitySearch(v, query.q!),
      );
    }

    const summaryLegacy = buildFleetConnectivitySummary(mapped);
    const allItems = sortFleetConnectivityListItems(
      mapped.map((v) => mapFleetConnectivityListItem(v)),
    );
    const kpiSummary = buildFleetConnectivityKpiSummary(allItems);

    const itemPagination = paginateFleetConnectivityVehicles(allItems, page, limit);
    const vehicleById = new Map(mapped.map((v) => [v.vehicleId, v]));
    const pageVehicles = itemPagination.pageItems
      .map((item) => vehicleById.get(item.vehicle.vehicleId))
      .filter((v): v is NonNullable<typeof v> => v != null);

    return {
      generatedAt,
      summary: kpiSummary,
      pagination: {
        page: itemPagination.page,
        limit: itemPagination.limit,
        total: itemPagination.total,
        totalInOrganization: vehicles.length,
      },
      items: itemPagination.pageItems,
      vehicles: pageVehicles,
      thresholds: { ...FLEET_CONNECTIVITY_THRESHOLDS },
      legacySummary: summaryLegacy,
    };
  }

  async getFleetConnectivityDetail(
    organizationId: string,
    vehicleId: string,
  ): Promise<FleetConnectivityDetailDto> {
    const { detail } = await this.buildFleetConnectivityDetail(
      organizationId,
      vehicleId,
    );
    return detail;
  }

  /**
   * Master-Admin-only. Tenant-facing detail plus the connectivity diagnostic
   * dimension (provider reachability vs. vehicle observation freshness).
   */
  async getFleetConnectivityAdminDiagnostics(
    organizationId: string,
    vehicleId: string,
  ): Promise<
    FleetConnectivityDetailDto & {
      connectivityDiagnostic: ConnectivityDiagnosticAdminDto;
    }
  > {
    const { detail, runtime, providerSource } =
      await this.buildFleetConnectivityDetail(organizationId, vehicleId);

    return {
      ...detail,
      connectivityDiagnostic: serializeConnectivityDiagnosticAdmin(runtime, {
        provider: providerSource,
      }),
    };
  }

  private async buildFleetConnectivityDetail(
    organizationId: string,
    vehicleId: string,
  ): Promise<{
    detail: FleetConnectivityDetailDto;
    runtime: VehicleConnectivityRuntimeState;
    providerSource: string | null;
  }> {
    const nowMs = Date.now();
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId, organizationId },
      include: {
        dimoVehicle: true,
        latestState: true,
        homeStation: { select: { name: true } },
      },
    });
    if (!vehicle) {
      throw new NotFoundException('Vehicle not found');
    }

    const hardwareById = new Map([[vehicle.id, vehicle.hardwareType as string | null]]);
    const dimoLinkedById = new Map([[vehicle.id, vehicle.dimoVehicleId != null]]);
    const tokenIdById = new Map([[vehicle.id, vehicle.dimoVehicle?.tokenId ?? null]]);
    const [deviceSummaries, runtimeByVehicle] = await Promise.all([
      this.deviceConnectionQuery.getFleetSummariesForVehicles(
        organizationId,
        [vehicle.id],
        hardwareById,
        dimoLinkedById,
        tokenIdById,
      ),
      this.connectivityRuntimeProjection.projectForVehicles(organizationId, [vehicle.id]),
    ]);

    const summary = deviceSummaries.get(vehicle.id);
    const deviceConnection =
      summary && (summary.lteR1Capable || summary.lastWebhookReceivedAt)
        ? buildFleetDeviceConnectionFields(summary)
        : null;
    const runtime = runtimeByVehicle.get(vehicle.id);
    if (!runtime) {
      throw new Error(`Missing connectivity runtime for vehicle ${vehicle.id}`);
    }

    const mapped = mapFleetConnectivityVehicle(vehicle, nowMs, deviceConnection, runtime);
    return {
      detail: mapFleetConnectivityDetail(mapped),
      runtime,
      providerSource:
        vehicle.latestState?.providerSource ??
        (vehicle.dimoVehicleId != null ? 'DIMO' : null),
    };
  }

  async getDeviceConnection(organizationId: string, vehicleId: string) {
    try {
      const [summary, runtime] = await Promise.all([
        this.deviceConnectionQuery.getVehicleSummary(organizationId, vehicleId, {
          eventLimit: 20,
        }),
        this.connectivityRuntimeProjection.projectForVehicle(organizationId, vehicleId),
      ]);
      return {
        ...summary,
        connectivityRuntime: serializeVehicleConnectivityRuntimeState(runtime),
      };
    } catch (err) {
      this.vehicleDetailObservability?.recordDeviceConnectionError(err);
      throw err;
    }
  }

  async listVehicleComplaints(organizationId: string, vehicleId: string) {
    const v = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId, organizationId },
      select: { id: true },
    });
    if (!v) throw new NotFoundException('Vehicle not found');
    return this.prisma.vehicleComplaint.findMany({
      where: { vehicleId, organizationId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createVehicleComplaint(
    organizationId: string,
    vehicleId: string,
    createdByUserId: string | undefined,
    body: { description: string; urgency?: string; region?: string | null },
  ) {
    const v = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId, organizationId },
      select: { id: true },
    });
    if (!v) throw new NotFoundException('Vehicle not found');

    const urgencyRaw = (body.urgency || 'MEDIUM').toUpperCase();
    const urgency =
      urgencyRaw === 'LOW' ||
      urgencyRaw === 'MEDIUM' ||
      urgencyRaw === 'HIGH' ||
      urgencyRaw === 'CRITICAL'
        ? urgencyRaw
        : 'MEDIUM';

    const complaint = await this.prisma.vehicleComplaint.create({
      data: {
        organizationId,
        vehicleId,
        createdByUserId: createdByUserId ?? null,
        description: body.description.trim(),
        urgency: urgency as 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL',
        region: body.region?.trim() || null,
        source: 'MANUAL',
      },
    });

    const taskPriority =
      urgency === 'CRITICAL'
        ? 'CRITICAL'
        : urgency === 'HIGH'
          ? 'HIGH'
          : urgency === 'LOW'
            ? 'LOW'
            : 'NORMAL';

    try {
      await this.tasksService.createManualTask(
        organizationId,
        {
          title: `Complaint: ${body.description.slice(0, 72)}${body.description.length > 72 ? '…' : ''}`,
          description: body.description,
          category: 'VEHICLE_COMPLAINT',
          type: 'CUSTOM',
          priority: taskPriority,
          vehicleId,
        },
        createdByUserId,
      );
    } catch (err: any) {
      this.logger.warn(`Could not create OrgTask for complaint: ${err?.message ?? err}`);
    }

    return complaint;
  }
}
