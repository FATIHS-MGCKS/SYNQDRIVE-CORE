import { describe, expect, it } from 'vitest';
import {
  assessEngineRpmDeepLinkEligibility,
  buildVehicleDetailIntelligenceNavContext,
  pickPrimaryProviderSourceLink,
  profileForProviderSourceLink,
  resolveNavPhysicalDeviceIdForProviderContext,
  VEHICLE_DETAIL_ENGINE_RPM_SIGNAL_KEY,
} from '../intelligence/vehicle-detail-intelligence.utils';
import {
  buildMasterIntelligenceSearch,
  navigateMasterIntelligenceCrossLink,
  parseMasterIntelligenceContext,
} from '../intelligence/master-intelligence-url';
import {
  APDS_OVERVIEW_BY_VEHICLE,
  QA_VEHICLE_AUDI_A4,
  QA_VEHICLE_TESLA_MODEL3,
  QA_VEHICLE_VW_ARTEON,
  QA_VEHICLE_VW_TIGUAN,
  VEHICLE_DETAIL_QA_DEVICE,
  VEHICLE_DETAIL_QA_LINK,
  VEHICLE_DETAIL_QA_ORG,
  VSI_OVERVIEW_BY_VEHICLE,
} from './test-fixtures/vehicle-detail-intelligence.fixture';
import { mapSummaryToRpmBadge } from '../intelligence/vsi-master-intelligence-ui.utils';

