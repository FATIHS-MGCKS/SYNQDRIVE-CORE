import {
  buildSnapshotNativeDiscoveryInventory,
  isDimoRawPayloadSignalNode,
  listDimoNativeSignalKeysFromRawPayload,
} from './vsi-snapshot-native-discovery.extractor';
import { VsiEvidenceAxisEvaluationState } from './vsi-native-signal-discovery-evaluation-state';
import { VsiProviderCatalogStatus } from './vehicle-signal-evidence.contract';

const scope = {
  organizationId: 'org-a',
  vehicleId: 'veh-a',
  providerSourceLinkId: 'link-a',
  providerIdentity: 'DIMO',
};

const emptyCatalog = {
  checkedAt: null,
  byNativeSignalName: new Map<string, typeof VsiProviderCatalogStatus.LISTED>(),
  limitations: [],
};

describe('vsi-snapshot-native-discovery.extractor', () => {
  it('discovers unknown native keys without canonical mapping', () => {
    const ts = '2026-10-27T10:00:00.000Z';
    const inv = buildSnapshotNativeDiscoveryInventory({
      scope,
      evaluatedAt: new Date(ts),
      latestState: {
        vehicleId: scope.vehicleId,
        providerBindingId: scope.providerSourceLinkId,
        providerSource: 'DIMO',
        lvBatteryVoltage: null,
        evSoc: null,
        online: true,
        sourceTimestamp: new Date(ts),
        providerFetchedAt: new Date(ts),
        updatedAt: new Date(ts),
        rawPayloadJson: {
          customUnknownTelemetryField: { value: 42, timestamp: ts },
          powertrainCombustionEngineECT: { value: 88, timestamp: ts },
        },
        obdDtcList: null,
        lastDtcSuccessfulCheckAt: null,
      },
      declaredCatalog: emptyCatalog,
      projectionAsOf: new Date(ts),
      stateAttributed: true,
      providerIdentity: 'DIMO',
    });
    const ect = inv.entries.find((e) => e.providerNativeSignalName === 'powertrainCombustionEngineECT');
    expect(ect?.snapshot.evaluation.state).toBe(VsiEvidenceAxisEvaluationState.EVALUATED_OBSERVED);
    expect(ect?.canonicalSignalKey).toBeNull();
    expect(ect?.aliasVerdict).toBe('UNKNOWN_SIGNAL');
    const unknown = inv.entries.find((e) => e.providerNativeSignalName === 'customUnknownTelemetryField');
    expect(unknown?.aliasVerdict).toBe('UNKNOWN_SIGNAL');
    expect(unknown?.canonicalSignalKey).toBeNull();
  });

  it('Audi coolant temperature regression — ECT observed with source timestamp', () => {
    const ts = '2026-08-08T16:54:01.556Z';
    const inv = buildSnapshotNativeDiscoveryInventory({
      scope,
      evaluatedAt: new Date(ts),
      latestState: {
        vehicleId: scope.vehicleId,
        providerBindingId: scope.providerSourceLinkId,
        providerSource: 'DIMO',
        lvBatteryVoltage: null,
        evSoc: null,
        online: true,
        sourceTimestamp: new Date(ts),
        providerFetchedAt: new Date('2026-08-08T16:54:05.000Z'),
        updatedAt: new Date(ts),
        rawPayloadJson: {
          powertrainCombustionEngineECT: { value: 92.5, timestamp: ts },
        },
        obdDtcList: null,
        lastDtcSuccessfulCheckAt: null,
      },
      declaredCatalog: {
        ...emptyCatalog,
        byNativeSignalName: new Map([
          ['powertrainCombustionEngineECT', VsiProviderCatalogStatus.LISTED],
        ]),
      },
      projectionAsOf: new Date(ts),
      stateAttributed: true,
      providerIdentity: 'DIMO',
    });
    const ect = inv.entries.find((e) => e.providerNativeSignalName === 'powertrainCombustionEngineECT');
    expect(ect?.snapshot.evaluation.state).toBe(VsiEvidenceAxisEvaluationState.EVALUATED_OBSERVED);
    expect(ect?.snapshot.lastSourceTimestamp).toBe(ts);
    expect(ect?.ingestionLimitations).toContain('DECLARED_CATALOG_LISTED');
    expect(ect?.historical.evaluation.state).toBe(VsiEvidenceAxisEvaluationState.NOT_EVALUATED);
  });

  it('empty snapshot yields zero entries', () => {
    const inv = buildSnapshotNativeDiscoveryInventory({
      scope,
      evaluatedAt: new Date(),
      latestState: {
        vehicleId: scope.vehicleId,
        providerBindingId: scope.providerSourceLinkId,
        providerSource: 'DIMO',
        lvBatteryVoltage: null,
        evSoc: null,
        online: true,
        sourceTimestamp: new Date(),
        providerFetchedAt: new Date(),
        updatedAt: new Date(),
        rawPayloadJson: {},
        obdDtcList: null,
        lastDtcSuccessfulCheckAt: null,
      },
      declaredCatalog: emptyCatalog,
      projectionAsOf: new Date(),
      stateAttributed: true,
      providerIdentity: 'DIMO',
    });
    expect(inv.entries).toHaveLength(0);
  });

  it('invalid measurement → EVALUATED_NOT_OBSERVED', () => {
    const inv = buildSnapshotNativeDiscoveryInventory({
      scope,
      evaluatedAt: new Date(),
      latestState: {
        vehicleId: scope.vehicleId,
        providerBindingId: scope.providerSourceLinkId,
        providerSource: 'DIMO',
        lvBatteryVoltage: null,
        evSoc: null,
        online: true,
        sourceTimestamp: new Date(),
        providerFetchedAt: new Date(),
        updatedAt: new Date(),
        rawPayloadJson: {
          speed: { value: 'not-a-number', timestamp: new Date().toISOString() },
        },
        obdDtcList: null,
        lastDtcSuccessfulCheckAt: null,
      },
      declaredCatalog: emptyCatalog,
      projectionAsOf: new Date(),
      stateAttributed: true,
      providerIdentity: 'DIMO',
    });
    expect(inv.entries[0]?.snapshot.evaluation.state).toBe(
      VsiEvidenceAxisEvaluationState.EVALUATED_NOT_OBSERVED,
    );
  });

  it('link mismatch → NOT_EVALUATED on snapshot axis', () => {
    const ts = new Date().toISOString();
    const inv = buildSnapshotNativeDiscoveryInventory({
      scope,
      evaluatedAt: new Date(),
      latestState: {
        vehicleId: scope.vehicleId,
        providerBindingId: scope.providerSourceLinkId,
        providerSource: 'DIMO',
        lvBatteryVoltage: null,
        evSoc: null,
        online: true,
        sourceTimestamp: new Date(),
        providerFetchedAt: new Date(),
        updatedAt: new Date(),
        rawPayloadJson: { speed: { value: 10, timestamp: ts } },
        obdDtcList: null,
        lastDtcSuccessfulCheckAt: null,
      },
      declaredCatalog: emptyCatalog,
      projectionAsOf: new Date(),
      stateAttributed: false,
      providerIdentity: 'DIMO',
    });
    expect(inv.entries[0]?.snapshot.evaluation.state).toBe(
      VsiEvidenceAxisEvaluationState.NOT_EVALUATED,
    );
  });

  it('lists only DIMO signal nodes and skips device metadata', () => {
    expect(isDimoRawPayloadSignalNode({ value: 1, timestamp: 'x' })).toBe(true);
    expect(isDimoRawPayloadSignalNode({ id: 'x' })).toBe(false);
    const { keys } = listDimoNativeSignalKeysFromRawPayload({
      aftermarketDevice: { id: 'R1' },
      speed: { value: 1, timestamp: 'x' },
    });
    expect(keys).toEqual(['speed']);
  });
});
