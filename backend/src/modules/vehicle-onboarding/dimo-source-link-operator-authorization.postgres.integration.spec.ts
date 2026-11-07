/**
 * FSD P5B M4 — operator authorization for DIMO source-link ops CLI contract.
 */
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { DimoSourceLinkOperatorAuthorizationService } from './services/dimo-source-link-operator-authorization.service';
import { VehicleOnboardingError } from './errors/vehicle-onboarding.errors';

const run =
  process.env.FSD_DISCOVERY_PERSISTENCE_PG === '1' ||
  process.env.VO5A_OFFBOARDING_PG === '1';

async function ensurePlatformUser(
  prisma: PrismaClient,
  userId: string,
  role: 'MASTER_ADMIN' | 'USER',
  status: 'ACTIVE' | 'SUSPENDED',
) {
  const email = `${userId}@p5b-ops.test`;
  await prisma.$executeRaw`
    INSERT INTO users (id, email, name, status, platform_role, created_at, updated_at)
    VALUES (
      ${userId}, ${email}, 'P5B Ops Test', ${status}::"UserStatus",
      ${role}::"UserPlatformRole", NOW(), NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
      status = ${status}::"UserStatus",
      platform_role = ${role}::"UserPlatformRole"
  `;
}

(run ? describe : describe.skip)('DimoSourceLinkOperatorAuthorization (PostgreSQL)', () => {
  jest.setTimeout(60_000);
  const prisma = new PrismaClient();
  const authz = () =>
    new DimoSourceLinkOperatorAuthorizationService({ prisma } as never);

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('rejects unknown operator user', async () => {
    await expect(
      authz().assertAuthorizedDimoSourceLinkOperator({
        actorUserId: randomUUID(),
        organizationId: randomUUID(),
        vehicleId: randomUUID(),
        providerSourceLinkId: randomUUID(),
      }),
    ).rejects.toBeInstanceOf(VehicleOnboardingError);
  });

  it('rejects suspended MASTER_ADMIN', async () => {
    const userId = randomUUID();
    await ensurePlatformUser(prisma, userId, 'MASTER_ADMIN', 'SUSPENDED');
    await expect(
      authz().assertAuthorizedDimoSourceLinkOperator({
        actorUserId: userId,
        organizationId: randomUUID(),
        vehicleId: randomUUID(),
        providerSourceLinkId: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'CASE_NOT_FOUND' });
  });

  it('rejects non-MASTER_ADMIN platform user', async () => {
    const userId = randomUUID();
    await ensurePlatformUser(prisma, userId, 'USER', 'ACTIVE');
    await expect(
      authz().assertAuthorizedDimoSourceLinkOperator({
        actorUserId: userId,
        organizationId: randomUUID(),
        vehicleId: randomUUID(),
        providerSourceLinkId: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'ACTIVATION_PRECONDITION_FAILED' });
  });
});
