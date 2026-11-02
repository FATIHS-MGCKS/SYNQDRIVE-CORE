import {
  BadRequestException,
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
  Optional,
  Logger,
} from '@nestjs/common';
import { VehiclesService } from './vehicles.service';
import type { RegistrationBrakeManualSpec } from '@modules/vehicle-intelligence/brakes/register-brake-baseline';
import { VehicleExteriorImagesService } from './vehicle-exterior-images.service';
import { RolesGuard } from '@shared/auth/roles.guard';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { PermissionsGuard } from '@shared/auth/permissions.guard';
import { RequirePermission } from '@shared/decorators/require-permission.decorator';
import { VehicleOwnershipGuard } from '@shared/auth/vehicle-ownership.guard';
import { Roles } from '@shared/decorators/roles.decorator';
import { RequireMasterAdminMfa } from '@shared/decorators/require-master-admin-mfa.decorator';
import { MasterAdminMfaGuard } from '@shared/auth/master-admin-mfa.guard';
import { STEP_UP_ACTION } from '@modules/iam-mfa/iam-mfa.policy';
import {
  LEGACY_VEHICLE_DESTRUCTION_DISABLED_CODE,
  legacyVehicleDeleteDisabledException,
  legacyVehicleDestructionDisabledException,
} from './legacy-vehicle-destruction.errors';
import { PaginationParams } from '@shared/utils/pagination';
import { UpsertVehicleHvMasterSpecificationDto } from './dto/upsert-vehicle-hv-master-specification.dto';
import {
  Prisma,
  CleaningStatus,
  HealthStatus,
  VehicleStatus,
  VehicleType,
  FuelType,
} from '@prisma/client';
import { FleetConnectivityQueryDto } from './dto/fleet-connectivity-query.dto';
import { VehicleCleaningTaskService } from '../tasks/vehicle-cleaning-task.service';
import { VehicleDetailObservabilityService } from './observability/vehicle-detail-observability.service';
import { VehiclesOperationalService } from './vehicles-operational.service';
import type { VehiclesOperationalQueryDto } from './vehicles-operational.types';

interface VehicleStatusAuthRequest {
  user?: { id?: string };
}

type VehicleExteriorView = 'FRONT' | 'LEFT' | 'RIGHT' | 'REAR' | 'ROOF';

const ALLOWED_EXTERIOR_VIEWS: ReadonlySet<VehicleExteriorView> =
  new Set<VehicleExteriorView>([
    'FRONT' as VehicleExteriorView,
    'LEFT' as VehicleExteriorView,
    'RIGHT' as VehicleExteriorView,
    'REAR' as VehicleExteriorView,
    'ROOF' as VehicleExteriorView,
  ]);

function parseExteriorView(value: string): VehicleExteriorView {
  const upper = (value || '').toUpperCase() as VehicleExteriorView;
  if (!ALLOWED_EXTERIOR_VIEWS.has(upper)) {
    throw new BadRequestException(
      `Unknown exterior view '${value}'. Expected one of FRONT, LEFT, RIGHT, REAR, ROOF.`,
    );
  }
  return upper;
}

@Controller()
@UseGuards(RolesGuard)
export class VehiclesController {
  private readonly logger = new Logger(VehiclesController.name);

  constructor(
    private readonly vehiclesService: VehiclesService,
    private readonly exteriorImagesService: VehicleExteriorImagesService,
    private readonly vehicleCleaningTasks: VehicleCleaningTaskService,
    private readonly vehiclesOperational: VehiclesOperationalService,
    @Optional() private readonly vehicleDetailObservability?: VehicleDetailObservabilityService,
  ) {}

  // ── Admin (platform-wide) ─────────────────────────────────────────

  @Get('admin/vehicles')
  @Roles('MASTER_ADMIN')
  async findAllPlatform(@Query() query: PaginationParams) {
    return this.vehiclesService.findAllPlatform(query);
  }

  @Get('admin/vehicles/operational/overview')
  @Roles('MASTER_ADMIN')
  async vehiclesOperationalOverview(@Query('organizationId') organizationId?: string) {
    return this.vehiclesOperational.getOverview(
      organizationId?.trim() ? { organizationId: organizationId.trim() } : undefined,
    );
  }

