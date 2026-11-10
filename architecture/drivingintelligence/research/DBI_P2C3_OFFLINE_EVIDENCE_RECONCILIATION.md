# DBI P2-C3 — Offline evidence reconciliation (research-only)

**Status:** DRAFT — no runtime wiring.  
**Contract version:** `dbi-p2c3-reconciliation-v1`  
**Code:** `backend/src/modules/vehicle-intelligence/driving-intelligence/dbi-p2c3-offline-evidence-reconciliation/`

## Purpose

Deterministic, pure offline reconciliation over `DbiP2c2OfflineEvidenceBundleV1` outputs. Consumes P2-C2 adapter projections only; does not re-run P2-A1 / P2-B1–B4 kernels or mutate adapter semantics.

## Identity admission (B1–B4)

Compares `organizationId`, `vehicleId`, `tripId`, `providerSourceLinkId`, `v1bInputFingerprint`, `multichannelFingerprint`, and `sourceBundleId` across proxy participants.

**Required core bindings** must be non-empty strings for every proxy participant. **Required proxy fingerprints** are `v1bInputFingerprint` and `multichannelFingerprint` (both must be reported for `ADMITTED`). `sourceBundleId` is optional and may be consistently absent.

| Verdict | Meaning |
|---------|---------|
| `ADMITTED` | No contradictions; optional fields either consistently reported or consistently absent across participants |
| `REJECTED` | Known contradictory reported values |
| `INCONCLUSIVE` | Mixed reported vs unreported optional bindings, or no proxy participants |

Rules:

- Missing / `NOT_REPORTED` values are **not** treated as equal.
- Matching fingerprints are **not** promoted to source attestation.
- A1 descriptive participant: org/vehicle/trip coherence checked when present; multichannel fingerprint not required.

## A1 descriptive authority

- Preserved as `descriptiveOnly` participant reference.
- **Never** admitted into candidate inventory or pairwise relationship edges.

## Candidate inventory

- Full multiplicity preserved (no dedupe, suppression, or reclassification).
- Namespaced `dbi-p2c3:cand/{module}/{planeIndex}/{candidateIndex}` references.
- Same `sourceEpisodeKey` with different payload → unresolved `EPISODE_KEY_COLLISION` (not proof of one event).

## Relationship reconciliation gate

Pairwise relationship reconciliation runs **only** when identity verdict is `ADMITTED`.  
`REJECTED` and `INCONCLUSIVE` skip relationship output (`relationshipReconciliation.performed = false`) while preserving participant references, inventory, and identity diagnostics.

## Pairwise relationship decisions (V1)

Supported decision codes:

`SAME_SOURCE_DUPLICATE`, `INSUFFICIENT_ALIGNMENT_EVIDENCE`, `POTENTIAL_SEMANTIC_CONFLICT`, `POSSIBLE_LABEL_INTERVAL_OVERLAP`, `COMPATIBLE_CO_OBSERVATION`, `UNRELATED`

**V1 authorized positive edges:** `SAME_SOURCE_DUPLICATE` only (same module, identical full envelope payload).

| Decision | V1 emission rule |
|----------|------------------|
| `SAME_SOURCE_DUPLICATE` | Same module + byte-identical canonical envelope payload |
| `INSUFFICIENT_ALIGNMENT_EVIDENCE` | Default for cross-module, interval-only overlap, episode-key collisions, and same-module non-duplicate pairs |
| `POSSIBLE_LABEL_INTERVAL_OVERLAP` / `COMPATIBLE_CO_OBSERVATION` | Not emitted without shared traceable label contract (unavailable in current P2-C2 boundaries) |
| `POTENTIAL_SEMANTIC_CONFLICT` | Not inferred from classification differences alone |
| `UNRELATED` | Not used as a missing-evidence fallback |

No `overlapLabelCount` synthesis. No timestamp-only cross-module edges.

## Scientific status safety

