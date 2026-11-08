/** Relative path prefixes whose tracked TypeScript sources must match HEAD blobs at attestation. */
export const FSD3_EXECUTABLE_ATTESTATION_PREFIXES_V1 = [
  'backend/scripts/ops/fsd3-',
  'backend/src/modules/vehicle-intelligence/fsd-integration/',
  'backend/src/modules/vehicle-intelligence/full-signal-discovery/',
  'backend/src/modules/vehicle-onboarding/services/dimo-source-link-operator-authorization.service.ts',
  'backend/src/modules/dimo/provider-budget/',
  'backend/src/shared/database/prisma.service.ts',
  'backend/src/shared/redis/redis.service.ts',
] as const;

const SOURCE_SUFFIX = /\.(ts|tsx|mjs|cjs)$/;

export function isUnderFsd3ExecutableAttestationBoundaryV1(repoRelativePath: string): boolean {
  if (!SOURCE_SUFFIX.test(repoRelativePath)) {
    return false;
  }
  return FSD3_EXECUTABLE_ATTESTATION_PREFIXES_V1.some(
    (prefix) => repoRelativePath === prefix || repoRelativePath.startsWith(prefix),
  );
}
