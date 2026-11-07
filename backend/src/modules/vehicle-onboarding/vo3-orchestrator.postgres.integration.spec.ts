/**
 * VO-3 / VO-3.1 / VO-3.2 orchestrator + activation (PostgreSQL).
 */
import { PrismaClient, BusinessType } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import {
  createVehicleOnboardingTestHarness,
  dimoOnboardingActor,
  sealCaseReadyForTest,
  activateForTest,
} from './testing/vehicle-onboarding-test.harness';
import { ProductionFailClosedReadinessAuthority } from './readiness/vehicle-onboarding-readiness-authority';
import { VehicleOnboardingReadinessService } from './services/vehicle-onboarding-readiness.service';
import { VehicleOnboardingActivationService } from './services/vehicle-onboarding-activation.service';
import { createDimoVehicleDataSourceLinkServiceForTests } from './testing/vehicle-onboarding-test.harness';
import { activationOutboxIdempotencyKey } from './services/vehicle-onboarding-activation.service';
import type { Vo3ActivationFaultStage } from './services/vehicle-onboarding-activation.service';
import { DEFAULT_TENANT_SOURCE_ADOPTION } from './source-adoption/source-adoption.context';
import { PLATFORM_TRUSTED_SOURCE_ADOPTION } from './source-adoption/platform-trusted-adoption.context';
import { insertDimoMirrorForPostgresTests } from './testing/dimo-mirror-postgres.fixture';

const run = process.env.VO3_ORCHESTRATOR_PG === '1';

async function createOrg(prisma: PrismaClient): Promise<string> {
  const id = randomUUID();
  await prisma.organization.create({
    data: {
      id,
      companyName: `VO3 ${id.slice(0, 8)}`,
      businessType: BusinessType.RENTAL,
    },
  });
  return id;
}

async function createDimoMirror(
  prisma: PrismaClient,
  dimoId: string,
  externalId: string,
  vin: string | null,
  _make = 'Audi',
  _model = 'A3',
  rawJson?: object,
) {
  await insertDimoMirrorForPostgresTests(prisma, {
    id: dimoId,
    externalId,
    vin,
    rawJson,
  });
}

interface ActivationAttemptBaseline {
  orgId: string;
  caseId: string;
  vehicleCount: number;
  caseStatus: string;
  caseVehicleId: string | null;
  orgAssignmentCount: number;
  plateAssignmentCount: number;
  dataSourceLinkCount: number;
  providerConsentCount: number;
  outboxCount: number;
  hmId?: string;
  hmRegistrationState?: string;
  hmLinked?: boolean;
  hmHistoryCount?: number;
  dimoId?: string;
  dimoVehicleBindingCount?: number;
}

async function captureActivationBaseline(
  prisma: PrismaClient,
  orgId: string,
  caseId: string,
  opts: { hmId?: string; dimoId?: string } = {},
): Promise<ActivationAttemptBaseline> {
  const caseRow = await prisma.vehicleOnboardingCase.findUniqueOrThrow({ where: { id: caseId } });
  let hmState: { registrationState: string; isLinked: boolean } | null = null;
  if (opts.hmId) {
    hmState = await prisma.highMobilityVehicle.findUnique({
      where: { id: opts.hmId },
      select: { registrationState: true, isLinked: true },
    });
  }
  const dimoBindingCount = opts.dimoId
    ? await prisma.vehicle.count({ where: { dimoVehicleId: opts.dimoId } })
    : 0;
  const hmHistoryCount = opts.hmId
    ? await prisma.highMobilityStatusHistory.count({
        where: { highMobilityVehicleId: opts.hmId },
      })
    : 0;

  return {
    orgId,
    caseId,
    vehicleCount: await prisma.vehicle.count({ where: { organizationId: orgId } }),
    caseStatus: caseRow.status,
    caseVehicleId: caseRow.vehicleId,
    orgAssignmentCount: await prisma.vehicleOrganizationAssignment.count(),
    plateAssignmentCount: await prisma.vehicleLicensePlateAssignment.count(),
    dataSourceLinkCount: await prisma.vehicleDataSourceLink.count(),
    providerConsentCount: await prisma.vehicleProviderConsent.count({
      where: { organizationId: orgId },
    }),
    outboxCount: await prisma.vehicleRegistryLifecycleOutbox.count({
      where: { idempotencyKey: activationOutboxIdempotencyKey(caseId) },
    }),
    hmId: opts.hmId,
    hmRegistrationState: hmState?.registrationState,
    hmLinked: hmState?.isLinked,
    hmHistoryCount,
    dimoId: opts.dimoId,
    dimoVehicleBindingCount: dimoBindingCount,
  };
}