Original kernel statuses and module assessability summaries are carried forward without invention. No negative inference from abstain states.

`moduleAssessabilitySummary` retains cross-cutting fields (`originalKernelStatus`, `originalAbstainReasons`, `adapterClaimsPositiveEvidence`, `descriptiveOnly`) and adds a discriminated `moduleProjection` (read-only, no recomputation):

| Kind | Module-specific projection |
|------|----------------------------|
| `A1_DESCRIPTIVE` | `highEpisodesStatus`, `normalizedEpisodesEligible`, descriptive-only authority guards |
| `B1_PROXY` | `moduleCoverage` (movement-local coverage; no fabricated assessability) |
| `B2_PROXY` | all three `subtypeAssessability` statuses + reason codes; ECT coverage scope |
| `B3_PROXY` | `tripEvidenceClassification`, partial trusted load coverage, original abstain semantics |
| `B4_PROXY` | facet A/B assessability, both `tripEvidenceClassifications`, relevant facet reason codes |

`NOT_ASSESSABLE`, `NOT_OBSERVED`, and `ABSTAINED` remain distinct outcomes; no scoring or positive promotion from projections.

## Determinism and bounds

- Pure function: no clock, randomness, network, or persistence.
- Stable sorts for participants, candidates, pairwise decisions, diagnostics.
- Candidate ties: `sourceEpisodeKey` → canonical payload → `sourceCandidateIndex`.
- Canonical candidate identity uses recursive JSON canonicalization (`canonicalJsonStringify`): lexically sorted object keys, stable array order, deterministic primitives, explicit unsupported-value sentinel (no property-insertion-order dependence).
- Input isolated via `tryDeepIsolate` **before** shape/structure/integrity validation (TOCTOU-safe single snapshot).
- Budget options validated (finite safe integers, hard caps) before pairwise traversal.
- Footprint check uses array lengths and theoretical pair count prior to isolation.
- Default budgets: 6 participants, 4096 candidate pairs; hard caps 32 / 65536 — fail-closed `BUDGET_*_EXCEEDED`.
- `resultDigest`: canonical JSON summary (identity, rationale codes, candidate payload fingerprints, module assessability including abstain reasons / adapterClaims / projections, provenance limitations); **not** cryptographic attestation.

## Temporal ingress integrity (P2-C4 W3B, W3-047)

After bundle shape validation and **before** bundle participant structure checks, participant integrity, identity, inventory, pairwise work, or digest, P2-C3 re-applies P2-C2 temporal semantics on the isolated snapshot (`dbi-p2c2-evidence-adapter.temporal.v1.ts` → `collectTemporalViolations`):

- Field families are selected by **`sourceModule` / A1 episode contract only** (cross-module label keys cannot satisfy another module).
- Required bucket indices: A1 `startIdx`/`endIdx`; B1/B2 `startBucketIndex`/`endBucketIndex` (non-negative integers). Malformed indices → `INVALID_TEMPORAL_BUCKET_INDEX_SHAPE`.

- **A1** descriptive episodes: `providerBucketLabelStartIso` / `providerBucketLabelEndIso`; **required** `startIdx` / `endIdx` (non-negative integers).
- **B1 / B2** candidates: `providerBucketLabelStartIso` / `providerBucketLabelEndIso`; **required** `startBucketIndex` / `endBucketIndex` (non-negative integers).
- **B3 / B4** candidates: `startProviderBucketLabelIso` / `endProviderBucketLabelIso`; index fields **not required**.

Diagnostics: `INVALID_PROVIDER_BUCKET_LABEL`, `INVALID_TEMPORAL_INTERVAL_ORDER`, `INVALID_BUCKET_INDEX_ORDER`, `INVALID_TEMPORAL_BUCKET_INDEX_SHAPE` — sorted, deduplicated, fail-closed (`ok: false`; no inventory, edges, or digest). Malformed nested extraction does not throw.

