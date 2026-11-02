import type { MasterPdiDeviceIntelligenceDto } from './pdi-master-intelligence-api.types';
import type { MasterIntelligenceContextState } from '../intelligence/master-intelligence.types';
import {
  buildVehicleDetailIntelligenceNavContext,
  resolveNavPhysicalDeviceIdForProviderContext,
  type VehicleDetailVsiNavTarget,
} from '../intelligence/vehicle-detail-intelligence.utils';

export type PdiProviderBindingRow = MasterPdiDeviceIntelligenceDto['providerBindings'][number];

export type PdiProviderBindingPick = {
  linkId: string | null;
  ambiguous: boolean;
  staleSelection: boolean;
  navigationReady: boolean;
};

export function pickPdiProviderSourceLink(
  bindings: PdiProviderBindingRow[],
  selectedLinkId: string | null,
): PdiProviderBindingPick {
  if (bindings.length === 0) {
    return { linkId: null, ambiguous: false, staleSelection: false, navigationReady: false };
  }
  if (bindings.length === 1) {
    const soleId = bindings[0]!.providerSourceLinkId;
    if (selectedLinkId && selectedLinkId !== soleId) {
      return { linkId: null, ambiguous: false, staleSelection: true, navigationReady: false };
    }
    return {
      linkId: soleId,
      ambiguous: false,
      staleSelection: false,
      navigationReady: true,
    };
  }
  if (selectedLinkId) {
    const match = bindings.some((b) => b.providerSourceLinkId === selectedLinkId);
    if (match) {
      return {
        linkId: selectedLinkId,
        ambiguous: true,
        staleSelection: false,
        navigationReady: true,
      };
    }
    return { linkId: null, ambiguous: true, staleSelection: true, navigationReady: false };
  }
  return { linkId: null, ambiguous: true, staleSelection: false, navigationReady: false };
}

export function formatPdiLinkStatus(linkStatus: string | null | undefined): string {
  if (linkStatus == null || linkStatus.trim() === '') return 'UNKNOWN';
  return linkStatus;
}

/** Cross-navigation requires explicit ACTIVE link status from the DTO — no inference from device INSTALLED. */
export function pdiLinkStatusAllowsNavigation(linkStatus: string | null | undefined): boolean {
  return formatPdiLinkStatus(linkStatus) === 'ACTIVE';
}

export type PdiCrossNavScope = {
  navigationReady: boolean;
  crossOrgMismatch: boolean;
  missingVehicleScope: boolean;
  inactiveOrIncompleteLink: boolean;
  orgId: string | null;
  vehicleId: string | null;
  providerSourceLinkId: string | null;
  physicalDeviceId: string;
  providerNavPhysicalDeviceId: string | null;
};

/** Resolves cross-module navigation scope from PDI DTO evidence only (no first-binding fallback). */
export function resolvePdiCrossNavScope(input: {
  identity: MasterPdiDeviceIntelligenceDto['identity'];
  panelOrganizationId: string | null;
  bindingPick: PdiProviderBindingPick;
  bindings: PdiProviderBindingRow[];
  bindingCount: number;
}): PdiCrossNavScope {
  const physicalDeviceId = input.identity.physicalDeviceId;
  const vehicleId = input.identity.currentVehicleId;
  const orgId = input.identity.currentOrganizationId;

  const missingVehicleScope = !vehicleId || !orgId;
  const crossOrgMismatch = Boolean(
    input.panelOrganizationId &&
      orgId &&
      input.panelOrganizationId.trim() !== orgId.trim(),
  );

  const selectedBinding =
    input.bindingPick.linkId != null
      ? input.bindings.find((b) => b.providerSourceLinkId === input.bindingPick.linkId)
      : null;
  const inactiveOrIncompleteLink = Boolean(
    input.bindingPick.navigationReady &&
      (!selectedBinding || !pdiLinkStatusAllowsNavigation(selectedBinding.linkStatus)),
  );

  const scopeReady =
    input.bindingPick.navigationReady &&
    !missingVehicleScope &&
    !crossOrgMismatch &&
    !inactiveOrIncompleteLink;

  const navigationReady = scopeReady;

  const providerNavPhysicalDeviceId = resolveNavPhysicalDeviceIdForProviderContext({
    profileCount: input.bindingCount,
    navigationReady: scopeReady,
    physicalDeviceId,
  });

  return {
    navigationReady,
    crossOrgMismatch,
    missingVehicleScope,
    inactiveOrIncompleteLink,
    orgId: orgId ?? null,
    vehicleId: vehicleId ?? null,
    providerSourceLinkId: input.bindingPick.linkId,
    physicalDeviceId,
    providerNavPhysicalDeviceId,
  };
}

export function buildPdiIntelligenceNavContext(input: {
  scope: PdiCrossNavScope;
  vsiTarget?: VehicleDetailVsiNavTarget;
  includePhysicalDeviceForDestination?: boolean;
}): MasterIntelligenceContextState | null {
  if (!input.scope.navigationReady || !input.scope.orgId || !input.scope.vehicleId) {
    return null;
  }
  const physicalDeviceId = input.includePhysicalDeviceForDestination
    ? input.scope.physicalDeviceId
    : input.scope.providerNavPhysicalDeviceId;

  return buildVehicleDetailIntelligenceNavContext({
    organizationId: input.scope.orgId,
    vehicleId: input.scope.vehicleId,
    providerSourceLinkId: input.scope.providerSourceLinkId,
    physicalDeviceId,
    vsiTarget: input.vsiTarget,
  });
}

export function bindingAttributionVehicleOrgLabel(input: {
  identity: MasterPdiDeviceIntelligenceDto['identity'];
}): { vehicleId: string | null; organizationId: string | null; scopeKnown: boolean } {
  const vehicleId = input.identity.currentVehicleId;
  const organizationId = input.identity.currentOrganizationId;
  return {
    vehicleId,
    organizationId,
    scopeKnown: Boolean(vehicleId && organizationId),
  };
}