async function assertNoActivationArtifactsSince(
  prisma: PrismaClient,
  baseline: ActivationAttemptBaseline,
) {
  const caseRow = await prisma.vehicleOnboardingCase.findUnique({ where: { id: baseline.caseId } });
  expect(caseRow?.status).not.toBe('COMPLETED');
  expect(caseRow?.vehicleId).toBeNull();
  expect(await prisma.vehicle.count({ where: { organizationId: baseline.orgId } })).toBe(
    baseline.vehicleCount,
  );
  expect(await prisma.vehicleOrganizationAssignment.count()).toBe(baseline.orgAssignmentCount);
  expect(await prisma.vehicleLicensePlateAssignment.count()).toBe(baseline.plateAssignmentCount);
  expect(await prisma.vehicleDataSourceLink.count()).toBe(baseline.dataSourceLinkCount);
  expect(
    await prisma.vehicleProviderConsent.count({ where: { organizationId: baseline.orgId } }),
  ).toBe(baseline.providerConsentCount);
  expect(
    await prisma.vehicleRegistryLifecycleOutbox.count({
      where: { idempotencyKey: activationOutboxIdempotencyKey(baseline.caseId) },
    }),
  ).toBe(baseline.outboxCount);

  if (baseline.hmId) {
    const hm = await prisma.highMobilityVehicle.findUnique({ where: { id: baseline.hmId } });
    expect(hm?.registrationState).toBe(baseline.hmRegistrationState);
    expect(hm?.isLinked).toBe(baseline.hmLinked);
    expect(
      await prisma.highMobilityStatusHistory.count({
        where: { highMobilityVehicleId: baseline.hmId },
      }),
    ).toBe(baseline.hmHistoryCount);
  }
  if (baseline.dimoId) {
    expect(await prisma.vehicle.count({ where: { dimoVehicleId: baseline.dimoId } })).toBe(
      baseline.dimoVehicleBindingCount,
    );
  }
}

async function sealDimoCaseReady(
  prisma: PrismaClient,
  orgId: string,
  caseId: string,
  dimoId: string,
) {
  await prisma.vehicleOnboardingCase.update({
    where: { id: caseId },
    data: {
      draftIdentityJson: {
        version: 1,
        vin: null,
        vinProvenance: null,
        vinVerificationState: null,
        make: 'Audi',
        model: 'A3',
        year: 2021,
        fuelType: 'GASOLINE',
        sourceEvidenceRefs: [],
      },
    },
  });
  await sealCaseReadyForTest(prisma, orgId, caseId);
}

async function sealHmCaseReady(
  prisma: PrismaClient,
  orgId: string,
  caseId: string,
  vin: string,
) {
  await prisma.vehicleOnboardingCase.update({
    where: { id: caseId },
    data: {
      draftIdentityJson: {
        version: 1,
        vin,
        vinProvenance: 'PROVIDER',
        vinVerificationState: 'UNVERIFIED',
        make: 'BMW',
        model: 'i3',
        year: 2020,
        fuelType: 'ELECTRIC',
        sourceEvidenceRefs: [],
      },
    },
  });
  await sealCaseReadyForTest(prisma, orgId, caseId);
}

