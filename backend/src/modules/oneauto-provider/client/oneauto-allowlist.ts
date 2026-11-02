import { ONEAUTO_EXECUTION_VERIFIED_PROVIDER_CONTRACTS } from '../catalog/oneauto-verified-contracts';

function normalizePath(path: string): string {
  return path.replace(/^\/+/, '').replace(/\/+$/, '').toLowerCase();
}

function buildAllowlist(): ReadonlySet<string> {
  return new Set(
    [...ONEAUTO_EXECUTION_VERIFIED_PROVIDER_CONTRACTS.values()].map(
      (c) => `${c.httpMethod}:${normalizePath(c.providerPathTemplate)}`,
    ),
  );
}

export function assertOneAutoAllowlistedPath(method: string, relativePath: string): void {
  const key = `${method.toUpperCase()}:${normalizePath(relativePath)}`;
  if (!buildAllowlist().has(key)) {
    throw Object.assign(new Error(`ONEAUTO_PATH_NOT_ALLOWLISTED:${key}`), {
      code: 'CONTRACT_UNVERIFIED',
    });
  }
}

export function isOneAutoPathAllowlisted(method: string, relativePath: string): boolean {
  const key = `${method.toUpperCase()}:${normalizePath(relativePath)}`;
  return buildAllowlist().has(key);
}

export function listAllowlistedMethodPathKeys(): string[] {
  return [...buildAllowlist()];
}
