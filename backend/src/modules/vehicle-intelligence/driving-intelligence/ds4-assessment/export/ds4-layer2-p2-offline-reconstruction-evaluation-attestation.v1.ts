import { execFileSync } from 'child_process';
import {
  assertDeployShaMatchesEvaluationCheckoutV1,
  parseGitStatusPorcelainForLayer2ExportAttestationV1,
  resolveEvaluationCodeShaFromGitCheckoutV1,
  type GitCommandRunnerV1,
} from './ds4-layer2-historical-export-evaluation-attestation.v1';

function defaultGitRunner(args: readonly string[], cwd: string): string {
  return execFileSync('git', [...args], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trimEnd();
}

export const DS4_LAYER2_P2_OFFLINE_EVALUATION_ATTESTATION_PATHSPECS_V1 = [
  'backend/scripts/research/ds4-layer2-historical-export.cli.ts',
  'backend/scripts/research/ds4-layer2-p2-offline-reconstruction.cli.ts',
  'backend/src/modules/vehicle-intelligence/driving-intelligence/ds4-assessment/',
  'backend/package.json',
] as const;

export function assertEvaluationCheckoutCleanForLayer2P2OfflineV1(
  cwd: string,
  runGit: GitCommandRunnerV1 = defaultGitRunner,
): void {
  const pathspecArgs = [...DS4_LAYER2_P2_OFFLINE_EVALUATION_ATTESTATION_PATHSPECS_V1];
  let porcelain: string;
  try {
    porcelain = runGit(['status', '--porcelain', '-u', '--', ...pathspecArgs], cwd);
  } catch {
    throw new Error('Cannot establish checkout cleanliness — git status failed');
  }
  const parsed = parseGitStatusPorcelainForLayer2ExportAttestationV1(porcelain);
  if (parsed.kind === 'untracked') {
    throw new Error(`Untracked file in P2 evaluation scope: ${parsed.path}`);
  }
  if (parsed.kind === 'dirty_tracked') {
    throw new Error(`Dirty tracked file in P2 evaluation scope (${parsed.status.trim()}): ${parsed.path}`);
  }
}

export function assertEvaluationCodeCheckoutAttestationForLayer2P2OfflineV1(input: {
  cwd: string;
  deployShaAssertion?: string;
  runGit?: GitCommandRunnerV1;
}): { evaluationCodeSha: string } {
  const runGit = input.runGit ?? defaultGitRunner;
  const evaluationCodeSha = resolveEvaluationCodeShaFromGitCheckoutV1(input.cwd, runGit);
  assertEvaluationCheckoutCleanForLayer2P2OfflineV1(input.cwd, runGit);
  assertDeployShaMatchesEvaluationCheckoutV1({
    deployShaAssertion: input.deployShaAssertion,
    evaluationCodeSha,
  });
  return { evaluationCodeSha };
}
