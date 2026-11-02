#!/usr/bin/env npx ts-node
/**
 * DS4 Layer-2 P3C — offline physics diagnostics sidecar (research only).
 *
 * Reads pinned P2 CSV artifacts (read-only). Writes p3c_* sidecar files only.
 */
import { execFileSync } from 'child_process';
import { mkdirSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import {
  DS4_LAYER2_P2_PINNED_11_FILE_CHECKSUMS_SHA256_V1,
  DS4_LAYER2_P2_PINNED_11_MANIFEST_CHECKSUM_SHA256_V1,
  DS4_LAYER2_P2_PINNED_11_ORGANIZATION_ID_V1,
  DS4_LAYER2_P2_PINNED_11_EVALUATION_CODE_SHA_V1,
} from '../../src/modules/vehicle-intelligence/driving-intelligence/ds4-assessment/research/ds4-layer2-p2-pinned-11.attestation.v1';
import { loadDs4Layer2P2PinnedInputsFromDirV1 } from '../../src/modules/vehicle-intelligence/driving-intelligence/ds4-assessment/research/ds4-layer2-p3c-p2-input.v1';
import {
  buildDs4Layer2P3cPhysicsDiagnosticsV1,
  buildDs4Layer2P3cSidecarArtifactsV1,
} from '../../src/modules/vehicle-intelligence/driving-intelligence/ds4-assessment/research/ds4-layer2-p3c-physics-diagnostics.v1';
import {
  createReferenceResolverFromFixtureV1,
  loadDs4Layer2P3cMotionPhysicsReferenceFixtureV1,
} from '../../src/modules/vehicle-intelligence/driving-intelligence/ds4-assessment/research/ds4-layer2-p3c-reference-fixture.v1';

function parseArg(name: string): string | undefined {
  const eq = process.argv.find((a) => a.startsWith(`${name}=`));
  if (eq) return eq.split('=').slice(1).join('=').trim();
  const idx = process.argv.indexOf(name);
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
}

function resolveEvaluationCodeSha(cwd: string): string {
  return execFileSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8' }).trim();
}

async function main(): Promise<void> {
  const cwd = resolve(__dirname, '../..');
  const defaultP2 = join(
    cwd,
    'src/modules/vehicle-intelligence/driving-intelligence/ds4-assessment/research/fixtures/ds4-layer2-p2-pinned-11',
  );
  const defaultRef = join(
    cwd,
    'src/modules/vehicle-intelligence/driving-intelligence/ds4-assessment/research/fixtures/ds4-layer2-p3c-motion-physics-reference-snapshot.v1.json',
  );

  const p2Dir = resolve(parseArg('--p2-dir') ?? defaultP2);
  const refFixturePath = resolve(parseArg('--reference-fixture') ?? defaultRef);
  const outDir = resolve(parseArg('--out-dir') ?? join('/tmp', 'ds4-p3c-sidecar-out'));

  const { admissibleEvents, assessmentTrips } = loadDs4Layer2P2PinnedInputsFromDirV1(p2Dir);
  const fixture = loadDs4Layer2P3cMotionPhysicsReferenceFixtureV1(refFixturePath);
  const resolveVehicleReference = createReferenceResolverFromFixtureV1(fixture);

  const built = await buildDs4Layer2P3cPhysicsDiagnosticsV1({
    organizationId: DS4_LAYER2_P2_PINNED_11_ORGANIZATION_ID_V1,
    admissibleEvents,
    assessmentTrips,
    resolveVehicleReference,
  });

  const p3cEvaluationCodeSha = resolveEvaluationCodeSha(cwd);
  const artifacts = buildDs4Layer2P3cSidecarArtifactsV1({
    p3cEvaluationCodeSha,
    p2EvaluationCodeSha: DS4_LAYER2_P2_PINNED_11_EVALUATION_CODE_SHA_V1,
    p2InputChecksumsSha256: { ...DS4_LAYER2_P2_PINNED_11_FILE_CHECKSUMS_SHA256_V1 },
    p2ManifestChecksumSha256: DS4_LAYER2_P2_PINNED_11_MANIFEST_CHECKSUM_SHA256_V1,
    organizationId: DS4_LAYER2_P2_PINNED_11_ORGANIZATION_ID_V1,
    builtAtUtc: new Date('2026-10-31T00:00:00.000Z'),
    physicsContextRows: built.physicsContextRows,
    eventDiagnosticRows: built.eventDiagnosticRows,
    limitationRows: built.limitationRows,
    summary: built.summary,
  });

  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'p3c_manifest.json'), `${JSON.stringify(artifacts.manifest, null, 2)}\n`, 'utf8');
  writeFileSync(join(outDir, 'p3c_physics_context.csv'), artifacts.physicsContextCsv, 'utf8');
  writeFileSync(join(outDir, 'p3c_event_diagnostics.csv'), artifacts.eventDiagnosticsCsv, 'utf8');
  writeFileSync(join(outDir, 'p3c_limitations.csv'), artifacts.limitationsCsv, 'utf8');

  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ outDir, summary: built.summary, manifestChecksum: artifacts.manifest.manifestChecksumSha256 }, null, 2));
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
