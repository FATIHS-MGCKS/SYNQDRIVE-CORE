import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FuelType } from '@prisma/client';
import { VehicleSpecAiService } from '@modules/ai/vehicle-specs/vehicle-spec-ai.service';
import { PrismaService } from '@shared/database/prisma.service';
import {
  buildExplicitlyConfirmedCanonicalKeySet,
  buildRegistrationIdentityCanonical,
  canonicalToVehicleSpecContext,
} from './vehicle-identity-canonical.util';
import { mergeAiSpecsIntoIdentityPreview } from './vehicle-identity-p3-bridge.util';
import {
  assertProvenanceMatchesVehicleScalars,
  buildVehicleScalarPatch,
  collectProtectedIdentityViolations,
  normalizeAcceptedSuggestions,
} from './vehicle-identity-p3-persistence.util';
import { mergeProvenanceOnSave, parseRegistrationIdentityProvenance } from './vehicle-identity-provenance.util';
import { validateVehicleIdentityFieldConfirmations } from './vehicle-identity-confirm.util';
import type {
  VehicleIdentityFieldConfirmationInput,
  VehicleIdentityManualDraftInput,
} from './vehicle-identity-review.types';
import { VehicleIdentityReviewService } from './vehicle-identity-review.service';

function mapFuelTypeLabel(raw: string | null): FuelType | null {
  if (!raw) return null;
  const s = raw.trim().toLowerCase();
  if (s.includes('diesel')) return FuelType.DIESEL;
  if (s.includes('elektr') || s === 'bev' || s.includes('electric')) return FuelType.ELECTRIC;
  if (s.includes('plug') || s.includes('phev')) return FuelType.PLUGIN_HYBRID;
  if (s.includes('hybrid') || s.includes('hyb')) return FuelType.HYBRID;
  if (s.includes('benzin') || s.includes('gasoline') || s.includes('petrol')) return FuelType.GASOLINE;
  return FuelType.OTHER;
}