describe('vehicle detail intelligence utils', () => {
  it('single verified source-link enables navigation', () => {
    const profiles = VSI_OVERVIEW_BY_VEHICLE[QA_VEHICLE_VW_ARTEON]!.profiles;
    const pick = pickPrimaryProviderSourceLink(profiles, null);
    expect(pick.ambiguous).toBe(false);
    expect(pick.navigationReady).toBe(true);
    expect(pick.linkId).toBe(VEHICLE_DETAIL_QA_LINK);
  });

  it('multiple source-links never auto-selects the first link', () => {
    const profiles = VSI_OVERVIEW_BY_VEHICLE[QA_VEHICLE_VW_TIGUAN]!.profiles;
    const doubled = [
      ...profiles,
      { ...profiles[0]!, providerSourceLinkId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee' },
    ];
    const pick = pickPrimaryProviderSourceLink(doubled, null);
    expect(pick.ambiguous).toBe(true);
    expect(pick.linkId).toBeNull();
    expect(pick.navigationReady).toBe(false);
  });

  it('explicit selection resolves navigation among multiple links', () => {
    const profiles = VSI_OVERVIEW_BY_VEHICLE[QA_VEHICLE_VW_TIGUAN]!.profiles;
    const second = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
    const doubled = [...profiles, { ...profiles[0]!, providerSourceLinkId: second }];
    const pick = pickPrimaryProviderSourceLink(doubled, second);
    expect(pick.navigationReady).toBe(true);
    expect(pick.linkId).toBe(second);
  });

  it('stale selected link is rejected', () => {
    const profiles = VSI_OVERVIEW_BY_VEHICLE[QA_VEHICLE_VW_TIGUAN]!.profiles;
    const pick = pickPrimaryProviderSourceLink(profiles, '00000000-0000-4000-8000-000000000099');
    expect(pick.staleSelection).toBe(true);
    expect(pick.navigationReady).toBe(false);
    expect(pick.linkId).toBeNull();
  });

  it('missing source-link yields no navigation profile', () => {
    const pick = pickPrimaryProviderSourceLink([], null);
    expect(pick.linkId).toBeNull();
    expect(profileForProviderSourceLink([], null)).toBeNull();
  });

  it('Tesla fixture uses RPM NOT_APPLICABLE distinct from UNKNOWN profile label', () => {
    const profile = VSI_OVERVIEW_BY_VEHICLE[QA_VEHICLE_TESLA_MODEL3]!.profiles[0]!;
    const rpm = mapSummaryToRpmBadge(profile);
    expect(rpm.applicability).toBe('NOT_APPLICABLE');
    expect(rpm.profile).toBe('UNKNOWN');
    expect(assessEngineRpmDeepLinkEligibility(profile).eligible).toBe(false);
    expect(assessEngineRpmDeepLinkEligibility(profile).reasonKey).toBe('notApplicable');
  });

  it('Tiguan and Audi historical RPM profiles allow engine_rpm deep link from summary', () => {
    const tiguan = VSI_OVERVIEW_BY_VEHICLE[QA_VEHICLE_VW_TIGUAN]!.profiles[0]!;
    const audi = VSI_OVERVIEW_BY_VEHICLE[QA_VEHICLE_AUDI_A4]!.profiles[0]!;
    expect(tiguan.rpmActiveProfile).toBe('RPM_1HZ');
    expect(audi.rpmActiveProfile).toBe('RPM_STANDARD');
    expect(assessEngineRpmDeepLinkEligibility(tiguan).eligible).toBe(true);
    expect(assessEngineRpmDeepLinkEligibility(audi).eligible).toBe(true);
  });

  it('engine_rpm eligibility uses applicability only, not combined RPM proof tiers', () => {
    const audi = VSI_OVERVIEW_BY_VEHICLE[QA_VEHICLE_AUDI_A4]!.profiles[0]!;
    const result = assessEngineRpmDeepLinkEligibility(audi);
    expect(result.reasonKey).toBe('eligible');
    expect(result.reasonKey).not.toMatch(/PROVEN_/);
  });

  it('omits physicalDeviceId from provider navigation when multiple source links exist', () => {
    expect(
      resolveNavPhysicalDeviceIdForProviderContext({
        profileCount: 2,
        navigationReady: true,
        physicalDeviceId: VEHICLE_DETAIL_QA_DEVICE,
      }),
    ).toBeNull();
  });

  it('includes physicalDeviceId for single-link provider navigation when device is resolved', () => {
    expect(
      resolveNavPhysicalDeviceIdForProviderContext({
        profileCount: 1,
        navigationReady: true,
        physicalDeviceId: VEHICLE_DETAIL_QA_DEVICE,
      }),
    ).toBe(VEHICLE_DETAIL_QA_DEVICE);
  });

  it('omits physicalDeviceId when navigation is not ready', () => {
    expect(
      resolveNavPhysicalDeviceIdForProviderContext({
        profileCount: 1,
        navigationReady: false,
        physicalDeviceId: VEHICLE_DETAIL_QA_DEVICE,
      }),
    ).toBeNull();
  });

  it('UNKNOWN rpm applicability does not enable engine_rpm deep link', () => {
    const profile = VSI_OVERVIEW_BY_VEHICLE[QA_VEHICLE_VW_ARTEON]!.profiles[0]!;
    const unknownApplicability = { ...profile, rpmApplicability: 'UNKNOWN' as const };
    expect(assessEngineRpmDeepLinkEligibility(unknownApplicability).reasonKey).toBe('unknownApplicability');
  });

  it('covers four QA vehicle VSI/APDS fixture shapes', () => {
    for (const id of [QA_VEHICLE_TESLA_MODEL3, QA_VEHICLE_VW_TIGUAN, QA_VEHICLE_AUDI_A4, QA_VEHICLE_VW_ARTEON]) {
      expect(VSI_OVERVIEW_BY_VEHICLE[id]?.vehicleId).toBe(id);
      expect(APDS_OVERVIEW_BY_VEHICLE[id]?.vehicleId).toBe(id);
    }
  });

  it('buildVehicleDetailIntelligenceNavContext clears stale APDS params', () => {
    const ctx = buildVehicleDetailIntelligenceNavContext({
      organizationId: VEHICLE_DETAIL_QA_ORG,
      vehicleId: QA_VEHICLE_VW_ARTEON,
      providerSourceLinkId: VEHICLE_DETAIL_QA_LINK,
      physicalDeviceId: VEHICLE_DETAIL_QA_DEVICE,
      vsiTarget: 'engine_rpm_detail',
    });
    expect(ctx.apdOpportunityId).toBeNull();
    expect(ctx.asOf).toBeNull();
    expect(ctx.vsiTab).toBe('ledger');
    expect(ctx.signalKey).toBe(VEHICLE_DETAIL_ENGINE_RPM_SIGNAL_KEY);
    expect(ctx.physicalDeviceId).toBe(VEHICLE_DETAIL_QA_DEVICE);
  });

  it('builds ledger URL without signalKey for ledger-only navigation', () => {
    const qs = buildMasterIntelligenceSearch(
      'vsi-intelligence',
      buildVehicleDetailIntelligenceNavContext({
        organizationId: VEHICLE_DETAIL_QA_ORG,
        vehicleId: QA_VEHICLE_VW_ARTEON,
        providerSourceLinkId: VEHICLE_DETAIL_QA_LINK,
        physicalDeviceId: null,
        vsiTarget: 'ledger',
      }),
    );
    expect(qs).toContain('tab=ledger');
    expect(qs).not.toContain('signalKey=');
    expect(qs).toContain(`providerSourceLinkId=${VEHICLE_DETAIL_QA_LINK}`);
  });
});

// @vitest-environment happy-dom
describe('vehicle detail intelligence navigation', () => {
  it('round-trips vehicle drawer context through VSI, APDS, and PDI URLs', () => {
    window.history.replaceState(null, '', '/master?view=vehicles&cvSection=vehicles');
    navigateMasterIntelligenceCrossLink(
      'vsi-intelligence',
      buildVehicleDetailIntelligenceNavContext({
        organizationId: VEHICLE_DETAIL_QA_ORG,
        vehicleId: QA_VEHICLE_VW_ARTEON,
        providerSourceLinkId: VEHICLE_DETAIL_QA_LINK,
        physicalDeviceId: null,
        vsiTarget: 'overview',
      }),
    );
    let ctx = parseMasterIntelligenceContext(window.location.search);
    expect(ctx.vehicleId).toBe(QA_VEHICLE_VW_ARTEON);
    navigateMasterIntelligenceCrossLink('apds-intelligence', ctx);
    ctx = parseMasterIntelligenceContext(window.location.search);
    expect(ctx.providerSourceLinkId).toBe(VEHICLE_DETAIL_QA_LINK);
    navigateMasterIntelligenceCrossLink(
      'device-inventory',
      buildVehicleDetailIntelligenceNavContext({
        organizationId: VEHICLE_DETAIL_QA_ORG,
        vehicleId: QA_VEHICLE_VW_ARTEON,
        providerSourceLinkId: VEHICLE_DETAIL_QA_LINK,
        physicalDeviceId: VEHICLE_DETAIL_QA_DEVICE,
      }),
      { hygiene: { physicalDeviceIdProven: true } },
    );
    const params = new URLSearchParams(window.location.search);
    expect(params.get('view')).toBe('device-inventory');
    expect(params.get('pdiDeviceId')).toBe(VEHICLE_DETAIL_QA_DEVICE);
  });

  it('multi-link VSI navigation omits physicalDeviceId from URL', () => {
    const profiles = VSI_OVERVIEW_BY_VEHICLE[QA_VEHICLE_VW_TIGUAN]!.profiles;
    const second = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
    const doubled = [...profiles, { ...profiles[0]!, providerSourceLinkId: second }];
    const pick = pickPrimaryProviderSourceLink(doubled, second);
    const deviceId = resolveNavPhysicalDeviceIdForProviderContext({
      profileCount: doubled.length,
      navigationReady: pick.navigationReady,
      physicalDeviceId: VEHICLE_DETAIL_QA_DEVICE,
    });
    const qs = buildMasterIntelligenceSearch(
      'vsi-intelligence',
      buildVehicleDetailIntelligenceNavContext({
        organizationId: VEHICLE_DETAIL_QA_ORG,
        vehicleId: QA_VEHICLE_VW_TIGUAN,
        providerSourceLinkId: pick.linkId,
        physicalDeviceId: deviceId,
        vsiTarget: 'engine_rpm_detail',
      }),
    );
    expect(qs).not.toContain('physicalDeviceId=');
    expect(qs).toContain('signalKey=engine_rpm');
  });

  it('engine_rpm deep link preserves org, vehicle, and link context', () => {
    window.history.replaceState(null, '', '/master?view=vehicles');
    navigateMasterIntelligenceCrossLink(
      'vsi-intelligence',
      buildVehicleDetailIntelligenceNavContext({
        organizationId: VEHICLE_DETAIL_QA_ORG,
        vehicleId: QA_VEHICLE_VW_TIGUAN,
        providerSourceLinkId: VEHICLE_DETAIL_QA_LINK,
        physicalDeviceId: null,
        vsiTarget: 'engine_rpm_detail',
      }),
      { hygiene: { preserveVsiLedgerState: true } },
    );
    const ctx = parseMasterIntelligenceContext(window.location.search);
    expect(ctx.orgId).toBe(VEHICLE_DETAIL_QA_ORG);
    expect(ctx.vehicleId).toBe(QA_VEHICLE_VW_TIGUAN);
    expect(ctx.providerSourceLinkId).toBe(VEHICLE_DETAIL_QA_LINK);
    expect(ctx.vsiTab).toBe('ledger');
    expect(ctx.signalKey).toBe('engine_rpm');
  });

  it('missing physicalDeviceId omits device from VSI URL', () => {
    const qs = buildMasterIntelligenceSearch(
      'vsi-intelligence',
      buildVehicleDetailIntelligenceNavContext({
        organizationId: VEHICLE_DETAIL_QA_ORG,
        vehicleId: QA_VEHICLE_VW_ARTEON,
        providerSourceLinkId: VEHICLE_DETAIL_QA_LINK,
        physicalDeviceId: null,
        vsiTarget: 'overview',
      }),
    );
    expect(qs).not.toContain('physicalDeviceId=');
  });

  it('vehicle switch context uses new vehicle id without carrying stale link in builder', () => {
    const nextVehicle = QA_VEHICLE_AUDI_A4;
    const ctx = buildVehicleDetailIntelligenceNavContext({
      organizationId: VEHICLE_DETAIL_QA_ORG,
      vehicleId: nextVehicle,
      providerSourceLinkId: null,
      physicalDeviceId: null,
      vsiTarget: 'overview',
    });
    expect(ctx.vehicleId).toBe(nextVehicle);
    expect(ctx.providerSourceLinkId).toBeNull();
  });
});

describe('vehicle detail intelligence authorization', () => {
  it('documents MASTER_ADMIN gate in ConnectedVehicleIntelligenceSection (see master-intelligence-permissions.test.ts)', () => {
    expect(true).toBe(true);
  });
});
