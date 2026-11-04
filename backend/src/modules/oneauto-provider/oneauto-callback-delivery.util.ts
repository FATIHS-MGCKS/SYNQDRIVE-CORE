import { createHash, randomBytes, timingSafeEqual } from 'crypto';

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function generateOneAutoCallbackDeliveryToken(): {
  deliveryToken: string;
  deliveryTokenSha256: string;
} {
  const deliveryToken = randomBytes(32).toString('base64url');
  return { deliveryToken, deliveryTokenSha256: sha256Hex(deliveryToken) };
}

export function buildOneAutoProviderCallbackUrl(publicBaseUrl: string, deliveryToken: string): string {
  const base = publicBaseUrl.replace(/\/+$/, '');
  return `${base}/webhooks/oneauto/provider-callback/${encodeURIComponent(deliveryToken)}`;
}

export function timingSafeEqualSha256Hex(storedSha256Hex: string, candidateToken: string): boolean {
  const candidate = sha256Hex(candidateToken);
  if (storedSha256Hex.length !== candidate.length) return false;
  try {
    return timingSafeEqual(Buffer.from(storedSha256Hex, 'utf8'), Buffer.from(candidate, 'utf8'));
  } catch {
    return false;
  }
}

export function hashCallbackPayload(payload: string): string {
  return sha256Hex(payload);
}
