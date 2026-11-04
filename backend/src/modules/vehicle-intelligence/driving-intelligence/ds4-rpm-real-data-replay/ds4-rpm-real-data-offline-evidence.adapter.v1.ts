import type { Ds4RpmRealDataOfflineInputBundleV1 } from './ds4-rpm-real-data-replay.contract.v1';

/**
 * Future authorized production read adapter — not implemented in PR-B2.
 * Declaring owner authorization on a bundle MUST NOT instantiate this adapter.
 */
export type Ds4RpmRealDataAuthorizedProductionEvidenceSourceV1 = {
  readonly kind: 'AUTHORIZED_PRODUCTION_READ';
  /** Separate credential scope + owner attestation record required (out of scope PR-B2). */
  loadBundle(_scope: never): Promise<never>;
};

/** Injectable offline adapter for explicitly supplied test bundles only. */
export type Ds4RpmRealDataOfflineEvidenceAdapterV1 = {
  readonly kind: 'OFFLINE_INJECTED_BUNDLE';
  listBundleIds(): readonly string[];
  loadBundle(bundleId: string): Ds4RpmRealDataOfflineInputBundleV1 | null;
};

export function createStaticOfflineEvidenceAdapter(
  bundles: readonly Ds4RpmRealDataOfflineInputBundleV1[],
): Ds4RpmRealDataOfflineEvidenceAdapterV1 {
  const byId = new Map(bundles.map((b) => [b.bundleId, b]));
  return {
    kind: 'OFFLINE_INJECTED_BUNDLE',
    listBundleIds: () => [...byId.keys()],
    loadBundle: (bundleId) => byId.get(bundleId) ?? null,
  };
}

/** Hard guard — production adapter surface is unreachable in PR-B2. */
export function assertProductionEvidenceSourceNotImplemented(
  source: Ds4RpmRealDataAuthorizedProductionEvidenceSourceV1 | null | undefined,
): void {
  if (source != null) {
    throw new Error('DS4_RPM_REAL_DATA_PRODUCTION_ADAPTER_NOT_IMPLEMENTED_IN_PR_B2');
  }
}
