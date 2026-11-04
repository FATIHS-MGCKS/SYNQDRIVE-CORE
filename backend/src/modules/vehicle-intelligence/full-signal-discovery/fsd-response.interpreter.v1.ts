import type { FsdEvidenceDimensionsV1 } from './fsd-evidence.contract.v1';

export type FsdGraphqlErrorPathSegment = string | number;

export type FsdGraphqlErrorV1 = {
  message?: string;
  path?: readonly FsdGraphqlErrorPathSegment[];
};

export type FsdGraphqlResponseInterpretationInputV1 = {
  fieldNamesInDocument: readonly string[];
  dataPresent: boolean;
  httpStatus?: number;
  errors?: readonly FsdGraphqlErrorV1[];
};

export type FsdFieldInterpretationV1 = {
  fieldName: string;
  evidence: FsdEvidenceDimensionsV1;
  attribution: 'RELIABLE' | 'AMBIGUOUS' | 'WHOLE_DOCUMENT_FAILURE';
};

export type FsdGraphqlResponseInterpretationV1 = {
  documentAccepted: boolean;
  fields: FsdFieldInterpretationV1[];
};

function extractFieldNameFromErrorPath(
  path: readonly FsdGraphqlErrorPathSegment[] | undefined,
  fieldNames: readonly string[],
): string | null {
  if (!path || path.length === 0) {
    return null;
  }
  for (const segment of path) {
    if (typeof segment === 'string' && fieldNames.includes(segment)) {
      return segment;
    }
  }
  return null;
}

/** Never marks QUERY_ACCEPTED before a provider response; never accepts whole doc when field errors exist. */
export function interpretFsdGraphqlProviderResponse(
  input: FsdGraphqlResponseInterpretationInputV1,
): FsdGraphqlResponseInterpretationV1 {
  const fieldSet = new Set(input.fieldNamesInDocument);
  const failedFields = new Set<string>();
  let hasAmbiguousErrors = false;

  if (input.httpStatus === 422 || input.httpStatus === 400) {
    return {
      documentAccepted: false,
      fields: input.fieldNamesInDocument.map((fieldName) => ({
        fieldName,
        attribution: 'WHOLE_DOCUMENT_FAILURE',
        evidence: {
          declared: true,
          schemaCompatible: true,
          queryPlanned: true,
          queryAccepted: false,
          queryFailed: true,
        },
      })),
    };
  }

  for (const err of input.errors ?? []) {
    const field = extractFieldNameFromErrorPath(err.path, input.fieldNamesInDocument);
    if (field && fieldSet.has(field)) {
      failedFields.add(field);
    } else if (err.path && err.path.length > 0) {
      hasAmbiguousErrors = true;
    }
  }

  const hasFieldErrors = failedFields.size > 0;
  const documentAccepted = input.dataPresent && !hasFieldErrors && !hasAmbiguousErrors;

  const fields: FsdFieldInterpretationV1[] = input.fieldNamesInDocument.map((fieldName) => {
    if (failedFields.has(fieldName)) {
      return {
        fieldName,
        attribution: 'RELIABLE',
        evidence: {
          declared: true,
          schemaCompatible: true,
          queryPlanned: true,
          queryAccepted: false,
          queryFailed: true,
        },
      };
    }
    if (hasAmbiguousErrors) {
      return {
        fieldName,
        attribution: 'AMBIGUOUS',
        evidence: {
          declared: true,
          schemaCompatible: true,
          queryPlanned: true,
          queryAccepted: false,
        },
      };
    }
    if (!input.dataPresent) {
      return {
        fieldName,
        attribution: 'WHOLE_DOCUMENT_FAILURE',
        evidence: {
          declared: true,
          schemaCompatible: true,
          queryPlanned: true,
          queryAccepted: false,
          queryFailed: true,
        },
      };
    }
    return {
      fieldName,
      attribution: 'RELIABLE',
      evidence: {
        declared: true,
        schemaCompatible: true,
        queryPlanned: true,
        queryAccepted: documentAccepted,
      },
    };
  });

  return { documentAccepted, fields };
}

/**
 * Whole-document rejection must not permanently mark fields unsupported — only the chunk attempt failed.
 * Downstream orchestrator may split/replan; fields remain schema-compatible for replanning.
 */
export function fieldsRemainSchemaCompatibleAfterWholeDocumentRejection(
  fields: readonly FsdFieldInterpretationV1[],
): boolean {
  return fields.every((f) => f.evidence.schemaCompatible !== false);
}
