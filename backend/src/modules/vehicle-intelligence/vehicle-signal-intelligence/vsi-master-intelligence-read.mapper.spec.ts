import { mapProfileRowToDetail, mapProfileRowToSummary } from './vsi-master-intelligence-read.mapper';

describe('vsi-master-intelligence-read.mapper', () => {
  it('masks OPEN_TRIP blocker and does not present stale LV as current', () => {
    const summary = mapProfileRowToSummary(
      {
        providerSourceLinkId: 'link-1',
        providerIdentity: 'dimo:abc',
        profileRevision: 3,
        profileContractVersion: 'vsi-signal-profile-v2',
        evaluatedAt: new Date('2026-10-28T10:00:00.000Z'),
        lastMaterializedSourceTimestamp: new Date('2026-10-28T09:00:00.000Z'),
        lastMaterializedProviderFetchAt: new Date('2026-10-28T09:05:00.000Z'),
        profileLimitations: ['OPEN_TRIP_BLOCKS_STANDBY_CLASSIFICATION'],
        contentFingerprint: 'abcdef1234567890',
        signalsSnapshot: [
          {
            canonicalSignalKey: 'lv_voltage',
            providerNativeSignalName: 'lv',
            declaredSupport: 'LISTED',
            empiricalObservation: 'OBSERVED',
            cadenceIntelligence: {
              lvStandbyTransmissionProfile: {
                profile: 'LV_8H_OBSERVED',
                classificationDecisionCode: 'LV_8H',
                evidenceConfidence: 'HIGH',
                limitations: [],
              },
            },
          },
        ],
      } as never,
      'DIMO',
    );
    expect(summary.lvStandbyProfile).toBe('UNKNOWN');
    expect(summary.evaluationBlocked).toBe(true);
    expect(summary.evaluationBlockedCodes).toContain('OPEN_TRIP_BLOCKS_STANDBY_CLASSIFICATION');
  });

  it('maps engine_rpm combined evidence for Audi-shaped dual lane profile', () => {
    const detail = mapProfileRowToDetail(
      {
        providerSourceLinkId: 'link-audi',
        providerIdentity: 'dimo:audi',
        profileRevision: 2,
        profileContractVersion: 'vsi-signal-profile-v2',
        evaluatedAt: new Date('2026-10-29T22:21:14.704Z'),
        lastMaterializedSourceTimestamp: new Date('2026-10-29T17:32:37.000Z'),
        lastMaterializedProviderFetchAt: new Date('2026-10-29T22:21:14.621Z'),
        profileLimitations: [],
        contentFingerprint: 'abcdef1234567890',
        signalsSnapshot: [
          {
            canonicalSignalKey: 'engine_rpm',
            providerNativeSignalName: 'powertrainCombustionEngineSpeed',
            declaredSupport: 'UNKNOWN',
            empiricalObservation: 'NEVER_OBSERVED',
            qualityClassification: 'NEVER_OBSERVED',
            confidenceLevel: 'LOW',
            lastValidObservationAt: null,
            lastSourceTimestamp: null,
            freshnessClassification: 'UNKNOWN',
            evidenceProvenance: ['VEHICLE_LATEST_STATE'],
            limitations: [],
            powertrainApplicability: 'APPLICABLE',
            cadenceIntelligence: {
              provenance: ['CLICKHOUSE_TELEMETRY_HF_POINTS'],
              observedSampleCount: 2076,
              finalizedTripCount: 20,
              activeRpmProfile: {
                activeProfile: 'RPM_STANDARD',
                tripClassifications: [{ tripId: 't1' }],
              },
              limitations: [],
            },
          },
        ],
      } as never,
      'DIMO',
    );
    const rpm = detail.signals.find((s) => s.canonicalSignalKey === 'engine_rpm');
    expect(rpm?.empiricalObservation).toBe('NEVER_OBSERVED');
    expect(rpm?.rpmCombinedEvidenceAvailabilityV1).toBe('PROVEN_HISTORICAL_ONLY');
    expect(rpm?.rpmCombinedEvidenceContractV1).toBe('vsi-rpm-combined-evidence-v1');
    expect(detail.rpmActiveProfile).toBe('RPM_STANDARD');
  });
});
