-- Tire Wear V3 calibration shadow (P3) — additive, immutable prediction snapshots.

CREATE TABLE "tire_wear_v3_calibration_snapshot_v1" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "tire_setup_id" TEXT NOT NULL,
    "mount_period_id" TEXT,
    "wheel_position" TEXT NOT NULL,
    "physical_tire_id" TEXT,
    "prediction_created_at" TIMESTAMPTZ(6) NOT NULL,
    "source_computed_at" TIMESTAMPTZ(6) NOT NULL,
    "source_odometer_km" DOUBLE PRECISION,
    "model_version" TEXT NOT NULL,
    "model_config_hash" TEXT NOT NULL,
    "input_fingerprint" TEXT NOT NULL,
    "snapshot_schema_version" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "snapshot_payload" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tire_wear_v3_calibration_snapshot_v1_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "tire_wear_v3_calibration_snapshot_v1_idempotency_key_key"
    ON "tire_wear_v3_calibration_snapshot_v1"("idempotency_key");

CREATE INDEX "tire_wear_v3_cal_snap_org_vehicle_idx"
    ON "tire_wear_v3_calibration_snapshot_v1"("organization_id", "vehicle_id");

CREATE INDEX "tire_wear_v3_cal_snap_setup_pred_idx"
    ON "tire_wear_v3_calibration_snapshot_v1"("tire_setup_id", "prediction_created_at");

CREATE INDEX "tire_wear_v3_cal_snap_setup_fp_idx"
    ON "tire_wear_v3_calibration_snapshot_v1"("tire_setup_id", "input_fingerprint");

ALTER TABLE "tire_wear_v3_calibration_snapshot_v1"
    ADD CONSTRAINT "tire_wear_v3_calibration_snapshot_v1_tire_setup_id_fkey"
    FOREIGN KEY ("tire_setup_id") REFERENCES "vehicle_tire_setups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
