/**
 * P6B — one-shot preflight, capability-bound execution, inspector (disposable PostgreSQL).
 */
import {
  BusinessType,
  DriveType,
  FuelType,
  HealthStatus,
  PrismaClient,
  ProductSlug,
  VehicleStatus,
} from '@prisma/client';
import { resolveFsd3OneShotExecutableReleaseShaV1 } from '../fsd3-one-shot-executable-attestation.v1';
import {
  __setFsd3AttestationTestPolicyForJestV1,
  __setFsd3TrustedLauncherTestBypassForJestV1,
} from '../fsd3-one-shot-attestation-test-policy.v1';
import { randomUUID } from 'node:crypto';
import { ensureOrganizationProductEntitlement } from '@modules/vehicle-onboarding/testing/org-product-test.harness';
import { PrismaService } from '@shared/database/prisma.service';
import { DimoSourceLinkOperatorAuthorizationService } from '@modules/vehicle-onboarding/services/dimo-source-link-operator-authorization.service';
import { FsdDiscoveryPersistenceRepository } from '@modules/vehicle-intelligence/full-signal-discovery/persistence/fsd-discovery-persistence.repository';
import {
  assertFsd2PersistencePostgresCiEnv,
  ensureFsd2DisposableDatabaseOnce,
} from '@modules/vehicle-intelligence/full-signal-discovery/persistence/fsd-discovery-persistence.postgres-harness';
import { buildFsdDimoConnectionIdentityFingerprint } from '@modules/vehicle-intelligence/full-signal-discovery/persistence/fsd-discovery-persistence.contract.v1';
import { createFsd3MockDiscoveryProvider } from '@modules/vehicle-intelligence/full-signal-discovery/orchestration/fsd3-mock-provider.v1';
import { Fsd3OneShotPreflightService } from '../fsd3-one-shot-preflight.service';
import { Fsd3OneShotExecutionService } from '../fsd3-one-shot-execution.service';
import { Fsd3DiscoveryRunInspectorService } from '../fsd3-discovery-run-inspector.service';
import { Fsd3OneShotCapabilityService } from '../fsd3-one-shot-capability.service';
import {
  FSD3_LIVE_OWNER_APPROVAL_SCHEMA_V1,
  FSD3_LIVE_OWNER_APPROVAL_SCHEMA_V2,
} from '../fsd3-one-shot-owner-approval.v1';
import { FSD3_P6B_CLI_BUDGET_V1 } from '../fsd3-one-shot-cli-budget.v1';
import {
  createFsd3OneShotTestOwnerSigningMaterialV1,
  signFsd3LiveOwnerApprovalTestEnvelopeV1,
} from '../__fixtures__/fsd3-one-shot-test-owner-crypto.harness.v1';
import type { Fsd3LiveOwnerApprovalSignablePayloadV1 } from '../fsd3-one-shot-owner-approval.v1';

const LIVE = process.env.FSD_DISCOVERY_PERSISTENCE_PG === '1';
const REQUIRED = process.env.FSD_DISCOVERY_PERSISTENCE_PG_REQUIRED === '1';

let cachedAttestedSha: string;

const attestationTestEnv: NodeJS.ProcessEnv = {
  PATH: process.env.PATH,
  HOME: process.env.HOME ?? '/root',
  LANG: process.env.LANG ?? 'C.UTF-8',
};

function attestedSha(): string {
  if (!cachedAttestedSha) {
    cachedAttestedSha = resolveFsd3OneShotExecutableReleaseShaV1({ env: attestationTestEnv });
  }
  return cachedAttestedSha;
}

async function ensurePlatformUser(
  prisma: PrismaClient,
  userId: string,
  role: 'MASTER_ADMIN' | 'USER',
  status: 'ACTIVE' | 'SUSPENDED',
) {
  const email = `${userId}@p6b-one-shot.test`;
  await prisma.$executeRaw`
    INSERT INTO users (id, email, name, status, platform_role, created_at, updated_at)
    VALUES (
      ${userId}, ${email}, 'P6B One Shot', ${status}::"UserStatus",
      ${role}::"UserPlatformRole", NOW(), NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
      status = ${status}::"UserStatus",
      platform_role = ${role}::"UserPlatformRole"
  `;
}

