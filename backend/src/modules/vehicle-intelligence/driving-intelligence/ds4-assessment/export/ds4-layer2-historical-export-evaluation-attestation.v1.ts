import { execFileSync } from 'child_process';
import * as path from 'path';

const SHA40 = /^[0-9a-f]{40}$/;

/** Paths whose tracked/untracked changes invalidate evaluation-code attestation. */
export const DS4_LAYER2_EXPORT_EVALUATION_ATTESTATION_PATHSPECS_V1 = [
  'backend/scripts/research/ds4-layer2-historical-export.cli.ts',
  'backend/src/modules/vehicle-intelligence/driving-intelligence/ds4-assessment/',
  'backend/package.json',
] as const;

export class Ds4Layer2HistoricalExportEvaluationAttestationErrorV1 extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'Ds4Layer2HistoricalExportEvaluationAttestationErrorV1';
  }
}

export type GitCommandRunnerV1 = (args: readonly string[], cwd: string) => string;

function defaultGitRunner(args: readonly string[], cwd: string): string {
  return execFileSync('git', [...args], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trimEnd();
}

function repoRootFromModule(): string {
  return path.resolve(__dirname, '../../../../../../..');
}

function failAttestation(message: string): never {
  throw new Ds4Layer2HistoricalExportEvaluationAttestationErrorV1(message);
}

export function parseGitStatusPorcelainForLayer2ExportAttestationV1(
  porcelain: string,
): { kind: 'clean' } | { kind: 'dirty_tracked'; path: string; status: string } | { kind: 'untracked'; path: string } {
  for (const line of porcelain.split('\n')) {
    if (!line.trim()) continue;
    const status = line.slice(0, 2);
    const filePath = line.slice(3).trim();
    if (status === '??') {
      return { kind: 'untracked', path: filePath };
    }
    if (status.includes('?')) {
      continue;
    }
    if (status !== '  ') {
      return { kind: 'dirty_tracked', path: filePath, status };
    }
  }
  return { kind: 'clean' };
}

export function assertEvaluationCheckoutCleanForLayer2ExportV1(
  cwd: string,
  runGit: GitCommandRunnerV1 = defaultGitRunner,
): void {
  const pathspecArgs = [...DS4_LAYER2_EXPORT_EVALUATION_ATTESTATION_PATHSPECS_V1];
  let porcelain: string;
  try {
    porcelain = runGit(['status', '--porcelain', '-u', '--', ...pathspecArgs], cwd);
  } catch {
    failAttestation('Cannot establish checkout cleanliness — git status failed');
  }

  const parsed = parseGitStatusPorcelainForLayer2ExportAttestationV1(porcelain);
  if (parsed.kind === 'untracked') {
    failAttestation(
      `Untracked file in evaluation scope would affect executable export code: ${parsed.path}`,
    );
  }
  if (parsed.kind === 'dirty_tracked') {
    failAttestation(
      `Dirty tracked file in evaluation scope (${parsed.status.trim()}): ${parsed.path}`,
    );
  }
}

export function resolveEvaluationCodeShaFromGitCheckoutV1(
  cwd: string = repoRootFromModule(),
  runGit: GitCommandRunnerV1 = defaultGitRunner,
): string {
  let sha: string;
  try {
    sha = runGit(['rev-parse', 'HEAD'], cwd).trim();
  } catch {
    failAttestation('Cannot resolve evaluation code SHA — git rev-parse HEAD failed (not a git checkout?)');
  }
  if (!SHA40.test(sha)) {
    failAttestation(`Invalid evaluation code SHA from git: ${sha}`);
  }
  return sha;
}

export function assertDeployShaMatchesEvaluationCheckoutV1(input: {
  deployShaAssertion: string | undefined;
  evaluationCodeSha: string;
}): void {
  if (input.deployShaAssertion == null) return;
  const normalized = input.deployShaAssertion.trim().toLowerCase();
  if (!SHA40.test(normalized)) {
    failAttestation('--deploy-sha must be a 40-character lowercase hex git commit SHA when provided');
  }
  if (normalized !== input.evaluationCodeSha) {
    failAttestation(`--deploy-sha ${normalized} does not match checkout HEAD ${input.evaluationCodeSha}`);
  }
}

export function assertEvaluationCodeCheckoutAttestationV1(input: {
  cwd: string;
  deployShaAssertion?: string;
  runGit?: GitCommandRunnerV1;
}): { evaluationCodeSha: string } {
  const runGit = input.runGit ?? defaultGitRunner;
  const evaluationCodeSha = resolveEvaluationCodeShaFromGitCheckoutV1(input.cwd, runGit);
  assertEvaluationCheckoutCleanForLayer2ExportV1(input.cwd, runGit);
  assertDeployShaMatchesEvaluationCheckoutV1({
    deployShaAssertion: input.deployShaAssertion,
    evaluationCodeSha,
  });
  return { evaluationCodeSha };
}

/** True when {@link outDir} is outside the git checkout root (export artifacts must not affect attestation). */
export function isExportOutputDirectoryOutsideCheckoutV1(outDir: string, repoRoot: string): boolean {
  const resolvedOut = path.resolve(outDir);
  const resolvedRoot = path.resolve(repoRoot);
  const relative = path.relative(resolvedRoot, resolvedOut);
  return relative.startsWith('..') || path.isAbsolute(relative);
}
