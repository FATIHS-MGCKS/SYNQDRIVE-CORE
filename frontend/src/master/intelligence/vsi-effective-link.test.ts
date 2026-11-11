import { describe, expect, it } from 'vitest';
import { resolveEffectiveProviderSourceLink } from './vsi-effective-link.util';

describe('resolveEffectiveProviderSourceLink', () => {
  it('persists first overview link when URL link is null', () => {
    const r = resolveEffectiveProviderSourceLink({
      urlLinkId: null,
      overview: {
        organizationId: 'o',
        vehicleId: 'v',
        profiles: [
          {
            providerSourceLinkId: 'link-1',
            providerIdentity: 'dimo',
            provider: 'DIMO',
            profileRevision: 1,
            profileContractVersion: 'v2',
            evaluatedAt: '2026-01-01T00:00:00.000Z',
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
          },
        ],
      },
    });
    expect(r.effectiveLinkId).toBe('link-1');
    expect(r.shouldPersistInUrl).toBe(true);
  });

  it('keeps explicit URL link when overview has no profiles', () => {
    const r = resolveEffectiveProviderSourceLink({
      urlLinkId: 'link-url',
      overview: { organizationId: 'o', vehicleId: 'v', profiles: [] },
    });
    expect(r.effectiveLinkId).toBe('link-url');
    expect(r.shouldPersistInUrl).toBe(false);
  });
});
