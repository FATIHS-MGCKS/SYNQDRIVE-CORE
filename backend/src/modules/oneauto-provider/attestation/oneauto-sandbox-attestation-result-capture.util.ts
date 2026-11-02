import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { normalizeVin } from '../client/oneauto-vin.util';
import type { AttestationTransportOutcome } from './oneauto-sandbox-attestation-evaluate.util';
import { attestationQualified } from './oneauto-sandbox-attestation-evaluate.util';
import { vinSha256Prefix } from './oneauto-sandbox-attestation-evidence.util';
import type {
  OneAutoAttestationCapturedVehicleFields,
  OneAutoAttestationResultCaptureOutcome,
  OneAutoAttestationResultCaptureRejectCode,
  OneAutoAttestationResultCaptureV1,
} from './oneauto-sandbox-attestation-result-capture.types';
import type { OneAutoSandboxAttestationDiagnosticCategory } from './oneauto-sandbox-attestation.types';
import {
  ONEAUTO_ATTESTATION_RESULT_CAPTURE_ENABLED_ENV,
  ONEAUTO_ATTESTATION_RESULT_CAPTURE_OUTPUT_PATH_ENV,
  ONEAUTO_PRODUCTION_ATTESTATION_RESULT_CAPTURE_OWNER_AUTH_ENV,
} from './oneauto-sandbox-attestation.constants';

const SENSITIVE_RESULT_KEY =
  /authorization|api[_-]?key|password|secret|token|email|phone|address|signed|credential|callback/i;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function readString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function readYear(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 1900 && value <= 2100) {
    return value;
  }
  return undefined;
}

function readPower(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 2000) {
    return value;
  }
  return undefined;
}

export function captureAuthorizationFromEnv(): {
  envCaptureEnabled: string | undefined;
  captureOwnerAuthorized: string | undefined;
  outputPath: string | undefined;
} {
  return {
    envCaptureEnabled: process.env[ONEAUTO_ATTESTATION_RESULT_CAPTURE_ENABLED_ENV],
    captureOwnerAuthorized: process.env[ONEAUTO_PRODUCTION_ATTESTATION_RESULT_CAPTURE_OWNER_AUTH_ENV],
    outputPath: process.env[ONEAUTO_ATTESTATION_RESULT_CAPTURE_OUTPUT_PATH_ENV]?.trim(),
  };
}

export function assertCapturePreflight(input: {
  cliCaptureRequested: boolean;
  envCaptureEnabled: string | undefined;
  captureOwnerAuthorized: string | undefined;
  outputPath: string | undefined;
}): OneAutoAttestationResultCaptureRejectCode | null {
  if (!input.cliCaptureRequested) return 'CAPTURE_CLI_NOT_REQUESTED';
  if (input.envCaptureEnabled !== '1') return 'CAPTURE_ENV_FLAG_REQUIRED';
  if (input.captureOwnerAuthorized !== '1') return 'CAPTURE_OWNER_AUTH_REQUIRED';
  if (!input.outputPath) return 'CAPTURE_OUTPUT_PATH_REQUIRED';
  return null;
}

export function assertSafeCaptureOutputPath(rawPath: string): { resolvedFile: string } {
  if (!rawPath.trim()) {
    throw Object.assign(new Error('Empty capture path'), { code: 'CAPTURE_PATH_UNSAFE' });
  }
  if (!path.isAbsolute(rawPath)) {
    throw Object.assign(new Error('Capture path must be absolute'), { code: 'CAPTURE_PATH_UNSAFE' });
  }
  if (rawPath.includes('..')) {
    throw Object.assign(new Error('Capture path traversal forbidden'), { code: 'CAPTURE_PATH_UNSAFE' });
  }
  const normalized = path.normalize(rawPath);
  const dir = path.dirname(normalized);
  const base = path.basename(normalized);
  if (!base || base === '.' || base === '..') {
    throw Object.assign(new Error('Invalid capture file name'), { code: 'CAPTURE_PATH_UNSAFE' });
  }
  let resolvedDir: string;
  try {
    resolvedDir = fs.realpathSync(dir);
  } catch {
    throw Object.assign(new Error('Capture directory unavailable'), { code: 'CAPTURE_PATH_UNSAFE' });
  }
  const resolvedFile = path.join(resolvedDir, base);
  if (fs.existsSync(resolvedFile)) {
    throw Object.assign(new Error('Capture file already exists'), { code: 'CAPTURE_FILE_EXISTS' });
  }
  return { resolvedFile };
}

export function extractProviderResultVin(body: unknown): string | null {
  if (!isPlainObject(body) || !isPlainObject(body.result)) return null;
  const vin = readString(body.result.vehicle_identification_number);
  return vin ? normalizeVin(vin) : null;
}

export function buildCapturedVehicleFields(result: Record<string, unknown>): OneAutoAttestationCapturedVehicleFields {
  const out: OneAutoAttestationCapturedVehicleFields = {};
  const make = readString(result.manufacturer_desc);
  if (make) out.make = make;
  const modelRange = readString(result.oem_model_range_desc);
  if (modelRange) out.modelRange = modelRange;
  const derivative = readString(result.oem_derivative_desc);
  if (derivative) out.derivative = derivative;
  const vehicleDesc = readString(result.vehicle_desc);
  if (vehicleDesc) out.vehicleDesc = vehicleDesc;
  const oemVehicleDesc = readString(result.oem_vehicle_desc);
  if (oemVehicleDesc) out.oemVehicleDesc = oemVehicleDesc;
  const manufacturedYear = readYear(result.manufactured_year);
  if (manufacturedYear != null) out.manufacturedYear = manufacturedYear;
  const oemModelYear = readYear(result.oem_model_year);
  if (oemModelYear != null) out.oemModelYear = oemModelYear;
  const fuel = readString(result.oem_fuel_type_desc);
  if (fuel) out.fuel = fuel;
  const engine = readString(result.oem_engine_desc);
  if (engine) out.engine = engine;
  const transmission = readString(result.oem_transmission_type_desc);
  if (transmission) out.transmission = transmission;
  const drivetrain = readString(result.oem_drivetrain_desc);
  if (drivetrain) out.drivetrain = drivetrain;
  const powerKw = readPower(result.power_kw);
  if (powerKw != null) out.powerKw = powerKw;
  const powerBhp = readPower(result.power_bhp);
  if (powerBhp != null) out.powerBhp = powerBhp;
  const colour = readString(result.oem_colour_desc);
  if (colour) out.colour = colour;
  const dateLastUpdated = readString(result.date_last_updated);
  if (dateLastUpdated) out.dateLastUpdated = dateLastUpdated;
  return out;
}

