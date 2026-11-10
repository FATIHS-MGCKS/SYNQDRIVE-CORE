import { aggregateLedgersFromStages, mapLedgerAttemptLifecycle } from './vsi-master-fsd-read.ledger';

describe('vsi-master-fsd-read ledger semantics', () => {
  it('labels RESERVED without dispatch as RESERVED_UNDISPATCHED', () => {
    const lifecycle = mapLedgerAttemptLifecycle({
      attemptKey: 'k',
      queryFingerprint: 'q',
      outcome: 'RESERVED',
      reservedAt: '2026-11-10T00:00:00.000Z',
    });
    expect(lifecycle).toBe('RESERVED_UNDISPATCHED');
  });

  it('flags malformed checkpoint stages instead of iterating invalid attempts', () => {
    const agg = aggregateLedgersFromStages([
      {
        stageType: 'CATALOG',
        checkpointJson: { requestLedger: { budgetTotal: 'bad', attempts: [] } },
      },
    ]);
    expect(agg?.malformedCheckpointStages).toContain('CATALOG');
    expect(agg?.safeAttempts.length ?? 0).toBe(0);
  });

  it('exposes per-stage budget without merging stage semantics', () => {
    const agg = aggregateLedgersFromStages([
      {
        stageType: 'CATALOG',
        checkpointJson: {
          requestLedger: {
            budgetTotal: 2,
            attempts: [
              {
                attemptKey: 'catalog',
                queryFingerprint: 'fp',
                outcome: 'SUCCEEDED',
                reservedAt: '2026-11-10T00:00:00.000Z',
                finishedAt: '2026-11-10T00:00:01.000Z',
              },
            ],
          },
        },
      },
      {
        stageType: 'SNAPSHOT',
        checkpointJson: {
          requestLedger: {
            budgetTotal: 50,
            attempts: [],
          },
        },
      },
    ]);
    expect(agg?.budgetByStage.CATALOG).toBe(2);
    expect(agg?.budgetByStage.SNAPSHOT).toBe(50);
  });
});
