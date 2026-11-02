import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  ONEAUTO_ATTESTATION_SYNTHETIC_VIN,
  ONEAUTO_ATTESTATION_RESULT_CAPTURE_ENABLED_ENV,
  ONEAUTO_ATTESTATION_RESULT_CAPTURE_OUTPUT_PATH_ENV,
  ONEAUTO_PRODUCTION_ATTESTATION_RESULT_CAPTURE_OWNER_AUTH_ENV,
} from './oneauto-sandbox-attestation.constants';
import { runLiveProductionAttestation } from './oneauto-sandbox-attestation.runner';
import {
  assertCaptureArtifactRedaction,
  assertCapturePreflight,
  assertSafeCaptureOutputPath,
  attemptResultCapture,
  buildCapturedVehicleFields,
  buildResultCaptureDocument,
  writeResultCaptureArtifactAtomic,
} from './oneauto-sandbox-attestation-result-capture.util';
import { getDocumentedOneAutoContract } from '../catalog/oneauto-documented-contracts';
import { classifySandboxAttestationOutcome } from './oneauto-sandbox-attestation-evaluate.util';
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
  oem_fuel_type_desc: 'Diesel',
  oem_engine_desc: 'DDAA',
  oem_transmission_type_desc: 'automatic',
  oem_drivetrain_desc: 'All-wheel drive',
  power_kw: 140,
  power_bhp: 190,
  oem_colour_desc: 'Daytona grey',
  manufactured_year: 2018,
};

function successOutcome(overrides?: Partial<AttestationTransportOutcome>): AttestationTransportOutcome {
  return {
    httpStatus: 200,
    body: { success: true, result: sampleResult },
    responseByteLength: 400,
    envelopeSuccess: true,
    transportErrorCode: null,
    responseHeaders: { retryAfterRaw: null, locationRaw: null, providerStatusRaw: null },
    ...overrides,
  };
}

