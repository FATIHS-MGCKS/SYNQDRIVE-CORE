-- P6-PR1: Rental-owned trip↔booking overlay (foundation only; no cutover).

CREATE TYPE "RentalTripLinkStatus" AS ENUM ('ACTIVE', 'SUPERSEDED', 'UNLINKED');

CREATE TYPE "RentalTripLinkCreatedBy" AS ENUM ('SYSTEM', 'USER', 'BACKFILL');

CREATE TABLE "rental_trip_links" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "trip_id" TEXT NOT NULL,
    "booking_id" TEXT,
    "customer_id" TEXT,
    "link_source" "TripBookingLinkSource",
    "status" "RentalTripLinkStatus" NOT NULL,
    "superseded_at" TIMESTAMP(3),
    "superseded_by_id" TEXT,
    "correction_reason" TEXT,
    "legacy_fingerprint" TEXT,
    "linked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" "RentalTripLinkCreatedBy" NOT NULL DEFAULT 'SYSTEM',
    "created_by_user_id" TEXT,
    "correlation_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rental_trip_links_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "rental_trip_links" ADD CONSTRAINT "rental_trip_links_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "rental_trip_links" ADD CONSTRAINT "rental_trip_links_trip_id_fkey"
    FOREIGN KEY ("trip_id") REFERENCES "vehicle_trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "rental_trip_links" ADD CONSTRAINT "rental_trip_links_booking_id_fkey"
    FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "rental_trip_links" ADD CONSTRAINT "rental_trip_links_superseded_by_id_fkey"
    FOREIGN KEY ("superseded_by_id") REFERENCES "rental_trip_links"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "rental_trip_links_organization_id_idx" ON "rental_trip_links"("organization_id");
CREATE INDEX "rental_trip_links_trip_id_idx" ON "rental_trip_links"("trip_id");
CREATE INDEX "rental_trip_links_booking_id_idx" ON "rental_trip_links"("booking_id");
CREATE INDEX "rental_trip_links_organization_id_trip_id_idx" ON "rental_trip_links"("organization_id", "trip_id");
CREATE INDEX "rental_trip_links_trip_id_superseded_at_idx" ON "rental_trip_links"("trip_id", "superseded_at");

-- Exactly one current decision per (organization, trip), including UNLINKED.
CREATE UNIQUE INDEX "rental_trip_links_org_trip_current_uq"
    ON "rental_trip_links" ("organization_id", "trip_id")
    WHERE "superseded_at" IS NULL;
