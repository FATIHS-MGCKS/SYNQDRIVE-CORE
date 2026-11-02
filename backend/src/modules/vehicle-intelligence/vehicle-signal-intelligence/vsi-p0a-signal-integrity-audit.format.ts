import type { VsiP0aSignalIntegrityMatrixDocument, VsiP0aSignalIntegrityMatrixRow } from './vsi-p0a-signal-integrity-audit.types';

function mdEscape(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function rowToMd(row: VsiP0aSignalIntegrityMatrixRow): string {
  return [
    row.vehicleLabel,
    row.canonicalSignal,
    row.applicability,
    row.snapshotObservation ?? 'null',
    row.hfAvailability,
    row.hfSampleCount ?? 'null',
    row.activeCadenceProfile ?? 'null',
    row.findingClass,
    row.severity,
    row.evidenceReference,
  ]
    .map((c) => mdEscape(String(c)))
    .join('|');
}

export function formatVsiP0aMatrixMarkdown(doc: VsiP0aSignalIntegrityMatrixDocument): string {
  const pv = doc.productionVerification;
  const lines: string[] = [
    '# VSI Signal Integrity Matrix (P0-a)',
    '',
    `Schema: \`${doc.schema}\``,
    `Audit executed: ${doc.auditExecutedAt} (${doc.auditTimezone})`,
    '',
    '## Production verification (read-only)',
    '',
    '| Check | Result |',
    '|---|---|',
    `| origin/main SHA | \`${pv.originMainSha}\` |`,
    `| Production current SHA | \`${pv.productionCurrentSha}\` |`,
    `| Release | \`${pv.productionRelease ?? 'null'}\` |`,
    `| Replica 3001 SHA | \`${pv.replica3001Sha ?? 'NOT_VERIFIED'}\` |`,
    `| Replica 3002 SHA | \`${pv.replica3002Sha ?? 'NOT_VERIFIED'}\` |`,
    `| Public health | ${pv.publicHealthOk ? 'ok' : 'fail'} |`,
    `| PR #2255 | ${pv.pr2255} |`,
    `| PR #2256 | ${pv.pr2256} |`,
    `| PR #2257 | ${pv.pr2257} |`,
    `| Frontend rpmDual | ${pv.frontendArtifact.rpmDualPresent} |`,
    `| Frontend dual provenance test id | ${pv.frontendArtifact.dualProvenanceTestIdPresent} |`,
    `| Runtime dual provenance UI | ${pv.runtimeDualProvenanceUi} |`,
    '',
    '## Query window',
    '',
    `- HF history days: ${doc.queryWindow.hfHistoryDays}`,
    `- Max finalized trips: ${doc.queryWindow.maxFinalizedTrips}`,
    `- Max RPM HF points: ${doc.queryWindow.maxRpmPoints}`,
    '',
    '## Summary',
    '',
    `- Canonical signals: ${doc.summary.canonicalSignalCount}`,
    `- Vehicles: ${doc.summary.vehicleCount}`,
    `- Matrix rows: ${doc.summary.matrixRows}`,
    `- Verified rows: ${doc.summary.verifiedRows}`,
    `- Not verified rows: ${doc.summary.notVerifiedRows}`,
    `- CONFIRMED_BUG: ${doc.summary.confirmedBugs}`,
    `- MISLEADING_PRESENTATION: ${doc.summary.misleadingPresentations}`,
    `- SEMANTIC_AMBIGUITY: ${doc.summary.semanticAmbiguities}`,
    `- INSUFFICIENT_EVIDENCE / hypotheses: ${doc.summary.openHypotheses}`,
    `- P0 findings: ${doc.summary.p0Findings}`,
    `- P1 findings: ${doc.summary.p1Findings}`,
    '',
    '## Matrix (compact)',
    '',
    '| Vehicle | Signal | Applicability | Snapshot | HF | HF samples | Cadence profile | Class | P | Evidence |',
    '|---|---|---|---|---|---|---|---|---|---|',
  ];

  for (const row of doc.rows) {
    lines.push(rowToMd(row));
  }

  if (pv.notes.length > 0) {
    lines.push('', '## Notes', '');
    for (const n of pv.notes) lines.push(`- ${n}`);
  }

  return `${lines.join('\n')}\n`;
}

export function formatVsiP0aMatrixJson(doc: VsiP0aSignalIntegrityMatrixDocument): string {
  return `${JSON.stringify(doc, null, 2)}\n`;
}
