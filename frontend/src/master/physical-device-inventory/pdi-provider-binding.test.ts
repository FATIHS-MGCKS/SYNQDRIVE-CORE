import { describe, expect, it } from 'vitest';
import {
  buildMasterIntelligenceSearch,
  navigateMasterIntelligenceCrossLink,
  parseMasterIntelligenceContext,
} from '../intelligence/master-intelligence-url';
import type { MasterPdiDeviceIntelligenceDto } from './pdi-master-intelligence-api.types';
import {
  buildPdiIntelligenceNavContext,
  formatPdiLinkStatus,
  pickPdiProviderSourceLink,
  pdiLinkStatusAllowsNavigation,
  resolvePdiCrossNavScope,
} from './pdi-provider-binding.utils';

const DEVICE_ID = 'b2c3d4e5-f6a7-4890-b123-456789abcdef';
const ORG_A = 'faa710c9-6d91-4079-a7d5-91fdccdec14a';
const ORG_B = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const VEHICLE = '44444444-4444-4444-8444-444444444404';
const LINK_1 = '9ff5e350-cd4b-4e3a-956a-4f1770b017f2';
const LINK_2 = '11111111-2222-4333-8444-555555555555';

function baseIdentity(
  partial?: Partial<MasterPdiDeviceIntelligenceDto['identity']>,
): MasterPdiDeviceIntelligenceDto['identity'] {
  return {
    physicalDeviceId: DEVICE_ID,
    modelCode: 'RUPTELA_R1',
    hardwareTypeLabel: 'Ruptela',
    status: 'INSTALLED',
    identityStatus: 'IDENTITY_OK',
    serialNumberMasked: '***1234',
    imeiMasked: '***5678',
    ownerOrganizationId: ORG_A,
    currentVehicleId: VEHICLE,
    currentOrganizationId: ORG_A,
    identityEvidenceSummary: null,
    identityEvaluatedAt: '2026-10-28T12:00:00.000Z',
    identityEvidenceSource: 'PDI_INVENTORY_AND_OPTIONAL_LIVE_DIMO_MIRROR',
    currentSnapshotIsNotHistoricalObservation: true,
    physicalR1Applicability: 'APPLICABLE_INSTALLED',
    ...partial,
  };
}

function binding(linkId: string, status: string | null = 'ACTIVE') {
  return {
    providerSourceLinkId: linkId,
    providerIdentity: 'DIMO/TELEMETRY',
    linkStatus: status,
    attributionScope: 'CURRENT_VEHICLE_ONLY' as const,
    historicalLinkAttributionRequiresPersistedAssignment: true as const,
  };
}