(run ? describe : describe.skip)('VO-3 vehicle onboarding orchestrator', () => {
  const prisma = new PrismaClient();
  const harness = createVehicleOnboardingTestHarness(prisma);

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('ORG_A HM attach to ORG_A case passes', async () => {
    const orgA = await createOrg(prisma);
    const hmId = randomUUID();
    await prisma.highMobilityVehicle.create({
      data: {
        id: hmId,
        organizationId: orgA,
        vin: `HM${randomUUID().replace(/-/g, '').slice(0, 14)}`,
        brand: 'BMW',
        packageType: 'HEALTH',
        sourceMode: 'HM_ONLY',
        clearanceStatus: 'APPROVED',
        hmVehicleReference: `hm-ref-${hmId.slice(0, 8)}`,
      },
    });
    const dimoId = randomUUID();
    await createDimoMirror(prisma, dimoId, `ext-${dimoId.slice(0, 6)}`, null);
    const caseRow = await harness.caseService.openOrResumeFromDimo(
      dimoOnboardingActor(orgA),
      dimoId,
    );
    await harness.caseService.attachHighMobilitySource(
      { organizationId: orgA, sourceAdoption: DEFAULT_TENANT_SOURCE_ADOPTION },
      caseRow.id,
      hmId,
    );
    const refs = await prisma.vehicleOnboardingCaseSourceRef.count({
      where: { onboardingCaseId: caseRow.id, provider: 'HIGH_MOBILITY' },
    });
    expect(refs).toBe(1);
  });

  it('ORG_A HM attach to ORG_B case is SOURCE_NOT_AVAILABLE', async () => {
    const orgA = await createOrg(prisma);
    const orgB = await createOrg(prisma);
    const hmId = randomUUID();
    await prisma.highMobilityVehicle.create({
      data: {
        id: hmId,
        organizationId: orgA,
        vin: `HM${randomUUID().replace(/-/g, '').slice(0, 14)}`,
        brand: 'BMW',
        packageType: 'HEALTH',
        sourceMode: 'HM_ONLY',
        clearanceStatus: 'APPROVED',
        hmVehicleReference: `hm-ref-${hmId.slice(0, 8)}`,
      },
    });
    const dimoId = randomUUID();
    await createDimoMirror(prisma, dimoId, `ext-${dimoId.slice(0, 8)}`, null);
    const caseB = await harness.caseService.openOrResumeFromDimo(
      dimoOnboardingActor(orgB),
      dimoId,
    );
    await expect(
      harness.caseService.attachHighMobilitySource(
        { organizationId: orgB, sourceAdoption: DEFAULT_TENANT_SOURCE_ADOPTION },
        caseB.id,
        hmId,
      ),
    ).rejects.toMatchObject({ code: 'SOURCE_NOT_AVAILABLE' });
  });

  it('global HM attach from tenant context is blocked', async () => {
    const orgId = await createOrg(prisma);
    const hmId = randomUUID();
    await prisma.highMobilityVehicle.create({
      data: {
        id: hmId,
        organizationId: null,
        vin: `HM${randomUUID().replace(/-/g, '').slice(0, 14)}`,
        brand: 'BMW',
        packageType: 'HEALTH',
        sourceMode: 'HM_ONLY',
        clearanceStatus: 'APPROVED',
        hmVehicleReference: `hm-ref-${hmId.slice(0, 8)}`,
      },
    });
    const dimoId = randomUUID();
    await createDimoMirror(prisma, dimoId, `ext-${dimoId.slice(0, 8)}`, null);
    const caseRow = await harness.caseService.openOrResumeFromDimo(
      dimoOnboardingActor(orgId),
      dimoId,
    );
    await expect(
      harness.caseService.attachHighMobilitySource(
        { organizationId: orgId, sourceAdoption: DEFAULT_TENANT_SOURCE_ADOPTION },
        caseRow.id,
        hmId,
      ),
    ).rejects.toMatchObject({ code: 'SOURCE_NOT_AVAILABLE' });
  });

  it('global HM attach from platform trusted context passes', async () => {
    const orgId = await createOrg(prisma);
    const hmId = randomUUID();
    await prisma.highMobilityVehicle.create({
      data: {
        id: hmId,
        organizationId: null,
        vin: `HM${randomUUID().replace(/-/g, '').slice(0, 14)}`,
        brand: 'BMW',
        packageType: 'HEALTH',
        sourceMode: 'HM_ONLY',
        clearanceStatus: 'APPROVED',
        hmVehicleReference: `hm-ref-${hmId.slice(0, 8)}`,
      },
    });
    const dimoId = randomUUID();
    await createDimoMirror(prisma, dimoId, `ext-${dimoId.slice(0, 8)}`, null);
    const caseRow = await harness.caseService.openOrResumeFromDimo(
      dimoOnboardingActor(orgId),
      dimoId,
    );
    await harness.caseService.attachHighMobilitySource(
      {
        organizationId: orgId,
        sourceAdoption: { mode: 'PLATFORM_TRUSTED_ADOPTION' },
      },
      caseRow.id,
      hmId,
    );
    expect(
      await prisma.vehicleOnboardingCaseSourceRef.count({
        where: { onboardingCaseId: caseRow.id, provider: 'HIGH_MOBILITY' },
      }),
    ).toBe(1);
  });

  it('composite VIN conflict uses authorized HM attach', async () => {
    const orgId = await createOrg(prisma);
    const dimoId = randomUUID();
    const hmId = randomUUID();
    const vinA = `VINA${randomUUID().replace(/-/g, '').slice(0, 10)}`;
    const vinB = `VINB${randomUUID().replace(/-/g, '').slice(0, 10)}`;
    await createDimoMirror(prisma, dimoId, `ext-${dimoId.slice(0, 8)}`, vinA);
    await prisma.highMobilityVehicle.create({
      data: {
        id: hmId,
        organizationId: orgId,
        vin: vinB,
        brand: 'BMW',
        packageType: 'HEALTH',
        sourceMode: 'HM_ONLY',
        clearanceStatus: 'APPROVED',
        hmVehicleReference: `hm-ref-${hmId.slice(0, 8)}`,
      },
    });
    const caseRow = await harness.caseService.openOrResumeFromDimo(
      dimoOnboardingActor(orgId),
      dimoId,
    );
    await harness.caseService.attachHighMobilitySource(
      { organizationId: orgId, sourceAdoption: DEFAULT_TENANT_SOURCE_ADOPTION },
      caseRow.id,
      hmId,
    );
    await sealDimoCaseReady(prisma, orgId, caseRow.id, dimoId);
    const baseline = await captureActivationBaseline(prisma, orgId, caseRow.id, {
      hmId,
      dimoId,
    });
    await expect(
      activateForTest(harness, {
        organizationId: orgId,
        onboardingCaseId: caseRow.id,
        actorUserId: null,
      }),
    ).rejects.toMatchObject({ code: 'IDENTITY_REVIEW_REQUIRED' });
    await assertNoActivationArtifactsSince(prisma, baseline);
  });

  it('composite DIMO + HM happy path via authorized attach', async () => {
    const orgId = await createOrg(prisma);
    const sharedVin = `VIN${randomUUID().replace(/-/g, '').slice(0, 14)}`;
    const dimoId = randomUUID();
    const hmId = randomUUID();
    await createDimoMirror(prisma, dimoId, `ext-${dimoId.slice(0, 8)}`, sharedVin);
    await prisma.highMobilityVehicle.create({
      data: {
        id: hmId,
        organizationId: orgId,
        vin: sharedVin,
        brand: 'BMW',
        packageType: 'HEALTH',
        sourceMode: 'HM_ONLY',
        clearanceStatus: 'APPROVED',
        hmVehicleReference: `hm-ref-${hmId.slice(0, 8)}`,
      },
    });
    const caseRow = await harness.caseService.openOrResumeFromDimo(
      dimoOnboardingActor(orgId),
      dimoId,
    );
    await prisma.vehicleOnboardingCase.update({
      where: { id: caseRow.id },
      data: {
        draftIdentityJson: {
          version: 1,
          vin: sharedVin,
          vinProvenance: 'PROVIDER',
          vinVerificationState: 'UNVERIFIED',
          make: 'Audi',
          model: 'A3',
          year: 2021,
          fuelType: 'GASOLINE',
          sourceEvidenceRefs: [],
        },
      },
    });
    await harness.caseService.attachHighMobilitySource(
      { organizationId: orgId, sourceAdoption: DEFAULT_TENANT_SOURCE_ADOPTION },
      caseRow.id,
      hmId,
    );
    await sealCaseReadyForTest(prisma, orgId, caseRow.id);
    const first = await activateForTest(harness, {
      organizationId: orgId,
      onboardingCaseId: caseRow.id,
      actorUserId: 'u1',
    });
    const second = await activateForTest(harness, {
      organizationId: orgId,
      onboardingCaseId: caseRow.id,
      actorUserId: 'u1',
    });
    expect(second.created).toBe(false);
    expect(second.vehicleId).toBe(first.vehicleId);
    expect(await prisma.vehicle.count({ where: { organizationId: orgId } })).toBe(1);
    expect(
      await prisma.vehicleOrganizationAssignment.count({
        where: { vehicleId: first.vehicleId, validTo: null },
      }),
    ).toBe(1);
    expect(
      await prisma.vehicleRegistryLifecycleOutbox.count({
        where: { idempotencyKey: activationOutboxIdempotencyKey(caseRow.id) },
      }),
    ).toBe(1);
  });

  it('concurrent activation converges to one vehicle', async () => {
    const orgId = await createOrg(prisma);
    const dimoId = randomUUID();
    await createDimoMirror(prisma, dimoId, `ext-${dimoId.slice(0, 8)}`, null);
    const caseRow = await harness.caseService.openOrResumeFromDimo(
      dimoOnboardingActor(orgId),
      dimoId,
    );
    await sealDimoCaseReady(prisma, orgId, caseRow.id, dimoId);
    const input = {
      organizationId: orgId,
      onboardingCaseId: caseRow.id,
      actorUserId: null,
    };
    const concurrentCalls = 3;
    const results = await Promise.all(
      Array.from({ length: concurrentCalls }, () => activateForTest(harness, input)),
    );
    const vehicleIds = new Set(results.map((r) => r.vehicleId));
    expect(vehicleIds.size).toBe(1);
    const vehicleId = results[0]!.vehicleId;
    expect(await prisma.vehicle.count({ where: { organizationId: orgId } })).toBe(1);
    const completed = await prisma.vehicleOnboardingCase.findUnique({ where: { id: caseRow.id } });
    expect(completed?.status).toBe('COMPLETED');
    expect(completed?.vehicleId).toBe(vehicleId);
    expect(
      await prisma.vehicleOrganizationAssignment.count({
        where: { vehicleId, organizationId: orgId, validTo: null },
      }),
    ).toBe(1);
    expect(
      await prisma.vehicleLicensePlateAssignment.count({
        where: { vehicleId, validTo: null },
      }),
    ).toBeLessThanOrEqual(1);
    expect(
      await prisma.vehicleDataSourceLink.count({
        where: { vehicleId, isActive: true, provider: 'DIMO' },
      }),
    ).toBeLessThanOrEqual(1);
    expect(
      await prisma.vehicleProviderConsent.count({
        where: { organizationId: orgId, vehicleId, revokedAt: null },
      }),
    ).toBeLessThanOrEqual(1);
    expect(
      await prisma.vehicleRegistryLifecycleOutbox.count({
        where: { idempotencyKey: activationOutboxIdempotencyKey(caseRow.id) },
      }),
    ).toBe(1);
  });

  it('manual idempotency key rejects changed administrative payload', async () => {
    const orgId = await createOrg(prisma);
    const idempotencyKey = randomUUID();
    const baseInput = {
      vin: `MAN${randomUUID().replace(/-/g, '').slice(0, 14)}`,
      make: 'VW',
      model: 'Golf',
      year: 2020,
      fuelType: 'GASOLINE' as const,
      vehicleName: 'Fleet 1',
      licensePlate: 'M-AB-1',
      stationId: 'station-1',
      notes: 'note',
    };
    await harness.caseService.openOrResumeManual(
      { organizationId: orgId, actorUserId: null, idempotencyKey },
      baseInput,
    );
    await expect(
      harness.caseService.openOrResumeManual(
        { organizationId: orgId, actorUserId: null, idempotencyKey },
        { ...baseInput, licensePlate: 'M-AB-2' },
      ),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED_FOR_DIFFERENT_REQUEST' });
  });

  it('wrong organization cannot activate case', async () => {
    const orgA = await createOrg(prisma);
    const orgB = await createOrg(prisma);
    const dimoId = randomUUID();
    await createDimoMirror(prisma, dimoId, `ext-${dimoId.slice(0, 8)}`, null);
    const caseRow = await harness.caseService.openOrResumeFromDimo(
      dimoOnboardingActor(orgA),
      dimoId,
    );
    await sealDimoCaseReady(prisma, orgA, caseRow.id, dimoId);
    const baselineA = await captureActivationBaseline(prisma, orgA, caseRow.id, { dimoId });
    const baselineB = await captureActivationBaseline(prisma, orgB, caseRow.id, { dimoId });
    await expect(
      activateForTest(harness, {
        organizationId: orgB,
        onboardingCaseId: caseRow.id,
        actorUserId: null,
      }),
    ).rejects.toMatchObject({ code: 'CASE_NOT_FOUND' });
    await assertNoActivationArtifactsSince(prisma, baselineA);
    expect(await prisma.vehicle.count({ where: { organizationId: orgB } })).toBe(
      baselineB.vehicleCount,
    );
  });

  const dimoFaultStages: Vo3ActivationFaultStage[] = [
    'AFTER_VEHICLE_CREATE',
    'AFTER_ORG_ASSIGNMENT',
    'AFTER_PROVIDER_LINK',
    'BEFORE_OUTBOX',
  ];

  for (const stage of dimoFaultStages) {
    it(`DIMO rollback on fault ${stage}`, async () => {
      const orgId = await createOrg(prisma);
      const dimoId = randomUUID();
      await createDimoMirror(prisma, dimoId, `ext-${dimoId.slice(0, 8)}`, null);
      const caseRow = await harness.caseService.openOrResumeFromDimo(
        dimoOnboardingActor(orgId),
        dimoId,
      );
      await sealDimoCaseReady(prisma, orgId, caseRow.id, dimoId);
      const baseline = await captureActivationBaseline(prisma, orgId, caseRow.id, { dimoId });
      await expect(
        activateForTest(harness, {
          organizationId: orgId,
          onboardingCaseId: caseRow.id,
          actorUserId: null,
          faultAfterStage: stage,
        }),
      ).rejects.toThrow('VO3_FAULT_INJECTION');
      await assertNoActivationArtifactsSince(prisma, baseline);
    });
  }

  const hmFaultStages: Vo3ActivationFaultStage[] = [
    'AFTER_VEHICLE_CREATE',
    'AFTER_ORG_ASSIGNMENT',
    'AFTER_PROVIDER_LINK',
    'AFTER_MIRROR_UPDATE',
    'BEFORE_OUTBOX',
  ];

  for (const stage of hmFaultStages) {
    it(`HM rollback on fault ${stage}`, async () => {
      const orgId = await createOrg(prisma);
      const hmId = randomUUID();
      const vin = `HM${randomUUID().replace(/-/g, '').slice(0, 14)}`;
      await prisma.highMobilityVehicle.create({
        data: {
          id: hmId,
          organizationId: orgId,
          vin,
          brand: 'BMW',
          packageType: 'HEALTH',
          sourceMode: 'HM_ONLY',
          clearanceStatus: 'APPROVED',
          hmVehicleReference: `hm-ref-${hmId.slice(0, 8)}`,
        },
      });
      const caseRow = await harness.caseService.openOrResumeFromHighMobility(
        dimoOnboardingActor(orgId),
        hmId,
      );
      await sealHmCaseReady(prisma, orgId, caseRow.id, vin);
      const baseline = await captureActivationBaseline(prisma, orgId, caseRow.id, { hmId });
      await expect(
        activateForTest(harness, {
          organizationId: orgId,
          onboardingCaseId: caseRow.id,
          actorUserId: null,
          faultAfterStage: stage,
        }),
      ).rejects.toThrow('VO3_FAULT_INJECTION');
      await assertNoActivationArtifactsSince(prisma, baseline);
    });
  }

  it('second primary DIMO attach conflicts via secure API', async () => {
    const orgId = await createOrg(prisma);
    const dimo1 = randomUUID();
    const dimo2 = randomUUID();
    await createDimoMirror(prisma, dimo1, `ext-${dimo1.slice(0, 8)}`, null);
    await createDimoMirror(prisma, dimo2, `ext-${dimo2.slice(0, 8)}`, null);
    const caseRow = await harness.caseService.openOrResumeFromDimo(
      dimoOnboardingActor(orgId),
      dimo1,
    );
    await expect(
      harness.caseService.attachDimoSource(
        { organizationId: orgId, sourceAdoption: PLATFORM_TRUSTED_SOURCE_ADOPTION },
        caseRow.id,
        dimo2,
        { isPrimary: true },
      ),
    ).rejects.toMatchObject({ code: 'PRIMARY_SOURCE_CONFLICT' });
  });

  it('production activation service rejects TEST_FIXTURE readiness', async () => {
    const orgId = await createOrg(prisma);
    const dimoId = randomUUID();
    await createDimoMirror(prisma, dimoId, `ext-${dimoId.slice(0, 8)}`, null);
    const caseRow = await harness.caseService.openOrResumeFromDimo(
      dimoOnboardingActor(orgId),
      dimoId,
    );
    await sealCaseReadyForTest(prisma, orgId, caseRow.id);
    const readinessService = new VehicleOnboardingReadinessService(prisma as any);
    const prodActivation = new VehicleOnboardingActivationService(
      prisma as any,
      createDimoVehicleDataSourceLinkServiceForTests(prisma),
      new ProductionFailClosedReadinessAuthority(readinessService),
    );
    await expect(
      prodActivation.activateVehicle({
        organizationId: orgId,
        onboardingCaseId: caseRow.id,
        actorUserId: null,
      }),
    ).rejects.toMatchObject({ code: 'READINESS_NOT_SEALED' });
  });
});
