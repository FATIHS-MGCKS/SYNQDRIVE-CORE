# DBI P2-C2 — Offline evidence adapters (research-only)

**Status:** DRAFT — reconciliation engine (P2-C3) not included.  
**Contract version:** `dbi-p2c2-evidence-adapter-v1`  
**Code:** `backend/src/modules/vehicle-intelligence/driving-intelligence/dbi-p2c2-offline-evidence-adapters/`

## Purpose

Read-only, type-safe projections of already-computed P2-A1 / P2-B1–B4 kernel results into two separate evidence planes for offline P2-C reconciliation prep:

| Plane | Admit modules | Semantics |
|-------|---------------|-----------|
| `DESCRIPTIVE_RPM_EPISODES` | P2-A1 only | High-RPM episode inventory; **not** powertrain proxy evidence |
| `POWERTRAIN_PROXY_CANDIDATES` | P2-B1–B4 | Preserved proxy candidates with module-specific assessability / classification |

## Non-goals (this PR)

- No Nest registration, API, workers, DB/ClickHouse/DIMO I/O
- No reconciliation, scoring, overlap, or cross-domain join
- No kernel or contract mutation
- No source attestation claims (`sourceProvenanceVerified` carried as reported; A1 uses `NOT_REPORTED` for powertrain-style provenance fields)

## Common participant contract

Each adapter emits a versioned participant header preserving: bindings, fingerprints (as source-reported), original status/abstain reasons, provenance projection, unsupported claims, limitation codes, and `adapterClaimsPositiveEvidence` (false under `ABSTAINED` or B4 dual `NOT_ASSESSABLE`).

**A1:** `multichannelFingerprint` and provenance tri-state = `NOT_REPORTED` (distinct from explicit `false`).  
**Semantic guards:** `notEvidenceCandidate` and `labelsNotForCrossDomainJoin` mandatory; violation → fail-closed adapter diagnostic.

## Adapter-local references (A1)

`dbi-p2c2:a1-descriptive/seq=<sequenceIndex>` — not an original source `episodeKey`.

## Status semantics

- `COMPUTED` ≠ assessable / positive proxy
- `NOT_OBSERVED` ≠ confirmed absence
- `ABSTAINED` ≠ tampering; never sets `adapterClaimsPositiveEvidence`

## Tests

- Reuses merged P2-C1.5 `buildDbiP2c15ScenarioPackage` (test imports only)
- Scenarios S01, S09, S11, S12, S14, S16, S13-B3, adversarial invalid labels / A1 guard violation

## Import boundary

P2-C2 runtime `.ts` (non-test) must not import `dbi-p2c15-binding-envelope-fixtures`. Enforced by dedicated spec mirroring P2-C1.5 reverse-import guard.
