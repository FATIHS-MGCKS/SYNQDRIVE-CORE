/** Set to `1` before running OE_SERVICE_SCHEDULE failed-callback recovery in production. */
export const ONEAUTO_OE_SERVICE_SCHEDULE_CALLBACK_RECOVERY_PRODUCTION_AUTHORIZED_ENV =
  'ONEAUTO_OE_SERVICE_SCHEDULE_CALLBACK_RECOVERY_PRODUCTION_AUTHORIZED' as const;

/** Secondary owner acknowledgement — both auth env vars must be `1`. */
export const ONEAUTO_OE_SERVICE_SCHEDULE_CALLBACK_RECOVERY_OWNER_ACK_ENV =
  'ONEAUTO_OE_SERVICE_SCHEDULE_CALLBACK_RECOVERY_OWNER_ACK' as const;

export function resolveOneAutoOeServiceScheduleCallbackRecoveryAuthorization(): {
  authorized: boolean;
  reasons: string[];
} {
  const reasons: string[] = [];
  const prod =
    process.env[ONEAUTO_OE_SERVICE_SCHEDULE_CALLBACK_RECOVERY_PRODUCTION_AUTHORIZED_ENV]?.trim();
  const ack = process.env[ONEAUTO_OE_SERVICE_SCHEDULE_CALLBACK_RECOVERY_OWNER_ACK_ENV]?.trim();
  if (prod !== '1') {
    reasons.push(`${ONEAUTO_OE_SERVICE_SCHEDULE_CALLBACK_RECOVERY_PRODUCTION_AUTHORIZED_ENV} must be 1`);
  }
  if (ack !== '1') {
    reasons.push(`${ONEAUTO_OE_SERVICE_SCHEDULE_CALLBACK_RECOVERY_OWNER_ACK_ENV} must be 1`);
  }
  return { authorized: reasons.length === 0, reasons };
}
