import { BadRequestException, ForbiddenException } from '@nestjs/common';
import {
  REGISTRATION_IDENTITY_PROVENANCE_DOCUMENT_VERSION_LEGACY,
  REGISTRATION_IDENTITY_PROVENANCE_DOCUMENT_VERSION_OEM,
} from '@modules/vehicle-onboarding/vehicle-identity-review/vehicle-oem-specification-provenance.registry';
import {
  assertMasterAdminForOemSpecificationSave,
  buildVehicleOemSpecificationPrismaPatch,
  extractOemSpecificationPatchInput,
  mapVehicleOemSpecificationToRegisteredVehicleFields,
  oemSpecSaveRequiresOptimisticConcurrency,
  stripOemSpecificationKeysFromUpdateBody,
} from './vehicle-oem-specification-patch.util';

const emptyOemVehicle = {
  oemEngineCode: null as string | null,
  oemEngineDesc: null as string | null,
  oemTransmissionCode: null as string | null,
  oemTransmissionDesc: null as string | null,
  exteriorColorDesc: null as string | null,
  oemExteriorColorCode: null as string | null,
  interiorTrimDesc: null as string | null,
  oemInteriorTrimCode: null as string | null,
  oemModelRangeDesc: null as string | null,
  oemDerivativeDesc: null as string | null,
  registrationIdentityProvenance: null,
};

const legacyV1WithProtectedP3 = {
  version: 1 as const,
  updatedAt: '2026-10-28T12:00:00.000Z',
  fields: {
    displacementCc: {
      value: 2967,
      provenance: 'USER_CONFIRMED' as const,
      confirmationStatus: 'USER_CONFIRMED' as const,
      confirmedAt: '2026-10-28T12:00:00.000Z',
      documentExtractionId: null,
    },
    oemEngineCode: {
      value: 'LOCKED_CODE',
      provenance: 'USER_CONFIRMED' as const,
      confirmationStatus: 'USER_CONFIRMED' as const,
      confirmedAt: '2026-10-29T12:00:00.000Z',
      documentExtractionId: null,
    },
  },
};

