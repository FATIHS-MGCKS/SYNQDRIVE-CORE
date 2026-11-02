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
import {
  buildCapturePreservingHandoffEvidence,
  errorCodeFromUnknown,
  redactOutcomeForShareableEvidence,
} from './oneauto-sandbox-attestation-live-cli-handoff.util';
import { classifySandboxAttestationOutcome } from './oneauto-sandbox-attestation-evaluate.util';
import type {
  OneAutoSandboxAttestationEvidence,
  OneAutoSandboxAttestationFixture,
  ProductionAttestationAuthorization,
} from './oneauto-sandbox-attestation.types';
import {
  executeAttestationGet,
  type SandboxAttestationFetchImpl,
} from './oneauto-sandbox-attestation-transport';
import {
  attemptResultCapture,
  captureAuthorizationFromEnv,
} from './oneauto-sandbox-attestation-result-capture.util';
import type { OneAutoAttestationResultCaptureEvidenceMeta } from './oneauto-sandbox-attestation-result-capture.types';

function documentedVinLookupContract() {
  const doc = getDocumentedOneAutoContract('OE_VIN_LOOKUP_EU');
  if (!doc) throw new Error('OE_VIN_LOOKUP_EU documented contract missing');
  return doc;
}

function emptyAttestationHeaders() {
  return { retryAfterRaw: null, locationRaw: null, providerStatusRaw: null };
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
    const headerMap =
      fixture.mock.kind === 'response' ? fixture.mock.headers ?? {} : {};
    return {
      status: fixture.mock.status,
      headers: {
        get: (name: string) => {
          const lower = name.toLowerCase();
          for (const [key, value] of Object.entries(headerMap)) {
            if (key.toLowerCase() === lower) return value;
          }
          return null;
        },
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
        responseHeaders: emptyAttestationHeaders(),
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
        responseHeaders: emptyAttestationHeaders(),
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
      responseHeaders: emptyAttestationHeaders(),
    },
    attemptedOutboundRequests: 0,
    vinForFingerprint: auth.vin,
    categoryOverride: failure?.category ?? 'LIVE_PRODUCTION_CLI_REQUIRED',
    notes,
  });
}

function buildResultCaptureEvidenceMeta(input: {
  cliCaptureRequested: boolean;
  diagnosticCategory: OneAutoSandboxAttestationEvidence['diagnosticCategory'];
  outcome: Awaited<ReturnType<typeof executeAttestationGet>>;
  expectedVin: string;
}): OneAutoAttestationResultCaptureEvidenceMeta | undefined {
  if (!input.cliCaptureRequested) return undefined;
  const env = captureAuthorizationFromEnv();
  const capture = attemptResultCapture({
    cliCaptureRequested: true,
    diagnosticCategory: input.diagnosticCategory,
    outcome: input.outcome,
    expectedVin: input.expectedVin,
    envCaptureEnabled: env.envCaptureEnabled,
    captureOwnerAuthorized: env.captureOwnerAuthorized,
    outputPath: env.outputPath,
  });
  if (capture.ok) {
    return {
      attempted: true,
      written: true,
      artifactSha256Prefix: capture.artifactSha256.slice(0, 16),
    };
  }
  return {
    attempted: true,
    written: false,
    rejectCode: capture.rejectCode,
  };
}

export async function runLiveProductionAttestation(input: {
  authorization: ProductionAttestationAuthorization;
  fetchImpl?: SandboxAttestationFetchImpl;
  captureRedactedResult?: boolean;
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

  const category = classifySandboxAttestationOutcome(outcome, contract);
  const resultCapture = buildResultCaptureEvidenceMeta({
    cliCaptureRequested: input.captureRedactedResult === true,
    diagnosticCategory: category,
    outcome,
    expectedVin: input.authorization.vin!.trim(),
  });
  const notes = [
    'Live production attestation — exactly one GET to documented ezyvin/vinlookup/',
    'Billing may apply regardless of outcome',
  ];
  if (resultCapture?.written) {
    notes.push('Redacted result capture artifact written locally (path omitted from evidence JSON)');
  } else if (resultCapture?.rejectCode) {
    notes.push(`Result capture not written: ${resultCapture.rejectCode}`);
  }

  const evidenceInput = {
    mode: 'live-production' as const,
    attestationEnvironment: 'PRODUCTION' as const,
    targetHostname: productionEvidenceHostname(),
    fixtureId: null,
    contract,
    outcome,
    attemptedOutboundRequests: budget.attemptedCount,
    vinForFingerprint: input.authorization.vin,
    categoryOverride: category,
    resultCapture,
    notes,
  };

  try {
    return buildSandboxAttestationEvidence(evidenceInput);
  } catch (err: unknown) {
    const errorCode = errorCodeFromUnknown(err);
    const fallbackNotes = [
      ...notes,
      'Share-safe evidence fingerprint only (capture artifact holds redacted vehicle fields)',
      `Evidence build fallback: ${errorCode}`,
    ];
    try {
      return buildSandboxAttestationEvidence({
        ...evidenceInput,
        outcome: redactOutcomeForShareableEvidence(outcome),
        notes: fallbackNotes,
      });
    } catch (fallbackErr: unknown) {
      const fallbackCode = errorCodeFromUnknown(fallbackErr);
      return buildCapturePreservingHandoffEvidence({
        targetHostname: productionEvidenceHostname(),
        outcome,
        attemptedOutboundRequests: budget.attemptedCount,
        vinForFingerprint: input.authorization.vin,
        diagnosticCategory: category,
        resultCapture,
        notes: [
          ...notes,
          'Capture artifact committed; shareable evidence build exhausted',
          `Evidence build fallback: ${errorCode}`,
          `Evidence build fallback: ${fallbackCode}`,
        ],
      });
    }
  }
}

export function resolveProductionAttestationAuthorization(
  cliLiveProduction: boolean,
): ProductionAttestationAuthorization {
  const env = readProductionAttestationAuthorizationFromEnv();
  return { cliLiveProduction, ...env };
}

export { formatAttestationEvidenceMarkdown };
