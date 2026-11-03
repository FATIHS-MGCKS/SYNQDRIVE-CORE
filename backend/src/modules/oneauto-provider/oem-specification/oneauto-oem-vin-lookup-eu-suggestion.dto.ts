import type {
  OneAutoOemFieldComparisonResult,
  OneAutoVinLookupEuSuggestionTimestamps,
} from './oneauto-vin-lookup-oem-suggestion.types';

export type OneAutoOemVinLookupEuSuggestionListItemDto = {
  snapshotId: string;
  providerJobId: string;
  serviceSku: 'OE_VIN_LOOKUP_EU';
  vinSha256Prefix: string;
  timestamps: OneAutoVinLookupEuSuggestionTimestamps;
  comparison: OneAutoOemFieldComparisonResult;
};

export type OneAutoOemVinLookupEuSuggestionListDto = {
  organizationId: string;
  vehicleId: string;
  featureEnabled: boolean;
  suggestions: OneAutoOemVinLookupEuSuggestionListItemDto[];
};

export function assertSafeOemSuggestionListDto(dto: OneAutoOemVinLookupEuSuggestionListDto): void {
  const serialized = JSON.stringify(dto);
  if (/vin_snapshot|responseBodyJson|vehicle_identification_number/i.test(serialized)) {
    throw new Error('OEM suggestion DTO leaked sensitive provider payload keys');
  }
  if (/\b[A-HJ-NPR-Z0-9]{17}\b/i.test(serialized)) {
    throw new Error('OEM suggestion DTO must not contain raw VIN values');
  }
}