describe('vehicle-oem-specification-patch.util', () => {
  it('maps registered vehicle OEM fields from vehicle row', () => {
    expect(
      mapVehicleOemSpecificationToRegisteredVehicleFields({
        ...emptyOemVehicle,
        oemEngineCode: 'N47',
      }).oemEngineCode,
    ).toBe('N47');
  });

  it('persists OEM field with explicit confirmation and USER_CONFIRMED provenance', () => {
    const patch = buildVehicleOemSpecificationPrismaPatch(
      emptyOemVehicle,
      {
        oemEngineCode: 'DDAA',
        technicalSpecificationSave: { confirmedFieldKeys: ['oemEngineCode'] },
      },
      null,
    );
    expect(patch.oemEngineCode).toBe('DDAA');
    const doc = patch.registrationIdentityProvenance as {
      version: number;
      fields: { oemEngineCode?: { provenance: string; confirmationStatus: string } };
    };
    expect(doc.version).toBe(REGISTRATION_IDENTITY_PROVENANCE_DOCUMENT_VERSION_OEM);
    expect(doc.fields.oemEngineCode?.provenance).toBe('USER_CONFIRMED');
    expect(doc.fields.oemEngineCode?.confirmationStatus).toBe('USER_CONFIRMED');
  });

  it('requires confirmation before OEM save', () => {
    expect(() =>
      buildVehicleOemSpecificationPrismaPatch(
        emptyOemVehicle,
        { oemEngineDesc: '2.0 TDI' },
        null,
      ),
    ).toThrow(BadRequestException);
  });

  it('blocks overwriting protected USER_CONFIRMED OEM without confirmation', () => {
    expect(() =>
      buildVehicleOemSpecificationPrismaPatch(
        { ...emptyOemVehicle, oemEngineCode: 'LOCKED_CODE' },
        { oemEngineCode: 'OTHER' },
        legacyV1WithProtectedP3,
      ),
    ).toThrow(BadRequestException);
  });

  it('allows authorized correction with confirmedFieldKeys', () => {
    const patch = buildVehicleOemSpecificationPrismaPatch(
      { ...emptyOemVehicle, oemEngineCode: 'LOCKED_CODE' },
      {
        oemEngineCode: 'NEW_CODE',
        technicalSpecificationSave: { confirmedFieldKeys: ['oemEngineCode'] },
      },
      legacyV1WithProtectedP3,
    );
    expect(patch.oemEngineCode).toBe('NEW_CODE');
  });

  it('upgrades v1 provenance to v2 on OEM save while preserving P3 entries', () => {
    const patch = buildVehicleOemSpecificationPrismaPatch(
      emptyOemVehicle,
      {
        oemTransmissionDesc: '7-speed automatic',
        technicalSpecificationSave: { confirmedFieldKeys: ['oemTransmissionDesc'] },
      },
      legacyV1WithProtectedP3,
    );
    const doc = patch.registrationIdentityProvenance as {
      version: number;
      fields: {
        displacementCc?: { value: number };
        oemTransmissionDesc?: { provenance: string };
      };
    };
    expect(doc.version).toBe(REGISTRATION_IDENTITY_PROVENANCE_DOCUMENT_VERSION_OEM);
    expect(doc.fields.displacementCc?.value).toBe(2967);
    expect(doc.fields.oemTransmissionDesc?.provenance).toBe('USER_CONFIRMED');
  });

  it('rejects values exceeding max length', () => {
    expect(() =>
      buildVehicleOemSpecificationPrismaPatch(
        emptyOemVehicle,
        {
          oemEngineCode: 'x'.repeat(200),
          technicalSpecificationSave: { confirmedFieldKeys: ['oemEngineCode'] },
        },
        null,
      ),
    ).toThrow(BadRequestException);
  });

  it('normalizes blank strings to null when confirmed', () => {
    const patch = buildVehicleOemSpecificationPrismaPatch(
      { ...emptyOemVehicle, oemEngineCode: 'OLD' },
      {
        oemEngineCode: '   ',
        technicalSpecificationSave: { confirmedFieldKeys: ['oemEngineCode'] },
      },
      null,
    );
    expect(patch.oemEngineCode).toBeNull();
  });

  it('extractOemSpecificationPatchInput detects OEM keys and confirmedFieldKeys', () => {
    expect(
      extractOemSpecificationPatchInput({
        oemEngineCode: 'A',
        technicalSpecificationSave: { confirmedFieldKeys: ['oemEngineCode'] },
      }),
    ).toMatchObject({ oemEngineCode: 'A' });
    expect(extractOemSpecificationPatchInput({ make: 'Audi' })).toBeNull();
  });

  it('strips OEM keys from generic update body', () => {
    expect(
      stripOemSpecificationKeysFromUpdateBody({
        make: 'Audi',
        oemEngineCode: 'X',
        technicalSpecificationSave: { confirmedFieldKeys: ['oemEngineCode'] },
      }),
    ).toEqual({
      make: 'Audi',
      technicalSpecificationSave: { confirmedFieldKeys: ['oemEngineCode'] },
    });
  });

  it('requires optimistic concurrency for any persisted OEM write', () => {
    expect(
      oemSpecSaveRequiresOptimisticConcurrency(
        null,
        emptyOemVehicle,
        {
          oemEngineCode: 'NEW',
          technicalSpecificationSave: { confirmedFieldKeys: ['oemEngineCode'] },
        },
      ),
    ).toBe(true);
  });

  it('does not require optimistic concurrency when OEM patch is empty', () => {
    const vehicle = { ...emptyOemVehicle, oemEngineCode: 'SAME' };
    const input = {
      oemEngineCode: 'SAME',
      technicalSpecificationSave: { confirmedFieldKeys: ['oemEngineCode'] },
    };
    const patch = buildVehicleOemSpecificationPrismaPatch(vehicle, input, null);
    expect(patch).toEqual({});
    expect(oemSpecSaveRequiresOptimisticConcurrency(null, vehicle, input, patch)).toBe(false);
  });

  it('denies OEM save without Master Admin platform role', () => {
    expect(() =>
      assertMasterAdminForOemSpecificationSave(
        {
          oemEngineCode: 'N47',
          technicalSpecificationSave: { confirmedFieldKeys: ['oemEngineCode'] },
        },
        undefined,
      ),
    ).toThrow(ForbiddenException);
  });

  it('allows OEM save for MASTER_ADMIN', () => {
    expect(() =>
      assertMasterAdminForOemSpecificationSave(
        {
          oemEngineCode: 'N47',
          technicalSpecificationSave: { confirmedFieldKeys: ['oemEngineCode'] },
        },
        'MASTER_ADMIN',
      ),
    ).not.toThrow();
  });

  it('does not require Master Admin for technical specification-only PATCH body', () => {
    expect(() =>
      assertMasterAdminForOemSpecificationSave(
        {
          tankCapacityLiters: 55,
          technicalSpecificationSave: { confirmedFieldKeys: ['tankCapacityLiters'] },
        },
        undefined,
      ),
    ).not.toThrow();
  });

  it('requires optimistic concurrency when changing protected OEM value', () => {
    expect(
      oemSpecSaveRequiresOptimisticConcurrency(
        legacyV1WithProtectedP3,
        { ...emptyOemVehicle, oemEngineCode: 'LOCKED_CODE' },
        {
          oemEngineCode: 'DIFFERENT',
          technicalSpecificationSave: { confirmedFieldKeys: ['oemEngineCode'] },
        },
      ),
    ).toBe(true);
  });

  it('legacy v1 document version constant unchanged for existing rows', () => {
    expect(REGISTRATION_IDENTITY_PROVENANCE_DOCUMENT_VERSION_LEGACY).toBe(1);
  });
});
