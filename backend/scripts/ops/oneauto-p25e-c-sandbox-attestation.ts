#!/usr/bin/env npx ts-node
/**
 * Isolated One Auto attestation CLI (P2.5E-C / C3).
 * Default: offline mocked fixtures — no network, no API key.
 * Production one-shot: requires --live-production plus explicit env authorizations.
 */
import {
  formatAttestationEvidenceMarkdown,
  runAllOfflineSandboxAttestationFixtures,
  runLiveProductionAttestation,
  runOfflineSandboxAttestationFixture,
  resolveProductionAttestationAuthorization,
} from '../../src/modules/oneauto-provider/attestation/oneauto-sandbox-attestation.runner';
import type { OneAutoSandboxAttestationEvidence } from '../../src/modules/oneauto-provider/attestation/oneauto-sandbox-attestation.types';

function parseArgs(argv: string[]): {
  liveProduction: boolean;
  fixtureId: string | null;
  allFixtures: boolean;
  json: boolean;
} {
  let liveProduction = false;
  let fixtureId: string | null = null;
  let allFixtures = false;
  let json = false;
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--fixture' && argv[i + 1]) {
      fixtureId = argv[++i];
    } else if (arg === '--all-fixtures') {
      allFixtures = true;
    } else if (arg === '--json') {
      json = true;
    } else if (arg === '--live-production') {
      liveProduction = true;
    }
  }
  return { liveProduction, fixtureId, allFixtures, json };
}

function emit(evidence: OneAutoSandboxAttestationEvidence | OneAutoSandboxAttestationEvidence[], json: boolean): void {
  if (json) {
    console.log(JSON.stringify(evidence, null, 2));
    return;
  }
  const list = Array.isArray(evidence) ? evidence : [evidence];
  for (const e of list) {
    console.log(formatAttestationEvidenceMarkdown(e));
    console.log('\n---\n');
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv);
  if (args.liveProduction) {
    const authorization = resolveProductionAttestationAuthorization(true);
    const evidence = await runLiveProductionAttestation({ authorization });
    emit(evidence, args.json);
    process.exit(evidence.attestationQualified ? 0 : 2);
  }

  if (args.allFixtures) {
    emit(await runAllOfflineSandboxAttestationFixtures(), args.json);
    process.exit(0);
  }

  const id = args.fixtureId ?? 'http-200-success-true';
  const evidence = await runOfflineSandboxAttestationFixture(id);
  emit(evidence, args.json);
  process.exit(evidence.attestationQualified ? 0 : 2);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