describe('pdi provider binding utils', () => {
  it('single binding enables navigation without explicit selection', () => {
    const pick = pickPdiProviderSourceLink([binding(LINK_1)], null);
    expect(pick.navigationReady).toBe(true);
    expect(pick.linkId).toBe(LINK_1);
  });

  it('multiple bindings never auto-select first link', () => {
    const pick = pickPdiProviderSourceLink([binding(LINK_1), binding(LINK_2)], null);
    expect(pick.linkId).toBeNull();
    expect(pick.ambiguous).toBe(true);
    expect(pick.navigationReady).toBe(false);
  });

  it('explicit selection resolves among multiple bindings', () => {
    const pick = pickPdiProviderSourceLink([binding(LINK_1), binding(LINK_2)], LINK_2);
    expect(pick.navigationReady).toBe(true);
    expect(pick.linkId).toBe(LINK_2);
  });

  it('stale selection is rejected', () => {
    const pick = pickPdiProviderSourceLink([binding(LINK_1)], '00000000-0000-4000-8000-000000000099');
    expect(pick.staleSelection).toBe(true);
    expect(pick.navigationReady).toBe(false);
  });

  it('missing bindings block navigation', () => {
    const pick = pickPdiProviderSourceLink([], null);
    expect(pick.navigationReady).toBe(false);
  });

  it('cross-organization panel scope blocks navigation', () => {
    const pick = pickPdiProviderSourceLink([binding(LINK_1)], null);
    const scope = resolvePdiCrossNavScope({
      identity: baseIdentity(),
      panelOrganizationId: ORG_B,
      bindingPick: pick,
      bindings: [binding(LINK_1)],
      bindingCount: 1,
    });
    expect(scope.crossOrgMismatch).toBe(true);
    expect(scope.navigationReady).toBe(false);
  });

  it('device installed without vehicle scope blocks navigation', () => {
    const pick = pickPdiProviderSourceLink([binding(LINK_1)], null);
    const scope = resolvePdiCrossNavScope({
      identity: baseIdentity({ currentVehicleId: null, currentOrganizationId: null }),
      panelOrganizationId: ORG_A,
      bindingPick: pick,
      bindings: [binding(LINK_1)],
      bindingCount: 1,
    });
    expect(scope.missingVehicleScope).toBe(true);
    expect(scope.navigationReady).toBe(false);
  });

  it('inactive link status formats as INACTIVE not VERIFIED', () => {
    expect(formatPdiLinkStatus('INACTIVE')).toBe('INACTIVE');
    expect(formatPdiLinkStatus(null)).toBe('UNKNOWN');
  });

  it('inactive or unknown link status blocks navigation', () => {
    expect(pdiLinkStatusAllowsNavigation('ACTIVE')).toBe(true);
    expect(pdiLinkStatusAllowsNavigation('INACTIVE')).toBe(false);
    expect(pdiLinkStatusAllowsNavigation(null)).toBe(false);
    const inactivePick = pickPdiProviderSourceLink([binding(LINK_1, 'INACTIVE')], null);
    const scope = resolvePdiCrossNavScope({
      identity: baseIdentity(),
      panelOrganizationId: ORG_A,
      bindingPick: inactivePick,
      bindings: [binding(LINK_1, 'INACTIVE')],
      bindingCount: 1,
    });
    expect(scope.inactiveOrIncompleteLink).toBe(true);
    expect(scope.navigationReady).toBe(false);
    expect(buildPdiIntelligenceNavContext({ scope })).toBeNull();
  });

  it('binding switch replaces providerSourceLinkId in scope without stale link id', () => {
    const bindings = [binding(LINK_1), binding(LINK_2)];
    const scopeA = resolvePdiCrossNavScope({
      identity: baseIdentity(),
      panelOrganizationId: ORG_A,
      bindingPick: pickPdiProviderSourceLink(bindings, LINK_1),
      bindings,
      bindingCount: 2,
    });
    const scopeB = resolvePdiCrossNavScope({
      identity: baseIdentity(),
      panelOrganizationId: ORG_A,
      bindingPick: pickPdiProviderSourceLink(bindings, LINK_2),
      bindings,
      bindingCount: 2,
    });
    expect(scopeA.providerSourceLinkId).toBe(LINK_1);
    expect(scopeB.providerSourceLinkId).toBe(LINK_2);
    expect(scopeA.orgId).toBe(scopeB.orgId);
    expect(scopeA.vehicleId).toBe(scopeB.vehicleId);
  });

  it('omits physicalDeviceId from VSI URL when multiple bindings', () => {
    const bindings = [binding(LINK_1), binding(LINK_2)];
    const pick = pickPdiProviderSourceLink(bindings, LINK_1);
    const scope = resolvePdiCrossNavScope({
      identity: baseIdentity(),
      panelOrganizationId: ORG_A,
      bindingPick: pick,
      bindings,
      bindingCount: 2,
    });
    expect(scope.providerNavPhysicalDeviceId).toBeNull();
    const ctx = buildPdiIntelligenceNavContext({ scope, vsiTarget: 'ledger' });
    expect(ctx).not.toBeNull();
    const qs = buildMasterIntelligenceSearch('vsi-intelligence', ctx!);
    expect(qs).not.toContain('physicalDeviceId=');
    expect(qs).toContain(`providerSourceLinkId=${LINK_1}`);
    expect(qs).toContain('tab=ledger');
  });

  it('includes physicalDeviceId for single binding VSI navigation', () => {
    const pick = pickPdiProviderSourceLink([binding(LINK_1)], null);
    const scope = resolvePdiCrossNavScope({
      identity: baseIdentity(),
      panelOrganizationId: ORG_A,
      bindingPick: pick,
      bindings: [binding(LINK_1)],
      bindingCount: 1,
    });
    expect(scope.providerNavPhysicalDeviceId).toBe(DEVICE_ID);
  });

  it('vehicle reassignment clears scope when vehicle missing', () => {
    const pick = pickPdiProviderSourceLink([binding(LINK_1)], null);
    const scope = resolvePdiCrossNavScope({
      identity: baseIdentity({ currentVehicleId: null }),
      panelOrganizationId: ORG_A,
      bindingPick: pick,
      bindings: [],
      bindingCount: 0,
    });
    expect(scope.navigationReady).toBe(false);
  });
});

// @vitest-environment happy-dom
describe('pdi cross navigation URLs', () => {
  it('builds vehicle detail navigation with device id', () => {
    const pick = pickPdiProviderSourceLink([binding(LINK_1)], null);
    const scope = resolvePdiCrossNavScope({
      identity: baseIdentity(),
      panelOrganizationId: ORG_A,
      bindingPick: pick,
      bindings: [binding(LINK_1)],
      bindingCount: 1,
    });
    window.history.replaceState(null, '', '/master?view=device-inventory');
    const ctx = buildPdiIntelligenceNavContext({
      scope,
      includePhysicalDeviceForDestination: true,
    });
    navigateMasterIntelligenceCrossLink('vehicles', ctx!);
    const params = new URLSearchParams(window.location.search);
    expect(params.get('view')).toBe('vehicles');
    expect(params.get('vehicleId')).toBe(VEHICLE);
    expect(params.get('orgId')).toBe(ORG_A);
  });

  it('APDS navigation preserves org vehicle and link', () => {
    const pick = pickPdiProviderSourceLink([binding(LINK_1)], null);
    const scope = resolvePdiCrossNavScope({
      identity: baseIdentity(),
      panelOrganizationId: ORG_A,
      bindingPick: pick,
      bindings: [binding(LINK_1)],
      bindingCount: 1,
    });
    window.history.replaceState(null, '', '/master?view=device-inventory');
    navigateMasterIntelligenceCrossLink('apds-intelligence', buildPdiIntelligenceNavContext({ scope })!);
    const ctx = parseMasterIntelligenceContext(window.location.search);
    expect(ctx.providerSourceLinkId).toBe(LINK_1);
    expect(ctx.vehicleId).toBe(VEHICLE);
  });
});
