import type {
  VehicleIdentityFieldConfirmationInput,
  VehicleIdentityReviewSnapshot,
} from './vehicle-identity-review.types';

export type VehicleIdentityConfirmValidationResult = {
  ok: boolean;
  errors: Array<{ code: string; fieldCode?: string; message: string }>;
  /** P3 handoff payload only — not persisted in P2. */
  confirmedFieldCodes: string[];
};

function normalizeVinCompare(value: string | number | null | undefined): string | null {
  if (value == null) return null;
  const s = String(value).trim().toUpperCase().replace(/\s+/g, '');
  return s.length > 0 ? s : null;
}

export function validateVehicleIdentityFieldConfirmations(input: {
  snapshot: VehicleIdentityReviewSnapshot;
  confirmations: VehicleIdentityFieldConfirmationInput[];
  vinMismatchAcknowledged: boolean;
  acceptP2AsSystemPower: boolean;
}): VehicleIdentityConfirmValidationResult {
  const errors: VehicleIdentityConfirmValidationResult['errors'] = [];
  const confirmedFieldCodes: string[] = [];

  if (input.snapshot.vinMismatchBlocked && !input.vinMismatchAcknowledged) {
    errors.push({
      code: 'VIN_MISMATCH_UNACKNOWLEDGED',
      fieldCode: 'eVin',
      message: 'FIN mismatch must be explicitly acknowledged before any field confirmation.',
    });
  }

  const byCode = new Map(input.confirmations.map((c) => [c.fieldCode, c]));

  for (const conf of input.confirmations) {
    if (
      conf.correctedValue !== undefined &&
      conf.correctedValue !== null &&
      !conf.confirmed
    ) {
      errors.push({
        code: 'CORRECTED_WITHOUT_CONFIRMATION',
        fieldCode: conf.fieldCode,
        message: 'correctedValue requires confirmed: true for the same field.',
      });
    }
  }

  for (const field of input.snapshot.fields) {
    const conf = byCode.get(field.fieldCode);
    if (!conf?.confirmed) continue;

    if (input.snapshot.vinMismatchBlocked) {
      if (field.fieldCode === 'eVin') {
        const resolved =
          conf.correctedValue !== undefined && conf.correctedValue !== null
            ? conf.correctedValue
            : field.documentValue ?? field.value;
        const baseline = normalizeVinCompare(field.baselineValue);
        const resolvedNorm = normalizeVinCompare(resolved);
        if (resolvedNorm && baseline && resolvedNorm !== baseline) {
          errors.push({
            code: 'VIN_MISMATCH_DOCUMENT_VIN_NOT_CANONICAL',
            fieldCode: 'eVin',
            message:
              'Document FIN cannot replace canonical vehicle FIN; use an authorized identity correction workflow.',
          });
          continue;
        }
      } else if (
        field.documentValue != null &&
        field.extractionStatus === 'EXTRACTED' &&
        (conf.correctedValue === undefined || conf.correctedValue === null)
      ) {
        errors.push({
          code: 'VIN_MISMATCH_DOCUMENT_FIELD_BLOCKED',
          fieldCode: field.fieldCode,
          message:
            'Fields extracted from a FIN-mismatched document cannot be confirmed for this vehicle.',
        });
        continue;
      }
    }

    const hasManual = field.manualValue != null;
    const hasCorrection =
      conf.correctedValue !== undefined && conf.correctedValue !== null;
    const documentExtracted = field.extractionStatus === 'EXTRACTED';
    if (
      field.documentFieldCode != null &&
      field.documentValue != null &&
      !documentExtracted &&
      !hasManual &&
      !hasCorrection
    ) {
      errors.push({
        code: 'CONFIRM_REQUIRES_EXTRACTED_OR_MANUAL',
        fieldCode: field.fieldCode,
        message:
          'Unconfirmed OCR values cannot be confirmed without manual correction or an extracted document field.',
      });
      continue;
    }

    if (field.fieldCode === 'p2NominalPowerKw' && input.acceptP2AsSystemPower) {
      errors.push({
        code: 'P2_SYSTEM_POWER_NOT_ALLOWED',
        fieldCode: 'p2NominalPowerKw',
        message:
          'P.2 nominal power cannot be confirmed as hybrid/system power without variant review.',
      });
      continue;
    }

    if (field.conflict && conf.correctedValue == null) {
      errors.push({
        code: 'CONFLICT_REQUIRES_CORRECTION',
        fieldCode: field.fieldCode,
        message: `Field ${field.fieldCode} has conflicting sources; provide correctedValue when confirming.`,
      });
      continue;
    }

    confirmedFieldCodes.push(field.fieldCode);
  }

  return {
    ok: errors.length === 0,
    errors,
    confirmedFieldCodes,
  };
}
