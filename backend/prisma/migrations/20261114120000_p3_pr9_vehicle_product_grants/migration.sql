-- CreateEnum
CREATE TYPE "VehicleProductGrantStatus" AS ENUM ('ACTIVE', 'REVOKED');

-- CreateTable
CREATE TABLE "vehicle_product_grants" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "product_slug" "ProductSlug" NOT NULL,
    "status" "VehicleProductGrantStatus" NOT NULL DEFAULT 'ACTIVE',
    "grant_version" INTEGER NOT NULL DEFAULT 1,
    "granted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMP(3),
    "granted_by_user_id" TEXT NOT NULL,
    "revoked_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vehicle_product_grants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_product_grants_vehicle_id_product_slug_key" ON "vehicle_product_grants"("vehicle_id", "product_slug");

-- CreateIndex
CREATE INDEX "vehicle_product_grants_organization_id_product_slug_status_idx" ON "vehicle_product_grants"("organization_id", "product_slug", "status");

-- CreateIndex
CREATE INDEX "vehicle_product_grants_vehicle_id_idx" ON "vehicle_product_grants"("vehicle_id");

-- AddForeignKey
ALTER TABLE "vehicle_product_grants" ADD CONSTRAINT "vehicle_product_grants_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_product_grants" ADD CONSTRAINT "vehicle_product_grants_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;