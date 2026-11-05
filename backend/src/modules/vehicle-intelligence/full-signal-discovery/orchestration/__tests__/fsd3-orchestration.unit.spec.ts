import {
  FSD_P2E_AGGREGATE_EXPECTATIONS_V1,
  FSD_TESLA_P2E_DECLARED_FIELDS_V1,
} from '../../__fixtures__/fsd-p2e-tesla.fixture.v1';
import { buildFsd3DeclaredCatalogFingerprintV1 } from '../fsd3-fingerprint.v1';
import { createFsd3MockDiscoveryProvider } from '../fsd3-mock-provider.v1';
import {
  createDefaultFsd3OrchestrationConfigV1,
  parseFsd3VehicleAllowlistEnv,
} from '../fsd3-orchestration.config.v1';

describe('FSD-3 orchestration (unit)', () => {
  it('defaults fail-closed when disabled', () => {
    const cfg = createDefaultFsd3OrchestrationConfigV1();
    expect(cfg.enabled).toBe(false);
    expect(cfg.providerExecutionEnabled).toBe(false);
    expect(cfg.allowedVehicleIds.size).toBe(0);
  });

  it('builds deterministic catalog fingerprints for full catalog', () => {
    const fpA = buildFsd3DeclaredCatalogFingerprintV1(FSD_TESLA_P2E_DECLARED_FIELDS_V1);
    const fpB = buildFsd3DeclaredCatalogFingerprintV1([...FSD_TESLA_P2E_DECLARED_FIELDS_V1]);
    expect(fpA).toBe(fpB);
    expect(fpA).toHaveLength(64);
  });

  it('mock tesla catalog exposes all 26 declared signals without truncation', async () => {
    const provider = createFsd3MockDiscoveryProvider({ mode: 'TESLA_REFERENCE_26' });
    const catalog = await provider.fetchAvailableSignals({ tokenId: 1 });
    expect(catalog.availableSignals.length).toBe(26);
    expect(catalog.availableSignals).toContain('currentLocationCoordinates');
    expect(catalog.availableSignals).toContain(FSD_P2E_AGGREGATE_EXPECTATIONS_V1.nullOnlySignal);
  });

  it('parses vehicle allowlist env', () => {
    const ids = parseFsd3VehicleAllowlistEnv('veh-a, veh-b');
    expect([...ids]).toEqual(['veh-a', 'veh-b']);
  });
});
