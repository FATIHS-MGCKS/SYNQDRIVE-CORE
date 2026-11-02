export type MotionPhysicsEvidenceTierUi = 'ESTIMATED' | 'CONFIRMED' | 'VERIFIED' | '' | null;

export type MotionPhysicsPendingCreateSource = 'MISTRAL_AI' | null;

/** How vehicle AI specs were applied to the form (reference auto-create eligibility). */
export type AiSpecsApplyProvenance =
  | 'mistral_live'
  | 'mistral_knowledge_only'
  | 'local_fallback';

/** Canonical stored values for systemPowerDefinition (matches backend semantics). */
export const MOTION_SYSTEM_POWER_DEFINITION_OPTIONS = [
  'OEM_RATED_MOTOR_KW',
  'OEM_RATED_SYSTEM_KW',
  'OEM_RATED_SYSTEM_KW_ESTIMATED',
] as const;

/** Must stay aligned with backend MOTION_SYSTEM_POWER_DEFINITION_LEGACY_ALIASES. */
const MOTION_SYSTEM_POWER_DEFINITION_LEGACY_ALIASES: Readonly<
  Record<string, MotionSystemPowerDefinitionOption>
> = {
  OEM_RATED_ENGINE_KW: 'OEM_RATED_MOTOR_KW',
};

export type MotionSystemPowerDefinitionOption = (typeof MOTION_SYSTEM_POWER_DEFINITION_OPTIONS)[number];

export const MOTION_PHYSICS_SYNC_REASON_CODES = {
  REFERENCE_CREATE_FAILED: 'MOTION_PHYSICS_REFERENCE_CREATE_FAILED',
  REFERENCE_CONFIRM_FAILED: 'MOTION_PHYSICS_REFERENCE_CONFIRM_FAILED',
  REFERENCE_RELOAD_FAILED: 'MOTION_PHYSICS_REFERENCE_RELOAD_FAILED',
  ROUTINE_SAVE_REFERENCE_FIELDS_NOT_PERSISTED:
    'MOTION_PHYSICS_ROUTINE_SAVE_REFERENCE_FIELDS_NOT_PERSISTED',
} as const;

export type MotionPhysicsSyncReasonCode =
  (typeof MOTION_PHYSICS_SYNC_REASON_CODES)[keyof typeof MOTION_PHYSICS_SYNC_REASON_CODES];

export function hasMotionPhysicsReferenceFieldValues(input: {
  systemMotorPowerKw: string;
  accel0To100S: string;
  variantAssumption: string;
  systemPowerDefinition: string;
}): boolean {
  return Boolean(
    input.systemMotorPowerKw.trim() ||
      input.accel0To100S.trim() ||
      input.variantAssumption.trim() ||
      input.systemPowerDefinition.trim(),
  );
}

export function hasMotionPhysicsFormValues(input: {
  curbWeight: string;
  systemMotorPowerKw: string;
  accel0To100S: string;
  variantAssumption?: string;
  systemPowerDefinition?: string;
}): boolean {
  const curb = input.curbWeight.trim();
  const power = input.systemMotorPowerKw.trim();
  const accel = input.accel0To100S.trim();
  const variant = input.variantAssumption?.trim() ?? '';
  const definition = input.systemPowerDefinition?.trim() ?? '';
  return Boolean(curb || power || accel || variant || definition);
}

export function isMotionPhysicsReferenceReadOnly(
  tier: MotionPhysicsEvidenceTierUi,
): boolean {
  return tier === 'VERIFIED';
}

export function canConfirmManualMotionValues(tier: MotionPhysicsEvidenceTierUi): boolean {
  return tier !== 'VERIFIED';
}

/**
 * After AI apply: only successful live Mistral may queue MISTRAL_AI auto-reference.
 * Local fallback, mixed pre-existing + AI, or post-apply manual edits → no auto provenance.
 */
export function resolveMotionPhysicsPendingAfterAiApply(input: {
  provenance: AiSpecsApplyProvenance;
  appliedMotionFromAi: boolean;
  motionFieldsHadValuesBeforeApply: boolean;
  manualEditedAfterApply: boolean;
}): MotionPhysicsPendingCreateSource {
  if (!input.appliedMotionFromAi) return null;
  if (input.provenance !== 'mistral_live' && input.provenance !== 'mistral_knowledge_only') {
    return null;
  }
  if (input.motionFieldsHadValuesBeforeApply) return null;
  if (input.manualEditedAfterApply) return null;
  return 'MISTRAL_AI';
}

