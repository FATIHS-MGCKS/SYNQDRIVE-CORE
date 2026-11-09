import * as fs from 'node:fs';
import { assertFsd2PersistencePostgresCiEnv } from '@modules/vehicle-intelligence/full-signal-discovery/persistence/fsd-discovery-persistence.postgres-harness';
import { assertFsdP6cMockExecuteDatabaseAllowedV1 } from '../p6c/fsd-p6c-mock-execute-db-guard.v1';

const FORBIDDEN_URL_SUBSTRINGS = [
  'app.synqdrive.eu',
  'srv1374778',
  'hstgr.cloud',
  'mein-vps.internal',
] as const;

const RESERVED_PRODUCTION_DB_NAMES = new Set(['synqdrive', 'production', 'prod']);

export type FsdP6dLiveCliModeV1 = 'PREPARE_LIVE_FLEET' | 'EXECUTE';

function parseDatabaseNameFromUrl(url: string): string {
  try {
    return new URL(url).pathname.replace(/^\//, '').split('?')[0] ?? '';
  } catch {
    return '';
  }
}

function isProductionVpsContext(env: NodeJS.ProcessEnv): boolean {
  if (env.SYNQDRIVE_DATABASE_IDENTITY_PROFILE?.trim() === 'production_vps') {
    return true;
  }
  return fs.existsSync('/opt/synqdrive/shared/backend.env');
}

function assertProductionLikeUrlForbiddenForNonVps(env: NodeJS.ProcessEnv): void {
  const url = env.DATABASE_URL ?? '';
  const lower = url.toLowerCase();
  for (const frag of FORBIDDEN_URL_SUBSTRINGS) {
    if (lower.includes(frag)) {
      throw new Error(`FSD_P6D_LIVE_CLI_FORBIDDEN_DATABASE_HOST:${frag}`);
    }
  }
}

/**
 * H1 — live fleet CLI paths use production DB identity rules; mock EXECUTE stays disposable-only.
 */
export function assertFsdP6dLiveCliDatabaseAdmissionV1(input: {
  mode: FsdP6dLiveCliModeV1;
  liveProvider: 'dimo_live' | 'mock';
  env?: NodeJS.ProcessEnv;
}): void {
  const env = input.env ?? process.env;

  if (input.mode === 'EXECUTE' && input.liveProvider === 'mock') {
    assertFsdP6cMockExecuteDatabaseAllowedV1(env);
    return;
  }

  if (
    (input.mode === 'PREPARE_LIVE_FLEET' || input.mode === 'EXECUTE') &&
    input.liveProvider === 'dimo_live'
  ) {
    const url = env.DATABASE_URL ?? '';
    if (!url.trim()) {
      throw new Error('FSD_P6D_LIVE_CLI_DATABASE_URL_REQUIRED');
    }

    if (env.FSD_DISCOVERY_PERSISTENCE_PG === '1') {
      assertFsd2PersistencePostgresCiEnv();
      return;
    }

    const dbName = parseDatabaseNameFromUrl(url).toLowerCase();
    const onVps = isProductionVpsContext(env);

    if (onVps) {
      if (dbName !== 'synqdrive') {
        throw new Error('FSD_P6D_LIVE_CLI_PRODUCTION_DB_NAME_MISMATCH');
      }
      return;
    }

    assertProductionLikeUrlForbiddenForNonVps(env);

    if (RESERVED_PRODUCTION_DB_NAMES.has(dbName)) {
      throw new Error('FSD_P6D_LIVE_CLI_PRODUCTION_DB_FORBIDDEN_OFF_VPS');
    }

    if (/^fsd2_test_[a-zA-Z0-9_]+$/.test(dbName)) {
      throw new Error('FSD_P6D_LIVE_CLI_DISPOSABLE_DB_REQUIRES_PG_FLAG');
    }

    throw new Error('FSD_P6D_LIVE_CLI_DATABASE_IDENTITY_UNRESOLVED');
  }
}
