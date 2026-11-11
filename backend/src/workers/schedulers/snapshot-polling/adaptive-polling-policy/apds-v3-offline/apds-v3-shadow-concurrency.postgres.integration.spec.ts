/**
 * APDS V3 shadow PostgreSQL concurrency certification (disposable DB).
 *   APDS_V3_SHADOW_PG=1 DATABASE_URL=postgresql://... npm test -- apds-v3-shadow-concurrency.postgres.integration.spec.ts
 */
import { BusinessType, DimoConnectionStatus, FuelType, PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { APDS_V3_OFFLINE_POLICY_VERSION } from './apds-v3-offline.types';
import { APDS_V3_SHADOW_ACTIVATION_VERSION } from './apds-v3-shadow.config';
import {
  ApdsV3ShadowImmutableConflictError,
  ApdsV3ShadowRepository,
} from './apds-v3-shadow.repository';

const databaseUrl = process.env.DATABASE_URL;
const pgEnabled =
  process.env.APDS_V3_SHADOW_PG === '1' || process.env.APDS_V3_SHADOW_PG === 'true';
const describePg = databaseUrl && pgEnabled ? describe : describe.skip;

describePg('APDS V3 shadow decision concurrency (PostgreSQL)', () => {
  jest.setTimeout(120_000);
  const prismaA = new PrismaClient();
  const prismaB = new PrismaClient();
  let organizationA = '';
  let organizationB = '';
  let vehicleA = '';
  let vehicleB = '';
  let linkA = '';
  let linkB = '';
  let dimoVehicleA = '';
  let dimoVehicleB = '';
  const policyVersion = APDS_V3_OFFLINE_POLICY_VERSION;
  const decisionAt = new Date('2026-11-11T10:00:00.000Z');

  function baseRow(orgId: string, vehId: string, linkId: string, physicalRequestId: string) {
    return {
      organizationId: orgId,
      vehicleId: vehId,
      providerSourceLinkId: linkId,
      physicalRequestId,
      physicalRequestIdentityClass: 'DERIVED' as const,
      correlationAttemptId: null,
      decisionAt,
      activationVersion: APDS_V3_SHADOW_ACTIVATION_VERSION,
      policyVersion,
      baselineCanonicalDue: false,
      baselineAuthority: 'BASELINE_PARTIAL_PARITY',
      baselineAssessable: false,
      v3Decision: 'NOT_ASSESSABLE',
      v3Reason: 'PG_CONCURRENCY',
      expectedInformationGain: null,
      informationGainHeuristic: false,
      consumerDemandFailClosed: true,
      observationQuality: null,
      observationScope: 'BASELINE_PHYSICAL_POLL_START_ONLY',
      missingEvidenceReasons: ['INTEGRATION_TEST'],
    };
  }

  beforeAll(async () => {
    const orgA = await prismaA.organization.create({
      data: {
        companyName: `APDS_V3_PG_A_${Date.now()}`,
        businessType: BusinessType.RENTAL,
      },
      select: { id: true },
    });
    organizationA = orgA.id;
    const orgB = await prismaA.organization.create({
      data: {
        companyName: `APDS_V3_PG_B_${Date.now()}`,
        businessType: BusinessType.RENTAL,
      },
      select: { id: true },
    });
    organizationB = orgB.id;

    dimoVehicleA = randomUUID();
    dimoVehicleB = randomUUID();
    await prismaA.dimoVehicle.create({
      data: {
        id: dimoVehicleA,
        externalId: `apds-v3-ext-${dimoVehicleA}`,
        tokenId: 8_100_000 + Math.floor(Math.random() * 1_000_000),
        connectionStatus: DimoConnectionStatus.CONNECTED,
        make: 'Test',
        model: 'ApdsV3',
        year: 2026,
        fuelType: 'ELECTRIC',
      },
    });
    await prismaA.dimoVehicle.create({
      data: {
        id: dimoVehicleB,
        externalId: `apds-v3-ext-${dimoVehicleB}`,
        tokenId: 8_200_000 + Math.floor(Math.random() * 1_000_000),
        connectionStatus: DimoConnectionStatus.CONNECTED,
        make: 'Test',
        model: 'ApdsV3',
        year: 2026,
        fuelType: 'ELECTRIC',
      },
    });

    const vA = await prismaA.vehicle.create({
      data: {
        organizationId: organizationA,
        make: 'Test',
        model: 'ApdsV3',
        year: 2026,
        fuelType: FuelType.ELECTRIC,
        vehicleName: `v3-a-${Date.now()}`,
        dimoVehicleId: dimoVehicleA,
      },
      select: { id: true },
    });
    vehicleA = vA.id;
    const vB = await prismaA.vehicle.create({
      data: {
        organizationId: organizationB,
        make: 'Test',
        model: 'ApdsV3',
        year: 2026,
        fuelType: FuelType.ELECTRIC,
        vehicleName: `v3-b-${Date.now()}`,
        dimoVehicleId: dimoVehicleB,
      },
      select: { id: true },
    });
    vehicleB = vB.id;

    const lA = await prismaA.vehicleDataSourceLink.create({
      data: {
        vehicleId: vehicleA,
        provider: 'DIMO',
        sourceType: 'DIMO',
        dimoVehicleId: dimoVehicleA,
        isActive: true,
      },
      select: { id: true },
    });
    linkA = lA.id;
    const lB = await prismaA.vehicleDataSourceLink.create({
      data: {
        vehicleId: vehicleB,
        provider: 'DIMO',
        sourceType: 'DIMO',
        dimoVehicleId: dimoVehicleB,
        isActive: true,
      },
      select: { id: true },
    });
    linkB = lB.id;
  });

  afterAll(async () => {
    await prismaA.apdsV3ShadowDecision.deleteMany({
      where: { organizationId: { in: [organizationA, organizationB] } },
    });
    await prismaA.vehicleDataSourceLink.deleteMany({
      where: { vehicleId: { in: [vehicleA, vehicleB] } },
    });
    await prismaA.vehicle.deleteMany({
      where: { id: { in: [vehicleA, vehicleB] } },
    });
    await prismaA.dimoVehicle.deleteMany({
      where: { id: { in: [dimoVehicleA, dimoVehicleB] } },
    });
    await prismaA.organization.deleteMany({
      where: { id: { in: [organizationA, organizationB] } },
    });
    await prismaA.$disconnect();
    await prismaB.$disconnect();
  });

  it('two concurrent identical inserts: one insert + idempotent replay', async () => {
    const repoA = new ApdsV3ShadowRepository(prismaA as never);
    const repoB = new ApdsV3ShadowRepository(prismaB as never);
    const physicalRequestId = `physical-fetch:race-identical:${Date.now()}`;
    const row = baseRow(organizationA, vehicleA, linkA, physicalRequestId);
    const [outA, outB] = await Promise.all([
      repoA.insertPollStartDecision(row),
      repoB.insertPollStartDecision(row),
    ]);
    const outcomes = [outA, outB].sort();
    expect(outcomes).toEqual(['idempotent_replay', 'inserted']);
    const count = await prismaA.apdsV3ShadowDecision.count({
      where: { organizationId: organizationA, physicalRequestId },
    });
    expect(count).toBe(1);
  });

  it('two concurrent conflicting inserts preserve immutable original row', async () => {
    const repoA = new ApdsV3ShadowRepository(prismaA as never);
    const repoB = new ApdsV3ShadowRepository(prismaB as never);
    const physicalRequestId = `physical-fetch:race-conflict:${Date.now()}`;
    const rowA = baseRow(organizationA, vehicleA, linkA, physicalRequestId);
    const rowB = { ...rowA, v3Decision: 'SKIP', v3Reason: 'CONFLICTING_SCIENTIFIC' };
    const first = repoA.insertPollStartDecision(rowA);
    const second = repoB.insertPollStartDecision(rowB);
    const results = await Promise.allSettled([first, second]);
    const inserted = results.filter((r) => r.status === 'fulfilled' && r.value === 'inserted');
    const conflicts = results.filter(
      (r) => r.status === 'rejected' && r.reason instanceof ApdsV3ShadowImmutableConflictError,
    );
    expect(inserted.length).toBe(1);
    expect(conflicts.length).toBe(1);
    const stored = await prismaA.apdsV3ShadowDecision.findUnique({
      where: {
        organizationId_vehicleId_physicalRequestId_policyVersion: {
          organizationId: organizationA,
          vehicleId: vehicleA,
          physicalRequestId,
          policyVersion,
        },
      },
    });
    expect(stored?.v3Decision).toBe('NOT_ASSESSABLE');
    expect(stored?.v3Reason).toBe('PG_CONCURRENCY');
    expect(stored?.decisionAt.toISOString()).toBe(decisionAt.toISOString());
  });

  it('distinct physical attempts for same vehicle both persist', async () => {
    const repo = new ApdsV3ShadowRepository(prismaA as never);
    const base = `physical-fetch:distinct:${Date.now()}`;
    const run0 = baseRow(organizationA, vehicleA, linkA, `${base}:run:0`);
    const run1 = baseRow(organizationA, vehicleA, linkA, `${base}:run:1`);
    expect(await repo.insertPollStartDecision(run0)).toBe('inserted');
    expect(await repo.insertPollStartDecision(run1)).toBe('inserted');
    const count = await prismaA.apdsV3ShadowDecision.count({
      where: { organizationId: organizationA, vehicleId: vehicleA, physicalRequestId: { startsWith: base } },
    });
    expect(count).toBe(2);
  });

  it('cross-tenant rows remain isolated under concurrent load', async () => {
    const repoA = new ApdsV3ShadowRepository(prismaA as never);
    const repoB = new ApdsV3ShadowRepository(prismaB as never);
    const stamp = Date.now();
    const rowA = baseRow(organizationA, vehicleA, linkA, `physical-fetch:tenant-a:${stamp}`);
    const rowB = baseRow(organizationB, vehicleB, linkB, `physical-fetch:tenant-b:${stamp}`);
    await Promise.all([repoA.insertPollStartDecision(rowA), repoB.insertPollStartDecision(rowB)]);
    const countA = await prismaA.apdsV3ShadowDecision.count({ where: { organizationId: organizationA } });
    const countB = await prismaA.apdsV3ShadowDecision.count({ where: { organizationId: organizationB } });
    expect(countA).toBeGreaterThanOrEqual(1);
    expect(countB).toBe(1);
    const leak = await prismaA.apdsV3ShadowDecision.findFirst({
      where: { organizationId: organizationA, vehicleId: vehicleB },
    });
    expect(leak).toBeNull();
  });
});