  @Get('admin/vehicles/operational/attention-queue')
  @Roles('MASTER_ADMIN')
  async vehiclesAttentionQueue(@Query('limit') limit?: string) {
    const parsed = limit ? Number.parseInt(limit, 10) : 8;
    return this.vehiclesOperational.getAttentionQueue(Number.isFinite(parsed) ? parsed : 8);
  }

  @Get('admin/vehicles/operational')
  @Roles('MASTER_ADMIN')
  async findAllVehiclesOperational(@Query() query: VehiclesOperationalQueryDto) {
    return this.vehiclesOperational.findAllOperational(query);
  }

  @Get('admin/vehicles/import-preflight')
  @Roles('MASTER_ADMIN')
  async vehiclesImportPreflight(
    @Query('organizationId') organizationId: string,
    @Query('dimoVehicleId') dimoVehicleId: string,
  ) {
    return this.vehiclesOperational.importPreflight(organizationId, dimoVehicleId);
  }

  @Get('admin/vehicles/unregistered/:dimoVehicleId/operational')
  @Roles('MASTER_ADMIN')
  async getUnregisteredVehicleOperational(@Param('dimoVehicleId') dimoVehicleId: string) {
    return this.vehiclesOperational.getUnregisteredDetail(dimoVehicleId);
  }

  @Get('admin/vehicles/:vehicleId/operational')
  @Roles('MASTER_ADMIN')
  async getVehicleOperational(@Param('vehicleId') vehicleId: string) {
    return this.vehiclesOperational.getOperationalDetail(vehicleId);
  }

  @Get('admin/vehicles/:vehicleId/operational/diagnostics')
  @Roles('MASTER_ADMIN')
  async getVehicleOperationalDiagnostics(
    @Param('vehicleId') vehicleId: string,
    @Query('organizationId') organizationId: string,
  ) {
    // Without an explicit org the Prisma filter would collapse to an unscoped
    // vehicle lookup, so the diagnostic payload could describe a vehicle in an
    // organization the caller never named.
    if (!organizationId) {
      throw new BadRequestException('organizationId is required');
    }
    return this.vehiclesOperational.getDiagnostics(vehicleId, organizationId);
  }

  @Get('admin/vehicles/:vehicleId')
  @Roles('MASTER_ADMIN')
  async findOneAdmin(@Param('vehicleId') vehicleId: string) {
    return this.vehiclesService.findById(vehicleId);
  }

  @Patch('admin/vehicles/:vehicleId/hv-master-specification')
  @Roles('MASTER_ADMIN')
  async upsertHvMasterSpecificationAdmin(
    @Param('vehicleId') vehicleId: string,
    @Body() body: UpsertVehicleHvMasterSpecificationDto,
  ) {
    return this.vehiclesService.upsertHvMasterSpecificationForAdmin(vehicleId, body);
  }

  // ── Organizations/:orgId/vehicles (org-scoped CRUD) ───────────────

  @Get('organizations/:orgId/vehicles')
  @UseGuards(OrgScopingGuard)
  async findAllByOrg(
    @Param('orgId') orgId: string,
    @Query() query: PaginationParams,
  ) {
    return this.vehiclesService.findByOrganization(orgId, query);
  }

  @Get('organizations/:orgId/fleet-map')
  @UseGuards(OrgScopingGuard)
  async getFleetMap(@Param('orgId') orgId: string) {
    return this.vehiclesService.getFleetMapData(orgId);
  }

  @Get('organizations/:orgId/vehicles/:vehicleId')
  @UseGuards(OrgScopingGuard)
  async findOneByOrg(
    @Param('orgId') orgId: string,
    @Param('vehicleId') vehicleId: string,
  ) {
    return this.vehiclesService.findOne(orgId, vehicleId);
  }

  @Get('organizations/:orgId/vehicles/:vehicleId/telemetry')
  @UseGuards(OrgScopingGuard, PermissionsGuard)
  @RequirePermission('fleet', 'read')
  async getVehicleTelemetry(
    @Param('orgId') orgId: string,
    @Param('vehicleId') vehicleId: string,
  ) {
    const started = performance.now();
    try {
      const result = await this.vehiclesService.getVehicleWithTelemetry(vehicleId, orgId);
      this.vehicleDetailObservability?.observeRequest('telemetry', started, null);
      return result;
    } catch (err) {
      this.vehicleDetailObservability?.observeRequest('telemetry', started, err);
      throw err;
    }
  }

