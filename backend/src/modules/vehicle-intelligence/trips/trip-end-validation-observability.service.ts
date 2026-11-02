import { Injectable, Logger, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import type { TripMetricsService } from '../../observability/trip-metrics.service';
import { isTripEndValidationObservabilityEnabledForVehicle } from './trip-end-validation-observability.config';
import {
  buildTripEndValidationObservationRow,
  resolveEndConfirmationSourceForMode,
} from './trip-end-validation-observability.domain';
import type { TripEndValidationObservationInput } from './trip-end-validation-observability.types';

@Injectable()
export class TripEndValidationObservabilityService {
  private readonly logger = new Logger(TripEndValidationObservabilityService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly tripMetrics?: TripMetricsService,
  ) {}

  isEnabledForVehicle(vehicleId: string): boolean {
    return isTripEndValidationObservabilityEnabledForVehicle(vehicleId);
  }

  async record(input: TripEndValidationObservationInput): Promise<'inserted' | 'skipped' | 'duplicate'> {
    if (!this.isEnabledForVehicle(input.vehicleId)) {
      return 'skipped';
    }

    const endConfirmationSource =
      input.endConfirmationSource ??
      resolveEndConfirmationSourceForMode({
        endDetectionMode: input.endDetectionMode,
        processPhase: input.processPhase,
        decisionOutcome: input.decisionOutcome,
      });

    const row = buildTripEndValidationObservationRow({
      ...input,
      endConfirmationSource,
    });

    const started = Date.now();
    try {
      await this.prisma.tripEndValidationDecisionObservation.create({ data: row });
      this.emitMetrics(input, endConfirmationSource, 'success');
      this.observeDecisionLatency(input, started);
      return 'inserted';
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        return 'duplicate';
      }
      this.emitMetrics(input, endConfirmationSource, 'failure');
      throw err;
    }
  }

  private emitMetrics(
    input: TripEndValidationObservationInput,
    endConfirmationSource: string | null,
    writeResult: 'success' | 'failure',
  ): void {
    try {
      if (writeResult === 'failure') {
        this.tripMetrics?.tripEndValidationObservabilityWriteFailures.inc({
          phase: input.processPhase,
        });
        return;
      }
      this.tripMetrics?.tripEndValidationDecisionTotal.inc({
        outcome: input.decisionOutcome,
        end_mode: input.endDetectionMode ?? 'unknown',
        confirmation_source: endConfirmationSource ?? 'none',
      });
      if (input.decisionOutcome === 'CUSUM_INCONCLUSIVE_RETRY') {
        this.tripMetrics?.tripEndValidationCusumOutcomeTotal.inc({
          cusum_outcome: 'inconclusive',
        });
      }
      if (input.decisionOutcome === 'CUSUM_VALIDATED') {
        this.tripMetrics?.tripEndValidationCusumOutcomeTotal.inc({
          cusum_outcome: 'validated',
        });
      }
      if (input.decisionOutcome === 'CUSUM_STILL_ONGOING_REOPEN') {
        this.tripMetrics?.tripEndValidationCusumOutcomeTotal.inc({
          cusum_outcome: 'still_ongoing',
        });
      }
      if (input.decisionOutcome === 'CLICKHOUSE_END_ASSIST_CONFIRMED') {
        this.tripMetrics?.tripEndValidationClickHouseAssistTotal.inc({
          assist_outcome: 'confirmed',
        });
      }
      if (
        input.decisionOutcome === 'COMPOSITE_MAX_ATTEMPT_FALLBACK' &&
        input.retryCount != null &&
        input.retryBudgetMax != null &&
        input.retryCount >= input.retryBudgetMax
      ) {
        this.tripMetrics?.tripEndValidationRetryExhaustionTotal.inc({
          end_mode: 'COMPOSITE_INACTIVITY',
        });
      }
    } catch {
      // Metrics must never propagate.
    }
  }

  private observeDecisionLatency(
    input: TripEndValidationObservationInput,
    persistStartedMs: number,
  ): void {
    try {
      const canonical = input.canonicalEndBoundaryAt ?? input.eventTimeAt;
      if (!canonical) return;
      const lagSec =
        (input.workerDecisionAt.getTime() - canonical.getTime()) / 1000;
      if (!Number.isFinite(lagSec) || lagSec < 0) return;
      this.tripMetrics?.tripEndValidationDecisionLatencySeconds.observe(
        {
          outcome: input.decisionOutcome,
          phase: input.processPhase,
        },
        lagSec,
      );
      void persistStartedMs;
    } catch {
      // Non-blocking.
    }
  }
}
