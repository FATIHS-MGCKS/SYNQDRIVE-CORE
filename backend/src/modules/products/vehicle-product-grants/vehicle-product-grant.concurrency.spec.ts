import {
  OrgProductStatus,
  ProductSlug,
  VehicleProductGrantStatus,
  VehicleRegistryLifecycle,
} from '@prisma/client';
import { VehicleProductGrantService } from './vehicle-product-grant.service';

/**
 * In-memory grant store exercising the same state transitions as the service (status-conditional updates).
 */
describe('VehicleProductGrantService — concurrency/version (in-memory contract)', () => {
  const masterAdminAudit = { record: jest.fn().mockResolvedValue(undefined) };
  const ORG = 'org-a';
  const VEH = 'veh-1';
  const ADMIN = 'admin-1';

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

  function buildService(store: Map<string, Row>) {
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
        updateMany: async ({
          where,
          data,
        }: {
          where: { id: string; status: VehicleProductGrantStatus; organizationId?: string };
          data: Partial<Row> & { grantVersion?: { increment: number } };
        }) => {
          const row = [...store.values()].find((r) => r.id === where.id);
          if (!row || row.status !== where.status) return { count: 0 };
          if (where.organizationId && row.organizationId !== where.organizationId) return { count: 0 };
          const { grantVersion: versionBump, ...rest } = data;
          if (versionBump?.increment) {
            row.grantVersion += versionBump.increment;
          }
          Object.assign(row, rest);
          return { count: 1 };
        },
        create: async ({ data }: { data: Omit<Row, 'id' | 'revokedAt' | 'revokedByUserId'> }) => {
          const id = `g-${store.size + 1}`;
          const row: Row = {
            id,
            ...data,
            revokedAt: null,
            revokedByUserId: null,
          };
          if (store.has(key(data.vehicleId, data.productSlug))) {
            const err = new Error('unique') as Error & { code: string };
            err.code = 'P2002';
            throw err;
          }
          store.set(key(data.vehicleId, data.productSlug), row);
          return row;
        },
      },
    };

    const prisma = {
      organizationProduct: {
        findFirst: jest.fn().mockResolvedValue({ id: 'op', status: OrgProductStatus.ACTIVE }),
      },
      vehicle: {
        findFirst: jest.fn().mockResolvedValue({
          id: VEH,
          organizationId: ORG,
          registryLifecycle: VehicleRegistryLifecycle.ACTIVE,
        }),
      },
      $transaction: async (fn: (inner: typeof tx) => Promise<unknown>) => fn(tx),
    };

    return { service: new VehicleProductGrantService(prisma as never, masterAdminAudit as never), store };
  }

  it('increments grantVersion on revoke after grant', async () => {
    const store = new Map<string, Row>();
    const { service } = buildService(store);
    const granted = await service.grantExplicit({
      organizationId: ORG,
      vehicleId: VEH,
      productSlug: ProductSlug.RENTAL,
      grantedByUserId: ADMIN,
    });
    expect(granted.grantVersion).toBe(1);

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

  it('parallel re-grants only advance version once (lost-update safe via status guard)', async () => {
    const store = new Map<string, Row>();
    const { service } = buildService(store);
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

    const results = await Promise.all([
      service.grantExplicit({
        organizationId: ORG,
        vehicleId: VEH,
        productSlug: ProductSlug.RENTAL,
        grantedByUserId: ADMIN,
      }),
      service.grantExplicit({
        organizationId: ORG,
        vehicleId: VEH,
        productSlug: ProductSlug.RENTAL,
        grantedByUserId: ADMIN,
      }),
    ]);

    const versions = results.map((r) => r.grantVersion);
    expect(Math.max(...versions)).toBe(3);
    expect(results.every((r) => r.status === VehicleProductGrantStatus.ACTIVE)).toBe(true);
  });
});