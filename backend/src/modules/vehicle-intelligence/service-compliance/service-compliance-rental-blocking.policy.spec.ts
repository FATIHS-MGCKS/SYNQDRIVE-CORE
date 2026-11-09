import {
  evaluateServiceComplianceRentalBlocking,
  isHmServiceOverdue,
} from './service-compliance-rental-blocking.policy';
import type { ServiceComplianceEvaluation } from './service-compliance.types';

function baseEvaluation(
  overrides: Partial<ServiceComplianceEvaluation> = {},
): ServiceComplianceEvaluation {
  return {
    nextService: {
      trackingStatus: 'TRACKED',
      source: 'HM_OEM',
      distanceToNextServiceKm: 5000,
      timeToNextServiceDays: 90,
      lastUpdatedAt: '2026-08-01T00:00:00.000Z',
      serviceSourceLabel: 'HM',
      severity: 'GOOD',
      blocksRental: false,
      title: 'OK',
      description: 'OK',
      message: 'OK',
      hmDistanceFromOem: false,
      hmTimeFromOem: false,
      hmDerivedDueDate: null,
      ...overrides.nextService,
    },
    tuvBokraft: {
      tuvValidTill: '2027-01-01T00:00:00.000Z',
      tuvRemainingMonths: 12,
      tuvRemainingDays: 365,
      tuvOverdue: false,
      tuvLastDate: null,
      bokraftValidTill: '2027-01-01T00:00:00.000Z',
      bokraftRemainingMonths: 12,
      bokraftRemainingDays: 365,
      bokraftOverdue: false,
      bokraftLastDate: null,
      ...overrides.tuvBokraft,
    },
  };
}

describe('service-compliance-rental-blocking.policy', () => {
  it('flags TÜV overdue as rental-blocking', () => {
    const decision = evaluateServiceComplianceRentalBlocking(
      baseEvaluation({
        tuvBokraft: { tuvOverdue: true, tuvRemainingDays: -3 } as any,
      }),
    );
    expect(decision.tuvOverdue).toBe(true);
    expect(decision.serviceOverdue).toBe(false);
    expect(decision.serviceOverdueBlocksRental).toBe(false);
  });

  it('flags BOKraft overdue as rental-blocking', () => {
    const decision = evaluateServiceComplianceRentalBlocking(
      baseEvaluation({
        tuvBokraft: { bokraftOverdue: true, bokraftRemainingDays: -2 } as any,
      }),
    );
    expect(decision.bokraftOverdue).toBe(true);
  });

  it('flags HM service CRITICAL as overdue and rental-blocking when TÜV/BOKraft are not overdue', () => {
    const evaluation = baseEvaluation({
      nextService: {
        severity: 'CRITICAL',
        timeToNextServiceDays: -10,
        distanceToNextServiceKm: -100,
      } as any,
    });
    expect(isHmServiceOverdue(evaluation)).toBe(true);
    const decision = evaluateServiceComplianceRentalBlocking(evaluation);
    expect(decision.serviceOverdue).toBe(true);
    expect(decision.serviceOverdueBlocksRental).toBe(true);
  });

  it('does not mark service overdue for HM service WARNING / due soon', () => {
    const evaluation = baseEvaluation({
      nextService: {
        severity: 'WARNING',
        timeToNextServiceDays: 10,
        distanceToNextServiceKm: 200,
      } as any,
    });
    expect(isHmServiceOverdue(evaluation)).toBe(false);
    const decision = evaluateServiceComplianceRentalBlocking(evaluation);
    expect(decision.serviceOverdue).toBe(false);
    expect(decision.serviceOverdueBlocksRental).toBe(false);
  });

  it('does not treat computed CRITICAL forecast as HM operational overdue', () => {
    const evaluation = baseEvaluation({
      nextService: {
        source: 'COMPUTED_MANUAL_INTERVAL',
        severity: 'CRITICAL',
        timeToNextServiceDays: -10,
        distanceToNextServiceKm: -100,
      } as any,
    });
    expect(isHmServiceOverdue(evaluation)).toBe(false);
    const decision = evaluateServiceComplianceRentalBlocking(evaluation);
    expect(decision.serviceOverdue).toBe(false);
    expect(decision.serviceOverdueBlocksRental).toBe(false);
  });

  it('keeps serviceOverdue true but deduplicates rental blocking when TÜV is already overdue', () => {
    const evaluation = baseEvaluation({
      nextService: { severity: 'CRITICAL', timeToNextServiceDays: -5 } as any,
      tuvBokraft: { tuvOverdue: true, tuvRemainingDays: -5 } as any,
    });
    const decision = evaluateServiceComplianceRentalBlocking(evaluation);
    expect(decision.serviceOverdue).toBe(true);
    expect(decision.serviceOverdueBlocksRental).toBe(false);
  });
});
