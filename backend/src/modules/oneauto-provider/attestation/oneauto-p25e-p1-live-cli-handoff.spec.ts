import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  ONEAUTO_ATTESTATION_SYNTHETIC_VIN,
  ONEAUTO_ATTESTATION_RESULT_CAPTURE_ENABLED_ENV,
  ONEAUTO_ATTESTATION_RESULT_CAPTURE_OUTPUT_PATH_ENV,
  ONEAUTO_PRODUCTION_ATTESTATION_RESULT_CAPTURE_OWNER_AUTH_ENV,
} from './oneauto-sandbox-attestation.constants';
import * as evidenceUtil from './oneauto-sandbox-attestation-evidence.util';
import { runLiveProductionAttestation } from './oneauto-sandbox-attestation.runner';
import {
  buildLiveCliHandoffMetadata,
  resolveLiveCliExitCode,
} from './oneauto-sandbox-attestation-live-cli-handoff.util';
import { getDocumentedOneAutoContract } from '../catalog/oneauto-documented-contracts';
import type { AttestationTransportOutcome } from './oneauto-sandbox-attestation-evaluate.util';

const VIN = ONEAUTO_ATTESTATION_SYNTHETIC_VIN;
const contract = () => getDocumentedOneAutoContract('OE_VIN_LOOKUP_EU')!;

const fullAuth = {
  cliLiveProduction: true,
  apiKey: 'redacted-key',
  vin: VIN,
  ownerAuthorized: '1',
  vinUseAuthorized: '1',
  billingAcknowledged: '1',
  oneGetConfirmed: '1',
};

const sampleResult = {
  vehicle_identification_number: VIN,
  manufacturer_desc: 'Audi',
  oem_model_range_desc: 'A4 (B9)',
  oem_derivative_desc: '2.0 TDI',
  oem_vehicle_desc: 'Audi A4 2.0 TDI',
  vehicle_desc: 'Audi A4 2.0 TDI',
  oem_fuel_type_desc: 'Diesel',
  oem_engine_desc: 'DDAA',
  oem_transmission_type_desc: 'automatic',
  oem_drivetrain_desc: 'All-wheel drive',
  oem_body_type_desc: 'Limousine',
  oem_interior_trim_desc: 'Leather',
  manufactured_year: 2018,
  date_last_updated: '2025-09-23',
};

function successFetch(): typeof fetch {
  const body = JSON.stringify({ success: true, result: sampleResult });
  return (async () =>
    new Response(body, {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })) as typeof fetch;
}

function tempCapturePath(): string {
  return path.join(
    os.tmpdir(),
    `oneauto-capture-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.json`,
  );
}

