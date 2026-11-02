-- One Auto OEM specification PRA — nullable Vehicle OEM identity columns (no backfill).

ALTER TABLE "vehicles"
  ADD COLUMN IF NOT EXISTS "oem_engine_code" TEXT,
  ADD COLUMN IF NOT EXISTS "oem_engine_desc" TEXT,
  ADD COLUMN IF NOT EXISTS "oem_transmission_code" TEXT,
  ADD COLUMN IF NOT EXISTS "oem_transmission_desc" TEXT,
  ADD COLUMN IF NOT EXISTS "exterior_color_desc" TEXT,
  ADD COLUMN IF NOT EXISTS "oem_exterior_color_code" TEXT,
  ADD COLUMN IF NOT EXISTS "interior_trim_desc" TEXT,
  ADD COLUMN IF NOT EXISTS "oem_interior_trim_code" TEXT,
  ADD COLUMN IF NOT EXISTS "oem_model_range_desc" TEXT,
  ADD COLUMN IF NOT EXISTS "oem_derivative_desc" TEXT;
