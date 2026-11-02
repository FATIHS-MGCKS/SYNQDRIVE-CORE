import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DocumentExtractionStatus,
  MotionPhysicsEvidenceTier,
  MotionPhysicsReferenceSource,
  Prisma,
  type VehicleMotionPhysicsReference,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import {
  buildMotionPhysicsIdentityFingerprint,
  identityFingerprintsMatch,
} from './motion-physics-identity.util';
import {
  MOTION_PHYSICS_POLICY_REASONS,
  MOTION_PHYSICS_REFERENCE_CHANGE_ACTIONS,
  normalizeMotionSystemPowerDefinition,
  resolveMotionPhysicsEvidenceTierForCreate,
} from './motion-physics-reference.domain';
import type { MotionPhysicsReferenceAuditEntry } from './motion-physics-reference.repository';
import type { MotionPhysicsIdentityFingerprint } from './motion-physics-reference.domain';
import {
  evaluateMotionPhysicsConfirm,
  evaluateMotionPhysicsReferenceCreate,
  evaluateMotionPhysicsVerify,
} from './motion-physics-reference.policy';
import { VehicleMotionPhysicsReferenceRepository } from './motion-physics-reference.repository';
import type {
  ConfirmVehicleMotionPhysicsReferenceDto,
  CreateVehicleMotionPhysicsReferenceDto,
  VerifyVehicleMotionPhysicsReferenceDto,
} from './dto/vehicle-motion-physics-reference.dto';

@Injectable()
export class VehicleMotionPhysicsReferenceService {
  constructor(
    private readonly repository: VehicleMotionPhysicsReferenceRepository,
    private readonly prisma: PrismaService,
  ) {}

  async getActive(organizationId: string, vehicleId: string) {
    await this.assertVehicleInOrg(organizationId, vehicleId);
    const row = await this.repository.findActiveForVehicle({ organizationId, vehicleId });
    return row ? this.toDto(row) : null;
  }

  listHistory(organizationId: string, vehicleId: string) {
    return this.repository
      .listHistory({ organizationId, vehicleId })
      .then((rows) => rows.map((r) => this.toDto(r)));
  }

  listAudit(organizationId: string, vehicleId: string) {
    return this.repository.listAuditTrail({ organizationId, vehicleId });
  }

