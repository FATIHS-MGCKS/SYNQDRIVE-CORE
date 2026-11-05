import { OneAutoProviderJobStatus } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';
import {
  assertOeServiceHistoryEuJobBinding,
  parseOeServiceHistoryEuProviderResult,
} from './oneauto-service-history-eu-provider.util';
import { ONEAUTO_OE_SERVICE_HISTORY_EU_SERVICE_SKU } from './oneauto-service-history-eu.types';
import { mapOneAutoOeServiceHistoryEuEvent } from './oneauto-oe-service-history-eu-event.mapper';
import {
  buildOneAutoOeServiceHistoryEuJobSourceEventKey,
  buildOneAutoOeServiceHistoryEuVehicleHistoricalEventKey,
} from './oneauto-oe-service-history-eu-event-identity.util';
import { pickPersistedOeServiceHistoryEuSuccessPayload } from './oneauto-oe-service-history-eu-response.util';

export type BackfillDryRunPlan = {
  providerJobId: string;
  organizationId: string;
  vehicleId: string;
  vinSnapshot: string;
  providerEventsExpected: number;
  importEventsExpected: number;
  events: Array<{
    index: number;
    date: string | null;
    workshop: string | null;
    serviceType: string | null;
    actions: string[];
    mapOk: boolean;
    mapReason?: string;
    vehicleHistoricalEventKey?: string;
  }>;
  validationErrors: string[];
};

export async function buildOneAutoOeServiceHistoryEuBackfillDryRunPlan(
  prisma: PrismaClient,
  input: {
    organizationId?: string;
    vehicleId?: string;
    providerJobId?: string;
    limit?: number;
  },
): Promise<BackfillDryRunPlan[]> {
  const limit = Math.min(Math.max(input.limit ?? 25, 1), 200);
  const jobs = await prisma.oneAutoProviderJob.findMany({
    where: {
      serviceSku: ONEAUTO_OE_SERVICE_HISTORY_EU_SERVICE_SKU,
      status: OneAutoProviderJobStatus.SUCCEEDED,
      ...(input.providerJobId ? { id: input.providerJobId } : {}),
      ...(input.organizationId ? { organizationId: input.organizationId } : {}),
      ...(input.vehicleId ? { vehicleId: input.vehicleId } : {}),
    },
    orderBy: { updatedAt: 'desc' },
    take: limit,
    include: {
      responses: { orderBy: { fetchedAt: 'desc' }, take: 12 },
    },
  });

  const plans: BackfillDryRunPlan[] = [];
  for (const job of jobs) {
    const validationErrors: string[] = [];
    const vehicle = await prisma.vehicle.findFirst({
      where: { id: job.vehicleId, organizationId: job.organizationId },
      select: { vin: true },
    });
    if (!vehicle?.vin) {
      validationErrors.push('vehicle_binding_missing');
    }
    const payload = pickPersistedOeServiceHistoryEuSuccessPayload(job.responses);
    if (!payload) {
      validationErrors.push('no_success_response');
      plans.push({
        providerJobId: job.id,
        organizationId: job.organizationId,
        vehicleId: job.vehicleId,
        vinSnapshot: job.vinSnapshot,
        providerEventsExpected: 0,
        importEventsExpected: 0,
        events: [],
        validationErrors,
      });
      continue;
    }
    const binding = assertOeServiceHistoryEuJobBinding({
      serviceSku: job.serviceSku,
      jobVinSnapshot: job.vinSnapshot,
      vehicleVin: vehicle?.vin ?? null,
      providerResponseBody: { success: true, result: payload.providerResult },
    });
    if (!binding.ok) {
      validationErrors.push(binding.code);
    }
    const parsed = parseOeServiceHistoryEuProviderResult(payload.providerResult);
    if (parsed.kind === 'INVALID_SHAPE') {
      validationErrors.push(`invalid_shape_${parsed.reason}`);
    }
    const eventsRaw =
      parsed.kind === 'SUCCESS_WITH_EVENTS'
        ? parsed.serviceEvents
        : parsed.kind === 'SUCCESS_EMPTY_HISTORY'
          ? []
          : [];
    const events = eventsRaw.map((rawEvent, index) => {
      const mapped = mapOneAutoOeServiceHistoryEuEvent(rawEvent);
      const vehicleKey =
        binding.ok && mapped.ok
          ? buildOneAutoOeServiceHistoryEuVehicleHistoricalEventKey({
              normalizedVin: binding.normalizedVin,
              event: rawEvent,
            })
          : undefined;
      return {
        index,
        date:
          typeof rawEvent.date_of_service_event === 'string'
            ? rawEvent.date_of_service_event
            : null,
        workshop:
          typeof rawEvent.service_provider === 'string' ? rawEvent.service_provider : null,
        serviceType: typeof rawEvent.service_type === 'string' ? rawEvent.service_type : null,
        actions: Array.isArray(rawEvent.service_actions)
          ? rawEvent.service_actions.map((a) => String(a))
          : [],
        mapOk: mapped.ok,
        mapReason: mapped.ok ? undefined : mapped.reason,
        vehicleHistoricalEventKey: vehicleKey,
      };
    });
    const importEventsExpected = events.filter((e) => e.mapOk).length;
    plans.push({
      providerJobId: job.id,
      organizationId: job.organizationId,
      vehicleId: job.vehicleId,
      vinSnapshot: job.vinSnapshot,
      providerEventsExpected: eventsRaw.length,
      importEventsExpected,
      events,
      validationErrors,
    });
  }
  return plans;
}

export async function reconcileOneAutoOeServiceHistoryEuJobs(
  prisma: PrismaClient,
  ingest: (providerJobId: string) => Promise<unknown>,
  input: {
    organizationId?: string;
    vehicleId?: string;
    providerJobId?: string;
    limit?: number;
  },
): Promise<{ scanned: number; attempted: number }> {
  const plans = await buildOneAutoOeServiceHistoryEuBackfillDryRunPlan(prisma, input);
  let attempted = 0;
  for (const plan of plans) {
    attempted += 1;
    await ingest(plan.providerJobId);
  }
  return { scanned: plans.length, attempted };
}
