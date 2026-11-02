import { TireOdometerAnchorStatus } from '@prisma/client';
import { TireHealthV3ReadService } from './tire-health-v3-read.service';
import type { TireHealthSummary } from './tire-health.service';
import { mapV3SetupToCustomerRead } from './tire-health-v3-read.adapter';
import type { TireWearV3PriorSetupResult } from './wear-v3-prior/tire-wear-v3-prior.types';

export function minimalPriorResult(): TireWearV3PriorSetupResult {
  return {
    tireSetupId: 'setup-1',
    vehicleId: 'veh-1',
    organizationId: 'org-1',
    modelVersion: '0.2.0',
    modelConfigHash: 'hash',
    inputFingerprint: 'fp',
    computedAt: '2026-10-27T12:00:00.000Z',
    odometerAnchorKm: 10000,
    odometerAnchorStatus: TireOdometerAnchorStatus.ANCHORED,
    currentOdometerKm: 12000,
    ledgerDistanceKm: 2000,
    ledgerRowCount: 1,
    dynamicBeta: 0,
    ds4SeverityCoverage: 0,
    ds4SeveritySRel: null,
    rated: true,
    setupFlags: [],
    wheels: [
      {
        position: 'FL',
        initialTreadMm: 8,
        initialTreadUsedDefaultFallback: false,
        replacementThresholdMm: 3,
        distanceSinceAnchorKm: 2000,
        estimatedTreadMm: null,
        estimatedWearMm: null,
        displayTreadMm: null,
        pointEstimateTreadMm: null,
        treadEvidenceClass: 'INSUFFICIENT',
        remainingKm: { lo: 0, hi: 0 },
        wearRate: {
          mmPerKm: { lo: 0, hi: 0 },
          mmPer1000km: { lo: 0, hi: 0 },
          source: 'measurement_fused',
          modelUncertaintyMmPerKm: { lo: 0.0001, hi: 0.0002 },
          measurementUncertaintyMmPerKm: null,
          flags: [],
        },
        evidenceLevel: 'L0',
        dynamicFactor: {
          factor: 1,
          coverage: 0,
          sRel: null,
          applied: false,
          appliedToRateLo: false,
        },
        flags: [],
      },
    ],
    verification: {
      status: 'INSUFFICIENT_EVIDENCE',
      kmSinceAcceptedMeasurement: null,
      daysSinceAcceptedMeasurement: null,
      nextDueOdometerKm: null,
      acceptedMeasurementId: null,
      acceptedMeasurementAt: null,
      acceptedOdometerKm: null,
      wheels: [],
      qualityFlags: [],
    },
    qualityFlags: [],
  } as unknown as TireWearV3PriorSetupResult;
}

export function baseSummary(): TireHealthSummary {
  return {
    overallPercent: 80,
    overallRemainingKm: 10000,
    healthStatus: 'GOOD',
    confidenceScore: 70,
    confidenceLabel: 'High',
    worstTirePosition: null,
    worstTirePercent: null,
    activeSetupName: 'Summer',
    activeSetupId: 'setup-1',
    tireSeason: 'SUMMER',
    installedAt: null,
    totalKmOnSet: 0,
    wearRateMmPer1000km: null,
    alerts: [],
    evidencePresentation: { treadLines: [], pressureLines: [], modelLines: [], specLines: [] },
    dimoContext: {} as TireHealthSummary['dimoContext'],
    hasActiveSet: true,
    hasSetups: true,
    hasMeasurements: false,
    overallStatus: 'GOOD',
    displayMode: 'ESTIMATED',
    confidence: 'MEDIUM',
    pressureContext: {} as TireHealthSummary['pressureContext'],
  } as unknown as TireHealthSummary;
}

describe('TireHealthV3ReadService', () => {
  it('computeCustomerRead uses persistShadow false (no shadow dual-write)', async () => {
    const computeForSetup = jest.fn().mockResolvedValue(minimalPriorResult());
    const config = {
      get: () => ({ customerReadEnabled: true, customerReadAuthoritative: false }),
    };
    const svc = new TireHealthV3ReadService(config as never, {
      computeForSetup,
    } as never);
    const read = await svc.computeCustomerRead('setup-1');
    expect(computeForSetup).toHaveBeenCalledWith('setup-1', { persistShadow: false });
    expect(read?.insufficientEvidence).toBe(true);
  });

  it('enrichSummary keeps V2 overallStatus when not authoritative', async () => {
    const computeForSetup = jest.fn().mockResolvedValue(minimalPriorResult());
    const config = {
      get: () => ({ customerReadEnabled: true, customerReadAuthoritative: false }),
    };
    const svc = new TireHealthV3ReadService(config as never, {
      computeForSetup,
    } as never);
    const summary = baseSummary();
    const enriched = await svc.enrichSummary(summary, 'setup-1', 'SUMMER', []);
    expect(enriched.overallStatus).toBe('GOOD');
    expect(enriched.wearV3).toBeDefined();
    expect(enriched.wearReadModel).toBe('v2');
  });

  it('does not activate V3 when only authoritative flag is set', async () => {
    const computeForSetup = jest.fn().mockResolvedValue(minimalPriorResult());
    const config = {
      get: () => ({ customerReadEnabled: false, customerReadAuthoritative: true }),
    };
    const svc = new TireHealthV3ReadService(config as never, {
      computeForSetup,
    } as never);
    expect(svc.isCustomerReadEnabled()).toBe(false);
    expect(svc.isCustomerReadAuthoritative()).toBe(false);
    const read = await svc.computeCustomerRead('setup-1');
    expect(read).toBeNull();
    expect(computeForSetup).not.toHaveBeenCalled();
  });

  it('authoritative mode maps insufficient evidence to UNKNOWN display', async () => {
    const computeForSetup = jest.fn().mockResolvedValue(minimalPriorResult());
    const config = {
      get: () => ({ customerReadEnabled: true, customerReadAuthoritative: true }),
    };
    const svc = new TireHealthV3ReadService(config as never, {
      computeForSetup,
    } as never);
    const summary = baseSummary();
    const enriched = await svc.enrichSummary(summary, 'setup-1', 'SUMMER', []);
    expect(enriched.wearReadModel).toBe('v3');
    expect(enriched.displayMode).toBe('UNKNOWN');
    expect(enriched.lowestTreadMm).toBeNull();
  });

  it('authoritative mode fail-closed when compute returns null', async () => {
    const computeForSetup = jest.fn().mockResolvedValue(null);
    const config = {
      get: () => ({ customerReadEnabled: true, customerReadAuthoritative: true }),
    };
    const svc = new TireHealthV3ReadService(config as never, {
      computeForSetup,
    } as never);
    const legacy = baseSummary();
    const enriched = await svc.enrichSummary(legacy, 'setup-1', 'SUMMER', []);
    expect(enriched.wearReadModel).toBe('v3');
    expect(enriched.overallStatus).toBe('UNKNOWN');
    expect(enriched.displayMode).toBe('UNKNOWN');
    expect(enriched.overallStatus).not.toBe(legacy.overallStatus);
  });
});

describe('mapV3SetupToCustomerRead', () => {
  it('does not fabricate tread intervals when evidence insufficient', () => {
    const read = mapV3SetupToCustomerRead(minimalPriorResult());
    expect(read.wheels[0].treadDepthMm).toBeNull();
    expect(read.insufficientEvidence).toBe(true);
  });
});
