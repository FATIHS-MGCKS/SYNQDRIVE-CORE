import { NotFoundException } from '@nestjs/common';
import { ProductSlug } from '@prisma/client';
import { BRAKE_HEALTH_CONSUMER_EXPORT } from '@modules/vehicle-intelligence/brakes/brake-health-consumer.tokens';
import { CoreBrakeReadV1Service } from './core-brake-read.v1.service';

describe('CoreBrakeReadV1Service', () => {
  const prisma = {
    vehicle: {
      findFirst: jest.fn(),
    },
  };
  const brakeHealth = {
    getSummary: jest.fn(),
  };

  let service: CoreBrakeReadV1Service;

  beforeEach(() => {
    jest.resetAllMocks();
    service = new CoreBrakeReadV1Service(prisma as never, brakeHealth as never);
  });

  it('binds organization before getSummary with syncAlerts:false', async () => {
    prisma.vehicle.findFirst.mockResolvedValue({ id: 'v1', organizationId: 'org-1' });
    brakeHealth.getSummary.mockResolvedValue({
      isInitialized: false,
      stateClass: 'NO_BASELINE',
      modeledComponents: {
        frontPads: false,
        rearPads: false,
        frontDiscs: false,
        rearDiscs: false,
        hasAnyPads: false,
        hasAnyDiscs: false,
        hasAnyModeled: false,
      },
      modelCoverage: {
        distanceSinceAnchorKm: null,
        modeledDistanceKm: null,
        modeledTripCount: 0,
        coverageRatio: null,
        coverageRatioRaw: null,
        underCoverageKm: null,
        overCoverageKm: null,
        coverageStatus: 'UNKNOWN',
        hasGap: false,
        reconciliationRequired: false,
        source: 'NOT_ENOUGH_DATA',
      },
      baselineWarnings: [],
      provenanceWarnings: [],
      overallCondition: 'UNKNOWN',
      dataBasis: 'UNKNOWN',
      confidenceLevel: 'UNKNOWN',
      frontAxle: {
        condition: 'UNKNOWN',
        dataBasis: 'UNKNOWN',
        confidence: 'UNKNOWN',
        estimatedRemainingKmMin: null,
        estimatedRemainingKmMax: null,
      },
      rearAxle: {
        condition: 'UNKNOWN',
        dataBasis: 'UNKNOWN',
        confidence: 'UNKNOWN',
        estimatedRemainingKmMin: null,
        estimatedRemainingKmMax: null,
      },
      frontAxleCondition: 'UNKNOWN',
      rearAxleCondition: 'UNKNOWN',
      frontDataBasis: 'UNKNOWN',
      rearDataBasis: 'UNKNOWN',
      frontConfidence: 'UNKNOWN',
      rearConfidence: 'UNKNOWN',
      estimatedFrontRemainingKmMin: null,
      estimatedFrontRemainingKmMax: null,
      estimatedRearRemainingKmMin: null,
      estimatedRearRemainingKmMax: null,
      nextInspectionRecommendedInKm: null,
      estimatedReplacementDueInKm: null,
      reasons: [],
      recommendations: [],
      alerts: [],
      openAlerts: [],
      lastMeasurementAt: null,
      lastMeasurementMileageKm: null,
      lastServiceAt: null,
      lastServiceMileageKm: null,
      updatedAt: null,
      legacy: {
        padsHealthPct: null,
        discsHealthPct: null,
        padsRemainingKm: null,
        discsRemainingKm: null,
        status: 'awaiting_baseline',
        remainingKm: null,
      },
      componentThresholds: [],
    });

    await service.getForVehicle('org-1', 'v1', ProductSlug.RENTAL);

    expect(prisma.vehicle.findFirst).toHaveBeenCalledWith({
      where: { id: 'v1', organizationId: 'org-1' },
      select: { id: true, organizationId: true },
    });
    expect(brakeHealth.getSummary).toHaveBeenCalledWith('v1', { syncAlerts: false });
  });

  it('throws 404 for cross-org vehicle', async () => {
    prisma.vehicle.findFirst.mockResolvedValue(null);
    await expect(service.getForVehicle('org-1', 'v1', ProductSlug.RENTAL)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(brakeHealth.getSummary).not.toHaveBeenCalled();
  });
});

describe('CoreBrakeReadV1Service — token wiring', () => {
  it('uses BRAKE_HEALTH_CONSUMER_EXPORT symbol', () => {
    expect(BRAKE_HEALTH_CONSUMER_EXPORT).toBeDefined();
  });
});