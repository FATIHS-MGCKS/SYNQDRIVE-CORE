# P2-D2A — Offline real-data fusion replay bridge

**Operation:** `DBI_P2D2A_REAL_DATA_FUSION_REPLAY_BRIDGE`  
**Status:** Research-only orchestrator (`ds4-rpm-real-data-fusion-replay-v1`)  
**Companion:** P2-D1 fusion kernel, PR-B2 real-data replay, PR-B3 source attestation

## Purpose

Deterministic offline orchestration for **injected evidence bundles only**: validate identity/bindings, audit source attestation (non-independent), run shadow replay, optionally run P2-D1 fusion under `SYNTHETIC_FIXTURE` gate, and emit a research replay artifact with explicit outcome labels.

## Reused modules (no parallel engines)

| Step | Module |
|------|--------|
| Bundle validation | `validateDs4RpmRealDataOfflineInputBundleV1` |
| Input fingerprint | `computeDs4RpmRealDataOfflineBundleInputFingerprintV1` |
| Attestation assembly | `buildDs4RpmRealDataSourceAttestationBundleFromOfflineInputV1` |
| Attestation audit | `auditDs4RpmRealDataSourceAttestationV1` |
| Shadow replay | `executeDs4RpmRealDataOfflineReplayTripV1` |
| Fusion | `executeDs4RpmDynamicsFusionHarness` (`SYNTHETIC_FIXTURE` only on this path) |
| Pilot readiness | `buildDs4RpmRealDataReferenceCohortReadinessMatrixV1` |

## Outcome labels (orthogonal)

- `RESEARCH_REPLAY_EXECUTED` — shadow replay artifact present
- `SOURCE_NOT_ATTESTED` — correlation not independently proven (injected fixtures always include this until owner-authorized read attestation)
- `TEMPORAL_ALIGNMENT_UNVERIFIED` — label-time hypothesis; timestamp phase and support width remain unknown
- `FUSION_NOT_AUTHORIZED` — R1, bundle binding, REAL_OBSERVATION policy, or fusion kernel block

Declared attestation bundles are **not** treated as independent field proof.

## Evidence trust closeout (P2401)

| Task | Semantics |
|------|-----------|
| T1 | `syntheticFusionStatus` / `researchReplayStatus` separate from `realObservationStatus.authorizationStatus` (`realObservationFusionAuthorized` always `false` on this bridge) |
| T2 | Motion: `offlineBundleIdentityBinding` vs `persistedMotionRunAttestation: UNVERIFIED_INJECTED` — no fabricated DS4 run authority |
| T3 | Content fingerprint hashes full scientific payloads: A2 `dynamicsTripResult`, fusion events (local dynamics, alignment sensitivity), shadow event metrics, attestation dimensions, motion provenance, `codeSha`; excludes self fingerprint + `generatedAtIso` + shadow `provenance.generatedAtIso` |
| T4 | `eventLocalCadenceAssessed` defaults false; caller cannot assert PROVEN cadence on injected bundles |

## REAL_OBSERVATION policy

`fusionEvidencePolicy: REAL_OBSERVATION_REQUESTED` returns `FUSION_NOT_AUTHORIZED` without re-labeling bundle evidence as synthetic. Fusion on this bridge uses `OFFLINE_INJECTED_SYNTHETIC_GATE` only.

## R1 containment

`RUPTELA_R1` and uncertain historical OBD record time: fusion not invoked; R1 reason codes surfaced on artifact `r1Containment`.

## First real pilot (Audi A4 / VW Arteon) — minimum evidence

See PR-B3 readiness matrix (`buildDs4RpmRealDataReferenceCohortReadinessMatrixV1`):

1. Owner authorization record (org, vehicle, trip allowlist, link, bounded ISO window, row budget)
2. Read-only DIMO `rawJson` digest for scoped vehicle (family resolution)
3. Trip + `providerSourceLinkId` binding verification
4. Read-only ClickHouse HF RPM/speed 1s AVG for authorized window (no interpolation)
5. Persisted V1B shadow + motion-core shadow run ids for same trip binding
6. Offline attestation bundle + audit — `correlationEligible` only when all dimensions PROVEN under authorized read
7. Exclude R1-attested trips from any RPM point-time fusion path

**No production access in P2-D2A.** Owner deploy authorization is out of scope.

## Non-goals

- No merge to schedulers, no scoring, no DB writes, no provider calls
- No claim of real-world validation from synthetic fixtures

## Validation

```bash
cd backend && npx jest ds4-rpm-real-data-fusion-replay
```