/** Routine vehicle edit must not create or upgrade motion references without eligible live Mistral apply. */
export function shouldSyncMotionPhysicsReferenceOnSave(input: {
  evidenceTier: MotionPhysicsEvidenceTierUi;
  referenceId: string | null;
  pendingCreateSource: MotionPhysicsPendingCreateSource;
  hasMotionValues: boolean;
  manualMotionEdited: boolean;
}): boolean {
  if (input.evidenceTier === 'VERIFIED' || input.evidenceTier === 'CONFIRMED') {
    return false;
  }
  if (input.referenceId && input.evidenceTier === 'ESTIMATED') {
    return false;
  }
  if (input.pendingCreateSource !== 'MISTRAL_AI') {
    return false;
  }
  if (input.manualMotionEdited) {
    return false;
  }
  return input.hasMotionValues;
}

export function motionPhysicsReferenceSourceForSave(
  pendingCreateSource: MotionPhysicsPendingCreateSource,
): 'MISTRAL_AI' | null {
  return pendingCreateSource === 'MISTRAL_AI' ? 'MISTRAL_AI' : null;
}

/** Plausible passenger/light commercial curb mass (kg); rejects silent garbage without blocking edge fleet cases. */
export const MOTION_PHYSICS_CURB_MASS_KG_MIN = 300;
export const MOTION_PHYSICS_CURB_MASS_KG_MAX = 6000;

export type MotionPhysicsCurbMassParseResult =
  | { status: 'empty' }
  | { status: 'valid'; kg: number }
  | { status: 'invalid' };

/**
 * Curb mass (kg) — German grouping: 1.760 → 1760, 1.760,5 → 1760.5; plain integers accepted.
 * Rejects ambiguous US-style 1,760 and combined thousand+decimal forms that are not DE-shaped.
 */
export function parseMotionPhysicsCurbMassField(raw: string): MotionPhysicsCurbMassParseResult {
  const trimmed = raw.trim();
  if (!trimmed) return { status: 'empty' };

  const compact = trimmed.replace(/\s/g, '');
  if (!/^[\d.,]+$/.test(compact)) return { status: 'invalid' };

  const commaCount = (compact.match(/,/g) ?? []).length;
  const dotCount = (compact.match(/\./g) ?? []).length;
  if (commaCount > 1) return { status: 'invalid' };

  let normalized: string;

  if (commaCount === 1 && dotCount >= 1) {
    const commaIdx = compact.lastIndexOf(',');
    const intPart = compact.slice(0, commaIdx).replace(/\./g, '');
    const fracPart = compact.slice(commaIdx + 1);
    if (!/^\d+$/.test(intPart) || !/^\d+$/.test(fracPart) || fracPart.length > 2) {
      return { status: 'invalid' };
    }
    normalized = `${intPart}.${fracPart}`;
  } else if (commaCount === 1 && dotCount === 0) {
    const [intPart, fracPart] = compact.split(',');
    if (!intPart || !fracPart || !/^\d+$/.test(intPart) || !/^\d+$/.test(fracPart)) {
      return { status: 'invalid' };
    }
    if (fracPart.length === 3 && intPart.length <= 3) return { status: 'invalid' };
    if (fracPart.length > 2) return { status: 'invalid' };
    normalized = `${intPart}.${fracPart}`;
  } else if (dotCount > 1 && commaCount === 0) {
    const parts = compact.split('.');
    const last = parts[parts.length - 1];
    if (parts.length < 2 || last.length !== 3) return { status: 'invalid' };
    for (let i = 1; i < parts.length - 1; i++) {
      if (parts[i].length !== 3) return { status: 'invalid' };
    }
    normalized = parts.join('');
  } else if (dotCount === 1 && commaCount === 0) {
    const [intPart, fracPart] = compact.split('.');
    if (!intPart || !fracPart || !/^\d+$/.test(intPart) || !/^\d+$/.test(fracPart)) {
      return { status: 'invalid' };
    }
    if (fracPart.length === 3) {
      normalized = intPart + fracPart;
    } else if (fracPart.length <= 2) {
      normalized = `${intPart}.${fracPart}`;
    } else {
      return { status: 'invalid' };
    }
  } else if (dotCount === 0 && commaCount === 0) {
    if (!/^\d+$/.test(compact)) return { status: 'invalid' };
    normalized = compact;
  } else {
    return { status: 'invalid' };
  }

  const kg = Number(normalized);
  if (!Number.isFinite(kg) || kg <= 0) return { status: 'invalid' };
  if (kg < MOTION_PHYSICS_CURB_MASS_KG_MIN || kg > MOTION_PHYSICS_CURB_MASS_KG_MAX) {
    return { status: 'invalid' };
  }
  return { status: 'valid', kg };
}