async function seedDimoBinding(prisma: PrismaClient) {
  const organizationId = randomUUID();
  const vehicleId = randomUUID();
  const dimoVehicleId = randomUUID();
  const linkId = randomUUID();
  const tokenId = Math.floor(Math.random() * 1_000_000) + 5_000_000;
  await prisma.organization.create({
    data: {
      id: organizationId,
      companyName: `P6B ${organizationId.slice(0, 8)}`,
      businessType: BusinessType.FLEET,
    },
  });
  await ensureOrganizationProductEntitlement(prisma, organizationId, ProductSlug.FLEET);
  await prisma.vehicle.create({
    data: {
      id: vehicleId,
      organizationId,
      vin: `VIN${randomUUID().replace(/-/g, '').slice(0, 14)}`,
      make: 'Tesla',
      model: 'M3',
      year: 2022,
      fuelType: FuelType.ELECTRIC,
      status: VehicleStatus.AVAILABLE,
      healthStatus: HealthStatus.GOOD,
      driveType: DriveType.RWD,
    },
  });
  await prisma.dimoVehicle.create({
    data: {
      id: dimoVehicleId,
      externalId: `0x${randomUUID().replace(/-/g, '')}`,
      tokenId,
      make: 'Tesla',
      model: 'M3',
      year: 2022,
      fuelType: 'ELECTRIC',
    },
  });
  await prisma.vehicleDataSourceLink.create({
    data: {
      id: linkId,
      vehicleId,
      provider: 'DIMO',
      sourceType: 'DIMO',
      dimoVehicleId,
      isActive: true,
    },
  });
  return { organizationId, vehicleId, linkId, dimoVehicleId, tokenId };
}

