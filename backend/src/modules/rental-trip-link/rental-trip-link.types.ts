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

export type BackfillDryRunClassification =
  | 'SAFE_ACTIVE'
  | 'SKIP_NO_ASSIGNMENT'
  | 'SKIP_EXISTING_OVERLAY'
  | 'BLOCK_MISSING_BOOKING'
  | 'BLOCK_TENANT_MISMATCH'
  | 'BLOCK_VEHICLE_MISMATCH'
  | 'BLOCK_CUSTOMER_MISMATCH'
  | 'BLOCK_INCOMPLETE_OR_INVALID_LEGACY'
  | 'BLOCK_OTHER_CONFLICT';

export type BackfillDryRunIssueCode =
  | 'MISSING_BOOKING'
  | 'BOOKING_ORG_MISMATCH'
  | 'BOOKING_VEHICLE_MISMATCH'
  | 'BOOKING_CUSTOMER_MISMATCH'
  | 'TRIP_ORG_MISMATCH'
  | 'LEGACY_NULL_ASSIGNMENT'
  | 'DUPLICATE_CURRENT_OVERLAY'
  | 'OVERLAY_NEWER_THAN_LEGACY'
  | 'OVERLAY_AUTHORIZED_UNLINK'
  | 'OVERLAY_ACTIVE_PRESENT'
  | 'OVERLAY_EXPLICIT_LEGACY_TIME_WINDOW';

export type BackfillDryRunProposedStatus = 'ACTIVE' | 'UNLINKED' | 'SKIP';

export type BackfillDryRunCursor = {
  startTime: Date;
  id: string;
};

export type BackfillDryRunRow = {
  organizationId: string;
  tripId: string;
  legacyFingerprint: string | null;
  classification: BackfillDryRunClassification;
  /** Legacy summary field — SAFE_ACTIVE only. */
  proposedStatus: BackfillDryRunProposedStatus;
  proposedBookingId: string | null;
  proposedCustomerId: string | null;
  proposedLinkSource: TripBookingLinkSource | null;
  issues: BackfillDryRunIssueCode[];
  fingerprintConflict: boolean;
};

export type BackfillDryRunPageReport = {
  organizationId: string;
  pageSize: number;
  totalTripsInOrg: number;
  processedTripsThisPage: number;
  cursorUsed: BackfillDryRunCursor | null;
  nextCursor: BackfillDryRunCursor | null;
  hasNextPage: boolean;
  coverageCompleteThisScan: boolean;
  snapshotRequiredForGuaranteedCompleteness: boolean;
  completenessNote: string;
  classificationCounts: Record<BackfillDryRunClassification, number>;
  issueCounts: Partial<Record<BackfillDryRunIssueCode, number>>;
  rows: BackfillDryRunRow[];
};

export type BackfillDryRunReport = {
  scannedTrips: number;
  proposedActive: number;
  proposedUnlinked: number;
  proposedSkip: number;
  issueCounts: Partial<Record<BackfillDryRunIssueCode, number>>;
  rows: BackfillDryRunRow[];
  totalTripsInOrg: number;
  hasNextPage: boolean;
  nextCursor: BackfillDryRunCursor | null;
};
