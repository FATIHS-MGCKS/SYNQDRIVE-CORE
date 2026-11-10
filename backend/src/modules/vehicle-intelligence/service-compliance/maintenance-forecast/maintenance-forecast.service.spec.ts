import { MaintenanceForecastService } from './maintenance-forecast.service';
import { EVIDENCE_MAX_EVENTS } from './evidence-loader.util';
import { SERVICE_HISTORY_EVENT_TYPES } from '../../service-events/service-events.constants';

const NOW = new Date('2026-11-08T12:00:00.000Z');

function buildRows(total: number, proofIndex: number) {
  const rows = Array.from({ length: total }, (_, i) => ({
    id: i === proofIndex ? 'oil-proof' : `noise-${i}`,
    eventType: i === proofIndex ? 'OIL_CHANGE' : 'TIRE_ROTATION',
    eventDate: new Date(Date.UTC(2020 + (i % 5), 0, 1 + (i % 28))),
    odometerKm: 20_000 + i,
    origin: 'MANUAL',
    sourcePayloadJson:
      i === proofIndex ? { service_actions: ['Engine oil and filter replaced'] } : null,
  }));
  return rows.sort((a, b) => b.eventDate.getTime() - a.eventDate.getTime() || b.id.localeCompare(a.id));
}

describe('MaintenanceForecastService.loadEvidenceEvents (bounded pagination)', () => {
  const vehicleId = 'veh-1';
  const vehicleRow = {
    id: vehicleId,
    organizationId: 'org',
    vin: 'WVWZZZ3CZWE123456',
    mileageKm: 50_000,
    serviceIntervalManufacturerKm: null,
    serviceIntervalManufacturerMonths: null,
    serviceIntervalKm: null,
    serviceIntervalMonths: null,
    oilChangeIntervalKm: 15_000,
    oilChangeIntervalMonths: 12,
    lastServiceDate: null,
    lastServiceOdometerKm: null,
    lastOilChangeDate: null,
    lastOilChangeOdometerKm: null,
  };

  function serviceWithHistory(total: number, proofIndex: number) {
    const all = buildRows(total, proofIndex);
    const prisma = {
      vehicle: { findUnique: async () => vehicleRow },
      vehicleServiceEvent: {
        findMany: async (q: { skip?: number; take: number; where: { eventType: { in: string[] } } }) => {
          const filtered = all.filter((r) => q.where.eventType.in.includes(r.eventType));
          const skip = q.skip ?? 0;
          return filtered.slice(skip, skip + q.take);
        },
        findFirst: async (q: { skip?: number }) => {
          const filtered = all.filter((r) =>
            (SERVICE_HISTORY_EVENT_TYPES as readonly string[]).includes(r.eventType),
          );
          return filtered[q.skip ?? 0] ?? null;
        },
      },
      vehicleLatestState: {
        findUnique: async () => ({ odometerKm: 60_000, lastSeenAt: NOW, source: 'DIMO' }),
      },
      oneAutoProviderJob: { findFirst: async () => null },
      oneAutoProviderResponse: { findFirst: async () => null },
    };
    return new MaintenanceForecastService(prisma as never);
  }

  it('finds oil proof at index 199 within 201 events (beyond first page)', async () => {
    const svc = serviceWithHistory(201, 199);
    const result = await svc.computeForVehicle(vehicleId, NOW, null);
    const oil = result?.positions.find((p) => p.kind === 'OIL_CHANGE') ?? result?.positions[0];
    expect(result?.dataQuality).not.toContain('HISTORY_EVIDENCE_TRUNCATED');
    expect(oil?.baseline?.eventId).toBe('oil-proof');
  });

  it('sets HISTORY_EVIDENCE_LOAD_FAILED when findMany throws and omits HISTORY_MISSING', async () => {
    const prisma = {
      vehicle: { findUnique: async () => vehicleRow },
      vehicleServiceEvent: {
        findMany: async () => {
          throw new Error('connection reset');
        },
        findFirst: async () => null,
      },
      vehicleLatestState: {
        findUnique: async () => ({ odometerKm: 60_000, lastSeenAt: NOW, source: 'DIMO' }),
      },
      oneAutoProviderJob: { findFirst: async () => null },
      oneAutoProviderResponse: { findFirst: async () => null },
    };
    const svc = new MaintenanceForecastService(prisma as never);
    const result = await svc.computeForVehicle(vehicleId, NOW, null);
    expect(result?.dataQuality).toContain('HISTORY_EVIDENCE_LOAD_FAILED');
    expect(result?.dataQuality).not.toContain('HISTORY_MISSING');
  });

  it('sets HISTORY_EVIDENCE_TRUNCATED when history exceeds EVIDENCE_MAX_EVENTS', async () => {
    const svc = serviceWithHistory(EVIDENCE_MAX_EVENTS + 10, 5);
    const result = await svc.computeForVehicle(vehicleId, NOW, null);
    expect(result?.dataQuality).toContain('HISTORY_EVIDENCE_TRUNCATED');
  });
});