  async create(
    organizationId: string,
    vehicleId: string,
    body: CreateVehicleMotionPhysicsReferenceDto,
    actorUserId?: string,
  ) {
    const vehicle = await this.assertVehicleInOrg(organizationId, vehicleId);
    const fingerprint = buildMotionPhysicsIdentityFingerprint({
      vin: vehicle.vin,
      make: vehicle.make,
      model: vehicle.model,
      modelYear: vehicle.year,
    });

    const active = await this.repository.findActiveForVehicle({ organizationId, vehicleId });
    const proposedTier = resolveMotionPhysicsEvidenceTierForCreate(body.source, {
      manualOperatorConfirm: body.manualOperatorConfirm === true,
    });
    if (proposedTier == null) {
      throw new BadRequestException({
        message: 'Motion physics reference validation failed',
        reasonCodes: [MOTION_PHYSICS_POLICY_REASONS.IMPLICIT_OPERATOR_CONFIRM_FORBIDDEN],
      });
    }

    const policy = evaluateMotionPhysicsReferenceCreate({
      payload: body,
      proposedTier,
      proposedSource: body.source,
      activeTier: active?.evidenceTier,
      manualOperatorConfirm: body.manualOperatorConfirm === true,
    });
    if (!policy.ok) {
      throw new BadRequestException({
        message: 'Motion physics reference validation failed',
        reasonCodes: policy.reasonCodes,
      });
    }

    const auditEntries: MotionPhysicsReferenceAuditEntry[] = [];
    if (active) {
      auditEntries.push({
        referenceId: active.id,
        action: MOTION_PHYSICS_REFERENCE_CHANGE_ACTIONS.SUPERSEDED,
        previousTier: active.evidenceTier,
        newTier: active.evidenceTier,
        actorUserId: actorUserId ?? null,
      });
    }
    auditEntries.push({
      action: MOTION_PHYSICS_REFERENCE_CHANGE_ACTIONS.CREATED,
      previousTier: null,
      newTier: proposedTier,
      actorUserId: actorUserId ?? null,
    });

    try {
      const normalizedDefinition = normalizeMotionSystemPowerDefinition(body.systemPowerDefinition);
      const created = await this.repository.createWithSupersedeAndAudit(
        {
          organizationId,
          vehicleId,
          identityFingerprintJson: fingerprint,
          curbMassKg: body.curbMassKg ?? null,
          systemMotorPowerKw: body.systemMotorPowerKw ?? null,
          systemPowerDefinition:
            normalizedDefinition ??
            (body.systemMotorPowerKw != null &&
            (body.systemPowerDefinition == null || String(body.systemPowerDefinition).trim() === '')
              ? 'OEM_RATED_SYSTEM_KW_ESTIMATED'
              : null),
          accel0To100S: body.accel0To100S ?? null,
          variantAssumption: body.variantAssumption ?? null,
          evidenceTier: proposedTier,
          source: body.source,
          notes: body.notes ?? null,
          supersedeActiveId: active?.id ?? null,
        },
        auditEntries,
      );
      return this.toDto(created);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException({
          message: 'Active motion physics reference already exists',
          reasonCodes: ['ACTIVE_REFERENCE_CONFLICT'],
        });
      }
      throw error;
    }
  }

  async confirm(
    organizationId: string,
    vehicleId: string,
    referenceId: string,
    body: ConfirmVehicleMotionPhysicsReferenceDto,
    actorUserId: string,
  ) {
    await this.assertVehicleInOrg(organizationId, vehicleId);
    const row = await this.findMutableReference(organizationId, vehicleId, referenceId);

    const policy = evaluateMotionPhysicsConfirm({
      currentTier: row.evidenceTier,
      isActive: row.isActive,
      isSuperseded: row.supersededById != null,
    });
    if (!policy.ok) {
      throw new BadRequestException({ reasonCodes: policy.reasonCodes });
    }

    const updated = await this.repository.updateTier({
      id: row.id,
      evidenceTier: MotionPhysicsEvidenceTier.CONFIRMED,
      source: MotionPhysicsReferenceSource.OPERATOR_CONFIRMED,
      notes: body.notes ?? row.notes,
    });

    await this.repository.appendChange({
      organizationId,
      vehicleId,
      referenceId: row.id,
      action: MOTION_PHYSICS_REFERENCE_CHANGE_ACTIONS.CONFIRMED,
      previousTier: row.evidenceTier,
      newTier: MotionPhysicsEvidenceTier.CONFIRMED,
      actorUserId,
    });

    return this.toDto(updated);
  }

  async verify(
    organizationId: string,
    vehicleId: string,
    referenceId: string,
    body: VerifyVehicleMotionPhysicsReferenceDto,
    actorUserId: string,
  ) {
    const vehicle = await this.assertVehicleInOrg(organizationId, vehicleId);
    const row = await this.findMutableReference(organizationId, vehicleId, referenceId);

    const storedFp = row.identityFingerprintJson as unknown as MotionPhysicsIdentityFingerprint;
    const currentFp = buildMotionPhysicsIdentityFingerprint({
      vin: vehicle.vin,
      make: vehicle.make,
      model: vehicle.model,
      modelYear: vehicle.year,
      variantLabel: storedFp.variantLabel,
    });

    const doc = await this.prisma.vehicleDocumentExtraction.findFirst({
      where: {
        id: body.documentExtractionId,
        organizationId,
        vehicleId,
      },
    });
    const documentValidated =
      doc != null &&
      (doc.status === DocumentExtractionStatus.APPLIED ||
        doc.status === DocumentExtractionStatus.CONFIRMED);

    const identityMatch = identityFingerprintsMatch(storedFp, currentFp);
    const vinIdentityMatch =
      !vehicle.vin?.trim() ||
      (Boolean(storedFp.vinHash) &&
        Boolean(currentFp.vinHash) &&
        storedFp.vinHash === currentFp.vinHash);

    const policy = evaluateMotionPhysicsVerify({
      isActive: row.isActive,
      isSuperseded: row.supersededById != null,
      currentTier: row.evidenceTier,
      documentExtractionId: body.documentExtractionId,
      documentValidated,
      identityMatch,
      vinIdentityMatch,
    });
    if (!policy.ok) {
      throw new BadRequestException({ reasonCodes: policy.reasonCodes });
    }

    const updated = await this.repository.updateTier({
      id: row.id,
      evidenceTier: MotionPhysicsEvidenceTier.VERIFIED,
      source: MotionPhysicsReferenceSource.REGISTRATION_CERTIFICATE,
      verifiedByUserId: actorUserId,
      verifiedAt: new Date(),
      documentExtractionId: body.documentExtractionId,
      notes: body.notes ?? row.notes,
      systemPowerDefinition: row.systemPowerDefinition ?? 'REGISTRATION_DOCUMENT_VALIDATED',
    });

    await this.repository.appendChange({
      organizationId,
      vehicleId,
      referenceId: row.id,
      action: MOTION_PHYSICS_REFERENCE_CHANGE_ACTIONS.VERIFIED,
      previousTier: row.evidenceTier,
      newTier: MotionPhysicsEvidenceTier.VERIFIED,
      actorUserId,
    });

    return this.toDto(updated);
  }

  private async assertVehicleInOrg(organizationId: string, vehicleId: string) {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId, organizationId },
      select: { id: true, vin: true, make: true, model: true, year: true },
    });
    if (!vehicle) {
      throw new NotFoundException('Vehicle not found');
    }
    return vehicle;
  }

  private async findMutableReference(
    organizationId: string,
    vehicleId: string,
    referenceId: string,
  ) {
    const row = await this.prisma.vehicleMotionPhysicsReference.findFirst({
      where: { id: referenceId, organizationId, vehicleId },
    });
    if (!row) {
      throw new NotFoundException('Motion physics reference not found');
    }
    if (!row.isActive || row.supersededById != null) {
      throw new BadRequestException({
        reasonCodes: [MOTION_PHYSICS_POLICY_REASONS.SUPERSEDED],
      });
    }
    return row;
  }

  private toDto(row: VehicleMotionPhysicsReference) {
    return {
      id: row.id,
      organizationId: row.organizationId,
      vehicleId: row.vehicleId,
      identityFingerprint: row.identityFingerprintJson,
      curbMassKg: row.curbMassKg,
      systemMotorPowerKw: row.systemMotorPowerKw,
      systemPowerDefinition:
        normalizeMotionSystemPowerDefinition(row.systemPowerDefinition) ?? row.systemPowerDefinition,
      accel0To100S: row.accel0To100S,
      variantAssumption: row.variantAssumption,
      evidenceTier: row.evidenceTier,
      source: row.source,
      documentExtractionId: row.documentExtractionId,
      verifiedByUserId: row.verifiedByUserId,
      verifiedAt: row.verifiedAt?.toISOString() ?? null,
      effectiveFrom: row.effectiveFrom.toISOString(),
      effectiveTo: row.effectiveTo?.toISOString() ?? null,
      isActive: row.isActive,
      supersededById: row.supersededById,
      notes: row.notes,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
