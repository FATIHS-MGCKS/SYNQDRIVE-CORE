-- VSI Universal Discovery P1a — operational HEAD inventory column (semantic profile unchanged).

ALTER TABLE "vehicle_signal_capability_profiles"
ADD COLUMN "native_signal_discovery_inventory" JSONB NOT NULL DEFAULT '{"contractVersion":"vsi-native-signal-discovery-v1","entries":[],"profileLimitations":[]}'::jsonb;

UPDATE "vehicle_signal_capability_profiles"
SET "native_signal_discovery_inventory" = '{"contractVersion":"vsi-native-signal-discovery-v1","entries":[],"profileLimitations":[]}'::jsonb
WHERE "native_signal_discovery_inventory" = '[]'::jsonb;
