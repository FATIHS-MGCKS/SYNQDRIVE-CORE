/** Owner must set to `1` before running production recovery CLI. */
export const ONEAUTO_E4_CALLBACK_RECOVERY_PRODUCTION_AUTHORIZED_ENV =
  'ONEAUTO_E4_CALLBACK_RECOVERY_PRODUCTION_AUTHORIZED' as const;

/** Secondary owner acknowledgement — both auth env vars must be `1`. */
export const ONEAUTO_E4_CALLBACK_RECOVERY_OWNER_ACK_ENV =
  'ONEAUTO_E4_CALLBACK_RECOVERY_OWNER_ACK' as const;

export const ONEAUTO_E4_CALLBACK_RECOVERY_AUDIT_RESPONSE_PHASE = 'recovery_audit' as const;
export const ONEAUTO_E4_CALLBACK_RECOVERY_CALLBACK_RESPONSE_PHASE = 'callback' as const;

export function resolveOneAutoE4CallbackRecoveryAuthorization(): {
  authorized: boolean;
  reasons: string[];
} {
  const reasons: string[] = [];
  const prod = process.env[ONEAUTO_E4_CALLBACK_RECOVERY_PRODUCTION_AUTHORIZED_ENV]?.trim();
  const ack = process.env[ONEAUTO_E4_CALLBACK_RECOVERY_OWNER_ACK_ENV]?.trim();
  if (prod !== '1') {
    reasons.push(`${ONEAUTO_E4_CALLBACK_RECOVERY_PRODUCTION_AUTHORIZED_ENV} must be 1`);
  }
  if (ack !== '1') {
    reasons.push(`${ONEAUTO_E4_CALLBACK_RECOVERY_OWNER_ACK_ENV} must be 1`);
  }
  return { authorized: reasons.length === 0, reasons };
}