export function resolveMotionPhysicsCurbMassKg(raw: string): number | null {
  const parsed = parseMotionPhysicsCurbMassField(raw);
  if (parsed.status === 'empty') return null;
  if (parsed.status === 'invalid') {
    throw new Error('CURB_MASS_INVALID');
  }
  return parsed.kg;
}

/** Motor power / 0–100 s — decimal comma or dot; no thousand separators. */
export function parseMotionPhysicsDecimalField(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.includes('.') && trimmed.includes(',')) return null;
  const dotCount = (trimmed.match(/\./g) ?? []).length;
  if (dotCount > 1) return null;
  const compact = trimmed.replace(/\s/g, '').replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(compact)) return null;
  const n = Number(compact);
  return Number.isFinite(n) ? n : null;
}

/** @deprecated Use parseMotionPhysicsDecimalField for power/accel; parseMotionPhysicsCurbMassField for curb mass. */
export function parseMotionPhysicsNumericField(raw: string): number | null {
  return parseMotionPhysicsDecimalField(raw);
}

export type MotionPhysicsFormSnapshot = {
  curbWeight: string;
  systemMotorPowerKw: string;
  accel0To100S: string;
  variantAssumption: string;
  systemPowerDefinition: string;
};

export function snapshotMotionPhysicsFormFields(input: MotionPhysicsFormSnapshot): MotionPhysicsFormSnapshot {
  return { ...input };
}

export function normalizeMotionPhysicsFormSnapshot(
  input: MotionPhysicsFormSnapshot,
): MotionPhysicsFormSnapshot {
  return {
    curbWeight: input.curbWeight.trim(),
    systemMotorPowerKw: input.systemMotorPowerKw.trim(),
    accel0To100S: input.accel0To100S.trim(),
    variantAssumption: input.variantAssumption.trim(),
    systemPowerDefinition: input.systemPowerDefinition.trim(),
  };
}

export function motionPhysicsFormMatchesSnapshot(
  current: MotionPhysicsFormSnapshot,
  baseline: MotionPhysicsFormSnapshot | null,
): boolean {
  if (!baseline) return true;
  const a = normalizeMotionPhysicsFormSnapshot(current);
  const b = normalizeMotionPhysicsFormSnapshot(baseline);
  return (
    a.curbWeight === b.curbWeight &&
    a.systemMotorPowerKw === b.systemMotorPowerKw &&
    a.accel0To100S === b.accel0To100S &&
    a.variantAssumption === b.variantAssumption &&
    a.systemPowerDefinition === b.systemPowerDefinition
  );
}

export function motionPhysicsReferenceFieldsMatchSnapshot(
  current: MotionPhysicsFormSnapshot,
  baseline: MotionPhysicsFormSnapshot,
): boolean {
  const a = normalizeMotionPhysicsFormSnapshot(current);
  const b = normalizeMotionPhysicsFormSnapshot(baseline);
  return (
    a.systemMotorPowerKw === b.systemMotorPowerKw &&
    a.accel0To100S === b.accel0To100S &&
    a.variantAssumption === b.variantAssumption &&
    a.systemPowerDefinition === b.systemPowerDefinition
  );
}

/** ESTIMATED reference loaded in form — form diverges from stored reference row. */
export function hasUnconfirmedManualMotionPhysicsEdits(input: {
  evidenceTier: MotionPhysicsEvidenceTierUi;
  referenceId: string | null;
  loadedReferenceBaseline: MotionPhysicsFormSnapshot | null;
  currentForm: MotionPhysicsFormSnapshot;
}): boolean {
  if (!input.referenceId || input.evidenceTier !== 'ESTIMATED') return false;
  if (!input.loadedReferenceBaseline) return false;
  return !motionPhysicsFormMatchesSnapshot(input.currentForm, input.loadedReferenceBaseline);
}

