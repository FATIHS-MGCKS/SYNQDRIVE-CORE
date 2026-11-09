import { classifyFsdP6dFleetDiscoveryOutcomeV1 } from '../fsd-p6d-discovery-outcome.v1';

describe('FsdP6d discovery outcome', () => {
  it('downgrades FULL terminal statuses when plan was budget-truncated', () => {
    expect(
      classifyFsdP6dFleetDiscoveryOutcomeV1({
        fsd3TerminalStatus: 'COMPLETED',
        fsd4TerminalStatus: 'COMPLETED',
        planCompleteness: 'BUDGET_TRUNCATED',
        allExecutable: false,
      }),
    ).toBe('PARTIAL_DISCOVERY');
  });

  it('marks FAILED when either stream failed', () => {
    expect(
      classifyFsdP6dFleetDiscoveryOutcomeV1({
        fsd3TerminalStatus: 'COMPLETED',
        fsd4TerminalStatus: 'FAILED',
        planCompleteness: 'FULL',
        allExecutable: true,
      }),
    ).toBe('FAILED_DISCOVERY');
  });
});