  @Get('organizations/:orgId/vehicles/:vehicleId/live-gps')
  @UseGuards(OrgScopingGuard, PermissionsGuard)
  @RequirePermission('fleet', 'read')
  async getLiveGps(
    @Param('orgId') orgId: string,
    @Param('vehicleId') vehicleId: string,
  ) {
    const started = performance.now();
    try {
      const result = await this.vehiclesService.getLiveGps(vehicleId, orgId);
      this.vehicleDetailObservability?.observeRequest('live_gps', started, null);
      return result;
    } catch (err) {
      this.vehicleDetailObservability?.observeRequest('live_gps', started, err);
      throw err;
    }
  }

  @Post('organizations/:orgId/vehicles')
  @UseGuards(OrgScopingGuard, PermissionsGuard)
  @RequirePermission('fleet', 'write')
  async createByOrg(
    @Param('orgId') orgId: string,
    @Body() body: Omit<Prisma.VehicleCreateInput, 'organization'>,
    @Req() req: any,
  ) {
    return this.vehiclesService.create(orgId, body, req.user?.id);
  }

  @Post('organizations/:orgId/vehicles/register-from-dimo')
  @UseGuards(OrgScopingGuard, PermissionsGuard)
  @RequirePermission('fleet', 'write')
  async registerFromDimo(
    @Param('orgId') orgId: string,
    @Body()
    body: {
      dimoVehicleId: string;
      stationId?: string;
      /** Core vehicle fields (Prisma-safe subset + string enums from client) */
      extraData?: Partial<Prisma.VehicleCreateInput> & {
        fuelType?: FuelType | string;
        vehicleType?: VehicleType | string;
      };
      /** Optional manual intelligence rows created after the vehicle */
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
          initialTreadFrontMm?: number | null;
          initialTreadRearMm?: number | null;
          treadFL?: number | null;
          treadFR?: number | null;
          treadBL?: number | null;
          treadBR?: number | null;
        };
      };
    },
    @Req() req: any,
  ) {
    return this.vehiclesService.registerFromDimo(
      orgId,
      body.stationId ?? null,
      body.dimoVehicleId,
      body.extraData,
      body.manualSpecs,
      req.user?.id ?? null,
    );
  }

  @Patch('organizations/:orgId/vehicles/:vehicleId')
  @UseGuards(OrgScopingGuard, PermissionsGuard)
  @RequirePermission('fleet', 'write')
  async updateByOrg(
    @Param('orgId') orgId: string,
    @Param('vehicleId') vehicleId: string,
    @Body() body: Prisma.VehicleUpdateInput,
  ) {
    return this.vehiclesService.update(vehicleId, body, orgId, {
      rawBody: body as Record<string, unknown>,
    });
  }

  @Put('organizations/:orgId/vehicles/:vehicleId/tires')
  @UseGuards(OrgScopingGuard, PermissionsGuard)
  @RequirePermission('fleet', 'write')
  async upsertTireData(
    @Param('orgId') orgId: string,
    @Param('vehicleId') vehicleId: string,
    @Body() body: {
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
      treadFL?: number | null;
      treadFR?: number | null;
      treadBL?: number | null;
      treadBR?: number | null;
    },
  ) {
    return this.vehiclesService.upsertTireData(vehicleId, orgId, body);
  }

  /**
   * V4.6.90 — Only operational availability states can be set directly
   * via the admin status PATCH.
   *
   * `RENTED` and `RESERVED` are derived from real booking / handover
   * truth (see `BookingsHandoverService.createHandover` — PICKUP moves
   * the booking to ACTIVE which the fleet-status derivation surfaces
   * as "Active Rented"; CONFIRMED/PENDING bookings with a future start
   * show as "Reserved"). Allowing an admin to write those enum values
   * directly used to create "ghost rentals" — a vehicle card that said
   * "Active Rented" with null customer / return data because no matching
   * booking existed. The fleet-status derivation now demotes such ghost
   * rows to Available at read time (see
   * `VehiclesService.deriveFleetStatusContext`), but we also reject the
   * write boundary here so the DB truth stays consistent.
   */
  private static readonly ADMIN_WRITABLE_VEHICLE_STATES: ReadonlySet<VehicleStatus> =
    new Set<VehicleStatus>([
      'AVAILABLE' as VehicleStatus,
      'IN_SERVICE' as VehicleStatus,
      'OUT_OF_SERVICE' as VehicleStatus,
    ]);

  @Patch('organizations/:orgId/vehicles/:vehicleId/status')
  @UseGuards(OrgScopingGuard, PermissionsGuard)
  @RequirePermission('fleet', 'write')
  async updateVehicleStatus(
    @Param('orgId') orgId: string,
    @Param('vehicleId') vehicleId: string,
    @Req() req: VehicleStatusAuthRequest,
    @Body()
    body: {
      status?: VehicleStatus;
      cleaningStatus?: CleaningStatus;
      healthStatus?: HealthStatus;
    },
  ) {
    const started = performance.now();
    try {
      const data: Prisma.VehicleUpdateInput = {};
      if (body.status) {
        if (!VehiclesController.ADMIN_WRITABLE_VEHICLE_STATES.has(body.status)) {
          throw new BadRequestException(
            `Vehicle status '${body.status}' cannot be set via the admin status endpoint. RENTED / RESERVED are derived from booking and handover events; create/cancel the booking instead.`,
          );
        }
        data.status = body.status;
      }
      if (body.cleaningStatus) data.cleaningStatus = body.cleaningStatus;
      if (body.healthStatus) data.healthStatus = body.healthStatus;

      const vehicle = await this.vehiclesService.update(vehicleId, data, orgId);

      await this.vehiclesService.invalidateFleetMapCache(orgId);

      let cleaningTask: Awaited<
        ReturnType<VehicleCleaningTaskService['ensureCleaningTask']>
      > | null = null;

      if (body.cleaningStatus === 'NEEDS_CLEANING') {
        cleaningTask = await this.vehicleCleaningTasks.ensureCleaningTask(orgId, vehicleId);
      } else if (body.cleaningStatus === 'CLEAN') {
        cleaningTask = await this.vehicleCleaningTasks.completeOpenCleaningTasks(
          orgId,
          vehicleId,
          req.user?.id,
        );
      }

      if (body.cleaningStatus) {
        this.vehicleDetailObservability?.recordStatusMutation('cleaning_status', null);
      }
      if (body.status) {
        this.vehicleDetailObservability?.recordStatusMutation('operational_status', null);
      }
      if (body.healthStatus) {
        this.vehicleDetailObservability?.recordStatusMutation('health_status', null);
      }
      this.vehicleDetailObservability?.observeRequest('status_patch', started, null);
      return { vehicle, cleaningTask };
    } catch (err) {
      if (body.cleaningStatus) {
        this.vehicleDetailObservability?.recordStatusMutation('cleaning_status', err);
      }
      if (body.status) {
        this.vehicleDetailObservability?.recordStatusMutation('operational_status', err);
      }
      if (body.healthStatus) {
        this.vehicleDetailObservability?.recordStatusMutation('health_status', err);
      }
      this.vehicleDetailObservability?.observeRequest('status_patch', started, err);
      throw err;
    }
  }

  @Get('organizations/:orgId/fleet-connectivity')
  @UseGuards(OrgScopingGuard, PermissionsGuard)
  @RequirePermission('fleet-connectivity', 'read')
  async getFleetConnectivity(
    @Param('orgId') orgId: string,
    @Query() query: FleetConnectivityQueryDto,
  ) {
    return this.vehiclesService.getFleetConnectivity(orgId, query);
  }

  @Get('organizations/:orgId/fleet-connectivity/:vehicleId')
  @UseGuards(OrgScopingGuard, PermissionsGuard)
  @RequirePermission('fleet-connectivity', 'read')
  async getFleetConnectivityDetail(
    @Param('orgId') orgId: string,
    @Param('vehicleId') vehicleId: string,
  ) {
    return this.vehiclesService.getFleetConnectivityDetail(orgId, vehicleId);
  }

  @Get('organizations/:orgId/vehicles/:vehicleId/device-connection')
  @UseGuards(OrgScopingGuard)
  async getDeviceConnection(
    @Param('orgId') orgId: string,
    @Param('vehicleId') vehicleId: string,
  ) {
    const started = performance.now();
    try {
      const result = await this.vehiclesService.getDeviceConnection(orgId, vehicleId);
      this.vehicleDetailObservability?.observeRequest('device_connection', started, null);
      return result;
    } catch (err) {
      this.vehicleDetailObservability?.observeRequest('device_connection', started, err);
      throw err;
    }
  }

  @Get('organizations/:orgId/vehicles/:vehicleId/complaints')
  @UseGuards(OrgScopingGuard, PermissionsGuard)
  @RequirePermission('fleet', 'read')
  async listVehicleComplaints(
    @Param('orgId') orgId: string,
    @Param('vehicleId') vehicleId: string,
  ) {
    return this.vehiclesService.listVehicleComplaints(orgId, vehicleId);
  }

  @Post('organizations/:orgId/vehicles/:vehicleId/complaints')
  @UseGuards(OrgScopingGuard, PermissionsGuard)
  @RequirePermission('fleet', 'write')
  async createVehicleComplaint(
    @Param('orgId') orgId: string,
    @Param('vehicleId') vehicleId: string,
    @Body() body: { description: string; urgency?: string; region?: string | null },
    @Req() req: { user?: { id?: string } },
  ) {
    return this.vehiclesService.createVehicleComplaint(
      orgId,
      vehicleId,
      req.user?.id,
      body,
    );
  }

  @Delete('organizations/:orgId/vehicles/:vehicleId')
  @UseGuards(OrgScopingGuard, PermissionsGuard)
  @RequirePermission('fleet', 'manage')
  async deleteByOrg(
    @Param('orgId') _orgId: string,
    @Param('vehicleId') vehicleId: string,
  ) {
    this.logger.warn({
      msg: 'legacy_vehicle_delete_blocked',
      code: LEGACY_VEHICLE_DESTRUCTION_DISABLED_CODE,
      route: 'organizations/:orgId/vehicles/:vehicleId',
      vehicleId,
    });
    throw legacyVehicleDeleteDisabledException();
  }

  @Post('admin/vehicles/:vehicleId/deregister')
  @Roles('MASTER_ADMIN')
  @UseGuards(MasterAdminMfaGuard)
  @RequireMasterAdminMfa(STEP_UP_ACTION.MASTER_INTEGRATIONS)
  async deregisterVehicle(@Param('vehicleId') vehicleId: string) {
    this.logger.warn({
      msg: 'legacy_vehicle_deregistration_blocked',
      code: LEGACY_VEHICLE_DESTRUCTION_DISABLED_CODE,
      vehicleId,
    });
    throw legacyVehicleDestructionDisabledException();
  }

  // ── vehicles/:vehicleId (direct access) ───────────────────────────
  //
  // These routes are protected by VehicleOwnershipGuard, which validates that
  // the target vehicle belongs to the requesting user's organization (derived
  // from the JWT). MASTER_ADMIN bypasses the ownership check. The service
  // calls also pass user.organizationId for defense-in-depth where applicable.

  @Get('vehicles/:vehicleId')
  @UseGuards(VehicleOwnershipGuard)
  async findOne(@Param('vehicleId') vehicleId: string) {
    return this.vehiclesService.findById(vehicleId);
  }

  @Patch('vehicles/:vehicleId')
  @UseGuards(VehicleOwnershipGuard)
  async update(
    @Param('vehicleId') vehicleId: string,
    @Body() body: Prisma.VehicleUpdateInput,
    @Req() req: any,
  ) {
    // Service-side defense-in-depth: only allow update when the vehicle
    // belongs to the caller's organization (skipped for MASTER_ADMIN which
    // passes the guard without an organizationId check).
    const orgId: string | undefined =
      req?.user?.platformRole === 'MASTER_ADMIN'
        ? undefined
        : req?.user?.organizationId;
    return this.vehiclesService.update(vehicleId, body, orgId, {
      rawBody: body as Record<string, unknown>,
    });
  }

  @Delete('vehicles/:vehicleId')
  @UseGuards(VehicleOwnershipGuard)
  async delete(@Param('vehicleId') vehicleId: string, @Req() _req: any) {
    this.logger.warn({
      msg: 'legacy_vehicle_delete_blocked',
      code: LEGACY_VEHICLE_DESTRUCTION_DISABLED_CODE,
      route: 'vehicles/:vehicleId',
      vehicleId,
    });
    throw legacyVehicleDeleteDisabledException();
  }

  // ── Exterior Images (Damage Map) ─────────────────────────────────
  //
  // V4.7.50 — Five canonical exterior photo slots per vehicle (FRONT, LEFT,
  // RIGHT, REAR, ROOF). Master-Admin operators upload these either during
  // vehicle registration (`VehicleRegistrationModal`) or post-hoc on the
  // Master-Admin vehicle detail drawer (`PlatformVehiclesView`). The Rental
  // `DamagesView` reads them via the org-scoped/vehicle-scoped GET below to
  // render a vehicle-specific damage map carousel.

  @Get('admin/vehicles/:vehicleId/exterior-images')
  @Roles('MASTER_ADMIN')
  async listExteriorImagesAdmin(@Param('vehicleId') vehicleId: string) {
    return this.exteriorImagesService.listByVehicle(vehicleId);
  }

  @Get('admin/vehicles/:vehicleId/exterior-images/effective')
  @Roles('MASTER_ADMIN')
  async listEffectiveExteriorImagesAdmin(@Param('vehicleId') vehicleId: string) {
    return this.exteriorImagesService.listEffectiveByVehicle(vehicleId);
  }

  @Get('admin/vehicle-exterior-model-images')
  @Roles('MASTER_ADMIN')
  async listExteriorModelImages(
    @Query('make') make?: string,
    @Query('model') model?: string,
  ) {
    if (make && model) {
      return this.exteriorImagesService.listByModel(make, model);
    }
    return this.exteriorImagesService.listAvailableModels();
  }

  @Put('admin/vehicle-exterior-model-images/:view')
  @Roles('MASTER_ADMIN')
  async upsertExteriorModelImage(
    @Param('view') view: string,
    @Body()
    body: {
      make: string;
      model: string;
      imageData: string;
      caption?: string | null;
      sourceVehicleId?: string | null;
    },
    @Req() req: any,
  ) {
    return this.exteriorImagesService.upsertModelImage(
      body?.make,
      body?.model,
      parseExteriorView(view),
      body?.imageData,
      body?.caption ?? null,
      body?.sourceVehicleId ?? null,
      req?.user?.id ?? null,
    );
  }

  @Put('admin/vehicles/:vehicleId/exterior-images/:view')
  @Roles('MASTER_ADMIN')
  async upsertExteriorImageAdmin(
    @Param('vehicleId') vehicleId: string,
    @Param('view') view: string,
    @Body() body: { imageData: string; caption?: string | null },
    @Req() req: any,
  ) {
    return this.exteriorImagesService.upsert(
      vehicleId,
      parseExteriorView(view),
      body?.imageData,
      body?.caption ?? null,
      req?.user?.id ?? null,
    );
  }

  @Post('admin/vehicles/:vehicleId/exterior-images/:view/save-as-model')
  @Roles('MASTER_ADMIN')
  async saveExteriorImageAsModelTemplate(
    @Param('vehicleId') vehicleId: string,
    @Param('view') view: string,
    @Req() req: any,
  ) {
    return this.exteriorImagesService.saveVehicleImageAsModelTemplate(
      vehicleId,
      parseExteriorView(view),
      req?.user?.id ?? null,
    );
  }

  @Post('admin/vehicles/:vehicleId/exterior-images/:view/apply-model')
  @Roles('MASTER_ADMIN')
  async applyExteriorModelImageToVehicle(
    @Param('vehicleId') vehicleId: string,
    @Param('view') view: string,
    @Body() body: { modelKey: string },
    @Req() req: any,
  ) {
    return this.exteriorImagesService.applyModelTemplateToVehicle(
      vehicleId,
      parseExteriorView(view),
      body?.modelKey,
      req?.user?.id ?? null,
    );
  }

  @Delete('admin/vehicles/:vehicleId/exterior-images/:view')
  @Roles('MASTER_ADMIN')
  async deleteExteriorImageAdmin(
    @Param('vehicleId') vehicleId: string,
    @Param('view') view: string,
  ) {
    await this.exteriorImagesService.delete(
      vehicleId,
      parseExteriorView(view),
    );
    return { success: true };
  }

  // Read-only access for any authenticated user with vehicle ownership
  // (Rental Damages page consumes this to render the damage map carousel).
  @Get('vehicles/:vehicleId/exterior-images/effective')
  @UseGuards(VehicleOwnershipGuard)
  async listEffectiveExteriorImages(@Param('vehicleId') vehicleId: string) {
    return this.exteriorImagesService.listEffectiveByVehicle(vehicleId);
  }

  @Get('vehicles/:vehicleId/exterior-images')
  @UseGuards(VehicleOwnershipGuard)
  async listExteriorImages(@Param('vehicleId') vehicleId: string) {
    return this.exteriorImagesService.listByVehicle(vehicleId);
  }
}
