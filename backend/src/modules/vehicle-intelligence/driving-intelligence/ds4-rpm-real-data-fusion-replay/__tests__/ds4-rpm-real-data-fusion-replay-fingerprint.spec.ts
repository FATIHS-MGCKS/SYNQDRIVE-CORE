import { buildSyntheticApiBundleValid } from '../../ds4-rpm-real-data-replay/__tests__/ds4-rpm-real-data-replay-fixtures.harness';
import { executeDs4RpmRealDataFusionOfflineReplayV1 } from '../ds4-rpm-real-data-fusion-replay-orchestrator.v1';
import { computeDs4RpmRealDataFusionReplayDeterministicFingerprintV1 } from '../ds4-rpm-real-data-fusion-replay-fingerprint.v1';
import type { Ds4RpmRealDataFusionReplayArtifactV1 } from '../ds4-rpm-real-data-fusion-replay.contract.v1';

const CODE_SHA = 'test-sha-fingerprint-p2d2a-t3-final';
const GENERATED_AT = new Date('2026-11-04T08:00:00.000Z');
const GENERATED_AT_ALT = new Date('2027-06-15T16:30:00.000Z');

function baselineArtifact(): Ds4RpmRealDataFusionReplayArtifactV1 {
  return executeDs4RpmRealDataFusionOfflineReplayV1(buildSyntheticApiBundleValid(GENERATED_AT), {
    codeSha: CODE_SHA,
    generatedAt: GENERATED_AT,
  });
}

describe('ds4-rpm-real-data-fusion-replay content fingerprint v1 (T3 final)', () => {
  it('1: eventLocalDynamics-only mutation changes hash while inputFingerprint unchanged', () => {
    const artifact = baselineArtifact();
    const mutated = structuredClone(artifact) as Ds4RpmRealDataFusionReplayArtifactV1;
    const target = mutated.fusionResult?.events.find((e) => e.eventLocalDynamics != null);
    expect(target).toBeDefined();
    target!.eventLocalDynamics = {
      ...target!.eventLocalDynamics!,
      observedDirectionReversalCount: target!.eventLocalDynamics!.observedDirectionReversalCount + 1,
    };
    expect(mutated.inputFingerprint).toBe(artifact.inputFingerprint);
    const fpBase = computeDs4RpmRealDataFusionReplayDeterministicFingerprintV1(artifact);
    const fpMut = computeDs4RpmRealDataFusionReplayDeterministicFingerprintV1(mutated);
    expect(fpBase).not.toBe(fpMut);
  });

  it('2: event-level alignment sensitivity mutation changes hash', () => {
    const artifact = baselineArtifact();
    const mutated = structuredClone(artifact) as Ds4RpmRealDataFusionReplayArtifactV1;
    const event = mutated.fusionResult!.events[0]!;
    event.dynamicsAlignmentSensitivity = [
      ...event.dynamicsAlignmentSensitivity,
      {
        offsetSeconds: 42,
        admittedPairCountInWindow: 0,
        classification: 'UNAVAILABLE',
        researchDiagnosticOnly: true as const,
      },
    ];
    const fpBase = computeDs4RpmRealDataFusionReplayDeterministicFingerprintV1(artifact);
    const fpMut = computeDs4RpmRealDataFusionReplayDeterministicFingerprintV1(mutated);
    expect(fpBase).not.toBe(fpMut);
  });

  it('3: attestation dimension override changes hash with unchanged bundleId', () => {
    const bundle = buildSyntheticApiBundleValid(GENERATED_AT);
    const a = executeDs4RpmRealDataFusionOfflineReplayV1(bundle, {
      codeSha: CODE_SHA,
      generatedAt: GENERATED_AT,
    });
    const b = executeDs4RpmRealDataFusionOfflineReplayV1(bundle, {
      codeSha: CODE_SHA,
      generatedAt: GENERATED_AT,
      attestationBundleOverrides: { attestationLevel: 'UNPROVEN' },
    });
    expect(a.bundleId).toBe(b.bundleId);
    expect(a.deterministicArtifactFingerprint).not.toBe(b.deterministicArtifactFingerprint);
  });

  it('4: codeSha change changes content hash', () => {
    const bundle = buildSyntheticApiBundleValid(GENERATED_AT);
    const a = executeDs4RpmRealDataFusionOfflineReplayV1(bundle, { codeSha: 'sha-one', generatedAt: GENERATED_AT });
    const b = executeDs4RpmRealDataFusionOfflineReplayV1(bundle, { codeSha: 'sha-two', generatedAt: GENERATED_AT });
    expect(a.deterministicArtifactFingerprint).not.toBe(b.deterministicArtifactFingerprint);
  });

  it('5: identical semantic inputs produce identical hashes', () => {
    const bundle = buildSyntheticApiBundleValid(GENERATED_AT);
    const a = executeDs4RpmRealDataFusionOfflineReplayV1(bundle, { codeSha: CODE_SHA, generatedAt: GENERATED_AT });
    const b = executeDs4RpmRealDataFusionOfflineReplayV1(bundle, { codeSha: CODE_SHA, generatedAt: GENERATED_AT });
    expect(a.deterministicArtifactFingerprint).toBe(b.deterministicArtifactFingerprint);
  });

  it('6: generatedAt-only change does not change content fingerprint', () => {
    const bundle = buildSyntheticApiBundleValid(GENERATED_AT);
    const a = executeDs4RpmRealDataFusionOfflineReplayV1(bundle, {
      codeSha: CODE_SHA,
      generatedAt: GENERATED_AT,
    });
    const b = executeDs4RpmRealDataFusionOfflineReplayV1(bundle, {
      codeSha: CODE_SHA,
      generatedAt: GENERATED_AT_ALT,
    });
    expect(a.generatedAtIso).not.toBe(b.generatedAtIso);
    expect(a.deterministicArtifactFingerprint).toBe(b.deterministicArtifactFingerprint);
  });
});
