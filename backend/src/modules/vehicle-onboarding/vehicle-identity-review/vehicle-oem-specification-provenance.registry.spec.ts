import { TransmissionType } from '@prisma/client';
import {
  REGISTRATION_IDENTITY_OEM_SPECIFICATION_FIELD_KEYS,
  REGISTRATION_IDENTITY_OEM_FIELD_REGISTRY_VERSION,
  REGISTRATION_IDENTITY_PROVENANCE_DOCUMENT_VERSION_LEGACY,
  REGISTRATION_IDENTITY_PROVENANCE_DOCUMENT_VERSION_OEM,
  oemSpecificationFieldMaxLength,
} from './vehicle-oem-specification-provenance.registry';
import {
  mergeProvenanceOnSave,
  parseRegistrationIdentityProvenance,
} from './vehicle-identity-provenance.util';
import {
  upgradeRegistrationIdentityProvenanceDocumentToV2,
} from './vehicle-oem-specification-provenance.versioning';
import {
  assertNoImplicitOemConfirmation,
  normalizeOemProviderSuggestionEntry,
} from './vehicle-oem-specification-provenance.guard';
import type { RegistrationIdentityCanonicalIdentity } from './vehicle-identity-canonical.types';

describe('vehicle-oem-specification-provenance (PRA schema)', () => {
  it('registers ten OEM provenance keys aligned with Vehicle columns', () => {
    expect(REGISTRATION_IDENTITY_OEM_SPECIFICATION_FIELD_KEYS).toHaveLength(10);
    expect(REGISTRATION_IDENTITY_OEM_SPECIFICATION_FIELD_KEYS).toContain('oemEngineCode');
    expect(REGISTRATION_IDENTITY_OEM_SPECIFICATION_FIELD_KEYS).toContain('oemDerivativeDesc');
  });

  it('uses reasonable max lengths for codes vs descriptions', () => {
    expect(oemSpecificationFieldMaxLength('oemEngineCode')).toBeLessThanOrEqual(64);
    expect(oemSpecificationFieldMaxLength('oemEngineDesc')).toBeGreaterThan(64);
  });

  it('parses legacy version-1 provenance documents without JSONB migration', () => {
    const legacy = {
      version: 1,
      updatedAt: '2026-10-28T12:00:00.000Z',
      fields: {
        displacementCc: {
          value: 2967,
          provenance: 'USER_CONFIRMED',
          confirmationStatus: 'USER_CONFIRMED',
          confirmedAt: '2026-10-28T12:00:00.000Z',
          documentExtractionId: null,
        },
      },
    };
    const parsed = parseRegistrationIdentityProvenance(legacy);
    expect(parsed).not.toBeNull();
    expect(parsed?.version).toBe(REGISTRATION_IDENTITY_PROVENANCE_DOCUMENT_VERSION_LEGACY);
  });

  it('parses version-2 documents with oemFieldRegistryVersion', () => {
    const v2 = {
      version: 2,
      updatedAt: '2026-11-02T10:00:00.000Z',
      oemFieldRegistryVersion: 1,
      fields: {
        oemEngineCode: {
          value: 'DDAA',
          provenance: 'SUGGESTED',
          confirmationStatus: 'SUGGESTED',
          confirmedAt: null,
          documentExtractionId: null,
        },
      },
    };
    const parsed = parseRegistrationIdentityProvenance(v2);
    expect(parsed?.version).toBe(REGISTRATION_IDENTITY_PROVENANCE_DOCUMENT_VERSION_OEM);
  });

  it('rejects unknown provenance document versions', () => {
    expect(
      parseRegistrationIdentityProvenance({
        version: 99,
        updatedAt: 'x',
        fields: {},
      }),
    ).toBeNull();
  });

  it('rejects version-2 with unsupported oemFieldRegistryVersion', () => {
    expect(
      parseRegistrationIdentityProvenance({
        version: 2,
        updatedAt: 'x',
        oemFieldRegistryVersion: 99,
        fields: {},
      }),
    ).toBeNull();
  });

  it('preserves protected USER_CONFIRMED P3 fields when OEM suggestions merge', () => {
    const existing = parseRegistrationIdentityProvenance({
      version: 1,
      updatedAt: '2026-10-28T12:00:00.000Z',
      fields: {
        displacementCc: {
          value: 2967,
          provenance: 'USER_CONFIRMED',
          confirmationStatus: 'USER_CONFIRMED',
          confirmedAt: '2026-10-28T12:00:00.000Z',
          documentExtractionId: null,
        },
        oemEngineCode: {
          value: 'CONFIRMED_CODE',
          provenance: 'USER_CONFIRMED',
          confirmationStatus: 'USER_CONFIRMED',
          confirmedAt: '2026-10-29T12:00:00.000Z',
          documentExtractionId: null,
        },
      },
    })!;

    const canonical: RegistrationIdentityCanonicalIdentity = {
      version: 1,
      documentExtractionId: null,
      fields: [],
    };

    const merged = mergeProvenanceOnSave({
      existing,
      canonical,
      acceptedSuggestions: {
        oemEngineCode: {
          value: 'PROVIDER_OTHER',
          provenance: 'UNCONFIRMED',
          confirmationStatus: 'SUGGESTED',
          confirmedAt: null,
          documentExtractionId: null,
        },
        displacementCc: {
          value: 1998,
          provenance: 'AI_ESTIMATED',
          confirmationStatus: 'SUGGESTED',
          confirmedAt: null,
          documentExtractionId: null,
        },
      },
    });

    expect(merged.fields.displacementCc?.value).toBe(2967);
    expect(merged.fields.oemEngineCode?.value).toBe('CONFIRMED_CODE');
    expect(merged.version).toBe(REGISTRATION_IDENTITY_PROVENANCE_DOCUMENT_VERSION_LEGACY);
  });

  it('does not implicitly confirm OEM provider suggestions', () => {
    expect(() =>
      assertNoImplicitOemConfirmation({
        value: 'N47',
        provenance: 'UNCONFIRMED',
        confirmationStatus: 'USER_CONFIRMED',
        confirmedAt: '2026-11-02T10:00:00.000Z',
        documentExtractionId: null,
      }),
    ).toThrow(/must not carry USER_CONFIRMED/);

    const normalized = normalizeOemProviderSuggestionEntry({
      value: 'N47',
      provenance: 'UNCONFIRMED',
      confirmationStatus: 'USER_CONFIRMED',
      confirmedAt: '2026-11-02T10:00:00.000Z',
      documentExtractionId: null,
    });
    expect(normalized.confirmationStatus).toBe('SUGGESTED');
    expect(normalized.confirmedAt).toBeNull();
  });

  it('stores accepted OEM suggestions as SUGGESTED only', () => {
    const merged = mergeProvenanceOnSave({
      existing: null,
      canonical: { version: 1, documentExtractionId: null, fields: [] },
      acceptedSuggestions: {
        oemTransmissionDesc: {
          value: '7-speed automatic',
          provenance: 'UNCONFIRMED',
          confirmationStatus: 'UNCONFIRMED',
          confirmedAt: null,
          documentExtractionId: null,
        },
      },
    });
    expect(merged.fields.oemTransmissionDesc?.confirmationStatus).toBe('SUGGESTED');
  });

  it('upgrades v1 document shape to v2 in memory without losing fields', () => {
    const v1 = {
      version: 1 as const,
      updatedAt: '2026-10-01T00:00:00.000Z',
      fields: {},
    };
    const v2 = upgradeRegistrationIdentityProvenanceDocumentToV2(v1);
    expect(v2.oemFieldRegistryVersion).toBe(REGISTRATION_IDENTITY_OEM_FIELD_REGISTRY_VERSION);
    expect(v2.version).toBe(REGISTRATION_IDENTITY_PROVENANCE_DOCUMENT_VERSION_OEM);
  });

  it('does not alter operational TransmissionType enum surface', () => {
    expect(TransmissionType.AUTOMATIC).toBe('AUTOMATIC');
    expect(TransmissionType.MANUAL).toBe('MANUAL');
    expect(Object.keys(TransmissionType).length).toBeGreaterThan(0);
  });
});

describe('vehicle-oem-specification-provenance registry version constant', () => {
  it('matches documented OEM field registry version', () => {
    expect(REGISTRATION_IDENTITY_OEM_FIELD_REGISTRY_VERSION).toBe(1);
  });
});
