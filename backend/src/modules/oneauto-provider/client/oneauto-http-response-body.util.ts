const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

function utf8ByteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

export function assertNotRedirectStatus(httpStatus: number): void {
  if (REDIRECT_STATUSES.has(httpStatus) || (httpStatus >= 300 && httpStatus < 400)) {
    throw Object.assign(new Error('One Auto unexpected redirect response'), {
      code: 'ONEAUTO_UNEXPECTED_REDIRECT',
    });
  }
}

/**
 * Reads response text with a hard byte cap. Uses streaming when Response.body is available.
 */
export async function readBoundedResponseText(res: Response, maxBytes: number): Promise<string> {
  assertNotRedirectStatus(res.status);

  const body = res.body;
  if (!body || typeof body.getReader !== 'function') {
    const text = await res.text();
    if (utf8ByteLength(text) > maxBytes) {
      throw Object.assign(new Error('One Auto response body too large'), {
        code: 'ONEAUTO_RESPONSE_TOO_LARGE',
      });
    }
    return text;
  }

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let received = 0;
  const parts: string[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > maxBytes) {
        await reader.cancel();
        throw Object.assign(new Error('One Auto response body too large'), {
          code: 'ONEAUTO_RESPONSE_TOO_LARGE',
        });
      }
      parts.push(decoder.decode(value, { stream: true }));
    }
    parts.push(decoder.decode());
    return parts.join('');
  } finally {
    reader.releaseLock();
  }
}

/** Non-JSON provider payloads — no raw preview text (avoid secret leakage). */
export function nonJsonResponsePlaceholder(text: string): Record<string, unknown> {
  return {
    _nonJsonResponse: true,
    byteLength: utf8ByteLength(text),
  };
}