/**
 * Routine “Save Changes” does not create CONFIRMED references or update CONFIRMED/ESTIMATED rows.
 * Returns true when power/accel/variant/definition would be silently discarded on save.
 */
export function hasMotionPhysicsValuesAtRiskOnRoutineVehicleSave(input: {
  evidenceTier: MotionPhysicsEvidenceTierUi;
  referenceId: string | null;
  loadedReferenceBaseline: MotionPhysicsFormSnapshot | null;
  noReferenceSessionBaseline: MotionPhysicsFormSnapshot | null;
  currentForm: MotionPhysicsFormSnapshot;
  pendingCreateSource: MotionPhysicsPendingCreateSource;
  manualMotionEdited: boolean;
}): boolean {
  if (isMotionPhysicsReferenceReadOnly(input.evidenceTier)) return false;

  if (hasUnconfirmedManualMotionPhysicsEdits(input)) return true;

  if (input.referenceId && input.loadedReferenceBaseline) {
    return !motionPhysicsFormMatchesSnapshot(
      input.currentForm,
      input.loadedReferenceBaseline,
    );
  }

  if (!hasMotionPhysicsReferenceFieldValues(input.currentForm)) return false;

  if (
    shouldSyncMotionPhysicsReferenceOnSave({
      evidenceTier: input.evidenceTier,
      referenceId: input.referenceId,
      pendingCreateSource: input.pendingCreateSource,
      hasMotionValues: hasMotionPhysicsFormValues(input.currentForm),
      manualMotionEdited: input.manualMotionEdited,
    })
  ) {
    return false;
  }

  if (
    input.noReferenceSessionBaseline &&
    motionPhysicsReferenceFieldsMatchSnapshot(
      input.currentForm,
      input.noReferenceSessionBaseline,
    )
  ) {
    return false;
  }

  return true;
}

export function resolveMotionPhysicsHttpReasonCode(error: unknown): string | null {
  if (!error || typeof error !== 'object') return null;
  const record = error as Record<string, unknown>;
  if (typeof record.reasonCode === 'string' && record.reasonCode.trim()) {
    return record.reasonCode.trim();
  }
  const message = record.message;
  if (typeof message === 'string' && message.includes('MOTION_PHYSICS_')) {
    return message;
  }
  const response = record.response;
  if (response && typeof response === 'object') {
    const data = (response as { data?: { reasonCodes?: string[]; code?: string } }).data;
    if (data?.reasonCodes?.[0]) return String(data.reasonCodes[0]);
    if (data?.code) return String(data.code);
  }
  return null;
}

export function formatMotionPhysicsUserErrorMessage(
  baseMessage: string,
  error: unknown,
  fallbackReason: MotionPhysicsSyncReasonCode,
): string {
  const code = resolveMotionPhysicsHttpReasonCode(error) ?? fallbackReason;
  return `${baseMessage} (${code})`;
}

/** Confirm AI estimate only when form still matches the loaded ESTIMATED reference (no silent stale confirm). */
export function canConfirmEstimatedAiMotionReference(input: {
  evidenceTier: MotionPhysicsEvidenceTierUi;
  referenceId: string | null;
  loadedReferenceBaseline: MotionPhysicsFormSnapshot | null;
  currentForm: MotionPhysicsFormSnapshot;
}): boolean {
  if (!input.referenceId || input.evidenceTier !== 'ESTIMATED') return false;
  if (!input.loadedReferenceBaseline) return false;
  return motionPhysicsFormMatchesSnapshot(input.currentForm, input.loadedReferenceBaseline);
}

