import { BadRequestException, ForbiddenException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { RegistrationIdentityProvenanceDocument } from '@modules/vehicle-onboarding/vehicle-identity-review/vehicle-identity-canonical.types';
import { getProtectedProvenanceEntry } from '@modules/vehicle-onboarding/vehicle-identity-review/vehicle-identity-field-mapping.util';
import { isProtectedProvenanceEntry } from '@modules/vehicle-onboarding/vehicle-identity-review/vehicle-identity-provenance.util';
import {
  REGISTRATION_IDENTITY_OEM_SPECIFICATION_FIELD_KEYS,
  type RegistrationIdentityOemSpecificationFieldKey,
  oemSpecificationFieldMaxLength,
} from '@modules/vehicle-onboarding/vehicle-identity-review/vehicle-oem-specification-provenance.registry';
import {
  buildEmptyRegistrationIdentityProvenanceDocumentV2,
  upgradeRegistrationIdentityProvenanceDocumentToV2,
} from '@modules/vehicle-onboarding/vehicle-identity-review/vehicle-oem-specification-provenance.versioning';
import type { VehicleTechnicalSpecificationSaveMeta } from './vehicle-technical-spec-patch.util';

function valuesEqualOptionalString(a: string | null, b: string | null): boolean {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  return a === b;
}

export type VehicleOemSpecificationFieldKey = RegistrationIdentityOemSpecificationFieldKey;

export type VehicleOemSpecificationPatchInput = {
  oemEngineCode?: string | null;
  oemEngineDesc?: string | null;
  oemTransmissionCode?: string | null;
  oemTransmissionDesc?: string | null;
  exteriorColorDesc?: string | null;
  oemExteriorColorCode?: string | null;
  interiorTrimDesc?: string | null;
  oemInteriorTrimCode?: string | null;
  oemModelRangeDesc?: string | null;
  oemDerivativeDesc?: string | null;
  technicalSpecificationSave?: VehicleTechnicalSpecificationSaveMeta;
};

export type VehicleOemSpecificationVehicleRow = {
  oemEngineCode: string | null;
  oemEngineDesc: string | null;
  oemTransmissionCode: string | null;
  oemTransmissionDesc: string | null;
  exteriorColorDesc: string | null;
  oemExteriorColorCode: string | null;
  interiorTrimDesc: string | null;
  oemInteriorTrimCode: string | null;
  oemModelRangeDesc: string | null;
  oemDerivativeDesc: string | null;
  registrationIdentityProvenance: unknown;
};

const COLUMN_BY_KEY: Record<VehicleOemSpecificationFieldKey, keyof VehicleOemSpecificationVehicleRow> =
  {
    oemEngineCode: 'oemEngineCode',
    oemEngineDesc: 'oemEngineDesc',
    oemTransmissionCode: 'oemTransmissionCode',
    oemTransmissionDesc: 'oemTransmissionDesc',
    exteriorColorDesc: 'exteriorColorDesc',
    oemExteriorColorCode: 'oemExteriorColorCode',
    interiorTrimDesc: 'interiorTrimDesc',
    oemInteriorTrimCode: 'oemInteriorTrimCode',
    oemModelRangeDesc: 'oemModelRangeDesc',
    oemDerivativeDesc: 'oemDerivativeDesc',
  };

function normalizeOptionalString(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  const trimmed = String(raw).trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseOemStringField(
  key: VehicleOemSpecificationFieldKey,
  raw: string | null | undefined,
): string | null {
  if (raw === undefined) return undefined as never;
  const next = normalizeOptionalString(raw);
  if (next != null && next.length > oemSpecificationFieldMaxLength(key)) {
    throw new BadRequestException({
      message: `${key} exceeds maximum length of ${oemSpecificationFieldMaxLength(key)}.`,
      code: 'VEHICLE_OEM_SPEC_INVALID_FIELD_LENGTH',
      field: key,
    });
  }
  return next;
}

function protectedStringValue(
  doc: RegistrationIdentityProvenanceDocument | null,
  key: VehicleOemSpecificationFieldKey,
): string | null {
  const entry = getProtectedProvenanceEntry(doc, key);
  if (!isProtectedProvenanceEntry(entry)) return null;
  const v = entry?.value;
  return typeof v === 'string' ? v : null;
}

function isProtectedOemField(
  doc: RegistrationIdentityProvenanceDocument | null,
  key: VehicleOemSpecificationFieldKey,
): boolean {
  return getProtectedProvenanceEntry(doc, key) != null && isProtectedProvenanceEntry(
    getProtectedProvenanceEntry(doc, key),
  );
}

export function buildVehicleOemSpecificationPrismaPatch(
  vehicle: VehicleOemSpecificationVehicleRow,
  input: VehicleOemSpecificationPatchInput,
  provenanceDoc: RegistrationIdentityProvenanceDocument | null,
): Prisma.VehicleUpdateInput {
  const confirmed = new Set(
    (input.technicalSpecificationSave?.confirmedFieldKeys ?? []).filter((k) =>
      (REGISTRATION_IDENTITY_OEM_SPECIFICATION_FIELD_KEYS as readonly string[]).includes(k),
    ),
  );

  const patch: Prisma.VehicleUpdateInput = {};
  const now = new Date().toISOString();
  let workingDoc: RegistrationIdentityProvenanceDocument | null = provenanceDoc;
  let wroteOemProvenance = false;

  const ensureProvenanceFields = (): RegistrationIdentityProvenanceDocument['fields'] => {
    if (!workingDoc) {
      workingDoc = buildEmptyRegistrationIdentityProvenanceDocumentV2(now);
    } else if (workingDoc.version === 1) {
      workingDoc = upgradeRegistrationIdentityProvenanceDocumentToV2(workingDoc);
    }
    return { ...(workingDoc.fields ?? {}) };
  };

  const considerField = (key: VehicleOemSpecificationFieldKey, next: string | null) => {
    const column = COLUMN_BY_KEY[key];
    const current = vehicle[column] as string | null;
    if (valuesEqualOptionalString(next, current)) return;

    if (isProtectedOemField(provenanceDoc, key)) {
      const locked = protectedStringValue(provenanceDoc, key);
      if (locked != null && !valuesEqualOptionalString(next, locked) && !confirmed.has(key)) {
        throw new BadRequestException({
          message: `Protected USER_CONFIRMED value for ${key} cannot be changed without explicit confirmation.`,
          code: 'VEHICLE_OEM_SPEC_USER_CONFIRMED_BLOCKED',
          field: key,
        });
      }
    }

    if (!confirmed.has(key)) {
      throw new BadRequestException({
        message: `Field ${key} requires explicit user confirmation before save.`,
        code: 'VEHICLE_OEM_SPEC_CONFIRMATION_REQUIRED',
        field: key,
      });
    }

    (patch as Record<string, string | null>)[column] = next;

    const fields = ensureProvenanceFields();
    fields[key] = {
      value: next,
      provenance: 'USER_CONFIRMED',
      confirmationStatus: 'USER_CONFIRMED',
      confirmedAt: now,
      documentExtractionId: null,
    };
    workingDoc = {
      ...(workingDoc as RegistrationIdentityProvenanceDocument),
      fields,
      updatedAt: now,
    };
    wroteOemProvenance = true;
  };

  const apply = (key: VehicleOemSpecificationFieldKey, raw: string | null | undefined) => {
    if (raw === undefined) return;
    const parsed = parseOemStringField(key, raw);
    considerField(key, parsed);
  };

  apply('oemEngineCode', input.oemEngineCode);
  apply('oemEngineDesc', input.oemEngineDesc);
  apply('oemTransmissionCode', input.oemTransmissionCode);
  apply('oemTransmissionDesc', input.oemTransmissionDesc);
  apply('exteriorColorDesc', input.exteriorColorDesc);
  apply('oemExteriorColorCode', input.oemExteriorColorCode);
  apply('interiorTrimDesc', input.interiorTrimDesc);
  apply('oemInteriorTrimCode', input.oemInteriorTrimCode);
  apply('oemModelRangeDesc', input.oemModelRangeDesc);
  apply('oemDerivativeDesc', input.oemDerivativeDesc);

  if (wroteOemProvenance && workingDoc) {
    workingDoc.updatedAt = now;
    patch.registrationIdentityProvenance = workingDoc as Prisma.InputJsonValue;
  }

  return patch;
}

export function oemSpecificationSaveRequested(body: Record<string, unknown>): boolean {
  return extractOemSpecificationPatchInput(body) != null;
}

/** OEM column/provenance writes are Master Admin only (org fleet.write is insufficient). */
export function assertMasterAdminForOemSpecificationSave(
  body: Record<string, unknown>,
  platformRole: string | null | undefined,
): void {
  if (!oemSpecificationSaveRequested(body)) return;
  if (platformRole !== 'MASTER_ADMIN') {
    throw new ForbiddenException({
      code: 'VEHICLE_OEM_SPEC_MASTER_ADMIN_REQUIRED',
      message: 'OEM specification changes require Master Admin privileges.',
    });
  }
}

export function extractOemSpecificationPatchInput(
  body: Record<string, unknown>,
): VehicleOemSpecificationPatchInput | null {
  const hasAnyField = REGISTRATION_IDENTITY_OEM_SPECIFICATION_FIELD_KEYS.some(
    (k) => body[k] !== undefined,
  );
  const saveMeta = body.technicalSpecificationSave as VehicleTechnicalSpecificationSaveMeta | undefined;
  const confirmedOem = (saveMeta?.confirmedFieldKeys ?? []).some((k) =>
    (REGISTRATION_IDENTITY_OEM_SPECIFICATION_FIELD_KEYS as readonly string[]).includes(k),
  );
  if (!hasAnyField && !confirmedOem) return null;

  return {
    oemEngineCode: body.oemEngineCode as string | null | undefined,
    oemEngineDesc: body.oemEngineDesc as string | null | undefined,
    oemTransmissionCode: body.oemTransmissionCode as string | null | undefined,
    oemTransmissionDesc: body.oemTransmissionDesc as string | null | undefined,
    exteriorColorDesc: body.exteriorColorDesc as string | null | undefined,
    oemExteriorColorCode: body.oemExteriorColorCode as string | null | undefined,
    interiorTrimDesc: body.interiorTrimDesc as string | null | undefined,
    oemInteriorTrimCode: body.oemInteriorTrimCode as string | null | undefined,
    oemModelRangeDesc: body.oemModelRangeDesc as string | null | undefined,
    oemDerivativeDesc: body.oemDerivativeDesc as string | null | undefined,
    technicalSpecificationSave: saveMeta,
  };
}

export function stripOemSpecificationKeysFromUpdateBody(
  body: Record<string, unknown>,
): Record<string, unknown> {
  const next = { ...body };
  for (const key of REGISTRATION_IDENTITY_OEM_SPECIFICATION_FIELD_KEYS) {
    delete next[key];
  }
  return next;
}

export function mapVehicleOemSpecificationToRegisteredVehicleFields(
  vehicle: VehicleOemSpecificationVehicleRow,
): Record<VehicleOemSpecificationFieldKey, string | null> {
  const out = {} as Record<VehicleOemSpecificationFieldKey, string | null>;
  for (const key of REGISTRATION_IDENTITY_OEM_SPECIFICATION_FIELD_KEYS) {
    out[key] = (vehicle[COLUMN_BY_KEY[key]] as string | null) ?? null;
  }
  return out;
}

/** True when this save persists any OEM column or provenance (always use optimistic concurrency). */
export function oemSpecSaveRequiresOptimisticConcurrency(
  provenanceDoc: RegistrationIdentityProvenanceDocument | null,
  vehicle: VehicleOemSpecificationVehicleRow,
  input: VehicleOemSpecificationPatchInput,
  prebuiltPatch?: Prisma.VehicleUpdateInput,
): boolean {
  const patch =
    prebuiltPatch ??
    buildVehicleOemSpecificationPrismaPatch(vehicle, input, provenanceDoc);
  return Object.keys(patch).length > 0;
}
