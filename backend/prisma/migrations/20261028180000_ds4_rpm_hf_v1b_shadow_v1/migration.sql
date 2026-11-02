-- DS4 RPM HF V1B post-trip shadow (dormant by default; no customer scoring).

CREATE TABLE ds4_rpm_hf_v1b_shadow_runs_v1 (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  vehicle_id TEXT NOT NULL,
  trip_id TEXT NOT NULL,
  engine_version TEXT NOT NULL,
  input_fingerprint TEXT NOT NULL,
  shadow_status TEXT NOT NULL,
  summary_json JSONB NOT NULL,
  computed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ds4_rpm_hf_v1b_shadow_runs_status_chk CHECK (
    shadow_status IN ('SUCCEEDED', 'TERMINAL_INELIGIBLE', 'TERMINAL_FAILED')
  )
);

CREATE UNIQUE INDEX ds4_rpm_hf_v1b_shadow_runs_succeeded_fp_uq
  ON ds4_rpm_hf_v1b_shadow_runs_v1 (organization_id, trip_id, engine_version, input_fingerprint)
  WHERE shadow_status = 'SUCCEEDED';

CREATE INDEX ds4_rpm_hf_v1b_shadow_runs_org_trip_idx
  ON ds4_rpm_hf_v1b_shadow_runs_v1 (organization_id, trip_id);

CREATE TABLE ds4_rpm_hf_v1b_shadow_outbox_v1 (
  outbox_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL,
  vehicle_id TEXT NOT NULL,
  trip_id TEXT NOT NULL,
  engine_version TEXT NOT NULL,
  status TEXT NOT NULL,
  attempt_count INT NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL,
  last_error_code TEXT,
  last_error_at TIMESTAMPTZ,
  claim_token TEXT,
  claim_expires_at TIMESTAMPTZ,
  /** Fingerprint of last SUCCEEDED shadow input; used for bounded input-revision reopen only. */
  succeeded_input_fingerprint TEXT,
  revision_last_probed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ds4_rpm_hf_v1b_shadow_outbox_status_chk CHECK (
    status IN ('PENDING', 'PROCESSING', 'SUCCEEDED', 'FAILED_RETRYABLE', 'SKIPPED_INELIGIBLE')
  )
);

CREATE UNIQUE INDEX ds4_rpm_hf_v1b_shadow_outbox_trip_engine_uq
  ON ds4_rpm_hf_v1b_shadow_outbox_v1 (organization_id, trip_id, engine_version);

CREATE INDEX ds4_rpm_hf_v1b_shadow_outbox_claim_idx
  ON ds4_rpm_hf_v1b_shadow_outbox_v1 (status, next_attempt_at, created_at);
