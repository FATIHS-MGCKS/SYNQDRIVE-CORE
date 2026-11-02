/** Local-only capture artifact — never commit to git. */
export type OneAutoAttestationResultCaptureV1 = {
  schemaVersion: 'oneauto-attestation-result-capture-v1';
  recordedAtUtc: string;
  targetSku: 'OE_VIN_LOOKUP_EU';
  vinSha256Prefix: string;
  vehicle: OneAutoAttestationCapturedVehicleFields;
  /** Operator-managed file; delete within retention window. */
  retentionPolicy: 'LOCAL_OPERATOR_ARTIFACT_DELETE_WITHIN_90_DAYS';
};

export type OneAutoAttestationCapturedVehicleFields = {
  make?: string;
  modelRange?: string;
  derivative?: string;
  vehicleDesc?: string;
  oemVehicleDesc?: string;
  manufacturedYear?: number;
  oemModelYear?: number;
  fuel?: string;
  engine?: string;
  transmission?: string;
  drivetrain?: string;
  powerKw?: number;
  powerBhp?: number;
  colour?: string;
  dateLastUpdated?: string;
};

export type OneAutoAttestationResultCaptureOutcome =
  | { ok: true; artifactPath: string; artifactSha256: string }
  | { ok: false; rejectCode: OneAutoAttestationResultCaptureRejectCode };

export type OneAutoAttestationResultCaptureRejectCode =
  | 'CAPTURE_DISABLED'
  | 'CAPTURE_CLI_NOT_REQUESTED'
  | 'CAPTURE_OWNER_AUTH_REQUIRED'
  | 'CAPTURE_ENV_FLAG_REQUIRED'
  | 'CAPTURE_OUTPUT_PATH_REQUIRED'
  | 'CAPTURE_NOT_ELIGIBLE'
  | 'CAPTURE_VIN_MISMATCH'
  | 'CAPTURE_ENVELOPE_INVALID'
  | 'CAPTURE_PATH_UNSAFE'
  | 'CAPTURE_FILE_EXISTS'
  | 'CAPTURE_WRITE_FAILED';

export type OneAutoAttestationResultCaptureEvidenceMeta = {
  attempted: boolean;
  written: boolean;
  rejectCode?: OneAutoAttestationResultCaptureRejectCode;
  artifactSha256Prefix?: string;
};