/** Drop sensitive keys and VIN duplication from raw provider result before mapping. */
export function sanitizeProviderResultForCapture(result: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(result)) {
    if (SENSITIVE_RESULT_KEY.test(key)) continue;
    if (key === 'vehicle_identification_number') continue;
    out[key] = value;
  }
  return out;
}

export function buildResultCaptureDocument(input: {
  expectedVin: string;
  body: unknown;
  recordedAtUtc?: string;
}): { document: OneAutoAttestationResultCaptureV1 } | { rejectCode: OneAutoAttestationResultCaptureRejectCode } {
  if (!isPlainObject(input.body) || input.body.success !== true || !isPlainObject(input.body.result)) {
    return { rejectCode: 'CAPTURE_ENVELOPE_INVALID' };
  }
  const providerVin = extractProviderResultVin(input.body);
  const expected = normalizeVin(input.expectedVin);
  if (!providerVin || !expected || providerVin !== expected) {
    return { rejectCode: 'CAPTURE_VIN_MISMATCH' };
  }
  const sanitized = sanitizeProviderResultForCapture(input.body.result);
  const vehicle = buildCapturedVehicleFields(sanitized);
  const prefix = vinSha256Prefix(expected);
  if (!prefix) return { rejectCode: 'CAPTURE_VIN_MISMATCH' };
  return {
    document: {
      schemaVersion: 'oneauto-attestation-result-capture-v1',
      recordedAtUtc: input.recordedAtUtc ?? new Date().toISOString(),
      targetSku: 'OE_VIN_LOOKUP_EU',
      vinSha256Prefix: prefix,
      vehicle,
      retentionPolicy: 'LOCAL_OPERATOR_ARTIFACT_DELETE_WITHIN_90_DAYS',
    },
  };
}

export function writeResultCaptureArtifactAtomic(
  resolvedFilePath: string,
  document: OneAutoAttestationResultCaptureV1,
): { artifactSha256: string } {
  const payload = `${JSON.stringify(document, null, 2)}\n`;
  const fd = fs.openSync(resolvedFilePath, 'wx', 0o600);
  try {
    fs.writeFileSync(fd, payload, { encoding: 'utf8' });
    fs.fchmodSync(fd, 0o600);
  } finally {
    fs.closeSync(fd);
  }
  const artifactSha256 = createHash('sha256').update(payload, 'utf8').digest('hex');
  return { artifactSha256 };
}

export function attemptResultCapture(input: {
  cliCaptureRequested: boolean;
  diagnosticCategory: OneAutoSandboxAttestationDiagnosticCategory;
  outcome: AttestationTransportOutcome;
  expectedVin: string;
  envCaptureEnabled: string | undefined;
  captureOwnerAuthorized: string | undefined;
  outputPath: string | undefined;
}): OneAutoAttestationResultCaptureOutcome {
  const preflight = assertCapturePreflight(input);
  if (preflight) {
    return { ok: false, rejectCode: preflight };
  }
  if (!attestationQualified(input.diagnosticCategory)) {
    return { ok: false, rejectCode: 'CAPTURE_NOT_ELIGIBLE' };
  }
  if (input.outcome.httpStatus !== 200 || input.outcome.envelopeSuccess !== true) {
    return { ok: false, rejectCode: 'CAPTURE_NOT_ELIGIBLE' };
  }
  const built = buildResultCaptureDocument({
    expectedVin: input.expectedVin,
    body: input.outcome.body,
  });
  if ('rejectCode' in built) {
    return { ok: false, rejectCode: built.rejectCode };
  }
  let resolvedFile: string;
  try {
    resolvedFile = assertSafeCaptureOutputPath(input.outputPath!).resolvedFile;
  } catch (err: unknown) {
    const code =
      err && typeof err === 'object' && 'code' in err && typeof (err as { code: unknown }).code === 'string'
        ? (err as { code: string }).code
        : 'CAPTURE_PATH_UNSAFE';
    return {
      ok: false,
      rejectCode: code as OneAutoAttestationResultCaptureRejectCode,
    };
  }
  try {
    const { artifactSha256 } = writeResultCaptureArtifactAtomic(resolvedFile, built.document);
    return { ok: true, artifactPath: resolvedFile, artifactSha256 };
  } catch {
    return { ok: false, rejectCode: 'CAPTURE_WRITE_FAILED' };
  }
}

export function assertCaptureArtifactRedaction(serialized: string): void {
  if (/x-api-key|authorization\s*:/i.test(serialized)) {
    throw new Error('Capture artifact leaked credential markers');
  }
  if (/"[A-HJ-NPR-Z0-9]{17}"/i.test(serialized)) {
    throw new Error('Capture artifact leaked full VIN pattern');
  }
  if (/vehicle_identification_number/i.test(serialized)) {
    throw new Error('Capture artifact must not store VIN field name');
  }
}
