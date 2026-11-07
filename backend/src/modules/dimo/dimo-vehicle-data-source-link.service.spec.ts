import { ConflictException, NotFoundException } from '@nestjs/common';
import type { FsdSourceLinkLifecycleService } from '@modules/vehicle-intelligence/fsd-integration/fsd-source-link-lifecycle.service';
import { DimoVehicleDataSourceLinkService } from './dimo-vehicle-data-source-link.service';
import {
  DIMO_DATA_SOURCE_PROVIDER,
  DIMO_DATA_SOURCE_SUBTYPE,
  DIMO_DATA_SOURCE_TYPE,
} from './dimo-vehicle-data-source-link.contract';

type MockLink = {
  id: string;
  vehicleId: string;
  provider: string;
  sourceType: string;
  sourceSubtype: string | null;
  sourceReferenceId: string | null;
  dimoVehicleId: string | null;
  consentId: string | null;
  isActive: boolean;
  activatedAt: Date;
  deactivatedAt: Date | null;
  linkedByUserId: string | null;
  lastVerifiedAt: Date | null;
  metadata: unknown;
};

type MockStore = {
  vehicles: Array<{
    id: string;
    organizationId: string;
    dimoVehicleId: string | null;
    registryLifecycle?: 'ACTIVE' | 'OFFBOARDED' | 'ARCHIVED';
    licensePlate?: string | null;
    vehicleName?: string | null;
  }>;
  dimoVehicles: Array<{ id: string; externalId: string }>;
  links: MockLink[];
  consents: Array<{
    id: string;
    vehicleId: string;
    organizationId: string;
    provider: string;
    status: string;
    grantedAt: Date;
  }>;
};

function dimoLink(overrides: Partial<MockLink> & Pick<MockLink, 'vehicleId'>): MockLink {
  return {
    id: overrides.id ?? `link-${Math.random().toString(36).slice(2, 8)}`,
    provider: DIMO_DATA_SOURCE_PROVIDER,
    sourceType: DIMO_DATA_SOURCE_TYPE,
    sourceSubtype: DIMO_DATA_SOURCE_SUBTYPE,
    sourceReferenceId: null,
    dimoVehicleId: 'dimo-1',
    consentId: null,
    isActive: true,
    activatedAt: new Date(),
    deactivatedAt: null,
    linkedByUserId: null,
    lastVerifiedAt: null,
    metadata: null,
    ...overrides,
  };
}

function hmLink(overrides: Partial<MockLink> & Pick<MockLink, 'vehicleId'>): MockLink {
  return {
    id: overrides.id ?? `hm-link-${Math.random().toString(36).slice(2, 8)}`,
    provider: 'HIGH_MOBILITY',
    sourceType: 'HIGH_MOBILITY',
    sourceSubtype: 'HM_HEALTH',
    sourceReferenceId: 'hm-1',
    dimoVehicleId: null,
    consentId: null,
    isActive: true,
    activatedAt: new Date(),
    deactivatedAt: null,
    linkedByUserId: null,
    lastVerifiedAt: null,
    metadata: null,
    ...overrides,
  };
}

function stubFsdLifecycle(): FsdSourceLinkLifecycleService {
  return {
    invalidateSingleDimoSourceLinkForLifecycle: jest.fn().mockResolvedValue({ invalidatedCount: 0 }),
  } as unknown as FsdSourceLinkLifecycleService;
}

function withMockTransaction<T extends Record<string, unknown>>(prisma: T): T {
  const p = prisma as T & { $transaction?: (fn: (tx: T) => unknown) => Promise<unknown> };
  if (!p.$transaction) {
    p.$transaction = jest.fn(async (fn: (tx: T) => unknown) => fn(prisma));
  }
  return p;
}

function linkService(mock: ReturnType<typeof createMockPrisma>, fsd = stubFsdLifecycle()) {
  return new DimoVehicleDataSourceLinkService(withMockTransaction(mock) as never, fsd);
}

