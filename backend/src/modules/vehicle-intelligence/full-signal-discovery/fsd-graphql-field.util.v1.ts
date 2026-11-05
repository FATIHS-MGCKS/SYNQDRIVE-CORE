/** GraphQL identifiers only — prevents injection of arbitrary selection text. */
const GRAPHQL_FIELD_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function isValidFsdGraphqlFieldName(field: string): boolean {
  return GRAPHQL_FIELD_NAME.test(field);
}

export function normalizeDeclaredFieldNames(fields: readonly string[]): string[] {
  const unique = new Set<string>();
  for (const raw of fields) {
    const trimmed = raw.trim();
    if (!trimmed || !isValidFsdGraphqlFieldName(trimmed)) {
      continue;
    }
    unique.add(trimmed);
  }
  return [...unique].sort((a, b) => a.localeCompare(b));
}

export function rejectInvalidGraphqlFieldNames(fields: readonly string[]): {
  valid: string[];
  rejected: string[];
} {
  const valid: string[] = [];
  const rejected: string[] = [];
  for (const field of fields) {
    if (isValidFsdGraphqlFieldName(field)) {
      valid.push(field);
    } else {
      rejected.push(field);
    }
  }
  return { valid: [...new Set(valid)].sort((a, b) => a.localeCompare(b)), rejected };
}
