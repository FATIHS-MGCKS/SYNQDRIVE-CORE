import { assessInactiveLinkReactivation } from './dimo-vehicle-data-source-link.reactivation.policy';

describe('assessInactiveLinkReactivation', () => {
  const inactiveLink = {
    deactivatedAt: new Date('2026-01-01'),
    metadata: {},
  };

  it('backfill provenance never reactivates', () => {
    expect(
      assessInactiveLinkReactivation(inactiveLink, 'backfill'),
    ).toEqual({
      eligible: false,
      reason: 'backfill_reconciliation_never_reactivates',
    });
  });

  it('reconciliation provenance never reactivates', () => {
    expect(
      assessInactiveLinkReactivation(inactiveLink, 'reconciliation'),
    ).toEqual({
      eligible: false,
      reason: 'backfill_reconciliation_never_reactivates',
    });
  });

  it('blocks intentional deactivation', () => {
    expect(
      assessInactiveLinkReactivation(
        { ...inactiveLink, metadata: { intentionalDeactivation: true } },
        'registration',
      ),
    ).toEqual({ eligible: false, reason: 'intentional_deactivation' });
  });

  it('blocks recorded deactivation reason', () => {
    expect(
      assessInactiveLinkReactivation(
        { ...inactiveLink, metadata: { deactivationReason: 'admin_unlink' } },
        'registration',
      ),
    ).toEqual({ eligible: false, reason: 'deactivation_reason_recorded' });
  });

  it('blocks column deactivationReason even when metadata still shows reactivationEligible', () => {
    expect(
      assessInactiveLinkReactivation(
        {
          ...inactiveLink,
          metadata: { reactivationEligible: true },
          deactivationReason: 'OPS_MANUAL_DEACTIVATE',
        },
        'manual',
      ),
    ).toEqual({ eligible: false, reason: 'deactivation_reason_recorded' });
  });

  it('allows explicit reactivationEligible flag on registration path', () => {
    expect(
      assessInactiveLinkReactivation(
        { ...inactiveLink, metadata: { reactivationEligible: true } },
        'registration',
      ),
    ).toEqual({ eligible: true, reason: 'explicit_reactivation_eligible' });
  });

  it('defaults to missing positive evidence', () => {
    expect(
      assessInactiveLinkReactivation(inactiveLink, 'registration'),
    ).toEqual({
      eligible: false,
      reason: 'missing_positive_reactivation_evidence',
    });
  });
});
