export const DS4_RPM_REF_INTEL_V1_V1B_ATTACH_ENV = {
  attachEnabled: 'DS4_RPM_REF_INTEL_V1_V1B_ATTACH_ENABLED',
} as const;

export function parseDs4RpmRefIntelV1V1bAttachEnabled(
  env: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  const raw = env[DS4_RPM_REF_INTEL_V1_V1B_ATTACH_ENV.attachEnabled];
  if (raw == null || raw.trim() === '') return false;
  const normalized = raw.trim().toLowerCase();
  return ['1', 'true', 'yes', 'on'].includes(normalized);
}
