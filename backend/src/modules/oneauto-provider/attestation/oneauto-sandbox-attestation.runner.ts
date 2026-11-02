import { getDocumentedOneAutoContract } from '../catalog/oneauto-documented-contracts';
import {
  ONEAUTO_ATTESTATION_SYNTHETIC_VIN,
} from './oneauto-sandbox-attestation.constants';
import {
  OneAutoSandboxAttestationRequestBudget,
  readProductionAttestationAuthorizationFromEnv,
  rejectCustomBaseUrlOverride,
  resolveOfflineFixtureBaseUrl,
  resolveProductionAttestationBaseUrl,
  validateProductionAttestationAuthorization,
} from './oneauto-sandbox-attestation-guards.util';
import {
  buildSandboxAttestationEvidence,
  formatAttestationEvidenceMarkdown,
  offlineEvidenceHostname,
  productionEvidenceHostname,
} from './oneauto-sandbox-attestation-evidence.util';
import {
  getSandboxAttestationFixture,
  ONEAUTO_SANDBOX_ATTESTATION_FIXTURES,
} from './oneauto-sandbox-attestation-fixtures';
import type {
  OneAutoSandboxAttestationEvidence,
  OneAutoSandboxAttestationFixture,
  ProductionAttestationAuthorization,
} from './oneauto-sandbox-attestation.types';
import {
  executeAttestationGet,
  type SandboxAttestationFetchImpl,
} from './oneauto-sandbox-attestation-transport';

function documentedVinLookupContract() {
  const doc = getDocumentedOneAutoContract('OE_VIN_LOOKUP_EU');
  if (!doc) throw new Error('OE_VIN_LOOKUP_EU documented contract missing');
  return doc;
}

function fixtureFetchImpl(fixture: OneAutoSandboxAttestationFixture): SandboxAttestationFetchImpl {
  return async (_url, _init) => {
    if (fixture.mock.kind === 'reject') {
      throw fixture.mock.error;
    }
    if (fixture.mock.kind === 'invalid-vin') {
      throw new Error('invalid-vin fixture should not call fetch');
    }
    const bodyText = fixture.mock.bodyText ?? '';
    return {
      status: fixture.mock.status,
      headers: {
        get: (name: string) =>
          fixture.mock.kind === 'response' ? fixture.mock.headers?.[name] ?? null : null,
      },
      text: async () => bodyText,
    } as unknown as Response;
  };
}

export async function runOfflineSandboxAttestationFixture(
  fixtureId: string,
): Promise<OneAutoSandboxAttestationEvidence> {
  const fixture = getSandboxAttestationFixture(fixtureId);
  const contract = documentedVinLookupContract();
  if (!fixture) {
    return buildSandboxAttestationEvidence({
      mode: 'offline',
      attestationEnvironment: 'OFFLINE',
      targetHostname: offlineEvidenceHostname(),
      fixtureId,
      contract,
      outcome: {
        httpStatus: null,
        body: null,
        responseByteLength: null,
        envelopeSuccess: null,
        transportErrorCode: 'FIXTURE_UNKNOWN',
      },
      attemptedOutboundRequests: 0,
      categoryOverride: 'FIXTURE_UNKNOWN',
      notes: [`Unknown fixture id: ${fixtureId}`],
    });
  }

  const budget = new OneAutoSandboxAttestationRequestBudget();
  const vin =
    fixture.mock.kind === 'invalid-vin' ? 'NOT-A-VIN' : ONEAUTO_ATTESTATION_SYNTHETIC_VIN;

  if (fixture.mock.kind === 'invalid-vin') {
    return buildSandboxAttestationEvidence({
      mode: 'offline',
      attestationEnvironment: 'OFFLINE',
      targetHostname: offlineEvidenceHostname(),
      fixtureId,
      contract,
      outcome: {
        httpStatus: null,
        body: null,
        responseByteLength: null,
        envelopeSuccess: null,
        transportErrorCode: 'ONEAUTO_INVALID_VIN',
      },
      attemptedOutboundRequests: 0,
      vinForFingerprint: vin,
      notes: [fixture.description, 'No network I/O — invalid VIN gate'],
    });
  }

  const outcome = await executeAttestationGet({
    contract,
    vin,
    apiKey: 'offline-fixture-no-key',
    baseUrl: resolveOfflineFixtureBaseUrl(),
    fetchImpl: fixtureFetchImpl(fixture),
    requestBudget: budget,
    maxResponseBytes: fixture.id === 'oversized' ? 128 : 256 * 1024,
    timeoutMs: fixture.id === 'timeout' ? 1 : 15_000,
  });

  return buildSandboxAttestationEvidence({
    mode: 'offline',
    attestationEnvironment: 'OFFLINE',
    targetHostname: offlineEvidenceHostname(),
    fixtureId,
    contract,
    outcome,
    attemptedOutboundRequests: budget.attemptedCount,
    vinForFingerprint: vin,
    notes: [fixture.description, 'Offline mocked transport — zero network calls'],
  });
}