describe('OneAuto live CLI handoff (offline)', () => {
  const envBackup: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of [
      ONEAUTO_ATTESTATION_RESULT_CAPTURE_ENABLED_ENV,
      ONEAUTO_PRODUCTION_ATTESTATION_RESULT_CAPTURE_OWNER_AUTH_ENV,
      ONEAUTO_ATTESTATION_RESULT_CAPTURE_OUTPUT_PATH_ENV,
    ]) {
      envBackup[key] = process.env[key];
    }
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(envBackup)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    jest.restoreAllMocks();
  });

  it('returns share-safe evidence when full evidence build fails after capture succeeds', async () => {
    const target = tempCapturePath();
    process.env[ONEAUTO_ATTESTATION_RESULT_CAPTURE_ENABLED_ENV] = '1';
    process.env[ONEAUTO_PRODUCTION_ATTESTATION_RESULT_CAPTURE_OWNER_AUTH_ENV] = '1';
    process.env[ONEAUTO_ATTESTATION_RESULT_CAPTURE_OUTPUT_PATH_ENV] = target;

    const realBuild = evidenceUtil.buildSandboxAttestationEvidence;
    let calls = 0;
    jest.spyOn(evidenceUtil, 'buildSandboxAttestationEvidence').mockImplementation((input) => {
      calls += 1;
      if (calls === 1) {
        throw new Error('Attestation evidence leaked full VIN pattern');
      }
      return realBuild(input);
    });

    const evidence = await runLiveProductionAttestation({
      authorization: fullAuth,
      fetchImpl: successFetch(),
      captureRedactedResult: true,
    });

    expect(fs.existsSync(target)).toBe(true);
    expect(evidence.resultCapture?.written).toBe(true);
    expect(evidence.attestationQualified).toBe(true);
    expect(evidence.attemptedOutboundRequests).toBe(1);
    expect(evidence.notes.some((n) => n.includes('Evidence build fallback:'))).toBe(true);
    expect(evidence.responseFingerprint.nonJsonBody).toBe(true);

    const handoff = buildLiveCliHandoffMetadata({
      evidence,
      evidenceBuildFailed: true,
      evidenceBuildErrorCode: 'EVIDENCE_REDACTION_FAILED',
      stdoutEmitFailed: false,
    });
    expect(resolveLiveCliExitCode(handoff)).toBe(3);
  });

  it('does not overwrite an existing capture file when capture path is taken', async () => {
    const target = tempCapturePath();
    fs.writeFileSync(target, '{"existing":true}\n', { encoding: 'utf8', mode: 0o600 });
    process.env[ONEAUTO_ATTESTATION_RESULT_CAPTURE_ENABLED_ENV] = '1';
    process.env[ONEAUTO_PRODUCTION_ATTESTATION_RESULT_CAPTURE_OWNER_AUTH_ENV] = '1';
    process.env[ONEAUTO_ATTESTATION_RESULT_CAPTURE_OUTPUT_PATH_ENV] = target;

    const evidence = await runLiveProductionAttestation({
      authorization: fullAuth,
      fetchImpl: successFetch(),
      captureRedactedResult: true,
    });

    expect(evidence.resultCapture?.written).toBe(false);
    expect(evidence.resultCapture?.rejectCode).toBe('CAPTURE_FILE_EXISTS');
    expect(fs.readFileSync(target, 'utf8')).toContain('"existing":true');
    expect(evidence.attemptedOutboundRequests).toBe(1);
  });

  it('maps stdout emit failure after successful capture to exit code 3 without implying retry', () => {
    const handoff = buildLiveCliHandoffMetadata({
      evidence: {
        schemaVersion: 'oneauto-sandbox-attestation-v2',
        recordedAtUtc: new Date().toISOString(),
        attestationEnvironment: 'PRODUCTION',
        targetSku: 'OE_VIN_LOOKUP_EU',
        mode: 'live-production',
        fixtureId: null,
        targetHostname: 'api.oneautoapi.com',
        httpMethod: 'GET',
        httpStatus: 200,
        envelopeSuccess: true,
        responseByteLength: 100,
        diagnosticCategory: 'SYNC_ATTESTATION_SUCCESS',
        attestationQualified: true,
        attemptedOutboundRequests: 1,
        billingStatus: 'UNKNOWN',
        providerContractStatus: 'DOCUMENTED',
        vinSha256Prefix: 'abc',
        responseFingerprint: {
          httpStatusClass: '200',
          asyncState: 'SYNC_RESPONSE',
          topLevelJsonKeys: null,
          resultObjectKeys: null,
          envelopeSuccessField: null,
          providerStatusHeader: null,
          retryAfterSeconds: null,
          locationHostPathRedacted: null,
          asyncJobIdFingerprint: null,
          providerErrorCode: null,
          errorFieldPresent: false,
          nonJsonBody: true,
          sensitiveFieldKeysDetected: [],
        },
        resultCapture: { attempted: true, written: true, artifactSha256Prefix: 'deadbeefdeadbeef' },
        evidenceSha256: 'x',
        notes: [],
      },
      evidenceBuildFailed: false,
      evidenceBuildErrorCode: null,
      stdoutEmitFailed: true,
    });
    expect(handoff.exitPhase).toBe('STDOUT_EMIT_FAILED');
    expect(handoff.attemptedOutboundRequests).toBe(1);
    expect(resolveLiveCliExitCode(handoff)).toBe(3);
  });
});
