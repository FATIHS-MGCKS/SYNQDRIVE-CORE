import { closeSync, fstatSync, lstatSync, openSync, readSync, realpathSync } from 'fs';
import { isAbsolute, join, normalize, resolve, sep } from 'path';

export const DS4_DBI_W1B1_MAX_PAYLOAD_BYTES = 32 * 1024 * 1024;
export const DS4_DBI_W1B1_MAX_MANIFEST_BYTES = 512 * 1024;

export type Ds4DbiW1b1PathFailureCodeV1 =
  | 'PATH_ABSOLUTE_REJECTED'
  | 'PATH_TRAVERSAL_REJECTED'
  | 'PATH_OUTSIDE_ALLOWLIST'
  | 'SYMLINK_ESCAPE_REJECTED'
  | 'FILE_TOO_LARGE'
  | 'SOURCE_FILE_MISSING'
  | 'FILE_READ_INCOMPLETE';

/** Validate repo-relative path before normalization collapses `..`. */
export function validateRepoRelativePathInputV1(relPath: string): { ok: true } | { ok: false; code: Ds4DbiW1b1PathFailureCodeV1 } {
  if (isAbsolute(relPath)) {
    return { ok: false, code: 'PATH_ABSOLUTE_REJECTED' };
  }
  const segments = relPath.split(/[/\\]/);
  if (segments.some((seg) => seg === '..')) {
    return { ok: false, code: 'PATH_TRAVERSAL_REJECTED' };
  }
  return { ok: true };
}

export function resolveRepoRelativePathV1(input: {
  repositoryRoot: string;
  relPath: string;
  allowedRootsRel: readonly string[];
}): { ok: true; absPath: string } | { ok: false; code: Ds4DbiW1b1PathFailureCodeV1 } {
  const relCheck = validateRepoRelativePathInputV1(input.relPath);
  if (!relCheck.ok) {
    return relCheck;
  }

  const normalizedRel = normalize(input.relPath);

  const absPath = resolve(input.repositoryRoot, normalizedRel);
  try {
    const entryStat = lstatSync(absPath);
    if (entryStat.isSymbolicLink()) {
      return { ok: false, code: 'SYMLINK_ESCAPE_REJECTED' };
    }
  } catch {
    return { ok: false, code: 'PATH_OUTSIDE_ALLOWLIST' };
  }

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
    const rootCheck = validateRepoRelativePathInputV1(rootRel);
    if (!rootCheck.ok) {
      continue;
    }
    const allowAbs = realpathSync(resolve(repoRootReal, normalize(rootRel)));
    if (pathReal.startsWith(allowAbs + sep) || pathReal === allowAbs) {
      allowed = true;
      break;
    }
  }
  if (!allowed) {
    return { ok: false, code: 'PATH_OUTSIDE_ALLOWLIST' };
  }

  return { ok: true, absPath: pathReal };
}

export function assertFileSizeBoundedV1(sizeBytes: number, maxBytes: number): Ds4DbiW1b1PathFailureCodeV1 | null {
  if (sizeBytes > maxBytes) {
    return 'FILE_TOO_LARGE';
  }
  return null;
}

/** Stat then read at most `maxBytes`; rejects symlinks and oversize before full read. */
export function readBoundedFileBytesV1(
  absPath: string,
  maxBytes: number,
): { ok: true; bytes: Buffer } | { ok: false; code: Ds4DbiW1b1PathFailureCodeV1 } {
  const linkStat = lstatSync(absPath);
  if (linkStat.isSymbolicLink()) {
    return { ok: false, code: 'SYMLINK_ESCAPE_REJECTED' };
  }
  if (!linkStat.isFile()) {
    return { ok: false, code: 'SOURCE_FILE_MISSING' };
  }
  const sizeCode = assertFileSizeBoundedV1(linkStat.size, maxBytes);
  if (sizeCode) {
    return { ok: false, code: sizeCode };
  }

  let fd: number;
  try {
    fd = openSync(absPath, 'r');
  } catch {
    return { ok: false, code: 'SOURCE_FILE_MISSING' };
  }

  try {
    const size = fstatSync(fd).size;
    const sizeCheck = assertFileSizeBoundedV1(size, maxBytes);
    if (sizeCheck) {
      return { ok: false, code: sizeCheck };
    }
    const buf = Buffer.alloc(size);
    let offset = 0;
    while (offset < size) {
      const n = readSync(fd, buf, offset, size - offset, offset);
      if (n <= 0) {
        return { ok: false, code: 'FILE_READ_INCOMPLETE' };
      }
      offset += n;
    }
    return { ok: true, bytes: buf };
  } finally {
    closeSync(fd);
  }
}