/** When POST create succeeds but GET active fails, hydrate UI from create body + form. */
export function mergeMotionPhysicsReferenceFromCreateResponse(
  created: {
    id: string;
    evidenceTier: 'ESTIMATED' | 'CONFIRMED' | 'VERIFIED';
    curbMassKg?: number | null;
    systemMotorPowerKw?: number | null;
    accel0To100S?: number | null;
    variantAssumption?: string | null;
    systemPowerDefinition?: string | null;
  },
  form: {
    curbWeight: string;
    systemMotorPowerKw: string;
    accel0To100S: string;
    variantAssumption: string;
    systemPowerDefinition: string;
  },
) {
  return {
    id: created.id,
    evidenceTier: created.evidenceTier,
    curbMassKg: created.curbMassKg ?? resolveMotionPhysicsCurbMassKg(form.curbWeight),
    systemMotorPowerKw:
      created.systemMotorPowerKw ?? parseMotionPhysicsDecimalField(form.systemMotorPowerKw),
    accel0To100S: created.accel0To100S ?? parseMotionPhysicsDecimalField(form.accel0To100S),
    variantAssumption:
      created.variantAssumption ?? (form.variantAssumption.trim() ? form.variantAssumption.trim() : null),
    systemPowerDefinition:
      created.systemPowerDefinition ??
      (form.systemPowerDefinition.trim() ? form.systemPowerDefinition.trim() : null),
  };
}

export function snapshotMotionPhysicsFromActiveReference(ref: {
  curbMassKg?: number | null;
  systemMotorPowerKw?: number | null;
  accel0To100S?: number | null;
  variantAssumption?: string | null;
  systemPowerDefinition?: string | null;
}): MotionPhysicsFormSnapshot {
  return snapshotMotionPhysicsFormFields({
    curbWeight: ref.curbMassKg != null ? String(ref.curbMassKg) : '',
    systemMotorPowerKw: ref.systemMotorPowerKw != null ? String(ref.systemMotorPowerKw) : '',
    accel0To100S: ref.accel0To100S != null ? String(ref.accel0To100S) : '',
    variantAssumption: ref.variantAssumption ?? '',
    systemPowerDefinition: parseMotionSystemPowerDefinitionOption(ref.systemPowerDefinition),
  });
}

export function buildMotionPhysicsReferenceCreateBody(input: {
  curbWeight: string;
  systemMotorPowerKw: string;
  accel0To100S: string;
  variantAssumption: string;
  systemPowerDefinition: string;
  source: 'MISTRAL_AI' | 'MANUAL_ENTRY';
  manualOperatorConfirm?: boolean;
}) {
  return {
    curbMassKg: resolveMotionPhysicsCurbMassKg(input.curbWeight),
    systemMotorPowerKw: parseMotionPhysicsDecimalField(input.systemMotorPowerKw),
    accel0To100S: parseMotionPhysicsDecimalField(input.accel0To100S),
    variantAssumption: input.variantAssumption.trim() || null,
    systemPowerDefinition:
      parseMotionSystemPowerDefinitionOption(input.systemPowerDefinition) || null,
    source: input.source,
    manualOperatorConfirm: input.manualOperatorConfirm === true ? true : undefined,
  };
}

/** Returns a reason code when create payload has no persistable motion fields. */
export function validateMotionPhysicsReferenceCreatePayload(input: {
  curbMassKg?: number | null;
  systemMotorPowerKw?: number | null;
  accel0To100S?: number | null;
  systemPowerDefinition?: string | null;
}): MotionPhysicsSyncReasonCode | null {
  const definition = input.systemPowerDefinition?.trim();
  if (
    input.curbMassKg == null &&
    input.systemMotorPowerKw == null &&
    input.accel0To100S == null &&
    !definition
  ) {
    return MOTION_PHYSICS_SYNC_REASON_CODES.REFERENCE_CREATE_FAILED;
  }
  return null;
}

export function parseMotionSystemPowerDefinitionOption(
  raw: unknown,
): MotionSystemPowerDefinitionOption | '' {
  const token = String(raw ?? '').trim().toUpperCase();
  const legacy = MOTION_SYSTEM_POWER_DEFINITION_LEGACY_ALIASES[token];
  if (legacy) return legacy;
  if ((MOTION_SYSTEM_POWER_DEFINITION_OPTIONS as readonly string[]).includes(token)) {
    return token as MotionSystemPowerDefinitionOption;
  }
  return '';
}

export function hydrateSystemPowerDefinitionFormState(
  fromReference: string | null | undefined,
  fromRegisteredVehicle: string | null | undefined,
): MotionSystemPowerDefinitionOption | '' {
  const fromRef = parseMotionSystemPowerDefinitionOption(fromReference);
  if (fromRef) return fromRef;
  return parseMotionSystemPowerDefinitionOption(fromRegisteredVehicle);
}
