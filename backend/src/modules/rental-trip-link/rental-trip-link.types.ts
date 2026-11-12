import type { RentalTripLinkCreatedBy, RentalTripLinkStatus, TripBookingLinkSource } from '@prisma/client';

export type RentalTripLinkResolutionSource =
  | 'OVERLAY_ACTIVE'
  | 'OVERLAY_UNLINKED'
  | 'LEGACY_FALLBACK'
  | 'NONE';

export type EffectiveRentalTripLink = {
  source: RentalTripLinkResolutionSource;
  organizationId: string;
  tripId: string;
  bookingId: string | null;
  customerId: string | null;
  linkSource: TripBookingLinkSource | null;
  isUnlinked: boolean;
  prefersExplicit: boolean;
};

export type EstablishRentalTripLinkInput = {
  organizationId: string;
  tripId: string;
  status: Extract<RentalTripLinkStatus, 'ACTIVE' | 'UNLINKED'>;
  bookingId?: string | null;
  customerId?: string | null;
  linkSource?: TripBookingLinkSource | null;
  correctionReason?: string | null;
  legacyFingerprint?: string | null;
  createdBy?: RentalTripLinkCreatedBy;
  createdByUserId?: string | null;
  correlationId?: string | null;
};

export type BackfillDryRunIssueCode =
  | 'MISSING_BOOKING'
  | 'BOOKING_ORG_MISMATCH'
  | 'BOOKING_VEHICLE_MISMATCH'
  | 'TRIP_ORG_MISMATCH'
  | 'LEGACY_NULL_ASSIGNMENT'
  | 'DUPLICATE_CURRENT_OVERLAY'
  | 'OVERLAY_NEWER_THAN_LEGACY'
  | 'OVERLAY_AUTHORIZED_UNLINK';

export type BackfillDryRunProposedStatus = 'ACTIVE' | 'UNLINKED' | 'SKIP';

export type BackfillDryRunRow = {
  organizationId: string;
  tripId: string;
  legacyFingerprint: string | null;
  proposedStatus: BackfillDryRunProposedStatus;
  proposedBookingId: string | null;
  proposedCustomerId: string | null;
  proposedLinkSource: TripBookingLinkSource | null;
  issues: BackfillDryRunIssueCode[];
};

export type BackfillDryRunReport = {
  scannedTrips: number;
  proposedActive: number;
  proposedUnlinked: number;
  proposedSkip: number;
  issueCounts: Partial<Record<BackfillDryRunIssueCode, number>>;
  rows: BackfillDryRunRow[];
};