export async function runAllOfflineSandboxAttestationFixtures(): Promise<OneAutoSandboxAttestationEvidence[]> {
  const results: OneAutoSandboxAttestationEvidence[] = [];
  for (const fixture of ONEAUTO_SANDBOX_ATTESTATION_FIXTURES) {
    results.push(await runOfflineSandboxAttestationFixture(fixture.id));
  }
  return results;
}

function preflightEvidence(
  failure: ReturnType<typeof validateProductionAttestationAuthorization>,
  auth: ProductionAttestationAuthorization,
  notes: string[],
): OneAutoSandboxAttestationEvidence {
  return buildSandboxAttestationEvidence({
    mode: 'live-production',
    attestationEnvironment: 'PRODUCTION',
    targetHostname: productionEvidenceHostname(),
    fixtureId: null,
    contract: documentedVinLookupContract(),
    outcome: {
      httpStatus: null,
      body: null,
      responseByteLength: null,
      envelopeSuccess: null,
      transportErrorCode: failure?.code ?? 'ONEAUTO_ATTESTATION_BLOCKED',
    },
    attemptedOutboundRequests: 0,
    vinForFingerprint: auth.vin,
    categoryOverride: failure?.category ?? 'LIVE_PRODUCTION_CLI_REQUIRED',
    notes,
  });
}

export async function runLiveProductionAttestation(input: {
  authorization: ProductionAttestationAuthorization;
  fetchImpl?: SandboxAttestationFetchImpl;
}): Promise<OneAutoSandboxAttestationEvidence> {
  try {
    rejectCustomBaseUrlOverride(undefined);
  } catch (err: unknown) {
    const code =
      err && typeof err === 'object' && 'code' in err
        ? String((err as { code: unknown }).code)
        : 'ONEAUTO_ATTESTATION_CUSTOM_HOST_FORBIDDEN';
    return preflightEvidence(
      { code, category: 'CUSTOM_HOST_REJECTED' },
      input.authorization,
      ['Custom base URL forbidden'],
    );
  }

  const failure = validateProductionAttestationAuthorization(input.authorization);
  if (failure) {
    return preflightEvidence(failure, input.authorization, ['Production attestation preflight failed']);
  }

  const contract = documentedVinLookupContract();
  const budget = new OneAutoSandboxAttestationRequestBudget();
  const baseUrl = resolveProductionAttestationBaseUrl();
  const fetchImpl = input.fetchImpl ?? fetch;
  const outcome = await executeAttestationGet({
    contract,
    vin: input.authorization.vin!.trim(),
    apiKey: input.authorization.apiKey!.trim(),
    baseUrl,
    fetchImpl,
    requestBudget: budget,
  });

  return buildSandboxAttestationEvidence({
    mode: 'live-production',
    attestationEnvironment: 'PRODUCTION',
    targetHostname: productionEvidenceHostname(),
    fixtureId: null,
    contract,
    outcome,
    attemptedOutboundRequests: budget.attemptedCount,
    vinForFingerprint: input.authorization.vin,
    notes: [
      'Live production attestation — exactly one GET to documented ezyvin/vinlookup/',
      'Billing may apply regardless of outcome',
    ],
  });
}

export function resolveProductionAttestationAuthorization(
  cliLiveProduction: boolean,
): ProductionAttestationAuthorization {
  const env = readProductionAttestationAuthorizationFromEnv();
  return { cliLiveProduction, ...env };
}

export { formatAttestationEvidenceMarkdown };
