import { shouldApplyAiSpecToEmptyField } from './ai-spec-field-merge.util';

export type Zb1ReviewFieldRow = {
  fieldCode: string;
  value: string | number | null;
  conflict: boolean;
  baselineValue: string | number | null;
};

export type Zb1RegistrationFormCurrent = {
  engineDisplacementCc: string;
  fuelType: string;
  curbWeight: string;
};

export type Zb1RegistrationFormPatch = Partial<Zb1RegistrationFormCurrent>;

export type Zb1ApplyToFormResult = {
  patch: Zb1RegistrationFormPatch;
  skippedConflicts: string[];
  blockedReason: string | null;
};

function str(v: string | number | null | undefined): string {
  if (v == null) return '';
  return String(v).trim();
}

/**
 * Maps confirmed ZB-I review fields into registration modal specification fields.
 * Never maps VIN (E) onto the vehicle record from this helper.
 *
 * Fail-closed: when the uploaded document FIN does not match the vehicle FIN,
 * no specification fields are applied from the document (acknowledgment is for
 * review visibility only, not for importing document data onto this vehicle).
 */
export function buildZb1RegistrationFormPatch(
  rows: Zb1ReviewFieldRow[],
  confirmedFields: Record<string, boolean>,
  current: Zb1RegistrationFormCurrent,
  opts: { vinMismatchBlocked: boolean; vinMismatchAcknowledged: boolean },
): Zb1ApplyToFormResult {
  if (opts.vinMismatchBlocked) {
    return {
      patch: {},
      skippedConflicts: [],
      blockedReason: 'VIN_MISMATCH',
    };
  }

  const patch: Zb1RegistrationFormPatch = {};
  const skippedConflicts: string[] = [];

  for (const row of rows) {
    if (!confirmedFields[row.fieldCode]) continue;

    const incoming = str(row.value);
    if (!incoming) continue;

    let targetKey: keyof Zb1RegistrationFormPatch | null = null;
    switch (row.fieldCode) {
      case 'p1DisplacementCc':
        targetKey = 'engineDisplacementCc';
        break;
      case 'p3FuelOrEnergy':
        targetKey = 'fuelType';
        break;
      case 'gKerbMassKg':
        targetKey = 'curbWeight';
        break;
      default:
        break;
    }
    if (!targetKey) continue;

    const cur = current[targetKey] ?? '';
    if (!confirmedFields[row.fieldCode]) continue;

    if (cur !== '' && cur !== incoming) {
      patch[targetKey] = incoming;
      continue;
    }
    if (shouldApplyAiSpecToEmptyField(cur, incoming) || cur === incoming) {
      patch[targetKey] = incoming;
    }
  }

  return { patch, skippedConflicts, blockedReason: null };
}
