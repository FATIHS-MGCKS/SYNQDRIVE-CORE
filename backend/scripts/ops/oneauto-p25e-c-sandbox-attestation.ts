#!/usr/bin/env npx ts-node
/**
 * Isolated One Auto sandbox attestation CLI (P2.5E-C).
 * Default: offline mocked fixtures — no network, no API key.
 */
import {
  formatAttestationEvidenceMarkdown,
  runAllOfflineSandboxAttestationFixtures,
  runLiveSandboxAttestation,
  runOfflineSandboxAttestationFixture,
  resolveLiveAttestationEnv,
} from '../../src/modules/oneauto-provider/attestation/oneauto-sandbox-attestation.runner';
import type { OneAutoSandboxAttestationEvidence } from '../../src/modules/oneauto-provider/attestation/oneauto-sandbox-attestation.types';

function parseArgs(argv: string[]): {
  mode: 'offline' | 'live-sandbox';
  fixtureId: string | null;
  allFixtures: boolean;
  json: boolean;
} {
  let mode: 'offline' | 'live-sandbox' = 'offline';
  let fixtureId: string | null = null;
  let allFixtures = false;
  let json = false;
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--mode' && argv[i + 1]) {
      mode = argv[++i] as 'offline' | 'live-sandbox';
    } else if (arg === '--fixture' && argv[i + 1]) {
      fixtureId = argv[++i];
    } else if (arg === '--all-fixtures') {
      allFixtures = true;
    } else if (arg === '--json') {
      json = true;
    } else if (arg === '--live-sandbox') {
      mode = 'live-sandbox';
    }
  }
  return { mode, fixtureId, allFixtures, json };
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
  if (args.mode === 'live-sandbox') {
    const env = resolveLiveAttestationEnv();
    const evidence = await runLiveSandboxAttestation({
      vin: process.env.ONEAUTO_SANDBOX_ATTESTATION_VIN?.trim() ?? '',
      apiKey: env.apiKey ?? '',
      ownerAuthorizedEnv: env.ownerAuthorizedEnv,
    });
    emit(evidence, args.json);
    process.exit(evidence.attestationQualified ? 0 : 2);
  }

  if (args.allFixtures) {
    const all = await runAllOfflineSandboxAttestationFixtures();
    emit(all, args.json);
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
