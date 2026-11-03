import { describe, expect, it } from 'vitest';
import {
  canApplyOemSuggestion,
  classifyOemSuggestionsLoadError,
  isOemSaveConflictError,
  mapOemSuggestionListDto,
  requiresUserConfirmedReplaceWarning,
} from './connected-vehicle-oem-suggestions.util';
import type { OneAutoOemSuggestionListDtoWire } from './connected-vehicle-oem-suggestions.types';

describe('connected-vehicle-oem-suggestions.util', () => {
  it('maps disabled feature flag', () => {
    const dto: OneAutoOemSuggestionListDtoWire = {
      organizationId: 'org',
      vehicleId: 'veh',
      featureEnabled: false,
      suggestions: [],
    };
    expect(mapOemSuggestionListDto(dto)).toEqual({
      featureEnabled: false,
      primary: null,
      loadError: null,
    });
  });

  it('maps primary snapshot from first suggestion', () => {
    const dto: OneAutoOemSuggestionListDtoWire = {
      organizationId: 'org',
      vehicleId: 'veh',
      featureEnabled: true,
      suggestions: [
        {
          snapshotId: 'snap-1',
          providerJobId: 'job-1',
          serviceSku: 'OE_VIN_LOOKUP_EU',
          vinSha256Prefix: 'abc123',
          timestamps: {
            providerDataUpdatedAt: '2026-01-02',
            fetchedAt: '2026-01-03T10:00:00.000Z',
            snapshotCreatedAt: '2026-01-03T10:00:00.000Z',
          },
          comparison: {
            serviceSku: 'OE_VIN_LOOKUP_EU',
            timestamps: {
              providerDataUpdatedAt: '2026-01-02',
              fetchedAt: '2026-01-03T10:00:00.000Z',
              snapshotCreatedAt: '2026-01-03T10:00:00.000Z',
            },
            fields: [
              {
                canonicalFieldKey: 'oemEngineDesc',
                comparisonState: 'MISSING',
                canonicalValue: null,
                suggestedValue: '2.0 TDI',
                providerFieldPath: 'oem_engine_desc',
                confirmationStatus: null,
                implicitConfirmationAllowed: false,
              },
              {
                canonicalFieldKey: 'oemEngineCode',
                comparisonState: 'NOT_COMPARABLE',
                canonicalValue: null,
                suggestedValue: null,
                providerFieldPath: null,
                confirmationStatus: null,
                implicitConfirmationAllowed: false,
              },
            ],
          },
        },
      ],
    };
    const mapped = mapOemSuggestionListDto(dto);
    expect(mapped.primary?.rows).toHaveLength(2);
    expect(canApplyOemSuggestion(mapped.primary!.rows[0]!)).toBe(true);
    expect(canApplyOemSuggestion(mapped.primary!.rows[1]!)).toBe(false);
  });

  it('classifies MFA and conflict errors', () => {
    expect(classifyOemSuggestionsLoadError(new Error('[STEP_UP_REQUIRED] MFA'))).toBe('MFA_REQUIRED');
    expect(isOemSaveConflictError(new Error('[VEHICLE_OEM_SPEC_SAVE_CONFLICT] stale'))).toBe(true);
    expect(
      requiresUserConfirmedReplaceWarning('USER_CONFIRMED', 'CONFLICT'),
    ).toBe(true);
  });
});
