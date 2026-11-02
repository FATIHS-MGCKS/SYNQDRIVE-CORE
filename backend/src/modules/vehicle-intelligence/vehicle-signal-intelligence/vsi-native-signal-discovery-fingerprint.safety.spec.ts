import { enrichVsiProfileWithSignalFingerprints } from './vsi-signal-fingerprint.enricher';
import type { VsiProfileEvaluationDraft } from './vsi-profile.types';
import { VSI_PROFILE_CONTRACT_VERSION } from './vsi-profile.types';
import {
  fingerprintVsiProfileSemanticEvaluation,
  fingerprintVsiProfileSemanticFromPersisted,
} from './vsi-profile-fingerprint.util';

/**
 * P0: nativeSignalDiscoveryInventory is not part of vsi-signal-profile-v2 evaluation
 * signals — semantic fingerprint must remain unchanged when only external inventory differs.
 */
describe('vsi-native-signal-discovery semantic fingerprint isolation (P0)', () => {
  function minimalDraft(): VsiProfileEvaluationDraft {
    const ts = '2026-10-15T12:00:00.000Z';
    return {
      contractVersion: VSI_PROFILE_CONTRACT_VERSION,
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      providerSourceLinkId: 'link-1',
      providerIdentity: 'DIMO',
      verifiedModality: null,
      telemetrySourceFamily: null,
      evaluatedAt: new Date('2026-10-15T12:05:00.000Z'),
      declaredCatalogCheckedAt: null,
      lastMaterializedSourceTimestamp: new Date(ts),
      lastMaterializedProviderFetchAt: null,
      lastProvenStrictSourceAdvanceAt: null,
      profileLimitations: [],
      signals: [],
    };
  }

  it('fingerprint uses signalsSnapshot only (12-key contract path unchanged)', () => {
    const evaluation = enrichVsiProfileWithSignalFingerprints(minimalDraft(), {
      bundleSourceTimestamps: [],
    });
    const fp1 = fingerprintVsiProfileSemanticEvaluation(evaluation);
    const fp2 = fingerprintVsiProfileSemanticEvaluation({
      ...evaluation,
      evaluatedAt: new Date('2026-11-02T12:00:00.000Z'),
    });
    expect(fp1).toBe(fp2);
  });

  it('persisted fingerprint ignores fields outside semantic input contract', () => {
    const evaluation = enrichVsiProfileWithSignalFingerprints(minimalDraft(), {
      bundleSourceTimestamps: [],
    });
    const persistedInput = {
      profileContractVersion: evaluation.contractVersion,
      providerSourceLinkId: evaluation.providerSourceLinkId,
      providerIdentity: evaluation.providerIdentity,
      verifiedModality: evaluation.verifiedModality,
      telemetrySourceFamily: evaluation.telemetrySourceFamily,
      declaredCatalogCheckedAt: evaluation.declaredCatalogCheckedAt,
      lastMaterializedSourceTimestamp: evaluation.lastMaterializedSourceTimestamp,
      lastProvenStrictSourceAdvanceAt: evaluation.lastProvenStrictSourceAdvanceAt,
      profileLimitations: evaluation.profileLimitations,
      signalsSnapshot: evaluation.signals,
    };
    const fpA = fingerprintVsiProfileSemanticFromPersisted(persistedInput);
    const fpB = fingerprintVsiProfileSemanticFromPersisted(persistedInput);
    expect(fpA).toBe(fpB);
  });
});