function tempCapturePath(): string {
  return path.join(os.tmpdir(), `oneauto-capture-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
}

describe('OneAuto P1 secure result capture (offline)', () => {
  const envBackup: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of [
      ONEAUTO_ATTESTATION_RESULT_CAPTURE_ENABLED_ENV,
      ONEAUTO_PRODUCTION_ATTESTATION_RESULT_CAPTURE_OWNER_AUTH_ENV,
      ONEAUTO_ATTESTATION_RESULT_CAPTURE_OUTPUT_PATH_ENV,
    ]) {
      envBackup[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(envBackup)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('capture disabled by default (no CLI flag, no resultCapture meta)', async () => {
    const evidence = await runLiveProductionAttestation({
      authorization: fullAuth,
      fetchImpl: async () =>
        ({
          status: 200,
          headers: { get: () => null },
          text: async () => JSON.stringify({ success: true, result: sampleResult }),
        }) as unknown as Response,
    });
    expect(evidence.resultCapture).toBeUndefined();
    expect(evidence.attemptedOutboundRequests).toBe(1);
  });

  it('rejects unauthorized capture (missing env flags)', async () => {
    const reject = assertCapturePreflight({
      cliCaptureRequested: true,
      envCaptureEnabled: undefined,
      captureOwnerAuthorized: undefined,
      outputPath: '/tmp/x.json',
    });
    expect(reject).toBe('CAPTURE_ENV_FLAG_REQUIRED');
  });

  it('never captures HTTP 202', () => {
    const outcome: AttestationTransportOutcome = {
      httpStatus: 202,
      body: { success: true },
      responseByteLength: 100,
      envelopeSuccess: null,
      transportErrorCode: null,
      responseHeaders: { retryAfterRaw: null, locationRaw: null, providerStatusRaw: null },
    };
    const category = classifySandboxAttestationOutcome(outcome, contract());
    const result = attemptResultCapture({
      cliCaptureRequested: true,
      diagnosticCategory: category,
      outcome,
      expectedVin: VIN,
      envCaptureEnabled: '1',
      captureOwnerAuthorized: '1',
      outputPath: tempCapturePath(),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.rejectCode).toBe('CAPTURE_NOT_ELIGIBLE');
  });

  it('never captures HTTP 206 as complete result', () => {
    const outcome: AttestationTransportOutcome = {
      httpStatus: 206,
      body: { success: true, result: sampleResult },
      responseByteLength: 100,
      envelopeSuccess: null,
      transportErrorCode: null,
      responseHeaders: { retryAfterRaw: null, locationRaw: null, providerStatusRaw: null },
    };
    const category = classifySandboxAttestationOutcome(outcome, contract());
    const result = attemptResultCapture({
      cliCaptureRequested: true,
      diagnosticCategory: category,
      outcome,
      expectedVin: VIN,
      envCaptureEnabled: '1',
      captureOwnerAuthorized: '1',
      outputPath: tempCapturePath(),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.rejectCode).toBe('CAPTURE_NOT_ELIGIBLE');
  });

  it('rejects HTTP 200 success=false', () => {
    const built = buildResultCaptureDocument({
      expectedVin: VIN,
      body: { success: false, error: 'fail' },
    });
    expect('rejectCode' in built && built.rejectCode).toBe('CAPTURE_ENVELOPE_INVALID');
  });

  it('rejects VIN mismatch', () => {
    const built = buildResultCaptureDocument({
      expectedVin: VIN,
      body: {
        success: true,
        result: { ...sampleResult, vehicle_identification_number: 'WBA00000000000000' },
      },
    });
    expect('rejectCode' in built && built.rejectCode).toBe('CAPTURE_VIN_MISMATCH');
  });

  it('redacts sensitive keys and retains useful vehicle values', () => {
    const fields = buildCapturedVehicleFields({
      ...sampleResult,
      api_key: 'secret',
      email: 'a@b.c',
      vehicle_identification_number: VIN,
    });
    expect(fields.make).toBe('Audi');
    expect(fields.powerKw).toBe(140);
    expect(fields.colour).toBe('Daytona grey');
    expect((fields as Record<string, unknown>).api_key).toBeUndefined();
  });

  it('writes capture artifact with mode 0600 and path safety', () => {
    const target = tempCapturePath();
    const built = buildResultCaptureDocument({
      expectedVin: VIN,
      body: { success: true, result: sampleResult },
    });
    expect('document' in built).toBe(true);
    if (!('document' in built)) return;
    const { resolvedFile } = assertSafeCaptureOutputPath(target);
    writeResultCaptureArtifactAtomic(resolvedFile, built.document);
    const stat = fs.statSync(resolvedFile);
    expect(stat.mode & 0o777).toBe(0o600);
    const serialized = fs.readFileSync(resolvedFile, 'utf8');
    assertCaptureArtifactRedaction(serialized);
    expect(serialized).toContain('"make": "Audi"');
    expect(serialized).not.toContain(VIN);
    fs.unlinkSync(resolvedFile);
  });

  it('refuses to overwrite existing capture file', () => {
    const target = tempCapturePath();
    fs.writeFileSync(target, '{}', { mode: 0o600 });
    expect(() => assertSafeCaptureOutputPath(target)).toThrow();
    fs.unlinkSync(target);
  });

  it('rejects relative capture paths', () => {
    expect(() => assertSafeCaptureOutputPath('relative/capture.json')).toThrow();
  });

  it('integrates capture with live attestation mock (one fetch, no DB)', async () => {
    const target = tempCapturePath();
    process.env[ONEAUTO_ATTESTATION_RESULT_CAPTURE_ENABLED_ENV] = '1';
    process.env[ONEAUTO_PRODUCTION_ATTESTATION_RESULT_CAPTURE_OWNER_AUTH_ENV] = '1';
    process.env[ONEAUTO_ATTESTATION_RESULT_CAPTURE_OUTPUT_PATH_ENV] = target;

    const fetchMock = jest.fn(async () =>
      ({
        status: 200,
        headers: { get: () => null },
        text: async () => JSON.stringify({ success: true, result: sampleResult }),
      }) as unknown as Response,
    );

    const evidence = await runLiveProductionAttestation({
      authorization: fullAuth,
      fetchImpl: fetchMock,
      captureRedactedResult: true,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(evidence.attestationQualified).toBe(true);
    expect(evidence.resultCapture?.written).toBe(true);
    expect(evidence.resultCapture?.artifactSha256Prefix).toHaveLength(16);
    expect(JSON.stringify(evidence)).not.toContain('Daytona grey');
    expect(fs.existsSync(target)).toBe(true);
    fs.unlinkSync(target);
  });

  it('documents future power_kw mapping target without schema changes', () => {
    const motionReferenceField = 'system_motor_power_kw';
    const telemetryField = 'traction_battery_power_kw';
    expect(motionReferenceField).toBe('system_motor_power_kw');
    expect(telemetryField).toBe('traction_battery_power_kw');
    expect(buildCapturedVehicleFields(sampleResult).powerKw).toBe(140);
  });
});
