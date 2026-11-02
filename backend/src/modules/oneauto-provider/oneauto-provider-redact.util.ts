const SENSITIVE_KEY = /authorization|api[_-]?key|password|secret|token|email|phone|address|name/i;

export function redactOneAutoErrorMessage(message: string): string {
  return message.slice(0, 240);
}

/** Shallow redaction for persisted provider JSON — drops keys that look like secrets/PII. */
export function redactProviderResponseBody(body: unknown): unknown {
  if (body == null || typeof body !== 'object') return body;
  if (Array.isArray(body)) {
    return body.map((item) => redactProviderResponseBody(item));
  }
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
    if (SENSITIVE_KEY.test(key)) {
      out[key] = '[REDACTED]';
      continue;
    }
    out[key] = typeof value === 'object' ? redactProviderResponseBody(value) : value;
  }
  return out;
}
