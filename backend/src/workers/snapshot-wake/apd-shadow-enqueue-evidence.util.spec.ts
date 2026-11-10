import {
  buildApdShadowEnqueueEvidence,
  stableEnqueueOutcomeToCanonical,
} from './apd-shadow-enqueue-evidence.util';

describe('apd-shadow-enqueue-evidence.util', () => {
  it('maps stable coalesce variants to canonical COALESCED', () => {
    expect(stableEnqueueOutcomeToCanonical('COALESCED_QUEUED')).toBe('COALESCED');
    expect(stableEnqueueOutcomeToCanonical('COALESCED_ACTIVE')).toBe('COALESCED');
    expect(stableEnqueueOutcomeToCanonical('ENQUEUED')).toBe('ENQUEUED');
    expect(stableEnqueueOutcomeToCanonical('RECOVERED_TERMINAL')).toBe('RECOVERED_TERMINAL');
  });

  it('builds frozen enqueue evidence payload', () => {
    expect(buildApdShadowEnqueueEvidence('ENQUEUED', 1_234)).toEqual({
      outcome: 'ENQUEUED',
      observedAtMs: 1_234,
    });
  });
});
