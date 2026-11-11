import { classifyV3ReplayPhysicalAccounting } from './apds-v3-replay-accounting.v1';
import type { ApdsV3OfflinePolicyDecision } from './apds-v3-offline.types';
import type { P25ApdShadowDecision } from '../p25-apd-shadow-decision.types';

const skipBoth = (v3: ApdsV3OfflinePolicyDecision, over: { exclude?: boolean } = {}) =>
  classifyV3ReplayPhysicalAccounting({
    baselineDue: true,
    baselineAssessable: true,
    excludeFromOptimizationCalibration: over.exclude,
    v3,
    b2: {
      policyVersion: 'P25_APD_B2_V1',
      decision: 'WOULD_SKIP',
      reason: 'PHASE_WINDOW_INSIDE_MIN_INTERVAL',
      expectedWindowStartMs: null,
      expectedWindowEndMs: null,
    },
    b4: {
      policyVersion: 'P25_APD_B4_V1',
      decision: 'WOULD_SKIP',
      reason: 'STABLE_PHASE_OUTSIDE_5M',
      expectedWindowStartMs: null,
      expectedWindowEndMs: null,
    },
  });

const dec = (
  decision: ApdsV3OfflinePolicyDecision['decision'],
  reason: string,
): ApdsV3OfflinePolicyDecision => ({
  policyVersion: 'APDS_V3_OFFLINE_P1B0',
  decision,
  reason,
  expectedInformationGain: 0.2,
  heuristic: true,
  hardSafetyTriggered: false,
});

const b2 = (d: P25ApdShadowDecision['decision']): P25ApdShadowDecision => ({
  policyVersion: 'P25_APD_B2_V1',
  decision: d,
  reason: 'PHASE_WINDOW_INSIDE_MIN_INTERVAL',
  expectedWindowStartMs: null,
  expectedWindowEndMs: null,
});

const b4 = (d: P25ApdShadowDecision['decision']): P25ApdShadowDecision => ({
  policyVersion: 'P25_APD_B4_V1',
  decision: d,
  reason: 'STABLE_PHASE_OUTSIDE_5M',
  expectedWindowStartMs: null,
  expectedWindowEndMs: null,
});

describe('apds-v3-replay-accounting.v1', () => {
  it('NOT_ASSESSABLE preserves baseline poll projection without savings', () => {
    const a = skipBoth(dec('NOT_ASSESSABLE', 'KS_MX'));
    expect(a.v3ProjectsPhysicalPoll).toBe(true);
    expect(a.countsTowardHypotheticalSkipSavings).toBe(false);
  });

  it('INSUFFICIENT_EVIDENCE preserves baseline poll', () => {
    const a = skipBoth(dec('INSUFFICIENT_EVIDENCE', 'CONSUMER_FAIL_CLOSED'));
    expect(a.v3ProjectsPhysicalPoll).toBe(true);
    expect(a.countsTowardHypotheticalSkipSavings).toBe(false);
  });

  it('baseline-not-due separates hypothetical V3 poll', () => {
    const a = classifyV3ReplayPhysicalAccounting({
      baselineDue: false,
      baselineAssessable: true,
      v3: dec('WOULD_POLL', 'B2B4_REFERENCE_POLL'),
      b2: b2('WOULD_POLL'),
      b4: b4('WOULD_POLL'),
    });
    expect(a.outcomeClass).toBe('V3_HYPOTHETICAL_POLL_BASELINE_NOT_DUE');
    expect(a.countsAsV3PollWhenBaselineNotDue).toBe(true);
  });

  it('forced poll when baseline due is projected poll not extra class', () => {
    const a = skipBoth(dec('FORCED_SAFETY_POLL', 'WAKE'));
    expect(a.v3ProjectsPhysicalPoll).toBe(true);
    expect(a.countsAsV3PollWhenBaselineNotDue).toBe(false);
  });

  it('excluded calibration vehicle receives no hypothetical savings credit', () => {
    const a = skipBoth(dec('WOULD_SKIP', 'LOW_HEURISTIC_INFORMATION_GAIN'), {
      exclude: true,
    });
    expect(a.countsTowardHypotheticalSkipSavings).toBe(false);
    expect(a.countsAsHypotheticalResearchCandidate).toBe(false);
  });
});
