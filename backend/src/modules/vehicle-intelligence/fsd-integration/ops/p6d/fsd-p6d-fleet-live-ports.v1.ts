import type { Fsd3DiscoveryProviderPortV1 } from '@modules/vehicle-intelligence/full-signal-discovery/orchestration/fsd3-provider.port.v1';
import type { Fsd4HistoricalDiscoveryProviderPortV1 } from '@modules/vehicle-intelligence/full-signal-discovery/orchestration/fsd4-provider.port.v1';
import { createFsd3MockDiscoveryProvider } from '@modules/vehicle-intelligence/full-signal-discovery/orchestration/fsd3-mock-provider.v1';
import { createFsd4MockHistoricalProvider } from '@modules/vehicle-intelligence/full-signal-discovery/orchestration/fsd4-mock-provider.v1';
import type { FsdDimoAdapterFactoryService } from '../../fsd-dimo-adapter-factory.service';
import {
  assertFsdP6dMockTransportForbiddenOnProductionV1,
  isFsdP6dForceMockTransportV1,
} from './fsd-p6d-live-fleet-gate.v1';

export type FsdP6dFleetProviderBundleV1 = {
  transportLabel: 'dimo_live' | 'mock';
  fsd3Provider: Fsd3DiscoveryProviderPortV1;
  fsd4Provider: Fsd4HistoricalDiscoveryProviderPortV1;
  usesLiveAdapterPorts: boolean;
};

export function resolveFsdP6dFleetProviderBundleV1(input: {
  env?: NodeJS.ProcessEnv;
  adapterFactory?: FsdDimoAdapterFactoryService;
  catalogSignals: readonly string[];
}): FsdP6dFleetProviderBundleV1 {
  const env = input.env ?? process.env;
  const forceMock = isFsdP6dForceMockTransportV1(env);
  if (forceMock) {
    assertFsdP6dMockTransportForbiddenOnProductionV1(env, true);
  }

  if (!forceMock) {
    if (!input.adapterFactory) {
      throw new Error('FSD_P6D_LIVE_ADAPTER_FACTORY_REQUIRED');
    }
    const adapter = input.adapterFactory.createAdapter();
    return {
      transportLabel: 'dimo_live',
      fsd3Provider: adapter.createFsd3Port(),
      fsd4Provider: adapter.createFsd4Port(),
      usesLiveAdapterPorts: true,
    };
  }

  return {
    transportLabel: 'mock',
    fsd3Provider: createFsd3MockDiscoveryProvider({
      mode: 'TESLA_REFERENCE_26',
      catalogSignals: [...input.catalogSignals],
    }),
    fsd4Provider: createFsd4MockHistoricalProvider({ mode: 'TESLA_P2E_HISTORICAL' }),
    usesLiveAdapterPorts: false,
  };
}
