export const CORE_APP_M2M_RATE_LIMIT_PREFIX = 'synqdrive:core-app-m2m:rl';

/** Atomic fixed-window counter with TTL on first increment. Returns 1 allow, 0 deny. */
export const CORE_APP_M2M_FIXED_WINDOW_SCRIPT = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
local maxAllowed = tonumber(ARGV[2])
if current > maxAllowed then
  return 0
end
return 1
`;

export function coreAppM2mExchangeRateLimitKey(trustedIpKey: string, windowBucket: number): string {
  const safeIp = trustedIpKey.replace(/[^a-zA-Z0-9.:_-]/g, '_').slice(0, 128);
  return `${CORE_APP_M2M_RATE_LIMIT_PREFIX}:exchange:ip:${safeIp}:w:${windowBucket}`;
}

export function coreAppM2mVehicleReadRateLimitKey(
  clientId: string,
  organizationId: string,
  operation: 'list' | 'detail',
  windowBucket: number,
): string {
  const safeClient = clientId.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 128);
  const safeOrg = organizationId.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 64);
  return `${CORE_APP_M2M_RATE_LIMIT_PREFIX}:vehicle:${safeClient}:${safeOrg}:${operation}:w:${windowBucket}`;
}

export function rateLimitWindowBucket(nowMs: number, windowMs: number): number {
  return Math.floor(nowMs / windowMs);
}