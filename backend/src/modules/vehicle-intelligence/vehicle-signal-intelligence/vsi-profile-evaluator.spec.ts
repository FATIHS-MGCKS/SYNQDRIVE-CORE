import { DrivingCapabilityStatus } from '@prisma/client';
import { evaluateVsiSignalProfile } from './vsi-profile-evaluator';
import { VsiDeclaredCatalogResolver } from './vsi-declared-catalog.resolver';
import { enrichVsiProfileWithSignalFingerprints } from './vsi-signal-fingerprint.enricher';
import {
  classifyVsiP0aSignalFinding,
} from './vsi-p0a-signal-integrity-audit.classifier';
import { VSI_P0A_DEFAULT_COHORT_V1 } from './vsi-p0a-audit-cohort.v1';
import {
  VsiEmpiricalObservationStatus,
  VsiProviderCatalogStatus,
} from './vehicle-signal-evidence.contract';
import {
  VsiSignalQualityClassification,
} from './vsi-signal-quality.classifier';
import { VSI_LIMITATION_EMPIRICAL_EXTRACTOR_NOT_IMPLEMENTED } from './vsi-profile-empirical.constants';

const catalogResolver = {
  catalogForCanonicalKey: (
    snapshot: { byNativeSignalName: ReadonlyMap<string, VsiProviderCatalogStatus> },
    key: string,
  ) => {
    const defMap: Record<string, string> = {
      lv_voltage: 'lowVoltageBatteryCurrentVoltage',
      hv_battery_soc: 'powertrainTractionBatteryStateOfChargeCurrent',
    };
    const native = defMap[key];
    return native
      ? snapshot.byNativeSignalName.get(native) ?? VsiProviderCatalogStatus.UNKNOWN
      : VsiProviderCatalogStatus.UNKNOWN;
  },
} as VsiDeclaredCatalogResolver;

