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

## Determinism and bounds

- Pure function: no clock, randomness, network, or persistence.
- Stable sorts for participants, candidates, pairwise decisions, diagnostics.
- Candidate ties: `sourceEpisodeKey` → canonical payload → `sourceCandidateIndex`.
- Budget options validated (finite safe integers, hard caps) **before** deep cloning or pairwise traversal.
- Footprint check uses array lengths and theoretical pair count prior to isolation.
- Default budgets: 6 participants, 4096 candidate pairs; hard caps 32 / 65536 — fail-closed `BUDGET_*_EXCEEDED`.
- `resultDigest`: canonical JSON summary (identity details, rationale codes, candidate payload fingerprints); **not** cryptographic attestation.

## Bundle validation

Fail-closed on adapter contract version mismatch, non-`researchOnly` participants, candidate/parent module mismatch, and A1 descriptive guard violations.

## Non-goals

No Nest module, API, worker, Prisma, ClickHouse, DIMO, scoring, DS4 motion fusion, or production detector integrations.

## Tests

Adversarial matrix `01–22` in `dbi-p2c3-reconciliation.adversarial.spec.ts` using P2-C1.5 scenarios → kernels → P2-C2 adapters → P2-C3 engine. Runtime import boundary excludes P2-C1.5 fixture package (tests only).
