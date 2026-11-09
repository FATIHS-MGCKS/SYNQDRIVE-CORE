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

## Frozen scenario matrix (S01–S16)

| ID | Intent |
|----|--------|
| S01 | Valid ICE baseline — binding admits |
| S02–S05 | Identity mismatch (org / vehicle / trip / link) |
| S06–S07 | Fingerprint tamper (v1b / multichannel) |
| S08 | Conflicting duplicate label |
| S09 | Missing RPM/speed/load in controlled window |
| S10 | Insufficient moving opportunity (stationary grid) |
| S11 | B3 sole insufficient load (partial trusted counts) |
| S12 | B4 zero assessable facets |
| S13 | BEV fail-closed |
| S14 | A1 descriptive-only |
| S15 | Offline bundle without attestation |
| S16 | Canonical order invariance |

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