@Injectable()
export class VehicleIdentityP3Service {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly reviewService: VehicleIdentityReviewService,
    private readonly vehicleSpecAi: VehicleSpecAiService,
  ) {}

  private get p3Enabled(): boolean {
    return this.config.get<{ enabled?: boolean }>('vehicleIdentityP3')?.enabled === true;
  }

  private get aiLiveEnabled(): boolean {
    return this.config.get<{ aiLiveEnabled?: boolean }>('vehicleIdentityP3')?.aiLiveEnabled === true;
  }

  private assertP3Enabled(): void {
    if (!this.p3Enabled) {
      throw new ForbiddenException({
        message: 'Vehicle identity P3 persistence is disabled in this environment',
        code: 'ZB1_VEHICLE_IDENTITY_P3_DISABLED',
      });
    }
  }

  async getProvenance(orgId: string, vehicleId: string) {
    this.assertP3Enabled();
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId, organizationId: orgId },
      select: { registrationIdentityProvenance: true },
    });
    if (!vehicle) throw new NotFoundException('Vehicle not found');
    return {
      provenance: parseRegistrationIdentityProvenance(vehicle.registrationIdentityProvenance),
    };
  }

  async previewAiV2(
    orgId: string,
    vehicleId: string,
    body: {
      documentExtractionId?: string;
      manual?: VehicleIdentityManualDraftInput | null;
      confirmations: VehicleIdentityFieldConfirmationInput[];
      vinMismatchAcknowledged?: boolean;
      acceptP2AsSystemPower?: boolean;
      /** Test-only injection — never used in production HTTP path. */
      injectedAiSpecs?: Record<string, string | number | boolean | null>;
    },
  ) {
    this.assertP3Enabled();
    const snapshot = await this.reviewService.getReviewSnapshot(orgId, vehicleId, {
      documentExtractionId: body.documentExtractionId,
      manual: body.manual ?? null,
      vinMismatchAcknowledged: body.vinMismatchAcknowledged,
    });
    const validation = validateVehicleIdentityFieldConfirmations({
      snapshot,
      confirmations: body.confirmations ?? [],
      vinMismatchAcknowledged: body.vinMismatchAcknowledged === true,
      acceptP2AsSystemPower: body.acceptP2AsSystemPower === true,
    });
    if (!validation.ok) {
      throw new BadRequestException({
        code: 'VEHICLE_IDENTITY_CONFIRM_VALIDATION_FAILED',
        errors: validation.errors,
      });
    }

    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId, organizationId: orgId },
      select: { year: true },
    });
    if (!vehicle) throw new NotFoundException('Vehicle not found');

    const canonical = buildRegistrationIdentityCanonical({
      snapshot,
      confirmations: body.confirmations,
      vehicleYear: vehicle.year,
    });

    let rawAiSpecs: Record<string, string | number | boolean | null> = {};
    let aiLiveInvoked = false;

    if (body.injectedAiSpecs) {
      rawAiSpecs = body.injectedAiSpecs;
      aiLiveInvoked = false;
    } else if (this.aiLiveEnabled && this.vehicleSpecAi.isConfigured()) {
      const latest = await this.prisma.vehicleLatestState.findUnique({
        where: { vehicleId },
        select: { dimoTokenId: true },
      });
      const tokenIds = latest?.dimoTokenId != null ? [latest.dimoTokenId] : undefined;
      const result = await this.vehicleSpecAi.getVehicleSpecs(
        tokenIds,
        canonicalToVehicleSpecContext(canonical),
      );
      rawAiSpecs = result.specs ?? {};
      aiLiveInvoked = true;
    }

    const preview = mergeAiSpecsIntoIdentityPreview({ canonical, rawAiSpecs });
    return { ...preview, aiLiveInvoked };
  }

  async saveIdentity(
    orgId: string,
    vehicleId: string,
    body: {
      documentExtractionId?: string;
      manual?: VehicleIdentityManualDraftInput | null;
      confirmations: VehicleIdentityFieldConfirmationInput[];
      vinMismatchAcknowledged?: boolean;
      acceptP2AsSystemPower?: boolean;
      acceptSuggestedFieldKeys?: string[];
      expectedVehicleUpdatedAt?: string;
      injectedAiSpecs?: Record<string, string | number | boolean | null>;
    },
  ) {
    this.assertP3Enabled();
    const preview = await this.previewAiV2(orgId, vehicleId, body);

    if (preview.conflicts.length > 0) {
      throw new BadRequestException({
        code: 'VEHICLE_IDENTITY_SAVE_BLOCKED_CONFLICTS',
        conflicts: preview.conflicts,
      });
    }

    const reviewSnapshot = await this.reviewService.getReviewSnapshot(orgId, vehicleId, {
      documentExtractionId: body.documentExtractionId,
      manual: body.manual ?? null,
      vinMismatchAcknowledged: body.vinMismatchAcknowledged,
    });
    if (reviewSnapshot.vinMismatchBlocked) {
      throw new BadRequestException({
        code: 'VIN_MISMATCH_IDENTITY_SAVE_BLOCKED',
        message:
          'Identity save is blocked while the registration certificate FIN mismatches the canonical vehicle FIN.',
      });
    }

    const explicitlyConfirmed = buildExplicitlyConfirmedCanonicalKeySet(body.confirmations);
    const acceptKeys = new Set(body.acceptSuggestedFieldKeys ?? []);
    const acceptedSuggestions = normalizeAcceptedSuggestions(preview.suggestedFields, acceptKeys);

    const snapshotVehicle = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId, organizationId: orgId },
      select: {
        id: true,
        make: true,
        model: true,
        year: true,
        vin: true,
        fuelType: true,
        updatedAt: true,
        registrationIdentityProvenance: true,
      },
    });
    if (!snapshotVehicle) throw new NotFoundException('Vehicle not found');

    if (body.expectedVehicleUpdatedAt) {
      const expected = new Date(body.expectedVehicleUpdatedAt);
      if (Number.isNaN(expected.getTime()) || snapshotVehicle.updatedAt.getTime() !== expected.getTime()) {
        throw new ConflictException({
          code: 'VEHICLE_IDENTITY_SAVE_STALE',
          message: 'Vehicle changed since load; reload review snapshot and confirm again.',
          currentUpdatedAt: snapshotVehicle.updatedAt.toISOString(),
        });
      }
    }

    const existing = parseRegistrationIdentityProvenance(snapshotVehicle.registrationIdentityProvenance);
    const violations = collectProtectedIdentityViolations({
      existing,
      vehicle: snapshotVehicle,
      canonical: preview.canonical,
      acceptedSuggestions,
      explicitlyConfirmedCanonicalKeys: explicitlyConfirmed,
    });
    if (violations.length > 0) {
      throw new BadRequestException({
        code: 'VEHICLE_IDENTITY_PROTECTED_FIELD_VIOLATION',
        violations,
      });
    }

    const provenanceDoc = mergeProvenanceOnSave({
      existing,
      canonical: preview.canonical,
      acceptedSuggestions,
      explicitlyConfirmedCanonicalKeys: explicitlyConfirmed,
    });

    const vehiclePatch = buildVehicleScalarPatch({
      canonical: preview.canonical,
      mapFuelType: mapFuelTypeLabel,
    });
    assertProvenanceMatchesVehicleScalars({
      provenanceDoc,
      vehiclePatch,
      mapFuelType: mapFuelTypeLabel,
    });

    const updated = await this.prisma.$transaction(async (tx) => {
      const current = await tx.vehicle.findFirst({
        where: { id: vehicleId, organizationId: orgId },
        select: { updatedAt: true },
      });
      if (!current) throw new NotFoundException('Vehicle not found');

      const writeResult = await tx.vehicle.updateMany({
        where: {
          id: vehicleId,
          organizationId: orgId,
          updatedAt: current.updatedAt,
        },
        data: {
          ...vehiclePatch,
          registrationIdentityProvenance: provenanceDoc,
        },
      });
      if (writeResult.count !== 1) {
        throw new ConflictException({
          code: 'VEHICLE_IDENTITY_SAVE_CONFLICT',
          message: 'Concurrent identity save detected; reload and confirm again.',
        });
      }
      const row = await tx.vehicle.findFirst({
        where: { id: vehicleId, organizationId: orgId },
        select: { updatedAt: true },
      });
      return row;
    });

    return {
      ok: true,
      persisted: true,
      provenance: provenanceDoc,
      vehicleUpdatedAt: updated?.updatedAt?.toISOString() ?? null,
    };
  }
}
