/**
 * VO-5A registry offboarding foundation (PostgreSQL).
 */
import { BusinessType, PrismaClient, ProductSlug, VehicleProviderConsentStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { createDimoVehicleDataSourceLinkServiceForTests } from './testing/vehicle-onboarding-test.harness';
import { createVehicleOffboardingServiceForTests } from './testing/vehicle-offboarding-test.harness';
import { VehicleOnboardingProviderCandidateService } from './services/vehicle-onboarding-provider-candidate.service';
import { VehicleOnboardingSourceAdoptionAuthority } from './source-adoption/vehicle-onboarding-source-adoption.authority';
import { ensureOrganizationProductEntitlement } from './testing/org-product-test.harness';
import { parseCandidateListQuery } from './policy/candidate-list-query.validation';

const run = process.env.VO5A_OFFBOARDING_PG === '1' || process.env.VO410_PROVIDER_CANDIDATE_PG === '1';

async function createOrg(prisma: PrismaClient) {
  const id = randomUUID();
  await prisma.organization.create({
    data: { id, companyName: `VO5A ${id.slice(0, 8)}`, businessType: BusinessType.RENTAL },
  });
  await ensureOrganizationProductEntitlement(prisma, id, ProductSlug.RENTAL);
  return id;
}

async function createActiveVehicle(prisma: PrismaClient, orgId: string, dimoId?: string) {
  const vehicleId = randomUUID();
  const vin = `VIN${randomUUID().replace(/-/g, '').slice(0, 14)}`;
  await prisma.$executeRaw`
    INSERT INTO vehicles (
      id, organization_id, vin, make, model, year, fuel_type, registry_lifecycle,
      dimo_vehicle_id, status, created_at, updated_at
    ) VALUES (
      ${vehicleId}, ${orgId}, ${vin}, 'Audi', 'A3', 2021, 'GASOLINE'::"FuelType",
      'ACTIVE'::"VehicleRegistryLifecycle",
      ${dimoId ?? null},
      'AVAILABLE'::"VehicleStatus",
      NOW(), NOW()
    )
  `;
  await prisma.vehicleOrganizationAssignment.create({
    data: {
      id: randomUUID(),
      vehicleId,
      organizationId: orgId,
      validFrom: new Date(),
      assignmentReason: 'TEST_FIXTURE',
      assignmentSource: 'VO5A_TEST',
    },
  });
  return { vehicleId, vin };
}

(run ? describe : describe.skip)('VO-5A offboarding foundation (PostgreSQL)', () => {
  jest.setTimeout(120_000);
  const prisma = new PrismaClient();
  const offboarding = createVehicleOffboardingServiceForTests(prisma);

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('ACTIVE -> OFFBOARDED retains Vehicle row and id', async () => {
    const orgId = await createOrg(prisma);
    const { vehicleId } = await createActiveVehicle(prisma, orgId);
    const result = await offboarding.offboardVehicle({
      organizationId: orgId,
      vehicleId,
      reason: 'REMOVE_FROM_PRODUCT',
      actorUserId: null,
      idempotencyKey: randomUUID(),
    });
    expect(result.registryLifecycle).toBe('OFFBOARDED');
    const rows = await prisma.$queryRaw<Array<{ id: string; registry_lifecycle: string }>>`
      SELECT id, registry_lifecycle FROM vehicles WHERE id = ${vehicleId}
    `;
    expect(rows[0]?.id).toBe(vehicleId);
    expect(rows[0]?.registry_lifecycle).toBe('OFFBOARDED');
  });

  it('writes VEHICLE_OFFBOARDED outbox atomically and idempotent replay', async () => {
    const orgId = await createOrg(prisma);
    const { vehicleId } = await createActiveVehicle(prisma, orgId);
    const idempotencyKey = randomUUID();
    const before = await prisma.vehicleRegistryLifecycleOutbox.count({
      where: { vehicleId, eventType: 'VEHICLE_OFFBOARDED' },
    });
    await offboarding.offboardVehicle({
      organizationId: orgId,
      vehicleId,
      reason: 'OFFBOARD_SOLD',
      actorUserId: null,
      idempotencyKey,
    });
    expect(
      await prisma.vehicleRegistryLifecycleOutbox.count({
        where: { vehicleId, eventType: 'VEHICLE_OFFBOARDED' },
      }),
    ).toBe(before + 1);
    const replay = await offboarding.offboardVehicle({
      organizationId: orgId,
      vehicleId,
      reason: 'OFFBOARD_SOLD',
      actorUserId: null,
      idempotencyKey,
    });
    expect(replay.idempotentReplay).toBe(true);
    expect(
      await prisma.vehicleRegistryLifecycleOutbox.count({
        where: { vehicleId, eventType: 'VEHICLE_OFFBOARDED' },
      }),
    ).toBe(before + 1);
  });

  it('closes organization assignment and deactivates provider links', async () => {
    const orgId = await createOrg(prisma);
    const dimoId = randomUUID();
    await prisma.$executeRaw`
      INSERT INTO dimo_vehicles (id, external_id, vin, make, model, year, fuel_type, connection_status, created_at, updated_at)
      VALUES (${dimoId}, ${`ext-${dimoId.slice(0, 8)}`}, null, 'Audi', 'A3', 2021, 'GASOLINE', 'CONNECTED'::"DimoConnectionStatus", NOW(), NOW())
    `;
    const { vehicleId } = await createActiveVehicle(prisma, orgId, dimoId);
    const linkId = randomUUID();
    await prisma.vehicleDataSourceLink.create({
      data: {
        id: linkId,
        vehicleId,
        provider: 'DIMO',
        sourceType: 'DIMO',
        dimoVehicleId: dimoId,
        isActive: true,
      },
    });
    await offboarding.offboardVehicle({
      organizationId: orgId,
      vehicleId,
      reason: 'ADMINISTRATIVE_OFFBOARD',
      actorUserId: null,
      idempotencyKey: randomUUID(),
    });
    const assignment = await prisma.vehicleOrganizationAssignment.findFirst({
      where: { vehicleId, organizationId: orgId },
    });
    expect(assignment?.validTo).not.toBeNull();
    const link = await prisma.vehicleDataSourceLink.findUniqueOrThrow({ where: { id: linkId } });
    expect(link.isActive).toBe(false);
    expect(link.deactivatedAt).not.toBeNull();
    const mirrors = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM dimo_vehicles WHERE id = ${dimoId}
    `;
    expect(mirrors[0]?.id).toBe(dimoId);
    const vehicleRows = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM vehicles WHERE id = ${vehicleId}
    `;
    expect(vehicleRows.length).toBe(1);
  });

  it('rollback leaves lifecycle unchanged when outbox idempotency conflicts', async () => {
    const orgId = await createOrg(prisma);
    const { vehicleId } = await createActiveVehicle(prisma, orgId);
    const { vehicleId: otherVehicleId } = await createActiveVehicle(prisma, orgId);
    const sharedKey = randomUUID();
    await prisma.vehicleRegistryLifecycleOutbox.create({
      data: {
        id: randomUUID(),
        eventId: randomUUID(),
        eventType: 'VEHICLE_OFFBOARDED',
        vehicleId: otherVehicleId,
        organizationId: orgId,
        payloadVersion: 1,
        payload: {
          version: 1,
          vehicleId: otherVehicleId,
          organizationId: orgId,
          registryLifecycle: 'OFFBOARDED',
          offboardedAt: new Date().toISOString(),
          reason: 'OFFBOARD_SOLD',
        },
        occurredAt: new Date(),
        idempotencyKey: `vehicle-onboarding:VEHICLE_OFFBOARDED:v1:${sharedKey}`,
      },
    });
    await expect(
      offboarding.offboardVehicle({
        organizationId: orgId,
        vehicleId,
        reason: 'OFFBOARD_SOLD',
        actorUserId: null,
        idempotencyKey: sharedKey,
      }),
    ).rejects.toMatchObject({ code: 'OUTBOX_IDEMPOTENCY_CONFLICT' });
    const rows = await prisma.$queryRaw<Array<{ registry_lifecycle: string }>>`
      SELECT registry_lifecycle FROM vehicles WHERE id = ${vehicleId}
    `;
    expect(rows[0]?.registry_lifecycle).toBe('ACTIVE');
  });

  it('OFFBOARDED dimo-associated vehicle does not reappear as VO-4.10 candidate', async () => {
    const orgId = await createOrg(prisma);
    const dimoId = randomUUID();
    await prisma.$executeRaw`
      INSERT INTO dimo_vehicles (id, external_id, vin, make, model, year, fuel_type, connection_status, created_at, updated_at)
      VALUES (${dimoId}, ${`ext-${dimoId.slice(0, 8)}`}, null, 'Audi', 'A3', 2021, 'GASOLINE', 'CONNECTED'::"DimoConnectionStatus", NOW(), NOW())
    `;
    const { vehicleId } = await createActiveVehicle(prisma, orgId, dimoId);
    await offboarding.offboardVehicle({
      organizationId: orgId,
      vehicleId,
      reason: 'REMOVE_FROM_PRODUCT',
      actorUserId: null,
      idempotencyKey: randomUUID(),
    });
    const candidates = new VehicleOnboardingProviderCandidateService(
      prisma as any,
      new VehicleOnboardingSourceAdoptionAuthority(),
    );
    const list = await candidates.listProviderCandidates(
      orgId,
      parseCandidateListQuery({ provider: 'DIMO', limit: '100' }),
    );
    expect(list.items.some((c) => c.sourceMirrorId === dimoId)).toBe(false);
  });

  it('same idempotency key with different reason fails closed', async () => {
    const orgId = await createOrg(prisma);
    const { vehicleId } = await createActiveVehicle(prisma, orgId);
    const idempotencyKey = randomUUID();
    await offboarding.offboardVehicle({
      organizationId: orgId,
      vehicleId,
      reason: 'OFFBOARD_SOLD',
      actorUserId: 'actor-1',
      idempotencyKey,
    });
    await expect(
      offboarding.offboardVehicle({
        organizationId: orgId,
        vehicleId,
        reason: 'REMOVE_FROM_PRODUCT',
        actorUserId: 'actor-1',
        idempotencyKey,
      }),
    ).rejects.toMatchObject({ code: 'OUTBOX_IDEMPOTENCY_CONFLICT' });
  });

  it('same idempotency key with different organization fails closed', async () => {
    const orgA = await createOrg(prisma);
    const orgB = await createOrg(prisma);
    const { vehicleId } = await createActiveVehicle(prisma, orgA);
    const idempotencyKey = randomUUID();
    await offboarding.offboardVehicle({
      organizationId: orgA,
      vehicleId,
      reason: 'OFFBOARD_SOLD',
      actorUserId: null,
      idempotencyKey,
    });
    await expect(
      offboarding.offboardVehicle({
        organizationId: orgB,
        vehicleId,
        reason: 'OFFBOARD_SOLD',
        actorUserId: null,
        idempotencyKey,
      }),
    ).rejects.toMatchObject({ code: 'CASE_NOT_FOUND' });
  });

  it('durably attributes actorUserId in outbox payload v2', async () => {
    const orgId = await createOrg(prisma);
    const { vehicleId } = await createActiveVehicle(prisma, orgId);
    const actorUserId = randomUUID();
    const idempotencyKey = randomUUID();
    await offboarding.offboardVehicle({
      organizationId: orgId,
      vehicleId,
      reason: 'ADMINISTRATIVE_OFFBOARD',
      actorUserId,
      idempotencyKey,
    });
    const row = await prisma.vehicleRegistryLifecycleOutbox.findFirst({
      where: { vehicleId, eventType: 'VEHICLE_OFFBOARDED' },
    });
    expect(row?.payloadVersion).toBe(2);
    const payload = row?.payload as { actorUserId?: string };
    expect(payload.actorUserId).toBe(actorUserId);
  });

  it('revokes active provider consent episodes transactionally', async () => {
    const orgId = await createOrg(prisma);
    const { vehicleId } = await createActiveVehicle(prisma, orgId);
    const consentId = randomUUID();
    await prisma.vehicleProviderConsent.create({
      data: {
        id: consentId,
        vehicleId,
        organizationId: orgId,
        provider: 'DIMO',
        grantType: 'DIMO_DIRECT',
        status: VehicleProviderConsentStatus.ACTIVE,
        grantedAt: new Date(),
      },
    });
    await offboarding.offboardVehicle({
      organizationId: orgId,
      vehicleId,
      reason: 'REMOVE_FROM_PRODUCT',
      actorUserId: null,
      idempotencyKey: randomUUID(),
    });
    const consent = await prisma.vehicleProviderConsent.findUniqueOrThrow({
      where: { id: consentId },
    });
    expect(consent.status).toBe(VehicleProviderConsentStatus.REVOKED);
    expect(consent.revokedAt).not.toBeNull();
  });

  it('blocks DIMO link reactivation after offboard', async () => {
    const orgId = await createOrg(prisma);
    const dimoId = randomUUID();
    await prisma.$executeRaw`
      INSERT INTO dimo_vehicles (id, external_id, vin, make, model, year, fuel_type, connection_status, created_at, updated_at)
      VALUES (${dimoId}, ${`ext-${dimoId.slice(0, 8)}`}, null, 'Audi', 'A3', 2021, 'GASOLINE', 'CONNECTED'::"DimoConnectionStatus", NOW(), NOW())
    `;
    const { vehicleId } = await createActiveVehicle(prisma, orgId, dimoId);
    const linkId = randomUUID();
    await prisma.vehicleDataSourceLink.create({
      data: {
        id: linkId,
        vehicleId,
        provider: 'DIMO',
        sourceType: 'DIMO',
        dimoVehicleId: dimoId,
        isActive: true,
      },
    });
    await offboarding.offboardVehicle({
      organizationId: orgId,
      vehicleId,
      reason: 'ADMINISTRATIVE_OFFBOARD',
      actorUserId: null,
      idempotencyKey: randomUUID(),
    });
    const linkService = createDimoVehicleDataSourceLinkServiceForTests(prisma);
    const result = await linkService.ensureDimoVehicleDataSourceLink({
      vehicleId,
      organizationId: orgId,
      dimoVehicleId: dimoId,
    });
    expect(result.action).toBe('CONFLICT');
    expect(result.reason).toBe('vehicle_registry_not_operational');
  });

  it('concurrent offboard with same idempotency converges safely', async () => {
    const orgId = await createOrg(prisma);
    const { vehicleId } = await createActiveVehicle(prisma, orgId);
    const idempotencyKey = randomUUID();
    const [a, b] = await Promise.allSettled([
      offboarding.offboardVehicle({
        organizationId: orgId,
        vehicleId,
        reason: 'ADMINISTRATIVE_OFFBOARD',
        actorUserId: null,
        idempotencyKey,
      }),
      offboarding.offboardVehicle({
        organizationId: orgId,
        vehicleId,
        reason: 'ADMINISTRATIVE_OFFBOARD',
        actorUserId: null,
        idempotencyKey,
      }),
    ]);
    const fulfilled = [a, b].filter((r) => r.status === 'fulfilled');
    expect(fulfilled.length).toBeGreaterThanOrEqual(1);
    const rows = await prisma.$queryRaw<Array<{ registry_lifecycle: string }>>`
      SELECT registry_lifecycle FROM vehicles WHERE id = ${vehicleId}
    `;
    expect(rows[0]?.registry_lifecycle).toBe('OFFBOARDED');
    expect(
      await prisma.vehicleRegistryLifecycleOutbox.count({
        where: { vehicleId, eventType: 'VEHICLE_OFFBOARDED' },
      }),
    ).toBe(1);
  });
});
