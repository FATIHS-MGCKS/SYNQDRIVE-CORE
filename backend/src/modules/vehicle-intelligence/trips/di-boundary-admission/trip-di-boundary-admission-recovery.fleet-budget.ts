/** Shared admission-recovery attempt budget for one leader scheduler cycle. */
export class TripDiBoundaryAdmissionRecoveryFleetBudget {
  private remaining: number;

  constructor(initial: number) {
    this.remaining = Math.max(0, initial);
  }

  get remainingAttempts(): number {
    return this.remaining;
  }

  /** Returns how many writer attempts may proceed (0 when exhausted). */
  consume(maxRequested: number): number {
    if (this.remaining <= 0 || maxRequested <= 0) return 0;
    const granted = Math.min(this.remaining, maxRequested);
    this.remaining -= granted;
    return granted;
  }
}
