import { Injectable, Optional } from '@nestjs/common';
import { TripMetricsService } from '@modules/observability/trip-metrics.service';

@Injectable()
export class ApdsV3ShadowMetricsService {
  constructor(@Optional() private readonly tripMetrics?: TripMetricsService) {}

  recordDecision(decision: string): void {
    this.tripMetrics?.apdsV3ShadowDecisionTotal?.inc({ decision });
  }

  recordEligibilityBlocked(reason: string): void {
    this.tripMetrics?.apdsV3ShadowEligibilityBlockedTotal?.inc({ reason });
  }

  recordWriteSuppressed(reason: string): void {
    this.tripMetrics?.apdsV3ShadowWriteSuppressedTotal?.inc({ reason });
  }

  setRuntimeReady(ready: boolean): void {
    this.tripMetrics?.apdsV3ShadowRuntimeReady?.set(ready ? 1 : 0);
  }
}
