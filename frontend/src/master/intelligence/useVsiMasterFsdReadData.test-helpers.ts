export function matchesScope(
  scope: { orgId: string; vehicleId: string; providerSourceLinkId: string } | null,
  dto: { organizationId: string; vehicleId: string; providerSourceLinkId: string },
): boolean {
  if (!scope) return false;
  return (
    dto.organizationId === scope.orgId &&
    dto.vehicleId === scope.vehicleId &&
    dto.providerSourceLinkId === scope.providerSourceLinkId
  );
}
