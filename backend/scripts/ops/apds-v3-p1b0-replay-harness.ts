#!/usr/bin/env npx ts-node
/**
 * Offline APDS V3 P1B0 replay — read JSONL epoch points from stdin or file path argv[2].
 * No database, no production I/O.
 */
import * as fs from 'node:fs';
import {
  aggregateApdsV3ReplayPoints,
  type ApdsV3ReplayEpochPoint,
} from '../../src/workers/schedulers/snapshot-polling/adaptive-polling-policy/apds-v3-offline/apds-v3-p1b0-replay-core';

function main(): void {
  const path = process.argv[2];
  const raw = path ? fs.readFileSync(path, 'utf8') : fs.readFileSync(0, 'utf8');
  const lines = raw.split('\n').filter((l) => l.trim().length > 0);
  const points: ApdsV3ReplayEpochPoint[] = lines.map((l) => JSON.parse(l) as ApdsV3ReplayEpochPoint);
  if (points.length === 0) {
    console.error('No replay points');
    process.exit(1);
  }
  const window = {
    startMs: Math.min(...points.map((p) => p.decisionAtMs)),
    endMs: Math.max(...points.map((p) => p.decisionAtMs)),
  };
  const report = aggregateApdsV3ReplayPoints(points, window);
  const payload = {
    ...report,
    disclaimer:
      'PROJECTED_REQUEST_COUNTS_NOT_REALIZED_SAVINGS_NO_COUNTERFACTUAL_DIMO_RESPONSE',
  };
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

main();
