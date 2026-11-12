/**
 * Isolated Postgres validation for P1B M2M tables.
 * Run: CORE_APP_M2M_POSTGRES_INTEGRATION=1 DATABASE_URL=postgresql://... npm test -- core-app-m2m.postgres
 */
import { ProductSlug } from '@prisma/client';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const LIVE = process.env.CORE_APP_M2M_POSTGRES_INTEGRATION === '1';

(LIVE ? describe : describe.skip)('Core app M2M — postgres integration', () => {
  const prisma = new PrismaClient();

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('applies client/grant constraints and version increments', async () => {
    const url = process.env.DATABASE_URL ?? '';
    if (!url || url.includes('production')) {
      throw new Error('CORE_APP_M2M_POSTGRES_INTEGRATION requires isolated DATABASE_URL');
    }

    const org = await prisma.organization.create({
      data: {
        companyName: `M2M PG test org ${Date.now()}`,
        businessType: 'RENTAL',
      },
    });

    const clientSecret = 'test-secret-for-pg-integration-only';
    const client = await prisma.coreAppServiceClient.create({
      data: {
        clientId: `m2m-pg-client-${Date.now()}`,
        displayName: 'PG test client',
        productSlug: ProductSlug.RENTAL,
        credentialHash: await bcrypt.hash(clientSecret, 4),
        allowedScopes: ['core:entitlements:read'],
      },
    });

    await expect(
      prisma.coreAppServiceClient.create({
        data: {
          clientId: client.clientId,
          displayName: 'dup',
          productSlug: ProductSlug.RENTAL,
          credentialHash: 'hash',
        },
      }),
    ).rejects.toBeDefined();

    const grant = await prisma.coreAppServiceOrgGrant.create({
      data: { serviceClientId: client.id, organizationId: org.id },
    });

    await expect(
      prisma.coreAppServiceOrgGrant.create({
        data: { serviceClientId: client.id, organizationId: org.id },
      }),
    ).rejects.toBeDefined();

    const rotated = await prisma.coreAppServiceClient.update({
      where: { id: client.id },
      data: { credentialVersion: { increment: 1 } },
    });
    expect(rotated.credentialVersion).toBe(2);

    const revoked = await prisma.coreAppServiceOrgGrant.update({
      where: { id: grant.id },
      data: { status: 'REVOKED', grantVersion: { increment: 1 } },
    });
    expect(revoked.grantVersion).toBe(2);

    await prisma.coreAppServiceOrgGrant.deleteMany({ where: { serviceClientId: client.id } });
    await prisma.coreAppServiceClient.delete({ where: { id: client.id } });
    await prisma.organization.delete({ where: { id: org.id } });
  });
});
