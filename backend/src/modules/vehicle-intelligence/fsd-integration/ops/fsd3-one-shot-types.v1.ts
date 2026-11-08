export type Fsd3OneShotLiveProviderV1 = 'mock' | 'dimo_live';

export type Fsd3OneShotCliScopeV1 = {
  organizationId: string;
  vehicleId: string;
  providerSourceLinkId: string;
  discoveryRequestKey: string;
};

export function resolveFsd3OneShotReleaseShaForAuditV1(env: NodeJS.ProcessEnv = process.env): string {
  return env.SYNQDRIVE_RELEASE_SHA?.trim() || env.SYNQDRIVE_REQUESTED_DEPLOY_SHA?.trim() || 'undeclared';
}
