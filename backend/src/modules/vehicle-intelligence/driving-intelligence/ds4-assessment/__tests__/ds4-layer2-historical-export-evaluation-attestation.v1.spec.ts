import * as os from 'os';
import * as path from 'path';
import {
  assertDeployShaMatchesEvaluationCheckoutV1,
  assertEvaluationCodeCheckoutAttestationV1,
  Ds4Layer2HistoricalExportEvaluationAttestationErrorV1,
  isExportOutputDirectoryOutsideCheckoutV1,
  parseGitStatusPorcelainForLayer2ExportAttestationV1,
  resolveEvaluationCodeShaFromGitCheckoutV1,
} from '../export/ds4-layer2-historical-export-evaluation-attestation.v1';

const VALID_SHA = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

describe('ds4-layer2-historical-export-evaluation-attestation.v1', () => {
  it('accepts clean checkout in attestation scope', () => {
    const runGit = jest.fn((args: readonly string[]) => {
      if (args[0] === 'rev-parse') return VALID_SHA;
      if (args[0] === 'status') return '';
      throw new Error(`unexpected git ${args.join(' ')}`);
    });
    expect(
      assertEvaluationCodeCheckoutAttestationV1({ cwd: '/repo', runGit }).evaluationCodeSha,
    ).toBe(VALID_SHA);
  });

  it('rejects modified tracked exporter source', () => {
    const runGit = jest.fn((args: readonly string[]) => {
      if (args[0] === 'rev-parse') return VALID_SHA;
      if (args[0] === 'status') {
        return ' M backend/src/modules/vehicle-intelligence/driving-intelligence/ds4-assessment/export/ds4-layer2-historical-export.v1.ts';
      }
      throw new Error(`unexpected git ${args.join(' ')}`);
    });
    expect(() => assertEvaluationCodeCheckoutAttestationV1({ cwd: '/repo', runGit })).toThrow(
      /Dirty tracked file/,
    );
  });

  it('rejects modified tracked configuration', () => {
    const runGit = jest.fn((args: readonly string[]) => {
      if (args[0] === 'rev-parse') return VALID_SHA;
      if (args[0] === 'status') return ' M backend/package.json';
      throw new Error(`unexpected git ${args.join(' ')}`);
    });
    expect(() => assertEvaluationCodeCheckoutAttestationV1({ cwd: '/repo', runGit })).toThrow(
      /Dirty tracked file.*backend\/package.json/,
    );
  });

  it('rejects relevant untracked executable source', () => {
    const runGit = jest.fn((args: readonly string[]) => {
      if (args[0] === 'rev-parse') return VALID_SHA;
      if (args[0] === 'status') {
        return '?? backend/src/modules/vehicle-intelligence/driving-intelligence/ds4-assessment/export/evil-patch.ts';
      }
      throw new Error(`unexpected git ${args.join(' ')}`);
    });
    expect(() => assertEvaluationCodeCheckoutAttestationV1({ cwd: '/repo', runGit })).toThrow(
      /Untracked file in evaluation scope/,
    );
  });

  it('rejects deploy-sha mismatch', () => {
    expect(() =>
      assertDeployShaMatchesEvaluationCheckoutV1({
        deployShaAssertion: '0000000000000000000000000000000000000000',
        evaluationCodeSha: VALID_SHA,
      }),
    ).toThrow(Ds4Layer2HistoricalExportEvaluationAttestationErrorV1);
  });

  it('rejects missing git identity', () => {
    const runGit = jest.fn((args: readonly string[]) => {
      if (args[0] === 'rev-parse') throw new Error('not a git repository');
      return '';
    });
    expect(() => resolveEvaluationCodeShaFromGitCheckoutV1('/repo', runGit)).toThrow(
      /git rev-parse HEAD failed/,
    );
  });

  it('accepts matching deploy-sha assertion', () => {
    expect(() =>
      assertDeployShaMatchesEvaluationCheckoutV1({
        deployShaAssertion: VALID_SHA,
        evaluationCodeSha: VALID_SHA,
      }),
    ).not.toThrow();
  });

  it('treats output directory outside checkout as attestation-neutral', () => {
    const repoRoot = path.join(os.tmpdir(), 'synqdrive-repo');
    const outDir = path.join(os.tmpdir(), 'ds4-export-artifacts');
    expect(isExportOutputDirectoryOutsideCheckoutV1(outDir, repoRoot)).toBe(true);
    expect(parseGitStatusPorcelainForLayer2ExportAttestationV1('')).toEqual({ kind: 'clean' });
  });
});
