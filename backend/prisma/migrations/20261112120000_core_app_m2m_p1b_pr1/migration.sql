-- CreateEnum
CREATE TYPE "CoreAppServiceClientStatus" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "CoreAppServiceGrantStatus" AS ENUM ('ACTIVE', 'REVOKED');

-- CreateTable
CREATE TABLE "core_app_service_clients" (
    "id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "product_slug" "ProductSlug" NOT NULL,
    "credential_hash" TEXT NOT NULL,
    "credential_version" INTEGER NOT NULL DEFAULT 1,
    "status" "CoreAppServiceClientStatus" NOT NULL DEFAULT 'ACTIVE',
    "allowed_scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "core_app_service_clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core_app_service_org_grants" (
    "id" TEXT NOT NULL,
    "service_client_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "status" "CoreAppServiceGrantStatus" NOT NULL DEFAULT 'ACTIVE',
    "grant_version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "core_app_service_org_grants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "core_app_service_clients_client_id_key" ON "core_app_service_clients"("client_id");

-- CreateIndex
CREATE INDEX "core_app_service_org_grants_organization_id_idx" ON "core_app_service_org_grants"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "core_app_service_org_grants_service_client_id_organization_id_key" ON "core_app_service_org_grants"("service_client_id", "organization_id");

-- AddForeignKey
ALTER TABLE "core_app_service_org_grants" ADD CONSTRAINT "core_app_service_org_grants_service_client_id_fkey" FOREIGN KEY ("service_client_id") REFERENCES "core_app_service_clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core_app_service_org_grants" ADD CONSTRAINT "core_app_service_org_grants_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
