import { TripDiBoundaryAdmissionRecoveryFleetBudget } from '../trip-di-boundary-admission-recovery.fleet-budget';

describe('TripDiBoundaryAdmissionRecoveryFleetBudget', () => {
  it('shares remaining attempts across vehicles in one scheduler cycle', () => {
    const budget = new TripDiBoundaryAdmissionRecoveryFleetBudget(3);
    expect(budget.consume(2)).toBe(2);
    expect(budget.consume(2)).toBe(1);
    expect(budget.consume(1)).toBe(0);
    expect(budget.remainingAttempts).toBe(0);
  });
});
