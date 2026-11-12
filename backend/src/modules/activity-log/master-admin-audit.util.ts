import type { Request } from 'express';
import { ASSURANCE_LEVEL_MFA } from '@shared/auth/auth-session-claims.types';

type PrivilegedRequest = Request & {
  requestId?: string;
  user?: {
    id?: string;
    platformRole?: string;
    platformPermissions?: string[];
    organizationId?: string | null;
    sessionClaims?: {
      assuranceLevel?: number;
      mfaAuthenticatedAt?: string | null;
    };
  };
  masterAdminMfaStepUpUsed?: boolean;
  masterAdminMfaStepUpAction?: string;
  params?: Record<string, string>;
};

export function resolveCorrelationId(req: PrivilegedRequest): string {
  const header =
    (req.headers['x-correlation-id'] as string | undefined) ??
    (req.headers['x-request-id'] as string | undefined);
  return req.requestId ?? header ?? 'unknown';
}

export function resolvePrivilegedReason(req: PrivilegedRequest): string | null {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const fromBody =
    (typeof body.reason === 'string' && body.reason.trim()) ||
    (typeof body.auditReason === 'string' && body.auditReason.trim()) ||
    null;
  const fromHeader = req.headers['x-privileged-reason'];
  if (typeof fromHeader === 'string' && fromHeader.trim()) {
    return fromHeader.trim();
  }
  return fromBody;
}

export function resolveTargetOrganizationId(req: PrivilegedRequest): string | null {
  const params = req.params ?? {};
  if (params.orgId) return params.orgId;
  if (params.organizationId) return params.organizationId;
  const path = (req.url ?? req.path ?? '').split('?')[0];
  if (path.includes('/admin/organizations/') && params.id) {
    return params.id;
  }
  if (path.includes('/organizations/') && params.orgId) {
    return params.orgId;
  }
  return null;
}

export function resolveEntityId(req: PrivilegedRequest): string | null {
  const params = req.params ?? {};
  return params.id ?? params.userId ?? params.invoiceId ?? params.orgId ?? null;
}

export function isMasterPrivilegedRequest(req: PrivilegedRequest): boolean {
  const path = (req.originalUrl ?? req.url ?? '').split('?')[0];
  const user = req.user;
  if (!user?.id) return false;

  if (path.includes('/api/v1/admin/')) {
    return true;
  }

  const hasMasterBilling =
    user.platformRole === 'MASTER_ADMIN' ||
    (Array.isArray(user.platformPermissions) &&
      user.platformPermissions.includes('master-billing'));

  return hasMasterBilling && path.includes('/api/v1/admin/billing');
}

export function resolveMfaAuditFields(req: PrivilegedRequest): {
  mfaStepUpAction: string | null;
  mfaAssuranceLevel: number | null;
  mfaStepUpUsed: boolean;
} {
  const claims = req.user?.sessionClaims;
  const assuranceLevel = claims?.assuranceLevel ?? null;
  const freshMfa =
    assuranceLevel != null &&
    assuranceLevel >= ASSURANCE_LEVEL_MFA &&
    Boolean(claims?.mfaAuthenticatedAt);

  return {
    mfaStepUpAction: req.masterAdminMfaStepUpAction ?? null,
    mfaAssuranceLevel: assuranceLevel,
    mfaStepUpUsed: Boolean(req.masterAdminMfaStepUpUsed || freshMfa),
  };
}

const SENSITIVE_BODY_KEY_FRAGMENTS = [
  'password',
  'token',
  'secret',
  'apikey',
  'api_key',
  'clientsecret',
  'client_secret',
  'authorization',
  'refresh',
  'otp',
  'pin',
  'signature',
  'creditcard',
  'credit_card',
  'cvv',
];

function isSensitiveBodyKey(key: string): boolean {
  const k = key.toLowerCase();
  return SENSITIVE_BODY_KEY_FRAGMENTS.some((f) => k.includes(f));
}

/** Redact secrets from privileged mutation payloads before persisting in audit diff. */
export function sanitizePrivilegedAuditPayload(value: unknown): unknown {
  if (value == null) return value;
  if (Array.isArray(value)) {
    return value.map((item) => sanitizePrivilegedAuditPayload(item));
  }
  if (typeof value !== 'object') return value;

  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (isSensitiveBodyKey(key)) {
      out[key] = '[REDACTED]';
    } else if (child && typeof child === 'object') {
      out[key] = sanitizePrivilegedAuditPayload(child);
    } else {
      out[key] = child;
    }
  }
  return out;
}

export function buildPrivilegedRouteLabel(req: PrivilegedRequest): string | undefined {
  const routePath = (req as { route?: { path?: string } }).route?.path;
  if (routePath) {
    return `${req.method} ${routePath}`;
  }
  const path = (req.originalUrl ?? req.url ?? '').split('?')[0];
  return path ? `${req.method} ${path}` : undefined;
}
