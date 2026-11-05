import type { FsdDiscoverySignalEvidenceState, Prisma } from '@prisma/client';

export type FsdDiscoveryEvidenceRowSnapshotV1 = {
  stageId: string | null;
  evidenceState: FsdDiscoverySignalEvidenceState;
  declaredByProvider: boolean;
  schemaShape: string | null;
  queryPlanned: boolean;
  queryAccepted: boolean | null;
  observedValue: boolean | null;
  provenanceJson: Prisma.JsonValue;
  qualityJson: Prisma.JsonValue;
};

export type FsdDiscoveryEvidenceWritePayloadV1 = {
  stageId?: string | null;
  evidenceState: FsdDiscoverySignalEvidenceState;
  declaredByProvider?: boolean;
  schemaShape?: string | null;
  queryPlanned?: boolean;
  queryAccepted?: boolean | null;
  observedValue?: boolean | null;
  provenanceJson?: Prisma.InputJsonValue;
  qualityJson?: Prisma.InputJsonValue;
};

function jsonStableEqual(a: Prisma.JsonValue, b: Prisma.JsonValue): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function buildEffectiveEvidenceStateV1(
  existing: FsdDiscoveryEvidenceRowSnapshotV1 | null,
  input: FsdDiscoveryEvidenceWritePayloadV1,
  createDefaults: FsdDiscoveryEvidenceRowSnapshotV1,
): FsdDiscoveryEvidenceRowSnapshotV1 {
  if (!existing) {
    return {
      stageId: input.stageId ?? createDefaults.stageId,
      evidenceState: input.evidenceState,
      declaredByProvider: input.declaredByProvider ?? createDefaults.declaredByProvider,
      schemaShape: input.schemaShape !== undefined ? input.schemaShape : createDefaults.schemaShape,
      queryPlanned: input.queryPlanned ?? createDefaults.queryPlanned,
      queryAccepted:
        'queryAccepted' in input ? input.queryAccepted ?? null : createDefaults.queryAccepted,
      observedValue:
        'observedValue' in input ? input.observedValue ?? null : createDefaults.observedValue,
      provenanceJson:
        input.provenanceJson !== undefined
          ? (input.provenanceJson as Prisma.JsonValue)
          : createDefaults.provenanceJson,
      qualityJson:
        input.qualityJson !== undefined
          ? (input.qualityJson as Prisma.JsonValue)
          : createDefaults.qualityJson,
    };
  }
  return {
    stageId: input.stageId !== undefined ? input.stageId : existing.stageId,
    evidenceState: input.evidenceState,
    declaredByProvider:
      'declaredByProvider' in input ? (input.declaredByProvider as boolean) : existing.declaredByProvider,
    schemaShape: input.schemaShape !== undefined ? input.schemaShape : existing.schemaShape,
    queryPlanned: 'queryPlanned' in input ? (input.queryPlanned as boolean) : existing.queryPlanned,
    queryAccepted: 'queryAccepted' in input ? input.queryAccepted ?? null : existing.queryAccepted,
    observedValue: 'observedValue' in input ? input.observedValue ?? null : existing.observedValue,
    provenanceJson:
      input.provenanceJson !== undefined
        ? (input.provenanceJson as Prisma.JsonValue)
        : existing.provenanceJson,
    qualityJson:
      input.qualityJson !== undefined ? (input.qualityJson as Prisma.JsonValue) : existing.qualityJson,
  };
}

export function isEvidenceStateUnchangedV1(
  existing: FsdDiscoveryEvidenceRowSnapshotV1,
  effective: FsdDiscoveryEvidenceRowSnapshotV1,
): boolean {
  return (
    existing.stageId === effective.stageId &&
    existing.evidenceState === effective.evidenceState &&
    existing.declaredByProvider === effective.declaredByProvider &&
    existing.schemaShape === effective.schemaShape &&
    existing.queryPlanned === effective.queryPlanned &&
    existing.queryAccepted === effective.queryAccepted &&
    existing.observedValue === effective.observedValue &&
    jsonStableEqual(existing.provenanceJson, effective.provenanceJson) &&
    jsonStableEqual(existing.qualityJson, effective.qualityJson)
  );
}
