import { MembershipRole, UserPlatformRole } from '@prisma/client';
import { normalizeMembershipPermissions } from '@shared/auth/permission.util';
import {
  ASSURANCE_LEVEL_MFA,
  AuthSessionClaims,
} from '@shared/auth/auth-session-claims.types';

export const STEP_UP_ACTION = {
  ADMIN_ROLE_ASSIGN: 'ADMIN_ROLE_ASSIGN',
  PRIVILEGED_PERMISSION_CHANGE: 'PRIVILEGED_PERMISSION_CHANGE',
  ROLE_BULK_ASSIGNMENT_CHANGE: 'ROLE_BULK_ASSIGNMENT_CHANGE',
  MFA_RESET_OTHER_USER: 'MFA_RESET_OTHER_USER',
  REVOKE_OTHER_USER_SESSIONS: 'REVOKE_OTHER_USER_SESSIONS',
  AUDIT_EXPORT: 'AUDIT_EXPORT',
  BREAK_GLASS: 'BREAK_GLASS',
  MANUAL_INVITE_LINK: 'MANUAL_INVITE_LINK',
  PRIVACY_DATA_EXPORT: 'PRIVACY_DATA_EXPORT',
  PRIVACY_DATA_DELETION: 'PRIVACY_DATA_DELETION',
  /** Master admin control plane — billing mutations */
  MASTER_BILLING: 'MASTER_BILLING',
  /** Master admin subscription lifecycle */
  MASTER_SUBSCRIPTION: 'MASTER_SUBSCRIPTION',
  /** Master admin organization CRUD */
  MASTER_ORGANIZATION: 'MASTER_ORGANIZATION',
  /** Master admin platform settings (email, prune, changelogs) */
  MASTER_PLATFORM_SETTINGS: 'MASTER_PLATFORM_SETTINGS',
  /** Master admin API key / credential management */
  MASTER_API_KEYS: 'MASTER_API_KEYS',
  /** Master admin integration connectors (DIMO, HM, voice) */
  MASTER_INTEGRATIONS: 'MASTER_INTEGRATIONS',
  /** Master admin platform user management */
  MASTER_USER_MANAGEMENT: 'MASTER_USER_MANAGEMENT',
  /** Master admin audit log export (sensitive read) */
  MASTER_AUDIT_EXPORT: 'MASTER_AUDIT_EXPORT',
  /** Master admin — chargeable One Auto provider execution */
  MASTER_ONEAUTO_PROVIDER_EXECUTE: 'MASTER_ONEAUTO_PROVIDER_EXECUTE',
} as const;

export type StepUpActionCode = (typeof STEP_UP_ACTION)[keyof typeof STEP_UP_ACTION];

export const STEP_UP_TTL_MS = 10 * 60 * 1000;
export const ROLE_BULK_ASSIGNMENT_THRESHOLD = 5;
export const RECOVERY_CODE_COUNT = 10;

export const MFA_ERROR = {
  NOT_ENABLED: 'MFA_NOT_ENABLED',
  ALREADY_ENROLLED: 'MFA_ALREADY_ENROLLED',
  NOT_ENROLLED: 'MFA_NOT_ENROLLED',
  INVALID_CODE: 'MFA_INVALID_CODE',
  REPLAY: 'MFA_REPLAY_DETECTED',
  STEP_UP_REQUIRED: 'STEP_UP_REQUIRED',
  STEP_UP_EXPIRED: 'STEP_UP_EXPIRED',
  FEATURE_DISABLED: 'MFA_FEATURE_DISABLED',
  ENROLLMENT_REQUIRED: 'MFA_ENROLLMENT_REQUIRED',
} as const;

export function isPrivilegedAccount(input: {
  platformRole?: string | null;
  membershipRole?: string | null;
  permissions?: unknown;
}): boolean {
  if (input.platformRole === UserPlatformRole.MASTER_ADMIN) return true;
  if (
    input.membershipRole === MembershipRole.ORG_ADMIN ||
    input.membershipRole === MembershipRole.SUB_ADMIN
  ) {
    return true;
  }
  const permissions = normalizeMembershipPermissions(input.permissions);
  return Object.values(permissions ?? {}).some((level) => Boolean(level?.manage));
}

export function requiresStepUpForAction(action: StepUpActionCode): boolean {
  return Object.values(STEP_UP_ACTION).includes(action);
}

export function hasFreshMfaAssurance(
  claims: AuthSessionClaims,
  now = Date.now(),
): boolean {
  if (claims.assuranceLevel < ASSURANCE_LEVEL_MFA) return false;
  if (!claims.mfaAuthenticatedAt) return false;
  const mfaAt = Date.parse(claims.mfaAuthenticatedAt);
  if (Number.isNaN(mfaAt)) return false;
  return now - mfaAt <= STEP_UP_TTL_MS;
}

export function isPrivilegedPermissionMap(permissions: unknown): boolean {
  const normalized = normalizeMembershipPermissions(permissions);
  return Object.values(normalized ?? {}).some((level) => Boolean(level?.manage));
}

export function isPrivilegedMembershipRole(role: MembershipRole | string | null | undefined): boolean {
  return role === MembershipRole.ORG_ADMIN || role === MembershipRole.SUB_ADMIN;
}
