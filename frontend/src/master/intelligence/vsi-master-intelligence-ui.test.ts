import { describe, expect, it } from 'vitest';
import {
  evidenceKindFromSummary,
  mapSummaryToLvBadge,
  mapSummaryToRpmBadge,
} from './vsi-master-intelligence-ui.utils';
import type { MasterVsiProfileSummaryDto } from './vsi-master-intelligence-api.types';

function baseSummary(overrides: Partial<MasterVsiProfileSummaryDto> = {}): MasterVsiProfileSummaryDto {
  return {
    providerSourceLinkId: 'link',
    providerIdentity: 'dimo:x',
    provider: 'DIMO',
    profileRevision: 1,
    profileContractVersion: 'v2',
    evaluatedAt: '2026-10-28T10:00:00.000Z',
    lastMaterializedSourceTimestamp: null,
    lastMaterializedProviderFetchAt: null,
    profileLimitations: [],
    lvStandbyProfile: 'LV_8H_OBSERVED',
    lvClassificationDecisionCode: null,
    lvEvidenceConfidence: null,
    rpmActiveProfile: 'RPM_1HZ',
    rpmApplicability: 'APPLICABLE',
    rpmClassificationDecisionCode: null,
    observedDensityLabel: null,
    evaluationBlocked: false,
    evaluationBlockedCodes: [],
    ...overrides,
  };
}

describe('vsi-master-intelligence-ui.utils', () => {
  it('maps OPEN_TRIP blocked summary to UNKNOWN LV with limitation', () => {
    const lv = mapSummaryToLvBadge(
      baseSummary({
        lvStandbyProfile: 'UNKNOWN',
        evaluationBlocked: true,
        evaluationBlockedCodes: ['OPEN_TRIP_BLOCKS_STANDBY_CLASSIFICATION'],
      }),
    );
    expect(lv.profile).toBe('UNKNOWN');
    expect(lv.limitationCode).toBe('OPEN_TRIP_BLOCKS_STANDBY_CLASSIFICATION');
  });

  it('maps BEV RPM NOT_APPLICABLE separately from UNKNOWN', () => {
    const rpm = mapSummaryToRpmBadge(
      baseSummary({
        rpmActiveProfile: 'UNKNOWN',
        rpmApplicability: 'NOT_APPLICABLE',
      }),
    );
    expect(rpm.applicability).toBe('NOT_APPLICABLE');
  });

  it('classifies evaluation_blocked evidence kind', () => {
    expect(
      evidenceKindFromSummary(
        baseSummary({ evaluationBlocked: true, evaluationBlockedCodes: ['OPEN_TRIP_BLOCKS_STANDBY_CLASSIFICATION'] }),
      ),
    ).toBe('evaluation_blocked');
  });
});
