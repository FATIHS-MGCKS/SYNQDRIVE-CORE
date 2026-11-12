import { Injectable, Logger, Optional, Inject } from '@nestjs/common';
import { DrivingAnalysisInitService } from './driving-analysis-init.service';
import type { TripAnalysisInitResult, TripAnalysisInitSource } from './driving-analysis-init.types';
import { EventTripAssociationService } from '../trips/event-association/event-trip-association.service';
import {
  TRIP_RENTAL_RECOMPUTE_PORT,
  type TripRentalRecomputePort,
} from '../trips/ports/trip-rental-recompute.port';

/**
 * Post-finalize producer — awaited durable analysis init only after persisted COMPLETED trip.
 * Legacy enrichment queues remain separate until fully replaced.
 */
@Injectable()
export class TripPostFinalizeAnalysisProducer {
  private readonly logger = new Logger(TripPostFinalizeAnalysisProducer.name);

  constructor(
    private readonly analysisInit: DrivingAnalysisInitService,
    @Optional()
    @Inject(TRIP_RENTAL_RECOMPUTE_PORT)
    private readonly rentalRecompute?: TripRentalRecomputePort,
    @Optional()
    private readonly tripAssociation?: EventTripAssociationService,
  ) {}

  async produceAfterPersistedCompletion(input: {
    tripId: string;
    vehicleId: string;
    organizationId: string | null;
    source: TripAnalysisInitSource;
  }): Promise<TripAnalysisInitResult | null> {
    // Runs before analysis init so downstream stages observe the converged
    // association. Orphan events are attached to the now-canonical trip window;
    // repeated runs are no-ops and existing associations are never overwritten.
    await this.reconcileEventAssociations(input.tripId);

    if (!input.organizationId) {
      this.logger.warn(
        `Skip durable analysis init — missing organizationId for trip ${input.tripId}`,
      );
      return null;
    }

    try {
      const result = await this.analysisInit.initializeForCompletedTrip({
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        tripId: input.tripId,
        source: input.source,
      });

      if (result.queueErrors.length > 0) {
        this.logger.warn(
          `Durable analysis init queue errors trip=${input.tripId} source=${input.source}: ` +
            result.queueErrors.join('; '),
        );
      }

      void this.rentalRecompute
        ?.notifyTripCompleted({
          organizationId: input.organizationId,
          vehicleId: input.vehicleId,
          tripId: input.tripId,
        })
        .catch((err) => {
          const message = err instanceof Error ? err.message : String(err);
          this.logger.warn(
            `Rental analysis recompute enqueue failed trip=${input.tripId}: ${message}`,
          );
        });

      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `Durable analysis init failed trip=${input.tripId} source=${input.source}: ${message}`,
      );
      return {
        runId: 'unknown',
        runCreated: false,
        runDeduplicated: false,
        jobs: [],
        queueErrors: [message],
      };
    }
  }

  /**
   * Best-effort: an association failure must never block trip finalization or
   * analysis init. The bounded delayed sweep in TripReconciliationService picks
   * up anything missed here.
   */
  private async reconcileEventAssociations(tripId: string): Promise<void> {
    if (!this.tripAssociation) return;

    try {
      await this.tripAssociation.reconcileFinalizedTrip({ tripId });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `Event trip association reconciliation failed trip=${tripId}: ${message}`,
      );
    }
  }
}
