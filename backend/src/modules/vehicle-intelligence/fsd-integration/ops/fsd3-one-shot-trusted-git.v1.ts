import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';

const GIT_CANDIDATES = ['/usr/bin/git', '/bin/git'] as const;

export function resolveTrustedGitExecutableV1(): string {
  for (const candidate of GIT_CANDIDATES) {
    try {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        return candidate;
      }
    } catch {
      continue;
    }
  }
  throw new Error('FSD3_TRUSTED_GIT_MISSING');
}

/** Git subprocess env: no GIT_* injection, minimal PATH. */
export function buildTrustedGitSubprocessEnvV1(input?: {
  home?: string;
  lang?: string;
}): NodeJS.ProcessEnv {
  return {
    HOME: input?.home ?? process.env.HOME ?? '/root',
    LANG: input?.lang ?? process.env.LANG ?? 'C.UTF-8',
    PATH: '/usr/bin:/bin',
  };
}

export function trustedGitExecFileSyncV1(
  gitPath: string,
  args: string[],
  input?: {
    encoding?: BufferEncoding | 'buffer';
    cwd?: string;
    maxBuffer?: number;
    stdio?: 'pipe' | 'inherit' | 'ignore';
  },
): string | Buffer {
  const encoding = input?.encoding === 'buffer' ? undefined : (input?.encoding ?? 'utf8');
  const fullArgs = [
    '-c',
    'core.fsmonitor=false',
    '-c',
    'core.untrackedCache=false',
    ...args,
  ];
  return execFileSync(gitPath, fullArgs, {
    encoding: encoding === undefined ? undefined : encoding,
    env: buildTrustedGitSubprocessEnvV1(),
    cwd: input?.cwd,
    maxBuffer: input?.maxBuffer ?? 64 * 1024 * 1024,
    stdio: input?.stdio,
  }) as string | Buffer;
}

export function assertGitEnvironmentNotInjectedV1(env: NodeJS.ProcessEnv = process.env): void {
  for (const key of Object.keys(env)) {
    if (key === 'GIT_EXEC_PATH' || key.startsWith('GIT_')) {
      throw new Error('FSD3_GIT_ENV_INJECTION_REJECTED');
    }
  }
}
