import { lstatSync, realpathSync } from 'fs';
import { join, normalize, resolve, sep } from 'path';

export const DS4_DBI_W1B1_MAX_PAYLOAD_BYTES = 32 * 1024 * 1024;
export const DS4_DBI_W1B1_MAX_MANIFEST_BYTES = 512 * 1024;

export type Ds4DbiW1b1PathFailureCodeV1 =
  | 'PATH_TRAVERSAL_REJECTED'
  | 'PATH_OUTSIDE_ALLOWLIST'
  | 'SYMLINK_ESCAPE_REJECTED'
  | 'FILE_TOO_LARGE';

export function resolveRepoRelativePathV1(input: {
  repositoryRoot: string;
  relPath: string;
  allowedRootsRel: readonly string[];
}): { ok: true; absPath: string } | { ok: false; code: Ds4DbiW1b1PathFailureCodeV1 } {
  const normalizedRel = normalize(input.relPath).replace(/^(\.\.(\/|\\|$))+/, '');
  if (normalizedRel.includes('..')) {
    return { ok: false, code: 'PATH_TRAVERSAL_REJECTED' };
  }
  const absPath = resolve(input.repositoryRoot, normalizedRel);
  const repoRootReal = realpathSync(input.repositoryRoot);
  let pathReal: string;
  try {
    pathReal = realpathSync(absPath);
  } catch {
    return { ok: false, code: 'PATH_OUTSIDE_ALLOWLIST' };
  }
  if (!pathReal.startsWith(repoRootReal + sep) && pathReal !== repoRootReal) {
    return { ok: false, code: 'PATH_OUTSIDE_ALLOWLIST' };
  }

  let allowed = false;
  for (const rootRel of input.allowedRootsRel) {
    const allowAbs = realpathSync(resolve(repoRootReal, normalize(rootRel)));
    if (pathReal.startsWith(allowAbs + sep) || pathReal === allowAbs) {
      allowed = true;
      break;
    }
  }
  if (!allowed) {
    return { ok: false, code: 'PATH_OUTSIDE_ALLOWLIST' };
  }

  const stat = lstatSync(pathReal);
  if (stat.isSymbolicLink()) {
    return { ok: false, code: 'SYMLINK_ESCAPE_REJECTED' };
  }

  return { ok: true, absPath: pathReal };
}

export function assertFileSizeBoundedV1(sizeBytes: number, maxBytes: number): Ds4DbiW1b1PathFailureCodeV1 | null {
  if (sizeBytes > maxBytes) {
    return 'FILE_TOO_LARGE';
  }
  return null;
}
