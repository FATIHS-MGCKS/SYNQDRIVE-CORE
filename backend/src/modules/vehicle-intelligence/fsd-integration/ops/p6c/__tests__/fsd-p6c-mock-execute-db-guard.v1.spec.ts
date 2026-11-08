import { assertFsdP6cMockExecuteDatabaseAllowedV1 } from '../fsd-p6c-mock-execute-db-guard.v1';

describe('FSD P6C mock execute DB guard', () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    saved.DATABASE_URL = process.env.DATABASE_URL;
    saved.FSD_DISCOVERY_PERSISTENCE_PG = process.env.FSD_DISCOVERY_PERSISTENCE_PG;
    saved.FSD_P6C_MOCK_EXECUTE_FORCE_ALLOWED = process.env.FSD_P6C_MOCK_EXECUTE_FORCE_ALLOWED;
  });

  afterEach(() => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) {
        delete process.env[k];
      } else {
        process.env[k] = v;
      }
    }
  });

  it('allows disposable local fsd2_test_ci with PG flag', () => {
    process.env.DATABASE_URL =
      'postgresql://synqdrive:synqdrive@127.0.0.1:5432/fsd2_test_ci?schema=public';
    process.env.FSD_DISCOVERY_PERSISTENCE_PG = '1';
    process.env.FSD_P6C_MOCK_EXECUTE_FORCE_ALLOWED = '1';
    expect(() => assertFsdP6cMockExecuteDatabaseAllowedV1()).not.toThrow();
  });

  it('fail-closed on production URL even with force bypass env', () => {
    process.env.DATABASE_URL = 'postgresql://u:p@app.synqdrive.eu:5432/synqdrive?schema=public';
    process.env.FSD_DISCOVERY_PERSISTENCE_PG = '1';
    process.env.FSD_P6C_MOCK_EXECUTE_FORCE_ALLOWED = '1';
    expect(() => assertFsdP6cMockExecuteDatabaseAllowedV1()).toThrow(/MOCK_EXECUTE_DB_FORBIDDEN/);
  });

  it('fail-closed on wrong database name', () => {
    process.env.DATABASE_URL =
      'postgresql://synqdrive:synqdrive@127.0.0.1:5432/postgres?schema=public';
    process.env.FSD_DISCOVERY_PERSISTENCE_PG = '1';
    expect(() => assertFsdP6cMockExecuteDatabaseAllowedV1()).toThrow(/MOCK_EXECUTE_DB_FORBIDDEN/);
  });

  it('fail-closed on remote host', () => {
    process.env.DATABASE_URL =
      'postgresql://synqdrive:synqdrive@db.example.com:5432/fsd2_test_ci?schema=public';
    process.env.FSD_DISCOVERY_PERSISTENCE_PG = '1';
    expect(() => assertFsdP6cMockExecuteDatabaseAllowedV1()).toThrow(/MOCK_EXECUTE_DB_FORBIDDEN/);
  });

  it('fail-closed without PG test flag', () => {
    process.env.DATABASE_URL =
      'postgresql://synqdrive:synqdrive@127.0.0.1:5432/fsd2_test_ci?schema=public';
    process.env.FSD_DISCOVERY_PERSISTENCE_PG = '0';
    expect(() => assertFsdP6cMockExecuteDatabaseAllowedV1()).toThrow(/MOCK_EXECUTE_DB_FORBIDDEN/);
  });
});
