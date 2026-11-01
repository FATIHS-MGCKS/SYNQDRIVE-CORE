import { getDocumentedOneAutoContract } from '../catalog/oneauto-documented-contracts';
import {
  ONEAUTO_SANDBOX_ATTESTATION_API_KEY_ENV,
  ONEAUTO_SANDBOX_ATTESTATION_OWNER_AUTH_ENV,
  ONEAUTO_SANDBOX_ATTESTATION_SYNTHETIC_VIN,
} from './oneauto-sandbox-attestation.constants';
import {
  assertLiveAttestationPreconditions,
  OneAutoSandboxAttestationRequestBudget,
} from './oneauto-sandbox-attestation-guards.util';
import {
  buildSandboxAttestationEvidence,
  formatAttestationEvidenceMarkdown,
} from './oneauto-sandbox-attestation-evidence.util';
import {
  getSandboxAttestationFixture,
  ONEAUTO_SANDBOX_ATTESTATION_FIXTURES,
} from './oneauto-sandbox-attestation-fixtures';
import type {
  OneAutoSandboxAttestationDiagnosticCategory,
  OneAutoSandboxAttestationEvidence,
  OneAutoSandboxAttestationFixture,
} from './oneauto-sandbox-attestation.types';
import {
  executeSandboxAttestationGet,
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
        get: (name: string) => fixture.mock.kind === 'response' ? fixture.mock.headers?.[name] ?? null : null,
      },
      text: async () => bodyText,
    } as unknown as Response;
  };
}

export async function runOfflineSandboxAttestationFixture(
  fixtureId: string,
): Promise<OneAutoSandboxAttestationEvidence> {
  const fixture = getSandboxAttestationFixture(fixtureId);
  if (!fixture) {
    const outcome = {
      httpStatus: null,
      body: null,
      responseByteLength: null,
      envelopeSuccess: null,
      transportErrorCode: 'FIXTURE_UNKNOWN',
    };
    return buildSandboxAttestationEvidence({
      mode: 'offline',
      fixtureId,
      contract: documentedVinLookupContract(),
      outcome,
      categoryOverride: 'FIXTURE_UNKNOWN',
      notes: [`Unknown fixture id: ${fixtureId}`],
    });
  }

  const contract = documentedVinLookupContract();
  const budget = new OneAutoSandboxAttestationRequestBudget();
  const vin =
    fixture.mock.kind === 'invalid-vin' ? 'NOT-A-VIN' : ONEAUTO_SANDBOX_ATTESTATION_SYNTHETIC_VIN;

  if (fixture.mock.kind === 'invalid-vin') {
    const outcome = {
      httpStatus: null,
      body: null,
      responseByteLength: null,
      envelopeSuccess: null,
      transportErrorCode: 'ONEAUTO_INVALID_VIN',
    };
    return buildSandboxAttestationEvidence({
      mode: 'offline',
      fixtureId,
      contract,
      outcome,
      vinForFingerprint: vin,
      notes: [fixture.description, 'No network I/O — invalid VIN gate'],
    });
  }

  const outcome = await executeSandboxAttestationGet({
    contract,
    vin,
    apiKey: 'offline-fixture-no-key',
    fetchImpl: fixtureFetchImpl(fixture),
    requestBudget: budget,
    maxResponseBytes: fixture.id === 'oversized' ? 128 : 256 * 1024,
    timeoutMs: fixture.id === 'timeout' ? 1 : 15_000,
  });

  return buildSandboxAttestationEvidence({
    mode: 'offline',
    fixtureId,
    contract,
    outcome,
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

export async function runLiveSandboxAttestation(input: {
  vin: string;
  apiKey: string;
  ownerAuthorizedEnv: string | undefined;
  fetchImpl?: SandboxAttestationFetchImpl;
  baseUrlOverride?: string;
}): Promise<OneAutoSandboxAttestationEvidence> {
  try {
    assertLiveAttestationPreconditions({
      ownerAuthorizedEnv: input.ownerAuthorizedEnv,
      apiKeyPresent: Boolean(input.apiKey?.trim()),
    });
  } catch (err: unknown) {
    const code =
      err && typeof err === 'object' && 'code' in err
        ? String((err as { code: unknown }).code)
        : 'ONEAUTO_ATTESTATION_LIVE_BLOCKED';
    const category: OneAutoSandboxAttestationDiagnosticCategory =
      code === 'ONEAUTO_ATTESTATION_LIVE_CODE_DISABLED'
        ? 'LIVE_ATTESTATION_CODE_DISABLED'
        : code === 'ONEAUTO_ATTESTATION_LIVE_OWNER_AUTH_REQUIRED'
          ? 'LIVE_OWNER_AUTHORIZATION_REQUIRED'
          : code === 'ONEAUTO_ATTESTATION_MISSING_API_KEY'
            ? 'MISSING_API_KEY'
            : 'LIVE_ATTESTATION_CODE_DISABLED';
    return buildSandboxAttestationEvidence({
      mode: 'live-sandbox',
      fixtureId: null,
      contract: documentedVinLookupContract(),
      outcome: {
        httpStatus: null,
        body: null,
        responseByteLength: null,
        envelopeSuccess: null,
        transportErrorCode: code,
      },
      categoryOverride: category,
      notes: ['Live sandbox attestation blocked by harness gates'],
    });
  }

  const contract = documentedVinLookupContract();
  const budget = new OneAutoSandboxAttestationRequestBudget();
  const fetchImpl = input.fetchImpl ?? fetch;
  const outcome = await executeSandboxAttestationGet({
    contract,
    vin: input.vin,
    apiKey: input.apiKey.trim(),
    fetchImpl,
    requestBudget: budget,
    baseUrlOverride: input.baseUrlOverride,
  });

  return buildSandboxAttestationEvidence({
    mode: 'live-sandbox',
    fixtureId: null,
    contract,
    outcome,
    vinForFingerprint: input.vin,
    notes: ['Live sandbox attestation path — owner authorized when enabled in build'],
  });
}

export function resolveLiveAttestationEnv(): {
  ownerAuthorizedEnv: string | undefined;
  apiKey: string | undefined;
} {
  return {
    ownerAuthorizedEnv: process.env[ONEAUTO_SANDBOX_ATTESTATION_OWNER_AUTH_ENV],
    apiKey: process.env[ONEAUTO_SANDBOX_ATTESTATION_API_KEY_ENV]?.trim(),
  };
}

export { formatAttestationEvidenceMarkdown };