function createMockPrisma(store: MockStore) {
  const dimoFilter = (link: MockLink) =>
    link.provider === DIMO_DATA_SOURCE_PROVIDER &&
    link.sourceType === DIMO_DATA_SOURCE_TYPE &&
    link.sourceSubtype === DIMO_DATA_SOURCE_SUBTYPE;

  return {
    vehicle: {
      findFirst: jest.fn(async ({ where }: any) =>
        store.vehicles.find(
          (v) =>
            v.id === where.id &&
            (!where.organizationId || v.organizationId === where.organizationId),
        ) ?? null,
      ),
      findMany: jest.fn(async ({ where }: any) =>
        store.vehicles.filter(
          (v) =>
            (!where.organizationId || v.organizationId === where.organizationId) &&
            (where.dimoVehicleId?.not == null ? v.dimoVehicleId != null : true),
        ),
      ),
    },
    dimoVehicle: {
      findUnique: jest.fn(async ({ where }: any) =>
        store.dimoVehicles.find((d) => d.id === where.id) ?? null,
      ),
    },
    vehicleDataSourceLink: {
      findFirst: jest.fn(async ({ where }: any) => {
        const matches = store.links.filter((l) => {
          if (where.provider && l.provider !== where.provider) return false;
          if (where.dimoVehicleId && l.dimoVehicleId !== where.dimoVehicleId) {
            return false;
          }
          if (where.isActive != null && l.isActive !== where.isActive) return false;
          if (where.vehicle?.organizationId?.not) {
            const vehicle = store.vehicles.find((v) => v.id === l.vehicleId);
            if (!vehicle || vehicle.organizationId === where.vehicle.organizationId.not) {
              return false;
            }
          }
          return true;
        });
        return matches[0] ?? null;
      }),
      findMany: jest.fn(async ({ where }: any) =>
        store.links.filter(
          (l) =>
            l.vehicleId === where.vehicleId &&
            (!where.provider || l.provider === where.provider) &&
            (!where.sourceType || l.sourceType === where.sourceType) &&
            (where.sourceSubtype === DIMO_DATA_SOURCE_SUBTYPE
              ? l.sourceSubtype === DIMO_DATA_SOURCE_SUBTYPE
              : true),
        ),
      ),
      create: jest.fn(async ({ data }: any) => {
        const row: MockLink = {
          id: `link-${store.links.length + 1}`,
          vehicleId: data.vehicleId,
          provider: data.provider,
          sourceType: data.sourceType,
          sourceSubtype: data.sourceSubtype ?? null,
          sourceReferenceId: data.sourceReferenceId ?? null,
          dimoVehicleId: data.dimoVehicleId ?? null,
          consentId: data.consentId ?? null,
          isActive: data.isActive ?? true,
          activatedAt: data.activatedAt ?? new Date(),
          deactivatedAt: null,
          linkedByUserId: data.linkedByUserId ?? null,
          lastVerifiedAt: data.lastVerifiedAt ?? null,
          metadata: data.metadata ?? null,
        };
        store.links.push(row);
        return row;
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const idx = store.links.findIndex((l) => l.id === where.id);
        if (idx < 0) throw new Error('not found');
        store.links[idx] = { ...store.links[idx], ...data };
        return store.links[idx];
      }),
    },
    vehicleProviderConsent: {
      findFirst: jest.fn(async ({ where, orderBy }: any) => {
        const rows = store.consents
          .filter(
            (c) =>
              c.vehicleId === where.vehicleId &&
              c.organizationId === where.organizationId &&
              c.provider === where.provider &&
              (!where.status || c.status === where.status),
          )
          .sort((a, b) =>
            orderBy?.grantedAt === 'desc'
              ? b.grantedAt.getTime() - a.grantedAt.getTime()
              : 0,
          );
        return rows[0] ?? null;
      }),
    },
  };
}

function baseStore(): MockStore {
  return {
    vehicles: [
      {
        id: 'veh-1',
        organizationId: 'org-1',
        dimoVehicleId: 'dimo-1',
        registryLifecycle: 'ACTIVE',
        licensePlate: 'HMÜ C 215',
      },
    ],
    dimoVehicles: [{ id: 'dimo-1', externalId: 'ext-1' }],
    links: [],
    consents: [
      {
        id: 'consent-active',
        vehicleId: 'veh-1',
        organizationId: 'org-1',
        provider: 'DIMO',
        status: 'ACTIVE',
        grantedAt: new Date('2026-01-01'),
      },
    ],
  };
}

