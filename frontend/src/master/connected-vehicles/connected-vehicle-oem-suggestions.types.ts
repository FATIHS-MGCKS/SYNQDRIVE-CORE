import type { OemSpecificationFieldKey } from './connected-vehicle-oem-specifications.util';

export type OemSuggestionComparisonState = 'MATCH' | 'MISSING' | 'CONFLICT' | 'NOT_COMPARABLE';

export type OemSuggestionConfirmationStatus =
  | 'USER_CONFIRMED'
  | 'SUGGESTED'
  | 'UNCONFIRMED'
  | 'PROTECTED'
  | null;

export type OemSuggestionComparisonRowUi = {
  fieldKey: OemSpecificationFieldKey;
  comparisonState: OemSuggestionComparisonState;
  canonicalValue: string | null;
  suggestedValue: string | null;
  providerFieldPath: string | null;
  confirmationStatus: OemSuggestionConfirmationStatus;
};

export type OemSuggestionSnapshotTimestampsUi = {
  providerDataUpdatedAt: string | null;
  fetchedAt: string;
  snapshotCreatedAt: string;
};

export type OemSuggestionSnapshotUi = {
  snapshotId: string;
  providerJobId: string;
  serviceSku: 'OE_VIN_LOOKUP_EU';
  vinSha256Prefix: string;
  timestamps: OemSuggestionSnapshotTimestampsUi;
  rows: OemSuggestionComparisonRowUi[];
};

export type OemSuggestionsLoadError = 'LOAD_FAILED' | 'MFA_REQUIRED' | 'ACCESS_DENIED' | null;

export type OemSuggestionsViewState = {
  featureEnabled: boolean;
  primary: OemSuggestionSnapshotUi | null;
  loadError: OemSuggestionsLoadError;
};

export type OneAutoOemSuggestionListDtoWire = {
  organizationId: string;
  vehicleId: string;
  featureEnabled: boolean;
  suggestions: Array<{
    snapshotId: string;
    providerJobId: string;
    serviceSku: 'OE_VIN_LOOKUP_EU';
    vinSha256Prefix: string;
    timestamps: OemSuggestionSnapshotTimestampsUi;
    comparison: {
      serviceSku: 'OE_VIN_LOOKUP_EU';
      timestamps: OemSuggestionSnapshotTimestampsUi;
      fields: Array<{
        canonicalFieldKey: OemSpecificationFieldKey;
        comparisonState: OemSuggestionComparisonState;
        canonicalValue: string | null;
        suggestedValue: string | null;
        providerFieldPath: string | null;
        confirmationStatus: OemSuggestionConfirmationStatus;
        implicitConfirmationAllowed: false;
      }>;
    };
  }>;
};
