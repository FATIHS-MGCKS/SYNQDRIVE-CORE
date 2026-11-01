-- Hardening: calibration eligibility columns + immutability guard (privileged DELETE via session flag).

ALTER TABLE "tire_wear_v3_calibration_snapshot_v1"
    ADD COLUMN "calibration_eligibility_digest" TEXT,
    ADD COLUMN "latest_source_measurement_at" TIMESTAMPTZ(6),
    ADD COLUMN "source_data_cutoff_at" TIMESTAMPTZ(6),
    ADD COLUMN "pairing_eligible" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "measurement_ids_used" JSONB NOT NULL DEFAULT '[]';

UPDATE "tire_wear_v3_calibration_snapshot_v1"
SET
    "calibration_eligibility_digest" = COALESCE("calibration_eligibility_digest", "input_fingerprint"),
    "source_data_cutoff_at" = COALESCE("source_data_cutoff_at", "source_computed_at")
WHERE "calibration_eligibility_digest" IS NULL OR "source_data_cutoff_at" IS NULL;

ALTER TABLE "tire_wear_v3_calibration_snapshot_v1"
    ALTER COLUMN "calibration_eligibility_digest" SET NOT NULL,
    ALTER COLUMN "source_data_cutoff_at" SET NOT NULL;

CREATE INDEX "tire_wear_v3_cal_snap_setup_elig_idx"
    ON "tire_wear_v3_calibration_snapshot_v1"("tire_setup_id", "calibration_eligibility_digest");

CREATE OR REPLACE FUNCTION tire_wear_v3_calibration_snapshot_immutable_guard()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'tire_wear_v3_calibration_snapshot_v1: rows are immutable (UPDATE forbidden)';
  END IF;
  IF TG_OP = 'DELETE' THEN
    IF current_setting('synqdrive.calibration_snapshot_privileged_delete', true) IS DISTINCT FROM '1' THEN
      RAISE EXCEPTION 'tire_wear_v3_calibration_snapshot_v1: DELETE requires privileged maintenance session (set synqdrive.calibration_snapshot_privileged_delete=1)';
    END IF;
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tire_wear_v3_calibration_snapshot_immutable_guard_trg
    BEFORE UPDATE OR DELETE ON "tire_wear_v3_calibration_snapshot_v1"
    FOR EACH ROW EXECUTE FUNCTION tire_wear_v3_calibration_snapshot_immutable_guard();
