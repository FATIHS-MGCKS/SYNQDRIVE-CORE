# DBI P2-C1.5 — Binding envelope fixture library (research-only)

**Status:** Preflight test infrastructure for P2-C2 evidence adapters and P2-C3 reconciliation tests.  
**Not in scope:** Adapters, relationship edges, reconciliation engine, production readers, persistence.

## Code location

```
backend/src/modules/vehicle-intelligence/driving-intelligence/dbi-p2c15-binding-envelope-fixtures/
```

Executable code is **test infrastructure only** (`__tests__` consumers + scenario builders). No Nest module registration.

## Reused constructors (no competing RPM grid)

| Source | Role |
|--------|------|
| `ds4-rpm-hf-v1b/__tests__/ds4-rpm-hf-v1b-tier-fixtures.ts` | Tier trip input, RPM points |
| `ds4-rpm-episode-research/__tests__/ds4-rpm-episode-research.test-helpers.ts` | A1 bound research input |
| `ds4-powertrain-demand-research/__tests__/ds4-powertrain-demand-research.test-helpers.ts` | B1–B4 multichannel bound inputs |
| `ds4-powertrain-demand-binding-shared.v1.ts` | Multichannel fingerprint + canonicalization |
| `ds4-rpm-hf-v1b-input-fingerprint.ts` | V1B tier-aware fingerprint |

Fingerprints are **derived** from fixture data via existing functions. Tamper scenarios (S06/S07) intentionally break claimed fingerprints without recomputation.

## Synthetic identity envelope

Each scenario exposes `DbiP2c15SyntheticIdentityEnvelopeV1`:

- `organizationId`, `vehicleId`, `tripId`, `providerSourceLinkId`
- `evidenceOrigin`, `sourceBundleId`, `telemetrySourceFamily`
- `v1bInputFingerprint`, `multichannelFingerprint` (null for A1-only scenarios)
- `sourceProvenanceVerified: false` (mandatory)

## Scenario package shape (P2-C1.5 closeout)

`buildDbiP2c15ScenarioPackage(id)` returns:

- `envelope` — synthetic identity + derived fingerprints
- `payload` — discriminated union:
  - `POWERTRAIN_INPUT` — shared kickdown binding validator input (B1 path)
  - `MODULE_B2_INPUT` — `Ds4PowertrainDemandColdEngineResearchInputV1`
  - `MODULE_B3_INPUT` — `Ds4SustainedLoadResearchInputV1` (+ optional subVariant)
  - `MODULE_B4_INPUT` — `Ds4RevvingIdleResearchInputV1`
  - `A1_INPUT` — RPM episode research input
  - `CANONICAL_ORDER_PAIR` — forward/reversed inputs + raw observation grids
- `expectation` — **pinned** in `dbi-p2c15-binding-envelope.expectations.v1.ts` (frozen + per-package `structuredClone`; not derived from validator at build time)
- `scientificNotes`

Inputs are `structuredClone` copies — independent factory calls do not share mutable state.

## Frozen scenario matrix (S01–S16 + S13 subvariants)

| ID | Intent |
|----|--------|
| S01 | Valid ICE baseline — binding admits |
| S02–S05 | Identity mismatch (org / vehicle / trip / link) |
| S06–S07 | Fingerprint tamper (v1b / multichannel) |
| S08 | Conflicting duplicate label |
| S09 | Missing RPM/speed/load in controlled window (B2 kernel) |
| S10 | Insufficient moving opportunity (stationary grid) |
| S11 | B3 sole insufficient load (partial trusted counts) |
| S12 | B4 zero assessable facets |
| S13_POWERTRAIN_BEV_FAIL_CLOSED | ELECTRIC + `isEvPowertrain` — bind-layer fail |
| S13_POWERTRAIN_UNKNOWN_FAIL_CLOSED | `fuelType=null` — B3 `ICE_OPERATION_NOT_CONFIRMED` |
| S13_POWERTRAIN_CONTRADICTORY_FAIL_CLOSED | GASOLINE + `isEvPowertrain` — bind-layer fail |
| S14 | A1 descriptive-only |
| S15 | Offline bundle without attestation |
| S16 | Canonical order invariance (bucket + fingerprint + B1 status) |

## Import boundary

- Forward: fixture sources must not import production misuse/detector paths (existing spec).
- Reverse: no non-test runtime module under `driving-intelligence/` may import `dbi-p2c15-binding-envelope-fixtures` (dedicated spec).

## Trust invariants (mandatory)

A. `evidenceOrigin` remains `SYNTHETIC_FIXTURE` or negative `OFFLINE_SEALED_BUNDLE` tests.  
B. `sourceProvenanceVerified` never true in fixtures.  
C. Offline scenarios cannot bypass manifest/attestation rules.  
D. Matching timestamps ≠ physical synchronization.  
E. Matching fingerprint ≠ A1 event alignment authority.  
F. Identity mismatch ≠ ordinary non-overlap.  
G. No silent ABSTAINED / NOT_ASSESSABLE → positive promotion.  
H. No invented RPM/speed channels to satisfy admission floors.

## A1 authority

S14 reinforces P2-C glossary: A1 uses V1A/V1B + RPM reference only; `labelsNotForCrossDomainJoin` remains true; no multichannel binding family.

## P2-C2 / P2-C3 usage (future)

Import `buildDbiP2c15ScenarioPackage(scenarioId)` in adapter/reconciliation tests only. Do not import fixture package from production runtime modules.

## References

- P2-C consumer glossary: `DBI_P2C_CROSS_KERNEL_CONSUMER_GLOSSARY.md`
- Change ledger: `CHANGE_LEDGER.md`
