import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  OrgProductStatus,
  ProductSlug,
  VehicleProductGrantStatus,
  VehicleRegistryLifecycle,
} from '@prisma/client';
import { VehicleProductGrantService } from './vehicle-product-grant.service';

const ORG = 'org-a';
const VEH = 'veh-x';
const ADMIN = 'admin-1';

describe('VehicleProductGrantService', () => {
  const masterAdminAudit = { record: jest.fn().mockResolvedValue(undefined) };

  type Row = {
    id: string;
    organizationId: string;
    vehicleId: string;
    productSlug: ProductSlug;
    status: VehicleProductGrantStatus;
    grantVersion: number;
    grantedAt: Date;
    revokedAt: Date | null;
    grantedByUserId: string;
    revokedByUserId: string | null;
  };

  function makePrisma(store: Map<string, Row>) {
    const key = (vehicleId: string, productSlug: ProductSlug) => `${vehicleId}:${productSlug}`;
    const tx = {
      vehicleProductGrant: {
        findUnique: async ({
          where,
        }: {
          where:
            | { vehicleId_productSlug: { vehicleId: string; productSlug: ProductSlug } }
            | { id: string };
        }) => {
          if ('id' in where) {
            return [...store.values()].find((r) => r.id === where.id) ?? null;
          }
          return (
            store.get(
              key(where.vehicleId_productSlug.vehicleId, where.vehicleId_productSlug.productSlug),
            ) ?? null
          );
        },
        findUniqueOrThrow: async (args: { where: { id: string } }) => {
          const row = await tx.vehicleProductGrant.findUnique(args);
          if (!row) throw new Error('missing');
          return row;
        },
        findFirst: async ({
          where,
        }: {
          where: { organizationId: string; vehicleId: string; productSlug: ProductSlug; status: VehicleProductGrantStatus };
        }) =>
          [...store.values()].find(
            (r) =>
              r.organizationId === where.organizationId &&
              r.vehicleId === where.vehicleId &&
              r.productSlug === where.productSlug &&
              r.status === where.status,
          ) ?? null,
        findMany: jest.fn(),
        updateMany: async ({
          where,
          data,
        }: {
          where: { id: string; status?: VehicleProductGrantStatus; organizationId?: string };
          data: Record<string, unknown> & { grantVersion?: { increment: number } };
        }) => {
          const row = [...store.values()].find((r) => r.id === where.id);
          if (!row) return { count: 0 };
          if (where.status && row.status !== where.status) return { count: 0 };
          if (where.organizationId && row.organizationId !== where.organizationId) return { count: 0 };
          const { grantVersion: versionBump, ...rest } = data;
          if (versionBump && typeof versionBump === 'object' && 'increment' in versionBump) {
            row.grantVersion += versionBump.increment;
          }
          Object.assign(row, rest);
          return { count: 1 };
        },
        create: async ({ data }: { data: Omit<Row, 'id' | 'revokedAt' | 'revokedByUserId'> }) => {
          if (store.has(key(data.vehicleId, data.productSlug))) {
            const err = new Error('unique') as Error & { code: string };
            err.code = 'P2002';
            throw err;
          }
          const row: Row = {
            id: `g-${store.size + 1}`,
            ...data,
            revokedAt: null,
            revokedByUserId: null,
          };
          store.set(key(data.vehicleId, data.productSlug), row);
          return row;
        },
      },
    };

    return {
      organizationProduct: {
        findFirst: jest.fn().mockResolvedValue({ id: 'op-1' }),
      },
      vehicle: {
        findFirst: jest.fn().mockResolvedValue({
          id: VEH,
          organizationId: ORG,
          registryLifecycle: VehicleRegistryLifecycle.ACTIVE,
        }),
      },
      vehicleProductGrant: tx.vehicleProductGrant,
      $transaction: async (fn: (inner: typeof tx) => Promise<unknown>) => fn(tx),
    };
  }

  let store: Map<string, Row>;
  let service: VehicleProductGrantService;

  beforeEach(() => {
    jest.clearAllMocks();
    store = new Map();
    service = new VehicleProductGrantService(makePrisma(store) as never, masterAdminAudit as never);
  });

  it('grants Product A to Vehicle X with grantVersion 1', async () => {
    const row = await service.grantExplicit({
      organizationId: ORG,
      vehicleId: VEH,
      productSlug: ProductSlug.RENTAL,
      grantedByUserId: ADMIN,
    });
    expect(row.productSlug).toBe(ProductSlug.RENTAL);
    expect(row.grantVersion).toBe(1);
  });

  it('Product B has no active grant unless created', async () => {
    await expect(service.hasActiveGrant(ORG, VEH, ProductSlug.FLEET)).resolves.toBe(false);
  });

  it('Vehicle X can hold multiple product grants', async () => {
    await service.grantExplicit({
      organizationId: ORG,
      vehicleId: VEH,
      productSlug: ProductSlug.RENTAL,
      grantedByUserId: ADMIN,
    });
    await service.grantExplicit({
      organizationId: ORG,
      vehicleId: VEH,
      productSlug: ProductSlug.FLEET,
      grantedByUserId: ADMIN,
    });
    await expect(service.hasActiveGrant(ORG, VEH, ProductSlug.RENTAL)).resolves.toBe(true);
    await expect(service.hasActiveGrant(ORG, VEH, ProductSlug.FLEET)).resolves.toBe(true);
  });

  it('increments grantVersion on revoke and re-grant', async () => {
    await service.grantExplicit({
      organizationId: ORG,
      vehicleId: VEH,
      productSlug: ProductSlug.RENTAL,
      grantedByUserId: ADMIN,
    });
    const revoked = await service.revokeGrant({
      organizationId: ORG,
      vehicleId: VEH,
      productSlug: ProductSlug.RENTAL,
      revokedByUserId: ADMIN,
    });
    expect(revoked.grantVersion).toBe(2);
    const regranted = await service.grantExplicit({
      organizationId: ORG,
      vehicleId: VEH,
      productSlug: ProductSlug.RENTAL,
      grantedByUserId: ADMIN,
    });
    expect(regranted.grantVersion).toBe(3);
  });

  it('idempotent active grant does not bump version', async () => {
    await service.grantExplicit({
      organizationId: ORG,
      vehicleId: VEH,
      productSlug: ProductSlug.RENTAL,
      grantedByUserId: ADMIN,
    });
    const again = await service.grantExplicit({
      organizationId: ORG,
      vehicleId: VEH,
      productSlug: ProductSlug.RENTAL,
      grantedByUserId: ADMIN,
    });
    expect(again.grantVersion).toBe(1);
  });

  it('rejects foreign-org vehicle binding as not found', async () => {
    const prisma = makePrisma(store);
    (prisma.vehicle.findFirst as jest.Mock).mockResolvedValue({
      id: VEH,
      organizationId: 'other-org',
      registryLifecycle: VehicleRegistryLifecycle.ACTIVE,
    });
    service = new VehicleProductGrantService(prisma as never, masterAdminAudit as never);
    await expect(
      service.grantExplicit({
        organizationId: ORG,
        vehicleId: VEH,
        productSlug: ProductSlug.RENTAL,
        grantedByUserId: ADMIN,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects grant when organization product is inactive', async () => {
    const prisma = makePrisma(store);
    (prisma.organizationProduct.findFirst as jest.Mock).mockResolvedValue(null);
    service = new VehicleProductGrantService(prisma as never, masterAdminAudit as never);
    await expect(
      service.grantExplicit({
        organizationId: ORG,
        vehicleId: VEH,
        productSlug: ProductSlug.RENTAL,
        grantedByUserId: ADMIN,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.organizationProduct.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: OrgProductStatus.ACTIVE }),
      }),
    );
  });

  it('rejects offboarded vehicle', async () => {
    const prisma = makePrisma(store);
    (prisma.vehicle.findFirst as jest.Mock).mockResolvedValue({
      id: VEH,
      organizationId: ORG,
      registryLifecycle: VehicleRegistryLifecycle.OFFBOARDED,
    });
    service = new VehicleProductGrantService(prisma as never, masterAdminAudit as never);
    await expect(
      service.grantExplicit({
        organizationId: ORG,
        vehicleId: VEH,
        productSlug: ProductSlug.RENTAL,
        grantedByUserId: ADMIN,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('idempotent revoke when already revoked', async () => {
    await service.grantExplicit({
      organizationId: ORG,
      vehicleId: VEH,
      productSlug: ProductSlug.RENTAL,
      grantedByUserId: ADMIN,
    });
    await service.revokeGrant({
      organizationId: ORG,
      vehicleId: VEH,
      productSlug: ProductSlug.RENTAL,
      revokedByUserId: ADMIN,
    });
    const row = await service.revokeGrant({
      organizationId: ORG,
      vehicleId: VEH,
      productSlug: ProductSlug.RENTAL,
      revokedByUserId: ADMIN,
    });
    expect(row.grantVersion).toBe(2);
  });

  it('audit is not called on idempotent grant', async () => {
    await service.grantExplicit({
      organizationId: ORG,
      vehicleId: VEH,
      productSlug: ProductSlug.RENTAL,
      grantedByUserId: ADMIN,
      audit: { correlationId: 'c1' },
    });
    await service.grantExplicit({
      organizationId: ORG,
      vehicleId: VEH,
      productSlug: ProductSlug.RENTAL,
      grantedByUserId: ADMIN,
      audit: { correlationId: 'c2' },
    });
    expect(masterAdminAudit.record).toHaveBeenCalledTimes(1);
  });
});