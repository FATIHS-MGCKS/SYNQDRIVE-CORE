import { describe, expect, it } from 'vitest';
import {
  buildOemFieldSavePatch,
  buildOemSpecificationsView,
  OEM_SPECIFICATION_FIELD_KEYS,
} from './connected-vehicle-oem-specifications.util';

describe('connected-vehicle-oem-specifications.util', () => {
  it('builds view with ten OEM fields from admin DTO', () => {
    const view = buildOemSpecificationsView({
      oemEngineCode: 'N47',
      registrationIdentityProvenance: {
        version: 1,
        updatedAt: '2026-01-01T00:00:00.000Z',
        fields: {
          oemEngineCode: {
            value: 'N47',
            provenance: 'USER_CONFIRMED',
            confirmationStatus: 'USER_CONFIRMED',
            confirmedAt: '2026-01-01T00:00:00.000Z',
            documentExtractionId: null,
          },
        },
      },
    });
    expect(OEM_SPECIFICATION_FIELD_KEYS).toHaveLength(10);
    expect(view.fields.oemEngineCode).toBe('N47');
    expect(view.fieldProvenance.oemEngineCode).toBe('USER_CONFIRMED');
    expect(view.confirmationStatus.oemEngineCode).toBe('USER_CONFIRMED');
  });

  it('buildOemFieldSavePatch requires explicit confirmation flag', () => {
    expect(() => buildOemFieldSavePatch('oemEngineDesc', '2.0 TDI', false)).toThrow(
      'OEM_FIELD_CONFIRMATION_REQUIRED',
    );
    expect(buildOemFieldSavePatch('oemEngineDesc', '2.0 TDI', true)).toEqual({
      oemEngineDesc: '2.0 TDI',
      technicalSpecificationSave: { confirmedFieldKeys: ['oemEngineDesc'] },
    });
  });

  it('normalizes empty draft to null in save patch', () => {
    expect(buildOemFieldSavePatch('oemEngineCode', null, true)).toEqual({
      oemEngineCode: null,
      technicalSpecificationSave: { confirmedFieldKeys: ['oemEngineCode'] },
    });
  });
});