(LIVE ? describe : describe.skip)('FSD3 one-shot ops (PostgreSQL)', () => {
  jest.setTimeout(180_000);

  let prisma: PrismaClient;
  const signing = createFsd3OneShotTestOwnerSigningMaterialV1();

  beforeAll(async () => {
    assertFsd2PersistencePostgresCiEnv();
    if (REQUIRED) {
      await ensureFsd2DisposableDatabaseOnce();
    }
    process.env.FSD3_ONE_SHOT_ALLOW_TEST_TRUST_INLINE = '1';
    process.env.FSD3_ONE_SHOT_CAPABILITY_HMAC_SECRET = 'p6b-postgres-capability-secret';
    process.env.FSD3_ONE_SHOT_PREFLIGHT_TICKET_HMAC_SECRET = 'p6b-postgres-preflight-ticket-secret';
    __setFsd3AttestationTestPolicyForJestV1('RELAXED_WORKTREE_ONLY');
    __setFsd3TrustedLauncherTestBypassForJestV1(true);
    cachedAttestedSha = resolveFsd3OneShotExecutableReleaseShaV1({ env: attestationTestEnv });
    process.env.FSD3_PRE_NODE_ATTEST_SHA = cachedAttestedSha;
    process.env.FSD3_ONE_SHOT_TRUSTED_LAUNCHER = '1';
    prisma = new PrismaClient();
    await prisma.$connect();
  }, 600_000);

  afterAll(async () => {
    __setFsd3AttestationTestPolicyForJestV1(null);
    __setFsd3TrustedLauncherTestBypassForJestV1(false);
    await prisma?.$disconnect();
  });

  function services() {
    const prismaSvc = prisma as unknown as PrismaService;
    const persistence = new FsdDiscoveryPersistenceRepository(prismaSvc);
    const operatorAuth = new DimoSourceLinkOperatorAuthorizationService(prismaSvc);
    const capability = new Fsd3OneShotCapabilityService();
    capability.onModuleInit();
    const preflight = new Fsd3OneShotPreflightService(prismaSvc, operatorAuth, persistence, capability);
    preflight.onModuleInit();
    return {
      preflight,
      execution: new Fsd3OneShotExecutionService(persistence, capability),
      inspector: new Fsd3DiscoveryRunInspectorService(prismaSvc, persistence),
    };
  }

  function approvalFor(
    scope: {
      organizationId: string;
      vehicleId: string;
      providerSourceLinkId: string;
      discoveryRequestKey: string;
      executableReleaseSha: string;
    },
    extra?: {
      actorUserId?: string;
      dimoTokenId?: number;
      connectionIdentityFingerprint?: string;
    },
  ): Fsd3LiveOwnerApprovalSignablePayloadV1 {
    const useV2 = Boolean(extra?.actorUserId);
    return {
      schemaVersion: useV2 ? FSD3_LIVE_OWNER_APPROVAL_SCHEMA_V2 : FSD3_LIVE_OWNER_APPROVAL_SCHEMA_V1,
      approvalReference: `p6b-${scope.discoveryRequestKey.slice(0, 8)}`,
      executableReleaseSha: scope.executableReleaseSha,
      organizationId: scope.organizationId,
      vehicleId: scope.vehicleId,
      providerSourceLinkId: scope.providerSourceLinkId,
      discoveryRequestKey: scope.discoveryRequestKey,
      liveProvider: 'mock',
      budget: { ...FSD3_P6B_CLI_BUDGET_V1 },
      validFromIso: new Date(Date.now() - 60_000).toISOString(),
      validUntilIso: new Date(Date.now() + 3_600_000).toISOString(),
      actorUserId: extra?.actorUserId,
      dimoTokenId: extra?.dimoTokenId,
      connectionIdentityFingerprint: extra?.connectionIdentityFingerprint,
    };
  }

  it('rejects forged execution capability', async () => {
    const { execution } = services();
    const provider = createFsd3MockDiscoveryProvider({ mode: 'TESLA_REFERENCE_26' });
    const wrongCapability = new Fsd3OneShotCapabilityService();
    process.env.FSD3_ONE_SHOT_CAPABILITY_HMAC_SECRET = 'other-secret';
    wrongCapability.onModuleInit();
    const token = wrongCapability.mint({
      organizationId: randomUUID(),
      vehicleId: randomUUID(),
      providerSourceLinkId: randomUUID(),
      discoveryRequestKey: randomUUID(),
      attestedExecutableReleaseSha: attestedSha(),
      approvalReference: 'forged',
      liveProvider: 'mock',
      actorUserId: randomUUID(),
      operatorAuthorizationReference: 'op',
      dimoVehicleId: randomUUID(),
      dimoTokenId: 1,
      connectionIdentityFingerprint: 'fp',
    });
    process.env.FSD3_ONE_SHOT_CAPABILITY_HMAC_SECRET = 'p6b-postgres-capability-secret';
    await expect(
      execution.executeAuthorizedOneShot({
        executionCapability: token,
        provider,
        expectedLiveProvider: 'mock',
      }),
    ).rejects.toThrow('FSD3_EXECUTION_CAPABILITY_FORGED');
  });

  it('preflight rejects inactive source link', async () => {
    const seed = await seedDimoBinding(prisma);
    const actorUserId = randomUUID();
    await ensurePlatformUser(prisma, actorUserId, 'MASTER_ADMIN', 'ACTIVE');
    await prisma.vehicleDataSourceLink.update({
      where: { id: seed.linkId },
      data: { isActive: false, deactivatedAt: new Date() },
    });
    const { preflight } = services();
    await expect(
      preflight.runAuthorizedReadOnlyPreflight({
        actorUserId,
        scope: {
          organizationId: seed.organizationId,
          vehicleId: seed.vehicleId,
          providerSourceLinkId: seed.linkId,
          discoveryRequestKey: randomUUID(),
          executableReleaseSha: attestedSha(),
        },
      }),
    ).rejects.toThrow();
  });

  it('mock execute + inspector with MASTER_ADMIN', async () => {
    const seed = await seedDimoBinding(prisma);
    const actorUserId = randomUUID();
    await ensurePlatformUser(prisma, actorUserId, 'MASTER_ADMIN', 'ACTIVE');
    const discoveryRequestKey = randomUUID();
    const scope = {
      organizationId: seed.organizationId,
      vehicleId: seed.vehicleId,
      providerSourceLinkId: seed.linkId,
      discoveryRequestKey,
      executableReleaseSha: attestedSha(),
    };
    const { preflight, execution, inspector } = services();
    const pre = await preflight.runAuthorizedReadOnlyPreflight({ actorUserId, scope });
    const fingerprint = buildFsdDimoConnectionIdentityFingerprint({
      dimoVehicleId: pre.dimoVehicleId!,
      tokenId: pre.dimoTokenId!,
    });
    const envelope = signFsd3LiveOwnerApprovalTestEnvelopeV1({
      privateKey: signing.privateKey,
      keyId: signing.keyId,
      payload: approvalFor(scope, {
        actorUserId,
        dimoTokenId: pre.dimoTokenId!,
        connectionIdentityFingerprint: fingerprint,
      }),
    });
    const ticket = preflight.mintAuthorizedPreflightTicket({ scope, actorUserId });
    const capability = preflight.issueExecutionCapability({
      scope,
      verifiedOwnerApprovalEnvelope: envelope,
      preflightTicket: ticket,
      actorUserId,
      liveProvider: 'mock',
      trustContext: { mode: 'TEST_ISOLATED_INLINE', trustStoreJson: signing.trustStoreJson },
    });
    const provider = createFsd3MockDiscoveryProvider({ mode: 'TESLA_REFERENCE_26' });
    const result = await execution.executeAuthorizedOneShot({
      executionCapability: capability,
      provider,
      expectedLiveProvider: 'mock',
    });
    expect(['COMPLETED', 'PARTIAL']).toContain(result.terminalStatus);
    const report = await inspector.inspectTenantScoped({
      actorUserId,
      organizationId: seed.organizationId,
      runId: result.runId,
    });
    expect(report.catalogSignalCount).toBe(26);
    await expect(
      inspector.inspectTenantScoped({
        actorUserId: randomUUID(),
        organizationId: seed.organizationId,
        runId: result.runId,
      }),
    ).rejects.toThrow('INSPECTOR_FORBIDDEN');
  });

  it('inspector cross-tenant fails closed', async () => {
    const seed = await seedDimoBinding(prisma);
    const actorUserId = randomUUID();
    await ensurePlatformUser(prisma, actorUserId, 'MASTER_ADMIN', 'ACTIVE');
    const { inspector } = services();
    await expect(
      inspector.inspectTenantScoped({
        actorUserId,
        organizationId: randomUUID(),
        runId: randomUUID(),
      }),
    ).rejects.toThrow('RUN_NOT_FOUND');
  });

  it('duplicate discoveryRequestKey is idempotent on second execute', async () => {
    const seed = await seedDimoBinding(prisma);
    const actorUserId = randomUUID();
    await ensurePlatformUser(prisma, actorUserId, 'MASTER_ADMIN', 'ACTIVE');
    const discoveryRequestKey = randomUUID();
    const scope = {
      organizationId: seed.organizationId,
      vehicleId: seed.vehicleId,
      providerSourceLinkId: seed.linkId,
      discoveryRequestKey,
      executableReleaseSha: attestedSha(),
    };
    const { preflight, execution } = services();
    const pre = await preflight.runAuthorizedReadOnlyPreflight({ actorUserId, scope });
    const envelope = signFsd3LiveOwnerApprovalTestEnvelopeV1({
      privateKey: signing.privateKey,
      keyId: signing.keyId,
      payload: approvalFor(scope, {
        actorUserId,
        dimoTokenId: pre.dimoTokenId!,
        connectionIdentityFingerprint: buildFsdDimoConnectionIdentityFingerprint({
          dimoVehicleId: pre.dimoVehicleId!,
          tokenId: pre.dimoTokenId!,
        }),
      }),
    });
    const provider = createFsd3MockDiscoveryProvider({ mode: 'TESLA_REFERENCE_26' });
    const cap1 = preflight.issueExecutionCapability({
      scope,
      verifiedOwnerApprovalEnvelope: envelope,
      preflightTicket: preflight.mintAuthorizedPreflightTicket({ scope, actorUserId }),
      actorUserId,
      liveProvider: 'mock',
      trustContext: { mode: 'TEST_ISOLATED_INLINE', trustStoreJson: signing.trustStoreJson },
    });
    const first = await execution.executeAuthorizedOneShot({
      executionCapability: cap1,
      provider,
      expectedLiveProvider: 'mock',
    });
    await preflight.runAuthorizedReadOnlyPreflight({ actorUserId, scope });
    const cap2 = preflight.issueExecutionCapability({
      scope,
      verifiedOwnerApprovalEnvelope: envelope,
      preflightTicket: preflight.mintAuthorizedPreflightTicket({ scope, actorUserId }),
      actorUserId,
      liveProvider: 'mock',
      trustContext: { mode: 'TEST_ISOLATED_INLINE', trustStoreJson: signing.trustStoreJson },
    });
    const second = await execution.executeAuthorizedOneShot({
      executionCapability: cap2,
      provider,
      expectedLiveProvider: 'mock',
    });
    expect(first.terminalStatus).not.toBe('SKIPPED');
    expect(second.runId).toBe(first.runId);
    expect(second.terminalStatus).toBe(first.terminalStatus);
  });

  it('replayed execution capability does not double-dispatch provider', async () => {
    const seed = await seedDimoBinding(prisma);
    const actorUserId = randomUUID();
    await ensurePlatformUser(prisma, actorUserId, 'MASTER_ADMIN', 'ACTIVE');
    const discoveryRequestKey = randomUUID();
    const scope = {
      organizationId: seed.organizationId,
      vehicleId: seed.vehicleId,
      providerSourceLinkId: seed.linkId,
      discoveryRequestKey,
      executableReleaseSha: attestedSha(),
    };
    const { preflight, execution } = services();
    const pre = await preflight.runAuthorizedReadOnlyPreflight({ actorUserId, scope });
    const envelope = signFsd3LiveOwnerApprovalTestEnvelopeV1({
      privateKey: signing.privateKey,
      keyId: signing.keyId,
      payload: approvalFor(scope, {
        actorUserId,
        dimoTokenId: pre.dimoTokenId!,
        connectionIdentityFingerprint: buildFsdDimoConnectionIdentityFingerprint({
          dimoVehicleId: pre.dimoVehicleId!,
          tokenId: pre.dimoTokenId!,
        }),
      }),
    });
    const provider = createFsd3MockDiscoveryProvider({ mode: 'TESLA_REFERENCE_26' }) as ReturnType<
      typeof createFsd3MockDiscoveryProvider
    > & {
      getCatalogCallCount(): number;
      getSnapshotCallCount(): number;
    };
    const capability = preflight.issueExecutionCapability({
      scope,
      verifiedOwnerApprovalEnvelope: envelope,
      preflightTicket: preflight.mintAuthorizedPreflightTicket({ scope, actorUserId }),
      actorUserId,
      liveProvider: 'mock',
      trustContext: { mode: 'TEST_ISOLATED_INLINE', trustStoreJson: signing.trustStoreJson },
    });
    const first = await execution.executeAuthorizedOneShot({
      executionCapability: capability,
      provider,
      expectedLiveProvider: 'mock',
    });
    const catalogAfterFirst = provider.getCatalogCallCount();
    const snapshotAfterFirst = provider.getSnapshotCallCount();
    expect(catalogAfterFirst + snapshotAfterFirst).toBeLessThanOrEqual(2);
    const replayed = await execution.executeAuthorizedOneShot({
      executionCapability: capability,
      provider,
      expectedLiveProvider: 'mock',
    });
    expect(replayed.runId).toBe(first.runId);
    expect(replayed.terminalStatus).toBe(first.terminalStatus);
    expect(provider.getCatalogCallCount()).toBe(catalogAfterFirst);
    expect(provider.getSnapshotCallCount()).toBe(snapshotAfterFirst);
  });

  it('concurrent mock execute with same discoveryRequestKey serializes to one run', async () => {
    const seed = await seedDimoBinding(prisma);
    const actorUserId = randomUUID();
    await ensurePlatformUser(prisma, actorUserId, 'MASTER_ADMIN', 'ACTIVE');
    const discoveryRequestKey = randomUUID();
    const scope = {
      organizationId: seed.organizationId,
      vehicleId: seed.vehicleId,
      providerSourceLinkId: seed.linkId,
      discoveryRequestKey,
      executableReleaseSha: attestedSha(),
    };
    const { preflight, execution } = services();
    let releaseCatalog!: () => void;
    const catalogBlock = new Promise<void>((resolve) => {
      releaseCatalog = resolve;
    });
    const provider = createFsd3MockDiscoveryProvider({
      mode: 'TESLA_REFERENCE_26',
      catalogGate: { blockUntilReleased: catalogBlock },
    }) as ReturnType<typeof createFsd3MockDiscoveryProvider> & {
      getCatalogCallCount(): number;
      getSnapshotCallCount(): number;
    };

    const mintCaps = async () => {
      const pre = await preflight.runAuthorizedReadOnlyPreflight({ actorUserId, scope });
      const envelope = signFsd3LiveOwnerApprovalTestEnvelopeV1({
        privateKey: signing.privateKey,
        keyId: signing.keyId,
        payload: approvalFor(scope, {
          actorUserId,
          dimoTokenId: pre.dimoTokenId!,
          connectionIdentityFingerprint: buildFsdDimoConnectionIdentityFingerprint({
            dimoVehicleId: pre.dimoVehicleId!,
            tokenId: pre.dimoTokenId!,
          }),
        }),
      });
      return preflight.issueExecutionCapability({
        scope,
        verifiedOwnerApprovalEnvelope: envelope,
        preflightTicket: preflight.mintAuthorizedPreflightTicket({ scope, actorUserId }),
        actorUserId,
        liveProvider: 'mock',
        trustContext: { mode: 'TEST_ISOLATED_INLINE', trustStoreJson: signing.trustStoreJson },
      });
    };

    const capA = await mintCaps();
    const capB = await mintCaps();
    const pending = Promise.all([
      execution.executeAuthorizedOneShot({
        executionCapability: capA,
        provider,
        expectedLiveProvider: 'mock',
      }),
      execution.executeAuthorizedOneShot({
        executionCapability: capB,
        provider,
        expectedLiveProvider: 'mock',
      }),
    ]);
    await new Promise((r) => setTimeout(r, 50));
    releaseCatalog();
    const [a, b] = await pending;
    expect(a.runId).toBe(b.runId);
    expect(a.terminalStatus).toBe(b.terminalStatus);
    expect(provider.getCatalogCallCount() + provider.getSnapshotCallCount()).toBeLessThanOrEqual(2);
  });

  it('rejects live ephemeral HMAC secret env override', () => {
    process.env.FSD3_ONE_SHOT_LIVE_EPHEMERAL_SECRETS_REQUIRED = '1';
    process.env.FSD3_ONE_SHOT_CAPABILITY_HMAC_SECRET = 'forbidden';
    const cap = new Fsd3OneShotCapabilityService();
    expect(() => cap.onModuleInit()).toThrow('FSD3_LIVE_HMAC_SECRET_ENV_FORBIDDEN');
    delete process.env.FSD3_ONE_SHOT_CAPABILITY_HMAC_SECRET;
    delete process.env.FSD3_ONE_SHOT_LIVE_EPHEMERAL_SECRETS_REQUIRED;
  });
});
