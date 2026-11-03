import type { TranslationKey } from '../../i18n/translations/en';
import {
  mapProvenanceEntryToUi,
  resolveStorageProvenance,
  type SpecProvenanceUi,
} from './connected-vehicle-technical-specs.util';

export type OemSpecificationFieldKey =
  | 'oemEngineCode'
  | 'oemEngineDesc'
  | 'oemTransmissionCode'
  | 'oemTransmissionDesc'
  | 'exteriorColorDesc'
  | 'oemExteriorColorCode'
  | 'interiorTrimDesc'
  | 'oemInteriorTrimCode'
  | 'oemModelRangeDesc'
  | 'oemDerivativeDesc';

export type OemConfirmationStatusUi = 'USER_CONFIRMED' | 'SUGGESTED' | 'UNCONFIRMED' | null;

export type ConnectedVehicleOemSpecificationsView = {
  fields: Record<OemSpecificationFieldKey, string | null>;
  fieldProvenance: Partial<Record<OemSpecificationFieldKey, SpecProvenanceUi>>;
  confirmationStatus: Partial<Record<OemSpecificationFieldKey, OemConfirmationStatusUi>>;
};

export const OEM_SPECIFICATION_FIELD_KEYS: OemSpecificationFieldKey[] = [
  'oemEngineCode',
  'oemEngineDesc',
  'oemTransmissionCode',
  'oemTransmissionDesc',
  'exteriorColorDesc',
  'oemExteriorColorCode',
  'interiorTrimDesc',
  'oemInteriorTrimCode',
  'oemModelRangeDesc',
  'oemDerivativeDesc',
];

export const OEM_SPEC_FIELD_GROUPS: Array<{
  titleKey: TranslationKey;
  fields: OemSpecificationFieldKey[];
}> = [
  {
    titleKey: 'master.cv.oemSpecs.group.engine',
    fields: ['oemEngineCode', 'oemEngineDesc'],
  },
  {
    titleKey: 'master.cv.oemSpecs.group.transmission',
    fields: ['oemTransmissionCode', 'oemTransmissionDesc'],
  },
  {
    titleKey: 'master.cv.oemSpecs.group.exterior',
    fields: ['exteriorColorDesc', 'oemExteriorColorCode'],
  },
  {
    titleKey: 'master.cv.oemSpecs.group.interior',
    fields: ['interiorTrimDesc', 'oemInteriorTrimCode'],
  },
  {
    titleKey: 'master.cv.oemSpecs.group.modelRange',
    fields: ['oemModelRangeDesc', 'oemDerivativeDesc'],
  },
];

export function oemFieldLabelKey(key: OemSpecificationFieldKey): TranslationKey {
  return `master.cv.oemSpecs.field.${key}` as TranslationKey;
}

export function oemConfirmationStatusLabelKey(
  status: OemConfirmationStatusUi,
): TranslationKey | null {
  if (status === 'USER_CONFIRMED') return 'master.cv.oemSpecs.confirmation.userConfirmed';
  if (status === 'SUGGESTED') return 'master.cv.oemSpecs.confirmation.suggested';
  if (status === 'UNCONFIRMED') return 'master.cv.oemSpecs.confirmation.unconfirmed';
  return null;
}

function readConfirmationStatus(
  docRaw: unknown,
  key: OemSpecificationFieldKey,
): OemConfirmationStatusUi {
  if (!docRaw || typeof docRaw !== 'object') return null;
  const entry = (docRaw as { fields?: Record<string, { confirmationStatus?: string }> }).fields?.[
    key
  ];
  if (!entry) return null;
  const status = (entry.confirmationStatus ?? '').toUpperCase();
  if (status === 'USER_CONFIRMED' || status === 'PROTECTED') return 'USER_CONFIRMED';
  if (status === 'SUGGESTED') return 'SUGGESTED';
  if (status === 'UNCONFIRMED') return 'UNCONFIRMED';
  return null;
}

function readStringField(dto: Record<string, unknown>, key: OemSpecificationFieldKey): string | null {
  const raw = dto[key];
  if (raw == null || raw === '') return null;
  const trimmed = String(raw).trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function buildOemSpecificationsView(
  vehicleDto: Record<string, unknown>,
): ConnectedVehicleOemSpecificationsView {
  const doc = vehicleDto.registrationIdentityProvenance;
  const fields = {} as Record<OemSpecificationFieldKey, string | null>;
  const fieldProvenance: Partial<Record<OemSpecificationFieldKey, SpecProvenanceUi>> = {};
  const confirmationStatus: Partial<Record<OemSpecificationFieldKey, OemConfirmationStatusUi>> =
    {};

  for (const key of OEM_SPECIFICATION_FIELD_KEYS) {
    fields[key] = readStringField(vehicleDto, key);
    fieldProvenance[key] = resolveStorageProvenance(doc, [key]) ?? undefined;
    confirmationStatus[key] = readConfirmationStatus(doc, key) ?? undefined;
    if (!confirmationStatus[key] && fieldProvenance[key] === 'USER_CONFIRMED') {
      confirmationStatus[key] = 'USER_CONFIRMED';
    }
    if (
      fields[key] != null &&
      !confirmationStatus[key] &&
      fieldProvenance[key] !== 'USER_CONFIRMED'
    ) {
      const entry = (doc as { fields?: Record<string, unknown> } | null)?.fields?.[key];
      if (entry && typeof entry === 'object') {
        confirmationStatus[key] = mapProvenanceEntryToUi(
          entry as Parameters<typeof mapProvenanceEntryToUi>[0],
        )
          ? 'SUGGESTED'
          : 'UNCONFIRMED';
      }
    }
  }

  return { fields, fieldProvenance, confirmationStatus };
}

export function buildOemFieldSavePatch(
  key: OemSpecificationFieldKey,
  value: string | null,
  confirm: boolean,
): Record<string, unknown> {
  if (!confirm) {
    throw new Error('OEM_FIELD_CONFIRMATION_REQUIRED');
  }
  return {
    [key]: value,
    technicalSpecificationSave: { confirmedFieldKeys: [key] },
  };
}
