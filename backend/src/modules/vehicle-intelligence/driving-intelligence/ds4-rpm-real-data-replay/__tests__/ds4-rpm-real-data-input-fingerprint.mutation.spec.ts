import {
  computeDs4RpmRealDataOfflineBundleInputFingerprintV1,
  computeDs4RpmRealDataSourceFamilyIdentityDigestV1,
  stableStringify,
} from '../ds4-rpm-real-data-input-fingerprint.v1';
import type { Ds4RpmRealDataOfflineInputBundleV1 } from '../ds4-rpm-real-data-replay.contract.v1';
import {
  R1_DIMO_RAW_JSON,
  SYNTHETIC_DIMO_RAW_JSON,
  buildSyntheticApiBundleValid,
} from './ds4-rpm-real-data-replay-fixtures.harness';

const GENERATED_AT = new Date('2026-11-04T08:00:00.000Z');

function cloneBundle(
  base: Ds4RpmRealDataOfflineInputBundleV1,
  mutate: (b: Ds4RpmRealDataOfflineInputBundleV1) => void,
): Ds4RpmRealDataOfflineInputBundleV1 {
  const copy = structuredClone(base) as Ds4RpmRealDataOfflineInputBundleV1;
  mutate(copy);
  return copy;
}

describe('ds4-rpm-real-data offline bundle input fingerprint v2 mutations', () => {
  const base = buildSyntheticApiBundleValid(GENERATED_AT);

  it('A — same semantic input yields identical fingerprint', () => {
    const a = computeDs4RpmRealDataOfflineBundleInputFingerprintV1(base);
    const b = computeDs4RpmRealDataOfflineBundleInputFingerprintV1(
      buildSyntheticApiBundleValid(GENERATED_AT),
    );
    expect(a).toBe(b);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
  });

  it('B — changed RPM values yields different fingerprint', () => {
    const before = computeDs4RpmRealDataOfflineBundleInputFingerprintV1(base);
    const after = computeDs4RpmRealDataOfflineBundleInputFingerprintV1(
      cloneBundle(base, (b) => {
        b.tripInput.rpmPoints = b.tripInput.rpmPoints.map((p, i) =>
          i === 0 ? { ...p, valueRpm: p.valueRpm + 1 } : p,
        );
      }),
    );
    expect(after).not.toBe(before);
  });

  it('C — changed motion evidence with same event labels yields different fingerprint', () => {
    const before = computeDs4RpmRealDataOfflineBundleInputFingerprintV1(base);
    const after = computeDs4RpmRealDataOfflineBundleInputFingerprintV1(
      cloneBundle(base, (b) => {
        const ev = b.motionPayload.events[0];
        if (ev?.intensity) {
          ev.intensity = { ...ev.intensity, meanAccelMps2: ev.intensity.meanAccelMps2 + 0.5 };
        }
      }),
    );
    expect(after).not.toBe(before);
  });

  it('D — changed V1B admission yields different fingerprint', () => {
    const before = computeDs4RpmRealDataOfflineBundleInputFingerprintV1(base);
    const after = computeDs4RpmRealDataOfflineBundleInputFingerprintV1(
      cloneBundle(base, (b) => {
        if (b.v1bResult) {
          b.v1bResult = {
            ...b.v1bResult,
            admission: {
              ...b.v1bResult.admission,
              processingAllowed: !b.v1bResult.admission.processingAllowed,
            },
          };
        }
      }),
    );
    expect(after).not.toBe(before);
  });

  it('E — changed source family identity yields different fingerprint', () => {
    const before = computeDs4RpmRealDataOfflineBundleInputFingerprintV1(base);
    const after = computeDs4RpmRealDataOfflineBundleInputFingerprintV1(
      cloneBundle(base, (b) => {
        b.dimoVehicleRawJson = R1_DIMO_RAW_JSON;
      }),
    );
    expect(after).not.toBe(before);
    expect(computeDs4RpmRealDataSourceFamilyIdentityDigestV1(SYNTHETIC_DIMO_RAW_JSON)).not.toBe(
      computeDs4RpmRealDataSourceFamilyIdentityDigestV1(R1_DIMO_RAW_JSON),
    );
  });

  it('E2 — different device serial with same R1 prefix yields different identity digest', () => {
    const a = { aftermarketDevice: { serial: 'R1-AAAA-1111' } };
    const b = { aftermarketDevice: { serial: 'R1-AAAA-2222' } };
    expect(computeDs4RpmRealDataSourceFamilyIdentityDigestV1(a)).not.toBe(
      computeDs4RpmRealDataSourceFamilyIdentityDigestV1(b),
    );
  });

  it('D2 — changed V1B temporalCoverage semantics changes bundle fingerprint', () => {
    const before = computeDs4RpmRealDataOfflineBundleInputFingerprintV1(base);
    const after = computeDs4RpmRealDataOfflineBundleInputFingerprintV1(
      cloneBundle(base, (b) => {
        if (b.v1bResult) {
          b.v1bResult = {
            ...b.v1bResult,
            temporalCoverage: {
              ...b.v1bResult.temporalCoverage,
              missingBucketCount: b.v1bResult.temporalCoverage.missingBucketCount + 1,
            },
          };
        }
      }),
    );
    expect(after).not.toBe(before);
  });

  it('F — changed CAN speed evidence yields different fingerprint', () => {
    const before = computeDs4RpmRealDataOfflineBundleInputFingerprintV1(base);
    const after = computeDs4RpmRealDataOfflineBundleInputFingerprintV1(
      cloneBundle(base, (b) => {
        b.canSpeedObservations = [{ recordedAtIso: base.tripInput.tripStartIso, valueKmh: 42 }];
      }),
    );
    expect(after).not.toBe(before);
  });

  it('G — different object key order with identical semantic content yields identical fingerprint', () => {
    const aObj = { z: 1, a: 2, m: { y: 1, b: 2 } };
    const bObj = { a: 2, m: { b: 2, y: 1 }, z: 1 };
    expect(stableStringify(aObj)).toBe(stableStringify(bObj));
    const fpA = computeDs4RpmRealDataOfflineBundleInputFingerprintV1(base);
    const reordered = cloneBundle(base, () => {});
    expect(computeDs4RpmRealDataOfflineBundleInputFingerprintV1(reordered)).toBe(fpA);
  });

  it('fingerprint changes independently of full replay artifact equality axis', () => {
    const fp1 = computeDs4RpmRealDataOfflineBundleInputFingerprintV1(base);
    const mutated = cloneBundle(base, (b) => {
      b.scenarioLabel = 'label-only-change';
    });
    const fp2 = computeDs4RpmRealDataOfflineBundleInputFingerprintV1(mutated);
    expect(fp2).not.toBe(fp1);
  });
});