describe('evaluateVsiSignalProfile', () => {
  const baseLink = {
    id: 'link-1',
    provider: 'DIMO',
    isActive: true,
    metadata: {
      connectionIdentity: {
        version: 'vo-source-link-connection-identity-v1',
        verifiedModality: 'HARDWARE_DEVICE',
        telemetrySourceFamily: 'RUPTELA_R1',
      },
    },
    consentId: null,
  };

  const hardwareIdentity = {
    provider: 'DIMO',
    providerSourceLinkId: 'link-1',
    verifiedModality: 'HARDWARE_DEVICE',
    physicalDeviceReference: 'UNKNOWN',
    telemetrySourceFamily: 'RUPTELA_R1' as const,
    treatsAsPhysicalHardwareDevice: true,
    confidenceLimitations: [],
  };

  it('maps declared LISTED separately from empirical LV observation (Ruptela)', () => {
    const declared = {
      checkedAt: new Date('2026-10-01T00:00:00Z'),
      byNativeSignalName: new Map([
        ['lowVoltageBatteryCurrentVoltage', VsiProviderCatalogStatus.LISTED],
      ]),
      limitations: [],
    };
    const result = evaluateVsiSignalProfile(
      {
        organizationId: 'org-1',
        vehicleId: 'veh-1',
        registryLifecycle: 'ACTIVE',
        hardwareTypeLegacy: 'LTE_R1',
        link: baseLink,
        identity: hardwareIdentity,
        fuelType: 'GASOLINE',
        latestState: {
          vehicleId: 'veh-1',
          providerBindingId: 'link-1',
          providerSource: 'DIMO',
          lvBatteryVoltage: 12.4,
          evSoc: null,
          online: true,
          sourceTimestamp: new Date('2026-10-15T10:00:00Z'),
          providerFetchedAt: new Date('2026-10-15T10:00:01Z'),
          updatedAt: new Date('2026-10-15T10:00:01Z'),
          rawPayloadJson: {
            lowVoltageBatteryCurrentVoltage: {
              value: 12.4,
              timestamp: '2026-10-15T10:00:00.000Z',
            },
          },
        },
        pollLogs: [{ status: 'SUCCESS', startedAt: new Date(), finishedAt: new Date() }],
        declaredCatalog: declared,
        priorAggregatedSourceTimestamp: new Date('2026-10-14T10:00:00Z'),
      },
      catalogResolver,
    );

    const lv = result.signals.find((s) => s.canonicalSignalKey === 'lv_voltage');
    expect(lv?.declaredSupport).toBe('LISTED');
    expect(lv?.empiricalObservation).toBe(VsiEmpiricalObservationStatus.OBSERVED);
    expect(
      result.signals.find((s) => s.canonicalSignalKey === 'hv_battery_soc')?.empiricalObservation,
    ).toBe(VsiEmpiricalObservationStatus.NOT_APPLICABLE);
    expect(result.signals.find((s) => s.canonicalSignalKey === 'provider_source_timestamp')?.strictSourceAdvanced).toBe(
      true,
    );
  });

  it('Tesla software: HV observed, LV not inferred from catalog alone', () => {
    const softwareIdentity = {
      ...hardwareIdentity,
      verifiedModality: 'SOFTWARE_INTEGRATION',
      telemetrySourceFamily: 'API_SYNTHETIC' as const,
      treatsAsPhysicalHardwareDevice: false,
    };
    const declared = {
      checkedAt: new Date('2026-10-01T00:00:00Z'),
      byNativeSignalName: new Map([
        ['lowVoltageBatteryCurrentVoltage', VsiProviderCatalogStatus.LISTED],
        ['powertrainTractionBatteryStateOfChargeCurrent', VsiProviderCatalogStatus.LISTED],
      ]),
      limitations: [],
    };
    const result = evaluateVsiSignalProfile(
      {
        organizationId: 'org-1',
        vehicleId: 'veh-tesla',
        registryLifecycle: 'ACTIVE',
        hardwareTypeLegacy: 'LTE_R1',
        link: baseLink,
        identity: softwareIdentity,
        fuelType: 'ELECTRIC',
        latestState: {
          vehicleId: 'veh-tesla',
          providerBindingId: 'link-1',
          providerSource: 'DIMO',
          lvBatteryVoltage: null,
          evSoc: 72,
          online: true,
          sourceTimestamp: new Date('2026-10-15T10:00:00Z'),
          providerFetchedAt: new Date('2026-10-15T10:00:01Z'),
          updatedAt: new Date('2026-10-15T10:00:01Z'),
          rawPayloadJson: {
            powertrainTractionBatteryStateOfChargeCurrent: {
              value: 72,
              timestamp: '2026-10-15T10:00:00.000Z',
            },
          },
        },
        pollLogs: [],
        declaredCatalog: declared,
      },
      catalogResolver,
    );

    const lv = result.signals.find((s) => s.canonicalSignalKey === 'lv_voltage');
    const hv = result.signals.find((s) => s.canonicalSignalKey === 'hv_battery_soc');
    expect(lv?.declaredSupport).toBe('LISTED');
    expect(lv?.empiricalObservation).toBe(VsiEmpiricalObservationStatus.NEVER_OBSERVED);
    expect(hv?.empiricalObservation).toBe(VsiEmpiricalObservationStatus.OBSERVED);
    expect(result.signals.find((s) => s.canonicalSignalKey === 'engine_rpm')?.empiricalObservation).toBe(
      VsiEmpiricalObservationStatus.NOT_APPLICABLE,
    );
    expect(
      result.signals.find((s) => s.canonicalSignalKey === 'fuel_level_relative')?.empiricalObservation,
    ).toBe(VsiEmpiricalObservationStatus.NOT_APPLICABLE);
    expect(result.profileLimitations).toContain('SOFTWARE_INTEGRATION_STRATIFICATION_ACTIVE');
  });

  it('missing catalog evidence yields UNKNOWN declared support', () => {
    const declared = {
      checkedAt: null,
      byNativeSignalName: new Map<string, VsiProviderCatalogStatus>(),
      limitations: ['NO_CACHED_PROVIDER_CATALOG_EVIDENCE'],
    };
    const result = evaluateVsiSignalProfile(
      {
        organizationId: 'org-1',
        vehicleId: 'veh-1',
        registryLifecycle: 'ACTIVE',
        hardwareTypeLegacy: 'UNKNOWN',
        link: baseLink,
        identity: hardwareIdentity,
        latestState: null,
        pollLogs: [],
        declaredCatalog: declared,
      },
      catalogResolver,
    );
    const lv = result.signals.find((s) => s.canonicalSignalKey === 'lv_voltage');
    expect(lv?.declaredSupport).toBe('UNKNOWN');
  });

  it('GPS position observed while LV absent in same VLS snapshot', () => {
    const ts = new Date('2026-10-15T10:00:00Z');
    const declared = {
      checkedAt: ts,
      byNativeSignalName: new Map<string, VsiProviderCatalogStatus>(),
      limitations: [],
    };
    const result = evaluateVsiSignalProfile(
      {
        organizationId: 'org-1',
        vehicleId: 'veh-1',
        registryLifecycle: 'ACTIVE',
        hardwareTypeLegacy: 'LTE_R1',
        link: baseLink,
        identity: hardwareIdentity,
        latestState: {
          vehicleId: 'veh-1',
          providerBindingId: 'link-1',
          providerSource: 'DIMO',
          lvBatteryVoltage: null,
          evSoc: null,
          online: true,
          sourceTimestamp: ts,
          providerFetchedAt: new Date(ts.getTime() + 1000),
          updatedAt: ts,
          rawPayloadJson: {
            currentLocationCoordinates: {
              value: { latitude: 50.1, longitude: 8.6 },
              timestamp: ts.toISOString(),
            },
          },
        },
        pollLogs: [],
        declaredCatalog: declared,
        projectionAsOf: new Date('2026-10-15T10:00:30Z'),
      },
      catalogResolver,
    );
    const pos = result.signals.find((s) => s.canonicalSignalKey === 'position_coordinates');
    const lv = result.signals.find((s) => s.canonicalSignalKey === 'lv_voltage');
    expect(pos?.empiricalObservation).toBe(VsiEmpiricalObservationStatus.OBSERVED);
    expect(lv?.empiricalObservation).toBe(VsiEmpiricalObservationStatus.NEVER_OBSERVED);
    expect(pos?.limitations).toContain('PER_SIGNAL_HISTORICAL_EVIDENCE_INSUFFICIENT');
  });

  it('accelerator pedal zero observed via empirical extractor', () => {
    const ts = new Date('2026-10-15T10:00:00Z');
    const declared = {
      checkedAt: ts,
      byNativeSignalName: new Map<string, VsiProviderCatalogStatus>(),
      limitations: [],
    };
    const result = evaluateVsiSignalProfile(
      {
        organizationId: 'org-1',
        vehicleId: 'veh-1',
        registryLifecycle: 'ACTIVE',
        hardwareTypeLegacy: 'LTE_R1',
        link: baseLink,
        identity: hardwareIdentity,
        latestState: {
          vehicleId: 'veh-1',
          providerBindingId: 'link-1',
          providerSource: 'DIMO',
          lvBatteryVoltage: 12.2,
          evSoc: null,
          online: true,
          sourceTimestamp: ts,
          providerFetchedAt: ts,
          updatedAt: ts,
          rawPayloadJson: {
            lowVoltageBatteryCurrentVoltage: { value: 12.2, timestamp: ts.toISOString() },
            powertrainCombustionEngineAcceleratorPedalPosition: { value: 0, timestamp: ts.toISOString() },
          },
        },
        pollLogs: [],
        declaredCatalog: declared,
        projectionAsOf: new Date('2026-10-15T10:00:30Z'),
      },
      catalogResolver,
    );
    const accel = result.signals.find((s) => s.canonicalSignalKey === 'accelerator_pedal_position');
    expect(accel?.empiricalObservation).toBe(VsiEmpiricalObservationStatus.OBSERVED);
  });

  describe('provider_last_successful_fetch meta signal (P1-b)', () => {
    const projectionAsOf = new Date('2026-10-30T12:00:00.000Z');
    const recentFetch = new Date('2026-10-30T11:59:30.000Z');
    const staleFetch = new Date('2026-10-20T12:00:00.000Z');

    function evaluateFetch(latestState: NonNullable<Parameters<typeof evaluateVsiSignalProfile>[0]['latestState']>) {
      const declared = {
        checkedAt: projectionAsOf,
        byNativeSignalName: new Map<string, VsiProviderCatalogStatus>(),
        limitations: [],
      };
      const draft = evaluateVsiSignalProfile(
        {
          organizationId: 'org-1',
          vehicleId: 'veh-1',
          registryLifecycle: 'ACTIVE',
          hardwareTypeLegacy: 'LTE_R1',
          link: baseLink,
          identity: hardwareIdentity,
          latestState,
          pollLogs: [],
          declaredCatalog: declared,
          projectionAsOf,
        },
        catalogResolver,
      );
      return enrichVsiProfileWithSignalFingerprints(draft, { bundleSourceTimestamps: [] });
    }

    it('recent successful fetch → OBSERVED + OBSERVED_FRESH without extractor limitation', () => {
      const profile = evaluateFetch({
        vehicleId: 'veh-1',
        providerBindingId: 'link-1',
        providerSource: 'DIMO',
        lvBatteryVoltage: null,
        evSoc: null,
        online: true,
        sourceTimestamp: recentFetch,
        providerFetchedAt: recentFetch,
        updatedAt: recentFetch,
        rawPayloadJson: {},
      });
      const row = profile.signals.find((s) => s.canonicalSignalKey === 'provider_last_successful_fetch');
      expect(row?.empiricalObservation).toBe(VsiEmpiricalObservationStatus.OBSERVED);
      expect(row?.qualityClassification).toBe(VsiSignalQualityClassification.OBSERVED_FRESH);
      expect(row?.freshnessClassification).toBe('FRESH');
      expect(row?.limitations).not.toContain(VSI_LIMITATION_EMPIRICAL_EXTRACTOR_NOT_IMPLEMENTED);
      expect(row?.limitations).toContain('PROVIDER_FETCH_TIME_NOT_SOURCE_ADVANCE_PROOF');
    });

    it('missing providerFetchedAt → NEVER_OBSERVED', () => {
      const profile = evaluateFetch({
        vehicleId: 'veh-1',
        providerBindingId: 'link-1',
        providerSource: 'DIMO',
        lvBatteryVoltage: null,
        evSoc: null,
        online: true,
        sourceTimestamp: null,
        providerFetchedAt: null,
        updatedAt: projectionAsOf,
        rawPayloadJson: {},
      });
      const row = profile.signals.find((s) => s.canonicalSignalKey === 'provider_last_successful_fetch');
      expect(row?.empiricalObservation).toBe(VsiEmpiricalObservationStatus.NEVER_OBSERVED);
      expect(row?.qualityClassification).toBe(VsiSignalQualityClassification.NEVER_OBSERVED);
    });

    it('stale fetch timestamp → OBSERVED_STALE', () => {
      const profile = evaluateFetch({
        vehicleId: 'veh-1',
        providerBindingId: 'link-1',
        providerSource: 'DIMO',
        lvBatteryVoltage: null,
        evSoc: null,
        online: true,
        sourceTimestamp: staleFetch,
        providerFetchedAt: staleFetch,
        updatedAt: staleFetch,
        rawPayloadJson: {},
      });
      const row = profile.signals.find((s) => s.canonicalSignalKey === 'provider_last_successful_fetch');
      expect(row?.qualityClassification).toBe(VsiSignalQualityClassification.OBSERVED_STALE);
      expect(row?.freshnessClassification).toBe('STALE');
    });

    it('physical vehicle_speed quality unchanged when fetch meta fixed', () => {
      const profile = evaluateFetch({
        vehicleId: 'veh-1',
        providerBindingId: 'link-1',
        providerSource: 'DIMO',
        lvBatteryVoltage: null,
        evSoc: null,
        online: true,
        sourceTimestamp: recentFetch,
        providerFetchedAt: recentFetch,
        updatedAt: recentFetch,
        rawPayloadJson: {
          speed: { value: 0, timestamp: recentFetch.toISOString() },
        },
      });
      const speed = profile.signals.find((s) => s.canonicalSignalKey === 'vehicle_speed');
      expect(speed?.empiricalObservation).toBe(VsiEmpiricalObservationStatus.OBSERVED);
      expect(speed?.qualityClassification).toBe(VsiSignalQualityClassification.OBSERVED_FRESH);
    });

    it('P0-a cohort vehicles: no cadence_provenance-style fetch quality bug', () => {
      for (const vehicle of VSI_P0A_DEFAULT_COHORT_V1.vehicles) {
        const profile = evaluateFetch({
          vehicleId: vehicle.vehicleId,
          providerBindingId: 'link-1',
          providerSource: 'DIMO',
          lvBatteryVoltage: 12.4,
          evSoc: vehicle.powertrainClass === 'EV' ? 80 : null,
          online: true,
          sourceTimestamp: recentFetch,
          providerFetchedAt: recentFetch,
          updatedAt: recentFetch,
          rawPayloadJson: {},
        });
        const row = profile.signals.find((s) => s.canonicalSignalKey === 'provider_last_successful_fetch');
        const finding = classifyVsiP0aSignalFinding({
          vehicle,
          canonicalSignal: 'provider_last_successful_fetch',
          applicability: 'UNKNOWN',
          declaredSupport: 'UNKNOWN',
          snapshotObservation: row?.empiricalObservation ?? null,
          snapshotQuality: row?.qualityClassification ?? null,
          snapshotConfidence: row?.confidenceLevel ?? null,
          hfAvailability: 'NOT_SUPPORTED_BY_PIPELINE',
          hfSampleCount: null,
          activeCadenceProfile: null,
          freshness: row?.freshnessClassification ?? null,
          provenance: row?.evidenceProvenance ?? [],
          limitations: row?.limitations ?? [],
          materializedInProfile: true,
        });
        expect(finding.findingClass).not.toBe('CONFIRMED_BUG');
        expect(finding.evidenceReference).not.toMatch(/observed_unknown_quality/);
      }
    });
  });
});
