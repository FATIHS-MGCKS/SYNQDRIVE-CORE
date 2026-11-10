import {
  classifyOpportunityJointWouldSkipSuccess,
  type SavingsEvidenceRow,
} from './apds-scientific-savings-core';
import {
  P25_APD_B2_V1,
  P25_APD_B4_V1,
} from '../../src/workers/schedulers/snapshot-polling/adaptive-polling-policy/p25-apd-policy-versions';

const EPOCH = 'epoch-1';
const ORG = 'org-1';
const VEH = 'veh-1';
const OPP = 'opp-1';
const POLL = 'poll-1';

function row(
  partial: Partial<SavingsEvidenceRow> & Pick<SavingsEvidenceRow, 'policyVersion'>,
): SavingsEvidenceRow {
  return {
    organizationId: ORG,
    vehicleId: VEH,
    opportunityId: OPP,
    activationEpochId: EPOCH,
    decision: 'WOULD_SKIP',
    realPollStatus: 'SUCCESS',
    realPollId: POLL,
    ...partial,
  };
}

describe('apds-scientific-savings-core (H2)', () => {
  it('B2 SKIP, B4 SKIP, same successful poll: JOINT_SKIP', () => {
    expect(
      classifyOpportunityJointWouldSkipSuccess(
        [row({ policyVersion: P25_APD_B2_V1 }), row({ policyVersion: P25_APD_B4_V1 })],
        EPOCH,
      ),
    ).toBe('JOINT_SKIP');
  });

  it('B2 SKIP only: NOT_ASSESSABLE', () => {
    expect(
      classifyOpportunityJointWouldSkipSuccess(
        [row({ policyVersion: P25_APD_B2_V1 })],
        EPOCH,
      ),
    ).toBe('NOT_ASSESSABLE');
  });

  it('B2 SKIP, B4 WOULD_POLL: NOT_ASSESSABLE', () => {
    expect(
      classifyOpportunityJointWouldSkipSuccess(
        [
          row({ policyVersion: P25_APD_B2_V1 }),
          row({ policyVersion: P25_APD_B4_V1, decision: 'WOULD_POLL' }),
        ],
        EPOCH,
      ),
    ).toBe('NOT_ASSESSABLE');
  });

  it('B2 SUCCESS skip row but B4 missing SUCCESS poll: NOT_ASSESSABLE', () => {
    expect(
      classifyOpportunityJointWouldSkipSuccess(
        [
          row({ policyVersion: P25_APD_B2_V1 }),
          row({
            policyVersion: P25_APD_B4_V1,
            realPollStatus: 'FAILURE',
            realPollId: null,
          }),
        ],
        EPOCH,
      ),
    ).toBe('NOT_ASSESSABLE');
  });

  it('different physical poll IDs: NOT_ASSESSABLE', () => {
    expect(
      classifyOpportunityJointWouldSkipSuccess(
        [
          row({ policyVersion: P25_APD_B2_V1, realPollId: 'p1' }),
          row({ policyVersion: P25_APD_B4_V1, realPollId: 'p2' }),
        ],
        EPOCH,
      ),
    ).toBe('NOT_ASSESSABLE');
  });

  it('other policy version present: NOT_ASSESSABLE', () => {
    expect(
      classifyOpportunityJointWouldSkipSuccess(
        [
          row({ policyVersion: P25_APD_B2_V1 }),
          row({ policyVersion: P25_APD_B4_V1 }),
          row({ policyVersion: 'OTHER_POLICY' }),
        ],
        EPOCH,
      ),
    ).toBe('NOT_ASSESSABLE');
  });

  it('mismatched tenant or epoch: NOT_ASSESSABLE', () => {
    expect(
      classifyOpportunityJointWouldSkipSuccess(
        [
          row({ policyVersion: P25_APD_B2_V1, organizationId: 'org-a' }),
          row({ policyVersion: P25_APD_B4_V1, organizationId: 'org-b' }),
        ],
        EPOCH,
      ),
    ).toBe('NOT_ASSESSABLE');
    expect(
      classifyOpportunityJointWouldSkipSuccess(
        [
          row({ policyVersion: P25_APD_B2_V1, activationEpochId: 'wrong' }),
          row({ policyVersion: P25_APD_B4_V1, activationEpochId: 'wrong' }),
        ],
        EPOCH,
      ),
    ).toBe('NOT_ASSESSABLE');
  });
});