Canonical timestamp format does not assert physical event time or provider attestation (`BUCKET_LABEL_UNVERIFIED`, research-only `MODE_A` unchanged). No A1↔B multichannel index join (W3-048 deferred).

## Forged-bundle participant integrity (P2-C4 W2)

After temporal ingress passes, P2-C3 re-validates adapted participant headers against candidate inventories:

- `ABSTAINED` / `NOT_OBSERVED` + positive proxy classification → fail-closed (`PARTICIPANT_CONTRADICTORY_POSITIVE_*`).
- `adapterClaimsPositiveEvidence` must agree with recomputed adapter gate (classifications + trip status + B4 dual-`NOT_ASSESSABLE` block).
- B2 subtype assessability, B3 `tripEvidenceClassification`, B4 facet assessability/classification constraints mirror P2-C2 consistency (no kernel re-run).
- A1 descriptive inventory vs `highEpisodesStatus` / episode plane multiplicity.
- A1 `providerSourceLinkId` and reported `v1bInputFingerprint` cross-checked against proxy participants when A1 reports them.
- Duplicate proxy participant planes with identical canonical identity → `DUPLICATE_PARTICIPANT_PLANE_IDENTITY` (declared binding fields only; extra identity keys → `PARTICIPANT_IDENTITY_EXTRA_FIELD`).
- Any candidate inventory under `ABSTAINED` kernel status → `CANDIDATE_INVENTORY_UNDER_ABSTAINED_KERNEL`.
- Module-specific candidate classification enum + B2 `proxyKind` parity; positive-only `SAME_SOURCE_DUPLICATE` pairwise edges.
- Runtime enums: A1 high-episode status, B3 trip class, B4 facet trip classes → `PARTICIPANT_ENUM_VALUE_INVALID`.
- Malformed bundle roots / non-cloneable input → stable diagnostics (`BUNDLE_INPUT_ISOLATION_FAILED`, `BUNDLE_INPUT_SHAPE_INVALID`, `CANDIDATE_PAYLOAD_CANONICAL_INVALID`; no uncaught `TypeError`).

Failure returns `ok: false`, sorted diagnostic codes only — **no** inventory, identity admission, pairwise edges, or digest.

## Bundle validation

Fail-closed on adapter contract version mismatch, non-`researchOnly` participants, candidate/parent module mismatch, A1 descriptive guard violations, and runtime module-plane coherence:

- Powertrain proxy participants must be `P2-B1`–`P2-B4` only (`PROXY_PLANE_INVALID_SOURCE_MODULE` otherwise).
- `P2-A1` in a powertrain proxy plane → `A1_IN_POWERTRAIN_PROXY_PLANE`.
- Candidate envelopes must be coherent with their parent participant module (`CANDIDATE_ENVELOPE_INCOHERENT` / `CANDIDATE_SOURCE_MODULE_MISMATCH`).
- Module-specific envelope checks: episode key + classification alignment; B1 support tier; B2 `proxyKind`; B4 facet shape vs candidate classification family.
- Candidate identity canonicalization is fail-closed (`CANDIDATE_PAYLOAD_CANONICAL_INVALID`) — no silent `undefined`→`null`, non-finite numbers, bigint, or exotic objects.

## Non-goals

No Nest module, API, worker, Prisma, ClickHouse, DIMO, scoring, DS4 motion fusion, or production detector integrations.

## Tests

Adversarial matrix `01–22` in `dbi-p2c3-reconciliation.adversarial.spec.ts` using P2-C1.5 scenarios → kernels → P2-C2 adapters → P2-C3 engine. Integrity closeout and `canonical-closeout` specs cover identity/budget gates, canonical JSON duplicates, module validation, assessability mirroring, and digest fidelity. Opus re-audit replay `w2-opus-remediation.spec.ts` (AUD-01..40). Runtime import boundary excludes P2-C1.5 fixture package (tests only).
