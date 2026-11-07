import type { PrismaClient, VehicleOnboardingCase } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { VehicleOnboardingCaseService } from '../services/vehicle-onboarding-case.service';
import type { OnboardingActorContext } from '../services/vehicle-onboarding-case.service';
import { PLATFORM_TRUSTED_SOURCE_ADOPTION } from '../source-adoption/platform-trusted-adoption.context';
import { VehicleOnboardingActivationService } from '../services/vehicle-onboarding-activation.service';
import { DimoVehicleDataSourceLinkService } from '@modules/dimo/dimo-vehicle-data-source-link.service';
import { FsdDiscoveryPersistenceRepository } from '@modules/vehicle-intelligence/full-signal-discovery/persistence/fsd-discovery-persistence.repository';
import { FsdSourceLinkLifecycleService } from '@modules/vehicle-intelligence/fsd-integration/fsd-source-link-lifecycle.service';
import { VehicleOnboardingSourceAdoptionAuthority } from '../source-adoption/vehicle-onboarding-source-adoption.authority';
import { TestVehicleOnboardingReadinessAuthority } from '../readiness/test-readiness-authority';
import { buildTestReadinessSnapshot } from '../readiness/test-readiness-authority';
import { READINESS_SNAPSHOT_VERSION } from '../contracts/vo-document-versions';
import type { VehicleOnboardingReadinessAuthority } from '../readiness/vehicle-onboarding-readiness-authority';
import type { Vo3ActivationFaultStage } from '../services/vehicle-onboarding-activation.service';
import type { ActivationTestHooks } from '../readiness/vehicle-onboarding-readiness-authority';

export function createDimoVehicleDataSourceLinkServiceForTests(prisma: PrismaClient) {
  return new DimoVehicleDataSourceLinkService(
    prisma as any,
    new FsdSourceLinkLifecycleService(new FsdDiscoveryPersistenceRepository(prisma as never)),
  );
}

export function dimoOnboardingActor(
  organizationId: string,
  idempotencyKey = randomUUID(),
  actorUserId: string | null = null,
): OnboardingActorContext {
  return {
    organizationId,
    actorUserId,
    idempotencyKey,
    sourceAdoption: PLATFORM_TRUSTED_SOURCE_ADOPTION,
  };
}

export function createVehicleOnboardingTestHarness(
  prisma: PrismaClient,
  readiness: VehicleOnboardingReadinessAuthority = new TestVehicleOnboardingReadinessAuthority(),
) {
  const caseService = new VehicleOnboardingCaseService(
    prisma as any,
    new VehicleOnboardingSourceAdoptionAuthority(),
  );
  const activationService = new VehicleOnboardingActivationService(
    prisma as any,
    createDimoVehicleDataSourceLinkServiceForTests(prisma),
    readiness,
  );
  return { caseService, activationService };
}

export async function sealCaseReadyForTest(
  prisma: PrismaClient,
  organizationId: string,
  caseId: string,
  actorUserId: string | null = null,
): Promise<VehicleOnboardingCase> {
  const row = await prisma.vehicleOnboardingCase.findFirst({
    where: { id: caseId, organizationId },
  });
  if (!row) throw new Error('case not found for test seal');
  const readiness = buildTestReadinessSnapshot(actorUserId);
  return prisma.vehicleOnboardingCase.update({
    where: { id: caseId },
    data: {
      status: 'READY_FOR_ACTIVATION',
      readinessSnapshotJson: readiness as unknown as Prisma.InputJsonValue,
      readinessSnapshotVersion: READINESS_SNAPSHOT_VERSION,
      readinessProfileVersion: readiness.profileVersion,
      lastActorUserId: actorUserId,
    },
  });
}

export interface TestActivateInput {
  organizationId: string;
  onboardingCaseId: string;
  actorUserId: string | null;
  faultAfterStage?: Vo3ActivationFaultStage;
  activationTestHooks?: ActivationTestHooks;
}

export async function activateForTest(
  harness: ReturnType<typeof createVehicleOnboardingTestHarness>,
  input: TestActivateInput,
) {
  return harness.activationService.activateVehicle({
    organizationId: input.organizationId,
    onboardingCaseId: input.onboardingCaseId,
    actorUserId: input.actorUserId,
    faultAfterStage: input.faultAfterStage,
    activationTestHooks: input.activationTestHooks,
  });
}