function vehicleRowsFromStore(store: MockStore, organizationId = 'org-1') {
  return store.vehicles
    .filter((v) => v.organizationId === organizationId && v.dimoVehicleId)
    .map((v) => ({
      id: v.id,
      organizationId: v.organizationId,
      licensePlate: v.licensePlate ?? null,
      vehicleName: v.vehicleName ?? null,
      dimoVehicleId: v.dimoVehicleId,
      dimoVehicle: { id: v.dimoVehicleId! },
      dataSourceLinks: store.links
        .filter((l) => l.vehicleId === v.id && dimoFilter(l))
        .map((l) => ({
          id: l.id,
          dimoVehicleId: l.dimoVehicleId,
          isActive: l.isActive,
          deactivatedAt: l.deactivatedAt,
          metadata: l.metadata,
        })),
    }));
}

function dimoFilter(link: MockLink) {
  return (
    link.provider === DIMO_DATA_SOURCE_PROVIDER &&
    link.sourceType === DIMO_DATA_SOURCE_TYPE &&
    link.sourceSubtype === DIMO_DATA_SOURCE_SUBTYPE
  );
}

describe('DimoVehicleDataSourceLinkService', () => {
  const baseInput = {
    organizationId: 'org-1',
    vehicleId: 'veh-1',
    dimoVehicleId: 'dimo-1',
    provenance: 'registration' as const,
  };

  it('rejects link ensure when vehicle registry is not ACTIVE', async () => {
    const store = baseStore();
    store.vehicles[0].registryLifecycle = 'OFFBOARDED';
    const service = linkService(createMockPrisma(store));
    const result = await service.ensureDimoVehicleDataSourceLink(baseInput);
    expect(result.action).toBe('CONFLICT');
    expect(result.reason).toBe('vehicle_registry_not_operational');
    expect(store.links).toHaveLength(0);
  });

  it('L1 / D1 — missing DIMO link + valid relation → CREATE with dimoVehicleId', async () => {
    const store = baseStore();
    const service = linkService(createMockPrisma(store));
    const result = await service.ensureDimoVehicleDataSourceLink(baseInput);
    expect(result.action).toBe('CREATE');
    expect(store.links).toHaveLength(1);
    expect(store.links[0].dimoVehicleId).toBe('dimo-1');
    expect(store.links[0].sourceReferenceId).toBeNull();
    expect(store.links[0].provider).toBe('DIMO');
  });

  it('D2 — DIMO create does NOT set sourceReferenceId to DimoVehicle.id', async () => {
    const store = baseStore();
    const service = linkService(createMockPrisma(store));
    await service.ensureDimoVehicleDataSourceLink(baseInput);
    expect(store.links[0].sourceReferenceId).toBeNull();
    expect(store.links[0].dimoVehicleId).toBe('dimo-1');
  });

  it('L2 / D6 — existing correct active link → NOOP', async () => {
    const store = baseStore();
    store.links.push(
      dimoLink({
        id: 'link-existing',
        vehicleId: 'veh-1',
        consentId: 'consent-active',
        activatedAt: new Date('2026-01-01'),
      }),
    );
    const service = linkService(createMockPrisma(store));
    const result = await service.ensureDimoVehicleDataSourceLink(baseInput);
    expect(result.action).toBe('NOOP');
    expect(store.links).toHaveLength(1);
  });

  it('L3 — retry same registration → no duplicate', async () => {
    const store = baseStore();
    const service = linkService(createMockPrisma(store));
    const first = await service.ensureDimoVehicleDataSourceLink(baseInput);
    const second = await service.ensureDimoVehicleDataSourceLink(baseInput);
    expect(first.action).toBe('CREATE');
    expect(second.action).toBe('NOOP');
    expect(store.links.filter((l) => l.isActive)).toHaveLength(1);
  });

  it('L4 / D5 — cross-tenant DimoVehicle binding mismatch → reject', async () => {
    const store = baseStore();
    store.vehicles[0].dimoVehicleId = 'dimo-other';
    const service = linkService(createMockPrisma(store));
    const result = await service.ensureDimoVehicleDataSourceLink(baseInput);
    expect(result.action).toBe('CONFLICT');
    expect(result.reason).toBe('vehicle_dimo_binding_mismatch');
  });

  it('L5 / D7 — conflicting active mapping → CONFLICT', async () => {
    const store = baseStore();
    store.links.push(
      dimoLink({
        id: 'link-conflict',
        vehicleId: 'veh-1',
        dimoVehicleId: 'dimo-other',
      }),
    );
    const service = linkService(createMockPrisma(store));
    const result = await service.ensureDimoVehicleDataSourceLink(baseInput);
    expect(result.action).toBe('CONFLICT');
    expect(result.reason).toBe('conflicting_active_dimo_vehicle');
  });

  it('L6 — inactive consent does not fabricate ACTIVE provider state', async () => {
    const store = baseStore();
    store.consents = [
      {
        id: 'consent-inactive',
        vehicleId: 'veh-1',
        organizationId: 'org-1',
        provider: 'DIMO',
        status: 'REVOKED',
        grantedAt: new Date('2026-01-01'),
      },
    ];
    const service = linkService(createMockPrisma(store));
    const provenance = await service.resolveConsentProvenance('veh-1', 'org-1');
    expect(provenance.selection).toBe('latest_inactive');
    expect(provenance.consentStatus).toBe('REVOKED');
    const result = await service.ensureDimoVehicleDataSourceLink(baseInput);
    expect(result.action).toBe('CREATE');
    expect(result.consentId).toBe('consent-inactive');
  });

  it('L7 / D9 — registration transaction behavior on link failure', async () => {
    const store = baseStore();
    store.links.push(
      dimoLink({
        id: 'link-conflict',
        vehicleId: 'veh-1',
        dimoVehicleId: 'dimo-other',
      }),
    );
    const service = linkService(createMockPrisma(store));
    await expect(
      service.ensureDimoVehicleDataSourceLinkOrThrow(baseInput, createMockPrisma(store) as any),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('L8 / H1 — High Mobility path unaffected (no DIMO rows touched)', async () => {
    const store = baseStore();
    store.links.push(hmLink({ id: 'hm-link', vehicleId: 'veh-1' }));
    const service = linkService(createMockPrisma(store));
    const result = await service.ensureDimoVehicleDataSourceLink(baseInput);
    expect(result.action).toBe('CREATE');
    expect(store.links.filter((l) => l.provider === 'HIGH_MOBILITY')).toHaveLength(1);
    expect(store.links.filter((l) => l.provider === 'DIMO')).toHaveLength(1);
    expect(store.links.find((l) => l.provider === 'HIGH_MOBILITY')?.dimoVehicleId).toBeNull();
  });

  it('H5 — DIMO-specific field remains null for HM links', async () => {
    const store = baseStore();
    store.links.push(hmLink({ id: 'hm-link', vehicleId: 'veh-1' }));
    expect(store.links[0].dimoVehicleId).toBeNull();
    expect(store.links[0].sourceReferenceId).toBe('hm-1');
  });

  it('L9 — inactive link reactivates only with explicit positive provenance', async () => {
    const store = baseStore();
    store.links.push(
      dimoLink({
        id: 'link-inactive',
        vehicleId: 'veh-1',
        isActive: false,
        activatedAt: new Date('2026-01-01'),
        deactivatedAt: new Date('2026-06-01'),
        consentId: 'consent-active',
        metadata: { reactivationEligible: true },
      }),
    );
    const service = linkService(createMockPrisma(store));
    const result = await service.ensureDimoVehicleDataSourceLink(baseInput);
    expect(result.action).toBe('REACTIVATE');
    expect(store.links[0].isActive).toBe(true);
  });

  it('L10 / D8 — inactive link without safe provenance → CONFLICT on registration', async () => {
    const store = baseStore();
    store.links.push(
      dimoLink({
        id: 'link-inactive',
        vehicleId: 'veh-1',
        isActive: false,
        activatedAt: new Date('2026-01-01'),
        deactivatedAt: new Date('2026-06-01'),
        consentId: 'consent-active',
        metadata: { intentionalDeactivation: true },
      }),
    );
    const service = linkService(createMockPrisma(store));
    const result = await service.ensureDimoVehicleDataSourceLink(baseInput);
    expect(result.action).toBe('CONFLICT');
    expect(result.reason).toBe('intentional_deactivation');
    expect(store.links[0].isActive).toBe(false);
  });

  it('D10 — legacy HM FK column not used for DIMO identity on create', async () => {
    const store = baseStore();
    const prisma = createMockPrisma(store) as any;
    const service = linkService(prisma);
    await service.ensureDimoVehicleDataSourceLink(baseInput);
    const createCall = prisma.vehicleDataSourceLink.create.mock.calls[0][0];
    expect(createCall.data.dimoVehicleId).toBe('dimo-1');
    expect(createCall.data.sourceReferenceId).toBeNull();
  });
});

describe('DimoVehicleDataSourceLinkService backfill planning', () => {
  it('B1/B2 — dry-run plan CREATE for missing link', async () => {
    const store = baseStore();
    const prisma = createMockPrisma(store) as any;
    prisma.vehicle.findMany = jest.fn(async ({ where }: any) =>
      vehicleRowsFromStore(store, where.organizationId),
    );
    const service = linkService(prisma);
    const summary = await service.runBackfill({ organizationId: 'org-1', apply: false });
    expect(summary.mode).toBe('dry-run');
    expect(summary.plannedCreate).toBe(1);
    expect(summary.applied).toBe(0);
    expect(store.links).toHaveLength(0);
  });

  it('B3 / B11 — existing link → NOOP plan', async () => {
    const store = baseStore();
    store.links.push(dimoLink({ id: 'link-1', vehicleId: 'veh-1', consentId: 'consent-active' }));
    const prisma = createMockPrisma(store) as any;
    prisma.vehicle.findMany = jest.fn(async () => vehicleRowsFromStore(store));
    const service = linkService(prisma);
    const summary = await service.runBackfill({ organizationId: 'org-1', apply: false });
    expect(summary.plannedNoop).toBe(1);
  });

  it('B5 — second apply → NOOP', async () => {
    const store = baseStore();
    const prisma = createMockPrisma(store) as any;
    prisma.vehicle.findMany = jest.fn(async () => vehicleRowsFromStore(store));
    const service = linkService(prisma);
    const first = await service.runBackfill({ organizationId: 'org-1', apply: true });
    const second = await service.runBackfill({ organizationId: 'org-1', apply: true });
    expect(first.applied).toBe(1);
    expect(second.plannedNoop).toBe(1);
    expect(second.applied).toBe(0);
  });

  it('B4 — apply creates link once', async () => {
    const store = baseStore();
    const prisma = createMockPrisma(store) as any;
    prisma.vehicle.findMany = jest.fn(async () => vehicleRowsFromStore(store));
    const service = linkService(prisma);
    const summary = await service.runBackfill({ organizationId: 'org-1', apply: true });
    expect(summary.applied).toBe(1);
    expect(store.links).toHaveLength(1);
  });

  it('B6 — tenant isolation: cross-tenant active mapping blocks CREATE', async () => {
    const store = baseStore();
    store.vehicles.push({
      id: 'veh-2',
      organizationId: 'org-2',
      dimoVehicleId: 'dimo-1',
      licensePlate: 'OTHER',
    });
    store.links.push(dimoLink({ id: 'link-org2', vehicleId: 'veh-2' }));
    const service = linkService(createMockPrisma(store));
    const result = await service.ensureDimoVehicleDataSourceLink({
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      dimoVehicleId: 'dimo-1',
      provenance: 'backfill',
    });
    expect(result.action).toBe('CONFLICT');
    expect(result.reason).toBe('cross_tenant_active_mapping');
    expect(store.links.filter((l) => l.vehicleId === 'veh-1')).toHaveLength(0);
  });

  it('B7 — inactive historical link → CONFLICT (no auto-reactivate in backfill)', async () => {
    const store = baseStore();
    store.links.push(
      dimoLink({
        id: 'link-inactive',
        vehicleId: 'veh-1',
        isActive: false,
        activatedAt: new Date('2026-01-01'),
        deactivatedAt: new Date('2026-06-01'),
        consentId: 'consent-active',
      }),
    );
    const prisma = createMockPrisma(store) as any;
    prisma.vehicle.findMany = jest.fn(async () => vehicleRowsFromStore(store));
    const service = linkService(prisma);
    const summary = await service.runBackfill({ organizationId: 'org-1', apply: true });
    expect(summary.plannedConflict).toBe(1);
    expect(summary.plannedReactivate).toBe(0);
    expect(summary.applied).toBe(0);
    expect(store.links[0].isActive).toBe(false);
  });

  it('B8 — revoked consent: link mapping does not imply ACTIVE provider auth', async () => {
    const store = baseStore();
    store.consents = [
      {
        id: 'consent-revoked',
        vehicleId: 'veh-1',
        organizationId: 'org-1',
        provider: 'DIMO',
        status: 'REVOKED',
        grantedAt: new Date('2026-01-01'),
      },
    ];
    const prisma = createMockPrisma(store) as any;
    prisma.vehicle.findMany = jest.fn(async () => vehicleRowsFromStore(store));
    const service = linkService(prisma);
    const summary = await service.runBackfill({ organizationId: 'org-1', apply: false });
    expect(summary.plannedCreate).toBe(1);
    const provenance = await service.resolveConsentProvenance('veh-1', 'org-1');
    expect(provenance.consentStatus).toBe('REVOKED');
    expect(provenance.selection).toBe('latest_inactive');
  });

  it('B9 — planned DIMO CREATE uses candidateDimoVehicleId', async () => {
    const store = baseStore();
    const prisma = createMockPrisma(store) as any;
    prisma.vehicle.findMany = jest.fn(async () => vehicleRowsFromStore(store));
    const service = linkService(prisma);
    const summary = await service.runBackfill({ organizationId: 'org-1', apply: false });
    expect(summary.vehicles[0].candidateDimoVehicleId).toBe('dimo-1');
    expect(summary.vehicles[0].plannedAction).toBe('CREATE');
  });

  it('B10 — apply CREATE writes dimoVehicleId not sourceReferenceId', async () => {
    const store = baseStore();
    const prisma = createMockPrisma(store) as any;
    prisma.vehicle.findMany = jest.fn(async () => vehicleRowsFromStore(store));
    const service = linkService(prisma);
    await service.runBackfill({ organizationId: 'org-1', apply: true });
    expect(store.links[0].dimoVehicleId).toBe('dimo-1');
    expect(store.links[0].sourceReferenceId).toBeNull();
  });

  it('B12 — conflicting dimoVehicleId → CONFLICT plan', async () => {
    const store = baseStore();
    store.links.push(
      dimoLink({ id: 'link-conflict', vehicleId: 'veh-1', dimoVehicleId: 'dimo-other' }),
    );
    const prisma = createMockPrisma(store) as any;
    prisma.vehicle.findMany = jest.fn(async () => vehicleRowsFromStore(store));
    const service = linkService(prisma);
    const summary = await service.runBackfill({ organizationId: 'org-1', apply: false });
    expect(summary.plannedConflict).toBe(1);
    expect(summary.vehicles[0].reason).toBe('conflicting_active_dimo_vehicle');
  });
});

describe('DimoVehicleDataSourceLinkService reconciliation', () => {
  it('R1 / R6 — missing deterministic DIMO link detected', async () => {
    const store = baseStore();
    const prisma = createMockPrisma(store) as any;
    prisma.vehicle.findMany = jest.fn(async () => vehicleRowsFromStore(store));
    const service = linkService(prisma);
    const drift = await service.auditProviderLinkDrift({ organizationId: 'org-1' });
    expect(drift.missingLink).toBe(1);
  });

  it('R2 / R7 — healthy link not flagged as missing', async () => {
    const store = baseStore();
    store.links.push(dimoLink({ id: 'link-1', vehicleId: 'veh-1' }));
    const prisma = createMockPrisma(store) as any;
    prisma.vehicle.findMany = jest.fn(async () => vehicleRowsFromStore(store));
    const service = linkService(prisma);
    const drift = await service.auditProviderLinkDrift({ organizationId: 'org-1' });
    expect(drift.healthy).toBe(1);
    expect(drift.missingLink).toBe(0);
  });

  it('R3 / R9 — ambiguous relation not auto-healed on reconcile', async () => {
    const store = baseStore();
    store.links.push(
      dimoLink({ id: 'link-a', vehicleId: 'veh-1' }),
      dimoLink({ id: 'link-b', vehicleId: 'veh-1' }),
    );
    const prisma = createMockPrisma(store) as any;
    prisma.vehicle.findMany = jest.fn(async () => vehicleRowsFromStore(store));
    const service = linkService(prisma);
    const drift = await service.auditProviderLinkDrift({ organizationId: 'org-1' });
    expect(drift.ambiguous).toBe(1);
    const result = await service.reconcileSafeDrift({
      organizationId: 'org-1',
      apply: true,
    });
    expect(result.applied).toBe(0);
  });

  it('R4 / R10 — cross-tenant conflict detected, no automatic mutation', async () => {
    const store = baseStore();
    store.vehicles.push({
      id: 'veh-2',
      organizationId: 'org-2',
      dimoVehicleId: 'dimo-1',
      licensePlate: 'OTHER',
    });
    store.links.push(dimoLink({ id: 'link-org2', vehicleId: 'veh-2' }));
    const prisma = createMockPrisma(store) as any;
    prisma.vehicle.findMany = jest.fn(async ({ where }: any) =>
      vehicleRowsFromStore(store, where.organizationId),
    );
    const service = linkService(prisma);
    const result = await service.reconcileSafeDrift({
      organizationId: 'org-1',
      apply: true,
    });
    expect(result.applied).toBe(0);
    expect(store.links.filter((l) => l.vehicleId === 'veh-1')).toHaveLength(0);
  });

  it('R5 — idempotent reconciliation: second run applies zero mutations', async () => {
    const store = baseStore();
    const prisma = createMockPrisma(store) as any;
    prisma.vehicle.findMany = jest.fn(async () => vehicleRowsFromStore(store));
    const service = linkService(prisma);
    const first = await service.reconcileSafeDrift({
      organizationId: 'org-1',
      apply: true,
    });
    const second = await service.reconcileSafeDrift({
      organizationId: 'org-1',
      apply: true,
    });
    expect(first.applied).toBe(1);
    expect(second.applied).toBe(0);
    expect(store.links.filter((l) => l.isActive && dimoFilter(l))).toHaveLength(1);
    const drift = await service.auditProviderLinkDrift({ organizationId: 'org-1' });
    expect(drift.healthy).toBe(1);
    expect(drift.missingLink).toBe(0);
  });

  it('R8 — HM link does not satisfy DIMO mapping drift check', async () => {
    const store = baseStore();
    store.links.push(hmLink({ id: 'hm-only', vehicleId: 'veh-1' }));
    const prisma = createMockPrisma(store) as any;
    prisma.vehicle.findMany = jest.fn(async () => vehicleRowsFromStore(store));
    const service = linkService(prisma);
    const drift = await service.auditProviderLinkDrift({ organizationId: 'org-1' });
    expect(drift.missingLink).toBe(1);
    expect(drift.healthy).toBe(0);
  });
});

describe('DimoVehicleDataSourceLinkService validation', () => {
  const baseInput = {
    organizationId: 'org-1',
    vehicleId: 'veh-1',
    dimoVehicleId: 'dimo-1',
    provenance: 'registration' as const,
  };

  it('throws when vehicle is missing', async () => {
    const store = baseStore();
    store.vehicles = [];
    const service = linkService(createMockPrisma(store));
    await expect(service.ensureDimoVehicleDataSourceLink(baseInput)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('D4 — nonexistent DimoVehicle → NotFoundException', async () => {
    const store = baseStore();
    store.dimoVehicles = [];
    const service = linkService(createMockPrisma(store));
    await expect(service.ensureDimoVehicleDataSourceLink(baseInput)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe('registerFromDimo DIMO link materialization (D9)', () => {
  it('transactional ensure creates Vehicle + link with dimoVehicleId only', async () => {
    const store = baseStore();
    const prisma = createMockPrisma(store) as any;
    const service = linkService(prisma);

    const result = await service.ensureDimoVehicleDataSourceLinkOrThrow(
      {
        organizationId: 'org-1',
        vehicleId: 'veh-1',
        dimoVehicleId: 'dimo-1',
        provenance: 'registration',
      },
      prisma,
    );

    expect(result.action).toBe('CREATE');
    expect(store.links).toHaveLength(1);
    expect(store.links[0].dimoVehicleId).toBe('dimo-1');
    expect(store.links[0].sourceReferenceId).toBeNull();
    expect(prisma.vehicleDataSourceLink.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          dimoVehicleId: 'dimo-1',
          sourceReferenceId: null,
        }),
      }),
    );
  });
});
