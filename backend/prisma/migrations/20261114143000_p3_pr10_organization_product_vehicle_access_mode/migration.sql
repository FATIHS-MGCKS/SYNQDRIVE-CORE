-- CreateEnum
CREATE TYPE "OrganizationProductVehicleAccessMode" AS ENUM ('ORGANIZATION_WIDE', 'SELECTED_VEHICLES');

-- AlterTable
ALTER TABLE "organization_products" ADD COLUMN "vehicle_access_mode" "OrganizationProductVehicleAccessMode";

UPDATE "organization_products" SET "vehicle_access_mode" = 'ORGANIZATION_WIDE' WHERE "vehicle_access_mode" IS NULL;

ALTER TABLE "organization_products" ALTER COLUMN "vehicle_access_mode" SET NOT NULL;